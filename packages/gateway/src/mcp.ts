import { KINDS, centsToDollars, priceAsk, readPricing, type Question } from '@quorum/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { registerCapabilityTools } from './mcp-capabilities.js'
import type { Escalations } from './escalations.js'
import type { Router } from './router.js'
import type { Store } from './store.js'

/**
 * The MCP tool.
 *
 * Most agents will reach this through MCP rather than over raw HTTP, so the tool is
 * not an afterthought. The description text below is the single most important
 * string in the project: it is the only thing a model reads when deciding whether to
 * call us, and a tool a model never calls is a product nobody uses.
 *
 * So it is written as an instruction about when to ask a person, in the language a
 * model already uses for its own uncertainty. It is deliberately not written as
 * "human-in-the-loop microtask API", which describes the industry we are in rather
 * than the moment the model is currently in.
 *
 * The guardrails in the description matter as much as the invitation. A model that
 * calls this to get permission to do something has misunderstood the tool, and the
 * request would be refused server-side anyway: approvals stay inside the caller's
 * organisation permanently, and nobody outsources them to a stranger.
 */

const DESCRIPTION = `Ask a real person when you cannot determine an answer yourself.

Use this the moment you notice you are about to guess. If you are reading a value
you are not sure of, deciding between two readings of the same evidence, checking
whether something is what it claims to be, or choosing between candidate answers,
a person will look and tell you within seconds.

Call it instead of:
  - picking the higher-confidence option when neither is convincing
  - assuming the more common case and continuing
  - asking the agent that delegated to you, which usually cannot see the evidence

Do not call it for permission or approval. It answers questions about data, not
questions about what you are allowed to do. It cannot see or touch your systems.

You pay per question, from five to fifty cents. The price you set is also how sure
the answer has to be: pay more when a wrong answer would be expensive. If nobody
can answer, you are refunded and told so — you will never receive an invented
answer with a confidence score attached.`

