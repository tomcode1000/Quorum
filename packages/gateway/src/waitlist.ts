import { SERVABLE_KINDS, type Kind } from '@quorum/core'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { Mailer } from './notifier.js'
import type { Store } from './store.js'

/**
 * Letting people in a cohort at a time.
 *
 * While the testnet is invite-only, anyone can sign in, but a new account can do
 * nothing until it redeems an invite: no skills, no assessment, no work. People ask
 * to join on the waitlist, the operator admits a batch from the console, and each
 * admitted address is emailed a link carrying its own code. A code is used once.
 *
 * Workers who were already on the roster when this was switched on keep working;
 * see `admitted` on load in `store.ts`.
 */

export type WaitlistEntry = {
  email: string
  kinds: Kind[]
  note: string | null
  joinedAt: number
  /** Set when admitted, with the code their invite link carries. */
  invitedAt: number | null
  code: string | null
  /** The worker who redeemed the code, once someone has. */
  redeemedBy: string | null
}

const joinSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  kinds: z.array(z.enum(SERVABLE_KINDS as [Kind, ...Kind[]])).max(SERVABLE_KINDS.length).default([]),
  note: z.string().trim().max(500).optional(),
})

const redeemSchema = z.object({ workerId: z.string().min(8).max(128), code: z.string().trim().min(6).max(64) })
const admitSchema = z.object({ emails: z.array(z.string().trim().toLowerCase().email()).min(1).max(200) })

/** Waitlist sign-up, from the public site. */
export function waitlistRoutes(services: { store: Store }): Hono {
  const { store } = services
  const app = new Hono()
  app.use('*', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'] }))
  app.post('/', async (c) => {
    const parsed = joinSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'a valid email is required' }, 400)
    const { email, kinds, note } = parsed.data
    const existing = store.waitlist.get(email)
    // Joining twice is not an error, and says nothing about whether they were admitted.
    if (!existing) {
      store.waitlist.set(email, { email, kinds, note: note ?? null, joinedAt: Date.now(), invitedAt: null, code: null, redeemedBy: null })
      void store.save()
    }
    return c.json({ joined: true, position: [...store.waitlist.values()].filter((e) => e.invitedAt === null).length })
  })
  return app
}

/** Redeeming an invite, from the worker app. Mounted under /v1/worker. */
export function redeemRoute(services: { store: Store }): Hono {
  const { store } = services
  const app = new Hono()
  app.post('/redeem', async (c) => {
    const parsed = redeemSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'workerId and an invite code are required' }, 400)
    const worker = store.workers.get(parsed.data.workerId)
    if (!worker) return c.json({ error: 'unknown worker; sign in first' }, 404)
    if (worker.admitted) return c.json({ admitted: true })
    const entry = [...store.waitlist.values()].find((e) => e.code === parsed.data.code.toUpperCase())
    if (!entry) return c.json({ error: 'that invite code is not one we issued' }, 404)
    if (entry.redeemedBy && entry.redeemedBy !== worker.workerId)
      return c.json({ error: 'that invite has already been used' }, 409)
    entry.redeemedBy = worker.workerId
    worker.admitted = true
    if (worker.email === null) worker.email = entry.email
    void store.save()
    return c.json({ admitted: true })
  })
  return app
}

const sameToken = (given: string | undefined, expected: string) => {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * The operator's side: who is waiting, and admitting them.
 *
 * Unlike the rest of the console this is behind a token, because it lists
 * people's email addresses and it changes things. With no token configured it is
 * not mounted at all.
 */
export function operatorWaitlistRoutes(services: {
  store: Store
  token: string
  mail: Mailer
  /** The worker sign-in page; the invite link is this with ?invite=CODE. */
  signInUrl: string
  origins: string[]
}): Hono {
  const { store, mail } = services
  const app = new Hono()
  app.use('*', cors({ origin: services.origins, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['authorization', 'content-type'] }))
  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next()
    const given = c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    if (!sameToken(given, services.token)) return c.json({ error: 'operator token required' }, 401)
    return next()
  })

  app.get('/', (c) =>
    c.json({
      inviteOnly: store.inviteOnly,
      entries: [...store.waitlist.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((e) => ({ ...e, worker: e.redeemedBy ? summary(store, e.redeemedBy) : null })),
    }),
  )

  app.post('/admit', async (c) => {
    const parsed = admitSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'a list of emails is required' }, 400)
    const results: { email: string; sent: boolean; error?: string }[] = []
    for (const email of parsed.data.emails) {
      const entry = store.waitlist.get(email)
      if (!entry) {
        results.push({ email, sent: false, error: 'not on the waitlist' })
        continue
      }
      // Re-admitting resends the same code, so an earlier email still works.
      entry.code ??= randomBytes(5).toString('hex').toUpperCase()
      entry.invitedAt ??= Date.now()
      const link = `${services.signInUrl}?invite=${entry.code}`
      try {
        await mail({ to: email, ...inviteEmail(link, entry.code) })
        results.push({ email, sent: true })
      } catch (error) {
        results.push({ email, sent: false, error: error instanceof Error ? error.message : String(error) })
      }
    }
    void store.save()
    return c.json({ results })
  })

  return app
}

function summary(store: Store, workerId: string) {
  const worker = store.workers.get(workerId)
  if (!worker) return null
  const passed = SERVABLE_KINDS.filter((k) => worker.skills[k] === 'passed')
  const failed = SERVABLE_KINDS.filter((k) => worker.skills[k] === 'failed')
  return { workerId, passed, failed, answers: worker.answerCount }
}

function inviteEmail(link: string, code: string) {
  const subject = 'You’re in: your Quorum testnet invite'
  const text = `You're off the Quorum waitlist.

Sign in here: ${link}

Your invite code is ${code}, in case you need to type it.

What happens next:
1. Sign in with a passkey on your phone. No password, no deposit.
2. Pick the capabilities you want to answer and take the short assessment: five questions, four right to pass.
3. Once you pass, questions start reaching you during test sessions. We'll email you before each one.

This is the testnet: wages are paid in test tokens, not real money.`
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#0f1b35">
  <h2 style="font-size:20px;margin:0 0 12px">You&rsquo;re off the waitlist.</h2>
  <p style="font-size:14px;line-height:1.6;color:#33415c">Sign in, take the short assessment, and questions will start reaching you during test sessions.</p>
  <p style="margin:22px 0"><a href="${link}" style="background:#1f6feb;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600;font-size:14px">Accept your invite</a></p>
  <p style="font-size:13px;color:#5b6b85">Invite code: <b style="font-family:monospace">${code}</b></p>
  <ol style="font-size:13px;line-height:1.7;color:#33415c;padding-left:18px">
    <li>Sign in with a passkey. No password, no deposit.</li>
    <li>Pick your capabilities and take the assessment: five questions, four right to pass.</li>
    <li>Once you pass, we&rsquo;ll email you before each test session.</li>
  </ol>
  <p style="font-size:12px;color:#8a97b0">This is the testnet: wages are paid in test tokens, not real money.</p>
</div>`
  return { subject, text, html }
}
