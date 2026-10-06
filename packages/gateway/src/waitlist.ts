import { SERVABLE_KINDS, type Kind } from '@quorum/core'
import { Hono, type MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { Mailer } from './notifier.js'
import type { Store } from './store.js'
import { escapeHtml, renderEmail } from './email-layout.js'

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
export function waitlistRoutes(services: { store: Store; mail?: Mailer }): Hono {
  const { store, mail } = services
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
      // Confirmed by email, not awaited: a slow mail provider should not hold the page.
      if (mail)
        void mail({ to: email, ...joinedEmail(kinds) }).catch((error: unknown) =>
          console.error(`[quorum] waitlist confirmation not sent to ${email}: ${error instanceof Error ? error.message : String(error)}`),
        )
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

/** Middleware: the operator's bearer token, or 401. Preflights pass through. */
export function requireOperator(token: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'OPTIONS') return next()
    const given = c.req.header('authorization')?.replace(/^Bearer\s+/i, '')
    if (!sameToken(given, token)) return c.json({ error: 'operator token required' }, 401)
    return next()
  }
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
  app.use('*', requireOperator(services.token))

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

const KIND_LABELS: Record<Kind, string> = {
  disambiguate: 'Telling readings apart',
  verify: 'Checking something is real',
  match: 'Matching records',
  categorise: 'Categorising',
  compare: 'Comparing',
  extract: 'Extracting',
}

/** Sent the moment someone joins, so they know it worked and what to expect. */
function joinedEmail(kinds: Kind[]) {
  const picked = kinds.length ? kinds.map((k) => KIND_LABELS[k] ?? k).join(', ') : null
  const subject = 'You’re on the Quorum waitlist'
  const text = `You're on the Quorum waitlist.

We're opening Quorum a group at a time, so everyone admitted together has real questions to answer. We'll email you an invite link when your group is admitted.
${picked ? `\nYou said you'd like to answer: ${picked}.\n` : ''}
What happens next:
1. Get your invite: a personal link, by email, when your group opens.
2. Pass a short assessment: five questions per skill, four right to pass.
3. Answer in test sessions: we'll email you before each one.

There's nothing else to do for now. This is the testnet: wages are paid in test tokens, not real money.`
  const html = renderEmail({
    preheader: 'You’re on the list. We’ll email your invite when your group opens.',
    eyebrow: 'Waitlist',
    heading: 'You’re on the list.',
    body: [
      'Thanks for joining. We&rsquo;re opening Quorum a group at a time, so everyone admitted together has real questions to answer and people to agree with.',
      'We&rsquo;ll email you a personal invite link when your group is admitted. There&rsquo;s nothing else you need to do until then.',
      ...(picked ? [`You said you&rsquo;d like to answer: <b style="color:#0f1b35">${escapeHtml(picked)}</b>.`] : []),
    ],
    steps: [
      { title: 'Get your invite', text: 'A personal link, by email, when your group opens.' },
      { title: 'Pass a short assessment', text: 'Five questions per skill. Four right opens that skill.' },
      { title: 'Answer in test sessions', text: 'We email you before each one.' },
    ],
    footnote: 'This is the testnet: wages are paid in test tokens, not real money.',
  })
  return { subject, text, html }
}

function inviteEmail(link: string, code: string) {
  const subject = 'You’re in: your Quorum invite'
  const text = `You're off the Quorum waitlist.

Accept your invite: ${link}

Your invite code is ${code}, in case you need to type it.

What happens next:
1. Sign in with a passkey on your phone. No password, no deposit.
2. Pick the skills you want and take the short assessment: five questions, four right to pass.
3. Once you pass, questions reach you during test sessions. We'll email you before each one.

You only need this link once. After that, sign in with the same passkey.
This is the testnet: wages are paid in test tokens, not real money.`
  const html = renderEmail({
    preheader: 'Your place has opened. Accept your invite to get started.',
    eyebrow: 'Invite',
    heading: 'You’re in.',
    body: [
      'Your group has been admitted to the Quorum testnet. Accept your invite to sign in, pick what you&rsquo;d like to answer, and take the short assessment.',
    ],
    button: { label: 'Accept your invite', href: link },
    detail: { label: 'Invite code', value: code },
    steps: [
      { title: 'Sign in with a passkey', text: 'Your face, fingerprint or device PIN. No password, no deposit.' },
      { title: 'Take the assessment', text: 'Five questions per skill. Four right opens that skill.' },
      { title: 'Answer in test sessions', text: 'We email you before each one.' },
    ],
    footnote: 'You only need this link once. After that, sign in with the same passkey. This is the testnet: wages are paid in test tokens, not real money.',
  })
  return { subject, text, html }
}
