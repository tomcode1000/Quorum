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

  /*
    Every skill a worker can choose is assessed with five of these, drawn from at
    least six so that two workers do not see the identical set. A skill with fewer
    than five cannot be assessed, and is therefore not offered at all.
  */

  // Telling two readings apart.
  {
    id: 'g_decimal_comma',
    kind: 'disambiguate',
    prompt: 'A German receipt shows "Summe 12,50 €". Is the total twelve euros fifty, or one thousand two hundred and fifty euros?',
    schema: { kind: 'choice', options: ['12.50', '1250.00'] },
    truth: '12.50',
  },
  {
    id: 'g_letter_o_zero',
    kind: 'disambiguate',
    prompt: 'An order number is printed as "INV-2O26-0042". Order numbers here are always digits after "INV-". Which is the order number?',
    schema: { kind: 'choice', options: ['INV-2026-0042', 'INV-2O26-0042'] },
    truth: 'INV-2026-0042',
  },
  {
    id: 'g_24_hour',
    kind: 'disambiguate',
    prompt: 'A delivery slot reads "Delivery 14:30". Is that in the morning or the afternoon?',
    schema: { kind: 'choice', options: ['Morning', 'Afternoon'] },
    truth: 'Afternoon',
  },

  // Checking something is real.
  {
    id: 'g_impossible_date',
    kind: 'verify',
    prompt: 'Is "31 February 2026" a real calendar date?',
    schema: { kind: 'boolean' },
    truth: false,
  },
  {
    id: 'g_label_matches',
    kind: 'verify',
    prompt: 'A listing says "100% cotton". The care label in the photo reads "Material: 100% cotton". Does the label match the listing?',
    schema: { kind: 'boolean' },
    truth: true,
  },
  {
    id: 'g_postcode_country',
    kind: 'verify',
    prompt: 'An address ends "Paris 75008, France". Is "75008" in the format of a French postcode?',
    schema: { kind: 'boolean' },
    truth: true,
  },

  // Matching records.
  {
    id: 'g_match_company',
    kind: 'match',
    prompt: 'Record A: "Acme Corp., 12 High St, Leeds". Record B: "ACME Corporation, 12 High Street, Leeds". Are these the same company at the same address?',
    schema: { kind: 'boolean' },
    truth: true,
  },
  {
    id: 'g_match_person',
    kind: 'match',
    prompt: 'Record A: "Jon Smith, born 4 May 1990". Record B: "Jane Smith, born 17 August 1972". Are these the same person?',
    schema: { kind: 'boolean' },
    truth: false,
  },
  {
    id: 'g_match_product',
    kind: 'match',
    prompt: 'Product A: "iPhone 15 Pro, 256 GB, Black Titanium". Product B: "Apple iPhone 15 Pro 256GB - Black Titanium". Are these the same product?',
    schema: { kind: 'boolean' },
    truth: true,
  },
  {
    id: 'g_match_size',
    kind: 'match',
    prompt: 'Listing A: "Nike Air Max 90, UK size 9". Listing B: "Nike Air Max 90, UK size 11". Are these the same item in the same size?',
    schema: { kind: 'boolean' },
    truth: false,
  },
  {
    id: 'g_match_place',
    kind: 'match',
    prompt: 'Record A: "St. Mary\'s Hospital, London W2 1NY". Record B: "Saint Marys Hospital, London W2 1NY". Are these the same place?',
    schema: { kind: 'boolean' },
    truth: true,
  },
  {
    id: 'g_match_booking',
    kind: 'match',
    prompt: 'Booking A: "Flight BA117, London to New York, 12 June". Booking B: "Flight BA117, London to New York, 19 June". Are these the same booking?',
    schema: { kind: 'boolean' },
    truth: false,
  },

  // Categorising.
  {
    id: 'g_cat_jeans',
    kind: 'categorise',
    prompt: 'Which category does "Blue denim jeans, slim fit" belong in?',
    schema: { kind: 'choice', options: ['Clothing', 'Electronics', 'Groceries', 'Furniture'] },
    truth: 'Clothing',
  },
  {
    id: 'g_cat_cable',
    kind: 'categorise',
    prompt: 'Which category does "USB-C charging cable, 2 m" belong in?',
    schema: { kind: 'choice', options: ['Clothing', 'Electronics', 'Groceries', 'Furniture'] },
    truth: 'Electronics',
  },
  {
    id: 'g_cat_bananas',
    kind: 'categorise',
    prompt: 'Which category does "Organic bananas, 1 kg bunch" belong in?',
    schema: { kind: 'choice', options: ['Clothing', 'Electronics', 'Groceries', 'Furniture'] },
    truth: 'Groceries',
  },
  {
    id: 'g_cat_table',
    kind: 'categorise',
    prompt: 'Which category does "Oak dining table, seats six" belong in?',
    schema: { kind: 'choice', options: ['Clothing', 'Electronics', 'Groceries', 'Furniture'] },
    truth: 'Furniture',
  },
  {
    id: 'g_cat_billing',
    kind: 'categorise',
    prompt: 'A customer writes: "I was charged twice for the same order this month." Which team should handle it?',
    schema: { kind: 'choice', options: ['Billing', 'Delivery', 'Technical support'] },
    truth: 'Billing',
  },
  {
    id: 'g_cat_crash',
    kind: 'categorise',
    prompt: 'A customer writes: "The app closes every time I open the settings page." Which team should handle it?',
    schema: { kind: 'choice', options: ['Billing', 'Delivery', 'Technical support'] },
    truth: 'Technical support',
  },

  // Comparing.
  {
    id: 'g_cmp_price',
    kind: 'compare',
    prompt: 'The same 500 g bag of rice is offered at two prices. Which is cheaper?',
    schema: { kind: 'choice', options: ['£1.20', '£1.02'] },
    truth: '£1.02',
  },
  {
    id: 'g_cmp_delivery',
    kind: 'compare',
    prompt: 'For an order placed on Monday, which delivery option arrives sooner?',
    schema: { kind: 'choice', options: ['2 working days', '5 working days'] },
    truth: '2 working days',
  },
  {
    id: 'g_cmp_spelling',
    kind: 'compare',
    prompt: 'Which of these two headlines is spelled correctly?',
    schema: { kind: 'choice', options: ['Recieve your order faster', 'Receive your order faster'] },
    truth: 'Receive your order faster',
  },
  {
    id: 'g_cmp_capital',
    kind: 'compare',
    prompt: 'Two answers were given to "What is the capital of Australia?". Which one is correct?',
    schema: { kind: 'choice', options: ['Sydney', 'Canberra'] },
    truth: 'Canberra',
  },
  {
    id: 'g_cmp_caption',
    kind: 'compare',
    prompt: 'A photo shows a red bicycle leaning against a brick wall. Which caption describes it better?',
    schema: { kind: 'choice', options: ['A red bicycle against a wall', 'A blue car parked on a street'] },
    truth: 'A red bicycle against a wall',
  },
  {
    id: 'g_cmp_storage',
    kind: 'compare',
    prompt: 'Two laptops are identical except for storage. Which one has more?',
    schema: { kind: 'choice', options: ['1 TB', '512 GB'] },
    truth: '1 TB',
  },
]
