import {
  capabilityById,
  gradeEvidence,
  isTerminal,
  resultFromResolution,
  type Capability,
  type Escalation,
  type EscalationResult,
  type EscalationState,
  type Evidence,
  type Paymaster,
  type Question,
  type Requester,
} from '@quorum/core'
import { randomUUID } from 'node:crypto'
import type { Router } from './router.js'
import type { Store } from './store.js'

/**
 * The escalation runtime.
 *
 * This is the layer that sits above the existing marketplace rather than replacing it.
 * Underneath, a judgment escalation is still the same router, the same confidence
 * engine and the same wage payments that were already working; what this adds is a
 * durable object the external agent can hold onto, poll and cancel — because a caller
 * that is off doing its own work cannot be represented by a held socket.
 *
 * The two regimes are handled differently on purpose. A judgment escalation runs the
 * consensus engine and is usually finished before the caller has stopped waiting. A
 * field escalation is created, matched, and then sits in `assigned` for as long as it
 * takes somebody to physically do the thing, which may be an hour. Pretending those
 * are the same shape would mean either holding a socket for an hour or making the fast
 * path poll for something it already has.
 */

export type CreateEscalation = {
  capabilityId: string
  task: string
  requester: Requester
  priceCents: number
  deadlineMs: number
  location?: string
  /** For judgment capabilities: the question to put to people. */
  question?: Omit<Question, 'id' | 'priceCents' | 'timeoutMs'>
  /** Where the caller's refund goes if this cannot be fulfilled. */
  payer?: `0x${string}`
}

export class Escalations {
  readonly #store: Store
  readonly #router: Router
  readonly #paymaster: Paymaster
  readonly #records = new Map<string, Escalation>()

  constructor(services: { store: Store; router: Router; paymaster: Paymaster }) {
    this.#store = services.store
    this.#router = services.router
    this.#paymaster = services.paymaster
  }

  get(id: string): Escalation | undefined {
    return this.#records.get(id)
  }

