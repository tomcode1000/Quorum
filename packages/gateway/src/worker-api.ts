import {
  ASSESSMENT_LENGTH,
  buildAssessment,
  needsAssessment,
  plausibleReadingTimeMs,
  SERVABLE_KINDS,
  reliability,
  seedFromAssessment,
  submitAssessmentAnswer,
  type Kind,
} from '@quorum/core'
import type { Paymaster } from '@quorum/core'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Router } from './router.js'
import type { Store } from './store.js'

/**
 * The worker-facing API.
 *
 * Everything a worker needs and nothing they do not. There is no deposit endpoint,
 * no staking endpoint, no withdrawal endpoint and no balance we hold, because there
 * is no balance we hold: a wage is sent to the worker's own account the moment their
 * answer is accepted. The absence of those endpoints is the product.
 *
 * That absence is also the one differentiator that no competitor can copy without
 * rebuilding their economics. Every comparable network asks the worker for capital
 * first — a native token to be paid in, a bond to post, a stake to unlock better
 * work — which is incoherent for someone earning two cents an answer. If a "small
 * deposit to prevent spam" ever appears in this file, the product has been lost;
 * spam is handled by selection and reputation instead.
 */

const registerSchema = z.object({
  /** The worker's own account address, from their passkey-backed smart account. */
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** Stable id derived from the passkey credential. One identity per passkey. */
  workerId: z.string().min(8).max(128),
})

const assessmentAnswerSchema = z.object({
  workerId: z.string().min(8).max(128),
  value: z.union([z.boolean(), z.number(), z.string()]),
})

const answerSchema = z.object({
  assignmentId: z.string().uuid(),
  workerId: z.string().min(8).max(128),
  value: z.union([z.boolean(), z.number(), z.string()]),
  /** How sure the worker is. Hedging is rewarded, not punished; see `reputation.ts`. */
  selfConfidence: z.number().min(0).max(1).default(1),
})

/** How long a worker's poll is held open before returning empty. */
const POLL_TIMEOUT_MS = 25_000

