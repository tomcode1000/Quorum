import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AskError, parseAsk, parseInputRequired, type Question } from '@quorum/core'
import { createNotifier, HELD_QUIET_PERIOD_MS, type Mailer } from '../src/notifier.js'
import { Router } from '../src/router.js'
import { Store } from '../src/store.js'
import { workEmail } from '../src/work-email.js'
import { FakePaymaster } from './fake-paymaster.js'

/**
 * Questions that can wait.
 *
 * A caller in callback mode is not holding a connection, so its question is held
 * until its deadline even when nobody is online, and the people who passed the
 * skill are emailed to come back for it. These pin that path end to end.
 */

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const HOUR = 60 * 60_000

const ask = (extra: Record<string, unknown>) => ({
  question: 'Is this invoice from the supplier on file?',
  kind: 'match',
  answer_schema: { type: 'boolean' },
  max_price: '2.00',
  ...extra,
})

describe('how long a caller may wait', () => {
  it('allows hours in callback mode, and refuses them on a held connection', () => {
    const held = parseAsk(ask({ deadline_ms: 2 * HOUR, mode: 'callback', callback_url: 'https://agent.example/answers' }))
    assert.equal(held.timeoutMs, 2 * HOUR)
    assert.throws(() => parseAsk(ask({ deadline_ms: 2 * HOUR })), AskError)
    assert.throws(
      () => parseAsk(ask({ deadline_ms: 25 * HOUR, mode: 'callback', callback_url: 'https://agent.example/answers' })),
      AskError,
      'nothing is held longer than a day',
    )
  })

  it('takes a callback_url on a forwarded A2A task', () => {
    const parsed = parseInputRequired({
      id: 'task-1',
      status: {
        state: 'input-required',
        message: { role: 'agent', messageId: 'm1', parts: [{ kind: 'text', text: 'Is this invoice from the supplier on file?' }] },
      },
      metadata: {
        'dev.quorum.resolver': {
          kind: 'match',
          answer_schema: { type: 'boolean' },
          max_price: '2.00',
          deadline_ms: HOUR,
          callback_url: 'https://agent.example/answers',
        },
      },
    })
    assert.equal(parsed.mode, 'callback')
    assert.equal(parsed.callbackUrl, 'https://agent.example/answers')
  })
})

describe('a held question', () => {
  it('waits for somebody to come online, then resolves and pays them', async () => {
    const store = new Store()
    const paymaster = new FakePaymaster()
    const router = new Router({ store, paymaster, random: () => 0.99 })
    const question: Question = {
      id: 'q_held',
      kind: 'match',
      prompt: 'Is this invoice from the supplier on file?',
      schema: { kind: 'boolean' },
      priceCents: 200,
      timeoutMs: 5_000,
    }

    // Nobody is online when it arrives.
    const resolving = router.resolve(question, { callbackUrl: 'http://127.0.0.1:9/never' })
    await new Promise((r) => setTimeout(r, 300))
    assert.ok(store.live.has('q_held'), 'held open rather than settled for want of people')

    // Someone with the skill arrives, as they would from the email.
    const worker = store.upsertWorker('arrived-01', ADDRESS)
    worker.skills.match = 'passed'
    worker.record = { workerId: 'arrived-01', byKind: { match: { agreements: 60, disagreements: 0, unresolved: 0 } } }
    const offer = await router.takeAssignment('arrived-01', 1_000)
    assert.ok(offer, 'the held question is offered to the person who came back')
    router.submitAnswer({ assignmentId: offer.assignmentId, workerId: 'arrived-01', value: false, selfConfidence: 1 })

    const resolution = await resolving
    assert.equal(resolution.status, 'resolved')
    assert.equal(resolution.value, false)
    assert.deepEqual(paymaster.wages.map((w) => w.workerId), ['arrived-01'])
  })

  it('is refunded when nobody came before its deadline', async () => {
    const store = new Store()
    const router = new Router({ store, paymaster: new FakePaymaster() })
    const resolution = await router.resolve(
      { id: 'q_unclaimed', kind: 'match', prompt: 'x', schema: { kind: 'boolean' }, priceCents: 200, timeoutMs: 2_500 },
      { callbackUrl: 'http://127.0.0.1:9/never', payer: ADDRESS },
    )
    assert.equal(resolution.status, 'timeout')
    assert.ok(resolution.refund, 'the caller gets its money back')
  })
})

describe('the email for a held question', () => {
  it('is sent straight away rather than after the usual quiet period', async () => {
    let clock = 1_000_000_000
    const sent: string[] = []
    const mail: Mailer = async ({ to, subject }) => {
      sent.push(`${to}: ${subject}`)
    }
    const store = new Store()
    const notifier = createNotifier({ store, mail, appUrl: 'https://quorum.example/app-home.html', wageCents: 20, now: () => clock })
    const away = store.upsertWorker('away-01', ADDRESS)
    away.email = 'away@example.com'
    away.skills.match = 'passed'
    away.lastSeenAt = clock - HOUR

    notifier.workWaiting('match')
    clock += HELD_QUIET_PERIOD_MS + 1
    notifier.workWaiting('match', clock + HOUR)
    await Promise.resolve()
    assert.equal(sent.length, 2, 'a held question is worth a second email inside the usual ten minutes')
  })

  it('says how long the question stays open', () => {
    const email = workEmail({
      skill: 'matching records',
      wageCents: 20,
      workUrl: 'https://quorum.example/app-question.html',
      settingsUrl: 'https://quorum.example/app-settings.html',
      openForMs: 45 * 60_000,
    })
    assert.match(email.html, /being held for you/)
    assert.match(email.html, /Open for 45 minutes/)
    assert.match(email.text, /next 45 minutes/)
  })
})
