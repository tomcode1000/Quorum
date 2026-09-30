import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EXPLORATION_SHARE,
  MAX_RESPONDERS,
  WAGE_CENTS,
  agreementShape,
  believe,
  blankRecord,
  canResolveAlone,
  decide,
  selectWorker,
  soloConfidence,
  trustTarget,
  updateRecords,
  wagesFor,
  type EngineState,
} from '../src/quorum.js'
import { score } from '../src/reputation.js'
import type { AnswerSchema, AvailableWorker, Kind, Question, WorkerAnswer, WorkerRecord } from '../src/types.js'

const KIND: Kind = 'disambiguate'

/** A worker with `agreements` clean answers and `disagreements` misses on `KIND`. */
function worker(workerId: string, agreements: number, disagreements = 0): WorkerRecord {
  return { workerId, byKind: { [KIND]: { agreements, disagreements, unresolved: 0 } } }
}

function records(...list: WorkerRecord[]): Map<string, WorkerRecord> {
  return new Map(list.map((r) => [r.workerId, r]))
}

function answer(workerId: string, value: boolean | number | string, selfConfidence = 1): WorkerAnswer {
  return { assignmentId: `${workerId}-a`, workerId, value, selfConfidence, latencyMs: 4_000, submittedAt: Date.now() }
}

function question(over: Partial<Question> = {}): Question {
  return {
    id: 'q_1',
    kind: KIND,
    prompt: 'Does this receipt total say 45.00 or 4.50?',
    schema: { kind: 'choice', options: ['45.00', '4.50'] },
    priceCents: 250,
    timeoutMs: 45_000,
    ...over,
  }
}

function state(over: Partial<EngineState> = {}): EngineState {
  return {
    answers: [],
    records: new Map(),
    available: [],
    outstanding: 0,
    bought: 0,
    remainingMs: 40_000,
    // Exploration off by default so selection tests are deterministic.
    random: () => 1,
    ...over,
  }
}

const proven = worker('proven', 200)
const decent = worker('decent', 40, 3)
const novice = blankRecord('novice')

describe('price is the confidence dial', () => {
  it('rises monotonically with what the caller agreed to pay', () => {
    const cheap = trustTarget({ priceCents: 50 })
    const mid = trustTarget({ priceCents: 250 })
    const dear = trustTarget({ priceCents: 500 })
    assert.ok(cheap < mid && mid < dear, `${cheap} < ${mid} < ${dear}`)
    assert.ok(cheap >= 0.85 && dear <= 0.995)
  })

  it('depends on nothing but the price', () => {
    // The caller's confidence in its own guess describes difficulty, not stakes.
    // Letting it move this number turned hard questions into refunds, so it moves
    // routing instead; see the note on trustTarget.
    assert.equal(trustTarget({ priceCents: 250 }), trustTarget({ priceCents: 250 }))
    assert.equal(trustTarget({ priceCents: 80 }), 1 - 5 / 80)
  })
})

