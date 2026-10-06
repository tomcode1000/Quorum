import { WAGE_CENTS } from '@quorum/core'
import { currencyFor, type Network } from '@quorum/paymaster'

/**
 * Configuration, read once at boot and validated loudly.
 *
 * A resolver that starts without a treasury key or without a payment secret looks
 * healthy and then fails on the first real call, which during a demo is
 * indistinguishable from the product not working. So everything required is
 * checked here and the process refuses to start without it.
 */

export type Config = {
  network: Network
  /** TIP-20 token callers pay in and workers are paid in. */
  currency: `0x${string}`
  /** Treasury key that pays wages. */
  treasuryKey: `0x${string}`
  /** Address callers pay. */
  recipient: `0x${string}`
  /** HMAC key binding payment challenges to their contents. At least 32 bytes. */
  paymentSecret: string
  port: number
  /** Public origin, used in the agent card and the payment realm. */
  publicUrl: string
  /** Where the worker roster is persisted; see the note in `store.ts`. */
  statePath: string
  wageCents: number
  /**
   * Origins the worker app may be served from.
   *
   * The worker app is always a different origin from this gateway, so it needs an
   * explicit allowlist rather than a wildcard: these routes carry a worker's identity
   * and earnings, and `*` would let any page on the internet poll for work as them.
   */
  workerAppOrigins: string[]
  /** Whether to mount the unpaid question injector. Testnet inspection only. */
  devEndpoints: boolean
  /** Whether a new worker needs an invite from the waitlist before working. */
  inviteOnly: boolean
  /** Bearer token for the operator's waitlist routes. Unset, they are not mounted. */
  operatorToken?: string
  rpcUrl?: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const network: Network = env.QUORUM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'
  const treasuryKey = env.QUORUM_TREASURY_KEY
  const paymentSecret = env.MPP_SECRET_KEY
  const recipient = env.QUORUM_RECIPIENT

  const missing: string[] = []
  if (!treasuryKey) missing.push('QUORUM_TREASURY_KEY (funds wage payments)')
  if (!paymentSecret) missing.push('MPP_SECRET_KEY (binds payment challenges; openssl rand -base64 32)')
  if (!recipient) missing.push('QUORUM_RECIPIENT (address callers pay)')
  if (missing.length > 0)
    throw new Error(`quorum gateway cannot start, missing configuration:\n  - ${missing.join('\n  - ')}`)

  if (paymentSecret !== undefined && Buffer.byteLength(paymentSecret) < 32)
    throw new Error('MPP_SECRET_KEY must be at least 32 bytes, or challenges cannot be bound to their contents')

  const port = Number(env.PORT ?? 8787)
  return {
    network,
    currency: currencyFor(network),
    treasuryKey: treasuryKey as `0x${string}`,
    recipient: recipient as `0x${string}`,
    paymentSecret: paymentSecret as string,
    port,
    publicUrl: env.QUORUM_PUBLIC_URL ?? `http://localhost:${port}`,
    statePath: env.QUORUM_STATE_PATH ?? 'data/workers.json',
    wageCents: Number(env.QUORUM_WAGE_CENTS ?? WAGE_CENTS),
    workerAppOrigins: (env.QUORUM_WORKER_APP_ORIGINS ?? 'http://localhost:5173,http://localhost:5199,http://localhost:4173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    devEndpoints: env.QUORUM_DEV_ENDPOINTS === 'true' && network === 'testnet',
    inviteOnly: env.QUORUM_INVITE_ONLY === 'true',
    ...(env.QUORUM_OPERATOR_TOKEN ? { operatorToken: env.QUORUM_OPERATOR_TOKEN } : {}),
    ...(env.QUORUM_RPC_URL === undefined ? {} : { rpcUrl: env.QUORUM_RPC_URL }),
  }
}