  list(requester: { externalAgentId?: string }): readonly Escalation[] {
    const all = [...this.#records.values()]
    if (!requester.externalAgentId) return all
    return all.filter((e) => e.requester.externalAgentId === requester.externalAgentId)
  }

  /**
   * Creates an escalation and starts work on it.
   *
   * Returns as soon as the object exists. For a judgment capability the work is
   * already finishing by the time the caller reads the response, and `awaitResult`
   * lets a blocking caller wait for it; for a field capability the caller is expected
   * to go away and come back.
   */
  create(input: CreateEscalation): Escalation {
    const capability = capabilityById(input.capabilityId)
    if (!capability) throw new EscalationError(404, `unknown capability "${input.capabilityId}"`)
    if (!capability.servable)
      throw new EscalationError(
        503,
        `the capability "${capability.id}" is declared but has no workforce behind it yet, so it is not servable. Do not treat this as a transient error.`,
      )
    if (capability.requiresLocation && !input.location)
      throw new EscalationError(400, `"${capability.id}" needs a location, because somebody has to be somewhere`)

    const now = Date.now()
    const escalation: Escalation = {
      id: `esc_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
      capabilityId: capability.id,
      requester: input.requester,
      task: input.task,
      state: 'pending',
      priceCents: input.priceCents,
      createdAt: now,
      deadlineAt: now + input.deadlineMs,
      workerIds: [],
      wageReceipts: [],
      ...(input.location === undefined ? {} : { location: input.location }),
      ...(capability.evidence === undefined ? {} : { requiredEvidence: capability.evidence }),
    }
    this.#records.set(escalation.id, escalation)

    if (capability.verification === 'consensus') void this.#runJudgment(escalation, capability, input)
    else this.#update(escalation.id, { state: 'assigned' })

    return escalation
  }

  /** Waits for a terminal state, for a caller that is holding its connection. */
  async awaitResult(id: string, timeoutMs: number): Promise<Escalation> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const current = this.#records.get(id)
      if (!current) throw new EscalationError(404, 'unknown escalation')
      if (isTerminal(current.state) || Date.now() >= deadline) return current
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  /**
   * Withdraws an escalation.
   *
   * A caller whose own task was cancelled should not keep paying for a human subtask
   * of it. Workers already engaged keep their wages: they were doing the work when the
   * caller changed its mind, and that is not their problem.
   */
  async cancel(id: string, reason = 'cancelled by the requester'): Promise<Escalation> {
    const current = this.#records.get(id)
    if (!current) throw new EscalationError(404, 'unknown escalation')
    if (isTerminal(current.state)) return current

    const refunded = await this.#refund(current)
    return this.#update(id, {
      state: 'cancelled',
      reason,
      ...(refunded === undefined ? {} : { refund: refunded }),
    })
  }

  /** Submits a field worker's evidence. */
  async submitEvidence(id: string, workerId: string, evidence: Evidence): Promise<Escalation> {
    const current = this.#records.get(id)
    if (!current) throw new EscalationError(404, 'unknown escalation')
    if (isTerminal(current.state)) throw new EscalationError(409, 'this escalation is already finished')

    const required = current.requiredEvidence ?? []
    const graded = gradeEvidence(required, evidence)

    // Incomplete evidence is sent back rather than accepted at a discount. A caller
    // asked for three photographs because two would not settle the question.
    if (!graded.complete) {
      this.#update(id, { state: 'assigned' })
      throw new EscalationError(422, `evidence is incomplete: still needs ${graded.missing.join(', ')}`)
    }

    const worker = this.#store.workers.get(workerId)
    const result: EscalationResult = {
      completed: true,
      evidence,
      ...(evidence.observations === undefined ? {} : { observations: evidence.observations }),
      confidence: { value: graded.completeness, basis: 'evidence-completeness' },
      contributors: [{ workerId, reputation: 0 }],
      latencyMs: Date.now() - current.createdAt,
    }

    const receipts = [...current.wageReceipts]
    if (worker) {
      try {
        receipts.push(
          await this.#paymaster.payWorker({
            questionId: current.id,
            assignmentId: `${current.id}-field`,
            workerId,
            to: worker.address,
            amountCents: fieldWageCents(current.priceCents),
          }),
        )
        worker.earnedCents += fieldWageCents(current.priceCents)
      } catch (error) {
        console.error(`[quorum] field wage failed for ${workerId}: ${String(error)}`)
      }
    }

    return this.#update(id, {
      state: 'completed',
      result,
      workerIds: [...new Set([...current.workerIds, workerId])],
      wageReceipts: receipts,
    })
  }

  /** Runs a judgment capability through the existing consensus engine. */
  async #runJudgment(escalation: Escalation, capability: Capability, input: CreateEscalation): Promise<void> {
    if (!input.question) {
      await this.#fail(escalation.id, 'a judgment capability needs a question and an answer schema')
      return
    }

    const question: Question = {
      ...input.question,
      id: escalation.id,
      priceCents: escalation.priceCents,
      timeoutMs: Math.max(5_000, escalation.deadlineAt - Date.now()),
    }

    this.#update(escalation.id, { state: 'assigned' })

    try {
      const resolution = await this.#router.resolve(question, {
        ...(input.payer === undefined ? {} : { payer: input.payer }),
      })
      const result = resultFromResolution(resolution)

      if (resolution.status === 'resolved')
        this.#update(escalation.id, {
          state: 'completed',
          result,
          workerIds: resolution.evidence.map((e) => e.workerId),
          wageReceipts: resolution.receipts,
          ...(resolution.refund === undefined ? {} : { refund: resolution.refund }),
        })
      else
        this.#update(escalation.id, {
          state: 'failed',
          result,
          reason: reasonFor(resolution.status),
          workerIds: resolution.evidence.map((e) => e.workerId),
          wageReceipts: resolution.receipts,
          ...(resolution.refund === undefined ? {} : { refund: resolution.refund }),
        })
    } catch (error) {
      await this.#fail(escalation.id, error instanceof Error ? error.message : 'the escalation could not be run')
    }
    void capability
  }

  async #fail(id: string, reason: string): Promise<void> {
    const current = this.#records.get(id)
    if (!current || isTerminal(current.state)) return
    const refunded = await this.#refund(current)
    this.#update(id, { state: 'failed', reason, ...(refunded === undefined ? {} : { refund: refunded }) })
  }

  /** Returns the caller's money. Never throws: a failed refund must be visible, not fatal. */
  async #refund(escalation: Escalation): Promise<Escalation['refund']> {
    if (escalation.refund) return escalation.refund
    const payer = this.#payerFor(escalation)
    if (!payer) return undefined
    try {
      return await this.#paymaster.refund({
        questionId: escalation.id,
        to: payer,
        amountCents: escalation.priceCents,
      })
    } catch (error) {
      console.error(`[quorum] refund failed for ${escalation.id}: ${String(error)}`)
      return undefined
    }
  }

  #payerFor(escalation: Escalation): `0x${string}` | null {
    const payer = this.#payers.get(escalation.id)
    return payer ?? null
  }

  readonly #payers = new Map<string, `0x${string}`>()

  /** Records who paid, so a refund has somewhere to go. */
  rememberPayer(id: string, payer: `0x${string}`): void {
    this.#payers.set(id, payer)
  }

  #update(id: string, patch: Partial<Escalation> & { state: EscalationState }): Escalation {
    const current = this.#records.get(id)
    if (!current) throw new EscalationError(404, 'unknown escalation')
    // Never move out of a terminal state: a late worker submission must not reopen a
    // question the caller has already been told about and refunded for.
    if (isTerminal(current.state) && current.state !== patch.state) return current
    const next: Escalation = { ...current, ...patch }
    this.#records.set(id, next)
    return next
  }
}

/**
 * What a field worker earns.
 *
 * A far larger share of the price than a judgment answer takes, because the cost
 * structure is inverted: a site visit is mostly the worker's time and travel, and the
 * platform is doing proportionally less. Taking a judgment-sized margin on it would be
 * charging a coordination fee for coordination that did not happen.
 */
export function fieldWageCents(priceCents: number): number {
  return Math.floor(priceCents * 0.8)
}

function reasonFor(status: string): string {
  if (status === 'no_consensus')
    return 'People looked and disagreed, so the question is genuinely ambiguous rather than merely hard. You have been refunded.'
  if (status === 'timeout') return 'Nobody answered within the deadline. You have been refunded.'
  return 'The escalation could not be served. You have been refunded.'
}

export class EscalationError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message)
    this.name = 'EscalationError'
  }
}
