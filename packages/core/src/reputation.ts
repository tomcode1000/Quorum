import type { Kind, KindRecord, WorkerRecord } from './types.js'

/**
 * Reputation.
 *
 * One number per worker per question kind: the probability that their next answer
 * of that kind is correct. It is a Beta posterior over agreement outcomes, and it
 * is derived rather than stored — every input is an answer and a payment that both
 * exist on chain, so the whole model can be recomputed from history after a bug,
 * and a worker can reconstruct their own standing without trusting us to report it
 * honestly.
 *
 * The prior is deliberately optimistic but weak, and both halves of that matter.
 *
 * Optimistic, because the alternative is a network that cannot start. These are
 * constrained data-judgment questions asked of a person with the evidence in front
 * of them, and a person meeting that description is right far more often than a coin
 * would be; a prior near chance would mean that five brand-new workers agreeing
 * unanimously still failed to clear the bar, so a roster with no history could never
 * resolve anything and could therefore never acquire history. Four-to-one puts an
 * unknown worker at 0.8, which is roughly what the crowdsourcing literature reports
 * for this shape of task.
 *
 * Weak, because five pseudo-observations are swamped by twenty real ones. The prior
 * decides nothing after a worker's first shift, and it never lets an unproven worker
 * answer alone: `plannedReliability` gates that on evidence, not on optimism.
 */
export const PRIOR_AGREE = 4
export const PRIOR_DISAGREE = 1

/** Reliability floor and ceiling. Nobody is treated as certain or as worthless. */
export const MIN_RELIABILITY = 0.5
export const MAX_RELIABILITY = 0.98

/** How many scored answers of a kind before a worker counts as fully established. */
export const ESTABLISHED_AT = 50

export const EMPTY_KIND_RECORD: KindRecord = { agreements: 0, disagreements: 0, unresolved: 0 }

export function kindRecord(record: WorkerRecord, kind: Kind): KindRecord {
  return record.byKind[kind] ?? EMPTY_KIND_RECORD
}

/** Posterior mean: the reputation figure reported to callers and workers. */
export function reliability(record: WorkerRecord, kind: Kind): number {
  const history = kindRecord(record, kind)
  const a = history.agreements + PRIOR_AGREE
  const b = history.disagreements + PRIOR_DISAGREE
  return clamp(a / (a + b), MIN_RELIABILITY, MAX_RELIABILITY)
}

/**
 * How much evidence sits behind that number, 0..1.
 *
 * This is the posterior's variance expressed as a usable fraction, and it is what
 * separates "probably reliable" from "known reliable". It is why a worker with
 * three right answers does not get to settle a question alone on the strength of a
 * perfect record.
 */
export function established(record: WorkerRecord, kind: Kind): number {
  const history = kindRecord(record, kind)
  return clamp((history.agreements + history.disagreements) / ESTABLISHED_AT, 0, 1)
}

/** Whether a worker has enough history on this kind to be treated as proven. */
export function isProven(record: WorkerRecord, kind: Kind): boolean {
  return established(record, kind) >= 1
}

/**
 * The reliability the engine plans with: the posterior mean pulled back toward the
 * floor in proportion to how thin the record is.
 */
export function plannedReliability(record: WorkerRecord, kind: Kind): number {
  const mean = reliability(record, kind)
  return MIN_RELIABILITY + (mean - MIN_RELIABILITY) * established(record, kind)
}

/**
 * The reliability used when weighing an answer already given, which folds in how
 * sure the worker said they were.
 *
 * A worker who flags their own uncertainty is doing us a favour: we would much
 * rather pay for a hedged answer and escalate than pay for false confidence. So
 * `selfConfidence` scales their reliability toward the floor instead of being
 * ignored, and instead of being taken at face value.
 */
export function answerReliability(record: WorkerRecord, kind: Kind, selfConfidence: number): number {
  const base = reliability(record, kind)
  const hedge = clamp(selfConfidence, 0, 1)
  return clamp(MIN_RELIABILITY + (base - MIN_RELIABILITY) * hedge, MIN_RELIABILITY, MAX_RELIABILITY)
}

/** Records one scored outcome against a worker's history for a kind. */
export function score(record: WorkerRecord, kind: Kind, outcome: 'agree' | 'disagree' | 'unresolved'): WorkerRecord {
  const current = kindRecord(record, kind)
  return {
    ...record,
    byKind: {
      ...record.byKind,
      [kind]: {
        agreements: current.agreements + (outcome === 'agree' ? 1 : 0),
        disagreements: current.disagreements + (outcome === 'disagree' ? 1 : 0),
        unresolved: current.unresolved + (outcome === 'unresolved' ? 1 : 0),
      },
    },
  }
}

export function blankRecord(workerId: string): WorkerRecord {
  return { workerId, byKind: {} }
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}
