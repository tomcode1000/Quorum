import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import type { Question, WorkerRecord } from '@quorum/core'
import { Router } from '../src/router.js'
import { Store } from '../src/store.js'
import { FakePaymaster } from './fake-paymaster.js'

/**
 * End-to-end tests of the router.
 *
 * These cover the behaviour that is expensive to get wrong and invisible when it is:
 * that a worker is paid before the caller is answered, that a caller who did not get
 * an answer is refunded, that a worker on a `no_consensus` question is paid anyway,
 * and that a question which could not be resolved never comes back looking resolved.
 */

const WORKER_ADDRESS = '0x1111111111111111111111111111111111111111' as const

function proven(workerId: string, agreements = 200): WorkerRecord {
  return { workerId, byKind: { disambiguate: { agreements, disagreements: 0, unresolved: 0 } } }
}

function question(over: Partial<Question> = {}): Question {
  return {
    id: `q_${Math.random().toString(36).slice(2, 10)}`,
    kind: 'disambiguate',
    prompt: 'Does this receipt total say 45.00 or 4.50? Look at the printed line, not the handwriting.',
    schema: { kind: 'choice', options: ['45.00', '4.50'] },
    priceCents: 250,
    timeoutMs: 6_000,
    ...over,
  }
}

type Harness = {
  store: Store
  router: Router
  paymaster: FakePaymaster
  addWorker(workerId: string, record?: WorkerRecord): void
  /** Answers on behalf of a worker as soon as they are offered anything. */
  autoAnswer(workerId: string, value: boolean | number | string, options?: { selfConfidence?: number; delayMs?: number }): void
  stop(): void
}

function harness(options: { random?: () => number } = {}): Harness {
  const store = new Store()
  const paymaster = new FakePaymaster()
  const router = new Router({
    store,
    paymaster,
    // Exploration off by default so the tests are deterministic; there is a
    // dedicated test for it below.
    random: options.random ?? (() => 1),
    assignmentTtlMs: 3_000,
  })
  const loops: AbortController[] = []

  return {
    store,
    router,
    paymaster,
    addWorker(workerId, record) {
      const worker = store.upsertWorker(workerId, WORKER_ADDRESS)
      if (record) worker.record = record
      // Every question in these tests is a disambiguation, so that is the skill passed.
      worker.skills.disambiguate = 'passed'
    },
    autoAnswer(workerId, value, { selfConfidence = 1, delayMs = 10 } = {}) {
      const controller = new AbortController()
      loops.push(controller)
      void (async () => {
        while (!controller.signal.aborted) {
          const assignment = await router.takeAssignment(workerId, 500)
          if (controller.signal.aborted) return
          if (!assignment) continue
          // A real worker takes a moment to read. The latency matters: answering
          // faster than the question can be read is what the abuse signals watch.
          await new Promise((r) => setTimeout(r, delayMs))
          router.submitAnswer({ assignmentId: assignment.assignmentId, workerId, value, selfConfidence })
        }
      })()
    },
    stop() {
      for (const controller of loops) controller.abort()
    },
  }
}

const harnesses: Harness[] = []
function makeHarness(options?: { random?: () => number }): Harness {
  const h = harness(options)
  harnesses.push(h)
  return h
}
after(() => {
  for (const h of harnesses) h.stop()
})

