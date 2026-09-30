import type { AnswerSchema, Kind } from './types.js'

/**
 * Capabilities.
 *
 * An external agent does not know which person to hire and should never have to. It
 * knows what it cannot do. So the request it makes is for a *capability* — "somebody
 * has to physically look at this building" — and matching a person to it is our
 * problem, not the caller's.
 *
 * The important structure here is that capabilities fall into two classes with
 * genuinely different physics, and conflating them produces a system that is wrong
 * about both.
 *
 * `judgment` capabilities are resolved by looking at evidence that travelled with the
 * request. Two people can answer the same question independently, so quality is
 * measurable as agreement, redundancy is purchasable, and the whole thing completes
 * inside a blocking call in seconds for cents.
 *
 * `field` capabilities require somebody to go somewhere or do something in the world.
 * Nobody can independently re-do it — you cannot send three people to the same
 * building to break a tie — so agreement is unavailable as a quality signal, the work
 * takes minutes to hours, and the price is dollars rather than cents. Quality has to
 * come from evidence completeness and dispute instead.
 *
 * Everything downstream reads `verification` to know which regime applies. That is
 * deliberate: it keeps one runtime and one agent-facing surface while refusing to
 * pretend a site visit can be consensus-checked.
 */

export type VerificationRegime =
  /** Independent answers are compared. Confidence is a posterior; see `quorum.ts`. */
  | 'consensus'
  /** One worker, checked against required evidence. Disputable, not re-runnable. */
  | 'evidence'

export type CapabilityClass = 'judgment' | 'field'

/** A piece of proof a field capability must return. */
export type EvidenceRequirement =
  | { readonly type: 'photos'; readonly count: number; readonly note?: string }
  | { readonly type: 'location'; readonly note?: string }
  | { readonly type: 'timestamp'; readonly note?: string }
  | { readonly type: 'observations'; readonly minimum: number; readonly note?: string }
  | { readonly type: 'document'; readonly note?: string }

export type Capability = {
  readonly id: string
  readonly name: string
  /** Written for a model deciding whether this is the thing it needs. */
  readonly description: string
  readonly class: CapabilityClass
  readonly verification: VerificationRegime
  /** Which reputation slice applies. Judgment capabilities map onto a question kind. */
  readonly kind?: Kind
  /** The answer shape, for judgment capabilities. */
  readonly answerSchema?: AnswerSchema['kind'][]
  /** What a worker must return, for field capabilities. */
  readonly evidence?: readonly EvidenceRequirement[]
  /** Realistic time to a result, in milliseconds. Not a target — an observation. */
  readonly typicalLatencyMs: number
  /** Price band in cents, inclusive. */
  readonly priceCents: { readonly min: number; readonly max: number }
  /** Whether a location is required to match a worker. */
  readonly requiresLocation: boolean
  /** Whether this version can actually serve it. */
  readonly servable: boolean
}

/**
 * The catalog an agent discovers.
 *
 * Deliberately short. A long list of half-supported capabilities is worse than a
 * short list of real ones, because a model that calls something we cannot deliver has
 * been misled by us rather than by its own uncertainty.
 */
