import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { adviseFromCost, PRICE_CEILING_CENTS, priceFloor } from '../src/pricing.js'
import type { AnswerSchema } from '../src/types.js'

/**
 * Pricing from the cost of being wrong.
 *
 * An agent says what a wrong answer would cost; Quorum says whether a person is worth
 * asking and at what price. These pin the shape of that advice rather than exact
 * cents, so the curve can be retuned without the tests lying about why.
 */

const choice: AnswerSchema = { kind: 'choice', options: ['45.00', '4.50'] }

describe('pricing from the cost of error', () => {
  it('buys the most certainty on offer when a mistake is expensive', () => {
    const advice = adviseFromCost({ kind: 'disambiguate', schema: choice, costOfErrorCents: 400_000 })
    assert.equal(advice.priceCents, PRICE_CEILING_CENTS)
    assert.ok(advice.targetConfidence >= 0.99)
  })

  it('stays at the floor when a mistake is cheap', () => {
    const advice = adviseFromCost({ kind: 'disambiguate', schema: choice, costOfErrorCents: 50 })
    assert.equal(advice.priceCents, priceFloor('disambiguate', choice))
  })

  it('pays more as the cost of error rises', () => {
    const prices = [100, 1_000, 10_000, 100_000].map(
      (costOfErrorCents) => adviseFromCost({ kind: 'verify', schema: { kind: 'boolean' }, costOfErrorCents }).priceCents,
    )
    for (let i = 1; i < prices.length; i += 1) assert.ok(prices[i]! >= prices[i - 1]!, `prices should not fall: ${prices.join(', ')}`)
  })

  it('says not to ask when the guess is already good enough for the stakes', () => {
    const advice = adviseFromCost({ kind: 'verify', schema: { kind: 'boolean' }, costOfErrorCents: 200, callerConfidence: 0.97 })
    assert.equal(advice.worthAsking, false)
  })

  it('says to ask when an unsure guess puts real money at risk', () => {
    const advice = adviseFromCost({ kind: 'disambiguate', schema: choice, costOfErrorCents: 400_000, callerConfidence: 0.41 })
    assert.equal(advice.worthAsking, true)
    assert.ok(advice.expectedCostWithCents < (advice.expectedLossWithoutCents ?? 0))
  })
})

describe('asking with a cost of error', () => {
  const base = {
    question: 'Is the total 45.00 or 4.50?',
    kind: 'disambiguate',
    answer_schema: { type: 'enum', options: ['45.00', '4.50'] },
    deadline_ms: 20_000,
  }

  it('accepts a cost of error in place of a price ceiling', async () => {
    const { parseAsk } = await import('../src/request.js')
    const parsed = parseAsk({ ...base, cost_of_error: '4000.00', caller_confidence: 0.41 })
    assert.equal(parsed.costOfErrorCents, 400_000)
    assert.equal(parsed.maxPriceCents, PRICE_CEILING_CENTS)
  })

  it('refuses a question with neither a ceiling nor a cost of error', async () => {
    const { parseAsk, AskError } = await import('../src/request.js')
    assert.throws(() => parseAsk(base), AskError)
  })

  it('declines before charging when a person is not worth it', async () => {
    const { priceAsk } = await import('../src/pricing.js')
    const priced = priceAsk({ kind: 'verify', schema: { kind: 'boolean' }, maxPriceCents: 50, costOfErrorCents: 200, callerConfidence: 0.97 })
    assert.equal(priced.kind, 'not-worth-asking')
  })
})
