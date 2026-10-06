import { serve } from '@hono/node-server'
import { CHAIN_IDS, createPaymaster, createQuorumClient } from '@quorum/paymaster'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { loadConfig } from './config.js'
import { devRoutes } from './dev-routes.js'
import { Escalations } from './escalations.js'
import { escalationRoutes } from './escalation-routes.js'
import { Events } from './events.js'
import { operatorApi } from './operator-api.js'
import { GOLDEN_SEED } from './golden-seed.js'
import { Router } from './router.js'
import { createNotifier, mailerFromEnv } from './notifier.js'
import { createServer } from './server.js'
import { mediaRoutes } from './media.js'
import { bankImageRoutes, operatorQuestionRoutes } from './operator-questions.js'
import { operatorWaitlistRoutes, redeemRoute, requireOperator, waitlistRoutes } from './waitlist.js'
import { fileStore, upstashStore } from './persistence.js'
import { Store } from './store.js'
import { walletRoutes } from './wallet-routes.js'
import { workerApi } from './worker-api.js'

/**
 * Entrypoint.
 *
 * Wires the three services from the spec: the gateway (this file and `server.ts`),
 * the router, and the paymaster, which is the only part that knows a chain exists.
 */
async function main(): Promise<void> {
  const config = loadConfig()

  // Upstash when configured, so a host that wipes its disk on restart (Render's
  // free plan) keeps the roster; the local file otherwise. Moving to Upstash
  // carries the local roster across the first time.
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const persistence =
    upstashUrl && upstashToken ? upstashStore({ url: upstashUrl, token: upstashToken }) : fileStore(config.statePath)
  const store = new Store({ persistence, migrateFrom: fileStore(config.statePath) })
  await store.load()
  store.inviteOnly = config.inviteOnly
  store.golden.push(...GOLDEN_SEED)

  const client = createQuorumClient({
    network: config.network,
    privateKey: config.treasuryKey,
    ...(config.rpcUrl === undefined ? {} : { rpcUrl: config.rpcUrl }),
  })
  const paymaster = createPaymaster({ client, network: config.network })

  const events = new Events()
  const notifier = createNotifier({
    store,
    mail: mailerFromEnv(process.env),
    appUrl: process.env.QUORUM_WORKER_APP_URL ?? 'http://localhost:4173/app-home',
    wageCents: config.wageCents,
  })
  const router = new Router({
    store,
    paymaster,
    wageCents: config.wageCents,
    onEvent: (event) => {
      events.emit(event)
      if (event.type === 'question.received') notifier.workWaiting(event.kind, event.heldUntil)
      console.log(`[quorum] ${event.type} ${'questionId' in event ? event.questionId : ''}`)
    },
  })

  const escalations = new Escalations({ store, router, paymaster })

  const app = new Hono()

  // The worker app is a static bundle that can be hosted anywhere — a CDN, a phone's
  // cache, a different port in development — so it is always a different origin from
  // this gateway. Without this, every worker request is blocked by the browser and the
  // app silently does nothing, which is the worst way to discover a missing header.
  // Only the worker routes are opened up: the agent-facing routes are called by
  // servers, not browsers, and have no reason to accept cross-origin credentials.
  app.use('/v1/worker/*', cors({ origin: config.workerAppOrigins, allowMethods: ['GET', 'POST', 'OPTIONS'] }))

  // The marketing site reads two endpoints so its figures come from the running
  // system rather than from copy. Both are public discovery data that any agent
  // can already fetch, so they take a wildcard — unlike the worker routes above,
  // which carry a worker's identity and earnings and are allowlisted.
  app.use('/health', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }))
  app.use('/v1/capabilities', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }))
  app.use('/.well-known/*', cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'] }))

  app.route('/', createServer({ config, store, router, paymaster, events, notifier }))
  // Inline images, by unguessable link, for the worker app's <img> tags.
  app.route('/v1/media', mediaRoutes(store.media))
  app.route(
    '/v1/worker',
    workerApi({
      store,
      router,
      paymaster,
      wageCents: config.wageCents,
      chainId: CHAIN_IDS[config.network],
      currency: config.currency,
    }),
  )
  app.route('/v1/capabilities', escalationRoutes({ config, escalations, store }))

  // The waitlist: joined from the public site, redeemed from the worker app, and
  // admitted by the operator, behind a token, a cohort at a time.
  app.route('/v1/waitlist', waitlistRoutes({ store, mail: mailerFromEnv(process.env) }))
  app.route('/v1/worker', redeemRoute({ store }))
  if (config.operatorToken)
    app.route(
      '/v1/admin/waitlist',
      operatorWaitlistRoutes({
        store,
        token: config.operatorToken,
        mail: mailerFromEnv(process.env),
        signInUrl: (process.env.QUORUM_WORKER_APP_URL ?? 'http://localhost:4173/app-home').replace(/[^/]*$/, 'app-signin'),
        origins: config.workerAppOrigins,
      }),
    )
  // Questions the operator sends from the console, to run test sessions, and their images.
  app.route('/v1/bank', bankImageRoutes())
  if (config.operatorToken)
    app.route('/v1/admin/questions', operatorQuestionRoutes({ config, store, router, token: config.operatorToken }))
  if (config.inviteOnly) console.log('[quorum] sign-up is invite-only: new workers redeem a waitlist invite first')

  // Tempo Wallet sign-in and the fee relay for workers moving their own wages. Each
  // carries its own allowlisted CORS, credentialed because the SDK sends cookies.
  app.route('/', walletRoutes({ config, store }))

  // The operator console. Read-only, and served to a browser like the worker app,
  // so it needs the same CORS treatment and the same allowlist — it carries the
  // whole roster and every worker's earnings, which is the most sensitive thing
  // this gateway knows, and a wildcard here would hand it to any page a browser
  // happens to be on.
  app.use(
    '/v1/operator/*',
    cors({ origin: config.workerAppOrigins, allowMethods: ['GET', 'OPTIONS'], allowHeaders: ['authorization'] }),
  )
  // The same token as the waitlist. CORS only stops other sites' pages; it does
  // not stop anyone opening the console itself or calling these routes directly.
  if (config.operatorToken) app.use('/v1/operator/*', requireOperator(config.operatorToken))
  app.route('/v1/operator', operatorApi({ store, events, paymaster, escalations }))

  // Mounted only when asked for, and refused outside testnet even then. This is the
  // only way to put a question in front of a worker without paying for it, which is
  // exactly why it is opt-in rather than on by default.
  if (config.devEndpoints) {
    app.use('/v1/dev/*', cors({ origin: config.workerAppOrigins, allowMethods: ['GET', 'POST', 'OPTIONS'] }))
    app.route('/v1/dev', devRoutes({ config, router, store }))
    console.warn('[quorum] development routes are mounted at /v1/dev — never run this on mainnet')
  }

  /** The live event stream the demo view reads. */
  app.get('/v1/events', (c) =>
    c.body(
      new ReadableStream({
        start(controller) {
          const send = (event: unknown) =>
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
          for (const event of events.recent()) send(event)
          const unsubscribe = events.subscribe(send)
          c.req.raw.signal.addEventListener('abort', () => {
            unsubscribe()
            controller.close()
          })
        },
      }),
      200,
      { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
    ),
  )

  // A port clash is the most likely thing to go wrong on a first run, and without this
  // it surfaces as an unhandled 'error' event and a stack trace, which reads like the
  // project is broken rather than like something else is already listening.
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`[quorum] gateway on http://localhost:${info.port}`)
    console.log(`[quorum] network ${config.network}, fees sponsored: ${paymaster.feesSponsored}`)
    console.log(`[quorum] roster kept in ${persistence.label}, ${store.workers.size} workers loaded`)
    console.log(`[quorum] agent card at ${config.publicUrl}/.well-known/agent-card.json`)
    console.log('[quorum] workers pay no chain fee on any network: the treasury sends, they only receive')
  })

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[quorum] port ${config.port} is already in use.`)
      console.error('[quorum] something else is listening there — most likely a gateway you started earlier.')
      console.error(`[quorum] stop it, or set PORT to something else in .env, then try again.`)
      process.exit(1)
    }
    throw error
  })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
