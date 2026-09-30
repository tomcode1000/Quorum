import {
  AskError,
  centsToDollars,
  looksLikeInputRequired,
  inputRequiredResponse,
  parseAsk,
  parseInputRequired,
  priceAsk,
  type CostAdvice,
  type Question,
  type Resolution,
} from '@quorum/core'
import type { Paymaster } from '@quorum/core'
import { CHAIN_IDS } from '@quorum/paymaster'
import { Hono } from 'hono'
import { Credential } from 'mppx'
import { Mppx, tempo } from 'mppx/server'
import { randomUUID } from 'node:crypto'
import { agentCard, serviceManifest } from './agent-card.js'
import type { Config } from './config.js'
import type { Router } from './router.js'
import type { Store } from './store.js'

/**
 * The agent-facing surface.
 *
 * The shape of this API is the product's distribution strategy made concrete. An
 * agent already on these rails knows how to discover a service and pay by charge;
 * hiring a person here is the same call shape as hiring another agent, with no
 * account, no API key, no SDK and no token. Every previous attempt at paying people
 * for judgment was a destination the buyer had to travel to and integrate with,
 * which is a large part of why none of them became the default.
 *
 * So there are exactly two things to learn. Post a question, or post the
 * `input-required` task status you already had, and pay the 402. That is the whole
 * integration.
 */

export type Services = {
  config: Config
  store: Store
  router: Router
  paymaster: Paymaster
  /** Live event feed for the demo view. */
  events: { subscribe(listener: (event: unknown) => void): () => void }
}

/** How long a quote is held before the caller must ask again. */
const QUOTE_TTL_MS = 60_000

