import { inputRequiredResponse, parseInputRequired, quote, type Question, type Resolution } from '@quorum/core'
import { Router, Store, GOLDEN_SEED } from '@quorum/gateway'
import { randomUUID } from 'node:crypto'
import { RECEIPT, inputRequired, runWithoutResolver, type ChainResult } from './chain.js'
import { FakePaymaster } from './fake-paymaster.js'
import { startSimulatedWorker } from './worker-sim.js'

/**
 * The two-run comparison.
 *
 * The same A2A chain, the same ambiguous receipt, twice. The first run is the world
 * as it is: the agent reaches `input-required`, finds nobody there, guesses, and the
 * chain completes with a plausible wrong number that nothing flags. The second run
 * routes that same `input-required` status to a person, who answers in seconds and is
 * paid for it, and the chain completes correctly.
 *
 * The argument this makes is about correctness rather than labour. Nothing in the
 * first run is broken, which is the whole problem: there is no error to catch, no
 * retry to fire and no alert to raise, because the chain does not know it is wrong.
 * What the second run adds is not cheaper work — it is a way for an agent to stop
 * being confidently wrong.
 *
 * By default this runs in-process against a simulated worker and an in-memory
 * paymaster, so it needs no keys and no network, and it says so on screen. Pass
 * `--live` to run it against a gateway holding real testnet funds, where the 402 and
 * the wage are real.
 */

async function main(): Promise<void> {
  const live = process.argv.includes('--live')
  header()

  const first = runWithoutResolver()
  report('Run 1 — today: no resolver', first, { truth: RECEIPT.truth })

  const second = live ? await runLive() : await runInProcess()
  report('Run 2 — same chain, input-required resolved', second.chain, { truth: RECEIPT.truth })
  settlement(second.resolution, live)

  verdict(first, second.chain)
}

