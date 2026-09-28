import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempo, tempoModerato } from 'viem/chains'
import { createClient, type Client } from 'viem/tempo'
import type { Account, Chain, HttpTransport } from 'viem'

/**
 * Tempo network configuration.
 *
 * Everything here is explicit rather than defaulted, because the difference
 * between Moderato and mainnet changes what we are allowed to claim. Fee
 * sponsorship in particular is only publicly available on the testnet, so a demo
 * that shows a worker holding no gas asset has to say which network it ran on.
 */

export const CHAIN_IDS = { mainnet: 4217, testnet: 42431 } as const

/** TIP-20 stablecoins. Every TIP-20 token on Tempo uses 6 decimals. */
export const TOKENS = {
  /** pathUSD, the default settlement currency on Moderato. */
  pathUsd: '0x20c0000000000000000000000000000000000000',
  /** USDC.e, the default on mainnet. */
  usdc: '0x20C000000000000000000000b9537d11c60E8b50',
} as const

export const TOKEN_DECIMALS = 6

export type Network = 'mainnet' | 'testnet'

export function chainFor(network: Network): Chain {
  return network === 'mainnet' ? tempo : tempoModerato
}

/** The currency wages are paid in on a given network. */
export function currencyFor(network: Network): `0x${string}` {
  return network === 'mainnet' ? TOKENS.usdc : TOKENS.pathUsd
}

/**
 * Whether Quorum can sponsor a worker's chain fee on this network.
 *
 * Tempo's public fee sponsor is testnet-only; production sponsorship needs an
 * approved payer. This flag exists so the worker app can state the truth on
 * screen rather than implying a property the network is not currently giving us.
 */
export function sponsorshipAvailable(network: Network): boolean {
  return network === 'testnet'
}

/** The resolver's chain client: viem's Tempo client, which carries TIP-20 actions. */
export type QuorumClient = Client<HttpTransport, Chain, Account>

/**
 * Builds the client that pays wages.
 *
 * This account funds every wage payment and, on testnet, co-signs as fee payer so
 * a worker needs to hold nothing whatsoever in order to be paid. Tempo has no
 * native gas asset, so "nothing" is literal: a worker's account holds a
 * stablecoin balance and there is no second asset to acquire, bridge or explain.
 * That is a property of the chain rather than a feature we built, and it is the
 * reason this network was chosen over the several others that are also cheap.
 */
export function createQuorumClient(options: {
  network: Network
  /** Treasury key that funds wage payments. Server-side only. */
  privateKey: `0x${string}`
  /** Override the RPC endpoint, e.g. a private node. */
  rpcUrl?: string
}): QuorumClient {
  const chain = chainFor(options.network)
  return createClient({
    account: privateKeyToAccount(options.privateKey),
    chain,
    // Fees are paid in the same stablecoin as wages, so the treasury holds one asset.
    feeToken: currencyFor(options.network),
    transport: http(options.rpcUrl ?? chain.rpcUrls.default.http[0]),
  }) as QuorumClient
}

/** Converts cents to TIP-20 base units. Wages are small, so the rounding is explicit. */
export function centsToUnits(cents: number): bigint {
  const units = Math.round(cents * 10 ** (TOKEN_DECIMALS - 2))
  if (units <= 0) throw new Error(`a wage of ${cents} cents rounds to zero base units`)
  return BigInt(units)
}

export function unitsToCents(units: bigint): number {
  return Number(units) / 10 ** (TOKEN_DECIMALS - 2)
}
