import { agrees, canonicalKey, optionCount } from './agreement.js'
import { answerReliability, blankRecord, clamp, established, plannedReliability, reliability, score } from './reputation.js'
import type {
  AnswerSchema,
  AvailableWorker,
  Kind,
  Question,
  Resolution,
  ResolutionStatus,
  WorkerAnswer,
  WorkerRecord,
} from './types.js'

/**
 * The adaptive redundancy engine.
 *
 * Fixed three-way voting triples the wage bill on every question, including the
 * large majority that one competent worker would have answered correctly alone.
 * Instead this engine treats each answer as evidence and keeps buying only while
 * the evidence is inconclusive:
 *
 *   - a proven worker, asked alone, can clear the bar by themselves;
 *   - an unproven one cannot, so a second opinion is bought;
 *   - two workers who disagree cancel out, so a third is bought to break it.
 *
 * Only the first of those is expressed as a rule anywhere. The second and third
 * fall out of the arithmetic below, which is the point: the escalation ladder is a
 * consequence of the confidence model rather than a parallel set of heuristics
 * that can drift out of step with it.
 *
 * The model is a Dawid-Skene style weighted vote with a symmetric error
 * assumption. Each worker is a noisy channel that reports the true answer with
 * probability `p` and otherwise reports one of the `k - 1` wrong answers
 * uniformly. The likelihood of a hypothesis is then a product over workers, and
 * the posterior is that likelihood normalised across all `k` hypotheses.
 *
 * This is stricter than multiplying reputations together, and the difference
 * matters in the case that actually comes up: two workers who disagree. A product
 * of reputations says two 0.9 workers give you 0.81 confidence in something;
 * the posterior says you have roughly a coin flip and need to buy a third answer.
 * Agreement is also worth more on a question with eight possible answers than on a
 * yes/no one, which plain vote-counting cannot express at all.
 */

/**
 * The most answers that will ever be bought for one question.
 *
 * Past five, the honest conclusion is that the question is ambiguous rather than
 * that the workers are wrong, and `no_consensus` with the disagreeing answers
 * attached is worth more to the caller than a sixth opinion.
 */
export const MAX_RESPONDERS = 5

/** What one answer costs the platform, in cents. */
/**
 * What one answer pays, in cents: twenty. Prices are set around it (floors of
 * 50c to $1.20, a $5 ceiling) so that every ordinary question still pays for the
 * people it takes, with the same margins as before at ten times the scale.
 */
export const WAGE_CENTS = 20

/** An ask is not worth starting if the worker cannot plausibly answer in time. */
export const MIN_ASK_WINDOW_MS = 1_500

/**
 * The share of assignments given to workers who are not the best available choice,
 * so that a new worker can build the history they need to be chosen on merit.
 *
 * Without this the roster ossifies: selection prefers proven workers, so an
 * unproven worker is never asked, so they never become proven. Ten percent is
 * enough to bootstrap a newcomer within a shift and small enough that a caller is
 * unlikely to notice. The cost of exploration is real and is borne by us, not by
 * the caller: an exploratory answer that fails to clear the bar is followed by a
 * proven worker's answer, and both get paid.
 */
export const EXPLORATION_SHARE = 0.1

/** What the engine has concluded about one possible answer. */
export type Candidate = {
  readonly value: boolean | number | string
  /** Posterior probability that this is the correct answer. */
  readonly confidence: number
  readonly supporters: readonly string[]
}

export type Belief = {
  /** Candidates, most likely first. Empty when no valid answer has arrived. */
  readonly candidates: readonly Candidate[]
  /** Posterior mass sitting on answers nobody has proposed. */
  readonly unobservedConfidence: number
}

/** What the engine wants to happen next. */
export type Decision =
  | { readonly action: 'ask'; readonly workerId: string; readonly exploratory: boolean; readonly reason: string }
  | { readonly action: 'resolve'; readonly reason: string }
  | { readonly action: 'stop'; readonly status: Exclude<ResolutionStatus, 'resolved'>; readonly reason: string }
  | { readonly action: 'wait'; readonly reason: string }

