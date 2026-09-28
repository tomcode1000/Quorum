import { refundMemo, wageMemo } from '@quorum/core'
import type { Paymaster, PayoutReceipt, RefundReceipt } from '@quorum/core'
import {
  centsToUnits,
  chainFor,
  currencyFor,

  unitsToCents,
  type Network,
  type QuorumClient,
} from './chain.js'

/**
 * Settlement.
 *
 * This is the part every previous micro-work platform got wrong, and it got wrong
 * for a structural reason rather than a moral one. When a single payment costs
 * thirty cents to send, a two-cent wage cannot be sent at all, so every platform
 * became a custodian: earnings accumulated in a balance the platform held, released
 * monthly, above a threshold, minus a cut. Every documented harm in that
 * industry — accounts closed the day before pay day, thousands of workers dropped
 * mid-month with unpaid hours and no route to redress — is downstream of somebody
 * else holding the worker's money.
 *
 * So this holds none of it. The wage below is sent the moment an answer is
 * accepted, direct to the worker's own account, with no balance, no threshold and
 * no pay day. That is possible because the fee is a fraction of a cent, and it is
 * the actual novelty here: not cheap payments, which several chains offer, but the
 * removal of the custodian. It is also what lets us pay a stranger with no account
 * and no prior relationship, which a custodial platform structurally cannot do.
 */

export type PaymasterOptions = {
  client: QuorumClient
  network: Network
  /** Address refunds are sent from. Defaults to the treasury account. */
  treasury?: `0x${string}`
}

export function createPaymaster(options: PaymasterOptions): Paymaster {
  const { client, network } = options
  const chain = chainFor(network)

  return {
    // True on every network, and for a stronger reason than sponsorship: the worker
    // is never the sender, so no fee is ever charged to them. See `transfer` below.
    feesSponsored: true,
    networkName: chain.name,

    explorerUrl(txHash: string) {
      return `${chain.blockExplorers?.default.url ?? ''}/tx/${txHash}`
    },

    async payWorker(payment) {
      const memo = wageMemo(payment.questionId, payment.assignmentId)
      return transfer(client, network, {
        to: payment.to,
        amountCents: payment.amountCents,
        memo,
        label: `wage for ${payment.workerId}`,
      }).then((sent) => ({
        workerId: payment.workerId,
        to: payment.to,
        amountCents: payment.amountCents,
        txHash: sent.txHash,
        memo,
        feeSponsored: true,
      }) satisfies PayoutReceipt)
    },

    /**
     * Returns a caller's payment when their question could not be resolved.
     *
     * A caller that paid for an answer it did not get will never call twice, so this
     * is not a courtesy. It is also the only honest position available: a product
     * whose own failure mode is quietly keeping the money has no standing to
     * criticise agents for quietly guessing.
     *
     * Note what is not refunded. The workers who answered are paid regardless, so a
     * refunded question is a loss we absorb rather than a cost we push onto the
     * people who did the work.
     */
    async refund(refund) {
      const memo = refundMemo(refund.questionId)
      const sent = await transfer(client, network, {
        to: refund.to,
        amountCents: refund.amountCents,
        memo,
        label: `refund for ${refund.questionId}`,
      })
      return { to: refund.to, amountCents: refund.amountCents, txHash: sent.txHash, memo } satisfies RefundReceipt
    },

    async balanceCents(address) {
      const balance = await client.token.getBalance({ token: currencyFor(network), account: address })
      return unitsToCents(balance.amount)
    },
  }
}

/**
 * One verified TIP-20 transfer.
 *
 * `transferSync` waits for inclusion and returns the emitted `Transfer` event
 * rather than only a transaction hash, which is what lets us check the gotcha that
 * matters on this chain: a transfer can be blocked by a policy on the recipient and
 * still succeed at the transaction level. A successful receipt is therefore not
 * evidence that anyone was paid. The emitted recipient and amount are, so those are
 * what this checks before reporting the money as sent.
 */
async function transfer(
  client: QuorumClient,
  network: Network,
  input: { to: `0x${string}`; amountCents: number; memo: `0x${string}`; label: string },
): Promise<{ txHash: `0x${string}` }> {
  const amount = centsToUnits(input.amountCents)
  // Note what is deliberately absent: a fee-payer field.
  //
  // Fee sponsorship exists so that somebody who holds nothing can *send* a
  // transaction. A worker here never sends one — the treasury is the sender and the
  // worker is only ever a recipient — so there is no fee of theirs to sponsor, and
  // setting `feePayer` here produced a transaction the node could not even decode.
  //
  // That is a better position than sponsorship, not a worse one. Sponsorship on
  // Tempo's public sponsor is testnet-only, so a claim resting on it would have to be
  // withdrawn on mainnet. This claim does not: a worker holds nothing and pays nothing
  // on any network, because being paid has never required them to transact.
  const result = await client.token.transferSync({
    token: currencyFor(network),
    to: input.to,
    amount,
    memo: input.memo,
  })

  if (result.receipt.status !== 'success')
    throw new PaymentFailed(`${input.label}: transaction reverted (${result.receipt.transactionHash})`)
  if (result.to.toLowerCase() !== input.to.toLowerCase())
    throw new PaymentFailed(
      `${input.label}: transfer emitted recipient ${result.to}, expected ${input.to}; treat as unpaid and retry`,
    )
  if (result.amount !== amount)
    throw new PaymentFailed(`${input.label}: transfer emitted ${result.amount} base units, expected ${amount}`)

  return { txHash: result.receipt.transactionHash }
}

export class PaymentFailed extends Error {
  override name = 'PaymentFailed'
}

/**
 * Pays several workers at once.
 *
 * Tempo's concurrent nonce lanes mean these do not queue behind one another, so a
 * question that escalated to three workers settles all three wages in parallel
 * rather than serially. Failures are collected rather than thrown: one worker's
 * blocked transfer must not cost the other two their wages, and it must not stop the
 * caller getting the answer they have already paid for.
 */
export async function payAll(
  paymaster: Paymaster,
  payments: readonly Parameters<Paymaster['payWorker']>[0][],
): Promise<{ receipts: PayoutReceipt[]; failures: { workerId: string; error: string }[] }> {
  const settled = await Promise.allSettled(payments.map((payment) => paymaster.payWorker(payment)))
  const receipts: PayoutReceipt[] = []
  const failures: { workerId: string; error: string }[] = []
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') receipts.push(outcome.value)
    else
      failures.push({
        workerId: payments[index]?.workerId ?? 'unknown',
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      })
  })
  return { receipts, failures }
}

/** Funds an address from the Moderato faucet. Testnet only, never on a caller path. */
export async function fundFromFaucet(client: QuorumClient, address: `0x${string}`): Promise<void> {
  await client.faucet.fundSync({ account: address })
}
