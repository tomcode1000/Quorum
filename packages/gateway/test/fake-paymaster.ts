import type { Paymaster, PayoutReceipt, RefundReceipt } from '@quorum/core'

/**
 * An in-memory paymaster.
 *
 * The chain adapter is behind one small interface precisely so the routing and
 * settlement logic can be tested exhaustively without a node, a faucet or a
 * testnet's mood. Everything here records what a real paymaster would have sent,
 * which is what the assertions check.
 */
export class FakePaymaster implements Paymaster {
  readonly wages: { workerId: string; amountCents: number; memo: string }[] = []
  readonly refunds: { questionId: string; to: string; amountCents: number }[] = []
  readonly feesSponsored = true
  readonly networkName = 'Fake Tempo'

  /** Set to make the next N wage payments fail, as a blocked transfer would. */
  failWagesFor = new Set<string>()

  #nonce = 0

  async payWorker(payment: {
    questionId: string
    assignmentId: string
    workerId: string
    to: `0x${string}`
    amountCents: number
  }): Promise<PayoutReceipt> {
    if (this.failWagesFor.has(payment.workerId)) throw new Error(`blocked transfer for ${payment.workerId}`)
    const memo = `0x${payment.questionId.padEnd(64, '0').slice(0, 64)}` as `0x${string}`
    this.wages.push({ workerId: payment.workerId, amountCents: payment.amountCents, memo })
    return {
      workerId: payment.workerId,
      to: payment.to,
      amountCents: payment.amountCents,
      txHash: this.#hash(),
      memo,
      feeSponsored: true,
    }
  }

  async refund(refund: { questionId: string; to: `0x${string}`; amountCents: number }): Promise<RefundReceipt> {
    this.refunds.push({ questionId: refund.questionId, to: refund.to, amountCents: refund.amountCents })
    return {
      to: refund.to,
      amountCents: refund.amountCents,
      txHash: this.#hash(),
      memo: `0x${'ff'.repeat(32)}`,
    }
  }

  async balanceCents(): Promise<number> {
    return this.wages.reduce((sum, w) => sum + w.amountCents, 0)
  }

  explorerUrl(txHash: string): string {
    return `https://explore.testnet.tempo.xyz/tx/${txHash}`
  }

  #hash(): `0x${string}` {
    this.#nonce += 1
    return `0x${this.#nonce.toString(16).padStart(64, '0')}`
  }
}
