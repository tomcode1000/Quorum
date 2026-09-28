/**
 * TIP-20 payment memos.
 *
 * Every wage payment carries the id of the question it paid for, written into the
 * transfer itself. That one detail is what makes a worker's history portable: the
 * chain, not Quorum, holds the record that this address answered this question and
 * was paid this amount at this time. If we shut down tomorrow, or closed a worker's
 * account the day before a pay day the way Remotasks did, the worker still holds
 * every receipt and can prove the work to anyone.
 *
 * It is also why reputation can be described as derived rather than stored. The
 * inputs are all on chain, so the model can be rebuilt after a bug, and a worker
 * can check our arithmetic without our cooperation.
 *
 * The memo is a fixed 32 bytes so it fits the transfer's memo field directly, and
 * it is a hash rather than the raw id because question ids are correlated with the
 * caller's own task references, which can carry customer identifiers we have no
 * business publishing on a public chain. Anyone who already knows the id can still
 * verify their own receipts by recomputing the hash.
 */
import { createHash } from 'node:crypto'

/** Namespace prefix, so a Quorum memo cannot be confused with another protocol's. */
export const MEMO_NAMESPACE = 'quorum.v1'

/** Encodes a wage payment: which question, and which answer within it. */
export function wageMemo(questionId: string, assignmentId: string): `0x${string}` {
  return hash(`wage:${questionId}:${assignmentId}`)
}

/** Encodes a refund to a caller whose question could not be resolved. */
export function refundMemo(questionId: string): `0x${string}` {
  return hash(`refund:${questionId}`)
}

/**
 * Checks whether a memo belongs to a given payment.
 *
 * Verification rather than decoding is the point: the memo does not leak the
 * question id to an observer, but anyone who already knows it can confirm the
 * payment was for that work.
 */
export function memoMatches(memo: string, expected: `0x${string}`): boolean {
  return memo.toLowerCase() === expected.toLowerCase()
}

function hash(input: string): `0x${string}` {
  return `0x${createHash('sha256').update(`${MEMO_NAMESPACE}:${input}`).digest('hex')}`
}