describe('resolving a question', () => {
  it('resolves on one answer from a proven worker and pays them', async () => {
    const h = makeHarness()
    h.addWorker('w1', proven('w1'))
    h.autoAnswer('w1', '45.00')

    const resolution = await h.router.resolve(question({ priceCents: 100 }))

    assert.equal(resolution.status, 'resolved')
    assert.equal(resolution.value, '45.00')
    assert.equal(resolution.responders, 1, 'a proven worker should not need a second opinion at this price')
    assert.equal(resolution.agreement, 'unanimous')
    assert.equal(h.paymaster.wages.length, 1)
    assert.equal(h.paymaster.wages[0]?.amountCents, 20)
    assert.equal(h.paymaster.refunds.length, 0)
  })

  it('carries the question id in the wage memo, so the receipt is the work record', async () => {
    const h = makeHarness()
    h.addWorker('w1', proven('w1'))
    h.autoAnswer('w1', '45.00')

    const q = question({ priceCents: 100 })
    await h.router.resolve(q)

    assert.ok(h.paymaster.wages[0]?.memo.includes(q.id.slice(0, 8)), 'the memo must tie the payment to the question')
  })

  it('keeps buying answers while the workers on hand are unproven, and pays each', async () => {
    const h = makeHarness()
    // Nobody here has a record, so no single answer clears the bar and agreement has
    // to do the work instead. Two agreeing unproven workers are not quite enough at
    // this price; three are.
    h.addWorker('novice_a')
    h.addWorker('novice_b')
    h.addWorker('novice_c')
    h.autoAnswer('novice_a', '45.00')
    h.autoAnswer('novice_b', '45.00')
    h.autoAnswer('novice_c', '45.00')

    const resolution = await h.router.resolve(question({ priceCents: 100, timeoutMs: 8_000 }))

    assert.equal(resolution.status, 'resolved')
    assert.equal(resolution.responders, 3)
    assert.equal(h.paymaster.wages.length, 3)
  })

  it('prefers the proven worker, so an unproven one does not cost the caller a second answer', async () => {
    const h = makeHarness()
    h.addWorker('novice')
    h.addWorker('w2', proven('w2'))
    h.autoAnswer('novice', '45.00')
    h.autoAnswer('w2', '45.00')

    const resolution = await h.router.resolve(question({ priceCents: 100 }))

    assert.equal(resolution.responders, 1)
    assert.equal(resolution.evidence[0]?.workerId, 'w2')
  })

  it('buys a third answer when two disagree and resolves on the tiebreak', async () => {
    const h = makeHarness()
    h.addWorker('a', proven('a', 60))
    h.addWorker('b', proven('b', 60))
    h.addWorker('c', proven('c', 60))
    h.autoAnswer('a', '45.00')
    h.autoAnswer('b', '4.50')
    h.autoAnswer('c', '45.00')

    // At fifty cents the caller is buying near-certainty, which one worker cannot
    // supply alone however good their record, so the disagreement actually surfaces.
    const resolution = await h.router.resolve(question({ priceCents: 500, timeoutMs: 8_000 }))

    assert.equal(resolution.responders, 3, `expected a tiebreak, got ${resolution.responders} answers`)
    assert.equal(h.paymaster.wages.length, 3, 'the dissenter is paid too')
  })

  it('reports the evidence, including the worker who disagreed', async () => {
    const h = makeHarness()
    h.addWorker('a', proven('a', 60))
    h.addWorker('b', proven('b', 60))
    h.addWorker('c', proven('c', 60))
    h.autoAnswer('a', '45.00')
    h.autoAnswer('b', '4.50')
    h.autoAnswer('c', '45.00')

    const resolution = await h.router.resolve(question({ priceCents: 500, timeoutMs: 8_000 }))

    assert.equal(resolution.evidence.length, 3)
    assert.ok(resolution.evidence.some((e) => e.value === '4.50'), 'a caller should see that somebody disagreed')
    assert.ok(resolution.evidence.every((e) => e.reputation > 0))
  })
})

