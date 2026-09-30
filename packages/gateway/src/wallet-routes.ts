import { chainFor } from '@quorum/paymaster'
import { Handler } from 'accounts/server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomBytes } from 'node:crypto'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Config } from './config.js'
import type { Store, Worker } from './store.js'
import { assessmentStatus, TEMPO_WALLET_PREFIX } from './worker-api.js'

/**
 * The two routes that let a worker's money leave Quorum's screens.
 *
 * A worker's wages sit in an account only they control, and there are two ways to
 * hold one. A passkey made on this site controls a Tempo account directly, but a
 * passkey only works on the site that made it, so the only place that worker can
 * move their money is here: the relay below pays the fee so sending costs them
 * nothing. Or they sign in with Tempo Wallet, and wages land in the wallet they
 * already use everywhere else on Tempo, with nothing to move at all.
 *
 * Neither route can touch a worker's money. The relay co-signs only as fee payer on
 * a transaction the worker has already signed, and sign-in only learns an address.
 */
export function walletRoutes(services: { config: Config; store: Store }): Hono {
  const { config, store } = services
  const chain = chainFor(config.network)
  const transport = http(config.rpcUrl ?? chain.rpcUrls.default.http[0])

  /*
    Sign in with Tempo Wallet.

    The wallet signs a Sign-In with Ethereum challenge in the same ceremony that
    connects it, and the SDK verifies that signature, so by the time the hook runs
    the address is proven to be the signer's. That matters because a worker's id is
    what the worker routes trust, and an address is public: issuing the id against
    an unverified address would let anyone who knew it answer questions as them.
    The id is therefore random and handed out only here.
  */
  const auth = Handler.auth({
    path: '/v1/auth',
    origin: config.publicUrl,
    // Quorum keeps its own session (the worker id), so the SDK's is not needed.
    session: false,
    cors: false,
    transport,
    statement: 'Sign in to Quorum to be paid for your answers.',
    onAuthenticate: async ({ address }) => {
      const existing = store.workerAt(address)
      const worker =
        existing?.workerId.startsWith(TEMPO_WALLET_PREFIX) === true
          ? existing
          : store.upsertWorker(`${TEMPO_WALLET_PREFIX}${randomBytes(18).toString('base64url')}`, address, {
              kind: 'tempo-wallet',
            })
      await store.save()
      return Response.json({ workerId: worker.workerId, address: worker.address, assessment: assessmentStatus(worker) })
    },
  })

  /*
    The fee relay.

    Sponsors exactly one kind of transaction: a registered worker sending the
    settlement stablecoin out of their own account. Anything else is refused, so the
    treasury cannot be made to pay for strangers' transactions, and a worker cannot
    be made to pay a fee to move what they earned — which is what the earnings page
    promises them.
  */
  const relay = Handler.relay({
    path: '/v1/relay',
    chains: [chain],
    transports: { [chain.id]: transport },
    cors: false,
    feePayer: {
      account: privateKeyToAccount(config.treasuryKey),
      feeToken: config.currency,
      name: 'Quorum',
      validate: (request) => isWorkerSend(request, store, config.currency),
    },
  })

  const app = new Hono()
  /*
    CORS is ours rather than the SDK's. Given a list of origins, the SDK writes
    them all into one Access-Control-Allow-Origin header, which browsers reject
    outright, so every sign-in failed as "Failed to fetch". Hono's middleware
    echoes back the one origin that matched. Credentialed, because the SDK's
    sign-in request sends cookies, which also rules out a wildcard.
  */
  const allow = cors({
    origin: config.workerAppOrigins,
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
  app.use('/v1/auth', allow)
  app.use('/v1/auth/*', allow)
  app.use('/v1/relay', allow)
  app.all('/v1/auth', (c) => auth.fetch(c.req.raw))
  app.all('/v1/auth/*', (c) => auth.fetch(c.req.raw))
  app.all('/v1/relay', (c) => relay.fetch(c.req.raw))
  return app
}

/** `transfer(address,uint256)` and `transferWithMemo(address,uint256,bytes32)`. */
const TRANSFER_SELECTORS = new Set(['0xa9059cbb', '0x95777d59'])

/** Whether a transaction is a worker moving their own wages, the only thing the relay pays for. */
export function isWorkerSend(
  request: {
    from?: string | undefined
    calls?: readonly { to?: string | null | undefined; data?: string | undefined; value?: bigint | undefined }[] | undefined
  },
  store: Pick<Store, 'workerAt'>,
  currency: string,
): boolean {
  if (!request.from) return false
  const worker: Worker | undefined = store.workerAt(request.from)
  if (!worker || worker.signer === null) return false
  const calls = request.calls ?? []
  const [call] = calls
  return (
    calls.length === 1 &&
    call !== undefined &&
    call.to?.toLowerCase() === currency.toLowerCase() &&
    (call.value === undefined || call.value === 0n) &&
    TRANSFER_SELECTORS.has(call.data?.slice(0, 10).toLowerCase() ?? '')
  )
}
