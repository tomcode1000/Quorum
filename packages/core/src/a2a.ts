import { z } from 'zod'
import {
  AskError,
  MAX_CALLBACK_DEADLINE_MS,
  MAX_DEADLINE_MS,
  MIN_DEADLINE_MS,
  answerSchemaSchema,
  readPricing,
  toAnswerSchema,
  type ParsedAsk,
} from './request.js'
import { KINDS } from './types.js'
import { readInlineImage, toDataUri } from './media.js'
import type { Attachment, Kind, Resolution } from './types.js'

/**
 * The A2A boundary.
 *
 * When an agent enters `input-required` it already produces exactly the artefact
 * this service needs: a message holding the question it wants to put to a person,
 * attached to a task that is now paused. The specification expects that message to
 * be rendered in a UI for a watching user. In an autonomous chain there is no UI
 * and no user, so the message goes nowhere and the agent proceeds on a guess.
 *
 * Quorum accepts that same status object, unmodified, as native input. A caller
 * does not restate its question in our vocabulary; it forwards the thing it was
 * going to emit anyway. That is why this file parses the A2A shape rather than
 * asking callers to translate into ours, and it is the concrete version of the
 * claim that hiring a person costs the same integration effort as hiring an agent.
 */

/** Task states, from the specification's lifecycle. */
export const TASK_STATES = [
  'submitted',
  'working',
  'input-required',
  'auth-required',
  'completed',
  'failed',
  'canceled',
  'rejected',
] as const

export type TaskState = (typeof TASK_STATES)[number]

/** A message part. Quorum reads text parts, files and structured data. */
const partSchema = z.union([
  z.object({ kind: z.literal('text'), text: z.string() }),
  z.object({
    kind: z.literal('file'),
    file: z.object({
      name: z.string().optional(),
      mimeType: z.string().optional(),
      uri: z.string().optional(),
      bytes: z.string().optional(),
    }),
  }),
  z.object({ kind: z.literal('data'), data: z.unknown() }),
])

/**
 * Quorum's extension, carried in the task's metadata.
 *
 * The extension exists so a caller can say what a wrong answer would cost it and
 * what shape of answer it needs back. Two of those fields have no safe default and
 * so are required: an answer schema, because a constrained answer space is what
 * makes agreement computable, and a price ceiling, because the price is the dial
 * that sets how sure the answer has to be. Defaulting either one would mean
 * guessing on the caller's behalf about the two things they most need to control.
 */
export const EXTENSION_URI = 'dev.quorum.resolver'

const extensionSchema = z.object({
  kind: z.enum(KINDS).default('disambiguate'),
  answer_schema: answerSchemaSchema,
  max_price: z.union([z.string(), z.number()]).optional(),
  /** What acting on a wrong answer would cost, in dollars. See `adviseFromCost`. */
  cost_of_error: z.union([z.string(), z.number()]).optional(),
  deadline_ms: z.number().int().default(45_000),
  /**
   * Where to post the answer, for an agent that will not hold the connection.
   * With it the question is held until the deadline, even when nobody is online,
   * and the claim returns as soon as payment clears.
   */
  callback_url: z.string().url().optional(),
  caller_confidence: z.number().min(0).max(1).optional(),
})

