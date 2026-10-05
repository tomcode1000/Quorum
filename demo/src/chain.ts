import type { InputRequired, Kind } from '@quorum/core'

/**
 * One agent, one afternoon, three errors it cannot see in itself.
 *
 * An accounts-payable agent is closing out the week: an expense receipt to record and
 * a supplier invoice to pay. It is a careful agent. It reports its confidence
 * honestly, and at each of the three moments below it knows it might be wrong.
 *
 * What it cannot do is find out. Each of these errors is one that every automated
 * check it could run shares with it:
 *
 *   - the receipt total was read badly by the OCR, and every model after the OCR
 *     reads the same bad string;
 *   - the supplier name matches the one on file at 0.93, and no score says which
 *     side of "the same company" 0.93 is on;
 *   - the payment link looks like the supplier's site, and the only thing that
 *     knows it is not is someone who looks at it.
 *
 * Retrying, asking a bigger model, or asking the agent to check its own work all
 * inherit the same blind spot. A person looking at the evidence does not. That is
 * the whole argument, and each moment below is priced by what being wrong there
 * would cost: a cheap answer for a small mistake, the most certainty on offer before
 * money leaves for good.
 */

export type Check = {
  readonly id: 'receipt-total' | 'supplier-match' | 'payment-link'
  /** The capability this goes to, as a caller names it. */
  readonly capability: string
  readonly kind: Kind
  readonly question: string
  readonly evidence: readonly string[]
  readonly options: readonly string[] | 'boolean'
  /** What the agent would have gone with, and how sure it was. */
  readonly guess: boolean | string
  readonly confidence: number
  readonly truth: boolean | string
  /** What acting on a wrong answer here would cost, in dollars. */
  readonly costOfError: string
  /** What the agent does next with its own guess. */
  readonly alone: string
  /** What it does with the right answer. */
  readonly answered: string
  /**
   * Set when this step is not urgent, and why. Agent B then holds the question
   * for a person to come back to, rather than needing someone online this second.
   */
  readonly canWait?: string
}

export const CHECKS: readonly Check[] = [
  {
    id: 'receipt-total',
    capability: 'Tell two readings apart',
    kind: 'disambiguate',
    question: 'The printed line reads "TOTAL 4S.00" and the decimal point is smudged. Is the total 45.00 or 4.50?',
    evidence: ['Meridian Print & Supply, invoice MPS-2026-0914. Three toner cartridges.'],
    options: ['45.00', '4.50'],
    guess: '4.50',
    confidence: 0.41,
    truth: '45.00',
    costOfError: '40.50',
    alone: 'records the expense at $4.50; the supplier is underpaid by $40.50 and nothing flags it',
    answered: 'records the expense at $45.00',
  },
  {
    id: 'supplier-match',
    capability: 'Match records',
    kind: 'match',
    question:
      'On file: "Acme Industrial Supply Ltd", paid to an account ending 4471, billing from billing@acme-industrial.com. This invoice: "ACME Industrial Supply", asking for payment to a new account ending 9083, sent from accounts@acme-industria1.com. Is this invoice from the supplier on file?',
    evidence: ['Invoice AIS-7731 for $4,800.00, marked urgent, with "our bank details have changed" in the footer.'],
    options: 'boolean',
    guess: true,
    confidence: 0.93,
    truth: false,
    costOfError: '4800.00',
    alone: 'treats the 0.93 name match as the same supplier and sends $4,800.00 to the new account',
    answered: 'holds the invoice and asks the real supplier to confirm the change',
    canWait: 'the invoice is not due until Friday',
  },
  {
    id: 'payment-link',
    capability: 'Check something is real',
    kind: 'verify',
    question:
      'The invoice says to pay at https://acme-industria1.com/pay. The supplier\'s own site, on file, is acme-industrial.com. Is the payment page on the supplier\'s own site?',
    evidence: ['The link in the invoice footer, and the domain on the supplier record.'],
    options: 'boolean',
    guess: true,
    confidence: 0.88,
    truth: false,
    costOfError: '4800.00',
    alone: 'opens the payment page and enters the company card',
    answered: 'does not open the link, and reports it as a lookalike domain',
  },
]

/** Finds the check a worker is looking at, from the prompt they were shown. */
export function checkForPrompt(prompt: string): Check | undefined {
  return CHECKS.find((check) => check.question === prompt)
}

export function answerSchemaFor(check: Check) {
  return check.options === 'boolean' ? { type: 'boolean' as const } : { type: 'enum' as const, options: [...check.options] }
}

/**
 * The `input-required` task status the agent emits at one of these moments.
 *
 * Nothing in it is written for Quorum except the one metadata entry saying what a
 * wrong answer would cost and how sure the agent is. The rest is what the A2A
 * specification already says a careful agent should produce: the question it wants
 * to put to a person, and the evidence.
 */
export function inputRequired(
  taskId: string,
  check: Check,
  maxPrice?: string,
  /** For a step that can wait: where the answer is posted, and how long to hold it. */
  wait?: { callbackUrl: string; deadlineMs: number },
): InputRequired {
  return {
    id: taskId,
    contextId: 'ctx_ap_week_close',
    status: {
      state: 'input-required',
      message: {
        role: 'agent',
        parts: [
          { kind: 'text', text: check.question },
          ...check.evidence.map((text) => ({ kind: 'text' as const, text })),
        ],
        messageId: `msg_${check.id}`,
      },
      timestamp: new Date().toISOString(),
    },
    metadata: {
      'dev.quorum.resolver': {
        kind: check.kind,
        answer_schema: answerSchemaFor(check),
        cost_of_error: check.costOfError,
        // A ceiling of the agent's own, when it sets one. The price is the lower of
        // this and what the cost of error advises.
        ...(maxPrice === undefined ? {} : { max_price: maxPrice }),
        caller_confidence: check.confidence,
        deadline_ms: wait?.deadlineMs ?? 30_000,
        ...(wait === undefined ? {} : { callback_url: wait.callbackUrl }),
      },
    },
  }
}

export type Outcome = {
  readonly check: Check
  /** What the agent went with, whether its own guess or the answer it got. */
  readonly acted: boolean | string | null
  /** Whether the agent knew it had no answer, rather than acting on a guess. */
  readonly flagged: boolean
  readonly trace: readonly string[]
}

/**
 * Run one: the chain as it exists today.
 *
 * At each moment the agent reaches `input-required`, finds nobody there, and goes
 * with its best guess. Nothing errors. That is the failure: not a crash, but three
 * plausible decisions that nothing in the system can tell are wrong.
 */
export function runAlone(): Outcome[] {
  return CHECKS.map((check) => ({
    check,
    acted: check.guess,
    flagged: false,
    trace: [
      `unsure (confidence ${check.confidence.toFixed(2)}); entering input-required.`,
      'nobody is listening on input-required, so it goes with its guess.',
      `it ${check.alone}.`,
    ],
  }))
}

export const show = (value: boolean | string | null): string =>
  value === null ? 'no answer' : value === true ? 'yes' : value === false ? 'no' : value
