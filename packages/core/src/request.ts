import { z } from 'zod'
import { KINDS } from './types.js'
import type { Attachment, Kind, Question } from './types.js'
import { PRICE_CEILING_CENTS } from './pricing.js'

/**
 * The request boundary.
 *
 * Two things arrive here and become the same `Question`: the native REST shape an
 * agent framework posts, and an A2A `input-required` task status forwarded
 * verbatim. The second matters more than the first, because it is the whole
 * integration story — an agent that hits `input-required` already produces exactly
 * the artefact we need, and being able to forward it unmodified is what makes the
 * integration cost approximately nothing.
 *
 * Validation is strict on purpose. Every rejection below is a case where accepting
 * the request would mean taking money for something we cannot deliver.
 */

/** A human answer cannot be produced faster than a person can read the question. */
export const MIN_DEADLINE_MS = 5_000
export const MAX_DEADLINE_MS = 300_000

/** Answer schemas, minus free text: see the note on `AnswerSchema`. */
export const answerSchemaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('boolean') }),
  z.object({ type: z.literal('enum'), options: z.array(z.string().min(1)).min(2).max(12) }),
  z.object({ type: z.literal('number'), unit: z.string().optional(), tolerance: z.number().nonnegative().optional() }),
])

const attachmentsSchema = z
  .object({
    image_url: z.string().url().optional(),
    text: z.string().optional(),
    extracted: z.unknown().optional(),
  })
  .passthrough()

/** The native shape, as an agent framework or the MCP tool sends it. */
export const askSchema = z.object({
  question: z.string().min(3).max(500),
  kind: z.enum(KINDS),
  context: attachmentsSchema.optional(),
  answer_schema: answerSchemaSchema,
  /** The caller's ceiling, in dollars, as a decimal string. Optional when `cost_of_error` is given. */
  max_price: z.union([z.string(), z.number()]).optional(),
  /**
   * What acting on a wrong answer would cost the caller, in dollars. When given,
   * Quorum prices the question from it, and says so plainly when a person is not
   * worth asking at all. See `adviseFromCost`.
   */
  cost_of_error: z.union([z.string(), z.number()]).optional(),
  deadline_ms: z.number().int(),
  /** Opaque A2A task reference. Accepted as a string and never parsed. */
  task_ref: z.string().max(500).optional(),
  /** The confidence the caller has in the guess it would otherwise have used. */
  caller_confidence: z.number().min(0).max(1).optional(),
  mode: z.enum(['blocking', 'callback']).default('blocking'),
  callback_url: z.string().url().optional(),
})

export type Ask = z.infer<typeof askSchema>

export type ParsedAsk = {
  kind: Kind
  prompt: string
  schema: Question['schema']
  attachments: Attachment[]
  maxPriceCents: number
  /** Set when the caller priced the question by what being wrong would cost. */
  costOfErrorCents?: number
  timeoutMs: number
  taskRef?: string
  callerConfidence?: number
  mode: 'blocking' | 'callback'
  callbackUrl?: string
}

export class AskError extends Error {
  constructor(
    readonly status: 400 | 409 | 422,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AskError'
  }
}

/** Validates a native request and normalises it. Throws `AskError` on rejection. */
export function parseAsk(body: unknown): ParsedAsk {
  const parsed = askSchema.safeParse(body)
  if (!parsed.success)
    throw new AskError(400, 'request does not match the expected shape', {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  const ask = parsed.data

  if (ask.deadline_ms < MIN_DEADLINE_MS)
    throw new AskError(
      400,
      `a deadline of ${ask.deadline_ms}ms is not servable by a person; the floor is ${MIN_DEADLINE_MS}ms`,
    )
  if (ask.deadline_ms > MAX_DEADLINE_MS)
    throw new AskError(400, `a deadline over ${MAX_DEADLINE_MS}ms should use callback mode rather than holding a socket`)
  if (ask.mode === 'callback' && !ask.callback_url)
    throw new AskError(400, 'callback mode requires callback_url')

  const { maxPriceCents, costOfErrorCents } = readPricing(ask.max_price, ask.cost_of_error)

  const attachments: Attachment[] = []
  if (ask.context?.image_url) attachments.push({ type: 'image', url: ask.context.image_url })
  if (ask.context?.text) attachments.push({ type: 'text', body: ask.context.text })
  if (ask.context?.extracted !== undefined)
    attachments.push({ type: 'json', body: ask.context.extracted, caption: 'What the agent read' })

  return {
    kind: ask.kind,
    prompt: ask.question.trim(),
    schema: toAnswerSchema(ask.answer_schema),
    attachments,
    maxPriceCents,
    ...(costOfErrorCents === undefined ? {} : { costOfErrorCents }),
    timeoutMs: ask.deadline_ms,
    mode: ask.mode,
    ...(ask.task_ref === undefined ? {} : { taskRef: ask.task_ref }),
    ...(ask.caller_confidence === undefined ? {} : { callerConfidence: ask.caller_confidence }),
    ...(ask.callback_url === undefined ? {} : { callbackUrl: ask.callback_url }),
  }
}

/**
 * The two ways a caller can price a question: a ceiling it is willing to pay, or
 * what being wrong would cost it. At least one is required. With only a cost of
 * error the ceiling is ours, and the price is chosen beneath it from that cost.
 */
export function readPricing(
  maxPrice: string | number | undefined,
  costOfError: string | number | undefined,
): { maxPriceCents: number; costOfErrorCents?: number } {
  if (maxPrice === undefined && costOfError === undefined)
    throw new AskError(400, 'give max_price, cost_of_error, or both: one of them has to set the price')
  const costOfErrorCents = costOfError === undefined ? undefined : toCents(costOfError)
  if (costOfErrorCents === null) throw new AskError(400, `cost_of_error "${String(costOfError)}" is not a valid amount`)
  const maxPriceCents = maxPrice === undefined ? PRICE_CEILING_CENTS : toCents(maxPrice)
  if (maxPriceCents === null) throw new AskError(400, `max_price "${String(maxPrice)}" is not a valid amount`)
  return { maxPriceCents, ...(costOfErrorCents === undefined ? {} : { costOfErrorCents }) }
}

/** Converts the wire answer schema into the internal one. */
export function toAnswerSchema(schema: z.infer<typeof answerSchemaSchema>): Question['schema'] {
  switch (schema.type) {
    case 'boolean':
      return { kind: 'boolean' }
    case 'enum':
      return { kind: 'choice', options: schema.options }
    case 'number':
      return {
        kind: 'number',
        ...(schema.unit === undefined ? {} : { unit: schema.unit }),
        ...(schema.tolerance === undefined ? {} : { tolerance: schema.tolerance }),
      }
  }
}

/** Parses a dollar amount into whole cents. Rejects anything it cannot read exactly. */
export function toCents(amount: string | number): number | null {
  const value = typeof amount === 'number' ? amount : Number(amount.replace(/[$,\s]/g, ''))
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100)
}

export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2)
}
