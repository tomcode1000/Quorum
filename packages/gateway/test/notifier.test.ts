import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createNotifier, QUIET_PERIOD_MS, type Mailer } from '../src/notifier.js'
import { Store } from '../src/store.js'

/**
 * When a worker is emailed.
 *
 * The promise on the settings screen is "one notification when work arrives, never
 * repeated", and an email about a question that resolves in six seconds is useless.
 * These pin the rules that keep both: only people who asked, only for skills they
 * passed, only while they are away, only when too few are online, once a quiet period.
 */

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

function setup() {
  let clock = 1_000_000_000
  const sent: string[] = []
  const mail: Mailer = async ({ to }) => {
    sent.push(to)
  }
  const store = new Store()
  const notifier = createNotifier({ store, mail, appUrl: 'https://quorum.example/app-home', wageCents: 20, now: () => clock })
  const worker = (id: string, options: { email?: string; skill?: boolean; online?: boolean }) => {
    const w = store.upsertWorker(id, ADDRESS)
    w.email = options.email ?? null
    if (options.skill !== false) w.skills.match = 'passed'
    w.lastSeenAt = options.online ? clock : clock - 10 * 60_000
    return w
  }
  return { store, notifier, sent, worker, advance: (ms: number) => (clock += ms) }
}

describe('emailing when work is waiting', () => {
  it('emails an away worker who asked, and who passed that skill', async () => {
    const h = setup()
    h.worker('away-01', { email: 'away@example.com' })
    h.notifier.workWaiting('match')
    await Promise.resolve()
    assert.deepEqual(h.sent, ['away@example.com'])
  })

  it('does not email someone who did not ask, is online, or never passed the skill', async () => {
    const h = setup()
    h.worker('quiet-01', {})
    h.worker('online-01', { email: 'online@example.com', online: true })
    h.worker('unskilled-01', { email: 'unskilled@example.com', skill: false })
    h.notifier.workWaiting('match')
    await Promise.resolve()
    assert.deepEqual(h.sent, [])
  })

  it('stays quiet when enough people with the skill are already online', async () => {
    const h = setup()
    h.worker('away-02', { email: 'away@example.com' })
    h.worker('online-02', { online: true })
    h.worker('online-03', { online: true })
    h.notifier.workWaiting('match')
    await Promise.resolve()
    assert.deepEqual(h.sent, [])
  })

  it('emails once in a quiet period, however much work arrives', async () => {
    const h = setup()
    h.worker('away-03', { email: 'away@example.com' })
    h.notifier.workWaiting('match')
    h.notifier.workWaiting('match')
    h.advance(QUIET_PERIOD_MS - 1)
    h.notifier.workWaiting('match')
    h.advance(2)
    h.notifier.workWaiting('match')
    await Promise.resolve()
    assert.equal(h.sent.length, 2)
  })
})
