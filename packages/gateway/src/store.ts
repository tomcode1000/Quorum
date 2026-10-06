import { blankRecord, type Kind } from '@quorum/core'
import type { AssessmentState, GoldenQuestion, Question, RateState, Resolution, WorkerAnswer, WorkerRecord } from '@quorum/core'
import { MediaStore } from './media.js'
import { fileStore, type Persistence } from './persistence.js'
import { legacySkills, standing, type Skills } from './skills.js'

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
   * The assessment in progress, for one skill, if any.
   *
   * Only a passed skill brings work, so a caller's question never reaches somebody
   * who has not shown they can answer that kind. See `onboarding.ts`.
   */
  assessment: AssessmentState | null
  /** The kinds of question they chose, and whether each has been passed. See `skills.ts`. */
  skills: Skills
  /** Newest first. Capped, because a phone renders a page of this and no more. */
  payments: WagePayment[]
  /**
   * How this worker signs, which decides who can move what is in their account.
   *
   * A passkey worker's public key is kept because a browser hands it over only once,
   * when the passkey is made; signing back in later returns a signature and no key,
   * and the key is what the account address is derived from. A Tempo Wallet worker
   * signs through Tempo's hosted wallet, so there is no key of theirs to keep.
   */
  signer: { kind: 'passkey'; publicKey: `0x${string}` } | { kind: 'tempo-wallet' } | null
  /** Where to say work is waiting, if they asked to be told. Nobody is asked for this to sign up. */
  email: string | null
  /** When they were last emailed, so they are emailed at most once in a quiet period. */
  notifiedAt: number | null
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
  /** Held until its deadline for somebody to come online; see `hold` in core's EngineState. */
  readonly hold: boolean
  answers: WorkerAnswer[]
  /**
   * Known-answer checks answered while this question was live. Paid like any other
   * answer when the question settles, but kept apart from `answers` because they are
   * evidence about the worker, not about the caller's question.
   */
  calibrations: { workerId: string; assignmentId: string; prompt: string; kind: Question['kind'] }[]
  assignments: Assignment[]
  /**
   * Offers that lapsed before an answer came. Kept so a worker who answers a few
   * seconds late, while the question is still open, is counted rather than turned
   * away: their answer is no less useful for arriving after the offer's timer.
   */
  lapsed: Assignment[]
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
    /** Only in rosters saved before skills; converted on load. */
    assessmentFailed?: boolean
    skills?: Skills
    payments?: WagePayment[]
    signer?: Worker['signer']
    email?: string | null
    notifiedAt?: number | null
  }[]
}

export class Store {
  readonly workers = new Map<string, Worker>()
  readonly live = new Map<string, LiveQuestion>()
  /** Resolutions kept briefly so a caller that lost its connection can re-read one. */
  readonly recent = new Map<string, Resolution>()
  /** The question behind each of those, so its page still shows what was asked, and the evidence, beside the answer. */
  readonly settledQuestions = new Map<string, { question: Question; startedAt: number; deadlineAt: number }>()
  /** Questions quoted but not yet paid for, awaiting a claim. */
  readonly pending = new Map<string, { question: Question; callbackUrl?: string; expiresAt: number }>()
  /** Images callers sent inline, served to workers by link. */
  readonly media = new MediaStore()
  /** Golden questions available for seeding, by kind. */
  readonly golden: GoldenQuestion[] = []

  readonly #persistence: Persistence | undefined
  /** Read only when the main store has nothing yet: where an earlier roster may be. */
  readonly #migrateFrom: Persistence | undefined
  #writing: Promise<void> = Promise.resolve()

  constructor(options: { persistTo?: string; persistence?: Persistence; migrateFrom?: Persistence } = {}) {
    this.#persistence = options.persistence ?? (options.persistTo === undefined ? undefined : fileStore(options.persistTo))
    this.#migrateFrom = options.migrateFrom
  }

  /**
   * Reloads the roster. A missing or corrupt one is not an error.
   *
   * When the store is empty and an older roster exists elsewhere (the local file,
   * on first moving to Upstash), that one is loaded and written straight back, so
   * nobody has to sign up or be assessed again.
   */
  async load(): Promise<void> {
    if (!this.#persistence) return
    try {
      let text = await this.#persistence.read()
      if (text === null && this.#migrateFrom) {
        text = await this.#migrateFrom.read()
        if (text !== null) await this.#persistence.write(text)
      }
      if (text === null) return
      const snapshot = JSON.parse(text) as Snapshot
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
          skills: entry.skills ?? legacySkills(entry.record, entry.assessmentFailed ?? false),
          payments: entry.payments ?? [],
          signer: entry.signer ?? null,
          email: entry.email ?? null,
          notifiedAt: entry.notifiedAt ?? null,
        })
    } catch (error) {
      // Start clean rather than not at all, but say so: an empty roster from a
      // storage fault looks exactly like a fresh install otherwise.
      console.error(`[quorum] could not load the roster, starting empty: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Writes the roster. Serialised so concurrent resolutions cannot interleave. */
  save(): Promise<void> {
    const persistence = this.#persistence
    if (!persistence) return Promise.resolve()
    const snapshot: Snapshot = {
      workers: [...this.workers.values()].map((w) => ({
        workerId: w.workerId,
        address: w.address,
        record: w.record,
        earnedCents: w.earnedCents,
        tooFastCount: w.tooFastCount,
        answerCount: w.answerCount,
        skills: w.skills,
        payments: w.payments,
        signer: w.signer,
        email: w.email,
        notifiedAt: w.notifiedAt,
      })),
    }
    // A failed write is logged rather than left to reject the chain, which would
    // stop every later save from running at all.
    this.#writing = this.#writing.then(() =>
      persistence.write(JSON.stringify(snapshot)).catch((error: unknown) => {
        console.error(`[quorum] could not save the roster: ${error instanceof Error ? error.message : String(error)}`)
      }),
    )
    return this.#writing
  }

  upsertWorker(workerId: string, address: `0x${string}`, signer: Worker['signer'] = null): Worker {
    const existing = this.workers.get(workerId)
    if (existing) {
      // Never re-pointed. A worker's address is where their wages go, so letting a
      // later registration change it would let anyone holding the id redirect them.
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
      skills: {},
      payments: [],
      signer,
      email: null,
      notifiedAt: null,
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

  /** The worker paid at this address, if any. Addresses are compared case-insensitively. */
  workerAt(address: string): Worker | undefined {
    const wanted = address.toLowerCase()
    for (const worker of this.workers.values()) if (worker.address.toLowerCase() === wanted) return worker
    return undefined
  }

  /**
   * Workers who could be asked right now.
   *
   * A worker who has not polled recently is excluded rather than offered a question
   * they will not see: an assignment sitting unanswered in a dead session spends the
   * caller's deadline without buying anything.
   */
  availableWorkers(kind?: Kind, staleAfterMs = 30_000): Worker[] {
    const cutoff = Date.now() - staleAfterMs
    return [...this.workers.values()].filter(
      (w) =>
        w.lastSeenAt >= cutoff &&
        w.busyWith === null &&
        // Nobody is sent a question mid-assessment, and nobody is sent a kind of
        // question they have not passed. Without a kind, anyone who passed anything.
        w.assessment === null &&
        (kind === undefined ? standing(w.skills) === 'passed' : w.skills[kind] === 'passed'),
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