export function createServer(services: Services): Hono {
  const { config, store, router, paymaster } = services
  const app = new Hono()

  /**
   * The payment layer.
   *
   * MPP charge mode: the first call gets a 402 carrying amount, currency and
   * recipient; the retry carries the credential and the response carries the
   * receipt. Session mode is the right answer for a caller running thousands of
   * questions and is deliberately not here yet — charge mode has to work end to end
   * first, because it is the one a judge will actually call.
   */
  const mppx = Mppx.create({
    methods: [tempo({ currency: config.currency, recipient: config.recipient, testnet: config.network === 'testnet' })],
    secretKey: config.paymentSecret,
    realm: new URL(config.publicUrl).hostname,
  })

  app.get('/', (c) =>
    c.json({
      name: 'Quorum',
      description: 'Resolves the A2A input-required state with a real person, in seconds, paid per answer.',
      network: paymaster.networkName,
      feesSponsored: paymaster.feesSponsored,
      docs: `${config.publicUrl}/docs`,
      agentCard: `${config.publicUrl}/.well-known/agent-card.json`,
      workersOnline: store.availableWorkers().length,
    }),
  )

  app.get('/.well-known/agent-card.json', (c) => c.json(agentCard(config)))
  app.get('/.well-known/mpp-service.json', (c) => c.json(serviceManifest(config)))

  app.get('/health', (c) =>
    c.json({
      ok: true,
      network: paymaster.networkName,
      // The worker app needs this before anyone has signed in, to open Tempo Wallet on the right chain.
      chainId: CHAIN_IDS[config.network],
      workersOnline: store.availableWorkers().length,
      questionsInFlight: store.live.size,
    }),
  )

  /**
   * Ask a question.
   *
   * Accepts either the native shape or an A2A `input-required` status forwarded
   * unmodified, and quotes before charging. A caller whose ceiling is below our
   * floor gets a 409 with the floor attached rather than a payment challenge, so
   * they can decide whether to raise it instead of paying for a disappointment.
   */
  app.post('/v1/questions', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'body must be JSON' }, 400)
    }

    let parsed: ReturnType<typeof parseAsk> & { taskId?: string }
    try {
      parsed = looksLikeInputRequired(body) ? parseInputRequired(body) : parseAsk(body)
    } catch (error) {
      if (error instanceof AskError) return c.json({ error: error.message, ...(error.detail ?? {}) }, error.status)
      throw error
    }

    const pricing = priceAsk(parsed)
    // Asked what a mistake would cost, the honest answer is sometimes that a person
    // is not worth it. Said before any payment, so the answer costs nothing.
    if (pricing.kind === 'not-worth-asking')
      return c.json({
        status: 'not_worth_asking',
        reason: pricing.advice.reason,
        advice: adviceBody(pricing.advice),
      })
    const priced = pricing.quote
    if (!priced.ok)
      return c.json(
        {
          error: priced.reason,
          quote: centsToDollars(priced.floorCents),
          quote_cents: priced.floorCents,
        },
        409,
      )

    // Refusing here rather than after taking payment: a caller should not pay to
    // discover that nobody was online.
    if (store.availableWorkers(parsed.kind).length === 0)
      return c.json(
        { error: `nobody who has passed ${parsed.kind} questions is online right now`, status: 'refused', retry_after_ms: 15_000 },
        503,
      )

    const question: Question = {
      id: `q_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
      kind: parsed.kind,
      prompt: parsed.prompt,
      schema: parsed.schema,
      priceCents: priced.priceCents,
      timeoutMs: parsed.timeoutMs,
      ...(parsed.attachments.length > 0 ? { attachments: parsed.attachments } : {}),
      ...(parsed.taskRef === undefined ? {} : { taskRef: parsed.taskRef }),
      ...(parsed.callerConfidence === undefined ? {} : { callerConfidence: parsed.callerConfidence }),
    }

    store.pending.set(question.id, {
      question,
      expiresAt: Date.now() + QUOTE_TTL_MS,
      ...(parsed.callbackUrl === undefined ? {} : { callbackUrl: parsed.callbackUrl }),
    })

    const challenge = await mppx.challenge.tempo.charge({
      amount: centsToDollars(priced.priceCents),
      description: `Quorum: ${question.kind} question resolved by a person`,
      meta: { questionId: question.id },
    })

    return c.json(
      {
        question_id: question.id,
        quote: centsToDollars(priced.priceCents),
        quote_cents: priced.priceCents,
        claim_url: `${config.publicUrl}/v1/questions/${question.id}/claim`,
        ...(pricing.advice === undefined ? {} : { advice: adviceBody(pricing.advice) }),
        expires_in_ms: QUOTE_TTL_MS,
        workers_online: store.availableWorkers().length,
        payment: challenge,
      },
      402,
      { 'WWW-Authenticate': challengeHeader(challenge, priced.priceCents, config) },
    )
  })

  /**
   * Pay and wait.
   *
   * The credential is verified, and then the connection is held open until the
   * question resolves or the caller's deadline passes. Holding a socket is the right
   * default because the whole claim is that this takes seconds; callback mode exists
   * for callers with long deadlines who would rather not.
   */
  app.post('/v1/questions/:id/claim', async (c) => {
    const id = c.req.param('id')
    const pending = store.pending.get(id)
    if (!pending) {
      // A quote that expired, or a question already claimed. If it resolved
      // recently, hand back the resolution rather than an error: a caller that lost
      // its connection should be able to collect what it already paid for.
      const recent = store.recent.get(id)
      if (recent) return c.json(present(recent, paymaster))
      return c.json({ error: 'unknown or expired question id; request a new quote' }, 404)
    }
    if (pending.expiresAt < Date.now()) {
      store.pending.delete(id)
      return c.json({ error: 'the quote expired; request a new one' }, 410)
    }

    const paid = await mppx.charge({
      amount: centsToDollars(pending.question.priceCents),
      description: `Quorum: ${pending.question.kind} question`,
      meta: { questionId: id },
    })(c.req.raw)

    if (paid.status === 402) return paid.challenge

    store.pending.delete(id)
    const payer = payerOf(c.req.raw)
    const resolution = await router.resolve(pending.question, {
      ...(payer === null ? {} : { payer }),
      ...(pending.callbackUrl === undefined ? {} : { callbackUrl: pending.callbackUrl }),
    })

    // Callback mode returns as soon as payment clears; the resolution is posted.
    if (pending.callbackUrl) return paid.withReceipt(c.json({ question_id: id, status: 'accepted' }, 202))

    return paid.withReceipt(
      c.json(
        pending.question.taskRef && looksLikeTask(pending.question)
          ? inputRequiredResponse(resolution, pending.question.taskRef)
          : present(resolution, paymaster),
      ),
    )
  })

  /** Re-read a recent resolution, for a caller whose connection dropped. */
  app.get('/v1/questions/:id', (c) => {
    const resolution = store.recent.get(c.req.param('id'))
    if (!resolution) return c.json({ error: 'unknown question id' }, 404)
    return c.json(present(resolution, paymaster))
  })

  app.get('/docs', (c) => c.text(docs(config), 200, { 'content-type': 'text/markdown; charset=utf-8' }))

  return app
}

/**
 * Where a refund goes: the account the caller's credential says it paid from.
 *
 * Without this every unresolved question kept the caller's money, which is the one
 * failure this product says it will never have. The `source` is asserted by the
 * caller rather than proven, but the only refund it can redirect is the caller's
 * own, so trusting it costs nobody else anything.
 */
function payerOf(request: Request): `0x${string}` | null {
  try {
    const source = Credential.fromRequest(request).source
    const address = source?.split(':').at(-1)
    return address && /^0x[0-9a-fA-F]{40}$/.test(address) ? (address as `0x${string}`) : null
  } catch {
    return null
  }
}

/** The cost-of-error reasoning, in the wire's dollars, so a caller can check it. */
export function adviceBody(advice: CostAdvice) {
  return {
    worth_asking: advice.worthAsking,
    price: centsToDollars(advice.priceCents),
    target_confidence: Number(advice.targetConfidence.toFixed(3)),
    expected_loss_without: advice.expectedLossWithoutCents === null ? null : centsToDollars(Math.round(advice.expectedLossWithoutCents)),
    expected_cost_with: centsToDollars(Math.round(advice.expectedCostWithCents)),
    reason: advice.reason,
  }
}

/** Whether this question came in as a forwarded A2A task, so it should go back as one. */
function looksLikeTask(question: Question): boolean {
  return question.taskRef !== undefined
}

/**
 * The caller-facing view of a resolution.
 *
 * Every field a caller needs to decide whether to trust the answer is here,
 * including the ones that make us look worse: the responders who disagreed, the
 * confidence when it fell short, and the refund when it did. A caller learning that
 * its question was genuinely ambiguous is getting something real out of the round
 * trip, and hiding that would only teach it to trust answers it should not.
 */
export function present(resolution: Resolution, paymaster: Paymaster): Record<string, unknown> {
  return {
    question_id: resolution.questionId,
    status: resolution.status,
    answer: resolution.value,
    confidence: Number(resolution.confidence.toFixed(4)),
    responders: resolution.responders,
    agreement: resolution.agreement,
    latency_ms: resolution.latencyMs,
    evidence: resolution.evidence.map((e) => ({
      worker: e.workerId,
      answer: e.value,
      reputation: Number(e.reputation.toFixed(3)),
    })),
    wages_paid_cents: resolution.wagesCents,
    receipts: resolution.receipts.map((r) => ({
      worker: r.workerId,
      amount_cents: r.amountCents,
      tx: r.txHash,
      explorer: paymaster.explorerUrl(r.txHash),
      memo: r.memo,
      fee_sponsored: r.feeSponsored,
    })),
    ...(resolution.refund === undefined
      ? {}
      : {
          refunded: {
            amount_cents: resolution.refund.amountCents,
            tx: resolution.refund.txHash,
            explorer: paymaster.explorerUrl(resolution.refund.txHash),
          },
        }),
  }
}

/** The `WWW-Authenticate: Payment` header for the challenge. */
function challengeHeader(challenge: unknown, priceCents: number, config: Config): string {
  const nonce = typeof challenge === 'object' && challenge !== null && 'id' in challenge ? String(challenge.id) : ''
  return [
    `Payment realm="${new URL(config.publicUrl).hostname}"`,
    `amount="${centsToDollars(priceCents)}"`,
    'currency="USD"',
    `recipient="${config.recipient}"`,
    nonce ? `nonce="${nonce}"` : '',
  ]
    .filter(Boolean)
    .join(', ')
}

function docs(config: Config): string {
  return `# Quorum

For the mistakes your agent cannot catch in itself. When the OCR misread a
figure, every model after it reads the same wrong text; when a store is a
lookalike, it was built to pass your checks; when your agent wrote both drafts,
it grades its own work. Retrying or asking a bigger model shares the blind spot.
A person looking at the evidence does not.

## When to ask

When acting on a wrong answer would cost more than asking. Send
\`cost_of_error\` (what the mistake would cost you, in dollars) and
\`caller_confidence\` (how sure you are of your own guess), and Quorum does
the arithmetic: it prices the question from the cost, and when your guess is
the better bet it answers \`not_worth_asking\` and charges nothing.

## Ask

    POST ${config.publicUrl}/v1/questions

    {
      "question": "Is the total on this receipt 45.00 or 4.50?",
      "kind": "disambiguate",
      "context": { "image_url": "https://...", "extracted": { "total": "4.50", "confidence": 0.41 } },
      "answer_schema": { "type": "enum", "options": ["45.00", "4.50", "neither"] },
      "cost_of_error": "40.50",
      "caller_confidence": 0.41,
      "deadline_ms": 30000,
      "task_ref": "a2a:task:01J8XQ.../input-required"
    }

Returns \`402\` with a payment challenge and a \`claim_url\`. Pay, then:

    POST ${config.publicUrl}/v1/questions/{id}/claim
    Authorization: Payment <credential>

\`max_price\` may be sent instead of, or as well as, \`cost_of_error\`: it is a
ceiling, and the price also sets how sure the answer must be.

The connection is held open until the question resolves. Statuses are
\`resolved\`, \`no_consensus\`, \`timeout\` and \`refused\`; the last three refund you.
\`not_worth_asking\` comes back before any payment.

You may also POST an A2A \`input-required\` task status unmodified, with a
\`dev.quorum.resolver\` entry in its metadata carrying \`answer_schema\` and
\`cost_of_error\` or \`max_price\`. The response is the task status to resume with.

## What it is for

Five kinds of question, each answered only by people assessed in it:

- disambiguate: two readings of the same evidence, when the extraction cannot choose
- verify: whether something is what it claims, when it was built to look like it is
- match: whether two records are the same thing, when a similarity score is not a decision
- categorise: which of your categories an item falls in, at the boundary between two
- compare: which of two candidates is better, when your agent produced both

Not approvals: no question here carries authority over your systems, and
questions that would are refused.

## Network

${config.network} (${config.network === 'testnet' ? 'Moderato; chain fees are sponsored so workers hold no gas asset' : 'mainnet'}).
`
}