export type EngineState = {
  /** Answers received so far, oldest first. */
  readonly answers: readonly WorkerAnswer[]
  /** Agreement history for the workers who answered and the workers on offer. */
  readonly records: ReadonlyMap<string, WorkerRecord>
  /** Workers who could be asked next. */
  readonly available: readonly AvailableWorker[]
  /** Assignments handed out but not yet answered. */
  readonly outstanding: number
  /** Answers already bought, whether or not they arrived. */
  readonly bought: number
  /** Milliseconds left on the caller's deadline. */
  readonly remainingMs: number
  /** Injectable randomness, so the exploration share is testable. */
  readonly random?: () => number
}

/**
 * How sure an answer has to be before the caller gets it, derived only from the
 * price they agreed to pay.
 *
 * Price and confidence are one dial, exposed once. A caller paying fifty cents is
 * buying a quick single opinion; one paying five dollars is buying near-certainty,
 * and the extra four fifty is what funds the extra answers that certainty costs.
 *
 * `callerConfidence` deliberately does not appear here, and an earlier version of
 * this function was wrong to use it. Letting a caller's self-doubt raise the bar
 * sounds prudent and behaves badly: how sure a caller is of its own guess describes
 * how hard the question is, not how much the answer is worth, so raising the
 * threshold demands the most certainty on exactly the questions where certainty is
 * dearest and hardest to reach. In practice that converted the hardest questions
 * into refunds — we paid the wages, the caller got nothing, and the harder the
 * question the more reliably it happened. Difficulty belongs in routing, where
 * `selectWorker` uses it to put the best worker on the question first.
 */
export function trustTarget(question: Pick<Question, 'priceCents'>): number {
  // 50c maps to 0.90, $1 to 0.95, $2.50 to 0.98, $5 to 0.99, asymptotic thereafter.
  return clamp(1 - 5 / Math.max(1, question.priceCents), 0.85, 0.995)
}

/** Computes the posterior over possible answers. */
export function believe(
  question: Pick<Question, 'kind' | 'schema'>,
  answers: readonly WorkerAnswer[],
  records: ReadonlyMap<string, WorkerRecord>,
): Belief {
  const { schema, kind } = question
  const k = optionCount(schema)

  const groups = new Map<string, { value: boolean | number | string; supporters: string[] }>()
  for (const answer of answers) {
    const key = canonicalKey(schema, answer.value)
    const group = groups.get(key)
    if (group) group.supporters.push(answer.workerId)
    else groups.set(key, { value: answer.value, supporters: [answer.workerId] })
  }
  if (groups.size === 0) return { candidates: [], unobservedConfidence: 1 }

  const weights = new Map<string, number>()
  for (const answer of answers) {
    const record = records.get(answer.workerId) ?? blankRecord(answer.workerId)
    weights.set(answer.assignmentId, answerReliability(record, kind, answer.selfConfidence))
  }

  /** Log-likelihood of the answers collected, assuming `hypothesis` is the truth. */
  const logLikelihood = (hypothesis: { value: boolean | number | string } | null): number => {
    let total = 0
    for (const answer of answers) {
      const p = weights.get(answer.assignmentId) ?? 0.5
      const matches = hypothesis !== null && agrees(schema, answer.value, hypothesis.value)
      total += Math.log(matches ? p : (1 - p) / (k - 1))
    }
    return total
  }

  const observed = [...groups.values()].map((group) => ({ group, logLik: logLikelihood(group) }))

  // Every answer nobody proposed carries the same likelihood, so it is computed
  // once and counted `k - observed` times. `null` stands for any such answer.
  const unobservedCount = Math.max(0, k - groups.size)
  const unobservedLogLik = unobservedCount > 0 ? logLikelihood(null) : Number.NEGATIVE_INFINITY

  // Normalise in log space; a long escalation chain otherwise underflows to zero.
  const maxLogLik = Math.max(...observed.map((o) => o.logLik), unobservedLogLik)
  let partition = 0
  for (const o of observed) partition += Math.exp(o.logLik - maxLogLik)
  if (unobservedCount > 0) partition += unobservedCount * Math.exp(unobservedLogLik - maxLogLik)

  const candidates = observed
    .map(({ group, logLik }) => ({
      value: group.value,
      confidence: Math.exp(logLik - maxLogLik) / partition,
      supporters: group.supporters as readonly string[],
    }))
    .sort((a, b) => b.confidence - a.confidence)

  const unobservedConfidence =
    unobservedCount > 0 ? (unobservedCount * Math.exp(unobservedLogLik - maxLogLik)) / partition : 0

  return { candidates, unobservedConfidence }
}

