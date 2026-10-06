import {
  WAGE_CENTS,
  agreementShape,
  believe,
  decide,
  gradeGolden,
  isValidAnswer,
  latencySuspicion,
  rateLimited,
  recordAnswerTime,
  reportedReputation,
  score,
  shouldSeedGolden,
  tooFastToBeReal,
  updateRecords,
  wagesFor,
} from '@quorum/core'
import type { AvailableWorker, Paymaster, PayoutReceipt, Question, Resolution, WorkerAnswer } from '@quorum/core'
import { randomUUID } from 'node:crypto'
import type { Assignment, LiveQuestion, Store } from './store.js'

/**
 * The router.
 *
 * This is the loop that makes `input-required` resolvable. An agent hands over the
 * question it was going to show a human; we hold its connection open, buy answers
 * one at a time until the engine is confident, pay the workers, and return the
 * answer so the paused task can resume. The whole exchange is measured in seconds,
 * which is the property none of the prior art has — batch annotation and on-chain
 * escalation games both resolve in hours to days, and an agent mid-execution cannot
 * wait that long, so it guesses.
 *
 * Three rules are stated here because they are easy to get wrong under deadline
 * pressure and expensive to get wrong in production:
 *
 *   - Workers are paid before the caller is answered. If the caller were answered
 *     first and a wage then failed, we would have taken the caller's money and kept
 *     the worker's, which is the behaviour this whole thing exists to replace.
 *   - A question that did not resolve refunds the caller and still pays the
 *     workers. The loss is ours.
 *   - A question that did not resolve says so. It never returns a plausible answer
 *     with a confident number attached, because a wrong result that nothing flags
 *     is the exact failure mode being sold against.
 */

export type RouterOptions = {
  store: Store
  paymaster: Paymaster
  wageCents?: number
  /** How long a worker has to answer before the assignment is withdrawn. */
  assignmentTtlMs?: number
  onEvent?: (event: RouterEvent) => void
  /** Injectable randomness, so golden seeding and exploration are testable. */
  random?: () => number
}

export type RouterEvent =
  | {
      type: 'question.received'
      questionId: string
      prompt: string
      priceCents: number
      kind: Question['kind']
      /** Set when the question is held for people to arrive: when it closes. */
      heldUntil?: number
    }
  | {
      type: 'worker.asked'
      questionId: string
      workerId: string
      assignmentId: string
      exploratory: boolean
      /** A known-answer check rather than the caller's question. Never shown to the worker. */
      calibration: boolean
      reason: string
    }
  | { type: 'calibration.answered'; questionId: string; workerId: string; correct: boolean }
  | { type: 'answer.received'; questionId: string; workerId: string; value: unknown; confidence: number }
  | { type: 'worker.paid'; questionId: string; workerId: string; amountCents: number; txHash: string }
  | { type: 'caller.refunded'; questionId: string; amountCents: number; txHash: string }
  | { type: 'question.settled'; questionId: string; status: Resolution['status']; confidence: number; wagesCents: number }

export class Router {
  readonly #store: Store
  readonly #paymaster: Paymaster
  readonly #wageCents: number
  readonly #assignmentTtlMs: number
  readonly #onEvent: (event: RouterEvent) => void
  readonly #random: () => number

  /** Workers parked in `takeAssignment`, keyed by worker id. */
  readonly #waiting = new Map<string, (assignment: Assignment) => void>()

  constructor(options: RouterOptions) {
    this.#store = options.store
    this.#paymaster = options.paymaster
    this.#wageCents = options.wageCents ?? WAGE_CENTS
    // A minute to read and answer once offered. Long enough for somebody who has
    // just arrived from an email to read carefully; a worker who has wandered off
    // still frees the question for someone else well within most deadlines.
    this.#assignmentTtlMs = options.assignmentTtlMs ?? 60_000
    this.#onEvent = options.onEvent ?? (() => {})
    this.#random = options.random ?? Math.random
  }

