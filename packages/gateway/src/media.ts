import { isDataUri, MAX_CALLBACK_DEADLINE_MS, readInlineImage, type Question } from '@quorum/core'
import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'

/**
 * Images a caller sent inline, held here so the worker gets a link, not bytes.
 *
 * A question travels to the worker app, the operator console and the event
 * stream; a 3 MB screenshot inside every one of those would be heavy and would
 * leave copies of a receipt wherever they landed. So the bytes stay in this map
 * and the question carries a link to them instead. The id is long and random,
 * which is what keeps it private: there is no listing, and nothing to guess.
 *
 * Kept in memory, like the questions themselves, and for as long as any question
 * can be held: nothing here needs to outlive a restart.
 */
export class MediaStore {
  readonly #images = new Map<string, { mimeType: string; bytes: Buffer; expiresAt: number }>()

  put(mimeType: string, bytes: Buffer): string {
    this.#sweep()
    const id = randomBytes(16).toString('hex')
    this.#images.set(id, { mimeType, bytes, expiresAt: Date.now() + MAX_CALLBACK_DEADLINE_MS + 60 * 60_000 })
    return id
  }

  get(id: string): { mimeType: string; bytes: Buffer } | undefined {
    const image = this.#images.get(id)
    if (!image || image.expiresAt < Date.now()) return undefined
    return image
  }

  #sweep(): void {
    const now = Date.now()
    for (const [id, image] of this.#images) if (image.expiresAt < now) this.#images.delete(id)
  }
}

/** The question, with every inline image swapped for a link this gateway serves. */
export function hostImages(question: Question, media: MediaStore, publicUrl: string): Question {
  if (!question.attachments?.some((a) => a.type === 'image' && isDataUri(a.url))) return question
  return {
    ...question,
    attachments: question.attachments.map((attachment) => {
      if (attachment.type !== 'image' || !isDataUri(attachment.url)) return attachment
      const image = readInlineImage(attachment.url)
      return { ...attachment, url: `${publicUrl}/v1/media/${media.put(image.mimeType, image.bytes)}` }
    }),
  }
}

export function mediaRoutes(media: MediaStore): Hono {
  const app = new Hono()
  app.get('/:id', (c) => {
    const image = media.get(c.req.param('id'))
    if (!image) return c.json({ error: 'no such image, or it has expired' }, 404)
    return c.body(new Uint8Array(image.bytes), 200, {
      'content-type': image.mimeType,
      'cache-control': 'private, max-age=86400',
      'x-content-type-options': 'nosniff',
    })
  })
  return app
}
