import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { Config } from '../src/config.js'
import { operatorQuestionRoutes } from '../src/operator-questions.js'
import { Router } from '../src/router.js'
import { Store } from '../src/store.js'
import { FakePaymaster } from './fake-paymaster.js'

const config = { network: 'testnet', publicUrl: 'https://gateway.example', workerAppOrigins: [] } as unknown as Config
const TOKEN = 'operator-secret'

const stores: Store[] = []

// Held questions wait for their deadline; settle them so the test process can exit.
afterEach(() => {
  for (const store of stores.splice(0))
    for (const live of store.live.values()) live.finish({ status: 'timeout' } as Parameters<typeof live.finish>[0])
})

function routes() {
  const store = new Store()
  stores.push(store)
  const router = new Router({ store, paymaster: new FakePaymaster() })
  const app = operatorQuestionRoutes({ config, store, router, token: TOKEN })
  const post = (path: string, body: unknown, auth = TOKEN) =>
    app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body: JSON.stringify(body) })
  return { store, app, post }
}

describe('questions sent from the console', () => {
  it('needs the operator token', async () => {
    const { post } = routes()
    assert.equal((await post('/ask', {}, 'wrong')).status, 401)
  })

  it('puts a written question in front of workers', async () => {
    const { store, post, app } = routes()
    const response = await post('/ask', { kind: 'verify', question: 'Is this the brand’s own store?', answer_schema: { type: 'boolean' }, context: { text: 'nike-outlet-sale.shop' }, deadline_ms: 15_000 })
    assert.equal(response.status, 200)
    const { sent } = (await response.json()) as { sent: { id: string } }
    assert.ok(store.live.has(sent.id), 'the router is holding it for a worker')
    const list = (await (await app.request('/', { headers: { authorization: `Bearer ${TOKEN}` } })).json()) as { sent: { id: string }[] }
    assert.equal(list.sent[0]?.id, sent.id)
  })

  it('runs and stops a session', async () => {
    const { post } = routes()
    const started = (await (await post('/session', { minutes: 5, every_seconds: 60 })).json()) as { session: { running: boolean; sent: number } }
    assert.equal(started.session.running, true)
    assert.equal(started.session.sent, 1, 'the first question goes at once')
    const stopped = (await (await post('/session/stop', {})).json()) as { session: { running: boolean } }
    assert.equal(stopped.session.running, false)
  })
})