export function createMcpServer(services: {
  store: Store
  router: Router
  publicUrl: string
  escalations?: Escalations
  wageCents?: number
}): McpServer {
  const { store, router } = services
  const server = new McpServer({ name: 'quorum', version: '0.1.0' })

  // The escalation surface, for work that outlives a request. `ask_human` below stays
  // the default: it is the fast path and most callers need nothing else.
  if (services.escalations)
    registerCapabilityTools(server, {
      store,
      escalations: services.escalations,
      wageCents: services.wageCents ?? 2,
    })

  server.registerTool(
    'ask_human',
    {
      title: 'Ask a human',
      description: DESCRIPTION,
      inputSchema: {
        question: z
          .string()
          .min(3)
          .max(500)
          .describe('The question, phrased for someone with no context on your system or task.'),
        kind: z
          .enum(KINDS)
          .describe(
            'disambiguate: two readings of the same evidence. verify: is this what it claims to be. The others are not yet servable.',
          ),
        answer_schema: z
          .discriminatedUnion('type', [
            z.object({ type: z.literal('boolean') }),
            z.object({ type: z.literal('enum'), options: z.array(z.string()).min(2).max(12) }),
            z.object({ type: z.literal('number'), unit: z.string().optional(), tolerance: z.number().optional() }),
          ])
          .describe('The answer space. Required, and constrained: free text cannot be checked for agreement.'),
        context: z
          .object({ image_url: z.string().optional(), text: z.string().optional(), extracted: z.unknown().optional() })
          .optional()
          .describe('The evidence the person needs. Without it they are guessing too.'),
        max_price: z
          .string()
          .optional()
          .describe('Your ceiling in dollars. Also sets how sure the answer must be: more money, surer answer. Defaults to 0.25 when cost_of_error is not given.'),
        cost_of_error: z
          .string()
          .optional()
          .describe(
            'What acting on a wrong answer would cost you, in dollars: the payment you would misdirect, the refund you would owe. Quorum prices the question from it, and tells you when a person is not worth asking.',
          ),
        deadline_ms: z.number().int().min(5_000).max(120_000).default(45_000).describe('How long you will wait.'),
        caller_confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('How much you trust your own current guess. With cost_of_error it decides whether asking is worth it; a low value also sends the question to your strongest people first.'),
        task_ref: z.string().optional().describe('Your A2A task id, carried through to the payment receipt.'),
      },
    },
    async (input) => {
      const { maxPriceCents, costOfErrorCents } = readPricing(
        input.max_price ?? (input.cost_of_error === undefined ? '0.25' : undefined),
        input.cost_of_error,
      )
      const pricing = priceAsk({
        kind: input.kind,
        schema: toSchema(input.answer_schema),
        maxPriceCents,
        costOfErrorCents,
        callerConfidence: input.caller_confidence,
      })
      if (pricing.kind === 'not-worth-asking')
        return {
          content: [
            {
              type: 'text' as const,
              text: `Not worth asking a person, so nothing was charged: ${pricing.advice.reason}.`,
            },
          ],
        }
      const priced = pricing.quote
      if (!priced.ok)
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `${priced.reason}. The floor is ${centsToDollars(priced.floorCents)}.` }],
        }

      if (store.availableWorkers(input.kind).length === 0)
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No workers are online right now, so this question was refused and you were not charged. Proceed as you would have without it, and say in your output that the ambiguity was not resolved.',
            },
          ],
        }

      const question: Question = {
        id: `q_${randomUUID().replaceAll('-', '').slice(0, 20)}`,
        kind: input.kind,
        prompt: input.question,
        schema: toSchema(input.answer_schema),
        priceCents: priced.priceCents,
        timeoutMs: input.deadline_ms,
        ...(buildAttachments(input.context).length > 0 ? { attachments: buildAttachments(input.context) } : {}),
        ...(input.task_ref === undefined ? {} : { taskRef: input.task_ref }),
        ...(input.caller_confidence === undefined ? {} : { callerConfidence: input.caller_confidence }),
      }

      const resolution = await router.resolve(question)

      // The failure text is written to be acted on rather than parsed. A model that
      // reads "no_consensus" and continues as though it had an answer has been let
      // down by this string, so it says what to do instead.
      if (resolution.status !== 'resolved')
        return {
          content: [
            {
              type: 'text' as const,
              text:
                resolution.status === 'no_consensus'
                  ? `Two or more people looked and disagreed, so your question is genuinely ambiguous rather than merely hard. You were refunded. Their answers were: ${resolution.evidence.map((e) => String(e.value)).join(', ')}. Do not pick one of these silently — surface the ambiguity to whoever asked you.`
                  : `No answer was obtained (${resolution.status}) and you were refunded. Do not substitute a guess without saying you are guessing.`,
            },
          ],
        }

      return {
        content: [
          {
            type: 'text' as const,
            text: `${String(resolution.value)}

Answered by ${resolution.responders} ${resolution.responders === 1 ? 'person' : 'people'} (${resolution.agreement}) in ${(resolution.latencyMs / 1000).toFixed(1)}s, confidence ${resolution.confidence.toFixed(3)}.`,
          },
        ],
        structuredContent: {
          answer: resolution.value,
          confidence: resolution.confidence,
          responders: resolution.responders,
          agreement: resolution.agreement,
          latency_ms: resolution.latencyMs,
          receipts: resolution.receipts.map((r) => r.txHash),
        },
      }
    },
  )

  return server
}

function toSchema(
  input:
    | { type: 'boolean' }
    | { type: 'enum'; options: string[] }
    | { type: 'number'; unit?: string | undefined; tolerance?: number | undefined },
): Question['schema'] {
  if (input.type === 'boolean') return { kind: 'boolean' }
  if (input.type === 'enum') return { kind: 'choice', options: input.options }
  return {
    kind: 'number',
    ...(input.unit === undefined ? {} : { unit: input.unit }),
    ...(input.tolerance === undefined ? {} : { tolerance: input.tolerance }),
  }
}

function buildAttachments(
  context: { image_url?: string | undefined; text?: string | undefined; extracted?: unknown } | undefined,
): NonNullable<Question['attachments']>[number][] {
  const attachments: NonNullable<Question['attachments']>[number][] = []
  if (context?.image_url) attachments.push({ type: 'image', url: context.image_url })
  if (context?.text) attachments.push({ type: 'text', body: context.text })
  if (context?.extracted !== undefined)
    attachments.push({ type: 'json', body: context.extracted, caption: 'What the agent read' })
  return attachments
}

/** Runs the MCP server over stdio, for agents that spawn it as a subprocess. */
export async function serveStdio(server: McpServer): Promise<void> {
  await server.connect(new StdioServerTransport())
}