export function workerApi(services: {
  store: Store
  router: Router
  paymaster: Paymaster
  wageCents: number
}): Hono {
  const { store, router, paymaster } = services
  const app = new Hono()

  /**
   * Sign in.
   *
   * There is no password and no seed phrase. The worker's passkey produces a smart
   * account; the address is where wages go, and the credential id is their identity.
   * One identity per passkey is weak sybil resistance and is stated as such in the
   * README rather than dressed up — real resistance is out of scope for now, and the
   * usual alternative is a bond this product refuses to ask for.
   */
  app.post('/register', async (c) => {
    const parsed = registerSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'address and workerId are required' }, 400)

    const worker = store.upsertWorker(parsed.data.workerId, parsed.data.address as `0x${string}`)
    void store.save()
    return c.json({
      workerId: worker.workerId,
      address: worker.address,
      network: paymaster.networkName,
      feesSponsored: paymaster.feesSponsored,
      /** Stated plainly so a worker knows what they are and are not being asked for. */
      requirements: { deposit: null, stake: null, minimumPayout: null, gasAsset: null },
      earnedCents: worker.earnedCents,
      /** A new worker does a short paid assessment before any caller's question. */
      assessment: worker.assessmentFailed
        ? 'failed'
        : needsAssessment(worker.record)
          ? { required: true, questions: ASSESSMENT_LENGTH, paid: false }
          : 'passed',
    })
  })

  /**
   * The entry assessment.
   *
   * A worker answers a handful of questions whose answers are already known before any
   * caller's question can reach them. Returned as one question at a time so it looks
   * and feels exactly like the work itself, which is the point: it is a sample of the
   * job, not a quiz about it.
   */
  app.get('/assessment', (c) => {
    const workerId = c.req.query('workerId')
    if (!workerId) return c.json({ error: 'workerId is required' }, 400)
    const worker = store.workers.get(workerId)
    if (!worker) return c.json({ error: 'unknown worker; register first' }, 404)

    if (worker.assessmentFailed) return c.json({ status: 'failed' })
    if (!needsAssessment(worker.record) && worker.assessment === null) return c.json({ status: 'passed' })

    worker.assessment ??= buildAssessment(workerId, store.golden)
    const answered = worker.assessment.results.length
    const next = worker.assessment.questions[answered]
    if (!next) return c.json({ status: 'passed' })

    return c.json({
      status: 'in-progress',
      number: answered + 1,
      of: worker.assessment.questions.length,
      /* Stated so the app never has to guess, and never implies a wage. */
      paid: false,
      question: { prompt: next.prompt, schema: next.schema, attachments: next.attachments ?? [], kind: next.kind },
    })
  })

  /** Answer one assessment question. Paid the same as any other answer. */
  app.post('/assessment', async (c) => {
    const parsed = assessmentAnswerSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'workerId and value are required' }, 400)

    const worker = store.workers.get(parsed.data.workerId)
    if (!worker) return c.json({ error: 'unknown worker' }, 404)
    if (!worker.assessment) return c.json({ error: 'no assessment in progress' }, 409)

    const { state, outcome } = submitAssessmentAnswer(worker.assessment, parsed.data.value)
    worker.assessment = state

    if (outcome.status === 'in-progress')
      return c.json({
        status: 'in-progress',
        number: state.results.length + 1,
        of: state.questions.length,
        question: {
          prompt: outcome.next.prompt,
          schema: outcome.next.schema,
          attachments: outcome.next.attachments ?? [],
          kind: outcome.next.kind,
        },
      })

    /*
      The assessment is not paid.

      Nothing here reaches a caller and nothing here is billed, so there is no
      revenue behind these five answers to pay a wage out of: the questions have
      known answers and exist only to calibrate, which makes them a sample of
      the job rather than a delivery of it. Paying for them would mean paying
      for every attempt by everybody who ever opens the app, which a network
      earning cents per real answer cannot carry.

      What the product still refuses to do is take *productive* work for
      nothing. Every question that reaches a worker from a real caller is paid
      the moment the answer is accepted, whether or not the caller is charged
      and whether or not the crowd agreed. That is the commitment, and it is
      untouched by this.
    */
    if (outcome.status === 'passed') {
      worker.record = seedFromAssessment(state)
      worker.assessment = null
    } else {
      worker.assessmentFailed = true
      worker.assessment = null
    }
    void store.save()

    return c.json({
      status: outcome.status,
      correct: outcome.correct,
      of: outcome.of,
      ...(outcome.status === 'failed'
        ? { reason: 'Too many of these were missed, so questions will not be routed to you.' }
        : {}),
    })
  })

  /**
   * Wait for a question.
   *
   * A long poll, because the app runs on a phone on an unreliable connection and a
   * dropped connection must cost a worker nothing more than one reconnect. A worker
   * who reconnects mid-question is handed the same question back.
   */
  app.get('/next', async (c) => {
    const workerId = c.req.query('workerId')
    if (!workerId) return c.json({ error: 'workerId is required' }, 400)
    const worker = store.workers.get(workerId)
    if (!worker) return c.json({ error: 'unknown worker; register first' }, 404)
    if (worker.assessmentFailed) return c.json({ assignment: null, blocked: 'assessment-failed' })
    if (worker.assessment !== null || needsAssessment(worker.record))
      return c.json({ assignment: null, blocked: 'assessment-required' })

    const assignment = await router.takeAssignment(workerId, POLL_TIMEOUT_MS)
    if (!assignment) return c.json({ assignment: null })

    const live = store.live.get(assignment.questionId)
    // A golden question is presented exactly like a real one. A check the worker can
    // spot is a check they can pass selectively, which would make it worthless.
    const shown = assignment.golden ?? live?.question
    if (!shown) return c.json({ assignment: null })

    return c.json({
      assignment: {
        assignmentId: assignment.assignmentId,
        prompt: shown.prompt,
        schema: shown.schema,
        attachments: shown.attachments ?? [],
        kind: shown.kind,
        expiresInMs: Math.max(0, assignment.expiresAt - Date.now()),
        paysCents: services.wageCents,
        /** Shown so a worker can see they are not being rushed past reading it. */
        suggestedReadingMs: Math.round(plausibleReadingTimeMs(shown)),
      },
    })
  })

  /** Submit an answer. The wage is sent when the question settles, moments later. */
  app.post('/answer', async (c) => {
    const parsed = answerSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'assignmentId, workerId and value are required' }, 400)

    const result = router.submitAnswer(parsed.data)
    if (!result.accepted) return c.json({ accepted: false, reason: result.reason }, 409)
    return c.json({ accepted: true })
  })

  /**
   * Earnings and standing.
   *
   * The balance is read from the chain rather than from our own ledger, and every
   * entry links to its transaction. Seeing the chain entry is the trust mechanism:
   * a worker should not have to believe our number, and should be able to check it
   * when we are not cooperating. That is why it is not hidden behind an abstraction.
   */
  app.get('/me', async (c) => {
    const workerId = c.req.query('workerId')
    if (!workerId) return c.json({ error: 'workerId is required' }, 400)
    const worker = store.workers.get(workerId)
    if (!worker) return c.json({ error: 'unknown worker' }, 404)

    let onChainCents: number | null = null
    try {
      onChainCents = await paymaster.balanceCents(worker.address)
    } catch {
      // The chain is the source of truth, but an RPC hiccup must not blank the screen.
    }

    // Read from the shared list rather than a local copy: a hardcoded pair here hid
    // three of a worker's skills the moment the catalog grew.
    const kinds: readonly Kind[] = SERVABLE_KINDS
    return c.json({
      workerId: worker.workerId,
      address: worker.address,
      balanceCents: onChainCents,
      earnedCents: worker.earnedCents,
      answered: worker.answerCount,
      network: paymaster.networkName,
      feesSponsored: paymaster.feesSponsored,
      /*
        Where onboarding stands.

        The app rendered a "verified" badge from its own markup, which meant a
        worker who had not answered a single assessment question was told on
        their profile that they were verified and that work could reach them.
        Neither was true, and both are exactly the kind of flattering falsehood
        this product is built to avoid telling. The state is now read from here.
      */
      assessment: worker.assessmentFailed
        ? 'failed'
        : worker.assessment !== null || needsAssessment(worker.record)
          ? 'required'
          : 'passed',
      /**
       * Every wage, newest first, each with the link that proves it.
       *
       * The explorer URL is built here rather than in the app so the app never
       * has to know which network it is on, and so the link cannot be quietly
       * dropped by a client that finds it inconvenient. A worker must always be
       * one tap from the public record of what they were paid.
       */
      payments: worker.payments.map((payment) => ({
        at: payment.at,
        amountCents: payment.amountCents,
        label: payment.label,
        kind: payment.kind,
        status: payment.status,
        questionId: payment.questionId,
        txHash: payment.txHash,
        explorerUrl: payment.txHash === null ? null : paymaster.explorerUrl(payment.txHash),
      })),
      reputation: Object.fromEntries(
        kinds.map((kind) => [
          kind,
          {
            score: Number(reliability(worker.record, kind).toFixed(3)),
            agreements: worker.record.byKind[kind]?.agreements ?? 0,
            disagreements: worker.record.byKind[kind]?.disagreements ?? 0,
            ambiguous: worker.record.byKind[kind]?.unresolved ?? 0,
          },
        ]),
      ),
    })
  })

  return app
}
