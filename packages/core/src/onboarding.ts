import { gradeGolden, type GoldenQuestion } from './antifarming.js'
import { blankRecord, score } from './reputation.js'
import type { Kind, WorkerRecord } from './types.js'

/**
 * Entry assessment.
 *
 * Before this existed, a worker who signed up was immediately eligible for paid work
 * on a caller's question. Nothing stood between creating an identity and being handed
 * a real question that a real agent was blocking on, and the only thing protecting the
 * caller was that an unproven worker cannot settle a question alone. That is a weak
 * protection: it bounds the damage rather than preventing it, and it makes every new
 * worker's first several questions more expensive for us, because each one has to be
 * bought a second opinion.
 *
 * So a worker now answers a short set of questions whose answers are already known
 * before they see a caller's. It does three jobs at once:
 *
 *   - it filters people who cannot do the task at all, before a caller pays for them;
 *   - it seeds reputation from real evidence rather than from a prior, so a competent
 *     worker reaches solo-eligibility in one shift instead of fifty questions;
 *   - it raises the cost of farming, because an identity must demonstrate competence
 *     before it can extract anything beyond the assessment itself.
 *
 * **The assessment is paid.** That is not generosity and it is not negotiable. A
 * network whose first act is to extract unpaid work from someone who has not yet
 * earned anything is the thing this product exists to replace, and "a short unpaid
 * test" is how that always begins. The anti-farming protection is not withheld wages;
 * it is that failing ends the relationship, so the most an identity can extract is one
 * assessment's worth of pay.
 */

/** How many known-answer questions a worker answers before seeing real work. */
export const ASSESSMENT_LENGTH = 5

/**
 * How many they must get right.
 *
 * Four of five rather than five of five. A perfect score is the wrong bar: these
 * questions are deliberately answerable, but insisting on perfection would reject
 * competent people for a single slip and select for the cautious over the accurate.
 * It would also make the bar unreachable for anyone on a small screen having a bad
 * day, which is most of the people this is for.
 */
export const ASSESSMENT_PASS_MARK = 4

export type AssessmentState = {
  readonly workerId: string
  /** The questions posed, in order. */
  readonly questions: readonly GoldenQuestion[]
  /** Outcomes so far, oldest first. */
  readonly results: readonly { questionId: string; correct: boolean }[]
}

export type AssessmentOutcome =
  /** More questions to answer. */
  | { readonly status: 'in-progress'; readonly remaining: number; readonly next: GoldenQuestion }
  /** Passed. The worker joins the roster with real history behind their reputation. */
  | { readonly status: 'passed'; readonly correct: number; readonly of: number }
  /** Failed. No paid work, and the reason is given plainly. */
  | { readonly status: 'failed'; readonly correct: number; readonly of: number }

/** Picks an assessment for a worker: a spread across the kinds they will be asked. */
export function buildAssessment(
  workerId: string,
  pool: readonly GoldenQuestion[],
  random: () => number = Math.random,
): AssessmentState {
  // Draw across kinds rather than taking the first N, so a worker cannot pass by
  // being good at one kind of question and blind to the other.
  const byKind = new Map<Kind, GoldenQuestion[]>()
  for (const question of pool) {
    const list = byKind.get(question.kind) ?? []
    list.push(question)
    byKind.set(question.kind, list)
  }

  const chosen: GoldenQuestion[] = []
  const kinds = [...byKind.keys()]
  let index = 0
  while (chosen.length < ASSESSMENT_LENGTH && kinds.length > 0) {
    const kind = kinds[index % kinds.length]
    const available = (byKind.get(kind as Kind) ?? []).filter((q) => !chosen.includes(q))
    if (available.length === 0) {
      kinds.splice(index % kinds.length, 1)
      continue
    }
    const pick = available[Math.floor(random() * available.length)]
    if (pick) chosen.push(pick)
    index += 1
  }

  return { workerId, questions: chosen, results: [] }
}

/** Records an answer and says what happens next. */
export function submitAssessmentAnswer(
  state: AssessmentState,
  value: boolean | number | string,
): { state: AssessmentState; outcome: AssessmentOutcome } {
  const current = state.questions[state.results.length]
  if (!current) return { state, outcome: summarise(state) }

  const correct = gradeGolden(current, value) === 'agree'
  const next: AssessmentState = {
    ...state,
    results: [...state.results, { questionId: current.id, correct }],
  }
  return { state: next, outcome: summarise(next) }
}

function summarise(state: AssessmentState): AssessmentOutcome {
  const correct = state.results.filter((r) => r.correct).length
  const answered = state.results.length
  const of = state.questions.length
  const remaining = of - answered

  // Decide the result before offering another question, in both directions. Someone
  // who can no longer pass should not be made to finish a test they have already
  // failed, and someone who has already passed should not be asked for more.
  if (correct + remaining < ASSESSMENT_PASS_MARK) return { status: 'failed', correct, of }
  if (correct >= ASSESSMENT_PASS_MARK) return { status: 'passed', correct, of }

  if (remaining > 0) {
    const next = state.questions[answered]
    if (next) return { status: 'in-progress', remaining, next }
  }

  return correct >= ASSESSMENT_PASS_MARK ? { status: 'passed', correct, of } : { status: 'failed', correct, of }
}

/**
 * The reputation a worker starts with, having passed.
 *
 * Their assessment answers are written in as real history, because that is what they
 * are: graded answers against known truth, which is strictly better evidence than the
 * agreement signal ordinary questions produce. A worker who passed five of five starts
 * measurably ahead of one who scraped four, and both start ahead of the prior — which
 * is the point, since the prior exists only to cover the case of knowing nothing.
 */
export function seedFromAssessment(state: AssessmentState): WorkerRecord {
  let record = blankRecord(state.workerId)
  for (const [index, result] of state.results.entries()) {
    const question = state.questions[index]
    if (!question) continue
    record = score(record, question.kind, result.correct ? 'agree' : 'disagree')
  }
  return record
}

/** Whether a worker still owes an assessment before they can be paid for real work. */
export function needsAssessment(record: WorkerRecord): boolean {
  const answered = Object.values(record.byKind).reduce(
    (sum, kind) => sum + (kind?.agreements ?? 0) + (kind?.disagreements ?? 0),
    0,
  )
  return answered === 0
}