describe('failing honestly', () => {
  it('times out with no answer, refunds the caller, and returns no value', async () => {
    const h = makeHarness()
    h.addWorker('silent', proven('silent'))
    // No autoAnswer: the worker is online and never answers.

    const resolution = await h.router.resolve(question({ timeoutMs: 5_000 }), { payer: WORKER_ADDRESS })

    assert.equal(resolution.status, 'timeout')
    assert.equal(resolution.value, null, 'a question that did not resolve must not return a value')
    assert.equal(resolution.refund?.amountCents, 250)
    assert.equal(h.paymaster.refunds.length, 1)
    assert.equal(h.paymaster.wages.length, 0)
  })

  it('pays every worker on a no_consensus question and still refunds the caller', async () => {
    const h = makeHarness()
    // Two equally-rated workers who will not budge, and nobody else to break the tie.
    h.addWorker('a', proven('a', 60))
    h.addWorker('b', proven('b', 60))
    h.autoAnswer('a', '45.00')
    h.autoAnswer('b', '4.50')

    const resolution = await h.router.resolve(question({ priceCents: 500, timeoutMs: 5_000 }), { payer: WORKER_ADDRESS })

    assert.equal(resolution.status, 'no_consensus')
    assert.equal(resolution.value, null)
    assert.equal(resolution.agreement, 'split')
    assert.equal(h.paymaster.wages.length, 2, 'both workers did the work and must be paid')
    assert.equal(h.paymaster.refunds.length, 1, 'the caller did not get an answer and must be refunded')
    assert.equal(resolution.refund?.amountCents, 500, 'the refund is the full price, not the price minus wages')
    assert.equal(resolution.wagesCents, 40)
  })

  it('does not hold an unresolved question against the workers who answered it', async () => {
    const h = makeHarness()
    h.addWorker('a', proven('a', 60))
    h.addWorker('b', proven('b', 60))
    h.autoAnswer('a', '45.00')
    h.autoAnswer('b', '4.50')

    await h.router.resolve(question({ priceCents: 500, timeoutMs: 5_000 }), { payer: WORKER_ADDRESS })

    const record = h.store.workers.get('b')?.record.byKind.disambiguate
    assert.equal(record?.disagreements, 0, 'penalising the dissenter teaches the pool to guess the popular answer')
    assert.equal(record?.unresolved, 1)
  })

  it('refuses when nobody is online rather than waiting out the deadline', async () => {
    const h = makeHarness()
    const resolution = await h.router.resolve(question({ timeoutMs: 5_000 }), { payer: WORKER_ADDRESS })

    assert.equal(resolution.status, 'refused')
    assert.equal(h.paymaster.refunds.length, 1)
  })

  it('still answers the caller when a wage payment fails', async () => {
    // A blocked transfer is a real possibility on this chain. It must not cost the
    // caller the answer they already paid for, and it must be logged loudly.
    const h = makeHarness()
    h.paymaster.failWagesFor.add('w1')
    h.addWorker('w1', proven('w1'))
    h.autoAnswer('w1', '45.00')

    const resolution = await h.router.resolve(question({ priceCents: 100 }))

    assert.equal(resolution.status, 'resolved')
    assert.equal(resolution.value, '45.00')
    assert.equal(resolution.receipts.length, 0, 'no receipt, because no wage landed')
    assert.equal(resolution.wagesCents, 0)
  })
})

