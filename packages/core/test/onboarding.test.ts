import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ASSESSMENT_LENGTH,
  ASSESSMENT_PASS_MARK,
  assessableKinds,
  buildAssessment,
  needsAssessment,
  seedFromAssessment,
  submitAssessmentAnswer,
  type AssessmentState,
} from '../src/onboarding.js'
import { plannedReliability, blankRecord } from '../src/reputation.js'
import type { GoldenQuestion } from '../src/antifarming.js'

const POOL: GoldenQuestion[] = [
  { id: 'd1', kind: 'disambiguate', prompt: 'a', schema: { kind: 'choice', options: ['x', 'y'] }, truth: 'x' },
  { id: 'd2', kind: 'disambiguate', prompt: 'b', schema: { kind: 'choice', options: ['x', 'y'] }, truth: 'y' },
  { id: 'd3', kind: 'disambiguate', prompt: 'c', schema: { kind: 'number', tolerance: 1 }, truth: 100 },
  { id: 'd4', kind: 'disambiguate', prompt: 'g', schema: { kind: 'choice', options: ['x', 'y'] }, truth: 'x' },
  { id: 'd5', kind: 'disambiguate', prompt: 'h', schema: { kind: 'boolean' }, truth: false },
  { id: 'd6', kind: 'disambiguate', prompt: 'i', schema: { kind: 'choice', options: ['x', 'y'] }, truth: 'y' },
  { id: 'v1', kind: 'verify', prompt: 'd', schema: { kind: 'boolean' }, truth: true },
  { id: 'v2', kind: 'verify', prompt: 'e', schema: { kind: 'boolean' }, truth: false },
  { id: 'v3', kind: 'verify', prompt: 'f', schema: { kind: 'boolean' }, truth: true },
]

/** Answers every question correctly or incorrectly, as told. */
function run(state: AssessmentState, correctness: boolean[]) {
  let current = state
  let outcome = submitAssessmentAnswer(current, truthFor(current, correctness[0] ?? true))
  current = outcome.state
  for (let i = 1; i < correctness.length; i += 1) {
    if (outcome.outcome.status !== 'in-progress') break
    outcome = submitAssessmentAnswer(current, truthFor(current, correctness[i] ?? true))
    current = outcome.state
  }
  return outcome
}

function truthFor(state: AssessmentState, correct: boolean): boolean | number | string {
  const question = state.questions[state.results.length]
  if (!question) return ''
  if (correct) return question.truth
  if (question.schema.kind === 'boolean') return question.truth !== true
  if (question.schema.kind === 'choice') return question.schema.options.find((o) => o !== question.truth) ?? 'x'
  return Number(question.truth) + 1000
}

describe('entry assessment', () => {
  it('tests one skill with questions of that skill only', () => {
    const state = buildAssessment('w1', 'disambiguate', POOL, () => 0)
    assert.equal(state.kind, 'disambiguate')
    assert.equal(state.questions.length, ASSESSMENT_LENGTH)
    assert.ok(
      state.questions.every((q) => q.kind === 'disambiguate'),
      'a skill proven with another kind of question has not been proven',
    )
  })

  it('never poses the same question twice', () => {
    const state = buildAssessment('w1', 'disambiguate', POOL, () => 0.5)
    assert.equal(new Set(state.questions.map((q) => q.id)).size, state.questions.length)
  })

  it('offers only the skills there are enough known answers to test', () => {
    // Six disambiguate questions, three verify: only one skill can be assessed.
    assert.deepEqual(assessableKinds(POOL, ['disambiguate', 'verify', 'match']), ['disambiguate'])
  })

  it('adds a second skill to the record rather than replacing the first', () => {
    const first = seedFromAssessment(run(buildAssessment('w1', 'disambiguate', POOL, () => 0), [true, true, true, true, true]).state)
    const verifyPool = [...POOL, ...POOL.filter((q) => q.kind === 'verify').map((q) => ({ ...q, id: `${q.id}b` }))]
    const second = seedFromAssessment(
      run(buildAssessment('w1', 'verify', verifyPool, () => 0), [true, true, true, true, true]).state,
      first,
    )
    // Four right in a row decides a pass, so the fifth is never asked.
    assert.equal(second.byKind.disambiguate?.agreements, ASSESSMENT_PASS_MARK)
    assert.equal(second.byKind.verify?.agreements, ASSESSMENT_PASS_MARK)
  })

  it('passes a worker who gets enough right', () => {
    const outcome = run(buildAssessment('w1', 'disambiguate', POOL, () => 0), [true, true, true, true, true])
    assert.equal(outcome.outcome.status, 'passed')
  })

  it('tolerates one mistake, because perfection is the wrong bar', () => {
    const outcome = run(buildAssessment('w1', 'disambiguate', POOL, () => 0), [true, false, true, true, true])
    assert.equal(outcome.outcome.status, 'passed')
    assert.equal(outcome.outcome.status === 'passed' ? outcome.outcome.correct : 0, ASSESSMENT_PASS_MARK)
  })

  it('fails a worker who cannot do the task', () => {
    const outcome = run(buildAssessment('w1', 'disambiguate', POOL, () => 0), [false, false, false, false, false])
    assert.equal(outcome.outcome.status, 'failed')
  })

  it('stops early once passing has become impossible', () => {
    // Two wrong out of five makes four-of-five unreachable; do not make them finish.
    const outcome = run(buildAssessment('w1', 'disambiguate', POOL, () => 0), [false, false, true, true, true])
    assert.equal(outcome.outcome.status, 'failed')
    assert.equal(outcome.state.results.length, 2, 'the test should end as soon as its result is decided')
  })

  it('seeds reputation from graded answers rather than from the prior', () => {
    const passed = run(buildAssessment('w1', 'disambiguate', POOL, () => 0), [true, true, true, true, true])
    const seeded = seedFromAssessment(passed.state)
    const fresh = blankRecord('w1')
    assert.ok(
      plannedReliability(seeded, 'disambiguate') > plannedReliability(fresh, 'disambiguate'),
      'passing should count for something the prior cannot supply',
    )
  })

  it('starts a five-of-five worker ahead of a four-of-five one', () => {
    const perfect = seedFromAssessment(run(buildAssessment('w1', 'disambiguate', POOL, () => 0), [true, true, true, true, true]).state)
    const scraped = seedFromAssessment(run(buildAssessment('w2', 'disambiguate', POOL, () => 0), [true, false, true, true, true]).state)
    const total = (r: typeof perfect) =>
      Object.values(r.byKind).reduce((s, k) => s + (k?.agreements ?? 0) - (k?.disagreements ?? 0), 0)
    assert.ok(total(perfect) > total(scraped))
  })

  it('knows when a worker still owes an assessment', () => {
    assert.equal(needsAssessment(blankRecord('new')), true)
    const passed = run(buildAssessment('w1', 'disambiguate', POOL, () => 0), [true, true, true, true, true])
    assert.equal(needsAssessment(seedFromAssessment(passed.state)), false)
  })
})
