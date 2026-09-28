/**
 * Worker client.
 *
 * Deliberately dependency-light and framework-free: this runs on whatever phone a
 * worker happens to have, often on a bad connection, and every kilobyte and every
 * abstraction layer is a way for it to fail in someone's hand.
 */

export type AnswerSchema =
  | { kind: 'boolean' }
  | { kind: 'choice'; options: string[] }
  | { kind: 'number'; unit?: string; tolerance?: number }

export type Attachment =
  | { type: 'image'; url: string; caption?: string }
  | { type: 'text'; body: string; caption?: string }
  | { type: 'json'; body: unknown; caption?: string }

export type Assignment = {
  assignmentId: string
  prompt: string
  schema: AnswerSchema
  attachments: Attachment[]
  kind: string
  expiresInMs: number
  paysCents: number
  suggestedReadingMs: number
}

export type Me = {
  workerId: string
  address: string
  balanceCents: number | null
  earnedCents: number
  answered: number
  network: string
  feesSponsored: boolean
  reputation: Record<string, { score: number; agreements: number; disagreements: number; ambiguous: number }>
}

export type Session = { workerId: string; address: string }

const SESSION_KEY = 'quorum.session'

export class QuorumClient {
  constructor(readonly baseUrl: string) {}

  /**
   * Signs in with a passkey.
   *
   * No seed phrase, no password, no recovery phrase to photograph and lose. The
   * passkey produces a smart account; its credential id is the worker's identity and
   * the account address is where wages land. Nothing else is asked for — no deposit,
   * no stake, no gas asset — because this chain has no native gas token to hold and
   * because asking someone earning two cents an answer to acquire an asset first is
   * how every previous attempt at this quietly excluded the people it claimed to serve.
   */
  async signIn(): Promise<Session> {
    const existing = this.session()
    if (existing) return existing

    const credential = await createIdentity()
    const session: Session = { workerId: credential.workerId, address: credential.address }

    const response = await fetch(`${this.baseUrl}/v1/worker/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(session),
    })
    if (!response.ok) throw new Error(`could not register: ${await response.text()}`)

    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return session
  }

  session(): Session | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      return raw ? (JSON.parse(raw) as Session) : null
    } catch {
      return null
    }
  }

  signOut(): void {
    localStorage.removeItem(SESSION_KEY)
  }

  /**
   * Waits for the next question.
   *
   * Long-polls, and treats a dropped connection as ordinary rather than exceptional:
   * the caller loops, and the server hands back the same assignment if one was
   * already offered, so a worker on a flaky connection never loses work they were
   * given.
   */
  async next(workerId: string, signal?: AbortSignal): Promise<Assignment | null> {
    const response = await fetch(`${this.baseUrl}/v1/worker/next?workerId=${encodeURIComponent(workerId)}`, {
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) return null
    const body = (await response.json()) as { assignment: Assignment | null }
    return body.assignment
  }

  async answer(input: {
    assignmentId: string
    workerId: string
    value: boolean | number | string
    selfConfidence: number
  }): Promise<{ accepted: boolean; reason?: string }> {
    const response = await fetch(`${this.baseUrl}/v1/worker/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return (await response.json()) as { accepted: boolean; reason?: string }
  }

  async me(workerId: string): Promise<Me> {
    const response = await fetch(`${this.baseUrl}/v1/worker/me?workerId=${encodeURIComponent(workerId)}`)
    if (!response.ok) throw new Error(await response.text())
    return (await response.json()) as Me
  }
}

/** Whether the browser will actually let us run a WebAuthn ceremony here. */
export function passkeysAvailable(): boolean {
  // WebAuthn is refused outside a secure context, and a phone opening
  // http://192.168.x.x:5173 is not one. That case is common enough during
  // development that it needs detecting rather than failing mid-ceremony.
  return window.isSecureContext && 'credentials' in navigator && typeof PublicKeyCredential !== 'undefined'
}

/**
 * Establishes the worker's identity.
 *
 * A passkey when the browser allows one. When it does not — which in practice means
 * this page was opened over plain http on a LAN address, so the browser refuses
 * WebAuthn outright — it falls back to a local key stored in this browser only.
 *
 * The fallback is for looking at the app on a real phone during development and
 * nothing else. It is labelled as such on screen, because an identity anybody can
 * mint is not an identity, and shipping it to real workers would hand a farmer as
 * many accounts as they care to open. Production is https, where the passkey path is
 * the only path.
 */
async function createIdentity(): Promise<{ workerId: string; address: string; passkey: boolean }> {
  if (passkeysAvailable()) {
    const credential = await createPasskey()
    return { ...credential, passkey: true }
  }

  // No secure context: mint a browser-local identity so the app is still usable.
  const random = crypto.getRandomValues(new Uint8Array(20))
  const address = `0x${[...random].map((b) => b.toString(16).padStart(2, '0')).join('')}`
  return { workerId: `local-${address.slice(2, 18)}`, address, passkey: false }
}

/**
 * Creates a passkey and derives the worker's account from it.
 *
 * The real deployment hands the credential to the Tempo accounts adapter, which
 * returns a passkey-signed smart account; the shape below is what that returns. The
 * WebAuthn ceremony itself is the part that matters for the worker, because it is the
 * reason there is no seed phrase anywhere in this app.
 */
async function createPasskey(): Promise<{ workerId: string; address: string }> {
  if (!('credentials' in navigator)) throw new Error('this browser cannot do passkeys')

  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'Quorum' },
      user: {
        // No email, no phone number, no name. A worker should not have to identify
        // themselves to a stranger in order to be paid by one.
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: `worker-${Date.now()}`,
        displayName: 'Quorum worker',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('passkey was not created')

  const workerId = credential.id
  const address = await deriveAddress(credential)
  return { workerId, address }
}

/**
 * Derives the account address from the passkey's public key.
 *
 * In the deployed app this is the Tempo accounts adapter's job — it returns the
 * counterfactual smart-account address for the credential. This local derivation
 * keeps the app runnable without the adapter configured, which matters because the
 * thing worth testing first is whether a real person will answer a real question on
 * a phone, and that test should not be blocked on account plumbing.
 */
async function deriveAddress(credential: PublicKeyCredential): Promise<string> {
  const response = credential.response as AuthenticatorAttestationResponse
  const key = response.getPublicKey?.()
  const material = key ?? new TextEncoder().encode(credential.id)
  const digest = await crypto.subtle.digest('SHA-256', material)
  const bytes = new Uint8Array(digest).slice(12)
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`
}

export function formatCents(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toFixed(cents < 100 ? 3 : 2)}`
}