describe('reputation and abuse signals', () => {
  it('credits a worker whose answer was resolved', async () => {
    const h = makeHarness()
    h.addWorker('w1', proven('w1'))
    h.autoAnswer('w1', '45.00')

    await h.router.resolve(question({ priceCents: 100 }))

    assert.equal(h.store.workers.get('w1')?.record.byKind.disambiguate?.agreements, 201)
  })

  it('flags an answer that arrived faster than the question could be read', async () => {
    const h = makeHarness()
    h.addWorker('fast', proven('fast'))
    // Answering a fifteen-word question in a millisecond is not reading it.
    h.autoAnswer('fast', '45.00', { delayMs: 0 })

    await h.router.resolve(question({ priceCents: 100 }))

    assert.equal(h.store.workers.get('fast')?.tooFastCount, 1)
    // One fast answer is not an accusation, and does not withhold the wage.
    assert.equal(h.paymaster.wages.length, 1)
    assert.equal(h.router.suspicion('fast'), 0, 'suspicion needs a distribution, not one data point')
  })

  it('hands a reconnecting worker the same assignment back', async () => {
    const h = makeHarness()
    h.addWorker('w1', proven('w1'))

    const resolving = h.router.resolve(question({ timeoutMs: 5_000 }), { payer: WORKER_ADDRESS })
    const first = await h.router.takeAssignment('w1', 1_000)
    assert.ok(first)
    const again = await h.router.takeAssignment('w1', 1_000)
    assert.equal(again?.assignmentId, first?.assignmentId, 'a dropped connection must not lose the work')

    h.router.submitAnswer({ assignmentId: first.assignmentId, workerId: 'w1', value: '45.00', selfConfidence: 1 })
    await resolving
  })

  it('rejects an answer to somebody else’s assignment', async () => {
    const h = makeHarness()
    h.addWorker('w1', proven('w1'))
    h.addWorker('w2', proven('w2'))

    const resolving = h.router.resolve(question({ timeoutMs: 5_000 }), { payer: WORKER_ADDRESS })
    const assignment = await h.router.takeAssignment('w1', 1_000)
    assert.ok(assignment)

    const stolen = h.router.submitAnswer({ assignmentId: assignment.assignmentId, workerId: 'w2', value: '45.00', selfConfidence: 1 })
    assert.equal(stolen.accepted, false)

    h.router.submitAnswer({ assignmentId: assignment.assignmentId, workerId: 'w1', value: '45.00', selfConfidence: 1 })
    await resolving
  })

  it('rejects an answer that does not fit the question', async () => {
    const h = makeHarness()
    h.addWorker('w1', proven('w1'))

    const resolving = h.router.resolve(question({ timeoutMs: 5_000 }), { payer: WORKER_ADDRESS })
    const assignment = await h.router.takeAssignment('w1', 1_000)
    assert.ok(assignment)

    const bad = h.router.submitAnswer({ assignmentId: assignment.assignmentId, workerId: 'w1', value: 'something else', selfConfidence: 1 })
    assert.equal(bad.accepted, false)
    assert.match(bad.reason ?? '', /does not fit/)

    h.router.submitAnswer({ assignmentId: assignment.assignmentId, workerId: 'w1', value: '45.00', selfConfidence: 1 })
    await resolving
  })
})

describe('known-answer seeding', () => {
  it('grades a golden answer against the truth without charging it to the caller', async () => {
    // Force every assignment to be golden, and force selection to be deterministic.
    const h = makeHarness({ random: () => 0 })
    h.store.golden.push({
      id: 'g1',
      kind: 'disambiguate',
      prompt: 'The line reads TOTAL 128.40. Is the total 128.40 or 12.84?',
      schema: { kind: 'choice', options: ['128.40', '12.84'] },
      truth: '128.40',
    })
    h.addWorker('w1', proven('w1'))

    const resolving = h.router.resolve(question({ timeoutMs: 5_000 }), { payer: WORKER_ADDRESS })
    const assignment = await h.router.takeAssignment('w1', 2_000)
    assert.ok(assignment)
    assert.ok(assignment.golden, 'the assignment should have been seeded as golden')

    await new Promise((r) => setTimeout(r, 20))
    h.router.submitAnswer({ assignmentId: assignment.assignmentId, workerId: 'w1', value: '12.84', selfConfidence: 1 })

    const record = h.store.workers.get('w1')?.record.byKind.disambiguate
    assert.equal(record?.disagreements, 1, 'a wrong golden answer is scored directly against the truth')

    const resolution = await resolving
    // The golden answer never reached the caller, so the question did not resolve.
    assert.notEqual(resolution.status, 'resolved')

    // It was still work the worker could not tell apart from a real question, so it
    // is paid — and recorded under the prompt they saw, not the caller's.
    assert.deepEqual(
      h.paymaster.wages.map((w) => w.workerId),
      ['w1'],
      'a known-answer check is paid like any other answer',
    )
    assert.equal(resolution.receipts?.length ?? 0, 0, 'the caller is not shown a wage they did not pay for')
    const history = h.store.workers.get('w1')?.payments ?? []
    assert.equal(history[0]?.label, 'The line reads TOTAL 128.40. Is the total 128.40 or 12.84?')
    assert.equal(history[0]?.status, 'settled')
  })
})
