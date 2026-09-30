import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Question } from '@quorum/core'
import { Router } from '../src/router.js'
import { Store } from '../src/store.js'
import { FakePaymaster } from './fake-paymaster.js'

/**
 * A careful reader who answers after their offer lapsed.
 *
 * Found in a live run: the offer lapsed at twenty seconds, the question was still
 * open for thirty, the same person was offered it again, and their answer arrived
 * against the first offer and was thrown away as "no longer open". The only person
 * online did the work and was told somebody else had.
 */

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const question = (): Question => ({
  id: `q_${Math.random().toString(36).slice(2)}`,
  kind: 'disambiguate',
  prompt: 'Is the total 45.00 or 4.50?',
  schema: { kind: 'choice', options: ['45.00', '4.50'] },
  priceCents: 142,
  timeoutMs: 3_000,
})

describe('an answer after the offer lapsed', () => {
  it('is counted while the question is still open, and the worker is paid', async () => {
    const store = new Store()
    const paymaster = new FakePaymaster()
    const router = new Router({ store, paymaster, assignmentTtlMs: 150, random: () => 0.99 })
    const worker = store.upsertWorker('reader-001', ADDRESS)
    worker.skills.disambiguate = 'passed'
    worker.record = { workerId: 'reader-001', byKind: { disambiguate: { agreements: 60, disagreements: 0, unresolved: 0 } } }

    const resolving = router.resolve(question())
    const first = await router.takeAssignment('reader-001', 500)
    assert.ok(first)

    // Reading carefully: the offer lapses, and the same question is offered again.
    await new Promise((r) => setTimeout(r, 300))
    const result = router.submitAnswer({ assignmentId: first.assignmentId, workerId: 'reader-001', value: '45.00', selfConfidence: 1 })

    assert.equal(result.accepted, true, 'the answer to a still-open question is not thrown away')
    const resolution = await resolving
    assert.equal(resolution.status, 'resolved')
    assert.equal(resolution.value, '45.00')
    assert.equal(resolution.responders, 1, 'counted once, not once per offer')
    assert.deepEqual(paymaster.wages.map((w) => w.workerId), ['reader-001'])
  })
})
