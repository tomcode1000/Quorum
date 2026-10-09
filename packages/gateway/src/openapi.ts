import { KINDS, PRICE_CEILING_CENTS, PRICE_FLOOR_CENTS, centsToDollars } from '@quorum/core'
import type { Config } from './config.js'

/**
 * The OpenAPI document MPP directories index.
 *
 * MPPscan reads `/openapi.json` and nothing else: each paid operation carries
 * `x-payment-info` and a 402, and `info.x-guidance` is the paragraph an agent reads
 * before deciding to call. That paragraph is written like the MCP tool description,
 * for the same reason: it is about the moment an agent is in, not the industry we
 * are in.
 *
 * The claim route is described in the guidance rather than listed as a path. It is
 * reached only through the `claim_url` a quote hands back, and a directory probing
 * `/v1/questions/{id}/claim` with no real id would only ever see a 404.
 */

const GUIDANCE = `For the mistakes an agent cannot catch in itself, because every check it could run makes them too: a misread figure, a lookalike vendor or domain, a near-match between records, a boundary case, a choice between its own drafts. A person looks at the evidence and answers in seconds.

Ask when acting on a wrong answer would cost more than asking. Send cost_of_error (what the mistake would cost, in dollars) and caller_confidence (how sure you are of your own guess); Quorum prices the question from them, and answers not_worth_asking without charging when your guess is the better bet.

Flow: POST /v1/questions with the question, its kind, an answer_schema and the evidence. The response is 402 with a quote and a claim_url. Pay the challenge at the claim_url (POST, Authorization: Payment); the connection is held until a person answers. Statuses are resolved, no_consensus, timeout and refused; the last three are refunded.

Not for approvals or permissions: it answers questions about data, and has no access to your systems.`

const answerSchema = {
  oneOf: [
    { type: 'object', required: ['type'], properties: { type: { const: 'boolean' } } },
    {
      type: 'object',
      required: ['type', 'options'],
      properties: { type: { const: 'enum' }, options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 12 } },
    },
    {
      type: 'object',
      required: ['type'],
      properties: { type: { const: 'number' }, unit: { type: 'string' }, tolerance: { type: 'number' } },
    },
  ],
  description: 'The answer space. Free text is not accepted: it cannot be checked for agreement.',
}

const questionBody = {
  type: 'object',
  required: ['question', 'kind', 'answer_schema', 'deadline_ms'],
  properties: {
    question: { type: 'string', minLength: 3, maxLength: 500, description: 'Phrased for someone with no context on your system.' },
    kind: {
      type: 'string',
      enum: [...KINDS],
      description: 'disambiguate: two readings of the same evidence. verify: is this what it claims to be. match: are two records the same thing. categorise: which category at a boundary. compare: which of two candidates is better.',
    },
    answer_schema: answerSchema,
    context: {
      type: 'object',
      description: 'The evidence the person needs.',
      properties: {
        image_url: { type: 'string' },
        image_base64: { type: 'string', description: 'PNG, JPEG, WebP or GIF up to 5 MB, base64 or a data: URI.' },
        text: { type: 'string' },
        extracted: { description: 'What your agent read, for the person to check.' },
      },
    },
    cost_of_error: { type: ['string', 'number'], description: 'What acting on a wrong answer would cost you, in dollars. Sets the price.' },
    caller_confidence: { type: 'number', minimum: 0, maximum: 1, description: 'How much you trust your own current guess.' },
    max_price: { type: ['string', 'number'], description: 'Your ceiling in dollars, instead of or as well as cost_of_error.' },
    deadline_ms: { type: 'integer', minimum: 5000, description: 'How long you will wait: up to 300000 (five minutes) holding the connection, up to 24 hours in callback mode.' },
    answer_window_ms: { type: 'integer', minimum: 15000, maximum: 1800000, description: 'How long each person has to answer, for a question that takes more than a minute.' },
    mode: { type: 'string', enum: ['blocking', 'callback'], default: 'blocking', description: 'callback: for a question that can wait; the answer is posted to callback_url.' },
    callback_url: { type: 'string', format: 'uri' },
    task_ref: { type: 'string', description: 'Your A2A task id, carried through to the payment receipt.' },
  },
  example: {
    question: 'Is the total on this receipt 45.00 or 4.50?',
    kind: 'disambiguate',
    context: { text: 'TOTAL 4S.00', extracted: { total: '4.50', confidence: 0.41 } },
    answer_schema: { type: 'enum', options: ['45.00', '4.50', 'neither'] },
    cost_of_error: '40.50',
    caller_confidence: 0.41,
    deadline_ms: 30000,
  },
}

const resolution = {
  type: 'object',
  properties: {
    question_id: { type: 'string' },
    status: { type: 'string', enum: ['resolved', 'no_consensus', 'timeout', 'refused'] },
    answer: { description: 'One of the options you sent.' },
    confidence: { type: 'number' },
    responders: { type: 'integer' },
    agreement: { type: 'string' },
    latency_ms: { type: 'integer' },
    receipts: { type: 'array', items: { type: 'object' } },
    refunded: { type: 'object' },
  },
}

const quote = {
  type: 'object',
  properties: {
    question_id: { type: 'string' },
    quote: { type: 'string', description: 'The price in dollars.' },
    quote_cents: { type: 'integer' },
    claim_url: { type: 'string', description: 'Pay the challenge here; the response is the answer.' },
    expires_in_ms: { type: 'integer' },
    payment: { type: 'object', description: 'The MPP challenge.' },
  },
}

const json = (schema: unknown) => ({ 'application/json': { schema } })

export function openApi(config: Config): Record<string, unknown> {
  const floor = Math.min(...Object.values(PRICE_FLOOR_CENTS))
  return {
    openapi: '3.1.0',
    info: {
      title: 'Quorum',
      version: '0.1.0',
      description: 'An independent check for the errors an agent cannot see in itself: a person answers in seconds, priced by what a wrong answer would cost, paid per answer on Tempo.',
      'x-guidance': GUIDANCE,
      contact: { name: 'Quorum', url: config.publicUrl },
    },
    servers: [{ url: config.publicUrl }],
    paths: {
      '/v1/questions': {
        post: {
          operationId: 'askQuestion',
          summary: 'Ask a person one question about your data.',
          description: 'Returns 402 with a quote and a claim_url. Pay at the claim_url and the answer comes back on that request.',
          'x-payment-info': {
            price: { mode: 'dynamic', currency: 'USD', min: centsToDollars(floor), max: centsToDollars(PRICE_CEILING_CENTS) },
            protocols: [{ mpp: { method: 'tempo', intent: 'charge', currency: config.currency } }],
          },
          requestBody: { required: true, content: json(questionBody) },
          responses: {
            '200': { description: 'not_worth_asking: your own guess is the better bet, and nothing was charged; or, from the claim_url, the answer.', content: json(resolution) },
            '402': { description: 'Payment required: the quote, the claim_url and the MPP challenge.', content: json(quote) },
            '409': { description: 'Your ceiling is below the floor for this question; the floor is attached.' },
            '503': { description: 'Nobody who has passed this kind of question is online. Nothing was charged; retry, or use callback mode.' },
          },
        },
      },
      '/v1/questions/{id}': {
        get: {
          operationId: 'getAnswer',
          summary: 'Re-read a recent answer, for a caller whose connection dropped.',
          security: [],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'The answer.', content: json(resolution) }, '404': { description: 'Unknown question id.' } },
        },
      },
    },
  }
}