describe('belief', () => {
  const schema: AnswerSchema = { kind: 'choice', options: ['45.00', '4.50'] }
  const q = { kind: KIND, schema }

  it('values a lone answer at the worker reliability, whatever the option count', () => {
    const two = believe({ kind: KIND, schema: { kind: 'choice', options: ['a', 'b'] } }, [answer('proven', 'a')], records(proven))
    const ten = believe(
      { kind: KIND, schema: { kind: 'choice', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] } },
      [answer('proven', 'a')],
      records(proven),
    )
    assert.ok(Math.abs((two.candidates[0]?.confidence ?? 0) - (ten.candidates[0]?.confidence ?? 0)) < 1e-9)
  })

  it('raises confidence when two workers agree', () => {
    const one = believe(q, [answer('decent', '45.00')], records(decent))
    const two = believe(q, [answer('decent', '45.00'), answer('novice', '45.00')], records(decent, novice))
    assert.ok((two.candidates[0]?.confidence ?? 0) > (one.candidates[0]?.confidence ?? 0))
  })

  it('treats agreement on a wide-open question as stronger evidence than on a yes/no one', () => {
    const pair = records(worker('a', 40), worker('b', 40))
    const binary = believe({ kind: KIND, schema: { kind: 'boolean' } }, [answer('a', true), answer('b', true)], pair)
    const wide = believe(
      { kind: KIND, schema: { kind: 'choice', options: ['1', '2', '3', '4', '5', '6', '7', '8'] } },
      [answer('a', '3'), answer('b', '3')],
      pair,
    )
    assert.ok((wide.candidates[0]?.confidence ?? 0) > (binary.candidates[0]?.confidence ?? 0))
  })

  it('leaves two equally-rated workers who disagree near a coin flip', () => {
    const belief = believe(q, [answer('a', '45.00'), answer('b', '4.50')], records(worker('a', 40), worker('b', 40)))
    assert.equal(belief.candidates.length, 2)
    assert.ok(Math.abs((belief.candidates[0]?.confidence ?? 0) - 0.5) < 0.05)
  })

  it('is stricter than multiplying reputations, which is the case that matters', () => {
    // Two 0.9-ish workers who disagree: a product of reputations would report high
    // confidence in one of them. The posterior reports a coin flip.
    const belief = believe(q, [answer('a', '45.00'), answer('b', '4.50')], records(worker('a', 200), worker('b', 200)))
    assert.ok((belief.candidates[0]?.confidence ?? 0) < 0.6)
  })

  it('breaks a tie in favour of the worker with the better record', () => {
    const belief = believe(q, [answer('proven', '45.00'), answer('novice', '4.50')], records(proven, novice))
    assert.equal(belief.candidates[0]?.value, '45.00')
    assert.ok((belief.candidates[0]?.confidence ?? 0) > 0.8)
  })

  it('discounts an answer the worker themselves flagged as uncertain', () => {
    const sure = believe(q, [answer('decent', '45.00', 1)], records(decent))
    const hedged = believe(q, [answer('decent', '45.00', 0.3)], records(decent))
    assert.ok((hedged.candidates[0]?.confidence ?? 0) < (sure.candidates[0]?.confidence ?? 0))
  })

  it('does not read a formatting difference as disagreement', () => {
    const belief = believe(
      { kind: KIND, schema: { kind: 'number', tolerance: 0.01 } },
      [answer('a', '$45.00'), answer('b', '45')],
      records(worker('a', 40), worker('b', 40)),
    )
    assert.equal(belief.candidates.length, 1)
  })

  it('keeps probabilities normalised over a long escalation chain', () => {
    const many = Array.from({ length: 9 }, (_, i) => answer(`w${i}`, '45.00'))
    const belief = believe(q, many, new Map(many.map((a) => [a.workerId, worker(a.workerId, 40)])))
    const total = belief.candidates.reduce((sum, c) => sum + c.confidence, 0) + belief.unobservedConfidence
    assert.ok(Math.abs(total - 1) < 1e-9, `probabilities summed to ${total}`)
  })

  it('reads reputation per kind, so skill on one does not vouch for another', () => {
    const q2 = { kind: 'verify' as Kind, schema }
    const onDisambiguate = believe(q, [answer('proven', '45.00')], records(proven))
    const onVerify = believe(q2, [answer('proven', '45.00')], records(proven))
    assert.ok((onVerify.candidates[0]?.confidence ?? 0) < (onDisambiguate.candidates[0]?.confidence ?? 0))
  })
})

