import { CAPABILITIES, capabilityAccepts, capabilityById, presentEscalation, quote, type Question } from '@quorum/core'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Config } from './config.js'
import { EscalationError, type Escalations } from './escalations.js'
import type { Store } from './store.js'

/**
 * The escalation surface over plain HTTP.
 *
 * The same capability model as the MCP tools, for callers that are not MCP clients.
 * Most external agents will arrive through MCP, but an agent framework with its own
 * tool abstraction, or a service written in a language with no MCP client, should not
 * be shut out of the product because of a transport choice.
 */

const createSchema = z.object({
  capability: z.string(),
  task: z.string().min(10).max(1_000),
  location: z.string().max(200).optional(),
  budget_cents: z.number().int().positive(),
  deadline_ms: z.number().int().min(5_000),
  question: z.string().max(500).optional(),
  answer_options: z.array(z.string()).min(2).max(12).optional(),
  external_agent_id: z.string().max(200).optional(),
  external_task_id: z.string().max(200).optional(),
  callback_url: z.string().url().optional(),
})

const evidenceSchema = z.object({
  workerId: z.string().min(1),
  photos: z.array(z.object({ url: z.string(), caption: z.string().optional() })).optional(),
  location: z.object({ lat: z.number(), lon: z.number(), label: z.string().optional() }).optional(),
  capturedAt: z.string().optional(),
  observations: z.array(z.string()).optional(),
  documents: z.array(z.object({ url: z.string(), caption: z.string().optional() })).optional(),
})

export function escalationRoutes(services: { config: Config; escalations: Escalations; store: Store }): Hono {
  const { escalations, store } = services
  const app = new Hono()

  /** The capability catalog an agent discovers. */
  app.get('/', (c) =>
    c.json({
      capabilities: CAPABILITIES.map((cap) => ({
        id: cap.id,
        name: cap.name,
        description: cap.description,
        class: cap.class,
        verification: cap.verification,
        blocking: cap.verification === 'consensus',
        typical_latency_ms: cap.typicalLatencyMs,
        price_cents: cap.priceCents,
        requires_location: cap.requiresLocation,
        servable: cap.servable,
        ...(cap.evidence === undefined ? {} : { returns_evidence: cap.evidence }),
      })),
      workers_online: store.availableWorkers().length,
      /*
        What a worker is paid per answer.

        Published here because the worker app has to state it before anybody has
        signed in, and a wage typed into the app's markup is a wage that drifts
        the first time this changes. It is the same for every capability; the
        caller's price is what varies.
      */
      wage_cents: services.config.wageCents,
    }),
  )

  /**
   * Create an escalation.
   *
   * Unlike `/v1/questions` this does not gate on payment yet, because a field
   * escalation's price is not known until a capability and budget are agreed. Charging
   * is applied on the judgment path through the router as before; the field path is not
   * servable, so nothing here can create unpaid billable work.
   */
  app.post('/escalations', async (c) => {
    const parsed = createSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success)
      return c.json({ error: 'invalid escalation', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400)
    const input = parsed.data

    const capability = capabilityById(input.capability)
    if (!capability) return c.json({ error: `unknown capability "${input.capability}"` }, 404)

    if (capability.verification === 'consensus' && (!input.question || !input.answer_options))
      return c.json({ error: `"${capability.id}" requires question and answer_options` }, 400)

    // The capability's declared answer shapes are a contract, not a note.
    if (capability.verification === 'consensus' && !capabilityAccepts(capability, 'choice'))
      return c.json(
        { error: `"${capability.id}" does not take a list of options`, accepts: capability.answerSchema ?? [] },
        422,
      )

    const priced =
      capability.verification === 'consensus' && capability.kind
        ? quote({
            kind: capability.kind,
            maxPriceCents: input.budget_cents,
            schema: { kind: 'choice', options: input.answer_options ?? [] },
          })
        : ({ ok: true as const, priceCents: Math.min(input.budget_cents, capability.priceCents.max), floorCents: capability.priceCents.min })

    if (!priced.ok) return c.json({ error: priced.reason, quote_cents: priced.floorCents }, 409)

    try {
      const question: Omit<Question, 'id' | 'priceCents' | 'timeoutMs'> | undefined =
        capability.verification === 'consensus' && input.question && input.answer_options && capability.kind
          ? {
              kind: capability.kind,
              prompt: input.question,
              schema: { kind: 'choice', options: input.answer_options },
              ...(input.external_task_id === undefined ? {} : { taskRef: input.external_task_id }),
            }
          : undefined

      const escalation = escalations.create({
        capabilityId: capability.id,
        task: input.task,
        priceCents: priced.priceCents,
        deadlineMs: input.deadline_ms,
        requester: {
          ...(input.external_agent_id === undefined ? {} : { externalAgentId: input.external_agent_id }),
          ...(input.external_task_id === undefined ? {} : { externalTaskId: input.external_task_id }),
          ...(input.callback_url === undefined ? {} : { callbackUrl: input.callback_url }),
        },
        ...(input.location === undefined ? {} : { location: input.location }),
        ...(question === undefined ? {} : { question }),
      })

      return c.json(presentEscalation(escalation), 201)
    } catch (error) {
      if (error instanceof EscalationError) return c.json({ error: error.message }, error.status)
      throw error
    }
  })

  app.get('/escalations/:id', (c) => {
    const escalation = escalations.get(c.req.param('id'))
    if (!escalation) return c.json({ error: 'unknown escalation' }, 404)
    return c.json(presentEscalation(escalation))
  })

  /** Collect a result, optionally waiting for one. */
  app.get('/escalations/:id/result', async (c) => {
    const waitMs = Math.min(120_000, Math.max(0, Number(c.req.query('wait_ms') ?? 0)))
    try {
      const escalation = await escalations.awaitResult(c.req.param('id'), waitMs)
      return c.json(presentEscalation(escalation))
    } catch (error) {
      if (error instanceof EscalationError) return c.json({ error: error.message }, error.status)
      throw error
    }
  })

  app.post('/escalations/:id/cancel', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { reason?: string }
      const escalation = await escalations.cancel(c.req.param('id'), body.reason ?? 'withdrawn by the requester')
      return c.json(presentEscalation(escalation))
    } catch (error) {
      if (error instanceof EscalationError) return c.json({ error: error.message }, error.status)
      throw error
    }
  })

  /** A field worker submits their evidence. */
  app.post('/escalations/:id/evidence', async (c) => {
    const parsed = evidenceSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'invalid evidence', issues: parsed.error.issues.map((i) => i.message) }, 400)
    const { workerId, ...evidence } = parsed.data
    try {
      const escalation = await escalations.submitEvidence(c.req.param('id'), workerId, evidence)
      return c.json(presentEscalation(escalation))
    } catch (error) {
      if (error instanceof EscalationError) return c.json({ error: error.message }, error.status)
      throw error
    }
  })

  return app
}