export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'disambiguate',
    name: 'Tell two readings apart',
    description:
      'Two readings of the same evidence and your extraction cannot choose. Once OCR has turned the image into text, every model after it reads the same text, so retrying cannot fix a misread. A person looks at the original and picks one of your readings. Seconds.',
    class: 'judgment',
    verification: 'consensus',
    kind: 'disambiguate',
    answerSchema: ['choice', 'number', 'boolean'],
    typicalLatencyMs: 6_000,
    priceCents: { min: 80, max: 500 },
    requiresLocation: false,
    servable: true,
  },
  {
    id: 'verify',
    name: 'Check something is what it claims',
    description:
      'Whether something is what it claims: the official store, the supplier\'s real domain, a genuine address. A lookalike is built to pass the checks a model can run; a person sees what it got wrong. Yes or no, in seconds.',
    class: 'judgment',
    verification: 'consensus',
    kind: 'verify',
    answerSchema: ['boolean', 'choice'],
    typicalLatencyMs: 6_000,
    priceCents: { min: 50, max: 500 },
    requiresLocation: false,
    servable: true,
  },
  {
    id: 'match_entity',
    name: 'Decide whether two records are the same thing',
    description:
      'Whether two records are the same person, company or product. A similarity score of 0.93 does not say which side of the line it is on, and a wrong merge is hard to undo. A person reads the field that decides it. Seconds.',
    class: 'judgment',
    verification: 'consensus',
    kind: 'match',
    answerSchema: ['choice', 'boolean'],
    typicalLatencyMs: 7_000,
    priceCents: { min: 80, max: 500 },
    requiresLocation: false,
    servable: true,
  },
  {
    id: 'categorise',
    name: 'Put something in the right bucket',
    description:
      'Which of your categories an item belongs in, when your classifier is between two. The boundary is a rule people agreed, not a fact in the data, so there is nothing left for the model to learn from. A person applies your rule. Seconds.',
    class: 'judgment',
    verification: 'consensus',
    kind: 'categorise',
    answerSchema: ['choice'],
    typicalLatencyMs: 7_000,
    priceCents: { min: 80, max: 500 },
    requiresLocation: false,
    servable: true,
  },
  {
    id: 'compare_outputs',
    name: 'Say which of two candidates is better',
    description:
      'Which of two candidates is better, when your agent produced both. A model judging its own work tends to prefer it; a person who wrote neither reads them side by side and picks one.',
    class: 'judgment',
    verification: 'consensus',
    kind: 'compare',
    answerSchema: ['choice'],
    typicalLatencyMs: 12_000,
    priceCents: { min: 120, max: 500 },
    requiresLocation: false,
    servable: true,
  },
  {
    id: 'physical_verification',
    name: 'Go and look at something',
    description:
      'Somebody has to be physically present: inspect a property, confirm a business exists at an address, photograph a condition. Returns photographs, location and timestamped observations. Minutes to hours, not seconds — this is not a blocking call.',
    class: 'field',
    verification: 'evidence',
    evidence: [
      { type: 'photos', count: 3, note: 'Wide, detail, and context' },
      { type: 'location', note: 'Captured where the photographs were taken' },
      { type: 'timestamp' },
      { type: 'observations', minimum: 2, note: 'What the worker actually saw' },
    ],
    typicalLatencyMs: 45 * 60_000,
    priceCents: { min: 500, max: 5_000 },
    requiresLocation: true,
    // Declared so the architecture is real and the boundary is visible, but not yet
    // servable: there is no field workforce, and offering it would mean taking money
    // for something nobody can deliver.
    servable: false,
  },
  {
    id: 'local_knowledge',
    name: 'Answer something only a local would know',
    description:
      'A question about a place that no source online answers reliably. Returns a written answer with whatever the worker used to establish it.',
    class: 'field',
    verification: 'evidence',
    evidence: [{ type: 'observations', minimum: 1 }],
    typicalLatencyMs: 20 * 60_000,
    priceCents: { min: 200, max: 2_000 },
    requiresLocation: true,
    servable: false,
  },
]

/**
 * Whether a capability will accept this answer shape.
 *
 * Without this the `answerSchema` list was documentation: an agent could ask a
 * categorise capability for a number and nothing would object. The list is the
 * contract, so it is checked.
 */
export function capabilityAccepts(capability: Capability, schemaKind: AnswerSchema["kind"]): boolean {
  if (capability.verification !== "consensus") return false
  return (capability.answerSchema ?? []).includes(schemaKind)
}

export function capabilityById(id: string): Capability | undefined {
  return CAPABILITIES.find((capability) => capability.id === id)
}

export function servableCapabilities(): readonly Capability[] {
  return CAPABILITIES.filter((capability) => capability.servable)
}

/** Whether a capability resolves inside the caller's request or needs polling. */
export function isBlocking(capability: Capability): boolean {
  return capability.verification === 'consensus'
}
