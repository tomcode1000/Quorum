import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CAPABILITIES, capabilityById, isBlocking, servableCapabilities } from '../src/capability.js'
import { gradeEvidence, isTerminal, presentEscalation, resultFromResolution, TERMINAL_STATES } from '../src/escalation.js'
import type { Escalation } from '../src/escalation.js'
import type { Resolution } from '../src/types.js'

describe('the capability catalog', () => {
  it('splits capabilities into the two regimes with different physics', () => {
    const consensus = CAPABILITIES.filter((c) => c.verification === 'consensus')
    const evidence = CAPABILITIES.filter((c) => c.verification === 'evidence')
    assert.ok(consensus.length > 0 && evidence.length > 0)
    // The distinction is the whole point: consensus is fast and cheap because it can be
    // re-asked; evidence is slow and dear because it cannot.
    for (const c of consensus) assert.ok(c.typicalLatencyMs < 60_000, `${c.id} claims consensus but is slow`)
    for (const e of evidence) assert.ok(e.typicalLatencyMs >= 60_000, `${e.id} claims evidence but is instant`)
    for (const e of evidence) assert.ok(e.priceCents.min > 100, `${e.id} prices field work like a judgment`)
  })

  it('only marks a capability blocking when it can actually resolve in a request', () => {
    for (const c of CAPABILITIES) assert.equal(isBlocking(c), c.verification === 'consensus')
  })

  it('does not offer a field capability it has no workforce for', () => {
    // Offering it would mean blocking a caller's task on something nobody can fulfil.
    for (const c of servableCapabilities()) assert.equal(c.class, 'judgment')
  })

  it('requires an evidence list for every evidence-verified capability', () => {
    for (const c of CAPABILITIES.filter((x) => x.verification === 'evidence'))
      assert.ok((c.evidence?.length ?? 0) > 0, `${c.id} has no evidence requirements, so nothing could be checked`)
  })

  it('maps every judgment capability onto a reputation kind', () => {
    for (const c of CAPABILITIES.filter((x) => x.verification === 'consensus'))
      assert.ok(c.kind, `${c.id} has no kind, so reputation could not be tracked for it`)
  })
})

describe('evidence grading', () => {
  const required = capabilityById('physical_verification')?.evidence ?? []

  it('accepts a complete submission', () => {
    const graded = gradeEvidence(required, {
      photos: [{ url: 'a' }, { url: 'b' }, { url: 'c' }],
      location: { lat: 6.5, lon: 3.3 },
      capturedAt: new Date().toISOString(),
      observations: ['Walls up', 'Roof not started'],
    })
    assert.equal(graded.complete, true)
    assert.equal(graded.completeness, 1)
  })

  it('names exactly what is missing rather than failing vaguely', () => {
    const graded = gradeEvidence(required, { photos: [{ url: 'a' }], observations: ['Walls up'] })
    assert.equal(graded.complete, false)
    assert.ok(graded.missing.some((m) => m.includes('photograph')))
    assert.ok(graded.missing.some((m) => m.includes('location')))
    assert.ok(graded.missing.some((m) => m.includes('observation')))
  })

  it('does not count a blank observation as an observation', () => {
    const graded = gradeEvidence([{ type: 'observations', minimum: 1 }], { observations: ['   '] })
    assert.equal(graded.complete, false)
  })

  it('scores partial completeness between zero and one', () => {
    const graded = gradeEvidence(required, { photos: [{ url: 'a' }, { url: 'b' }, { url: 'c' }], capturedAt: 'now' })
    assert.ok(graded.completeness > 0 && graded.completeness < 1)
  })
})

describe('the caller-facing view', () => {
  const base: Escalation = {
    id: 'esc_1',
    capabilityId: 'disambiguate',
    requester: { externalAgentId: 'agent-77', externalTaskId: 'their-task-9' },
    task: 'Read the total',
    state: 'completed',
    priceCents: 250,
    createdAt: Date.now() - 5_000,
    deadlineAt: Date.now() + 25_000,
    workerIds: ['w1'],
    wageReceipts: [],
  }

  it('echoes the caller\u2019s own identifiers back, so they can reconcile without asking us', () => {
    const view = presentEscalation(base)
    assert.equal(view.external_agent_id, 'agent-77')
    assert.equal(view.external_task_id, 'their-task-9')
  })

  it('says what a confidence number is based on, because the two are not comparable', () => {
    const resolution = {
      questionId: 'q',
      status: 'resolved',
      value: '45.00',
      confidence: 0.98,
      responders: 2,
      agreement: 'unanimous',
      evidence: [{ workerId: 'w1', value: '45.00', reputation: 0.9 }],
      latencyMs: 5_000,
      wagesCents: 4,
      receipts: [],
      resolvedAt: Date.now(),
    } satisfies Resolution
    const view = presentEscalation({ ...base, result: resultFromResolution(resolution) }) as {
      result: { confidence_basis: string }
    }
    assert.equal(view.result.confidence_basis, 'consensus-posterior')
  })

  it('reports a judgment failure as not completed, with no answer', () => {
    const resolution = {
      questionId: 'q',
      status: 'no_consensus',
      value: null,
      confidence: 0.5,
      responders: 2,
      agreement: 'split',
      evidence: [],
      latencyMs: 9_000,
      wagesCents: 4,
      receipts: [],
      resolvedAt: Date.now(),
    } satisfies Resolution
    const result = resultFromResolution(resolution)
    assert.equal(result.completed, false)
    assert.equal(result.answer, undefined)
  })
})

describe('the lifecycle', () => {
  it('treats exactly the finished states as terminal', () => {
    assert.deepEqual([...TERMINAL_STATES].sort(), ['cancelled', 'completed', 'failed'])
    for (const state of ['pending', 'assigned', 'submitted'] as const) assert.equal(isTerminal(state), false)
  })
})
