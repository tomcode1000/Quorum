import type { AnswerSchema } from './types.js'

/**
 * Whether two answers to the same question count as the same answer.
 *
 * This matters more than it looks. Redundancy is worthless if two workers who
 * agree are recorded as disagreeing because one typed "45.00" and the other
 * "$45". Equality is therefore defined per answer shape, not by `===`.
 */
export function agrees(schema: AnswerSchema, a: unknown, b: unknown): boolean {
  switch (schema.kind) {
    case 'boolean':
      return toBoolean(a) === toBoolean(b)
    case 'choice':
      return normaliseChoice(schema, a) === normaliseChoice(schema, b)
    case 'number': {
      const x = toNumber(a)
      const y = toNumber(b)
      if (x === null || y === null) return false
      // Tolerance is relative when given as a fraction below 1, else absolute.
      const tolerance = schema.tolerance ?? 0
      const allowed = tolerance > 0 && tolerance < 1 ? Math.abs(x) * tolerance : tolerance
      return Math.abs(x - y) <= allowed
    }
  }
}

/**
 * The count of plausible distinct answers.
 *
 * The engine needs this because agreement is only evidence in proportion to how
 * unlikely it was by chance: two workers agreeing on one of two options is weak,
 * two agreeing on one of eight is strong. This is the number that lets the
 * confidence model express that difference, which vote-counting cannot.
 */
export function optionCount(schema: AnswerSchema): number {
  switch (schema.kind) {
    case 'boolean':
      return 2
    case 'choice':
      return Math.max(2, schema.options.length)
    case 'number':
      // A free-running number has no true option count. Ten is a deliberate
      // understatement: it makes numeric agreement count for less than it
      // probably should, which errs toward buying an extra answer rather than
      // toward handing the caller a confident wrong total.
      return 10
  }
}

/** Canonical form used as a grouping key. Answers with the same key agree. */
export function canonicalKey(schema: AnswerSchema, value: unknown): string {
  switch (schema.kind) {
    case 'boolean':
      return String(toBoolean(value))
    case 'choice':
      return normaliseChoice(schema, value) ?? '\u0000unmatched'
    case 'number': {
      const n = toNumber(value)
      if (n === null) return '\u0000unparsed'
      // Quantise onto the tolerance grid so near-equal numbers share a key.
      const tolerance = schema.tolerance ?? 0
      if (tolerance <= 0) return String(n)
      const step = tolerance > 0 && tolerance < 1 ? Math.abs(n) * tolerance : tolerance
      return step === 0 ? String(n) : String(Math.round(n / step))
    }
  }
}

/** Whether a value is a legal answer to this question at all. */
export function isValidAnswer(schema: AnswerSchema, value: unknown): boolean {
  switch (schema.kind) {
    case 'boolean':
      return typeof value === 'boolean' || value === 'true' || value === 'false'
    case 'choice':
      return normaliseChoice(schema, value) !== null
    case 'number':
      return toNumber(value) !== null
  }
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  return String(value).trim().toLowerCase() === 'true'
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  // Tolerate the ways a person actually types money: "$45", "4,500", "45.00 USD".
  const cleaned = value.replace(/[^0-9.\-eE]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function normaliseChoice(schema: Extract<AnswerSchema, { kind: 'choice' }>, value: unknown): string | null {
  const needle = normaliseText(value)
  for (const option of schema.options) if (normaliseText(option) === needle) return option
  return null
}

function normaliseText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}
