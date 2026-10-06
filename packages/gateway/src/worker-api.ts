import {
  ASSESSMENT_LENGTH,
  ASSESSMENT_PASS_MARK,
  assessableKinds,
  buildAssessment,
  plausibleReadingTimeMs,
  SERVABLE_KINDS,
  reliability,
  seedFromAssessment,
  submitAssessmentAnswer,
  type Kind,
} from '@quorum/core'
import type { Paymaster } from '@quorum/core'
import { CHAIN_IDS } from '@quorum/paymaster'
import { Hono } from 'hono'
import { Account } from 'viem/tempo'
import { z } from 'zod'
import type { Router } from './router.js'
import { nextToAssess, skillsIn, standing, type Standing } from './skills.js'
import type { Store, Worker } from './store.js'

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
 * work — which is incoherent for someone earning twenty cents an answer. If a "small
 * deposit to prevent spam" ever appears in this file, the product has been lost;
 * spam is handled by selection and reputation instead.
 */

const registerSchema = z.object({
  /** The worker's own account address: the Tempo account their passkey controls. */
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  /** The passkey's credential id. One identity per passkey. */
  workerId: z.string().min(8).max(128),
  /**
   * The passkey's P-256 public key: x and y, 64 bytes, as viem writes it. The
   * uncompressed form with its 0x04 prefix is accepted and stored without it. When
   * present, the address is checked against it rather than taken on trust.
   */
  publicKey: z
    .string()
    .regex(/^0x(04)?[0-9a-fA-F]{128}$/)
    .transform((key) => (key.length === 132 ? `0x${key.slice(4)}` : key).toLowerCase() as `0x${string}`)
    .optional(),
})

/**
 * The Tempo account a passkey controls.
 *
 * Tempo derives a passkey account's address from the key itself, so this is the only
 * address a wage can be sent to and later moved from with that passkey. Anything else
 * is an address nobody can sign for, and money sent there is gone.
 */
export function passkeyAddress(credentialId: string, publicKey: `0x${string}`): `0x${string}` {
  return Account.fromWebAuthnP256({ id: credentialId, publicKey }).address
}

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

/**
 * Where a worker stands, as the sign-in routes report it: `choose` sends them to pick
 * their skills, `required` to an assessment, `passed` to work, `failed` to the page
 * that says plainly no work will reach them. See `skills.ts`.
 */
export function assessmentStatus(worker: Pick<Worker, 'skills' | 'admitted'>): Standing | 'invite' {
  return worker.admitted ? standing(worker.skills) : 'invite'
}

const notifySchema = z.object({
  workerId: z.string().min(8).max(128),
  /** An address to be told at, or null to stop. */
  email: z.string().trim().email().max(254).nullable(),
})

const skillsSchema = z.object({
  workerId: z.string().min(8).max(128),
  /** The skills they want, among those not yet assessed. Omitting one un-picks it. */
  kinds: z.array(z.enum(SERVABLE_KINDS as [Kind, ...Kind[]])).max(SERVABLE_KINDS.length),
})

/** The skills catalogue as one worker sees it. */
function skillsView(worker: Pick<Worker, 'skills' | 'assessment'>, assessable: ReadonlySet<Kind>) {
  return {
    standing: standing(worker.skills),
    assessmentLength: ASSESSMENT_LENGTH,
    passMark: ASSESSMENT_PASS_MARK,
    inProgress: worker.assessment?.kind ?? null,
    skills: SERVABLE_KINDS.map((kind) => ({
      kind,
      state: worker.skills[kind] ?? null,
      assessable: assessable.has(kind),
    })),
  }
}

/** Prefix of worker ids issued to Tempo Wallet sign-ins, which never come through /register. */
export const TEMPO_WALLET_PREFIX = 'tw-'

/** How long a worker's poll is held open before returning empty. */
const POLL_TIMEOUT_MS = 25_000

