import { CAPABILITIES, capabilityAccepts, capabilityById, presentEscalation, quote, type Question } from '@quorum/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { EscalationError, type Escalations } from './escalations.js'
import type { Store } from './store.js'

/**
 * The capability-escalation tools.
 *
 * These exist for the case `ask_human` cannot cover: an external agent that is blocked
 * on something taking longer than a request, and that therefore needs an object it can
 * poll rather than a connection it has to hold.
 *
 * Two things about the descriptions below are load-bearing, because they are the only
 * thing a model reads before deciding whether to call us.
 *
 * First, they say when *not* to. A model that reaches for a capability escalation to
 * resolve a two-second ambiguity has cost its caller an object, a poll loop and a
 * larger bill for something `ask_human` would have answered inside the same request.
 *
 * Second, they are honest about what is not servable. `physical_verification` is
 * declared in the catalog because the architecture is real and the boundary should be
 * visible, but it has no workforce behind it. A model told otherwise would block its
 * caller's task on an escalation nobody can fulfil, which is a worse failure than the
 * capability simply not existing.
 */

const requesterShape = {
  external_agent_id: z
    .string()
    .max(200)
    .optional()
    .describe('Your own id, in your own namespace. Echoed back on every read so you can reconcile.'),
  external_task_id: z
    .string()
    .max(200)
    .optional()
    .describe('The id of YOUR task that is blocked. For A2A callers, the paused task id.'),
  callback_url: z.string().url().optional().describe('Where to POST the result, if you will not be polling.'),
}

