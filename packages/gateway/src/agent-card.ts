import { PRICE_CEILING_CENTS, PRICE_FLOOR_CENTS } from '@quorum/core'
import type { Config } from './config.js'

/**
 * Discovery.
 *
 * Quorum is not a destination a developer has to be told about and then integrate
 * with. It publishes itself the way every other service on these rails does: an
 * A2A agent card at a well-known path, and an MPP service manifest. An agent using
 * the catalog's discovery MCP server can find it and call it without anybody having
 * heard of us.
 *
 * That is the whole distribution argument, and it is worth being precise about why
 * it matters. Every previous attempt at paying humans for judgment — escrow
 * contracts, native tokens, oracle networks, enterprise annotation contracts — was
 * a place the buyer had to travel to. Hiring a person here is the same call shape
 * as hiring another agent: discover, pay by charge, get the result in one HTTP
 * round trip. No account, no API key, no SDK, no token.
 */

export function agentCard(config: Config): Record<string, unknown> {
  return {
    protocolVersion: '0.3.0',
    name: 'Quorum',
    description:
      'For the mistakes an agent cannot catch in itself, because every check it could run makes them too: a misread, a lookalike, a near-match, a boundary case, a choice between its own drafts. Forward the input-required state with what a wrong answer would cost; a person answers in seconds, priced by that cost, and is paid per answer on Tempo.',
    url: `${config.publicUrl}/v1/questions`,
    preferredTransport: 'JSONRPC',
    version: '0.1.0',
    provider: { organization: 'Quorum', url: config.publicUrl },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ['application/json', 'text/plain', 'image/png', 'image/jpeg'],
    defaultOutputModes: ['application/json', 'text/plain'],
    skills: [
      {
        id: 'resolve-input-required',
        name: 'Resolve input-required',
        description:
          'Takes a paused A2A task in the input-required state and returns one of the answers it offered, with a confidence. Ask when acting on a wrong answer would cost more than asking, and when retrying or a bigger model would share the same blind spot. For data judgment only; never for approvals or any decision with authority over the caller systems.',
        tags: ['human-in-the-loop', 'input-required', 'judgment', 'verification', 'escalation'],
        examples: [
          'The OCR read "TOTAL 4S.00". Is the total 45.00 or 4.50?',
          'Is nike-outlet-sale.shop the brand\u2019s own store?',
          'Are these two customer records the same person?',
          'Is this listing allowed, or a counterfeit under our policy?',
          'Which of these two drafted replies should go to the customer?',
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
    /** Quorum's own extension, so a caller can say what a wrong answer would cost. */
    extensions: [
      {
        uri: 'dev.quorum.resolver',
        description:
          'Answer schema, deadline, and either a price ceiling (max_price) or what a wrong answer would cost (cost_of_error, with caller_confidence). Given the cost of error, Quorum sets the price, and answers not_worth_asking without charging when the caller\u2019s own guess is the better bet.',
        required: false,
        params: {
          kinds: Object.keys(PRICE_FLOOR_CENTS),
          priceFloorCentsByKind: PRICE_FLOOR_CENTS,
          priceCeilingCents: PRICE_CEILING_CENTS,
          answerSchemaTypes: ['boolean', 'enum', 'number'],
        },
      },
    ],
    /** Payment is the MPP 402 flow, so no account or API key exists to provision. */
    security: [{ payment: [] }],
    securitySchemes: {
      payment: {
        type: 'http',
        scheme: 'Payment',
        description:
          'Machine Payments Protocol. The first call returns 402 with a payment challenge; retry with the credential in Authorization: Payment and the response carries Payment-Receipt.',
      },
    },
  }
}

/** The MPP catalog manifest, matching the schema the services directory indexes. */
export function serviceManifest(config: Config): Record<string, unknown> {
  return {
    id: 'quorum',
    name: 'Quorum',
    url: config.publicUrl,
    serviceUrl: `${config.publicUrl}/v1/questions`,
    description:
      'An independent check for the errors an agent cannot see in itself. Resolves the A2A input-required state with a person in seconds, priced by what a wrong answer would cost, paid per answer on Tempo.',
    categories: ['ai', 'data'],
    integration: 'mpp',
    tags: ['human-in-the-loop', 'judgment', 'input-required', 'a2a', 'verification', 'evaluation'],
    status: 'live',
    docs: `${config.publicUrl}/docs`,
    methods: ['tempo/charge'],
    realm: new URL(config.publicUrl).hostname,
    provider: 'Quorum',
    endpoints: [
      {
        method: 'POST',
        path: '/v1/questions',
        description: 'Ask one question. Returns 402 with a quote and a claim url.',
        pricing: { floorsByKind: PRICE_FLOOR_CENTS, ceilingCents: PRICE_CEILING_CENTS },
      },
      { method: 'GET', path: '/.well-known/agent-card.json', description: 'A2A agent card.', pricing: 'free' },
    ],
  }
}
