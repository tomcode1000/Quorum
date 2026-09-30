import { randomUUID } from 'node:crypto'
import { CHECKS, show } from './chain.js'

/**
 * Agent A: the accounts-payable agent that assigns the week's work.
 *
 * It finds Agent B from its A2A agent card, sends it the three steps over
 * `message/send`, and acts on each answer: posts the expense, pays or holds the
 * invoice, opens the payment link or does not. It never talks to Quorum. From
 * where A sits, B simply came back right, which is what a resolver on
 * `input-required` is for.
 *
 *   npm run agent-a
 */

const B = process.env.AGENT_B_URL ?? 'http://localhost:9090'
const log = (line = '') => console.log(line ? `  ${line}` : '')

type Rpc = {
  result?: {
    status: { state: string; message?: { parts?: { text?: string }[] } }
    artifacts?: { parts: { kind: string; data?: Record<string, unknown> }[] }[]
  }
  error?: { message: string }
}

async function main(): Promise<void> {
  const card = (await fetch(`${B}/.well-known/agent-card.json`).then((r) => r.json())) as { name: string; url: string }
  log()
  log('AGENT A — accounts payable, closing out the week')
  log('─'.repeat(66))
  log(`Found ${card.name} at ${card.url}`)
  log()

  const contextId = `ctx_week_${randomUUID().slice(0, 8)}`
  let wrong = 0
  let unresolved = 0

  for (const check of CHECKS) {
    log(`→ B: ${check.id}`)
    const response = (await fetch(card.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: randomUUID(),
        method: 'message/send',
        params: {
          message: {
            role: 'user',
            messageId: randomUUID(),
            contextId,
            parts: [
              { kind: 'text', text: check.question },
              { kind: 'data', data: { step: check.id } },
            ],
          },
        },
      }),
    }).then((r) => r.json())) as Rpc

    if (response.error || response.result?.status.state !== 'completed') {
      unresolved += 1
      const why = response.error?.message ?? response.result?.status.message?.parts?.[0]?.text ?? 'no reason given'
      log(`← B failed: ${why.replace(/\.$/, '')}. Holding this step.`)
      log()
      continue
    }

    const data = response.result.artifacts?.[0]?.parts.find((p) => p.kind === 'data')?.data ?? {}
    const answer = (data.answer ?? null) as boolean | string | null
    if (answer === null) {
      unresolved += 1
      log('← B could not tell, and said so. Holding this step for review.')
    } else {
      const right = answer === check.truth
      if (!right) wrong += 1
      log(`← B: ${show(answer)}${data.escalated ? ' (a person checked)' : ''}`)
      log(`  Agent A ${right ? check.answered : check.alone}.`)
    }
    log()
  }

  log('─'.repeat(66))
  log(
    wrong === 0
      ? `Week closed with no wrong decisions${unresolved ? `, ${unresolved} held for review` : ''}.`
      : `Week closed with ${wrong} wrong ${wrong === 1 ? 'decision' : 'decisions'}, and nothing in this chain flagged any of them.`,
  )
  log()
}

main().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n  Is Agent B running? npm run agent-b\n`)
  process.exit(1)
})