/** Run 2, in process: real router, real engine, simulated worker, in-memory chain. */
async function runInProcess(): Promise<{ chain: ChainResult; resolution: Resolution }> {
  const store = new Store()
  store.golden.push(...GOLDEN_SEED)
  const paymaster = new FakePaymaster()
  const trace: string[] = []

  const router = new Router({
    store,
    paymaster,
    onEvent: (event) => {
      if (event.type === 'worker.asked')
        trace.push(`Quorum: asked ${event.workerId}${event.exploratory ? ' (exploration)' : ''} — ${event.reason}`)
      if (event.type === 'answer.received')
        trace.push(`Quorum: ${event.workerId} answered ${String(event.value)}; confidence now ${event.confidence.toFixed(3)}`)
      if (event.type === 'worker.paid')
        trace.push(`Quorum: paid ${event.workerId} ${event.amountCents}c — ${event.txHash.slice(0, 18)}…`)
      if (event.type === 'caller.refunded') trace.push(`Quorum: refunded the caller ${event.amountCents}c`)
    },
  })

  // Three people are on shift: one proven, two newer, and the newest is not
  // perfectly accurate — which is what gives the escalation ladder anything to do.
  // Three matters rather than two: a pool of two has nowhere to escalate to when the
  // first pair disagree, so every disagreement becomes a refund.
  store.upsertWorker('amara', '0xA1' + '00'.repeat(19) as `0x${string}`).record = {
    workerId: 'amara',
    byKind: { disambiguate: { agreements: 180, disagreements: 4, unresolved: 2 } },
  }
  store.upsertWorker('joel', '0xB2' + '00'.repeat(19) as `0x${string}`).record = {
    workerId: 'joel',
    byKind: { disambiguate: { agreements: 46, disagreements: 3, unresolved: 1 } },
  }
  store.upsertWorker('nadia', '0xB3' + '00'.repeat(19) as `0x${string}`)

  const stops = [
    startSimulatedWorker(router, { workerId: 'amara', accuracy: 1, thinkMs: 2_400 }),
    startSimulatedWorker(router, { workerId: 'joel', accuracy: 0.95, thinkMs: 3_100, selfConfidence: 0.9 }),
    startSimulatedWorker(router, { workerId: 'nadia', accuracy: 0.85, thinkMs: 3_600, selfConfidence: 0.8 }),
  ]

  try {
    const chain: string[] = []
    chain.push('A: new invoice from Meridian Print & Supply. Delegating extraction to B.')
    chain.push(`B: OCR read the total as ${RECEIPT.ocr.total.reading} with confidence ${RECEIPT.ocr.total.confidence.toFixed(2)}.`)
    chain.push('B: entering input-required, and this time forwarding that status to a resolver.')

    const taskId = `a2a:task:${randomUUID()}`
    const task = inputRequired(taskId)

    // The gateway's own parsing, not a demo shortcut: this is the A2A status object
    // going in exactly as Agent B emitted it.
    const parsed = parseInputRequired(task)
    const priced = quote({ kind: parsed.kind, maxPriceCents: parsed.maxPriceCents, schema: parsed.schema })
    if (!priced.ok) throw new Error(priced.reason)
    chain.push(`Quorum: quoted ${(priced.priceCents / 100).toFixed(2)} for a ${parsed.kind} question. B pays the 402.`)

    const question: Question = {
      id: `q_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
      kind: parsed.kind,
      prompt: parsed.prompt,
      schema: parsed.schema,
      priceCents: priced.priceCents,
      timeoutMs: parsed.timeoutMs,
      attachments: parsed.attachments,
      taskRef: taskId,
      ...(parsed.callerConfidence === undefined ? {} : { callerConfidence: parsed.callerConfidence }),
    }

    const started = Date.now()
    const resolution = await router.resolve(question, { payer: '0xC3' + '00'.repeat(19) as `0x${string}` })
    chain.push(...trace)

    const resumed = inputRequiredResponse(resolution, taskId)
    const answered = resolution.status === 'resolved'
    chain.push(
      answered
        ? `B: resumed at ${resumed.status.state} with the answer ${String(resolution.value)} after ${((Date.now() - started) / 1000).toFixed(1)}s.`
        : `B: resolver returned ${resolution.status}, so the task is ${resumed.status.state}. B reports it could not read the total rather than guessing.`,
    )
    chain.push(
      answered
        ? `A: received completed with total ${String(resolution.value)}. Scheduling payment.`
        : 'A: received failed with a stated reason. Routing the invoice to a person internally.',
    )

    return {
      chain: {
        recordedTotal: answered ? String(resolution.value) : null,
        // A question that did not resolve is reported as unresolved, which is itself
        // the flag: the chain knows it does not know.
        flagged: !answered,
        trace: chain,
        action: answered
          ? `Scheduled a payment of $${String(resolution.value)} against invoice ${RECEIPT.invoiceRef}.`
          : 'Held the invoice for internal review, having said plainly that the total could not be read.',
      },
      resolution,
    }
  } finally {
    for (const stop of stops) stop()
  }
}

/** Run 2, against a live gateway: real 402, real credential, real wage on chain. */
async function runLive(): Promise<{ chain: ChainResult; resolution: Resolution }> {
  const base = process.env.QUORUM_URL ?? 'http://localhost:8787'
  const chain: string[] = []
  const taskId = `a2a:task:${randomUUID()}`

  chain.push('A: new invoice from Meridian Print & Supply. Delegating extraction to B.')
  chain.push('B: uncertain about the total. Entering input-required and forwarding it.')

  // The 402 round trip, exactly as an agent framework would do it: ask, get the
  // challenge, pay, claim, block on the answer.
  const asked = await fetch(`${base}/v1/questions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(inputRequired(taskId)),
  })
  if (asked.status !== 402) throw new Error(`expected a 402 payment challenge, got ${asked.status}: ${await asked.text()}`)

  const challenge = (await asked.json()) as { question_id: string; quote: string; claim_url: string }
  chain.push(`Quorum: 402, quote ${challenge.quote}. ${asked.headers.get('WWW-Authenticate') ?? ''}`)
  chain.push('B: paying by MPP charge and claiming.')

  // mppx patches global fetch on the client side, so the credential is attached here.
  const claimed = await fetch(challenge.claim_url, { method: 'POST' })
  const body = (await claimed.json()) as Record<string, unknown>
  chain.push(`Quorum: receipt ${claimed.headers.get('Payment-Receipt')?.slice(0, 24) ?? '(none)'}…`)

  const metadata = (body.metadata as Record<string, Record<string, unknown>> | undefined)?.['dev.quorum.resolver']
  const status = String(metadata?.status ?? body.status ?? 'unknown')
  const answer = extractAnswer(body)
  const resolved = status === 'resolved'

  chain.push(`B: resolver returned ${status}${resolved ? ` with ${answer}` : ''}.`)
  chain.push(resolved ? `A: scheduling payment of ${answer}.` : 'A: holding the invoice for internal review.')

  return {
    chain: {
      recordedTotal: resolved ? answer : null,
      flagged: !resolved,
      trace: chain,
      action: resolved
        ? `Scheduled a payment of $${answer} against invoice ${RECEIPT.invoiceRef}.`
        : 'Held the invoice for internal review.',
    },
    resolution: body as unknown as Resolution,
  }
}

