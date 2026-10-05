import type { Resolution } from '@quorum/core'
import { CHAIN_IDS, chainFor, createQuorumClient, fundFromFaucet, type Network } from '@quorum/paymaster'
import { Mppx, tempo } from 'mppx/client'
import { randomBytes, randomUUID } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { inputRequired, type Check } from './chain.js'

/**
 * An agent's side of Quorum: forward `input-required`, pay the 402, get the answer.
 *
 * Shared by the demo's `--live` run and by Agent B, the standalone A2A server, so
 * both pay and parse exactly the same way. Nothing here is special to the demo: it
 * is what any agent framework would do with the task status it already emits.
 */

export const network: Network = process.env.QUORUM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
export const explorer = chainFor(network).blockExplorers?.default.url ?? ''

export type Asked =
  | {
      readonly status: 'answered'
      readonly resolution: Resolution
      readonly priceCents: number
      readonly reason: string
    }
  | { readonly status: 'not_worth_asking'; readonly reason: string }

export type Held =
  | { readonly status: 'held'; readonly priceCents: number; readonly reason: string; readonly deadlineAt: string }
  | { readonly status: 'not_worth_asking'; readonly reason: string }

export type QuorumClient = {
  readonly payer: `0x${string}`
  readonly fresh: boolean
  /** Ask and wait on the connection for the answer: for a step that cannot wait. */
  ask(check: Check, taskId?: string): Promise<Asked>
  /**
   * Ask and be called back: for a step that can wait. Quorum holds the question
   * until `holdMs` has passed, even with nobody online, and posts the answer to
   * `callbackUrl` whenever a person gives it.
   */
  askLater(check: Check, callbackUrl: string, holdMs: number, taskId?: string): Promise<Held>
}

/**
 * The agent's own wallet and a payment-aware fetch around it.
 *
 * The agent pays from its own account, never the gateway's treasury: a resolver that
 * paid itself would prove nothing about the 402. Without a configured key it is a
 * wallet that did not exist a moment ago, funded from the testnet faucet.
 */
export async function connectToQuorum(base = process.env.QUORUM_URL ?? 'http://localhost:8787'): Promise<QuorumClient> {
  const { account, fresh } = await payerAccount()
  /*
    A payment client per question, from the same wallet. One client reused across
    paid calls kept state from the previous payment attempt, and the second call
    failed inside mppx with "Body has already been consumed". Nothing here needs
    state to carry over between questions, so none is kept.
  */
  const payingFetch = () =>
    Mppx.create({
      methods: [tempo({ account, expectedChainId: CHAIN_IDS[network] })],
      // Leave global fetch alone: each first request must see the raw 402.
      polyfill: false,
    }).fetch

  /** Quote, pay the 402, claim. Returns the claim's response, or the reason it was declined. */
  const quoteAndClaim = async (task: ReturnType<typeof inputRequired>, check: Check) => {
    const asked = await fetch(`${base}/v1/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(task),
    })
    if (asked.status === 503)
      throw new Error(`nobody who has passed ${check.kind} questions is online. Sign a worker in, pass that skill, and try again.`)
    if (asked.status === 200) {
      const declined = (await asked.json()) as { status: string; reason: string }
      if (declined.status === 'not_worth_asking') return { declined: declined.reason } as const
    }
    if (asked.status !== 402) throw new Error(`expected a 402 payment challenge, got ${asked.status}: ${await asked.text()}`)
    const challenge = (await asked.json()) as { quote_cents: number; claim_url: string; advice?: { reason: string } }

    // mppx sees the claim's own 402, signs a TIP-20 transfer for exactly the quoted
    // amount to the advertised recipient, and retries with the credential attached.
    const claimed = await payingFetch()(challenge.claim_url, { method: 'POST' }).catch((error: unknown) => {
      /*
        mppx occasionally fails inside the client with "Body has already been
        consumed" (seen on about one paid call in six). The wallet is a local key,
        so mppx runs in pull mode: the agent only signs, and the gateway broadcasts
        once it holds the credential. A failure here therefore moved no money, and
        one retry with a fresh client is safe.
      */
      if (!(error instanceof Error) || !/already been consumed/i.test(error.message)) throw error
      return payingFetch()(challenge.claim_url, { method: 'POST' })
    })
    if (!claimed.ok) throw new Error(`claim failed with ${claimed.status}: ${await claimed.text()}`)
    return { challenge, body: (await claimed.json()) as Record<string, unknown> } as const
  }

  return {
    payer: account.address,
    fresh,
    async askLater(check, callbackUrl, holdMs, taskId = `a2a:task:${randomUUID()}`) {
      const claimed = await quoteAndClaim(
        inputRequired(taskId, check, process.env.AGENT_B_MAX_PRICE, { callbackUrl, deadlineMs: holdMs }),
        check,
      )
      if ('declined' in claimed) return { status: 'not_worth_asking', reason: claimed.declined }
      return {
        status: 'held',
        priceCents: claimed.challenge.quote_cents,
        reason: claimed.challenge.advice?.reason ?? 'priced by the gateway',
        deadlineAt: String(claimed.body.deadline_at ?? ''),
      }
    },
    async ask(check, taskId = `a2a:task:${randomUUID()}`) {
      const claimed = await quoteAndClaim(inputRequired(taskId, check, process.env.AGENT_B_MAX_PRICE), check)
      if ('declined' in claimed) return { status: 'not_worth_asking', reason: claimed.declined }
      const { challenge, body } = claimed
      const metadata = (body.metadata as Record<string, Record<string, unknown>> | undefined)?.['dev.quorum.resolver'] ?? {}
      return {
        status: 'answered',
        resolution: resolutionFromTask(metadata, String(metadata.status ?? 'unknown'), extractAnswer(body)),
        priceCents: challenge.quote_cents,
        reason: challenge.advice?.reason ?? 'priced by the gateway',
      }
    },
  }
}

/**
 * The resolver's evidence block, read back out of the A2A task it answered with.
 *
 * A forwarded `input-required` task is answered as a task, so the resolution travels
 * under the extension's metadata key in snake case rather than as a plain object.
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
      workerId: `person ${index + 1}`,
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

async function payerAccount(): Promise<{ account: ReturnType<typeof privateKeyToAccount>; fresh: boolean }> {
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