/** An `input-required` task status, as an agent emits it. */
export const inputRequiredSchema = z.object({
  id: z.string().min(1),
  contextId: z.string().optional(),
  status: z.object({
    state: z.literal('input-required'),
    message: z.object({
      role: z.string().default('agent'),
      parts: z.array(partSchema).min(1),
      messageId: z.string().optional(),
    }),
    timestamp: z.string().optional(),
  }),
  // Unknown metadata passes through untouched: a caller should never have to strip
  // its own task down to suit us.
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type InputRequired = z.infer<typeof inputRequiredSchema>

/** Whether a body looks like a forwarded A2A task rather than a native ask. */
export function looksLikeInputRequired(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false
  const status = (body as { status?: { state?: unknown } }).status
  return typeof status === 'object' && status !== null && status.state === 'input-required'
}

/**
 * Turns a paused task into a question a person can answer.
 *
 * The first text part is the question, because that is where the specification puts
 * the agent's request to the user. The remaining parts become the evidence the
 * worker needs, which matters more than it sounds: a worker asked "does this say 45
 * or 4.50" with no receipt attached is being asked to guess, and a guess that
 * arrives wearing a confidence score is worse than no answer at all.
 */
export function parseInputRequired(body: unknown): ParsedAsk & { taskId: string } {
  const parsed = inputRequiredSchema.safeParse(body)
  if (!parsed.success)
    throw new AskError(400, 'not a valid A2A input-required task status', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  const task = parsed.data

  const parts = task.status.message.parts
  const textParts = parts.filter((p): p is Extract<typeof p, { kind: 'text' }> => p.kind === 'text')
  const prompt = textParts[0]?.text.trim()
  if (!prompt) throw new AskError(400, 'the input-required message has no text part, so there is no question to ask')

  const rawExtension = task.metadata?.[EXTENSION_URI]
  const extension = extensionSchema.safeParse(rawExtension ?? {})
  if (!extension.success)
    throw new AskError(
      422,
      `the ${EXTENSION_URI} extension is required on the task metadata, carrying at least answer_schema and one of max_price or cost_of_error`,
      { issues: extension.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    )
  const config = extension.data

  if (config.deadline_ms < MIN_DEADLINE_MS)
    throw new AskError(400, `a deadline of ${config.deadline_ms}ms is not servable by a person`)
  if (config.callback_url === undefined && config.deadline_ms > MAX_DEADLINE_MS)
    throw new AskError(400, `a deadline over ${MAX_DEADLINE_MS}ms needs a callback_url rather than a held connection`)
  if (config.deadline_ms > MAX_CALLBACK_DEADLINE_MS)
    throw new AskError(400, `a deadline over ${MAX_CALLBACK_DEADLINE_MS}ms is longer than any question is held`)

  const attachments: Attachment[] = []
  // Extra text parts are context the agent chose to send with its question.
  for (const part of textParts.slice(1)) attachments.push({ type: 'text', body: part.text })
  for (const part of parts) {
    // A file arrives as a link or as the bytes themselves; both reach the worker.
    if (part.kind === 'file' && (part.file.uri || part.file.bytes))
      attachments.push({
        type: 'image',
        url: part.file.bytes ? toDataUri(readInlineImage(part.file.bytes, part.file.mimeType)) : part.file.uri!,
        ...(part.file.name === undefined ? {} : { caption: part.file.name }),
      })
    if (part.kind === 'data') attachments.push({ type: 'json', body: part.data, caption: 'What the agent read' })
  }

  const { maxPriceCents, costOfErrorCents } = readPricing(config.max_price, config.cost_of_error)

  return {
    taskId: task.id,
    kind: config.kind as Kind,
    prompt,
    schema: toAnswerSchema(config.answer_schema),
    attachments,
    maxPriceCents,
    ...(costOfErrorCents === undefined ? {} : { costOfErrorCents }),
    timeoutMs: config.deadline_ms,
    mode: config.callback_url === undefined ? 'blocking' : 'callback',
    ...(config.callback_url === undefined ? {} : { callbackUrl: config.callback_url }),
    // The task id is the caller's own reference, carried through to the receipt.
    taskRef: task.id,
    ...(config.caller_confidence === undefined ? {} : { callerConfidence: config.caller_confidence }),
  }
}

/**
 * Turns a resolution back into the task status the calling agent expects, so the
 * paused task can simply resume.
 *
 * The failure cases matter more than the success case. A resolved question returns
 * `working` with the answer as a user-role message, which is the state the agent
 * would have reached had a person been watching. A question that did not resolve
 * returns `failed` — not a plausible-looking answer with a number attached.
 * Returning a confident guess here would reproduce, inside the thing built to
 * prevent it, the exact failure this product exists to stop.
 */
export function inputRequiredResponse(
  resolution: Resolution,
  taskId: string,
): {
  id: string
  status: { state: TaskState; message: { role: 'user'; parts: { kind: 'text'; text: string }[] } }
  metadata: Record<string, unknown>
} {
  const resolved = resolution.status === 'resolved'
  const text = resolved
    ? String(resolution.value)
    : `No answer could be obtained: ${resolution.status}. The caller's payment was refunded.`

  return {
    id: taskId,
    status: {
      state: resolved ? 'working' : 'failed',
      message: { role: 'user', parts: [{ kind: 'text', text }] },
    },
    metadata: {
      [EXTENSION_URI]: {
        status: resolution.status,
        confidence: resolution.confidence,
        responders: resolution.responders,
        agreement: resolution.agreement,
        evidence: resolution.evidence,
        latency_ms: resolution.latencyMs,
        receipts: resolution.receipts.map((r) => ({ tx_hash: r.txHash, memo: r.memo, amount_cents: r.amountCents })),
        ...(resolution.refund === undefined ? {} : { refunded: true, refund_tx: resolution.refund.txHash }),
      },
    },
  }
}
