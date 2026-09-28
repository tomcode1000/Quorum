import { agrees } from './agreement.js'
import { clamp } from './reputation.js'
import type { AnswerSchema, Attachment, Kind, Question, WorkerAnswer } from './types.js'

/**
 * Anti-farming.
 *
 * Paying per answer invites answering without looking. A constrained answer space
 * is the first line of defence, because it makes random clicking measurable: a
 * farmer's agreement rate converges on chance, and chance is a number we can name.
 *
 * What is here is honest about its limits. Real sybil resistance is not solved
 * below — one identity per passkey is weak, and a determined operator with several
 * phones defeats it. That is stated rather than papered over, because the
 * alternative defence every comparable network reaches for is a worker bond, and a
 * bond is exactly what this product refuses to ask for. Someone answering questions
 * for two cents cannot first acquire and lock a volatile asset, and a "small
 * deposit to prevent spam" is the same idea wearing a friendlier word. Spam is
 * handled here and in selection, never with the worker's money.
 */

/**
 * Anything shown to a worker: a real question or a seeded known-answer one.
 *
 * The two are interchangeable here on purpose, because they have to be
 * indistinguishable in the worker app for the check to be worth anything.
 */
export type Shown = {
  readonly prompt: string
  readonly schema: AnswerSchema
  readonly attachments?: readonly Attachment[] | undefined
}

/** Share of assignments that are questions whose answer we already know. */
export const GOLDEN_RATE = 0.05

/** A question with a verified answer, used to calibrate reputation directly. */
export type GoldenQuestion = {
  readonly id: string
  readonly kind: Kind
  readonly prompt: string
  readonly schema: AnswerSchema
  readonly attachments?: readonly Attachment[] | undefined
  /** The verified answer. Never leaves the server. */
  readonly truth: boolean | number | string
}

/**
 * Whether this assignment should be a golden question instead of a real one.
 *
 * Golden questions are indistinguishable from real work in the worker app, and are
 * paid identically, because a check the worker can detect is a check they can
 * pass selectively. They calibrate reputation against a known answer rather than
 * only against what other workers happened to say, which is the one signal that
 * does not degrade if a majority of the pool is careless at once.
 */
export function shouldSeedGolden(random: () => number = Math.random): boolean {
  return random() < GOLDEN_RATE
}

export function gradeGolden(golden: GoldenQuestion, value: boolean | number | string): 'agree' | 'disagree' {
  return agrees(golden.schema, value, golden.truth) ? 'agree' : 'disagree'
}

/**
 * Per-worker, per-kind rate limit.
 *
 * Stops one worker flooding the exploration share, which is otherwise the cheapest
 * way to farm: an unproven account that answers constantly collects a
 * disproportionate number of the exploratory assignments meant to bootstrap the
 * whole roster.
 */
export const RATE_LIMIT = { answersPerMinute: 25, burst: 8 } as const

export type RateState = { readonly timestamps: readonly number[] }

export function rateLimited(state: RateState, now = Date.now()): boolean {
  const recent = state.timestamps.filter((t) => now - t < 60_000)
  if (recent.length >= RATE_LIMIT.answersPerMinute) return true
  const lastTenSeconds = recent.filter((t) => now - t < 10_000)
  return lastTenSeconds.length >= RATE_LIMIT.burst
}

export function recordAnswerTime(state: RateState, now = Date.now()): RateState {
  return { timestamps: [...state.timestamps.filter((t) => now - t < 60_000), now] }
}

/**
 * The shortest time in which a question could have been read and answered.
 *
 * An answer faster than this was not considered. The estimate is deliberately
 * generous — a fast reader at roughly five words per second, plus a second to tap —
 * because the cost of wrongly flagging a genuinely quick worker is that we stop
 * giving work to one of the best people on the roster.
 */
export function plausibleReadingTimeMs(question: Shown): number {
  const words = question.prompt.trim().split(/\s+/).length
  const optionWords = question.schema.kind === 'choice' ? question.schema.options.length * 2 : 2
  const attachmentTime = (question.attachments?.length ?? 0) * 800
  return 1_000 + ((words + optionWords) / 5) * 1_000 + attachmentTime
}

export function tooFastToBeReal(question: Shown, answer: Pick<WorkerAnswer, 'latencyMs'>): boolean {
  return answer.latencyMs < plausibleReadingTimeMs(question)
}

/**
 * A suspicion score in 0..1 from a worker's answer latencies.
 *
 * A careless worker is not identified by one fast answer but by a distribution that
 * sits below plausible reading time, so this reads the share of answers that were
 * too fast rather than any single one. It is a routing input, not an accusation:
 * the consequence of a high score is fewer assignments, never a withheld wage for
 * work already done.
 */
export function latencySuspicion(tooFastCount: number, totalAnswers: number): number {
  if (totalAnswers < 5) return 0
  return clamp(tooFastCount / totalAnswers, 0, 1)
}