/**
 * Decides what happens next.
 *
 *
 * Called when the question arrives and again on every answer, so the entire
 * escalation policy lives in one pure function that can be tested without a chain,
 * a worker or a payment anywhere near it.
 */
export function decide(question: Question, state: EngineState): Decision {
  const target = trustTarget(question)
  const belief = believe(question, state.answers, state.records)
  const leader = belief.candidates[0]

  if (leader && leader.confidence >= target)
    return { action: 'resolve', reason: `confidence ${leader.confidence.toFixed(4)} reached target ${target.toFixed(3)}` }

  // An outstanding assignment is already paid for, so its answer is free
  // information. Wait for it rather than buying a duplicate from someone else.
  if (state.outstanding > 0 && state.remainingMs > 0)
    return { action: 'wait', reason: `${state.outstanding} answer(s) outstanding` }

  if (state.remainingMs <= MIN_ASK_WINDOW_MS)
    return state.answers.length > 0
      ? { action: 'stop', status: 'no_consensus', reason: 'deadline reached before target confidence' }
      : { action: 'stop', status: 'timeout', reason: 'deadline reached with no answer' }

  if (state.bought >= MAX_RESPONDERS)
    return {
      action: 'stop',
      status: 'no_consensus',
      reason: `${MAX_RESPONDERS} answers bought without convergence; the question is ambiguous`,
    }

  const next = selectWorker(question, state)
  if (!next)
    return state.answers.length > 0
      ? { action: 'stop', status: 'no_consensus', reason: 'no further worker available' }
      : { action: 'stop', status: 'refused', reason: 'no worker available to ask' }

  return {
    action: 'ask',
    workerId: next.worker.workerId,
    exploratory: next.exploratory,
    reason: explainAsk(state, belief, target, next.exploratory),
  }
}

/**
 * Picks the next worker: normally the most reliable one who has not already
 * answered this question, and occasionally an unproven one so the roster can grow.
 */
export function selectWorker(
  question: Pick<Question, 'kind' | 'callerConfidence'>,
  state: EngineState,
): { worker: AvailableWorker; exploratory: boolean } | null {
  const alreadyAsked = new Set(state.answers.map((a) => a.workerId))
  const eligible = state.available.filter((w) => !w.busy && !alreadyAsked.has(w.workerId))
  if (eligible.length === 0) return null

  const byReliability = [...eligible].sort(
    (a, b) => plannedReliability(b, question.kind) - plannedReliability(a, question.kind),
  )
  const best = byReliability[0]
  if (!best) return null

  // A caller that tells us it barely trusts its own reading is telling us the
  // question is hard. A hard question is the wrong place to be training somebody, so
  // it goes straight to the best worker available and exploration waits for an easier
  // one. This is where difficulty belongs — in who gets asked, not in how sure the
  // answer has to be.
  const hardQuestion = (question.callerConfidence ?? 1) < 0.5

  // Exploration only ever happens on the first answer to a question. Spending an
  // escalation step on an unproven worker would be buying the least informative
  // answer at exactly the moment we most need an informative one.
  const random = state.random ?? Math.random
  if (!hardQuestion && state.answers.length === 0 && random() < EXPLORATION_SHARE) {
    const unproven = eligible.filter((w) => established(w, question.kind) < 1)
    const pick = unproven[Math.floor(random() * unproven.length)]
    if (pick && pick.workerId !== best.workerId) return { worker: pick, exploratory: true }
  }

  return { worker: best, exploratory: false }
}

/**
 * The confidence a single answer from this worker would produce, were it the only
 * answer on the question.
 *
 * The `k - 1` hypotheses a worker did not name hold `(1 - p) / (k - 1)` of the
 * likelihood each, so together they hold exactly `1 - p` whatever `k` is. A lone
 * answer is therefore worth the worker's reliability and nothing more: breadth of
 * choice only starts paying once a second worker agrees.
 */
export function soloConfidence(record: WorkerRecord, kind: Kind): number {
  return plannedReliability(record, kind)
}

