import type { InputRequired } from '@quorum/core'

/**
 * A small but honest A2A chain.
 *
 * Agent A is an accounts-payable orchestrator. It delegates to Agent B, an invoice
 * reader, and then acts on whatever B returns by scheduling a payment. Neither agent
 * is a strawman: B is careful, reports its confidence accurately, and does not lie
 * about anything. That is the point of the demonstration.
 *
 * The receipt B is given has a genuinely ambiguous total — the kind of smudged
 * thermal print that any OCR pipeline produces a low-confidence read from. B knows
 * it is unsure. Under the A2A specification the correct thing for it to do is enter
 * `input-required` and put the question to a human. In an autonomous chain there is
 * no human, so that state is a dead end, and B does the only other thing available:
 * it picks its best guess and reports success.
 *
 * Nothing in the chain is broken when that happens. No error is raised, no retry
 * fires, no alert goes off. A is told the invoice total is 4.50, A believes it,
 * and a supplier is underpaid by a factor of ten. That is what "silent delegation
 * failure" means concretely, and it is why the failure is expensive: the system
 * cannot tell you it went wrong, because as far as it knows it did not.
 */

/** The evidence B is working from. */
export const RECEIPT = {
  supplier: 'Meridian Print & Supply',
  invoiceRef: 'MPS-2026-0914',
  imageUrl: 'https://quorum.dev/demo/receipt-mps-2026-0914.png',
  /** What the OCR pass produced, confidence and all. */
  ocr: {
    lines: ['MERIDIAN PRINT & SUPPLY', 'INV MPS-2026-0914', 'QTY 3  TONER CARTRIDGE', 'TOTAL  4S.00'],
    /** The total field, read badly: the S could be a 5, and the decimal is smudged. */
    total: { reading: '4.50', alternative: '45.00', confidence: 0.41 },
  },
  /** What the total actually is, known only to this file so the demo can score itself. */
  truth: '45.00',
} as const

export type ChainResult = {
  /** What Agent A ended up believing the invoice total was. */
  recordedTotal: string | null
  /** Whether anything in the chain signalled that the figure might be wrong. */
  flagged: boolean
  /** A human-readable trace of what each agent did, in order. */
  trace: string[]
  /** What Agent A actually did with the number. */
  action: string
}

/** Agent B's read of the receipt, including how sure it is. */
export function readInvoice(): { total: string; confidence: number; alternative: string } {
  return {
    total: RECEIPT.ocr.total.reading,
    confidence: RECEIPT.ocr.total.confidence,
    alternative: RECEIPT.ocr.total.alternative,
  }
}

/**
 * The `input-required` task status Agent B emits when it is not sure.
 *
 * This is the artefact the whole product turns on, and it is worth noticing that it
 * is not written for Quorum. It is what the A2A specification already says a careful
 * agent should produce at this moment: the task id, the state, and the question it
 * wants to put to a person, with the evidence attached. The only Quorum-specific part
 * is the metadata entry saying what a wrong answer would cost.
 */
export function inputRequired(taskId: string, maxPrice = '0.25'): InputRequired {
  const read = readInvoice()
  return {
    id: taskId,
    contextId: 'ctx_ap_run',
    status: {
      state: 'input-required',
      message: {
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: `The total on this receipt is either ${read.alternative} or ${read.total}. The printed line reads "TOTAL 4S.00" and the decimal point is smudged. Which is it?`,
          },
          { kind: 'text', text: `Supplier: ${RECEIPT.supplier}. Invoice ${RECEIPT.invoiceRef}. Three toner cartridges.` },
          { kind: 'file', file: { name: 'receipt.png', mimeType: 'image/png', uri: RECEIPT.imageUrl } },
          { kind: 'data', data: RECEIPT.ocr.total },
        ],
        messageId: 'msg_b_clarify_1',
      },
      timestamp: new Date().toISOString(),
    },
    metadata: {
      'dev.quorum.resolver': {
        kind: 'disambiguate',
        answer_schema: { type: 'enum', options: [RECEIPT.ocr.total.alternative, RECEIPT.ocr.total.reading] },
        max_price: maxPrice,
        deadline_ms: 30_000,
        // B is being straight about how much it trusts itself, which raises the bar
        // rather than lowering it.
        caller_confidence: RECEIPT.ocr.total.confidence,
      },
    },
  }
}

/**
 * Run one: the chain as it exists today.
 *
 * Agent B reaches `input-required`, finds nobody there, and resolves its own
 * uncertainty by picking the higher-confidence reading. This is not a bug in B; it is
 * the documented behaviour of agents under ambiguity, which is to make additional
 * autonomous decisions rather than stop.
 */
export function runWithoutResolver(): ChainResult {
  const trace: string[] = []
  const read = readInvoice()

  trace.push('A: new invoice from Meridian Print & Supply. Delegating extraction to B.')
  trace.push(`B: OCR read the total as ${read.total} with confidence ${read.confidence.toFixed(2)}.`)
  trace.push(`B: that is below my threshold, and ${read.alternative} is equally consistent with the print.`)
  trace.push('B: entering input-required to ask a human which it is.')
  trace.push('B: nobody is listening on input-required. No UI, no user, no channel.')
  trace.push(`B: proceeding with the higher-confidence reading, ${read.total}, and reporting completed.`)
  trace.push(`A: received completed with total ${read.total}. No error, no warning, nothing to retry.`)
  trace.push(`A: scheduling payment of ${read.total} to ${RECEIPT.supplier}.`)

  return {
    recordedTotal: read.total,
    // Nothing anywhere in this chain knows the figure is wrong.
    flagged: false,
    trace,
    action: `Scheduled a payment of $${read.total} against invoice ${RECEIPT.invoiceRef}.`,
  }
}
