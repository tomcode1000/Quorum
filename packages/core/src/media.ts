import { AskError } from './request.js'

/**
 * Images an agent sends inline, rather than as a link.
 *
 * Most agents hold a screenshot as bytes, not as something already on the web,
 * and asking them to find somewhere to host it first is asking for a storage
 * account they do not have. So an image can arrive as base64, a `data:` URI or an
 * A2A file part with `bytes`, and each becomes the same `data:` URI here. The
 * gateway then keeps the bytes itself and hands the worker a link to them.
 */

/** Big enough for a phone screenshot, small enough to hold in memory per question. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

/** Reads the type from the first bytes, so a caller does not have to say it. */
function sniff(bytes: Buffer): string | undefined {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'image/webp'
  if (bytes.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif'
  return undefined
}

/** An inline image: the bytes and their type. */
export type InlineImage = { mimeType: string; bytes: Buffer }

/**
 * Decodes base64 or a `data:` URI into an image, or says plainly why it is not one.
 * A declared type is checked against the bytes, not trusted.
 */
export function readInlineImage(input: string, declaredType?: string): InlineImage {
  let base64 = input.trim()
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(base64)
  if (match) {
    if (!match[2]) throw new AskError(400, 'an inline image must be base64 encoded')
    base64 = match[3] ?? ''
  }
  const bytes = Buffer.from(base64.replace(/\s/g, ''), 'base64')
  if (bytes.length === 0) throw new AskError(400, 'the inline image is empty')
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new AskError(400, `the image is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is 5 MB`)
  const mimeType = sniff(bytes)
  if (!mimeType)
    throw new AskError(400, `the image must be one of ${TYPES.join(', ')}${declaredType ? `, not ${declaredType}` : ''}`)
  return { mimeType, bytes }
}

export function isDataUri(url: string): boolean {
  return url.startsWith('data:')
}

/** The canonical inline form, which the gateway swaps for a link it serves. */
export function toDataUri(image: InlineImage): string {
  return `data:${image.mimeType};base64,${image.bytes.toString('base64')}`
}

/**
 * The image an agent's `context` carries, as one URL: a link it sent as is, or
 * inline bytes (`image_base64`, or a `data:` URI in `image_url`) checked and
 * normalised to a `data:` URI.
 */
export function contextImageUrl(context: { image_url?: string | undefined; image_base64?: string | undefined } | undefined): string | undefined {
  if (context?.image_base64) return toDataUri(readInlineImage(context.image_base64))
  if (context?.image_url && isDataUri(context.image_url)) return toDataUri(readInlineImage(context.image_url))
  return context?.image_url
}
