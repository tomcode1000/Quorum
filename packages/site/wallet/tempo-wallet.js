/*
  Sign in with Tempo Wallet.

  Its own bundle (assets/tempo-wallet.js) because the SDK is large, and a worker
  who signs in with a passkey should never download it. See wallet/index.js.
*/

import { Provider, tempoWallet } from 'accounts'
import { tempo, tempoModerato } from 'viem/chains'

const chainFor = (chainId) => (chainId === tempo.id ? tempo : tempoModerato)

const postJson = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const parsed = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(parsed.error ?? `Quorum answered ${response.status}`)
  return parsed
}

/**
 * Signs in with Tempo Wallet.
 *
 * This page fetches the gateway's sign-in challenge, Tempo Wallet signs it in the
 * same window that connects the account, and this page sends the signature back
 * for the gateway to verify. The gateway then answers with this worker's id.
 *
 * Not the SDK's own `auth` option, which hands the round trip to the wallet's
 * page: that makes wallet.tempo.xyz call the gateway itself, which a gateway on
 * localhost or behind an allowlist refuses, and which Chrome blocks outright when
 * a public site reaches for a local address. Keeping both calls on this page
 * means the wallet only ever signs.
 */
export async function connect({ chainId, authUrl }) {
  const { message } = await postJson(`${authUrl}/challenge`, { chainId })

  const provider = Provider.create({ adapter: tempoWallet(), chains: [chainFor(chainId)] })
  const { accounts } = await provider.request({
    method: 'wallet_connect',
    params: [{ capabilities: { personalSign: { message } } }],
  })
  const [connected] = accounts
  const signature = connected?.capabilities?.signature
  if (!connected || !signature) throw new Error('Tempo Wallet connected but did not sign the sign-in message')

  const keyAuthorization = connected.capabilities.personalSign?.keyAuthorization
  const signed = await postJson(authUrl, {
    address: connected.address,
    message,
    signature,
    ...(keyAuthorization ? { keyAuthorization } : {}),
  })
  if (!signed.workerId) throw new Error('Quorum did not confirm the sign-in')
  return { workerId: signed.workerId, address: connected.address, assessment: signed.assessment }
}