describe('the escalation ladder', () => {
  it('asks the most reliable available worker first', () => {
    const available: AvailableWorker[] = [novice, proven, decent]
    assert.equal(selectWorker({ kind: KIND }, state({ available }))?.worker.workerId, 'proven')
  })

  it('never asks a worker who is busy or already answered this question', () => {
    const available: AvailableWorker[] = [{ ...proven, busy: true }, decent]
    assert.equal(selectWorker({ kind: KIND }, state({ available, answers: [answer('decent', '45.00')] })), null)
  })

  it('lets one proven worker settle a mid-priced question alone', () => {
    const q = question({ priceCents: 100 })
    assert.ok(canResolveAlone(q, proven))
    assert.equal(decide(q, state({ answers: [answer('proven', '45.00')], records: records(proven) })).action, 'resolve')
  })

  it('buys a second opinion when the only answer came from an unproven worker', () => {
    const decision = decide(
      question(),
      state({ answers: [answer('novice', '45.00')], records: records(novice, proven), available: [proven], bought: 1 }),
    )
    assert.equal(decision.action, 'ask')
    assert.equal(decision.action === 'ask' ? decision.workerId : null, 'proven')
  })

  it('buys a third answer when the first two disagree, without being told to', () => {
    const c = worker('c', 40)
    const decision = decide(
      question(),
      state({
        answers: [answer('a', '45.00'), answer('b', '4.50')],
        records: records(worker('a', 40), worker('b', 40), c),
        available: [c],
        bought: 2,
      }),
    )
    assert.equal(decision.action, 'ask', 'a 50/50 split must never be answered to the caller')
    assert.equal(decision.action === 'ask' ? decision.workerId : null, 'c')
  })

  it('needs a further answer at the fifty-cent price that the ten-cent price does not', () => {
    const both = [answer('a', '45.00', 0.7), answer('b', '45.00', 0.7)]
    const pool = {
      answers: both,
      records: records(worker('a', 200), worker('b', 200), worker('c', 200)),
      available: [worker('c', 200)],
      bought: 2,
    }
    assert.equal(decide(question({ priceCents: 100 }), state(pool)).action, 'resolve')
    assert.equal(decide(question({ priceCents: 500 }), state(pool)).action, 'ask')
  })

  it('waits for an outstanding answer rather than buying a duplicate', () => {
    assert.equal(decide(question(), state({ outstanding: 1, available: [proven], records: records(proven), bought: 1 })).action, 'wait')
  })

  it('gives up at MAX_RESPONDERS and calls the question ambiguous', () => {
    const many = Array.from({ length: MAX_RESPONDERS }, (_, i) => answer(`w${i}`, i % 2 === 0 ? '45.00' : '4.50'))
    const decision = decide(
      question(),
      state({
        answers: many,
        records: new Map(many.map((a) => [a.workerId, worker(a.workerId, 40)])),
        available: [worker('spare', 40)],
        bought: MAX_RESPONDERS,
      }),
    )
    assert.equal(decision.action, 'stop')
    assert.equal(decision.action === 'stop' ? decision.status : null, 'no_consensus')
  })

  it('reports timeout when the deadline passed with nothing to show', () => {
    const decision = decide(question(), state({ remainingMs: 0, available: [proven] }))
    assert.equal(decision.action === 'stop' ? decision.status : null, 'timeout')
  })

  it('reports no_consensus when the deadline passed with answers that did not converge', () => {
    const decision = decide(
      question(),
      state({
        remainingMs: 0,
        answers: [answer('a', '45.00'), answer('b', '4.50')],
        records: records(worker('a', 40), worker('b', 40)),
        bought: 2,
      }),
    )
    assert.equal(decision.action === 'stop' ? decision.status : null, 'no_consensus')
  })

  it('refuses rather than pretending when there is no supply at all', () => {
    const decision = decide(question(), state({ available: [] }))
    assert.equal(decision.action === 'stop' ? decision.status : null, 'refused')
  })

  it('stops instead of asking when the deadline is too close to answer in', () => {
    assert.equal(decide(question(), state({ remainingMs: 500, available: [proven], records: records(proven) })).action, 'stop')
  })

  it('costs under two answers per question where fixed 3x costs three', () => {
    const pool = ['w0', 'w1', 'w2', 'w3', 'w4'].map((id) => worker(id, 120))
    const recordMap = records(...pool)
    const prices = [80, 100, 250, 250, 500]
    let bought = 0

    for (const priceCents of prices) {
      const q = question({ priceCents })
      const collected: WorkerAnswer[] = []
      for (let step = 0; step < MAX_RESPONDERS; step += 1) {
        const decision = decide(q, state({ answers: collected, records: recordMap, available: pool, bought: collected.length }))
        if (decision.action !== 'ask') break
        collected.push(answer(decision.workerId, '45.00'))
        bought += 1
      }
    }

    const perQuestion = bought / prices.length
    assert.ok(perQuestion < 2, `adaptive bought ${perQuestion} answers per question; fixed 3x buys 3`)
  })
})

