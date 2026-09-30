import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { GOLDEN_SEED } from '../src/golden-seed.js'
import { Router } from '../src/router.js'
import { legacySkills, standing } from '../src/skills.js'
import { Store } from '../src/store.js'
import { workerApi } from '../src/worker-api.js'
import { FakePaymaster } from './fake-paymaster.js'

/**
 * Skills.
 *
 * A worker picks what they want to do and is assessed in each pick; only a passed
 * skill brings work. These check the flow end to end through the worker API, and
 * that routing honours it.
 */

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

function api() {
  const store = new Store()
  store.golden.push(...GOLDEN_SEED)
  const paymaster = new FakePaymaster()
  const router = new Router({ store, paymaster })
  const app = workerApi({ store, router, paymaster, wageCents: 20, chainId: 42431, currency: '0x20c0000000000000000000000000000000000000' })
  const send = async (path: string, body: unknown) =>
    (await app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<
      Record<string, unknown>
    >
  const read = async (path: string) => (await app.request(path)).json() as Promise<Record<string, unknown>>
  return { store, send, read }
}

/** Answers the current assessment right or wrong until its result is decided. */
async function sit(h: ReturnType<typeof api>, workerId: string, right: boolean) {
  let step = await h.read(`/assessment?workerId=${workerId}`)
  while (step.status === 'in-progress') {
    const question = step.question as { prompt: string }
    const golden = GOLDEN_SEED.find((g) => g.prompt === question.prompt)
    assert.ok(golden, 'an assessment question should come from the known-answer pool')
    const wrong =
      golden.schema.kind === 'boolean'
        ? golden.truth !== true
        : golden.schema.kind === 'choice'
          ? golden.schema.options.find((o) => o !== golden.truth)
          : Number(golden.truth) + 1000
    step = await h.send('/assessment', { workerId, value: right ? golden.truth : wrong })
  }
  return step
}

describe('skills', () => {
  it('offers every capability, and each has enough known answers to be assessed', async () => {
    const h = api()
    await h.send('/register', { workerId: 'worker-001', address: ADDRESS })
    const view = await h.read('/skills?workerId=worker-001')
    const skills = view.skills as { kind: string; assessable: boolean }[]
    assert.equal(view.standing, 'choose', 'a new worker starts by choosing')
    assert.deepEqual(
      skills.map((s) => s.kind),
      ['disambiguate', 'verify', 'match', 'categorise', 'compare'],
    )
    assert.ok(skills.every((s) => s.assessable))
  })

  it('assesses each chosen skill in turn, with questions of that skill only', async () => {
    const h = api()
    await h.send('/register', { workerId: 'worker-002', address: ADDRESS })
    await h.send('/skills', { workerId: 'worker-002', kinds: ['match', 'compare'] })

    const first = await h.read('/assessment?workerId=worker-002')
    assert.equal(first.skill, 'match')
    assert.equal(first.skillsAfter, 1)
    assert.equal((first.question as { kind: string }).kind, 'match')

    const matched = await sit(h, 'worker-002', true)
    assert.equal(matched.status, 'passed')
    assert.equal(matched.next, 'compare', 'the next picked skill follows')

    const compared = await sit(h, 'worker-002', false)
    assert.equal(compared.status, 'failed')
    assert.equal(compared.standing, 'passed', 'failing one skill leaves the passed one working')
    assert.deepEqual(compared.passedSkills, ['match'])
  })

  it('does not let a failed skill be picked again and retaken', async () => {
    const h = api()
    await h.send('/register', { workerId: 'worker-003', address: ADDRESS })
    await h.send('/skills', { workerId: 'worker-003', kinds: ['verify'] })
    await sit(h, 'worker-003', false)
    await h.send('/skills', { workerId: 'worker-003', kinds: ['verify'] })
    assert.equal(h.store.workers.get('worker-003')?.skills.verify, 'failed')
    assert.equal((await h.read('/assessment?workerId=worker-003')).status, 'failed')
  })

  it('holds a worker back from work until a skill is passed', async () => {
    const h = api()
    await h.send('/register', { workerId: 'worker-004', address: ADDRESS })
    assert.equal((await h.read('/next?workerId=worker-004')).blocked, 'skills-required')
    await h.send('/skills', { workerId: 'worker-004', kinds: ['categorise'] })
    assert.equal((await h.read('/next?workerId=worker-004')).blocked, 'assessment-required')
  })

  it('routes a kind of question only to workers who passed that skill', () => {
    const store = new Store()
    const reader = store.upsertWorker('reader-01', ADDRESS)
    reader.skills = { disambiguate: 'passed', verify: 'failed' }
    const matcher = store.upsertWorker('matcher-01', ADDRESS)
    matcher.skills = { match: 'passed' }

    assert.deepEqual(store.availableWorkers('disambiguate').map((w) => w.workerId), ['reader-01'])
    assert.deepEqual(store.availableWorkers('match').map((w) => w.workerId), ['matcher-01'])
    assert.deepEqual(store.availableWorkers('verify'), [], 'a failed skill brings no work')
    assert.deepEqual(store.availableWorkers('compare'), [])
  })

  it('carries workers from before skills over to the kinds they were graded on', () => {
    const record = { byKind: { disambiguate: { agreements: 4, disagreements: 1 }, verify: { agreements: 0, disagreements: 0 } } }
    assert.deepEqual(legacySkills(record, false), { disambiguate: 'passed' })
    assert.equal(standing(legacySkills(record, true)), 'failed')
    assert.equal(standing(legacySkills({ byKind: {} }, false)), 'choose')
  })
})
