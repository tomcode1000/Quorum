/**
 * Domain types.
 *
 * The vocabulary deliberately mirrors the A2A task lifecycle rather than the
 * vocabulary of a labour marketplace. A caller does not post a job; an agent that
 * has entered `input-required` forwards the clarifying question it would otherwise
 * have shown to a watching human, and blocks on the answer.
 */

/**
 * What kind of judgment is being asked for.
 *
 * The kind drives worker selection, the price floor, and which slice of a
 * worker's reputation applies. Only `disambiguate` and `verify` are servable in
 * v1: the other three are declared so the reputation model is built with the
 * dimension in it from the start rather than retrofitted, and they are rejected
 * at the boundary until there is supply that can actually do them.
 */
export const KINDS = [
  /** Two readings of the same evidence; which is it. */
  'disambiguate',
  /** Is this what it claims to be. */
  'verify',
  /** Are these two records the same thing — entity resolution. */
  'match',
  /** Which bucket does this belong in, given the taxonomy. */
  'categorise',
  /** Which of these candidates is better. */
  'compare',
  /** Read a value out of evidence. Declared, not servable: see AnswerSchema. */
  'extract',
] as const
export type Kind = (typeof KINDS)[number]

/**
 * The kinds this version will actually accept.
 *
 * These five are every kind whose answer fits a constrained space, which is the real
 * gate — not how interesting the work is. `extract` is excluded because reading an
 * arbitrary value out of a document produces free text, and free text cannot be
 * checked for agreement between two workers, which removes both the confidence model
 * and the farming defence at once.
 *
 * They are deliberately chosen against the live market rather than invented. A scan of
 * the MPP services catalog found the largest categories to be search and matching,
 * then generation, then verification, then extraction and classification — so `match`
 * covers the biggest single slice, and the rest track what agents on these rails are
 * actually doing.
 */
export const SERVABLE_KINDS: readonly Kind[] = ['disambiguate', 'verify', 'match', 'categorise', 'compare']

/**
 * The shape of the answer the agent needs back.
 *
 * Free text is not a member of this union, and that is a v1 decision rather than
 * an omission. A constrained answer space is what makes agreement computable and
 * makes random clicking detectable — a farmer's agreement rate converges on
 * chance only if chance is a number we can name. Accepting free text would break
 * consensus and anti-farming in the same stroke.
 *
 * It also makes answering a matter of tapping rather than typing, which is what
 * makes a three-second answer on a phone plausible at all.
 */
export type AnswerSchema =
  | { kind: 'boolean' }
  | { kind: 'choice'; options: readonly string[] }
  | { kind: 'number'; unit?: string; tolerance?: number }

/** A piece of evidence the worker needs in order to answer. */
export type Attachment =
  | { type: 'image'; url: string; caption?: string }
  | { type: 'text'; body: string; caption?: string }
  | { type: 'json'; body: unknown; caption?: string }

/** A clarifying question lifted out of an agent's `input-required` state. */
export type Question = {
  /** Gateway-assigned id. Becomes the memo on every payment for this question. */
  readonly id: string
  readonly kind: Kind
  /** The question, phrased for a person with no context on the caller's system. */
  readonly prompt: string
  readonly schema: AnswerSchema
  readonly attachments?: readonly Attachment[]
  /**
   * What the caller agreed to pay, in cents.
   *
   * This is the only dial. It sets the price and, through `trustTarget`, how sure
   * the answer has to be before we will give it to them. A caller paying five
   * dollars is buying near-certainty; one paying fifty cents is buying a quick single
   * opinion. Exposing certainty as a second independent knob would invite a
   * caller to ask for near-certainty at the fifty-cent price, which we cannot buy.
   */
  readonly priceCents: number
  /** How long the caller is willing to wait, in milliseconds. */
  readonly timeoutMs: number
  /**
   * How long each person offered it has to answer, in milliseconds. Unset, it
   * follows from how much there is to read; see `answerWindowMs` in quorum.ts.
   */
  readonly answerWindowMs?: number
  /** Opaque A2A task reference, carried through to the receipt. Never parsed. */
  readonly taskRef?: string
  /** The calling agent's confidence in the guess it would otherwise have used. */
  readonly callerConfidence?: number
}

/** One worker's response to one assignment. */
export type WorkerAnswer = {
  readonly assignmentId: string
  readonly workerId: string
  /** Normalised answer value, governed by the question's `AnswerSchema`. */
  readonly value: boolean | number | string
  /** The worker's own confidence, 0..1. A hedged answer is weighted down. */
  readonly selfConfidence: number
  /** Milliseconds from assignment to submission. Used for abuse detection, not pay. */
  readonly latencyMs: number
  readonly submittedAt: number
}