export function registerCapabilityTools(
  server: McpServer,
  services: { store: Store; escalations: Escalations; wageCents: number },
): void {
  const { store, escalations } = services

  server.registerTool(
    'discover_capabilities',
    {
      title: 'Discover human capabilities',
      description: `List what humans can be asked to do through this server, and what each costs and takes.

Call this when you have hit something you cannot do and want to know whether a person
could. Each capability says which of two regimes it uses, and the difference matters to
you: "consensus" capabilities are answered by several people independently and resolve
in seconds inside a single call, while "evidence" capabilities are one person doing
something in the world and take minutes to hours.

Capabilities marked not servable have no workforce behind them yet. Do not plan around
them — treat them as absent, not as temporarily unavailable.`,
      inputSchema: {
        class: z
          .enum(['judgment', 'field'])
          .optional()
          .describe('judgment: decide something from evidence you already have. field: somebody goes and does something.'),
        servable_only: z.boolean().default(true).describe('Leave true unless you are exploring what is planned.'),
      },
    },
    async (input) => {
      const matching = CAPABILITIES.filter(
        (c) => (input.class === undefined || c.class === input.class) && (!input.servable_only || c.servable),
      )
      return {
        content: [
          {
            type: 'text' as const,
            text:
              matching.length === 0
                ? 'No capabilities match. Nothing here can help with that.'
                : matching
                    .map(
                      (c) =>
                        `${c.id} — ${c.name}\n  ${c.description}\n  regime: ${c.verification}, typically ${Math.round(c.typicalLatencyMs / 1000)}s, $${(c.priceCents.min / 100).toFixed(2)}–$${(c.priceCents.max / 100).toFixed(2)}${c.servable ? '' : '  [NOT SERVABLE: no workforce yet]'}`,
                    )
                    .join('\n\n'),
          },
        ],
        structuredContent: {
          capabilities: matching.map((c) => ({
            id: c.id,
            name: c.name,
            class: c.class,
            verification: c.verification,
            blocking: c.verification === 'consensus',
            typical_latency_ms: c.typicalLatencyMs,
            price_cents: c.priceCents,
            requires_location: c.requiresLocation,
            servable: c.servable,
            ...(c.evidence === undefined ? {} : { returns_evidence: c.evidence }),
          })),
          workers_online: store.availableWorkers().length,
        },
      }
    },
  )

  server.registerTool(
    'create_human_escalation',
    {
      title: 'Escalate a blocked step to a human',
      description: `Hand one blocked step of YOUR task to a person, and get an object you can poll.

Use this when the step will take longer than a request can wait — somebody has to go
somewhere, or look at something that is not in your payload.

If what you actually need is a judgment you could state as a question with a small set
of possible answers, use ask_human instead. It resolves inside the same call in a few
seconds and costs cents. This tool is the slower, more expensive path and you should
not reach for it by default.

Pass your own agent and task ids. They are stored, returned on every read, and carried
into the payment record, so you can reconcile what you paid for against your own task
history without asking us anything.`,
      inputSchema: {
        capability: z.string().describe('A capability id from discover_capabilities.'),
        task: z.string().min(10).max(1_000).describe('What the person must do, written for somebody with no context on your work.'),
        location: z.string().max(200).optional().describe('Required for field capabilities: where this has to happen.'),
        budget_cents: z.number().int().positive().describe('Your ceiling, in cents.'),
        deadline_ms: z.number().int().min(5_000).describe('How long before you give up on it.'),
        /** Judgment capabilities need a question and an answer space. */
        question: z.string().max(500).optional().describe('For judgment capabilities: the question itself.'),
        answer_options: z.array(z.string()).min(2).max(12).optional().describe('For judgment capabilities: the allowed answers.'),
        ...requesterShape,
      },
    },
    async (input) => {
      const capability = capabilityById(input.capability)
      if (!capability)
        return fail(`No capability called "${input.capability}". Call discover_capabilities to see what exists.`)

      if (capability.verification === 'consensus' && (!input.question || !input.answer_options))
        return fail(
          `"${capability.id}" is a judgment capability, so it needs "question" and "answer_options". If you only have a freeform request, this is the wrong capability.`,
        )

      // The capability's declared answer shapes are a contract, not a note.
      if (capability.verification === 'consensus' && !capabilityAccepts(capability, 'choice'))
        return fail(
          `"${capability.id}" does not take a list of options. It accepts: ${(capability.answerSchema ?? []).join(', ')}.`,
        )

      const priced =
        capability.verification === 'consensus' && capability.kind
          ? quote({
              kind: capability.kind,
              maxPriceCents: input.budget_cents,
              schema: { kind: 'choice', options: input.answer_options ?? [] },
            })
          : ({ ok: true as const, priceCents: Math.min(input.budget_cents, capability.priceCents.max), floorCents: capability.priceCents.min })

      if (!priced.ok) return fail(`${priced.reason} The floor is ${priced.floorCents} cents.`)
      if (priced.priceCents < capability.priceCents.min)
        return fail(`"${capability.id}" starts at ${capability.priceCents.min} cents; you offered ${input.budget_cents}.`)

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

        return {
          content: [
            {
              type: 'text' as const,
              text: `Escalation ${escalation.id} created for "${capability.id}". State: ${escalation.state}. ${
                capability.verification === 'consensus'
                  ? 'This should resolve within seconds — read get_escalation_result now.'
                  : `Expect roughly ${Math.round(capability.typicalLatencyMs / 60_000)} minutes. Go back to your own work and poll get_escalation_status.`
              }`,
            },
          ],
          structuredContent: presentEscalation(escalation),
        }
      } catch (error) {
        if (error instanceof EscalationError) return fail(error.message)
        throw error
      }
    },
  )

  server.registerTool(
    'get_escalation_status',
    {
      title: 'Check an escalation',
      description:
        'Where an escalation has got to. Poll this for field capabilities rather than holding a connection. States: pending, assigned, submitted, completed, failed, cancelled — the last three are final.',
      inputSchema: { escalation_id: z.string() },
    },
    async (input) => {
      const escalation = escalations.get(input.escalation_id)
      if (!escalation) return fail(`No escalation called "${input.escalation_id}".`)
      return {
        content: [{ type: 'text' as const, text: `${escalation.id}: ${escalation.state}${escalation.reason ? ` — ${escalation.reason}` : ''}` }],
        structuredContent: presentEscalation(escalation),
      }
    },
  )

  server.registerTool(
    'get_escalation_result',
    {
      title: 'Collect an escalation result',
      description: `The structured result of a finished escalation, so you can carry on reasoning.

Waits up to wait_ms for it to finish, so a judgment escalation can be created and
collected back to back. A result that is not "completed" says why, and you were
refunded — do not substitute a guess for it without saying that is what you are doing.`,
      inputSchema: {
        escalation_id: z.string(),
        wait_ms: z.number().int().min(0).max(120_000).default(30_000).describe('How long to wait for a terminal state.'),
      },
    },
    async (input) => {
      try {
        const escalation = await escalations.awaitResult(input.escalation_id, input.wait_ms)
        if (!escalation.result)
          return {
            content: [
              {
                type: 'text' as const,
                text: `${escalation.id} is still ${escalation.state}. No result yet — poll again or raise wait_ms.`,
              },
            ],
            structuredContent: presentEscalation(escalation),
          }

        return {
          content: [
            {
              type: 'text' as const,
              text: escalation.result.completed
                ? `Resolved. ${escalation.result.answer !== undefined ? `Answer: ${String(escalation.result.answer)}. ` : ''}${
                    escalation.result.observations?.length ? `Observations: ${escalation.result.observations.join('; ')}. ` : ''
                  }Confidence ${escalation.result.confidence.value.toFixed(3)} (${escalation.result.confidence.basis}), ${(escalation.result.latencyMs / 1000).toFixed(1)}s, ${escalation.result.contributors.length} person(s).`
                : `Not resolved: ${escalation.reason ?? escalation.state}. You were refunded. Do not treat this as an answer.`,
            },
          ],
          structuredContent: presentEscalation(escalation),
        }
      } catch (error) {
        if (error instanceof EscalationError) return fail(error.message)
        throw error
      }
    },
  )

  server.registerTool(
    'cancel_escalation',
    {
      title: 'Withdraw an escalation',
      description:
        'Withdraw an escalation you no longer need, and get your money back. Anyone already working on it keeps their wage — they were doing it when you changed your mind.',
      inputSchema: { escalation_id: z.string(), reason: z.string().max(300).optional() },
    },
    async (input) => {
      try {
        const escalation = await escalations.cancel(input.escalation_id, input.reason ?? 'withdrawn by the requester')
        return {
          content: [{ type: 'text' as const, text: `${escalation.id} is ${escalation.state}.` }],
          structuredContent: presentEscalation(escalation),
        }
      } catch (error) {
        if (error instanceof EscalationError) return fail(error.message)
        throw error
      }
    },
  )
}

function fail(text: string) {
  return { isError: true, content: [{ type: 'text' as const, text }] }
}
