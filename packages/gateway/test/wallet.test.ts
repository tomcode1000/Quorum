import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { describe, it } from 'node:test'
import { concat, getAddress, keccak256, slice, type Hex } from 'viem'
import { Router } from '../src/router.js'
import { Store } from '../src/store.js'
import { isWorkerSend } from '../src/wallet-routes.js'
import { passkeyAddress, workerApi } from '../src/worker-api.js'
import { FakePaymaster } from './fake-paymaster.js'

/**
 * Where a worker's money goes, and who may move it.
 *
 * An earlier version derived a passkey worker's address with its own hash, which
 * gave an address no key on Tempo could sign for: every wage paid there was gone. So
 * the derivation is checked here against Tempo's rule computed independently, and
 * the relay is checked to pay fees for one thing only.
 */

const CURRENCY = '0x20c0000000000000000000000000000000000000'

/** A fresh P-256 key, as a passkey would hold, with its public key as viem writes it: x then y. */
function passkey(): { x: Hex; y: Hex; publicKey: Hex } {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = publicKey.export({ format: 'jwk' })
  const hex = (b64: string | undefined) => `0x${Buffer.from(b64 ?? '', 'base64url').toString('hex')}` as Hex
  const x = hex(jwk.x)
  const y = hex(jwk.y)
  return { x, y, publicKey: concat([x, y]).toLowerCase() as Hex }
}

function api() {
  const store = new Store()
  const paymaster = new FakePaymaster()
  const router = new Router({ store, paymaster })
  const app = workerApi({ store, router, paymaster, wageCents: 20, chainId: 42431, currency: CURRENCY })
  const register = (body: unknown) =>
    app.request('/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { store, app, register }
}

describe('passkey accounts', () => {
  it('derives the address Tempo does: the last 20 bytes of keccak256(x || y)', () => {
    const key = passkey()
    const expected = getAddress(slice(keccak256(concat([key.x, key.y])), 12))
    assert.equal(passkeyAddress('credential-id-1', key.publicKey), expected)
  })

  it('accepts the uncompressed form too, and stores the key one way', async () => {
    const { register, store } = api()
    const key = passkey()
    const address = passkeyAddress('credential-id-7', key.publicKey)
    const response = await register({ workerId: 'credential-id-7', publicKey: concat(['0x04', key.x, key.y]), address })
    assert.equal(response.status, 200)
    assert.deepEqual(store.workers.get('credential-id-7')?.signer, { kind: 'passkey', publicKey: key.publicKey })
  })

  it('refuses an address the passkey does not control', async () => {
    const { register } = api()
    const key = passkey()
    const response = await register({
      workerId: 'credential-id-2',
      publicKey: key.publicKey,
      address: '0x1111111111111111111111111111111111111111',
    })
    assert.equal(response.status, 400)
  })

  it('records the key, and hands it back for signing in later', async () => {
    const { app, register, store } = api()
    const key = passkey()
    const address = passkeyAddress('credential-id-3', key.publicKey)
    assert.equal((await register({ workerId: 'credential-id-3', publicKey: key.publicKey, address })).status, 200)

    assert.deepEqual(store.workers.get('credential-id-3')?.signer, { kind: 'passkey', publicKey: key.publicKey })
    const lookup = await app.request('/key?workerId=credential-id-3')
    assert.deepEqual(await lookup.json(), { publicKey: key.publicKey })
  })

  it('never re-points a worker at a different key', async () => {
    const { register, store } = api()
    // A worker from before keys were recorded, at an address nothing can sign for.
    await register({ workerId: 'credential-id-4', address: '0x2222222222222222222222222222222222222222' })
    const key = passkey()
    const legacy = await register({
      workerId: 'credential-id-4',
      publicKey: key.publicKey,
      address: passkeyAddress('credential-id-4', key.publicKey),
    })
    assert.equal(legacy.status, 409, 'an old passkey is told to make a new one, not silently moved')

    const kept = passkey()
    await register({ workerId: 'credential-id-6', publicKey: kept.publicKey, address: passkeyAddress('credential-id-6', kept.publicKey) })
    const other = passkey()
    const takeover = await register({
      workerId: 'credential-id-6',
      publicKey: other.publicKey,
      address: passkeyAddress('credential-id-6', other.publicKey),
    })
    assert.equal(takeover.status, 409)
    assert.equal(store.workers.get('credential-id-6')?.address, passkeyAddress('credential-id-6', kept.publicKey))
  })

  it('keeps Tempo Wallet ids out of the unauthenticated register route', async () => {
    const { register } = api()
    const response = await register({ workerId: 'tw-someone-else', address: '0x3333333333333333333333333333333333333333' })
    assert.equal(response.status, 400)
  })
})

describe('the fee relay', () => {
  const worker = '0x4444444444444444444444444444444444444444'
  const store = new Store()
  store.upsertWorker('credential-id-5', worker, { kind: 'passkey', publicKey: passkey().publicKey })
  const transfer = `0xa9059cbb${'0'.repeat(128)}` as Hex

  it('sponsors a worker sending the wage currency out of their own account', () => {
    assert.equal(isWorkerSend({ from: worker, calls: [{ to: CURRENCY, data: transfer }] }, store, CURRENCY), true)
  })

  it('refuses a sender who is not a worker', () => {
    const stranger = '0x5555555555555555555555555555555555555555'
    assert.equal(isWorkerSend({ from: stranger, calls: [{ to: CURRENCY, data: transfer }] }, store, CURRENCY), false)
  })

  it('refuses anything but a single transfer of the wage currency', () => {
    const otherToken = '0x20c0000000000000000000000000000000000001'
    const approve = `0x095ea7b3${'0'.repeat(128)}` as Hex
    assert.equal(isWorkerSend({ from: worker, calls: [{ to: otherToken, data: transfer }] }, store, CURRENCY), false)
    assert.equal(isWorkerSend({ from: worker, calls: [{ to: CURRENCY, data: approve }] }, store, CURRENCY), false)
    assert.equal(
      isWorkerSend({ from: worker, calls: [{ to: CURRENCY, data: transfer }, { to: CURRENCY, data: transfer }] }, store, CURRENCY),
      false,
    )
  })
})
