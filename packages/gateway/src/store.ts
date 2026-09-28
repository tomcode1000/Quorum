import { blankRecord } from '@quorum/core'
import type { AssessmentState, GoldenQuestion, Question, RateState, Resolution, WorkerAnswer, WorkerRecord } from '@quorum/core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Gateway state.
 *
 * Questions are short-lived — a caller blocks for seconds and then the question is
 * over — so live state is held in memory and only the worker roster is persisted.
 *
 * Even that persistence is a convenience rather than the record of truth. The
 * authoritative record of what a worker did and was paid is the set of TIP-20
 * transfers on chain, each carrying the memo for the question it paid for. Delete
 * this file and the roster can be rebuilt from the chain; shut Quorum down and the
 * workers keep their history regardless. That inversion is deliberate, so the store
 * is built to be disposable rather than defended.
 */

/**
 * One wage, as the worker's own history shows it.
 *
 * Kept because the worker app has to render a payment list and the chain cannot
 * be queried per-worker cheaply enough to build one on demand. It is a cache of
 * the transfers, never the record of truth: every row carries the transaction
 * hash that proves it, and a worker who does not believe this list can check it
 * without us. Deleting the state file loses the cache and nothing else.
 */
export type WagePayment = {
  readonly at: number
  readonly amountCents: number
  /** Null only while a chain write is in flight or after one failed. */
  readonly txHash: string | null
  readonly questionId: string
  /** What the worker was answering, in words, for the history screen. */
  readonly label: string
  readonly kind: string
  readonly status: 'settled' | 'pending' | 'failed'
}

export type Worker = {
  readonly workerId: string
  /** Where wages are sent: the worker's own account, never ours. */
  readonly address: `0x${string}`
  record: WorkerRecord
  /** Set while the worker holds an unanswered assignment. */
  busyWith: string | null
  /** Last poll for work. A stale worker is not offered questions. */
  lastSeenAt: number
  /** Lifetime earnings in cents, for display. The chain is authoritative. */
  earnedCents: number
  /** Rate-limit window, per §7. */
  rate: RateState
  /** Answers that arrived faster than the question could be read. */
  tooFastCount: number
  answerCount: number
  /**
   * Set until the worker has passed the entry assessment.
   *
   * While this is present the worker is invisible to the router, so a caller's
   * question can never reach somebody who has not yet demonstrated they can do the
   * task. See `onboarding.ts`.
   */
  assessment: AssessmentState | null
  /** Set when they failed. They keep what they earned and are offered no more work. */
  assessmentFailed: boolean
  /** Newest first. Capped, because a phone renders a page of this and no more. */
  payments: WagePayment[]
}

/** One question offered to one worker. */
export type Assignment = {
  readonly assignmentId: string
  readonly questionId: string
  readonly workerId: string
  readonly offeredAt: number
  readonly expiresAt: number
  /**
   * Set when this assignment is a known-answer question seeded for calibration.
   * Invisible to the worker, and paid identically; see `antifarming.ts`.
   */
  readonly golden?: GoldenQuestion
}

/** A question currently in flight. */
export type LiveQuestion = {
  readonly question: Question
  readonly startedAt: number
  readonly deadlineAt: number
  /** Where a refund goes if this question cannot be resolved. */
  readonly payer: `0x${string}` | null
  /** Set for callback-mode callers, who are not holding a socket. */
  readonly callbackUrl?: string
  answers: WorkerAnswer[]
  assignments: Assignment[]
  /** Answers bought, whether or not they arrived. Drives MAX_RESPONDERS. */
  bought: number
  readonly settled: Promise<Resolution>
  finish: (resolution: Resolution) => void
}

type Snapshot = {
  workers: {
    workerId: string
    address: `0x${string}`
    record: WorkerRecord
    earnedCents: number
    tooFastCount?: number
    answerCount?: number
    assessmentFailed?: boolean
    payments?: WagePayment[]
  }[]
}

export class Store {
  readonly workers = new Map<string, Worker>()
  readonly live = new Map<string, LiveQuestion>()
  /** Resolutions kept briefly so a caller that lost its connection can re-read one. */
  readonly recent = new Map<string, Resolution>()
  /** Questions quoted but not yet paid for, awaiting a claim. */
  readonly pending = new Map<string, { question: Question; callbackUrl?: string; expiresAt: number }>()
  /** Golden questions available for seeding, by kind. */
  readonly golden: GoldenQuestion[] = []