  /**
   * Resolves one question, settling when an answer clears the bar or the deadline
   * or responder cap is reached. This is what a caller's request awaits.
   */
  async resolve(question: Question, options: { payer?: `0x${string}`; callbackUrl?: string; hold?: boolean } = {}): Promise<Resolution> {
    const startedAt = Date.now()
    let finish: (resolution: Resolution) => void = () => {}
    const settled = new Promise<Resolution>((settle) => {
      finish = settle
    })

    const live: LiveQuestion = {
      question,
      startedAt,
      deadlineAt: startedAt + question.timeoutMs,
      payer: options.payer ?? null,
      // A caller that is not holding a connection can wait for people to come back.
      hold: options.hold ?? options.callbackUrl !== undefined,
      answers: [],
      calibrations: [],
      assignments: [],
      lapsed: [],
      bought: 0,
      settled,
      finish,
      ...(options.callbackUrl === undefined ? {} : { callbackUrl: options.callbackUrl }),
    }
    this.#store.live.set(question.id, live)
    this.#onEvent({
      type: 'question.received',
      questionId: question.id,
      prompt: question.prompt,
      priceCents: question.priceCents,
      kind: question.kind,
      ...(live.hold ? { heldUntil: live.deadlineAt } : {}),
    })

    // The deadline is enforced here rather than trusted to the worker side, so the
    // caller's timeout is honoured even if every worker goes silent at once.
    const deadline = setTimeout(
      () => void this.#settle(live, live.answers.length > 0 ? 'no_consensus' : 'timeout'),
      question.timeoutMs,
    )
    try {
      this.#step(live)
      return await settled
    } finally {
      clearTimeout(deadline)
      this.#store.live.delete(question.id)
    }
  }

  /**
   * Advances a question by one engine decision.
   *
   * `decide` is the only place the escalation policy lives; anything this method did
   * beyond carrying out a decision would be a second, competing policy.
   */
  #step(live: LiveQuestion): void {
    if (this.#store.live.get(live.question.id) !== live) return

    const answered = new Set(live.answers.map((a) => a.assignmentId))
    const outstanding = live.assignments.filter((a) => a.expiresAt > Date.now() && !answered.has(a.assignmentId)).length

    const available: AvailableWorker[] = this.#store
      .availableWorkers(live.question.kind)
      .filter((worker) => !rateLimited(worker.rate))
      .map((worker) => ({ ...worker.record, ...(worker.busyWith === null ? {} : { busy: true }) }))

    const decision = decide(live.question, {
      answers: live.answers,
      records: this.#store.records(),
      available,
      outstanding,
      bought: live.bought,
      remainingMs: live.deadlineAt - Date.now(),
      random: this.#random,
      hold: live.hold,
    })

    switch (decision.action) {
      case 'ask':
        this.#offer(live, decision.workerId, decision.exploratory, decision.reason)
        return
      case 'wait':
        return
      case 'resolve':
        void this.#settle(live, 'resolved')
        return
      case 'stop':
        void this.#settle(live, decision.status)
        return
    }
  }

  /** Hands a question to a worker and commits the wage that answering it earns. */
  #offer(live: LiveQuestion, workerId: string, exploratory: boolean, reason: string): void {
    const worker = this.#store.workers.get(workerId)
    if (!worker || worker.busyWith !== null) return

    // Some assignments are known-answer questions, seeded to calibrate reputation
    // against truth rather than only against what other workers said. They look
    // identical to the worker and are paid identically, because a check a worker can
    // detect is a check they can pass selectively.
    // Any check of the right kind, not always the first: a worker who is only ever
    // shown one known-answer question per kind would learn it by heart.
    const checks = this.#store.golden.filter((g) => g.kind === live.question.kind)
    const golden = shouldSeedGolden(this.#random) ? checks[Math.floor(this.#random() * checks.length)] : undefined

    const assignment: Assignment = {
      assignmentId: randomUUID(),
      questionId: live.question.id,
      workerId,
      offeredAt: Date.now(),
      // Never hold a worker past the caller's own deadline.
      expiresAt: Math.min(Date.now() + this.#assignmentTtlMs, live.deadlineAt),
      ...(golden === undefined ? {} : { golden }),
    }
    live.assignments.push(assignment)
    worker.busyWith = assignment.assignmentId

    // A golden assignment does not count against the caller's responder budget:
    // they are not paying for our calibration.
    if (!golden) live.bought += 1

    this.#onEvent({
      type: 'worker.asked',
      questionId: live.question.id,
      workerId,
      assignmentId: assignment.assignmentId,
      exploratory,
      calibration: golden !== undefined,
      reason: golden === undefined ? reason : 'known-answer check, calibrating reputation against the truth',
    })

    const waiter = this.#waiting.get(workerId)
    if (waiter) {
      this.#waiting.delete(workerId)
      waiter(assignment)
    }

    // If the worker lets it lapse, release them and let the engine decide again:
    // the deadline may still allow somebody else to be asked.
    const timer = setTimeout(
      () => {
        if (worker.busyWith !== assignment.assignmentId) return
        worker.busyWith = null
        live.assignments = live.assignments.filter((a) => a.assignmentId !== assignment.assignmentId)
        live.lapsed.push(assignment)
        if (!golden) live.bought = Math.max(0, live.bought - 1)
        this.#step(live)
      },
      Math.max(0, assignment.expiresAt - Date.now()),
    )
    timer.unref?.()
  }

  /**
   * Parks a worker until they are offered a question, or `timeoutMs` passes.
   *
   * A long poll rather than a socket, because the worker app runs on a phone on an
   * unreliable connection and a dropped connection must cost a worker nothing more
   * than one reconnect.
   */
  takeAssignment(workerId: string, timeoutMs: number): Promise<Assignment | null> {
    const worker = this.#store.workers.get(workerId)
    if (!worker) return Promise.resolve(null)
    worker.lastSeenAt = Date.now()

    // A worker who reconnects mid-assignment gets the same question back rather
    // than losing work they were already asked to do.
    if (worker.busyWith !== null) {
      const held = this.#store.findAssignment(worker.busyWith)
      if (held) return Promise.resolve(held.assignment)
      worker.busyWith = null
    }

    if (rateLimited(worker.rate)) return Promise.resolve(null)

    // Becoming visible may be exactly what an in-flight question was waiting for.
    for (const live of [...this.#store.live.values()]) {
      this.#step(live)
      if (worker.busyWith !== null) {
        const offered = this.#store.findAssignment(worker.busyWith)
        if (offered) return Promise.resolve(offered.assignment)
      }
    }

    return new Promise<Assignment | null>((settle) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(workerId)
        settle(null)
      }, timeoutMs)
      timer.unref?.()
      this.#waiting.set(workerId, (assignment) => {
        clearTimeout(timer)
        settle(assignment)
      })
    })
  }

  /** Records a worker's answer and lets the engine decide what happens next. */
  submitAnswer(input: {
    assignmentId: string
    workerId: string
    value: boolean | number | string
    selfConfidence: number
  }): { accepted: boolean; reason?: string } {
    const worker = this.#store.workers.get(input.workerId)
    if (!worker) return { accepted: false, reason: 'unknown worker' }

    const found = this.#store.findAssignment(input.assignmentId) ?? this.#readmit(input.assignmentId, input.workerId)
    // The question finished, or the assignment lapsed, while the worker was reading.
    if (!found) return { accepted: false, reason: 'that assignment is no longer open' }

    const { live, assignment } = found
    if (assignment.workerId !== input.workerId) return { accepted: false, reason: 'assignment belongs to another worker' }
    if (live.answers.some((a) => a.assignmentId === input.assignmentId)) return { accepted: false, reason: 'already answered' }

    const schema = assignment.golden?.schema ?? live.question.schema
    if (!isValidAnswer(schema, input.value)) return { accepted: false, reason: 'that answer does not fit the question' }

    const latencyMs = Date.now() - assignment.offeredAt
    worker.busyWith = null
    worker.rate = recordAnswerTime(worker.rate)
    worker.answerCount += 1
    const shown = assignment.golden ?? live.question
    if (tooFastToBeReal(shown, { latencyMs })) worker.tooFastCount += 1

    // A golden answer is graded against the truth and never reaches the caller: it
    // calibrates reputation directly, which is the only signal that survives a pool
    // being careless all at once.
    if (assignment.golden) {
      const outcome = gradeGolden(assignment.golden, input.value)
      worker.record = score(worker.record, assignment.golden.kind, outcome)
      live.assignments = live.assignments.filter((a) => a.assignmentId !== assignment.assignmentId)
      // Paid like real work, at settlement. The worker could not tell it apart from
      // real work, so it was real work to them.
      live.calibrations.push({
        workerId: input.workerId,
        assignmentId: input.assignmentId,
        prompt: assignment.golden.prompt,
        kind: assignment.golden.kind,
      })
      this.#onEvent({
        type: 'calibration.answered',
        questionId: live.question.id,
        workerId: input.workerId,
        correct: outcome === 'agree',
      })
      void this.#store.save()
      this.#step(live)
      return { accepted: true }
    }

    const answer: WorkerAnswer = {
      assignmentId: input.assignmentId,
      workerId: input.workerId,
      value: input.value,
      selfConfidence: input.selfConfidence,
      latencyMs,
      submittedAt: Date.now(),
    }
    live.answers.push(answer)

    const belief = believe(live.question, live.answers, this.#store.records())
    this.#onEvent({
      type: 'answer.received',
      questionId: live.question.id,
      workerId: input.workerId,
      value: input.value,
      confidence: belief.candidates[0]?.confidence ?? 0,
    })

    this.#step(live)
    return { accepted: true }
  }

  /** How suspicious a worker's answer latencies look. A routing input, never a penalty. */
  suspicion(workerId: string): number {
    const worker = this.#store.workers.get(workerId)
    if (!worker) return 0
    return latencySuspicion(worker.tooFastCount, worker.answerCount)
  }

  /**
   * Finishes a question: pays the workers, refunds the caller if it did not resolve,
   * updates reputation, and answers the caller. Runs at most once per question.
   *
   * The terminal status is passed in rather than recomputed here. Re-deriving it
   * would mean evaluating the policy a second time against a state that no longer
   * exists — with the deadline forced to zero and the worker pool emptied — and that
   * second evaluation quietly reported every failure as a timeout, including
   * questions refused because nobody was online. The caller deserves the actual
   * reason, and `decide` remains the only place the policy is evaluated.
   */
  async #settle(live: LiveQuestion, status: Resolution['status']): Promise<void> {
    if (this.#store.live.get(live.question.id) !== live) return
    this.#store.live.delete(live.question.id)

    for (const assignment of live.assignments) {
      const worker = this.#store.workers.get(assignment.workerId)
      if (worker?.busyWith === assignment.assignmentId) worker.busyWith = null
    }

    const records = this.#store.records()
    const belief = believe(live.question, live.answers, records)
    const leader = belief.candidates[0]

    // Pay first. A worker's wage is not contingent on the caller's connection
    // surviving, and not contingent on the crowd having agreed with them.
    // Known-answer checks are paid in the same batch. Each is recorded under the prompt
    // the worker actually saw, so their own history cannot later reveal which of their
    // assignments were checks.
    const [{ receipts }] = await Promise.all([
      this.#payOut(
        live,
        wagesFor(live.answers, this.#wageCents).map((entry) => ({
          ...entry,
          label: live.question.prompt,
          kind: live.question.kind,
        })),
      ),
      this.#payOut(
        live,
        live.calibrations.map((entry) => ({
          workerId: entry.workerId,
          assignmentId: entry.assignmentId,
          amountCents: this.#wageCents,
          label: entry.prompt,
          kind: entry.kind,
        })),
      ),
    ])

    // Then refund the caller if they did not get what they paid for.
    let refund: Resolution['refund']
    if (status !== 'resolved' && live.payer) {
      try {
        const sent = await this.#paymaster.refund({
          questionId: live.question.id,
          to: live.payer,
          amountCents: live.question.priceCents,
        })
        refund = sent
        this.#onEvent({
          type: 'caller.refunded',
          questionId: live.question.id,
          amountCents: sent.amountCents,
          txHash: sent.txHash,
        })
      } catch (error) {
        console.error(`[quorum] refund failed for ${live.question.id}: ${String(error)}`)
      }
    }

    const resolution: Resolution = {
      questionId: live.question.id,
      status,
      value: status === 'resolved' ? (leader?.value ?? null) : null,
      confidence: leader?.confidence ?? 0,
      responders: live.answers.length,
      agreement: agreementShape(live.question, live.answers, records),
      evidence: live.answers.map((a) => ({
        workerId: a.workerId,
        value: a.value,
        reputation: reportedReputation(records.get(a.workerId), live.question.kind, a.workerId),
      })),
      latencyMs: Date.now() - live.startedAt,
      wagesCents: receipts.reduce((sum, r) => sum + r.amountCents, 0),
      receipts,
      ...(refund === undefined ? {} : { refund }),
      resolvedAt: Date.now(),
    }

    const updated = updateRecords(live.question, resolution, live.answers, records)
    for (const [workerId, record] of updated) {
      const worker = this.#store.workers.get(workerId)
      if (worker) worker.record = record
    }
    void this.#store.save()

    this.#store.recent.set(resolution.questionId, resolution)
    this.#store.settledQuestions.set(resolution.questionId, {
      question: live.question,
      startedAt: live.startedAt,
      deadlineAt: live.deadlineAt,
    })
    setTimeout(() => {
      this.#store.recent.delete(resolution.questionId)
      this.#store.settledQuestions.delete(resolution.questionId)
    }, 300_000).unref?.()

    this.#onEvent({
      type: 'question.settled',
      questionId: resolution.questionId,
      status: resolution.status,
      confidence: resolution.confidence,
      wagesCents: resolution.wagesCents,
    })
    live.finish(resolution)

    if (live.callbackUrl) void this.#postCallback(live.callbackUrl, resolution)
  }

  /**
   * Takes back an offer that lapsed, when its worker answers while the question is
   * still open.
   *
   * The lapse exists so a question can move to someone else when a worker has
   * wandered off; it was never meant to discard the answer of one who was simply
   * reading carefully. If the question was offered to them again meanwhile, that
   * newer offer gives way to this one, so one person is never counted twice.
   */
  #readmit(assignmentId: string, workerId: string): { live: LiveQuestion; assignment: Assignment } | null {
    for (const live of this.#store.live.values()) {
      const lapsed = live.lapsed.find((a) => a.assignmentId === assignmentId && a.workerId === workerId)
      if (!lapsed) continue
      if (live.answers.some((a) => a.workerId === workerId)) return null
      const newer = live.assignments.find((a) => a.workerId === workerId)
      if (newer) {
        live.assignments = live.assignments.filter((a) => a !== newer)
        if (!newer.golden) live.bought = Math.max(0, live.bought - 1)
      }
      live.lapsed = live.lapsed.filter((a) => a !== lapsed)
      live.assignments.push(lapsed)
      if (!lapsed.golden) live.bought += 1
      const worker = this.#store.workers.get(workerId)
      if (worker) worker.busyWith = lapsed.assignmentId
      return { live, assignment: lapsed }
    }
    return null
  }

  /**
   * Pays a batch of wages and records every outcome against the worker.
   *
   * A failed wage is recorded too, and recorded as failed. The alternative is a
   * worker who answered, saw nothing appear, and has no way to tell whether they
   * were skipped or robbed — which is the exact suspicion this product exists to
   * remove. It says what happened and stays in the list.
   */
  async #payOut(
    live: LiveQuestion,
    entries: readonly { workerId: string; assignmentId: string; amountCents: number; label: string; kind: Question['kind'] }[],
  ): Promise<{ receipts: PayoutReceipt[] }> {
    const payable = entries.flatMap((entry) => {
      const worker = this.#store.workers.get(entry.workerId)
      return worker ? [{ entry, to: worker.address }] : []
    })
    const settled = await Promise.allSettled(
      payable.map(({ entry, to }) =>
        this.#paymaster.payWorker({
          questionId: live.question.id,
          assignmentId: entry.assignmentId,
          workerId: entry.workerId,
          to,
          amountCents: entry.amountCents,
        }),
      ),
    )

    const receipts: PayoutReceipt[] = []
    settled.forEach((outcome, index) => {
      const { entry } = payable[index]!
      const base = { at: Date.now(), questionId: live.question.id, label: entry.label, kind: entry.kind }
      if (outcome.status === 'rejected') {
        console.error(`[quorum] wage payment failed for ${entry.workerId}: ${String(outcome.reason)}`)
        this.#store.recordPayment(entry.workerId, { ...base, amountCents: entry.amountCents, txHash: null, status: 'failed' })
        return
      }
      const receipt = outcome.value
      receipts.push(receipt)
      const worker = this.#store.workers.get(receipt.workerId)
      if (worker) worker.earnedCents += receipt.amountCents
      this.#store.recordPayment(receipt.workerId, {
        ...base,
        amountCents: receipt.amountCents,
        txHash: receipt.txHash,
        status: 'settled',
      })
      this.#onEvent({
        type: 'worker.paid',
        questionId: live.question.id,
        workerId: receipt.workerId,
        amountCents: receipt.amountCents,
        txHash: receipt.txHash,
      })
    })
    return { receipts }
  }

  /** Delivers a resolution to a callback-mode caller who is not holding a socket. */
  async #postCallback(url: string, resolution: Resolution): Promise<void> {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(resolution, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
      })
    } catch (error) {
      console.error(`[quorum] callback to ${url} failed: ${String(error)}`)
    }
  }
}
