import type { Kind } from '@quorum/core'
import type { Store, Worker } from './store.js'

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
 * notification when work arrives. Never repeated", and a stream of emails would
 * break that promise on the very surface that makes it.
 *
 * Sent through Resend. Without RESEND_API_KEY the notifier logs what it would have
 * sent and sends nothing, so the gateway runs the same with or without it.
 */

/** A person online within this window can already see the work; no email. */
const AWAY_AFTER_MS = 30_000

/** One email per person per this long, however much work arrives. */
export const QUIET_PERIOD_MS = 30 * 60_000

/** Fewer people online than this for a kind, and waiting work is worth an email. */
const ENOUGH_ONLINE = 2

export type Notifier = {
  /** A question of this kind arrived, or was turned away for want of people. */
  workWaiting(kind: Kind): void
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
  /** Where the worker app's home screen is, for the link in the email. */
  appUrl: string
  now?: () => number
}): Notifier {
  const { store, mail, appUrl } = options
  const now = options.now ?? Date.now

  const passed = (worker: Worker, kind: Kind) => worker.skills[kind] === 'passed'
  const online = (worker: Worker) => now() - worker.lastSeenAt < AWAY_AFTER_MS

  return {
    workWaiting(kind) {
      const skilled = [...store.workers.values()].filter((worker) => passed(worker, kind))
      if (skilled.filter(online).length >= ENOUGH_ONLINE) return

      for (const worker of skilled) {
        if (!worker.email || online(worker)) continue
        if (worker.notifiedAt !== null && now() - worker.notifiedAt < QUIET_PERIOD_MS) continue
        worker.notifiedAt = now()

        const skill = LABELS[kind] ?? kind
        const text = [
          `Questions about ${skill} are waiting, and few people who passed it are online.`,
          '',
          `Open Quorum to answer them: ${appUrl}`,
          '',
          'Each answer is paid to your own account the moment it is accepted.',
          'This is the only email for the next half hour, however much work arrives.',
          'Turn these off in Settings whenever you like.',
        ].join('\n')
        const html = `<p>Questions about <b>${skill}</b> are waiting, and few people who passed it are online.</p><p><a href="${appUrl}">Open Quorum to answer them</a></p><p style="color:#5b6b85">Each answer is paid to your own account the moment it is accepted. This is the only email for the next half hour, however much work arrives. Turn these off in Settings whenever you like.</p>`

        void mail({ to: worker.email, subject: `Work is waiting: ${skill}`, text, html }).catch((error: unknown) => {
          console.error(`[quorum] ${error instanceof Error ? error.message : String(error)}`)
        })
      }
      void store.save()
    },
  }
}
