import type { Capability, EvidenceRequirement } from './capability.js'
import type { PayoutReceipt, RefundReceipt, Resolution } from './types.js'

/**
 * Escalations.
 *
 * An escalation is a human subtask of somebody else's work. That framing is the whole
 * point of this file, and it is why the identifiers below are not optional bookkeeping.
 *
 * The agent that calls us is external. It belongs to another marketplace, another
 * framework, another company; it was already executing a task of its own when it hit
 * something it could not do. We are one tool among its tools. So every escalation has
 * to carry enough of the caller's own context to answer, later and from the outside,
 * three questions: which agent asked, which of *its* tasks was blocked, and where the
 * answer had to go. Without that the record is a pile of anonymous piecework, and the
 * caller cannot reconcile what it paid for.
 *
 * The lifecycle exists because not every capability fits in a request. A judgment
 * escalation resolves inside the caller's blocking call and its status is a formality.
 * A field escalation takes an hour, so the caller creates it, goes back to its own
 * work, and collects the result later — which needs a real object with a real state
 * machine rather than a held socket.
 */

export type EscalationState =
  /** Created and paid for; nobody has been matched yet. */
  | 'pending'
  /** A worker has it. */
  | 'assigned'
  /** The worker has submitted; we are checking it against what was required. */
  | 'submitted'
  /** Done. `result` is populated. */
  | 'completed'
  /** Could not be fulfilled. The caller has been refunded. */
  | 'failed'
  /** The caller withdrew it before completion. */
  | 'cancelled'

/** Terminal states, after which nothing changes. */
export const TERMINAL_STATES: readonly EscalationState[] = ['completed', 'failed', 'cancelled']

export function isTerminal(state: EscalationState): boolean {
  return TERMINAL_STATES.includes(state)
}

/**
 * Who asked, and what for.
 *
 * All three identifiers come from the caller and none are interpreted by us. They are
 * stored, echoed back on every status read, and carried into the payment record, so
 * the caller can reconcile our receipt against its own task history without asking us
 * for anything.
 */
export type Requester = {
  /** The external agent. Its own id, in its own namespace. */
  readonly externalAgentId?: string
  /** The task of theirs that is blocked. For A2A callers this is the paused task id. */
  readonly externalTaskId?: string
  /** Where to deliver the result if the caller is not holding a connection. */
  readonly callbackUrl?: string
}

/** What a field worker submitted. */
export type Evidence = {
  readonly photos?: readonly { url: string; caption?: string | undefined }[] | undefined
  readonly location?: { readonly lat: number; readonly lon: number; readonly label?: string | undefined } | undefined
  readonly capturedAt?: string | undefined
  readonly observations?: readonly string[] | undefined
  readonly documents?: readonly { url: string; caption?: string | undefined }[] | undefined
}

/**
 * The result handed back to the external agent.
 *
 * Structured rather than prose, because the caller is a program that has to keep
 * reasoning. "The building looks fine" is not something an agent can act on; a list of
 * observations with photographs, a location and a timestamp is.
 *
 * `confidence` means different things per regime and says which it is, rather than
 * presenting two incomparable numbers as one. Under consensus it is a posterior
 * probability. Under evidence it is the share of what was required that actually
 * arrived — a completeness measure, not a probability, and labelled so nobody
 * thresholds on it as though it were one.
 */
export type EscalationResult = {
  readonly completed: boolean
  /** The answer, for judgment capabilities. */
  readonly answer?: boolean | number | string
  readonly evidence?: Evidence
  readonly observations?: readonly string[]
  readonly confidence: { readonly value: number; readonly basis: 'consensus-posterior' | 'evidence-completeness' }
  /** Anything the worker flagged that the caller did not ask about. */
  readonly issues?: readonly string[]
  /** Who contributed, and what their standing was. */
  readonly contributors: readonly { workerId: string; reputation: number }[]
  readonly latencyMs: number
}

export type Escalation = {
  readonly id: string
  readonly capabilityId: string
  readonly requester: Requester
  /** What the caller asked for, in their words. */
  readonly task: string
  readonly state: EscalationState
  /** Price agreed, in cents. */
  readonly priceCents: number
  readonly createdAt: number
  readonly deadlineAt: number
  /** Workers who have held this escalation. */
  readonly workerIds: readonly string[]
  readonly result?: EscalationResult
  /** Why it failed or was cancelled, in plain words for the caller. */
  readonly reason?: string
  readonly wageReceipts: readonly PayoutReceipt[]
  readonly refund?: RefundReceipt
  /** Location, for capabilities that need somebody to be somewhere. */
  readonly location?: string
  readonly requiredEvidence?: readonly EvidenceRequirement[]
}

