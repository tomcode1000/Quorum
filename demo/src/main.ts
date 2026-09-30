import { inputRequiredResponse, parseInputRequired, priceAsk, type Question, type Resolution } from '@quorum/core'
import { Router, Store, GOLDEN_SEED } from '@quorum/gateway'
import { CHAIN_IDS, chainFor, createQuorumClient, fundFromFaucet, type Network } from '@quorum/paymaster'
import { Mppx, tempo } from 'mppx/client'
import { randomBytes, randomUUID } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { CHECKS, inputRequired, runAlone, show, type Check, type Outcome } from './chain.js'
import { FakePaymaster } from './fake-paymaster.js'
import { startSimulatedWorker } from './worker-sim.js'

/**
 * The comparison.
 *
 * One accounts-payable agent closing out its week, run twice. It meets three moments
 * where it might be wrong and cannot find out on its own, because every check it
 * could run shares its blind spot. The first run is the world as it is: it reaches
 * `input-required`, nobody is there, and it goes with its guess three times. Nothing
 * errors. The second run sends those same three `input-required` states to Quorum,
 * each priced by what being wrong there would cost, and a person answers each.
 *
 * By default this runs in-process against simulated workers and an in-memory
 * paymaster, so it needs no keys and no network, and it says so on screen. Pass
 * `--live` to run it against a gateway on Tempo, where every 402, wage and refund
 * is a real transaction.
 */

type Settled = { outcome: Outcome; resolution: Resolution; priceCents: number; reason: string }

async function main(): Promise<void> {
  const live = process.argv.includes('--live')
  const seed = seedFromArgs(process.argv)
  header()

  const alone = runAlone()
  report('Run 1 — today: nobody on input-required', alone)

  const answered = live ? await runLive() : await runInProcess(seed)
  report(
    'Run 2 — the same agent, input-required sent to Quorum',
    answered.map((s) => s.outcome),
  )
  settlement(answered, live, seed)
  verdict(alone, answered)
}

/** What the agent does with an answer, or without one. */
function outcomeOf(check: Check, resolution: Resolution, priceCents: number, reason: string, trace: string[]): Outcome {
  const resolved = resolution.status === 'resolved'
  const value = resolved ? normalise(check, resolution.value) : null
  return {
    check,
    acted: value,
    flagged: !resolved,
    trace: [
      `unsure (confidence ${check.confidence.toFixed(2)}); a mistake here costs $${Number(check.costOfError).toLocaleString('en-US', { minimumFractionDigits: 2 })}.`,
      `Quorum priced the question at $${(priceCents / 100).toFixed(2)}: ${reason}.`,
      ...trace,
      resolved
        ? `answer: ${show(value)}. It ${value === check.truth ? check.answered : check.alone}.`
        : `no answer (${resolution.status}), and it says so: it holds this step rather than guessing.`,
    ],
  }
}

/** Answers come back as the wire sends them; a boolean may arrive as text. */
function normalise(check: Check, value: unknown): boolean | string | null {
  if (check.options !== 'boolean') return value === null || value === undefined ? null : String(value)
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 'yes') return true
  if (value === 'false' || value === 'no') return false
  return null
}

