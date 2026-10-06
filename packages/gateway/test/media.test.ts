import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AskError, parseAsk, parseInputRequired } from '@quorum/core'
import { hostImages, MediaStore, mediaRoutes } from '../src/media.js'

/**
 * A screenshot sent as bytes, with nothing hosted.
 *
 * An agent holding a receipt screenshot should not need a storage account to ask
 * about it. These pin that the bytes are accepted on each route in, and that the
 * worker is handed a link the gateway itself serves.
 */

// A 1x1 PNG: the smallest real image.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const ask = (context: Record<string, unknown>) => ({
  question: 'Is the total 45.00 or 4.50?',
  kind: 'disambiguate',
  answer_schema: { type: 'enum', options: ['45.00', '4.50'] },
  max_price: '1.00',
  deadline_ms: 30_000,
  context,
})

describe('an inline image', () => {
  it('is accepted as raw base64, or as a data: URI', () => {
    for (const context of [{ image_base64: PNG }, { image_url: `data:image/png;base64,${PNG}` }]) {
      const [image] = parseAsk(ask(context)).attachments
      assert.equal(image?.type, 'image')
      assert.ok(image?.type === 'image' && image.url.startsWith('data:image/png;base64,'))
    }
  })

  it('still takes a plain link as it is', () => {
    const [image] = parseAsk(ask({ image_url: 'https://agent.example/receipt.jpg' })).attachments
    assert.ok(image?.type === 'image' && image.url === 'https://agent.example/receipt.jpg')
  })

  it('refuses something that is not an image', () => {
    assert.throws(() => parseAsk(ask({ image_base64: Buffer.from('not a picture').toString('base64') })), AskError)
  })

  it('arrives as bytes in an A2A file part', () => {
    const parsed = parseInputRequired({
      id: 'task-1',
      status: {
        state: 'input-required',
        message: {
          role: 'agent',
          messageId: 'm1',
          parts: [
            { kind: 'text', text: 'Is the total 45.00 or 4.50?' },
            { kind: 'file', file: { name: 'receipt.png', mimeType: 'image/png', bytes: PNG } },
          ],
        },
      },
      metadata: {
        'dev.quorum.resolver': { kind: 'disambiguate', answer_schema: { type: 'enum', options: ['45.00', '4.50'] }, max_price: '1.00' },
      },
    })
    const image = parsed.attachments.find((a) => a.type === 'image')
    assert.ok(image?.type === 'image' && image.url.startsWith('data:image/png;base64,'))
  })

  it('reaches the worker as a link the gateway serves, with the same bytes', async () => {
    const media = new MediaStore()
    const parsed = parseAsk(ask({ image_base64: PNG }))
    const question = hostImages(
      { id: 'q_1', kind: parsed.kind, prompt: parsed.prompt, schema: parsed.schema, priceCents: 100, timeoutMs: 30_000, attachments: parsed.attachments },
      media,
      'https://gateway.example',
    )
    const [image] = question.attachments ?? []
    assert.ok(image?.type === 'image')
    const match = /^https:\/\/gateway\.example\/v1\/media\/([0-9a-f]{32})$/.exec(image.url)
    assert.ok(match, image.url)

    const response = await mediaRoutes(media).request(`/${match[1]}`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(PNG, 'base64'))

    assert.equal((await mediaRoutes(media).request('/0123456789abcdef0123456789abcdef')).status, 404)
  })
})
