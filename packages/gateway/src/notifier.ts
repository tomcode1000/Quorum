import type { Kind } from '@quorum/core'
import type { Store, Worker } from './store.js'
import { workEmail } from './work-email.js'

/**
 * Telling people that work is waiting, by email, when they asked to be told.
 *
 * Work only ever goes to people who are online, and a question resolves in
 * seconds, so an email about one particular question would always arrive after
 * it had closed. What an email is good for is the moment before that: a question
 * of your kind has arrived and too few people who passed that skill are online to
 * answer it. That is when it is worth somebody opening the app.
 *
 * So: opt-in, off by default, only for skills the person passed, only while they
 * are away, and at most once in a quiet period. The worker settings promise "One
 * notification when work arrives", and a stream of emails would
 * break that promise on the very surface that makes it.
 *
 * Sent through Resend. Without RESEND_API_KEY the notifier logs what it would have
 * sent and sends nothing, so the gateway runs the same with or without it.
 */

/** A person online within this window can already see the work; no email. */
const AWAY_AFTER_MS = 30_000

/** One email per person per this long, however much work arrives. */
export const QUIET_PERIOD_MS = 10 * 60_000

/**
 * The shorter gap for a held question.
 *
 * A held question waits for exactly the person this email reaches, so it is sent
 * straight away rather than after the usual quiet period. The floor stops a burst
 * of held questions from becoming a burst of emails.
 */
export const HELD_QUIET_PERIOD_MS = 2 * 60_000

/** Fewer people online than this for a kind, and waiting work is worth an email. */
const ENOUGH_ONLINE = 2

export type Notifier = {
  /**
   * A question of this kind arrived, or was turned away for want of people.
   * `heldUntil` is set when it is held for people to arrive, and is when it closes.
   */
  workWaiting(kind: Kind, heldUntil?: number): void
}

export type Mailer = (message: { to: string; subject: string; text: string; html: string }) => Promise<void>

/** Resend's HTTP API, or a logger when no key is configured. */
export function resendMailer(apiKey: string | undefined, from: string): Mailer {
  if (!apiKey)
    return async ({ to, subject }) => {
      console.log(`[quorum] email not sent (no RESEND_API_KEY): "${subject}" to ${to}`)
    }
  return async (message) => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, ...message }),
    })
    if (!response.ok) throw new Error(`Resend refused the email: ${response.status} ${await response.text()}`)
  }
}

/**
 * Brevo's transactional API.
 *
 * Unlike Resend, Brevo can send from a single verified address with no domain of
 * your own, such as a personal Gmail: you confirm the address once in Brevo under
 * Senders, and it can send to anyone. `from` is "Name <address>" or a bare address.
 */
export function brevoMailer(apiKey: string, from: string): Mailer {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  const sender = match ? { name: match[1] || 'Quorum', email: match[2] } : { name: 'Quorum', email: from.trim() }
  return async (message) => {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
    })
    if (!response.ok) throw new Error(`Brevo refused the email: ${response.status} ${await response.text()}`)
  }
}

/**
 * The mailer for this deployment: Brevo when its key is set, then Resend, and a
 * logger when neither is.
 */
export function mailerFromEnv(env: NodeJS.ProcessEnv): Mailer {
  const from = env.QUORUM_EMAIL_FROM ?? 'Quorum <onboarding@resend.dev>'
  if (env.BREVO_API_KEY) return brevoMailer(env.BREVO_API_KEY, from)
  return resendMailer(env.RESEND_API_KEY, from)
}

const LABELS: Record<string, string> = {
  disambiguate: 'telling readings apart',
  verify: 'checking something is real',
  match: 'matching records',
  categorise: 'categorising',
  compare: 'comparing',
}

export function createNotifier(options: {
  store: Store
  mail: Mailer
  /** Where the worker app is, for the links in the email: its Work and Settings screens sit beside this. */
  appUrl: string
  /** What an answer pays, shown in the email. */
  wageCents: number
  now?: () => number
}): Notifier {
  const { store, mail, appUrl } = options
  const now = options.now ?? Date.now

  const passed = (worker: Worker, kind: Kind) => worker.skills[kind] === 'passed'
  const online = (worker: Worker) => now() - worker.lastSeenAt < AWAY_AFTER_MS

  return {
    workWaiting(kind, heldUntil) {
      const skilled = [...store.workers.values()].filter((worker) => passed(worker, kind))
      if (skilled.filter(online).length >= ENOUGH_ONLINE) return

      for (const worker of skilled) {
        if (!worker.email || online(worker)) continue
        const quiet = heldUntil === undefined ? QUIET_PERIOD_MS : HELD_QUIET_PERIOD_MS
        if (worker.notifiedAt !== null && now() - worker.notifiedAt < quiet) continue
        worker.notifiedAt = now()

        const base = appUrl.replace(/[^/]*$/, '')
        const message = workEmail({
          skill: LABELS[kind] ?? kind,
          wageCents: options.wageCents,
          workUrl: `${base}app-question.html`,
          settingsUrl: `${base}app-settings.html`,
          ...(heldUntil === undefined ? {} : { openForMs: heldUntil - now() }),
        })
        void mail({ to: worker.email, ...message }).catch((error: unknown) => {
          console.error(`[quorum] ${error instanceof Error ? error.message : String(error)}`)
        })
      }
      void store.save()
    },
  }
}
