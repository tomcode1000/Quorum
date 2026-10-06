import { contextImageUrl, SERVABLE_KINDS, type Kind, type Question } from '@quorum/core'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Config } from './config.js'
import { hostImages } from './media.js'
import type { Router } from './router.js'
import type { Store } from './store.js'
import { requireOperator } from './waitlist.js'

/**
 * Questions the operator sends, for running test sessions.
 *
 * On the testnet there is no agent traffic yet, so people who have passed an
 * assessment would sit with nothing to answer. From the console the operator
 * either writes one question and sends it, or runs a session: questions drawn
 * from the bank below, one every few seconds, for as long as it is set to run.
 *
 * They go through the same router as a paying caller's, so they reach only
 * people who passed that skill, are weighed the same way, and every answer is
 * paid its wage from the treasury, in test tokens. Nobody paid for them, so
 * nothing is refunded. Refused outside the testnet, where the wages are real.
 */

type BankQuestion = { kind: Kind; prompt: string; schema: Question['schema']; text?: string }

/** Realistic questions, a few per skill, written the way an agent would ask them. */
export const QUESTION_BANK: readonly BankQuestion[] = [
  { kind: 'disambiguate', prompt: 'The receipt total reads either 45.00 or 4.50. Which is it?', schema: { kind: 'choice', options: ['45.00', '4.50'] }, text: 'Receipt: 2 x Coffee 3.50, 1 x Sandwich 6.20, 1 x Catering tray 31.80. TOTAL 4 5.00 (the decimal point is smudged).' },
  { kind: 'disambiguate', prompt: 'Is this date 03/04 the 3rd of April or the 4th of March?', schema: { kind: 'choice', options: ['3 April', '4 March'] }, text: 'Invoice from a UK supplier, London address, VAT number GB 123 4567 89. Dated 03/04/2026.' },
  { kind: 'disambiguate', prompt: 'The part number was read as either B7-4492 or 87-4492. Which is right?', schema: { kind: 'choice', options: ['B7-4492', '87-4492'] }, text: 'Shipping label. Our catalogue uses a letter then a digit for every part number, for example A3-1102, C9-5520.' },
  { kind: 'disambiguate', prompt: 'Is the quantity on this order line 1 or 7?', schema: { kind: 'choice', options: ['1', '7'] }, text: 'Handwritten order: "Printer paper, A4, boxes: 7" (the 7 has a European crossbar). Unit price 24.00, line total 168.00.' },
  { kind: 'verify', prompt: 'Is this the brand’s own official store?', schema: { kind: 'boolean' }, text: 'Store name: "Nike Official Store". Address: nike-outlet-sale.shop. Registered 9 days ago. Every item 70% off.' },
  { kind: 'verify', prompt: 'Is "31 February 2026" a real date?', schema: { kind: 'boolean' }, text: 'Delivery date written on a customs form.' },
  { kind: 'verify', prompt: 'Is this a real UK postcode format?', schema: { kind: 'boolean' }, text: 'Postcode given: SW1A 1AA' },
  { kind: 'verify', prompt: 'Does this email look like it really comes from PayPal?', schema: { kind: 'boolean' }, text: 'From: service@paypal-security-alerts.com. Subject: "Your account is limited, confirm your card within 24 hours."' },
  { kind: 'match', prompt: 'Are these two customer records the same person?', schema: { kind: 'boolean' }, text: 'Record A: Jonathan Smith, 14 Elm Street, Leeds LS6 2AB, born 12/05/1988.\nRecord B: Jon Smith, 14 Elm St, Leeds LS6 2AB, born 12 May 1988.' },
  { kind: 'match', prompt: 'Are these two products the same item?', schema: { kind: 'boolean' }, text: 'A: "Apple AirPods Pro (2nd generation) with MagSafe Case (USB-C)".\nB: "AirPods Pro 2 - USB-C charging case".' },
  { kind: 'match', prompt: 'Are these two companies the same business?', schema: { kind: 'boolean' }, text: 'A: Acme Logistics Ltd, company no. 08812345, Manchester.\nB: ACME Logistic Services Limited, company no. 11290876, Birmingham.' },
  { kind: 'match', prompt: 'Are these the same place?', schema: { kind: 'boolean' }, text: 'A: "Heathrow Terminal 5, Longford, Hounslow TW6 2GA".\nB: "LHR T5".' },
  { kind: 'categorise', prompt: 'Which department should this support message go to?', schema: { kind: 'choice', options: ['Billing', 'Technical', 'Delivery', 'Complaint'] }, text: '"I was charged twice for my order last week and I can’t see a refund yet."' },
  { kind: 'categorise', prompt: 'Which expense category does this receipt belong in?', schema: { kind: 'choice', options: ['Travel', 'Meals', 'Office supplies', 'Software'] }, text: 'Uber, 18 Oct, Airport to Hotel Ibis, 27.40 GBP.' },
  { kind: 'categorise', prompt: 'Is this review positive, negative or mixed?', schema: { kind: 'choice', options: ['Positive', 'Negative', 'Mixed'] }, text: '"Delivery was fast and the packaging was great, but the jacket runs two sizes small and the zip broke after a week."' },
  { kind: 'categorise', prompt: 'Is this listing allowed, or a counterfeit?', schema: { kind: 'choice', options: ['Allowed', 'Counterfeit'] }, text: '"Rolex Submariner, brand new, box and papers, 120 USD, ships from a private seller."' },
  { kind: 'compare', prompt: 'Which reply should go to the customer?', schema: { kind: 'choice', options: ['Draft A', 'Draft B'] }, text: 'Customer: "My parcel is a week late."\nDraft A: "Delays happen. Please wait."\nDraft B: "Sorry your parcel is late. I’ve checked and it’s at the local depot; it should reach you tomorrow. If not, reply and I’ll refund the shipping."' },
  { kind: 'compare', prompt: 'Which product title is clearer for a shopper?', schema: { kind: 'choice', options: ['Title A', 'Title B'] }, text: 'A: "Wireless Earbuds, 30h Battery, Noise Cancelling, Black".\nB: "BT5.3 TWS ANC EARPHONE BLK 30H NEW 2026 HOT".' },
  { kind: 'compare', prompt: 'Which summary is accurate to the original?', schema: { kind: 'choice', options: ['Summary A', 'Summary B'] }, text: 'Original: "Sales rose 4% in Q3, driven by Europe, while US sales fell 2%."\nA: "Sales grew 4% in Q3, led by Europe; US sales dipped."\nB: "Sales grew 4% in Q3 across all regions."' },
]

const schemaInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('boolean') }),
  z.object({ type: z.literal('enum'), options: z.array(z.string().min(1)).min(2).max(12) }),
])

const askSchema = z.object({
  kind: z.enum(SERVABLE_KINDS as [Kind, ...Kind[]]),
  question: z.string().min(3).max(500),
  answer_schema: schemaInput,
  context: z.object({ text: z.string().max(4_000).optional(), image_url: z.string().optional(), image_base64: z.string().optional() }).optional(),
  deadline_ms: z.number().int().min(15_000).max(30 * 60_000).default(5 * 60_000),
})

const sessionSchema = z.object({
  minutes: z.number().int().min(1).max(180).default(60),
  every_seconds: z.number().int().min(5).max(600).default(30),
  kinds: z.array(z.enum(SERVABLE_KINDS as [Kind, ...Kind[]])).default([]),
})

/** Nominal price: it sets how sure an answer must be (0.95 at $1), and nobody is charged it. */
const NOMINAL_PRICE_CENTS = 100

type Sent = { id: string; kind: Kind; prompt: string; at: number; source: 'manual' | 'session'; status: string; answer: unknown }

export function operatorQuestionRoutes(services: { config: Config; store: Store; router: Router; token: string }): Hono {
  const { config, store, router } = services
  const app = new Hono()
  app.use('*', cors({ origin: config.workerAppOrigins, allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['authorization', 'content-type'] }))
  app.use('*', requireOperator(services.token))
  app.use('*', async (c, next) => {
    if (config.network !== 'testnet') return c.json({ error: 'operator questions are testnet only, because their wages are paid by the treasury' }, 403)
    return next()
  })

  const sent: Sent[] = []
  let session: { startedAt: number; endsAt: number; everyMs: number; kinds: Kind[]; count: number; timer: NodeJS.Timeout } | null = null

  const send = (input: { kind: Kind; prompt: string; schema: Question['schema']; attachments: NonNullable<Question['attachments']>[number][]; timeoutMs: number; source: Sent['source'] }) => {
    const question = hostImages(
      {
        id: `q_op_${randomUUID().replaceAll('-', '').slice(0, 16)}`,
        kind: input.kind,
        prompt: input.prompt,
        schema: input.schema,
        priceCents: NOMINAL_PRICE_CENTS,
        timeoutMs: input.timeoutMs,
        ...(input.attachments.length ? { attachments: input.attachments } : {}),
      },
      store.media,
      config.publicUrl,
    )
    const entry: Sent = { id: question.id, kind: question.kind, prompt: question.prompt, at: Date.now(), source: input.source, status: 'in flight', answer: null }
    sent.unshift(entry)
    sent.splice(200)
    // Not awaited: it settles when people answer, and the console polls for it.
    // Held, like a callback caller's: it waits for somebody to come online rather
    // than being turned away because nobody happened to be on at that second.
    void router
      .resolve(question, { hold: true })
      .then((resolution) => {
        entry.status = resolution.status
        entry.answer = resolution.value
      })
      .catch((error: unknown) => {
        entry.status = 'failed'
        console.error(`[quorum] operator question ${question.id} failed: ${error instanceof Error ? error.message : String(error)}`)
      })
    return entry
  }

  const sendFromBank = () => {
    if (!session) return
    if (Date.now() >= session.endsAt) return stopSession()
    const pool = QUESTION_BANK.filter((q) => session!.kinds.length === 0 || session!.kinds.includes(q.kind))
    // Only skills somebody online has passed; otherwise the question just times out.
    const servable = pool.filter((q) => store.availableWorkers(q.kind).length > 0)
    const from = servable.length ? servable : pool
    const pick = from[Math.floor(Math.random() * from.length)]
    if (!pick) return
    session.count += 1
    send({
      kind: pick.kind,
      prompt: pick.prompt,
      schema: pick.schema,
      attachments: pick.text ? [{ type: 'text', body: pick.text }] : [],
      timeoutMs: Math.max(60_000, session.everyMs * 2),
      source: 'session',
    })
  }

  const stopSession = () => {
    if (session) clearInterval(session.timer)
    session = null
  }

  const sessionView = () =>
    session
      ? { running: true, startedAt: session.startedAt, endsAt: session.endsAt, everySeconds: session.everyMs / 1000, kinds: session.kinds, sent: session.count }
      : { running: false }

  app.get('/', (c) =>
    c.json({
      session: sessionView(),
      sent,
      bank: QUESTION_BANK.length,
      online: SERVABLE_KINDS.map((kind) => ({ kind, workers: store.availableWorkers(kind).length })),
    }),
  )

  app.post('/ask', async (c) => {
    const parsed = askSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid question', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400)
    const input = parsed.data
    let imageUrl: string | undefined
    try {
      imageUrl = contextImageUrl(input.context)
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400)
    }
    const attachments: NonNullable<Question['attachments']>[number][] = []
    if (imageUrl) attachments.push({ type: 'image', url: imageUrl })
    if (input.context?.text) attachments.push({ type: 'text', body: input.context.text })
    const entry = send({
      kind: input.kind,
      prompt: input.question.trim(),
      schema: input.answer_schema.type === 'boolean' ? { kind: 'boolean' } : { kind: 'choice', options: input.answer_schema.options },
      attachments,
      timeoutMs: input.deadline_ms,
      source: 'manual',
    })
    return c.json({ sent: entry, workersOnline: store.availableWorkers(input.kind).length })
  })

  app.post('/session', async (c) => {
    const parsed = sessionSchema.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) return c.json({ error: 'invalid session' }, 400)
    stopSession()
    const { minutes, every_seconds, kinds } = parsed.data
    session = {
      startedAt: Date.now(),
      endsAt: Date.now() + minutes * 60_000,
      everyMs: every_seconds * 1000,
      kinds,
      count: 0,
      timer: setInterval(sendFromBank, every_seconds * 1000),
    }
    sendFromBank()
    return c.json({ session: sessionView() })
  })

  app.post('/session/stop', (c) => {
    stopSession()
    return c.json({ session: sessionView() })
  })

  return app
}
