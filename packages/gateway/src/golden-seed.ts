import type { GoldenQuestion } from '@quorum/core'

/**
 * Known-answer questions, seeded into the queue at a low rate.
 *
 * These calibrate reputation against truth rather than only against what other
 * workers happened to say, which is the one signal that does not degrade when a
 * whole pool is careless at once. They are paid and presented identically to real
 * work, because a check a worker can spot is a check they can pass selectively.
 *
 * Each one is deliberately answerable by anyone paying attention and unanswerable by
 * anyone who is not — that is the entire design criterion. A golden question that a
 * careful worker could reasonably get wrong measures the question, not the worker,
 * and would quietly poison the reputation model it exists to protect.
 *
 * A production seed would be drawn from resolved questions with unanimous
 * high-reputation agreement, rotated often enough that a worker cannot memorise the
 * set. This file is the bootstrap for a roster that has no history yet.
 */
export const GOLDEN_SEED: readonly GoldenQuestion[] = [
  {
    id: 'g_receipt_total',
    kind: 'disambiguate',
    prompt: 'The line reads "TOTAL 128.40". Is the total 128.40 or 12.84?',
    schema: { kind: 'choice', options: ['128.40', '12.84'] },
    truth: '128.40',
  },
  {
    id: 'g_date_order',
    kind: 'disambiguate',
    prompt: 'An invoice dated "03/11/2026" was issued by a company in London. Which month is it?',
    schema: { kind: 'choice', options: ['March', 'November'] },
    truth: 'November',
  },
  {
    id: 'g_unit_confusion',
    kind: 'disambiguate',
    prompt: 'A parcel weight is recorded as "2.5 kg". What is that in grams?',
    schema: { kind: 'number', unit: 'g', tolerance: 1 },
    truth: 2500,
  },
  {
    id: 'g_address_real',
    kind: 'verify',
    prompt: 'Is "221B Baker Street, London" a real street address format for the United Kingdom?',
    schema: { kind: 'boolean' },
    truth: true,
  },
  {
    id: 'g_email_valid',
    kind: 'verify',
    prompt: 'Is "contact@@example.com" a validly formatted email address?',
    schema: { kind: 'boolean' },
    truth: false,
  },
  {
    id: 'g_currency_symbol',
    kind: 'verify',
    prompt: 'A price is written as "£40". Is that amount in pounds sterling?',
    schema: { kind: 'boolean' },
    truth: true,
  },
]