/** Whether this worker can settle this question without a second opinion. */
export function canResolveAlone(question: Question, record: WorkerRecord): boolean {
  return soloConfidence(record, question.kind) >= trustTarget(question)
}

/**
 * Which workers get paid, and how much.
 *
 * Everyone who answered is paid: the workers who turned out to be in the minority,
 * and every worker on a question that ended `no_consensus` and was refunded to the
 * caller. They did the work either way, and a system where a worker gambles the
 * time they already spent on whether the crowd happened to land where they did
 * teaches the pool to guess the popular answer rather than the true one — which
 * destroys the only mechanism that makes any of this work.
 *
 * A `no_consensus` question therefore costs us several wages and earns nothing.
 * That is priced in rather than pushed onto the workers.
 */
export function wagesFor(
  answers: readonly WorkerAnswer[],
  wageCents = WAGE_CENTS,
): readonly { workerId: string; assignmentId: string; amountCents: number }[] {
  const seen = new Set<string>()
  const result: { workerId: string; assignmentId: string; amountCents: number }[] = []
  for (const answer of answers) {
    if (seen.has(answer.workerId)) continue
    seen.add(answer.workerId)
    result.push({ workerId: answer.workerId, assignmentId: answer.assignmentId, amountCents: wageCents })
  }
  return result
}

/** How the responders lined up, for the caller's evidence block. */
export function agreementShape(
  question: Pick<Question, 'kind' | 'schema'>,
  answers: readonly WorkerAnswer[],
  records: ReadonlyMap<string, WorkerRecord>,
): Resolution['agreement'] {
  if (answers.length === 0) return 'none'
  const belief = believe(question, answers, records)
  const leader = belief.candidates[0]
  if (!leader) return 'none'
  if (belief.candidates.length === 1) return 'unanimous'
  const second = belief.candidates[1]
  if (second && leader.supporters.length === second.supporters.length) return 'split'
  return 'majority'
}

/**
 * Updates agreement history after a resolution.
 *
 * A `no_consensus` question is recorded as unresolved against everyone who
 * answered it, and counts against nobody. The worker who disagreed was right that
 * the question was ambiguous; penalising them for that would teach the pool to
 * converge on whatever answer it expects to be popular, which is precisely the
 * behaviour that would make the confidence model above a lie.
 */
export function updateRecords(
  question: Pick<Question, 'kind' | 'schema'>,
  resolved: { status: ResolutionStatus; value: boolean | number | string | null },
  answers: readonly WorkerAnswer[],
  records: ReadonlyMap<string, WorkerRecord>,
): Map<string, WorkerRecord> {
  const next = new Map(records)
  const scoreable = resolved.status === 'resolved' && resolved.value !== null
  for (const answer of answers) {
    const current = next.get(answer.workerId) ?? blankRecord(answer.workerId)
    if (!scoreable) {
      next.set(answer.workerId, score(current, question.kind, 'unresolved'))
      continue
    }
    const matched = agrees(question.schema, answer.value, resolved.value)
    next.set(answer.workerId, score(current, question.kind, matched ? 'agree' : 'disagree'))
  }
  return next
}

/** The reputation figure shown to a caller alongside a worker's answer. */
export function reportedReputation(record: WorkerRecord | undefined, kind: Kind, workerId: string): number {
  return reliability(record ?? blankRecord(workerId), kind)
}

export { blankRecord }

function explainAsk(state: EngineState, belief: Belief, target: number, exploratory: boolean): string {
  if (exploratory) return 'exploration: giving an unproven worker a chance to build history'
  if (state.answers.length === 0) return 'first answer'
  const leader = belief.candidates[0]
  if (!leader) return 'no valid answer yet'
  // Enough decimals that "below" is visible: 0.9897 against 0.990 must not print as 0.990 below 0.990.
  const places = (value: number) => (Math.abs(value - target) < 0.0005 ? 4 : 3)
  const at = `${leader.confidence.toFixed(places(leader.confidence))} below target ${target.toFixed(places(leader.confidence))}`
  if (belief.candidates.length > 1) return `answers disagree, leader at ${at}`
  const agreeing = leader.supporters.length
  return agreeing === 1 ? `one answer at ${at}, second opinion needed` : `${agreeing} agree at ${at}, another opinion needed`
}