  readonly #path: string | undefined
  #writing: Promise<void> = Promise.resolve()

  constructor(options: { persistTo?: string } = {}) {
    this.#path = options.persistTo
  }

  /** Reloads the roster. A missing or corrupt file is not an error. */
  async load(): Promise<void> {
    if (!this.#path) return
    try {
      const snapshot = JSON.parse(await readFile(this.#path, 'utf8')) as Snapshot
      for (const entry of snapshot.workers)
        this.workers.set(entry.workerId, {
          workerId: entry.workerId,
          address: entry.address,
          record: entry.record,
          busyWith: null,
          lastSeenAt: 0,
          earnedCents: entry.earnedCents,
          rate: { timestamps: [] },
          tooFastCount: entry.tooFastCount ?? 0,
          answerCount: entry.answerCount ?? 0,
          assessment: null,
          assessmentFailed: entry.assessmentFailed ?? false,
          payments: entry.payments ?? [],
        })
    } catch {
      // No saved roster, or an unreadable one. Either way, start clean.
    }
  }

  /** Writes the roster. Serialised so concurrent resolutions cannot interleave. */
  save(): Promise<void> {
    if (!this.#path) return Promise.resolve()
    const path = this.#path
    const snapshot: Snapshot = {
      workers: [...this.workers.values()].map((w) => ({
        workerId: w.workerId,
        address: w.address,
        record: w.record,
        earnedCents: w.earnedCents,
        tooFastCount: w.tooFastCount,
        answerCount: w.answerCount,
        assessmentFailed: w.assessmentFailed,
        payments: w.payments,
      })),
    }
    this.#writing = this.#writing.then(async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(snapshot, null, 2))
    })
    return this.#writing
  }

  upsertWorker(workerId: string, address: `0x${string}`): Worker {
    const existing = this.workers.get(workerId)
    if (existing) {
      existing.lastSeenAt = Date.now()
      return existing
    }
    const worker: Worker = {
      workerId,
      address,
      record: blankRecord(workerId),
      busyWith: null,
      lastSeenAt: Date.now(),
      earnedCents: 0,
      rate: { timestamps: [] },
      tooFastCount: 0,
      answerCount: 0,
      assessment: null,
      assessmentFailed: false,
      payments: [],
    }
    this.workers.set(workerId, worker)
    return worker
  }

  /**
   * Adds one wage to a worker's visible history.
   *
   * Capped at 200 because this list exists to be rendered, not to be complete:
   * the complete history is the chain, and a worker who wants all of it follows
   * any row's transaction link to an address that holds every payment we ever
   * made them. Keeping ten thousand rows here to render fifty would trade a
   * phone's memory for nothing.
   */
  recordPayment(workerId: string, payment: WagePayment): void {
    const worker = this.workers.get(workerId)
    if (!worker) return
    worker.payments.unshift(payment)
    if (worker.payments.length > 200) worker.payments.length = 200
  }

  /** Agreement history for every known worker, in the shape the engine wants. */
  records(): ReadonlyMap<string, WorkerRecord> {
    const map = new Map<string, WorkerRecord>()
    for (const worker of this.workers.values()) map.set(worker.workerId, worker.record)
    return map
  }

  /**
   * Workers who could be asked right now.
   *
   * A worker who has not polled recently is excluded rather than offered a question
   * they will not see: an assignment sitting unanswered in a dead session spends the
   * caller's deadline without buying anything.
   */
  availableWorkers(staleAfterMs = 30_000): Worker[] {
    const cutoff = Date.now() - staleAfterMs
    return [...this.workers.values()].filter(
      (w) =>
        w.lastSeenAt >= cutoff &&
        w.busyWith === null &&
        // Nobody reaches a caller's question before passing the entry assessment.
        w.assessment === null &&
        !w.assessmentFailed,
    )
  }

  /** Finds the live question an assignment belongs to. */
  findAssignment(assignmentId: string): { live: LiveQuestion; assignment: Assignment } | null {
    for (const live of this.live.values()) {
      const assignment = live.assignments.find((a) => a.assignmentId === assignmentId)
      if (assignment) return { live, assignment }
    }
    return null
  }
}
