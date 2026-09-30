/*
  The worker's account, on the chain.

  Bundled on its own into assets/wallet.js and loaded only by the pages that need
  it, so the rest of the app stays the plain static files it is everywhere else.
  Tempo Wallet's SDK is several times the size of everything here, so it lives in
  its own bundle (tempo-wallet.js) that only the sign-in page fetches, and only
  when that option is chosen.
  It is the one part of the app that cannot be dependency-free: signing a Tempo
  transaction with a passkey, and talking to Tempo Wallet, are not things to
  hand-roll.

  Two ways to hold an account, and the worker picks:

  - A passkey made here. It controls a Tempo account directly — Tempo derives
    the address from the key — but a passkey only works on the site that made
    it, so the only place its owner can move their money is here. Sending is
    sponsored: the gateway co-signs as fee payer, so moving what they earned
    costs them nothing.

  - Tempo Wallet. The account they already have, used everywhere else on
    Tempo. Wages land in it and there is nothing to move.
*/

import { createClient, http } from 'viem'
import { waitForTransactionReceipt, writeContract } from 'viem/actions'
import { tempo, tempoModerato } from 'viem/chains'
import { Account, WebAuthnP256, withFeePayer } from 'viem/tempo'

/*
  The one TIP-20 function a worker needs. Written out rather than taken from
  viem's Tempo action set, which would bring every Tempo action along with it and
  quadruple what a phone downloads to send one transfer.
*/
const TRANSFER = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
]

const chainFor = (chainId) => (chainId === tempo.id ? tempo : tempoModerato)

/** Thrown when the device's passkey predates accounts Quorum can read. */
export class LegacyPasskey extends Error {
  name = 'LegacyPasskey'
}

/**
 * Makes a new passkey and the Tempo account it controls.
 *
 * The public key is only available now, at creation, so it is returned to be
 * registered: signing back in later needs it to know which account this is.
 */
export async function createPasskey() {
  const credential = await WebAuthnP256.createCredential({
    // No email, no phone number, no name. A worker should not have to identify
    // themselves to a stranger in order to be paid by one.
    label: 'Quorum worker',
    userId: crypto.getRandomValues(new Uint8Array(16)),
  })
  const account = Account.fromWebAuthnP256(credential)
  return { workerId: credential.id, publicKey: credential.publicKey, address: account.address }
}

/**
 * Signs in with a passkey already on this device.
 *
 * `lookup` fetches the key registered for a credential id. A passkey with no key
 * on record was made before Quorum derived accounts properly; its address is one
 * nothing can sign for, so the caller is told, rather than handed that account.
 */
export async function existingPasskey(lookup) {
  const credential = await WebAuthnP256.getCredential({
    async getPublicKey(raw) {
      const publicKey = await lookup(raw.id)
      if (!publicKey) throw new LegacyPasskey('This passkey was made before your account could be read from it.')
      return publicKey
    },
  })
  const account = Account.fromWebAuthnP256({ id: credential.id, publicKey: credential.publicKey })
  return { workerId: credential.id, publicKey: credential.publicKey, address: account.address }
}

/**
 * Sends stablecoin out of a passkey worker's own account.
 *
 * The passkey signs; the gateway's relay co-signs only as fee payer, and refuses
 * anything but this. Returns the transaction hash once the transfer is in a block.
 */
export async function sendFromPasskey({ workerId, publicKey, chainId, currency, relayUrl, to, amountCents }) {
  const chain = chainFor(chainId)
  const account = Account.fromWebAuthnP256({ id: workerId, publicKey })
  const client = createClient({ account, chain, transport: withFeePayer(http(), http(relayUrl)) })
  const hash = await writeContract(client, {
    address: currency,
    abi: TRANSFER,
    functionName: 'transfer',
    // TIP-20 tokens have six decimals, so a cent is 10,000 base units.
    args: [to, BigInt(Math.round(amountCents * 10_000))],
    feePayer: true,
  })
  const receipt = await waitForTransactionReceipt(client, { hash })
  if (receipt.status !== 'success') throw new Error('The transfer did not go through. Nothing left your account.')
  return receipt.transactionHash
}

/** The explorer page for a transaction. */
export function explorerTx(chainId, hash) {
  return `${chainFor(chainId).blockExplorers.default.url}/tx/${hash}`
}