/** Run 2, in process: real parsing, real pricing, real engine; simulated people, in-memory chain. */
async function runInProcess(seed: number | null): Promise<Settled[]> {
  // Every source of chance — golden seeding, exploration, each simulated worker's
  // accuracy — draws from one seeded stream, so a given seed replays exactly.
  const random = seed === null ? Math.random : seeded(seed)
  const store = new Store()
  store.golden.push(...GOLDEN_SEED)
  const paymaster = new FakePaymaster()
  let trace: string[] = []

  const router = new Router({
    store,
    paymaster,
    random,
    onEvent: (event) => {
      if (event.type === 'worker.asked')
        trace.push(
          event.calibration
            ? `Quorum gave ${event.workerId} a known-answer check first: paid, not billed to the agent.`
            : `Quorum asked ${event.workerId}: ${event.reason}.`,
        )
      if (event.type === 'answer.received')
        trace.push(`${event.workerId} answered ${show(event.value as boolean | string)}; confidence now ${event.confidence.toFixed(3)}.`)
      if (event.type === 'worker.paid') trace.push(`Quorum paid ${event.workerId} ${event.amountCents}c.`)
      if (event.type === 'caller.refunded') trace.push(`Quorum refunded the agent ${event.amountCents}c.`)
    },
  })

  // Three people on shift, each passed in the three skills this afternoon needs. One
  // is proven, two are newer, and the newest is not perfectly accurate — which is what
  // gives the escalation ladder anything to do.
  const kinds = [...new Set(CHECKS.map((check) => check.kind))]
  const history = (agreements: number, disagreements: number) =>
    Object.fromEntries(kinds.map((kind) => [kind, { agreements, disagreements, unresolved: 1 }]))
  store.upsertWorker('amara', `0xA1${'00'.repeat(19)}`).record = { workerId: 'amara', byKind: history(180, 4) }
  store.upsertWorker('joel', `0xB2${'00'.repeat(19)}`).record = { workerId: 'joel', byKind: history(46, 3) }
  store.upsertWorker('nadia', `0xB3${'00'.repeat(19)}`)
  for (const worker of store.workers.values()) for (const kind of kinds) worker.skills[kind] = 'passed'

  const promptFor = (questionId: string) => store.live.get(questionId)?.question.prompt ?? ''
  const stops = [
    startSimulatedWorker(router, { workerId: 'amara', promptFor, accuracy: 1, thinkMs: 2_400, random }),
    startSimulatedWorker(router, { workerId: 'joel', promptFor, accuracy: 0.95, thinkMs: 3_100, selfConfidence: 0.9, random }),
    startSimulatedWorker(router, { workerId: 'nadia', promptFor, accuracy: 0.85, thinkMs: 3_600, selfConfidence: 0.8, random }),
  ]

  try {
    const settled: Settled[] = []
    for (const check of CHECKS) {
      trace = []
      const taskId = `a2a:task:${randomUUID()}`
      // The gateway's own parsing and pricing, not a demo shortcut: this is the A2A
      // status going in exactly as the agent emitted it.
      const parsed = parseInputRequired(inputRequired(taskId, check))
      const pricing = priceAsk(parsed)
      if (pricing.kind !== 'quoted' || !pricing.quote.ok || !pricing.advice)
        throw new Error(`the demo expected ${check.id} to be worth asking`)

      const question: Question = {
        id: `q_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
        kind: parsed.kind,
        prompt: parsed.prompt,
        schema: parsed.schema,
        priceCents: pricing.quote.priceCents,
        timeoutMs: parsed.timeoutMs,
        attachments: parsed.attachments,
        taskRef: taskId,
        ...(parsed.callerConfidence === undefined ? {} : { callerConfidence: parsed.callerConfidence }),
      }
      const resolution = await router.resolve(question, { payer: `0xC3${'00'.repeat(19)}` })
      // Round-tripped through the A2A response the agent would actually resume from.
      inputRequiredResponse(resolution, taskId)
      settled.push({
        outcome: outcomeOf(check, resolution, question.priceCents, pricing.advice.reason, trace),
        resolution,
        priceCents: question.priceCents,
        reason: pricing.advice.reason,
      })
    }
    return settled
  } finally {
    for (const stop of stops) stop()
  }
}

/** Run 2, against a live gateway: real 402s, real credentials, real wages on chain. */
async function runLive(): Promise<Settled[]> {
  const base = process.env.QUORUM_URL ?? 'http://localhost:8787'
  const network: Network = process.env.QUORUM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

  // The agent pays from its own account, never the gateway's treasury: a resolver that
  // paid itself would prove nothing about the 402. Without a configured key, it is a
  // wallet that did not exist a moment ago, funded from the testnet faucet.
  const payer = await payerAccount(network)
  const mppx = Mppx.create({
    methods: [tempo({ account: payer.account, expectedChainId: CHAIN_IDS[network] })],
    // Leave global fetch alone: each first request must see the raw 402.
    polyfill: false,
  })
  console.log(`  The agent pays from ${payer.account.address}${payer.fresh ? ', funded from the faucet seconds ago' : ''}.`)
  console.log('')

  const settled: Settled[] = []
  for (const check of CHECKS) {
    const asked = await fetch(`${base}/v1/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(inputRequired(`a2a:task:${randomUUID()}`, check)),
    })
    if (asked.status === 503)
      throw new Error(`nobody who has passed ${check.kind} questions is online. Sign a worker in, pass that skill, and try again.`)
    if (asked.status !== 402) throw new Error(`expected a 402 payment challenge, got ${asked.status}: ${await asked.text()}`)
    const challenge = (await asked.json()) as { quote_cents: number; claim_url: string; advice?: { reason: string } }

    // mppx sees the claim's own 402, signs a TIP-20 transfer for exactly the quoted
    // amount to the advertised recipient, and retries with the credential attached.
    const claimed = await mppx.fetch(challenge.claim_url, { method: 'POST' })
    if (!claimed.ok) throw new Error(`claim failed with ${claimed.status}: ${await claimed.text()}`)
    const body = (await claimed.json()) as Record<string, unknown>
    const metadata = (body.metadata as Record<string, Record<string, unknown>> | undefined)?.['dev.quorum.resolver'] ?? {}
    const status = String(metadata.status ?? 'unknown')
    const resolution = resolutionFromTask(metadata, status, extractAnswer(body))
    const reason = challenge.advice?.reason ?? 'priced by the gateway'
    settled.push({
      outcome: outcomeOf(check, resolution, challenge.quote_cents, reason, ['payment verified; a person answered.']),
      resolution,
      priceCents: challenge.quote_cents,
      reason,
    })
  }
  return settled
}