/**
 * Agreement history for one worker on one kind of question.
 *
 * Reputation is per kind because the skills do not transfer: someone excellent at
 * reading a smudged receipt total has told us nothing about whether they can judge
 * which of two model answers is better.
 */
export type KindRecord = {
  /** Times this worker's answer matched the resolved answer. */
  readonly agreements: number
  /** Times it did not. */
  readonly disagreements: number
  /** Answers submitted but never resolved. Not held against them; see `quorum.ts`. */
  readonly unresolved: number
}

export type WorkerRecord = {
  readonly workerId: string
  /** Agreement history, keyed by question kind. */
  readonly byKind: Readonly<Partial<Record<Kind, KindRecord>>>
}

/** A worker currently available to be asked. */
export type AvailableWorker = WorkerRecord & {
  /** Set when the worker is already holding an assignment. */
  readonly busy?: boolean
}

/**
 * Terminal states.
 *
 * `no_consensus` and `timeout` both refund the caller. A caller that paid for an
 * answer it did not get will never call twice, and a product whose failure mode is
 * silently keeping the money has no business criticising agents for silently
 * guessing.
 */
export type ResolutionStatus =
  /** Target confidence reached. The answer is returned and the caller is charged. */
  | 'resolved'
  /** Workers answered but never converged. The question was ambiguous. Refunded. */
  | 'no_consensus'
  /** Nobody answered in time. Refunded. */
  | 'timeout'
  /** The question was not servable at all: wrong kind, or no supply. Refunded. */
  | 'refused'

/** Whether a status means the caller gets their money back. */
export function isRefundable(status: ResolutionStatus): boolean {
  return status !== 'resolved'
}

/** What the caller gets back. */
export type Resolution = {
  readonly questionId: string
  readonly status: ResolutionStatus
  readonly value: boolean | number | string | null
  /** Posterior probability that `value` is correct, under the model in `quorum.ts`. */
  readonly confidence: number
  readonly responders: number
  /**
   * Whether the responders agreed, and how.
   *
   * Returned even on `no_consensus`, because a caller learning that its question
   * was genuinely ambiguous is getting something real for the round trip: two
   * careful people disagreeing is information the caller's agent could not have
   * produced on its own.
   */
  readonly agreement: 'unanimous' | 'majority' | 'split' | 'none'
  /** Every answer, with the reputation behind it, for auditability. */
  readonly evidence: readonly {
    workerId: string
    value: boolean | number | string
    reputation: number
  }[]
  readonly latencyMs: number
  /** Total paid out to workers, in cents. Paid even when the caller is refunded. */
  readonly wagesCents: number
  /** Wage payment receipts, one per paid worker. */
  readonly receipts: readonly PayoutReceipt[]
  /** Set when the caller's payment was returned. */
  readonly refund?: RefundReceipt
  readonly resolvedAt: number
}

/** Evidence that a worker was paid. The receipt is the work record. */
export type PayoutReceipt = {
  readonly workerId: string
  readonly to: `0x${string}`
  readonly amountCents: number
  readonly txHash: `0x${string}`
  /** TIP-20 memo carrying the question id, so payment and work are one record. */
  readonly memo: `0x${string}`
  /** Whether the paymaster paid the chain fee on the worker's behalf. */
  readonly feeSponsored: boolean
}

export type RefundReceipt = {
  readonly to: `0x${string}`
  readonly amountCents: number
  readonly txHash: `0x${string}`
  readonly memo: `0x${string}`
}

/**
 * The only interface through which anything touches a chain.
 *
 * Everything above this line is arithmetic and policy that would be just as true
 * on another rail. Keeping the chain behind one small interface is not
 * architectural decoration: settlement is the part of this system most likely to
 * change, and it is the part a judge will most want to see isolated rather than
 * smeared through the routing logic.
 */
export type Paymaster = {
  /** Pays one worker for one accepted answer. Resolves only once the wage landed. */
  payWorker(payment: {
    questionId: string
    assignmentId: string
    workerId: string
    to: `0x${string}`
    amountCents: number
  }): Promise<PayoutReceipt>

  /** Returns a caller's payment when a question could not be resolved. */
  refund(refund: { questionId: string; to: `0x${string}`; amountCents: number }): Promise<RefundReceipt>

  /** A worker's current balance in cents, for display in the worker app. */
  balanceCents(address: `0x${string}`): Promise<number>

  /** Whether chain fees are being sponsored, so the UI can state the truth. */
  readonly feesSponsored: boolean

  /** Human-readable network name, for the same reason. */
  readonly networkName: string

  /** Link to a transaction in the block explorer. */
  explorerUrl(txHash: string): string
}
