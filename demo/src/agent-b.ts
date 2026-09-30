import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { CHECKS, show, type Check } from './chain.js'
import { connectToQuorum, explorer, type QuorumClient } from './quorum-client.js'

/**
 * Agent B: an invoice-processing agent, served over A2A.
 *
 * A separate process from Agent A and from Quorum, speaking the A2A protocol:
 * an agent card at /.well-known/agent-card.json and JSON-RPC `message/send` at /.
 * Agent A hands it work; it does that work, and at each step it is unsure of it
 * enters `input-required`, exactly as the A2A specification says a careful agent
 * should.
 *
 * With nobody watching that state, it would have to guess. Here it forwards the
 * paused task to Quorum instead, with what a wrong answer would cost, pays the 402
 * from its own wallet, and resumes with the answer a person gave. Run it with
 * `--alone` to see the same agent with nobody on `input-required`.
 *
 *   npm run agent-b            forwards input-required to Quorum
 *   npm run agent-b -- --alone goes with its own guess, as agents do today
 *
 * AGENT_B_MAX_PRICE sets a price ceiling of B's own, in dollars. At the full $5
 * a question must reach 0.99 confidence, which takes two independent people; a
 * lower ceiling lets one proven person settle it, which is what a single-person
 * test needs.
 */

const PORT = Number(process.env.AGENT_B_PORT ?? 9090)
const alone = process.argv.includes('--alone')

const card = {
  protocolVersion: '0.3.0',
  name: 'Agent B: invoice processing',
  description:
    'Reads receipts and supplier invoices and prepares them for payment. When it cannot tell, it enters input-required and forwards the question to Quorum.',
  url: `http://localhost:${PORT}/`,
  preferredTransport: 'JSONRPC',
  version: '0.1.0',
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ['application/json', 'text/plain'],
  defaultOutputModes: ['application/json'],
  skills: [
    {
      id: 'process-invoice-step',
      name: 'Process one step of an invoice',
      description: 'Read a total, confirm a supplier, or check a payment link.',
      tags: ['accounts-payable', 'invoices'],
      examples: CHECKS.map((check) => check.id),
    },
  ],
}

const log = (line = '') => console.log(line ? `  ${line}` : '')

async function handle(check: Check, quorum: QuorumClient | null): Promise<Record<string, unknown>> {
  log(`A asked me to handle ${check.id}.`)
  log(`  My own read: ${show(check.guess)}, ${Math.round(check.confidence * 100)}% sure. A mistake here costs $${Number(check.costOfError).toLocaleString('en-US', { minimumFractionDigits: 2 })}.`)

  if (!quorum) {
    log('  Entering input-required. Nobody is listening, so I go with my guess.')
    log()
    return { answer: check.guess, confidence: check.confidence, escalated: false }
  }

  log(`  Entering input-required, and forwarding it to Quorum (${check.capability}).`)
  const asked = await quorum.ask(check)
  if (asked.status === 'not_worth_asking') {
    log(`  Quorum: not worth a person. ${asked.reason}. I go with my guess.`)
    log()
    return { answer: check.guess, confidence: check.confidence, escalated: false, reason: asked.reason }
  }

  const { resolution, priceCents, reason } = asked
  log(`  Quorum priced it at $${(priceCents / 100).toFixed(2)}: ${reason}.`)
  if (resolution.status !== 'resolved') {
    log(`  No answer (${resolution.status}); refunded. I report that I could not tell, rather than guess.`)
    log()
    return { answer: null, unresolved: resolution.status, escalated: true, price_cents: priceCents }
  }

  const answer = normalise(check, resolution.value)
  log(
    `  ${resolution.responders} ${resolution.responders === 1 ? 'person' : 'people'} answered ${show(answer)}, confidence ${resolution.confidence.toFixed(3)}, in ${((resolution.latencyMs ?? 0) / 1000).toFixed(1)}s.`,
  )
  for (const receipt of resolution.receipts ?? []) log(`    wage ${receipt.amountCents}c  ${explorer}/tx/${receipt.txHash}`)
  log()
  return {
    answer,
    confidence: resolution.confidence,
    escalated: true,
    price_cents: priceCents,
    receipts: (resolution.receipts ?? []).map((r) => `${explorer}/tx/${r.txHash}`),
  }
}

function normalise(check: Check, value: unknown): boolean | string | null {
  if (check.options !== 'boolean') return value === null || value === undefined ? null : String(value)
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === 'yes') return true
  if (value === 'false' || value === 'no') return false
  return null
}

function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

async function main(): Promise<void> {
  const quorum = alone ? null : await connectToQuorum()

  createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/.well-known/agent-card.json') return send(res, 200, card)
    if (req.method !== 'POST') return send(res, 404, { error: 'not found' })

    const rpc = (await body(req).catch(() => null)) as {
      id?: unknown
      method?: string
      params?: { message?: { contextId?: string; parts?: { kind: string; data?: { step?: string } }[] } }
    } | null
    const reply = (result: unknown) => send(res, 200, { jsonrpc: '2.0', id: rpc?.id ?? null, result })
    const fail = (code: number, message: string) => send(res, 200, { jsonrpc: '2.0', id: rpc?.id ?? null, error: { code, message } })

    if (rpc?.method !== 'message/send') return fail(-32601, 'method not found')
    const step = rpc.params?.message?.parts?.find((p) => p.kind === 'data')?.data?.step
    const check = CHECKS.find((c) => c.id === step)
    if (!check) return fail(-32602, `unknown step: ${String(step)}`)

    try {
      const result = await handle(check, quorum)
      reply({
        kind: 'task',
        id: `task_${randomUUID()}`,
        contextId: rpc.params?.message?.contextId ?? `ctx_${randomUUID()}`,
        status: { state: 'completed', timestamp: new Date().toISOString() },
        artifacts: [{ artifactId: randomUUID(), name: check.id, parts: [{ kind: 'data', data: result }] }],
      })
    } catch (error) {
      log(`  Failed: ${error instanceof Error ? error.message : String(error)}`)
      log()
      reply({
        kind: 'task',
        id: `task_${randomUUID()}`,
        contextId: rpc.params?.message?.contextId ?? `ctx_${randomUUID()}`,
        status: {
          state: 'failed',
          message: { role: 'agent', parts: [{ kind: 'text', text: error instanceof Error ? error.message : String(error) }] },
        },
      })
    }
  }).listen(PORT, () => {
    log()
    log(`AGENT B — invoice processing, A2A on http://localhost:${PORT}`)
    log('─'.repeat(66))
    log(
      alone
        ? 'Running alone: nobody on input-required, so every unsure step is a guess.'
        : `input-required goes to Quorum; I pay from ${quorum?.payer}${quorum?.fresh ? ', funded from the faucet just now' : ''}.`,
    )
    log('Waiting for Agent A.')
    log()
  })
}

main().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
