import { createPaymaster, createQuorumClient } from '@quorum/paymaster'
import { privateKeyToAccount } from 'viem/accounts'
import { randomBytes } from 'node:crypto'

/**
 * Proves settlement.
 *
 * Everything else in this repository can be true while no money has ever moved, and
 * for a project whose entire claim is that a worker is paid the instant their answer
 * is accepted, that gap is the one that matters. This sends one real wage to a fresh
 * address on Moderato and prints a link anybody can open.
 *
 * The recipient is generated here and holds nothing beforehand — no gas asset, no
 * prior balance, no account with us. That is the point being demonstrated rather than
 * an incidental detail: on a chain with no native gas token, and with the treasury
 * co-signing the fee, a total stranger can be paid a wage without first acquiring
 * anything at all. No other rail in this category can do that.
 */

/** The wage the gateway pays, so the proof sends what a worker actually receives. */
const WAGE = Number(process.env.QUORUM_WAGE_CENTS ?? 20)

async function main() {
  const privateKey = process.env.QUORUM_TREASURY_KEY
  if (!privateKey || privateKey === '0x') {
    console.error('QUORUM_TREASURY_KEY is not set. Run `npm run setup`, then `npm run fund`.')
    process.exit(1)
  }
  const network = process.env.QUORUM_NETWORK === 'mainnet' ? 'mainnet' : 'testnet'

  const client = createQuorumClient({
    network,
    privateKey,
    ...(process.env.QUORUM_RPC_URL ? { rpcUrl: process.env.QUORUM_RPC_URL } : {}),
  })
  const paymaster = createPaymaster({ client, network })

  // A worker who has never existed until this moment.
  const worker = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`)
  const questionId = `q_proof_${randomBytes(6).toString('hex')}`
  const assignmentId = `a_${randomBytes(6).toString('hex')}`

  console.log('')
  console.log('  Settling one wage on chain')
  console.log('  ' + '─'.repeat(62))
  console.log(`  Network:     ${paymaster.networkName}`)
  console.log(`  Fees:        ${paymaster.feesSponsored ? 'sponsored by the treasury' : 'paid by the recipient'}`)
  console.log(`  Worker:      ${worker.address}`)
  console.log(`  Question:    ${questionId}`)

  const before = await paymaster.balanceCents(worker.address)
  console.log(`  Balance now: ${before}c`)
  console.log('')

  process.stdout.write(`  Paying ${WAGE}c… `)
  const started = Date.now()
  const receipt = await paymaster.payWorker({
    questionId,
    assignmentId,
    workerId: 'proof-worker',
    to: worker.address,
    amountCents: WAGE,
  })
  const elapsed = Date.now() - started
  console.log(`landed in ${(elapsed / 1000).toFixed(2)}s`)
  console.log('')

  const after = await paymaster.balanceCents(worker.address)

  console.log(`  Paid:        ${receipt.amountCents}c`)
  console.log(`  Balance now: ${after}c`)
  console.log(`  Fee paid by: ${receipt.feeSponsored ? 'the treasury, not the worker' : 'the worker'}`)
  console.log(`  Memo:        ${receipt.memo}`)
  console.log('                (sha256 over the question id — verifiable, not disclosing)')
  console.log('')
  console.log(`  ${paymaster.explorerUrl(receipt.txHash)}`)
  console.log('')

  if (after <= before) {
    console.error('  The balance did not increase, so treat this wage as unpaid.')
    process.exit(1)
  }

  console.log('  A worker who held nothing, and had no account anywhere, was paid two')
  console.log(`  cents in ${(elapsed / 1000).toFixed(2)} seconds and now holds ${after}c they alone control.`)
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error(`  Failed: ${error instanceof Error ? error.message : error}`)
  console.error('')
  process.exit(1)
})