function extractAnswer(body: Record<string, unknown>): string {
  if (typeof body.answer === 'string') return body.answer
  const status = body.status as { message?: { parts?: { text?: string }[] } } | undefined
  return status?.message?.parts?.[0]?.text ?? '(none)'
}

function header(): void {
  console.log('')
  console.log('  QUORUM — resolving the A2A input-required state')
  console.log('  ' + '─'.repeat(64))
  console.log(`  An accounts-payable chain reads a receipt whose total is genuinely`)
  console.log(`  ambiguous. The true total is $${RECEIPT.truth}; OCR read $${RECEIPT.ocr.total.reading} at`)
  console.log(`  ${RECEIPT.ocr.total.confidence.toFixed(2)} confidence. The same chain runs twice.`)
  console.log('')
}

function report(title: string, result: ChainResult, context: { truth: string }): void {
  console.log(`  ${title}`)
  console.log('  ' + '─'.repeat(64))
  for (const line of result.trace) console.log(`    ${line}`)
  console.log('')
  const correct = result.recordedTotal === context.truth
  console.log(`    Outcome:  ${result.action}`)
  console.log(`    Correct:  ${correct ? 'yes' : result.recordedTotal === null ? 'no answer given, and said so' : 'NO'}`)
  console.log(`    Flagged:  ${result.flagged ? 'yes' : 'no'}`)
  if (!correct && !result.flagged)
    console.log('    Note:     a wrong number entered the ledger and nothing in the chain knows.')
  console.log('')
}

function settlement(resolution: Resolution, live: boolean): void {
  console.log('  Settlement')
  console.log('  ' + '─'.repeat(64))
  console.log(`    Status:     ${resolution.status}`)
  console.log(`    Confidence: ${(resolution.confidence ?? 0).toFixed(4)}`)
  console.log(`    Responders: ${resolution.responders} (${resolution.agreement})`)
  console.log(`    Latency:    ${((resolution.latencyMs ?? 0) / 1000).toFixed(1)}s`)
  console.log(`    Wages paid: ${resolution.wagesCents}c across ${resolution.receipts?.length ?? 0} worker(s)`)
  for (const receipt of resolution.receipts ?? [])
    console.log(`      ${receipt.workerId}: ${receipt.amountCents}c, fee sponsored: ${receipt.feeSponsored}, tx ${receipt.txHash.slice(0, 20)}…`)
  if (resolution.refund) console.log(`    Refunded:   ${resolution.refund.amountCents}c to the caller`)
  console.log('')
  if (!live) {
    console.log('    Run mode:   in-process, simulated worker, in-memory paymaster.')
    console.log('                No chain was touched and no real person answered.')
    console.log('                Run with --live against a funded gateway for real settlement.')
  } else {
    console.log('    Run mode:   live gateway, real MPP charge, real TIP-20 wage.')
  }
  console.log('')
}

function verdict(without: ChainResult, withResolver: ChainResult): void {
  console.log('  What changed')
  console.log('  ' + '─'.repeat(64))
  console.log(`    Without a resolver: recorded $${without.recordedTotal}, flagged: ${without.flagged}.`)
  console.log(
    `    With one:           ${withResolver.recordedTotal === null ? 'declined to answer and said so' : `recorded $${withResolver.recordedTotal}`}, flagged: ${withResolver.flagged}.`,
  )
  console.log('')
  console.log('    The first run raised no error. That is the failure being sold against:')
  console.log('    not a crash, but a plausible wrong result that nothing can detect.')
  console.log('')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exit(1)
})