describe('exploration', () => {
  it('sometimes asks an unproven worker so the roster can grow', () => {
    const available: AvailableWorker[] = [proven, novice]
    // Below the exploration share: the unproven worker is picked despite ranking last.
    const picked = selectWorker({ kind: KIND }, state({ available, random: () => EXPLORATION_SHARE / 2 }))
    assert.equal(picked?.worker.workerId, 'novice')
    assert.equal(picked?.exploratory, true)
  })

  it('does not train anybody on a question the caller says is hard', () => {
    const available: AvailableWorker[] = [proven, novice]
    const picked = selectWorker(
      { kind: KIND, callerConfidence: 0.2 },
      state({ available, random: () => EXPLORATION_SHARE / 2 }),
    )
    assert.equal(picked?.worker.workerId, 'proven')
    assert.equal(picked?.exploratory, false)
  })

  it('never spends an escalation step on exploration', () => {
    const available: AvailableWorker[] = [proven, novice]
    const picked = selectWorker(
      { kind: KIND },
      state({ available, answers: [answer('other', '45.00')], random: () => EXPLORATION_SHARE / 2 }),
    )
    assert.equal(picked?.worker.workerId, 'proven', 'the answer that breaks a tie must be the most informative one')
    assert.equal(picked?.exploratory, false)
  })
})

describe('payment and reputation', () => {
  it('pays every worker who answered, including the one who turned out wrong', () => {
    const paid = wagesFor([answer('a', '45.00'), answer('b', '4.50')])
    assert.deepEqual(paid.map((p) => p.workerId), ['a', 'b'])
    assert.ok(paid.every((p) => p.amountCents === WAGE_CENTS))
  })

  it('pays a worker once even if they somehow answered twice', () => {
    assert.equal(wagesFor([answer('a', '45.00'), answer('a', '45.00')]).length, 1)
  })

  it('credits agreement and debits disagreement against the resolved answer', () => {
    const q = { kind: KIND, schema: { kind: 'choice', options: ['45.00', '4.50'] } as AnswerSchema }
    const next = updateRecords(q, { status: 'resolved', value: '45.00' }, [answer('a', '45.00'), answer('b', '4.50')], records(worker('a', 10), worker('b', 10)))
    assert.equal(next.get('a')?.byKind[KIND]?.agreements, 11)
    assert.equal(next.get('b')?.byKind[KIND]?.disagreements, 1)
  })

  it('does not punish the dissenter on a no_consensus question', () => {
    // Penalising them would teach the pool to guess the popular answer, which is
    // the one failure that would make the confidence model a lie.
    const q = { kind: KIND, schema: { kind: 'boolean' } as AnswerSchema }
    const next = updateRecords(q, { status: 'no_consensus', value: true }, [answer('a', true), answer('b', false)], records(worker('a', 10), worker('b', 10)))
    assert.equal(next.get('b')?.byKind[KIND]?.disagreements, 0)
    assert.equal(next.get('b')?.byKind[KIND]?.unresolved, 1)
    assert.equal(next.get('a')?.byKind[KIND]?.unresolved, 1)
  })

  it('scores only the kind that was asked', () => {
    const scored = score(blankRecord('w'), 'verify', 'agree')
    assert.equal(scored.byKind.verify?.agreements, 1)
    assert.equal(scored.byKind.disambiguate, undefined)
  })

  it('lifts a worker out of needing supervision as their record grows', () => {
    const early = soloConfidence(worker('w', 3), KIND)
    const later = soloConfidence(worker('w', 150), KIND)
    assert.ok(later > early)
    assert.ok(early < 0.9, 'three right answers must not buy an unsupervised worker')
  })

  it('describes how the responders lined up', () => {
    const q = { kind: KIND, schema: { kind: 'choice', options: ['45.00', '4.50'] } as AnswerSchema }
    const pair = records(worker('a', 40), worker('b', 40), worker('c', 40))
    assert.equal(agreementShape(q, [answer('a', '45.00'), answer('b', '45.00')], pair), 'unanimous')
    assert.equal(agreementShape(q, [answer('a', '45.00'), answer('b', '4.50')], pair), 'split')
    assert.equal(agreementShape(q, [answer('a', '45.00'), answer('b', '45.00'), answer('c', '4.50')], pair), 'majority')
    assert.equal(agreementShape(q, [], pair), 'none')
  })
})