/**
 * The resolver's evidence block, read back out of the A2A task it answered with.
 *
 * A forwarded `input-required` task is answered as a task, so the resolution travels
 * under the extension's metadata key in snake case rather than as the plain object
 * the in-process run gets.
 */
function resolutionFromTask(metadata: Record<string, unknown>, status: string, answer: string): Resolution {
  const receipts = (metadata.receipts as { tx_hash: string; memo: string; amount_cents: number }[] | undefined) ?? []
  const refundTx = metadata.refund_tx as string | undefined
  return {
    questionId: '',
    status: status as Resolution['status'],
    value: status === 'resolved' ? answer : null,
    confidence: Number(metadata.confidence ?? 0),
    responders: Number(metadata.responders ?? 0),
    agreement: (metadata.agreement as Resolution['agreement']) ?? 'none',
    evidence: (metadata.evidence as Resolution['evidence']) ?? [],
    latencyMs: Number(metadata.latency_ms ?? 0),
    wagesCents: receipts.reduce((sum, r) => sum + r.amount_cents, 0),
    receipts: receipts.map((r, index) => ({
      workerId: `worker ${index + 1}`,
      to: '0x' as `0x${string}`,
      amountCents: r.amount_cents,
      txHash: r.tx_hash,
      memo: r.memo as `0x${string}`,
      feeSponsored: true,
    })),
    ...(refundTx === undefined ? {} : { refund: { to: '0x', amountCents: 0, txHash: refundTx, memo: '0x' } }),
    resolvedAt: Date.now(),
  } as Resolution
}

/** The agent's wallet: configured, or created and funded on the spot on testnet. */
async function payerAccount(network: Network): Promise<{ account: ReturnType<typeof privateKeyToAccount>; fresh: boolean }> {
  const configured = process.env.QUORUM_DEMO_PAYER_KEY
  if (configured && configured !== '0x') return { account: privateKeyToAccount(configured as `0x${string}`), fresh: false }
  if (network !== 'testnet')
    throw new Error('set QUORUM_DEMO_PAYER_KEY to a funded account; a fresh payer can only be funded on testnet')

  const key = `0x${randomBytes(32).toString('hex')}` as const
  const client = createQuorumClient({
    network,
    privateKey: key,
    ...(process.env.QUORUM_RPC_URL ? { rpcUrl: process.env.QUORUM_RPC_URL } : {}),
  })
  await fundFromFaucet(client, client.account.address)
  return { account: privateKeyToAccount(key), fresh: true }
}

function extractAnswer(body: Record<string, unknown>): string {
  if (typeof body.answer === 'string') return body.answer
  const status = body.status as { message?: { parts?: { text?: string }[] } } | undefined
  return status?.message?.parts?.[0]?.text ?? '(none)'
}

const rule = () => console.log('  ' + '─'.repeat(68))

function header(): void {
  console.log('')
  console.log('  QUORUM — the errors an agent cannot see in itself')
  rule()
  console.log('  An accounts-payable agent closes out its week: one receipt to record,')
  console.log('  one supplier invoice to pay. Three times it might be wrong, and three')
  console.log('  times every check it could run itself shares the same blind spot.')
  console.log('  The same agent runs twice.')
  console.log('')
}

