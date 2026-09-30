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
 * It is taken **per skill**. A worker chooses the kinds of question they want —
 * telling readings apart, checking something is real, matching records, and so on —
 * and answers five known-answer questions of each kind they chose. Passing a skill
 * opens that kind of work to them and no other; failing one closes that skill and
 * leaves the rest alone. Someone sharp at reading receipts should not be kept out of
 * that work because they are unsure about categorising products, and should not be
 * sent product categorisation because they are sharp at receipts.
 *
 * The assessment is not paid. Nothing in it reaches a caller or is billed to anyone,
 * so there is no revenue behind it to pay a wage out of. What the product refuses is
 * to take *productive* work for nothing: every question that reaches a worker from a
 * caller is paid, and so is every known-answer check mixed into real work, because
 * the worker cannot tell those apart from real questions.
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
  /** The skill this assessment is for. Every question in it is of this kind. */
  readonly kind: Kind
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

/**
 * Picks the assessment for one skill: ASSESSMENT_LENGTH questions of that kind,
 * drawn at random so two workers do not see the same set in the same order.
 */
export function buildAssessment(
  workerId: string,
  kind: Kind,
  pool: readonly GoldenQuestion[],
  random: () => number = Math.random,
): AssessmentState {
  const available = pool.filter((question) => question.kind === kind)
  const chosen: GoldenQuestion[] = []
  while (chosen.length < ASSESSMENT_LENGTH && available.length > 0) {
    const [pick] = available.splice(Math.floor(random() * available.length), 1)
    if (pick) chosen.push(pick)
  }
  return { workerId, kind, questions: chosen, results: [] }
}

/**
 * The skills that can be assessed, which are the only ones a worker may choose.
 *
 * A skill with fewer known-answer questions than an assessment needs cannot be
 * tested, and a skill that cannot be tested is not offered: routing work to somebody
 * on the strength of nothing is exactly what the assessment exists to stop.
 */
export function assessableKinds(pool: readonly GoldenQuestion[], kinds: readonly Kind[]): Kind[] {
  return kinds.filter((kind) => pool.filter((question) => question.kind === kind).length >= ASSESSMENT_LENGTH)
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
export function seedFromAssessment(state: AssessmentState, existing?: WorkerRecord): WorkerRecord {
  // Added to what is already there: passing a second skill must not erase the first.
  let record = existing ?? blankRecord(state.workerId)
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
