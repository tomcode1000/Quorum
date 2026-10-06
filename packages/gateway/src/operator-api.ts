import { CAPABILITIES, SERVABLE_KINDS, blankRecord, reliability, type Kind } from '@quorum/core'
import type { Paymaster } from '@quorum/core'
import { Hono } from 'hono'
import type { Escalations } from './escalations.js'
import type { Events } from './events.js'
import type { RouterEvent } from './router.js'
import type { Store } from './store.js'
import { standing } from './skills.js'

/**
 * The operator console's read API.
 *
 * Internal, and read-only by construction: there is no endpoint here that pays,
 * refunds, blocks or edits anything. That is not an omission to be filled in
 * later. An operator who can adjust a worker's standing by hand can also adjust
 * it quietly, and the whole argument this product makes to a worker — that what
 * they were paid is a public fact, not our opinion of what they were paid —
 * depends on there being no such lever. Anything that changes state belongs on
 * a surface that leaves its own record.
 *
 * Every figure below is derived from live state or the event log. Nothing is
 * cached, nothing is seeded, and where a number does not exist yet it comes back
 * as zero rather than as a plausible-looking placeholder, because this is also
 * the screen that gets projected during a demo.
 */

/** Events are the console's audit trail, so the window has to be worth reading. */
const FEED_LIMIT = 60

/** A worker is "online" if they polled recently. Matches the router's own view. */
const ONLINE_MS = 60_000

