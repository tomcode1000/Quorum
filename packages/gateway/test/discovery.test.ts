import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { agentCard, serviceManifest } from '../src/agent-card.js'
import type { Config } from '../src/config.js'

/**
 * Discovery documents are load-bearing.
 *
 * Being findable on rails agents already use is the distribution argument, so a
 * wrong URL in one of these files is not a typo — it is the product being
 * undiscoverable while appearing to be listed. An earlier version advertised an
 * endpoint that did not exist, which is why these assertions are here.
 */
const config: Config = {
  network: 'testnet',
  currency: '0x20c0000000000000000000000000000000000000',
  treasuryKey: '0x00',
  recipient: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  paymentSecret: 'x'.repeat(32),
  port: 8787,
  publicUrl: 'https://quorum.example',
  statePath: 'data/workers.json',
  wageCents: 2,
  workerAppOrigins: ['http://localhost:5173'],
  devEndpoints: false,
}

/** The routes the gateway actually serves. Kept next to the assertions on purpose. */
const SERVED = ['/v1/questions', '/.well-known/agent-card.json']

describe('discovery', () => {
  it('advertises an endpoint the gateway actually serves', () => {
    const card = agentCard(config)
    const url = new URL(String(card.url))
    assert.ok(SERVED.includes(url.pathname), `agent card points at ${url.pathname}, which is not served`)
  })

  it('advertises the same endpoint in the catalog manifest', () => {
    const manifest = serviceManifest(config)
    assert.equal(String(manifest.serviceUrl), String(agentCard(config).url))
  })

  it('declares payment rather than an api key, because there is no account to provision', () => {
    const card = agentCard(config)
    assert.deepEqual(card.security, [{ payment: [] }])
  })

  it('names the extension that carries answer_schema and max_price', () => {
    const extensions = agentCard(config).extensions as { uri: string }[]
    assert.ok(extensions.some((e) => e.uri === 'dev.quorum.resolver'))
  })

  it('does not offer a skill it cannot serve', () => {
    const skills = agentCard(config).skills as { description: string }[]
    for (const skill of skills)
      assert.match(skill.description, /[Nn]ever for approvals|[Nn]ot for approvals/, 'the approvals boundary must be stated where an agent reads it')
  })
})
