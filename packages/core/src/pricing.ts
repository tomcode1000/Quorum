import { MAX_RESPONDERS, WAGE_CENTS } from './quorum.js'
import { SERVABLE_KINDS, type AnswerSchema, type Kind } from './types.js'

/**
 * Pricing.
 *
 * The price is set by what the caller's error would have cost, not by what the
 * labour costs. An agent developer will pay twenty-five cents to stop a billing
 * agent confidently invoicing the wrong amount; the same twenty-five cents buys
 * several seconds of a person's attention with change left over. The gap between
 * those two numbers is the margin, and it is wide because what is being sold is
 * correctness rather than time.
 *
 * Pricing off the wage bill instead would put this in a race with piecework
 * platforms at a third of a cent per task, which is a race worth losing.
 */

/**
 * The least we will accept for a question of each kind, in cents.
 *
 * A floor exists because the target confidence derives from the price: below the
 * floor the caller is asking for an answer we cannot responsibly buy, and quoting
 * them anyway would mean selling a single unproven opinion as though it were a
 * resolved question.
 */
export const PRICE_FLOOR_CENTS: Record<Kind, number> = {
  // Roughly ordered by how much reading each takes before an answer is possible.
  verify: 5,
  match: 8,
  disambiguate: 8,
  categorise: 8,
  compare: 12,
  extract: 12,
}

/** The most we will charge. Above this, extra spend buys no reachable confidence. */
export const PRICE_CEILING_CENTS = 50

export type Quote =
  | { readonly ok: true; readonly priceCents: number; readonly floorCents: number }
  | { readonly ok: false; readonly reason: string; readonly floorCents: number }

/**
 * Quotes a question against the caller's ceiling.
 *
 * The caller states what they are willing to pay and we charge up to that, because
 * price is the same dial as confidence: a caller who offers more is asking for a
 * surer answer and funding the extra opinions it takes. If their ceiling is below
 * our floor we decline with the floor attached rather than issuing a challenge, so
 * they can decide whether to raise it instead of paying for a disappointment.
 */
export function quote(input: { kind: Kind; maxPriceCents: number; schema: AnswerSchema }): Quote {
  const floorCents = priceFloor(input.kind, input.schema)
  if (!SERVABLE_KINDS.includes(input.kind))
    return {
      ok: false,
      floorCents,
      reason: `kind "${input.kind}" is declared but not servable in this version; servable kinds are ${SERVABLE_KINDS.join(', ')}`,
    }
  if (input.maxPriceCents < floorCents)
    return {
      ok: false,
      floorCents,
      reason: `max price of ${input.maxPriceCents}c is below the ${floorCents}c floor for a ${input.kind} question with this answer space`,
    }
  return { ok: true, priceCents: Math.min(input.maxPriceCents, PRICE_CEILING_CENTS), floorCents }
}

/**
 * The floor for a question, which rises with the size of the answer space.
 *
 * A wider answer space is harder to answer and easier to get wrong, and it takes
 * more attention per answer, so it is not priced the same as a yes/no.
 */
export function priceFloor(kind: Kind, schema: AnswerSchema): number {
  const base = PRICE_FLOOR_CENTS[kind]
  if (schema.kind === 'choice' && schema.options.length > 4) return base + 2
  if (schema.kind === 'number') return base + 2
  return base
}

/** The most we could possibly pay out on a question, in cents. */
export function maxWageBillCents(wageCents = WAGE_CENTS): number {
  return MAX_RESPONDERS * wageCents
}

/**
 * Gross margin on a resolved question.
 *
 * Passed the number of answers actually bought, because that is the variable the
 * adaptive engine exists to keep small. At the twenty-five cent price a
 * single-answer resolution nets about twenty-three cents; the same question under
 * fixed three-way voting nets nineteen.
 */
export function marginCents(priceCents: number, answersBought: number, wageCents = WAGE_CENTS, feeCents = 0.1): number {
  return priceCents - answersBought * wageCents - answersBought * feeCents
}

/**
 * Expected cost of a question including the refunded failures it will produce.
 *
 * A `no_consensus` question pays every responder and earns nothing, so the margin
 * above is not the whole picture. This is the number that has to stay positive.
 */
export function expectedMarginCents(
  priceCents: number,
  options: { answersBought: number; noConsensusRate: number; wageCents?: number } = {
    answersBought: 1.6,
    noConsensusRate: 0.05,
  },
): number {
  const wageCents = options.wageCents ?? WAGE_CENTS
  const revenue = priceCents * (1 - options.noConsensusRate)
  // Failures buy more answers than successes do, by definition: they escalated.
  const wages = options.answersBought * wageCents * (1 - options.noConsensusRate) + MAX_RESPONDERS * wageCents * options.noConsensusRate
  return revenue - wages
}
