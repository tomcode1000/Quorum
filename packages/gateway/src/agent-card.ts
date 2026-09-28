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
      'Resolves the A2A input-required state with a real person. Submit the clarifying question your agent would have shown a human; a worker answers within seconds and is paid per answer over Tempo.',
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
          'Takes a paused A2A task in the input-required state and returns the answer a watching human would have given. Intended for data judgment only: field verification, categorisation, comparison, identity and image checks. Never for approvals or any decision with authority over the caller systems.',
        tags: ['human-in-the-loop', 'input-required', 'judgment', 'verification', 'escalation'],
        examples: [
          'Does this receipt total say 45.00 or 4.50?',
          'Is this business real, and is this the correct address?',
          'Which of these two answers is better?',
          'Is this image showing damage?',
        ],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
      },
    ],
    /** Quorum's own extension, so a caller can say what a wrong answer would cost. */
    extensions: [
      {
        uri: 'dev.quorum.resolver',
        description: 'Risk tier, answer schema, cost ceiling and deadline for a resolvable question.',
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
      'Human judgment as a callable endpoint. Resolves the A2A input-required state in seconds, priced per question, paid per answer.',
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
