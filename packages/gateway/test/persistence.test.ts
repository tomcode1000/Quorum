import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Persistence } from '../src/persistence.js'
import { Store } from '../src/store.js'

/**
 * The roster outliving a restart.
 *
 * A host that wipes its disk on restart lost every worker, skill and record. With
 * the roster kept elsewhere, a fresh process must load exactly what the last one
 * saved, and the first move off the local file must carry that file across.
 */

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

function memory(initial: string | null = null): Persistence & { text: string | null } {
  const box = {
    text: initial,
    label: 'memory',
    async read() {
      return box.text
    },
    async write(text: string) {
      box.text = text
    },
  }
  return box
}

describe('the roster across restarts', () => {
  it('loads in a new process exactly what the last one saved', async () => {
    const kept = memory()
    const before = new Store({ persistence: kept })
    const worker = before.upsertWorker('survivor-01', ADDRESS)
    worker.skills.match = 'passed'
    worker.email = 'survivor@example.com'
    await before.save()

    const after = new Store({ persistence: kept })
    await after.load()
    const back = after.workers.get('survivor-01')
    assert.ok(back, 'the worker is still there')
    assert.equal(back.skills.match, 'passed')
    assert.equal(back.email, 'survivor@example.com')
  })

  it('carries an existing roster across on first moving to a new store', async () => {
    const file = memory()
    const old = new Store({ persistence: file })
    old.upsertWorker('veteran-01', ADDRESS).skills.verify = 'passed'
    await old.save()

    const fresh = memory()
    const moved = new Store({ persistence: fresh, migrateFrom: file })
    await moved.load()
    assert.equal(moved.workers.get('veteran-01')?.skills.verify, 'passed')
    assert.ok(fresh.text, 'and it is written to the new store straight away')
  })

  it('keeps saving after one write fails', async () => {
    let fail = true
    const flaky: Persistence & { text: string | null } = {
      text: null,
      label: 'flaky',
      async read() {
        return null
      },
      async write(text) {
        if (fail) throw new Error('network down')
        flaky.text = text
      },
    }
    const store = new Store({ persistence: flaky })
    store.upsertWorker('steady-01', ADDRESS)
    await store.save()
    fail = false
    await store.save()
    assert.ok(flaky.text?.includes('steady-01'), 'a later save still lands')
  })
})