export function workerApi(services: {
  store: Store
  router: Router
  paymaster: Paymaster
  wageCents: number
  chainId: number
  /** The TIP-20 token wages are paid in, which is what a worker sends from their account. */
  currency: `0x${string}`
}): Hono {
  const { store, router, paymaster } = services
  const app = new Hono()

  /*
    Nothing past sign-in for an account that has not redeemed an invite: no
    skills, no assessment, no work. The app sends them to the invite page.
  */
  app.use('*', async (c, next) => {
    const path = new URL(c.req.url).pathname
    if (!/\/(skills|assessment|next|answer)$/.test(path)) return next()
    const body = c.req.method === 'POST' ? ((await c.req.raw.clone().json().catch(() => ({}))) as { workerId?: unknown }) : {}
    const workerId = c.req.query('workerId') ?? (typeof body.workerId === 'string' ? body.workerId : undefined)
    const worker = workerId === undefined ? undefined : store.workers.get(workerId)
    if (worker && !worker.admitted) return c.json({ error: 'redeem an invite first', blocked: 'invite-required' }, 403)
    return next()
  })

  /** Skills with enough known answers to be assessed. Read live: the pool can grow. */
  const assessable = () => new Set(assessableKinds(store.golden, SERVABLE_KINDS))

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
    const { workerId, publicKey } = parsed.data
    const address = parsed.data.address as `0x${string}`

    // Tempo Wallet workers are registered only by a verified sign-in; see wallet-routes.
    if (workerId.startsWith(TEMPO_WALLET_PREFIX)) return c.json({ error: 'sign in with Tempo Wallet instead' }, 400)

    // With real money, an address must come with the key that controls it. A wage sent
    // to an address nobody can sign for is a wage nobody can ever spend.
    if (publicKey === undefined && services.chainId === CHAIN_IDS.mainnet)
      return c.json({ error: 'a passkey is required on mainnet, so that what you earn can be moved' }, 400)

    if (publicKey !== undefined && passkeyAddress(workerId, publicKey).toLowerCase() !== address.toLowerCase())
      return c.json({ error: 'that address is not the account this passkey controls' }, 400)

    // A passkey signing back in must be the key on record. A worker registered before
    // keys were kept has an address no key can sign for; the browser will not hand an
    // existing passkey's key back, so the only way forward is a new passkey.
    const existing = store.workers.get(workerId)
    if (existing && publicKey !== undefined) {
      if (existing.signer === null)
        return c.json({ error: 'this passkey predates accounts Quorum can read; make a new one', reason: 'legacy' }, 409)
      if (existing.signer.kind !== 'passkey' || existing.signer.publicKey.toLowerCase() !== publicKey.toLowerCase())
        return c.json({ error: 'that key is not the one on record for this passkey', reason: 'mismatch' }, 409)
    }

    const worker = store.upsertWorker(
      workerId,
      address,
      publicKey === undefined ? null : { kind: 'passkey', publicKey },
    )
    void store.save()
    return c.json({
      workerId: worker.workerId,
      address: worker.address,
      network: paymaster.networkName,
      feesSponsored: paymaster.feesSponsored,
      /** Stated plainly so a worker knows what they are and are not being asked for. */
      requirements: { deposit: null, stake: null, minimumPayout: null, gasAsset: null },
      earnedCents: worker.earnedCents,
      /** A new worker does a short unpaid assessment before any caller's question. */
      assessment: assessmentStatus(worker),
    })
  })

  /**
   * A passkey's public key, for signing back in.
   *
   * The browser returns the key only when the passkey is created, so a worker signing
   * in on a later visit needs it from here to know which account their passkey
   * controls. A public key is public; handing it out reveals nothing.
   */
  app.get('/key', (c) => {
    const workerId = c.req.query('workerId')
    const signer = workerId ? store.workers.get(workerId)?.signer : undefined
    if (signer?.kind !== 'passkey') return c.json({ error: 'no passkey on record for that id' }, 404)
    return c.json({ publicKey: signer.publicKey })
  })

  /**
   * Be told, or stop being told, when work in your skills is waiting.
   *
   * Opt-in and separate from signing up, which asks for nothing. Setting it back to
   * null deletes the address rather than switching a flag beside it.
   */
  app.post('/notify', async (c) => {
    const parsed = notifySchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'workerId and a valid email, or null, are required' }, 400)
    const worker = store.workers.get(parsed.data.workerId)
    if (!worker) return c.json({ error: 'unknown worker; register first' }, 404)
    worker.email = parsed.data.email
    worker.notifiedAt = null
    void store.save()
    return c.json({ email: worker.email })
  })

  /**
   * The skills on offer, and where this worker stands in each.
   *
   * Every servable kind is listed, including any that cannot be assessed yet,
   * because a skill quietly missing from the list reads as not existing rather than
   * as not ready. Those are marked, and cannot be picked.
   */
  app.get('/skills', (c) => {
    const workerId = c.req.query('workerId')
    const worker = workerId ? store.workers.get(workerId) : undefined
    if (!worker) return c.json({ error: 'unknown worker; register first' }, 404)
    return c.json(skillsView(worker, assessable()))
  })

  /**
   * Pick skills.
   *
   * Sets which of the not-yet-assessed skills the worker wants. A skill already
   * passed or failed is not touched: passed work is kept, and a failed assessment is
   * not retaken, because one that can be retaken until it is passed teaches its
   * answers to whoever keeps trying.
   */
  app.post('/skills', async (c) => {
    const parsed = skillsSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'workerId and kinds are required' }, 400)
    const worker = store.workers.get(parsed.data.workerId)
    if (!worker) return c.json({ error: 'unknown worker; register first' }, 404)

    const open = assessable()
    const wanted = new Set(parsed.data.kinds)
    for (const kind of wanted)
      if (!open.has(kind)) return c.json({ error: `${kind} cannot be assessed yet, so it cannot be chosen` }, 400)

    for (const kind of SERVABLE_KINDS) {
      const state = worker.skills[kind]
      if (state === 'passed' || state === 'failed') continue
      // The skill being assessed right now stays picked until its assessment ends.
      if (worker.assessment?.kind === kind) continue
      if (wanted.has(kind)) worker.skills[kind] = 'chosen'
      else delete worker.skills[kind]
    }
    void store.save()
    return c.json(skillsView(worker, open))
  })

  /**
   * The assessment for the next skill they picked.
   *
   * Five known-answer questions of one kind, one at a time, so it looks and feels
   * exactly like the work itself: it is a sample of the job, not a quiz about it.
   * When one skill is finished the next one they picked begins.
   */
  app.get('/assessment', (c) => {
    const workerId = c.req.query('workerId')
    if (!workerId) return c.json({ error: 'workerId is required' }, 400)
    const worker = store.workers.get(workerId)
    if (!worker) return c.json({ error: 'unknown worker; register first' }, 404)

    if (worker.assessment === null) {
      const kind = nextToAssess(worker.skills)
      if (kind === undefined) return c.json({ status: standing(worker.skills) })
      worker.assessment = buildAssessment(workerId, kind, store.golden)
    }
    const assessment = worker.assessment
    const answered = assessment.results.length
    const next = assessment.questions[answered]
    if (!next) return c.json({ status: standing(worker.skills) })

    return c.json({
      status: 'in-progress',
      skill: assessment.kind,
      /** Skills still to assess after this one, so the app can say how much is left. */
      skillsAfter: skillsIn(worker.skills, 'chosen').filter((kind) => kind !== assessment.kind).length,
      number: answered + 1,
      of: assessment.questions.length,
      /* Stated so the app never has to guess, and never implies a wage. */
      paid: false,
      question: { prompt: next.prompt, schema: next.schema, attachments: next.attachments ?? [], kind: next.kind },
    })
  })

  /** Answer one assessment question. Unpaid, for the reason given below. */
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
        skill: state.kind,
        skillsAfter: skillsIn(worker.skills, 'chosen').filter((kind) => kind !== state.kind).length,
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
      revenue behind these answers to pay a wage out of: the questions have
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
      worker.record = seedFromAssessment(state, worker.record)
      worker.skills[state.kind] = 'passed'
    } else {
      worker.skills[state.kind] = 'failed'
    }
    worker.assessment = null
    void store.save()

    return c.json({
      status: outcome.status,
      skill: state.kind,
      correct: outcome.correct,
      of: outcome.of,
      /** The next skill they picked, if any, which starts when they continue. */
      next: nextToAssess(worker.skills) ?? null,
      standing: standing(worker.skills),
      passedSkills: skillsIn(worker.skills, 'passed'),
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
    const where = standing(worker.skills)
    if (where === 'choose') return c.json({ assignment: null, blocked: 'skills-required' })
    if (where === 'required') return c.json({ assignment: null, blocked: 'assessment-required' })
    if (where === 'failed') return c.json({ assignment: null, blocked: 'assessment-failed' })

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
      /** How they move money out: their passkey here, Tempo Wallet, or neither (a dev identity). */
      signer: worker.signer?.kind ?? null,
      chainId: services.chainId,
      currency: services.currency,
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
      assessment: assessmentStatus(worker),
      /** Each skill they picked and where it stands. Unpicked skills are absent. */
      skills: worker.skills,
      /** Where they are told that work is waiting, if anywhere. */
      email: worker.email,
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