function report(title: string, outcomes: readonly Outcome[]): void {
  console.log(`  ${title}`)
  rule()
  for (const outcome of outcomes) {
    const { check } = outcome
    const right = outcome.acted === check.truth
    console.log(`    ${check.capability} — ${check.id}`)
    for (const line of outcome.trace) console.log(`      ${line}`)
    console.log(`      ${right ? 'Correct.' : outcome.flagged ? 'Unresolved, and said so.' : 'WRONG, and nothing flagged it.'}`)
    console.log('')
  }
}

function settlement(settled: readonly Settled[], live: boolean, seed: number | null): void {
  const network: Network = process.env.QUORUM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
  const explorer = chainFor(network).blockExplorers?.default.url ?? ''
  const spent = settled.reduce((sum, s) => sum + s.priceCents, 0)
  const refunded = settled.filter((s) => s.resolution.refund).reduce((sum, s) => sum + s.priceCents, 0)

  console.log('  Settlement')
  rule()
  for (const { outcome, resolution, priceCents } of settled) {
    console.log(
      `    ${outcome.check.id.padEnd(15)} $${(priceCents / 100).toFixed(2)}  ${resolution.status}, ${resolution.responders} ${resolution.responders === 1 ? 'person' : 'people'}, ${((resolution.latencyMs ?? 0) / 1000).toFixed(1)}s, confidence ${(resolution.confidence ?? 0).toFixed(3)}`,
    )
    for (const receipt of resolution.receipts ?? [])
      console.log(
        live
          ? `      ${receipt.workerId}: ${receipt.amountCents}c  ${explorer}/tx/${receipt.txHash}`
          : `      ${receipt.workerId}: ${receipt.amountCents}c`,
      )
    if (resolution.refund) console.log(live ? `      refunded: ${explorer}/tx/${resolution.refund.txHash}` : '      refunded to the agent')
  }
  console.log('')
  console.log(`    The agent paid $${((spent - refunded) / 100).toFixed(2)} for three answers${refunded ? `, after $${(refunded / 100).toFixed(2)} came back` : ''}.`)
  console.log('')
  if (!live) {
    console.log('    Run mode:   in-process, simulated people, in-memory paymaster.')
    console.log('                No chain was touched and no real person answered.')
    console.log(
      seed === null
        ? '                Unseeded: every run can take a different path.'
        : `                Seed ${seed}; the same seed replays exactly. --random for a fresh draw.`,
    )
    console.log('                Run with --live against a funded gateway for real settlement.')
  } else {
    console.log(`    Run mode:   live gateway on ${chainFor(network).name}: real MPP charges, real TIP-20 wages.`)
    console.log('                Every link above opens the transaction on the Tempo explorer.')
  }
  console.log('')
}

function verdict(alone: readonly Outcome[], settled: readonly Settled[]): void {
  const wrongAlone = alone.filter((o) => o.acted !== o.check.truth)
  const wrongWith = settled.filter((s) => s.outcome.acted !== null && s.outcome.acted !== s.outcome.check.truth)
  const unresolved = settled.filter((s) => s.outcome.flagged)
  console.log('  What changed')
  rule()
  console.log(`    Alone:       ${wrongAlone.length} of ${alone.length} decisions wrong, none of them flagged:`)
  for (const o of wrongAlone) console.log(`                 it ${o.check.alone}.`)
  console.log(
    `    With Quorum: ${wrongWith.length} wrong${unresolved.length ? `, ${unresolved.length} held back because no answer could be had` : ''}.`,
  )
  console.log('')
  console.log('    Nothing in the first run raised an error. That is the failure: not a')
  console.log('    crash, but plausible decisions that no automated check could catch,')
  console.log('    because every check shares the agent\'s blind spot.')
  console.log('')
}


/** The default seed is one whose path is typical: a proven worker, then second opinions. */
const DEFAULT_SEED = 2

function seedFromArgs(argv: readonly string[]): number | null {
  if (argv.includes('--random')) return null
  const at = argv.indexOf('--seed')
  const value = at === -1 ? DEFAULT_SEED : Number(argv[at + 1])
  if (!Number.isInteger(value)) throw new Error('--seed takes an integer')
  return value
}

/** mulberry32: small, fast, and good enough to make a demo replayable. */
function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

main().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