export function operatorApi(services: {
  store: Store
  events: Events
  paymaster: Paymaster
  escalations: Escalations
}): Hono {
  const { store, events, paymaster, escalations } = services
  const app = new Hono()

  /** Newest first, and only the kinds the console draws a row for. */
  const feed = (): readonly RouterEvent[] => [...events.recent()].reverse().slice(0, FEED_LIMIT)

  const online = (now: number) => [...store.workers.values()].filter((w) => now - w.lastSeenAt < ONLINE_MS)

  /**
   * One worker, flattened for a table row.
   *
   * `reliability` is the engine's own number rather than a display-only average,
   * so a row in this table and the weight that worker's answer actually carries
   * cannot disagree.
   */
  const workerRow = (worker: ReturnType<Store['workers']['get']> & object, now: number) => {
    const scores = SERVABLE_KINDS.map((kind) => reliability(worker.record, kind))
    const best = scores.length ? Math.max(...scores) : 0
    const answered = worker.answerCount
    const where = standing(worker.skills)
    const status = where === 'failed'
      ? 'blocked'
      : worker.assessment !== null || where !== 'passed'
        ? 'in-assessment'
        : worker.busyWith !== null
          ? 'answering'
          : now - worker.lastSeenAt < ONLINE_MS
            ? 'available'
            : 'offline'

    /*
      Null, not zero, before there is anything to be reliable about.

      The gate is the assessment rather than the answer count: passing seeds a
      real record, so a worker who has just come through onboarding and not yet
      taken a caller's question already has a score the router reads. Gating on
      answers alone printed "no record yet" beside a roster the router was
      actively using, which is the one thing this column must not do.
    */
    const rated = where === 'passed'

    return {
      workerId: worker.workerId,
      address: worker.address,
      answered,
      earnedCents: worker.earnedCents,
      reliability: rated ? Number(best.toFixed(3)) : null,
      lastSeenAt: worker.lastSeenAt,
      busyWith: worker.busyWith,
      status,
      assessment: where === 'passed' || where === 'failed' ? where : 'in-progress',
      /** Each skill they picked and where it stands. */
      skills: worker.skills,
      /** Answers that arrived faster than the question could plausibly be read. */
      tooFastCount: worker.tooFastCount,
      payments: worker.payments.length,
    }
  }

  /**
   * The Live Activity screen, in one request.
   *
   * One endpoint rather than six because the console polls, and six polls that
   * land at slightly different moments render a page whose totals do not add up.
   */
  app.get('/overview', (c) => {
    const now = Date.now()
    const workers = [...store.workers.values()]
    const settled = [...store.recent.values()]
    const resolved = settled.filter((r) => r.status === 'resolved')

    const latencies = settled.map((r) => r.latencyMs).filter((ms) => ms > 0)
    const wagesCents = settled.reduce((sum, r) => sum + r.wagesCents, 0)
    const refundedCents = settled.reduce((sum, r) => sum + (r.refund?.amountCents ?? 0), 0)

    return c.json({
      network: paymaster.networkName,
      feesSponsored: paymaster.feesSponsored,
      at: now,
      counts: {
        questionsInFlight: store.live.size,
        questionsSettled: settled.length,
        questionsResolved: resolved.length,
        /** Questions quoted but not yet paid for. Not yet anybody's work. */
        questionsPending: store.pending.size,
        workersRegistered: workers.length,
        workersOnline: online(now).length,
        workersAnswering: workers.filter((w) => w.busyWith !== null).length,
        workersBlocked: workers.filter((w) => standing(w.skills) === 'failed').length,
        workersInAssessment: workers.filter((w) => w.assessment !== null).length,
        answersReceived: workers.reduce((sum, w) => sum + w.answerCount, 0),
      },
      /**
       * The pipeline, by where each question actually is.
       *
       * "Being answered" counts questions that have an assignment out and no
       * answer back yet; a question can be in flight with nobody looking at it,
       * and collapsing the two would make the console claim work is happening
       * when it is not.
       */
      pipeline: {
        quoted: store.pending.size,
        awaitingWorker: [...store.live.values()].filter((q) => q.assignments.length === 0).length,
        beingAnswered: [...store.live.values()].filter((q) => q.assignments.length > 0 && q.answers.length === 0).length,
        answersIn: [...store.live.values()].filter((q) => q.answers.length > 0).length,
        settled: settled.length,
      },
      treasury: {
        wagesPaidCents: wagesCents,
        refundedCents,
        /** Paid but never confirmed on chain. The only row that needs a human. */
        failedPaymentsCents: workers
          .flatMap((w) => w.payments)
          .filter((p) => p.status === 'failed')
          .reduce((sum, p) => sum + p.amountCents, 0),
      },
      performance: {
        medianLatencyMs: latencies.length ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : null,
        resolutionRate: settled.length ? Number((resolved.length / settled.length).toFixed(3)) : null,
        meanResponders: settled.length
          ? Number((settled.reduce((s, r) => s + r.responders, 0) / settled.length).toFixed(2))
          : null,
      },
      /**
       * Which capabilities have somebody who can serve them.
       *
       * A capability declared with no workforce is marked as such rather than
       * hidden, because the console is where an operator would otherwise not
       * notice that a queue has silently had nobody on it all day.
       */
      capabilities: CAPABILITIES.map((capability) => {
        /*
          A field capability has no judgment kind, so there is no reliability to
          read and nobody can be counted as able to serve it. It has to come back
          as zero rather than as the default score: counting a workforce for a
          capability that cannot have one is the exact false reassurance this
          screen exists to prevent.
        */
        const staffed =
          capability.kind === undefined
            ? 0
            : workers.filter(
                // Staffed means passed in this skill, not merely rated well somewhere.
                (w) => w.skills[capability.kind as Kind] === 'passed',
              ).length
        return { id: capability.id, kind: capability.kind ?? null, name: capability.name, servable: capability.servable, staffed }
      }),
      workers: workers
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        .slice(0, 8)
        .map((w) => workerRow(w, now)),
      feed: feed(),
    })
  })

  /** The roster. Small enough to send whole; paginated in the client. */
  app.get('/workers', (c) => {
    const now = Date.now()
    return c.json({
      at: now,
      workers: [...store.workers.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt).map((w) => workerRow(w, now)),
    })
  })

  /** One person: their standing per skill, and every payment with its link. */
  app.get('/workers/:id', (c) => {
    const worker = store.workers.get(c.req.param('id'))
    if (!worker) return c.json({ error: 'unknown worker' }, 404)
    const now = Date.now()

    return c.json({
      ...workerRow(worker, now),
      reputation: SERVABLE_KINDS.map((kind) => ({
        kind,
        score: Number(reliability(worker.record, kind).toFixed(3)),
        agreements: worker.record.byKind[kind]?.agreements ?? 0,
        disagreements: worker.record.byKind[kind]?.disagreements ?? 0,
        ambiguous: worker.record.byKind[kind]?.unresolved ?? 0,
      })),
      payments: worker.payments.map((p) => ({
        ...p,
        explorerUrl: p.txHash === null ? null : paymaster.explorerUrl(p.txHash),
      })),
      /** Their part of the event log, which is the only per-worker history we keep. */
      events: feed().filter((e) => 'workerId' in e && e.workerId === worker.workerId),
    })
  })

  /** Recent questions, in flight first because those are the watchable ones. */
  app.get('/questions', (c) => {
    const live = [...store.live.entries()].map(([id, q]) => ({
      questionId: id,
      kind: q.question.kind,
      prompt: q.question.prompt,
      priceCents: q.question.priceCents,
      startedAt: q.startedAt,
      deadlineAt: q.deadlineAt,
      status: q.answers.length > 0 ? 'answers-in' : q.assignments.length > 0 ? 'being-answered' : 'awaiting-worker',
      assigned: q.assignments.length,
      answers: q.answers.length,
    }))

    const settled = [...store.recent.entries()].map(([id, r]) => ({
      questionId: id,
      status: r.status,
      confidence: r.confidence,
      responders: r.responders,
      agreement: r.agreement,
      latencyMs: r.latencyMs,
      wagesCents: r.wagesCents,
      refundedCents: r.refund?.amountCents ?? 0,
      resolvedAt: r.resolvedAt,
    }))

    return c.json({ at: Date.now(), live, settled: settled.sort((a, b) => b.resolvedAt - a.resolvedAt) })
  })

  /**
   * One question's full audit trail.
   *
   * This is the screen the whole quality argument rests on, so it returns the
   * mechanism rather than a summary of it: who was asked and why, what each of
   * them said, the reputation behind each answer, where confidence landed, why
   * it stopped there, and the transaction for every wage. A reader should be
   * able to reconstruct the decision without being told how it works.
   */
  app.get('/questions/:id', (c) => {
    const id = c.req.param('id')
    const live = store.live.get(id)
    const settled = store.recent.get(id)
    if (!live && !settled) return c.json({ error: 'unknown question' }, 404)

    const trail = [...events.recent()].filter((e) => 'questionId' in e && e.questionId === id)
    // Once answered, the question is no longer live, but its page still shows
    // what was asked and the evidence beside the answer.
    const asked = live ?? store.settledQuestions.get(id)

    return c.json({
      questionId: id,
      question: asked
        ? {
            kind: asked.question.kind,
            prompt: asked.question.prompt,
            schema: asked.question.schema,
            attachments: asked.question.attachments ?? [],
            priceCents: asked.question.priceCents,
            startedAt: asked.startedAt,
            deadlineAt: asked.deadlineAt,
          }
        : null,
      live: live
        ? {
            assignments: live.assignments.map((a) => ({
              assignmentId: a.assignmentId,
              workerId: a.workerId,
              offeredAt: a.offeredAt,
              expiresAt: a.expiresAt,
              /** Whether this one is a calibration question, which never reaches a caller. */
              golden: Boolean(a.golden),
            })),
            answers: live.answers.map((a) => ({
              workerId: a.workerId,
              value: a.value,
              selfConfidence: a.selfConfidence,
              latencyMs: a.latencyMs,
              submittedAt: a.submittedAt,
              reliability: Number(reliability(store.workers.get(a.workerId)?.record ?? blankRecord(a.workerId), live.question.kind).toFixed(3)),
            })),
            bought: live.bought,
          }
        : null,
      resolution: settled
        ? {
            status: settled.status,
            /**
             * Null unless the question actually resolved.
             *
             * An unresolved question has no answer, and rendering the best guess
             * we happened to have as though it were one is the exact failure this
             * product exists to stop. It does not get to happen on our own screen.
             */
            value: settled.status === 'resolved' ? settled.value : null,
            confidence: settled.confidence,
            responders: settled.responders,
            agreement: settled.agreement,
            evidence: settled.evidence,
            latencyMs: settled.latencyMs,
            wagesCents: settled.wagesCents,
            resolvedAt: settled.resolvedAt,
            receipts: settled.receipts.map((r) => ({
              workerId: r.workerId,
              amountCents: r.amountCents,
              txHash: r.txHash,
              explorerUrl: paymaster.explorerUrl(r.txHash),
            })),
            refund: settled.refund
              ? {
                  amountCents: settled.refund.amountCents,
                  txHash: settled.refund.txHash,
                  explorerUrl: paymaster.explorerUrl(settled.refund.txHash),
                }
              : null,
          }
        : null,
      trail,
    })
  })

  /**
   * The longer-running jobs.
   *
   * A judgment question is over in seconds; an escalation is the shape for work
   * that is not — somebody going somewhere, or looking at something that takes
   * more than a glance. Both field capabilities are declared and unservable in
   * this version, so this list is usually empty, and the screen that reads it
   * says that in words rather than showing a bare empty table. A queue that has
   * had nobody on it all day and an hour with no work look identical otherwise.
   */
  app.get('/escalations', (c) => {
    const all = escalations.list({})
    return c.json({
      at: Date.now(),
      escalations: all.map((escalation) => ({
        id: escalation.id,
        capabilityId: escalation.capabilityId,
        state: escalation.state,
        task: escalation.task,
        priceCents: escalation.priceCents,
        createdAt: escalation.createdAt,
        deadlineAt: escalation.deadlineAt,
        /** Who is holding it. Empty while it is waiting for somebody. */
        workerIds: escalation.workerIds,
        location: escalation.location ?? null,
        reason: escalation.reason ?? null,
        wagesCents: escalation.wageReceipts.reduce((sum, r) => sum + r.amountCents, 0),
        receipts: escalation.wageReceipts.map((r) => ({
          workerId: r.workerId,
          amountCents: r.amountCents,
          txHash: r.txHash,
          explorerUrl: paymaster.explorerUrl(r.txHash),
        })),
        refund: escalation.refund
          ? { amountCents: escalation.refund.amountCents, explorerUrl: paymaster.explorerUrl(escalation.refund.txHash) }
          : null,
      })),
      /*
        Which field capabilities exist at all, so the screen can name the ones
        that are declared and cannot be served rather than implying the list is
        empty because nothing has been asked for.
      */
      fieldCapabilities: CAPABILITIES.filter((capability) => capability.class !== 'judgment').map((capability) => ({
        id: capability.id,
        name: capability.name,
        servable: capability.servable,
        requiresLocation: capability.requiresLocation,
      })),
    })
  })

  return app
}
