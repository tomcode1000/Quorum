import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Hono } from 'hono'
import type { Mailer } from '../src/notifier.js'
import { Router } from '../src/router.js'
import { Store } from '../src/store.js'
import { GOLDEN_SEED } from '../src/golden-seed.js'
import { operatorWaitlistRoutes, redeemRoute, waitlistRoutes } from '../src/waitlist.js'
import { workerApi } from '../src/worker-api.js'
import { FakePaymaster } from './fake-paymaster.js'

/**
 * Invite-only sign-up, end to end: join, admitted by the operator, emailed a link,
 * blocked until the code is redeemed, and then free to pick skills.
 */

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const TOKEN = 'operator-secret'

function gateway(inviteOnly: boolean) {
  const store = new Store()
  store.inviteOnly = inviteOnly
  store.golden.push(...GOLDEN_SEED)
  const sent: Parameters<Mailer>[0][] = []
  const app = new Hono()
  app.route('/v1/waitlist', waitlistRoutes({ store }))
  app.route('/v1/worker', redeemRoute({ store }))
  app.route(
    '/v1/worker',
    workerApi({ store, router: new Router({ store, paymaster: new FakePaymaster() }), paymaster: new FakePaymaster(), wageCents: 20, chainId: 42431, currency: '0x20c0000000000000000000000000000000000000' }),
  )
  app.route(
    '/v1/admin/waitlist',
    operatorWaitlistRoutes({ store, token: TOKEN, mail: async (m) => void sent.push(m), signInUrl: 'https://site.example/app-signin', origins: [] }),
  )
  const post = (path: string, body: unknown, auth?: string) =>
    app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) })
  return { store, sent, app, post }
}

describe('invite-only sign-up', () => {
  it('lets a waitlisted person in only once their invite is redeemed', async () => {
    const { store, sent, app, post } = gateway(true)

    assert.equal((await post('/v1/waitlist', { email: 'Ada@Example.com', kinds: ['verify'] })).status, 200)
    assert.equal(store.waitlist.get('ada@example.com')?.kinds[0], 'verify')

    // A new account exists but can do nothing yet.
    const worker = store.upsertWorker('passkey-ada-1', ADDRESS)
    assert.equal(worker.admitted, false)
    const blocked = await post('/v1/worker/skills', { workerId: worker.workerId, kinds: ['verify'] })
    assert.equal(blocked.status, 403)
    assert.equal(((await blocked.json()) as { blocked: string }).blocked, 'invite-required')

    // Admitting needs the token, and emails a link carrying the code.
    assert.equal((await post('/v1/admin/waitlist/admit', { emails: ['ada@example.com'] })).status, 401)
    const admitted = await post('/v1/admin/waitlist/admit', { emails: ['ada@example.com'] }, TOKEN)
    assert.equal(admitted.status, 200)
    const code = store.waitlist.get('ada@example.com')?.code
    assert.ok(code)
    assert.equal(sent.length, 1)
    assert.ok(sent[0]?.text.includes(`https://site.example/app-signin?invite=${code}`))

    // A wrong code is refused; the right one lets them in.
    assert.equal((await post('/v1/worker/redeem', { workerId: worker.workerId, code: 'NOTACODE' })).status, 404)
    assert.equal((await post('/v1/worker/redeem', { workerId: worker.workerId, code })).status, 200)
    assert.equal(worker.admitted, true)
    assert.equal((await post('/v1/worker/skills', { workerId: worker.workerId, kinds: ['verify'] })).status, 200)

    // A code is used once.
    const other = store.upsertWorker('passkey-bob-1', ADDRESS)
    assert.equal((await post('/v1/worker/redeem', { workerId: other.workerId, code })).status, 409)

    const list = await app.request('/v1/admin/waitlist', { headers: { authorization: `Bearer ${TOKEN}` } })
    assert.equal(list.status, 200)
  })

  it('lets everyone in when it is switched off', async () => {
    const { store, post } = gateway(false)
    const worker = store.upsertWorker('passkey-cy-1', ADDRESS)
    assert.equal(worker.admitted, true)
    assert.equal((await post('/v1/worker/skills', { workerId: worker.workerId, kinds: ['verify'] })).status, 200)
  })
})
