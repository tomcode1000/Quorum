import { quote, type Question } from '@quorum/core'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Config } from './config.js'
import type { Router } from './router.js'
import type { Store } from './store.js'

/**
 * Development-only routes.
 *
 * These exist because of a real gap in how this system can be inspected. A question
 * only reaches a worker's queue once a caller has paid a 402, which means that without
 * a funded treasury there is no way to see the worker app do anything at all — the
 * queue is empty, the screen says "waiting for a question", and nothing distinguishes
 * a working app from a broken one.
 *
 * So this injects a question directly into the router, skipping payment. It is the
 * only place in the codebase where that is possible, and it is fenced in three ways:
 * it is refused on mainnet, it requires `QUORUM_DEV_ENDPOINTS=true` to be mounted at
 * all, and there is no payer, so the question is simply not refundable.
 *
 * The fencing matters more than the convenience. An endpoint that creates paid work
 * without collecting payment is, on a live network, an endpoint that drains the
 * treasury one wage at a time for anybody who finds it.
 */

const historySchema = z.object({
  /** Omit to apply to every registered worker, which is usually what you want. */
  workerId: z.string().min(1).optional(),
  kind: z.enum(['disambiguate', 'verify']).default('disambiguate'),
  /** Enough history to be treated as established; see ESTABLISHED_AT in core. */
  agreements: z.number().int().min(0).max(1_000).default(120),
})

const seedSchema = z.object({
  question: z.string().min(3).max(500).default('Does this receipt total say 45.00 or 4.50?'),
  kind: z.enum(['disambiguate', 'verify']).default('disambiguate'),
  answer_schema: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('boolean') }),
      z.object({ type: z.literal('enum'), options: z.array(z.string()).min(2).max(12) }),
      z.object({ type: z.literal('number'), unit: z.string().optional(), tolerance: z.number().optional() }),
    ])
    .default({ type: 'enum', options: ['45.00', '4.50'] }),
  max_price: z.string().default('2.50'),
  deadline_ms: z.number().int().min(5_000).max(120_000).default(60_000),
  context: z.object({ image_url: z.string().optional(), text: z.string().optional(), extracted: z.unknown().optional() }).optional(),
})

export function devRoutes(services: { config: Config; router: Router; store: Store }): Hono {
  const { config, router, store } = services
  const app = new Hono()

  /**
   * Fabricates agreement history for a worker.
   *
   * This exists for one specific reason, and it is worth naming rather than hiding.
   * A single brand-new worker can never resolve a question alone — that is the whole
   * point of gating solo work on evidence — so somebody testing the app on one phone
   * will only ever see `no_consensus`, and will reasonably conclude the thing is
   * broken when it is working exactly as designed. This lets them see the resolved
   * path without recruiting a second person.
   *
   * It writes reputation that nobody earned, so it is the most dangerous route in the
   * codebase despite being the most boring. Testnet only, opt-in only, and it says so
   * in its own response.
   */
  app.post('/worker-history', async (c) => {
    if (config.network !== 'testnet') return c.json({ error: 'refused outside testnet' }, 403)

    const parsed = historySchema.safeParse((await c.req.json().catch(() => ({}))) ?? {})
    if (!parsed.success) return c.json({ error: 'invalid request' }, 400)
    const { workerId, kind, agreements } = parsed.data

    // Defaulting to every registered worker removes the need to fish an id out of the
    // browser before anything can be tested, which is a needless obstacle to the one
    // thing somebody setting this up actually wants: to see it work.
    const targets = workerId
      ? [store.workers.get(workerId)].filter((w): w is NonNullable<typeof w> => w !== undefined)
      : [...store.workers.values()]
    if (targets.length === 0)
      return c.json({ error: 'no registered workers; sign in on the worker app first' }, 404)

    for (const worker of targets) {
      worker.record = {
        ...worker.record,
        byKind: { ...worker.record.byKind, [kind]: { agreements, disagreements: 0, unresolved: 0 } },
      }
      // History without the skill would be ignored: only a passed skill brings work.
      worker.skills[kind] = 'passed'
    }
    void store.save()

    return c.json({
      workers: targets.map((w) => w.workerId),
      kind,
      agreements,
      warning: 'this reputation was fabricated for testing and was not earned',
    })
  })

  app.post('/question', async (c) => {
    // Belt as well as braces: even if this router were mounted by mistake, it will not
    // create unpaid work on a network where the wages are real money.
    if (config.network !== 'testnet')
      return c.json({ error: 'development routes are refused outside testnet' }, 403)

    const parsed = seedSchema.safeParse((await c.req.json().catch(() => ({}))) ?? {})
    if (!parsed.success)
      return c.json({ error: 'invalid seed question', issues: parsed.error.issues.map((i) => i.message) }, 400)
    const seed = parsed.data

    const schema: Question['schema'] =
      seed.answer_schema.type === 'boolean'
        ? { kind: 'boolean' }
        : seed.answer_schema.type === 'enum'
          ? { kind: 'choice', options: seed.answer_schema.options }
          : {
              kind: 'number',
              ...(seed.answer_schema.unit === undefined ? {} : { unit: seed.answer_schema.unit }),
              ...(seed.answer_schema.tolerance === undefined ? {} : { tolerance: seed.answer_schema.tolerance }),
            }

    const priced = quote({ kind: seed.kind, maxPriceCents: Math.round(Number(seed.max_price) * 100), schema })
    if (!priced.ok) return c.json({ error: priced.reason }, 409)

    const attachments: NonNullable<Question['attachments']>[number][] = []
    if (seed.context?.image_url) attachments.push({ type: 'image', url: seed.context.image_url })
    if (seed.context?.text) attachments.push({ type: 'text', body: seed.context.text })
    if (seed.context?.extracted !== undefined)
      attachments.push({ type: 'json', body: seed.context.extracted, caption: 'What the agent read' })

    const question: Question = {
      id: `q_dev_${randomUUID().replaceAll('-', '').slice(0, 14)}`,
      kind: seed.kind,
      prompt: seed.question,
      schema,
      priceCents: priced.priceCents,
      timeoutMs: seed.deadline_ms,
      ...(attachments.length > 0 ? { attachments } : {}),
    }

    // No payer, so nothing is refundable: this question was never paid for.
    const resolution = await router.resolve(question)
    return c.json({ seeded: true, unpaid: true, resolution })
  })

  return app
}