/** The caller-facing view. Field names are snake_case: this crosses a wire to a program. */
export function presentEscalation(escalation: Escalation): Record<string, unknown> {
  return {
    escalation_id: escalation.id,
    capability: escalation.capabilityId,
    state: escalation.state,
    task: escalation.task,
    price_cents: escalation.priceCents,
    created_at: new Date(escalation.createdAt).toISOString(),
    deadline_at: new Date(escalation.deadlineAt).toISOString(),
    // Echoed back so the caller can match this to its own task without asking us.
    external_agent_id: escalation.requester.externalAgentId ?? null,
    external_task_id: escalation.requester.externalTaskId ?? null,
    humans_engaged: escalation.workerIds.length,
    ...(escalation.location === undefined ? {} : { location: escalation.location }),
    ...(escalation.reason === undefined ? {} : { reason: escalation.reason }),
    ...(escalation.result === undefined
      ? {}
      : {
          result: {
            completed: escalation.result.completed,
            ...(escalation.result.answer === undefined ? {} : { answer: escalation.result.answer }),
            ...(escalation.result.evidence === undefined ? {} : { evidence: escalation.result.evidence }),
            ...(escalation.result.observations === undefined ? {} : { observations: escalation.result.observations }),
            confidence: escalation.result.confidence.value,
            confidence_basis: escalation.result.confidence.basis,
            ...(escalation.result.issues === undefined ? {} : { issues: escalation.result.issues }),
            contributors: escalation.result.contributors,
            latency_ms: escalation.result.latencyMs,
          },
        }),
    receipts: escalation.wageReceipts.map((r) => ({ tx: r.txHash, amount_cents: r.amountCents, memo: r.memo })),
    ...(escalation.refund === undefined ? {} : { refunded: { tx: escalation.refund.txHash, amount_cents: escalation.refund.amountCents } }),
  }
}

/**
 * Turns a judgment resolution into an escalation result.
 *
 * The bridge between the existing consensus engine and the escalation surface, so a
 * judgment capability and a field capability return the same shape to the caller even
 * though almost nothing about how they were produced is the same.
 */
export function resultFromResolution(resolution: Resolution): EscalationResult {
  return {
    completed: resolution.status === 'resolved',
    ...(resolution.value === null ? {} : { answer: resolution.value }),
    confidence: { value: resolution.confidence, basis: 'consensus-posterior' },
    contributors: resolution.evidence.map((e) => ({ workerId: e.workerId, reputation: e.reputation })),
    latencyMs: resolution.latencyMs,
  }
}

/**
 * Scores submitted evidence against what was required.
 *
 * Under the evidence regime this replaces agreement entirely, so it is the only thing
 * standing between a caller and a worker who went nowhere and typed something
 * plausible. It is weaker than consensus and should be described as weaker: it checks
 * that the required artefacts exist and are internally consistent, not that they are
 * honest. Photograph provenance and location attestation are the real answer and are
 * not built.
 */
export function gradeEvidence(
  required: readonly EvidenceRequirement[],
  submitted: Evidence,
): { complete: boolean; completeness: number; missing: string[] } {
  const missing: string[] = []

  for (const requirement of required) {
    switch (requirement.type) {
      case 'photos': {
        const count = submitted.photos?.length ?? 0
        if (count < requirement.count) missing.push(`${requirement.count - count} more photograph(s)`)
        break
      }
      case 'location':
        if (!submitted.location) missing.push('a location')
        break
      case 'timestamp':
        if (!submitted.capturedAt) missing.push('a capture timestamp')
        break
      case 'observations': {
        const count = submitted.observations?.filter((o) => o.trim().length > 0).length ?? 0
        if (count < requirement.minimum) missing.push(`${requirement.minimum - count} more observation(s)`)
        break
      }
      case 'document':
        if ((submitted.documents?.length ?? 0) === 0) missing.push('a document')
        break
    }
  }

  const completeness = required.length === 0 ? 1 : (required.length - missing.length) / required.length
  return { complete: missing.length === 0, completeness: Math.max(0, completeness), missing }
}
