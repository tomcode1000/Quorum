import { QuorumClient, formatCents, passkeysAvailable, type Assignment, type Attachment, type Me, type Session } from './quorum.js'

/**
 * The worker app.
 *
 * One question at a time, answered by tapping. The constraints are not stylistic: a
 * worker earning two cents an answer cannot afford a slow app, a confusing one, or one
 * that loses their work when the train goes into a tunnel.
 *
 * Two things in here are load-bearing rather than decorative. The uncertainty slider,
 * because a worker who can say "I am not sure" gives us a far more useful signal than
 * one forced to pretend; and the balance read from the chain rather than from our own
 * ledger, because the worker seeing the ledger entry is the entire trust mechanism.
 */

/**
 * Where the gateway is.
 *
 * `?gateway=…` wins, for a deployment where the two are on different hosts. Otherwise
 * the app assumes the gateway is on port 8787 of whatever host served this page, which
 * is true both in development and when a phone reaches a laptop over the local network.
 * Falling back to the app's own origin instead would be the tidier-looking default and
 * would leave every request 404ing against the static file server.
 */
function resolveGateway(): string {
  const explicit = new URL(document.baseURI).searchParams.get('gateway')
  if (explicit) return explicit.replace(/\/$/, '')
  if (location.port === '8787') return location.origin
  return `${location.protocol}//${location.hostname}:8787`
}

const baseUrl = resolveGateway()
const client = new QuorumClient(baseUrl)

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing element: ${id}`)
  return node as T
}

const views = {
  signin: el('view-signin'),
  work: el('view-work'),
  earnings: el('view-earnings'),
}

let session: Session | null = null
let current: Assignment | null = null
let polling: AbortController | null = null

function show(view: keyof typeof views): void {
  for (const [name, node] of Object.entries(views)) node.classList.toggle('hidden', name !== view)
  el('tabs').classList.toggle('hidden', view === 'signin')
  el('tab-work').setAttribute('aria-current', view === 'work' ? 'page' : 'false')
  el('tab-earnings').setAttribute('aria-current', view === 'earnings' ? 'page' : 'false')
}

// Say which of the two sign-in paths this browser will actually take, before the
// worker taps. A button promising a passkey that then cannot run one is worse than a
// button that admits it is a development shortcut.
if (!passkeysAvailable()) {
  el<HTMLButtonElement>('signin').textContent = 'Continue without a passkey'
  el('signin-note').textContent =
    'Passkeys need a secure connection, and this page was opened over plain http. You will get a temporary identity stored only in this browser — fine for looking around, never for real work.'
}

el('signin').addEventListener('click', async () => {
  const button = el<HTMLButtonElement>('signin')
  button.disabled = true
  button.textContent = 'Waiting for your passkey…'
  try {
    session = await client.signIn()
    await start()
  } catch (error) {
    el('signin-error').textContent = error instanceof Error ? error.message : 'Could not sign in.'
    button.disabled = false
    button.textContent = passkeysAvailable() ? 'Sign in with a passkey' : 'Continue without a passkey'
  }
})

el('signout').addEventListener('click', () => {
  polling?.abort()
  client.signOut()
  session = null
  current = null
  show('signin')
})

el('tab-work').addEventListener('click', () => show('work'))
el('tab-earnings').addEventListener('click', async () => {
  show('earnings')
  await refreshEarnings()
})

el('q-skip').addEventListener('click', () => {
  // Skipping is free and silent. A worker who feels trapped by a question they cannot
  // answer will answer it badly, which costs more than the question is worth.
  current = null
  showWaiting()
})

const slider = el<HTMLInputElement>('q-confidence')
slider.addEventListener('input', () => {
  el('q-confidence-label').textContent = confidenceLabel(Number(slider.value) / 100)
})

function confidenceLabel(value: number): string {
  if (value >= 1) return 'Certain'
  if (value >= 0.8) return 'Fairly sure'
  if (value >= 0.5) return 'Not sure'
  return 'Guessing'
}

async function start(): Promise<void> {
  if (!session) return
  show('work')
  await refreshEarnings()
  void pollForever()
}

/**
 * The work loop.
 *
 * Treats a dropped connection as ordinary. The server hands back the same assignment
 * on reconnect, so the worst case for a worker whose signal comes and goes is a short
 * pause, never lost work.
 */
async function pollForever(): Promise<void> {
  polling?.abort()
  const controller = new AbortController()
  polling = controller

  while (!controller.signal.aborted) {
    if (!session) return
    if (current) {
      await sleep(400)
      continue
    }
    try {
      const assignment = await client.next(session.workerId, controller.signal)
      if (controller.signal.aborted) return
      if (assignment) presentQuestion(assignment)
    } catch {
      // Offline, or the poll was cut short. Wait a moment and try again.
      await sleep(1_500)
    }
  }
}

function showWaiting(): void {
  el('question').classList.add('hidden')
  el('paid').classList.add('hidden')
  el('waiting').classList.remove('hidden')
}

function presentQuestion(assignment: Assignment): void {
  current = assignment
  el('waiting').classList.add('hidden')
  el('paid').classList.add('hidden')
  el('question').classList.remove('hidden')

  el('q-meta').textContent = `Pays ${formatCents(assignment.paysCents)} · ${Math.round(assignment.expiresInMs / 1000)}s to answer`
  el('q-prompt').textContent = assignment.prompt

  const evidence = el('q-evidence')
  evidence.replaceChildren(...assignment.attachments.map(renderAttachment))

  slider.value = '100'
  el('q-confidence-label').textContent = 'Certain'

  el('q-options').replaceChildren(...renderAnswerControls(assignment))
}

/**
 * The evidence.
 *
 * Shown in full, because a worker asked "does this say 45.00 or 4.50" without the
 * receipt in front of them is being asked to guess — and a guess that arrives wearing
 * a confidence score is worse for the caller than no answer at all.
 */
function renderAttachment(attachment: Attachment): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'evidence'

  if (attachment.caption) {
    const caption = document.createElement('div')
    caption.className = 'cap'
    caption.textContent = attachment.caption
    wrap.append(caption)
  }

  if (attachment.type === 'image') {
    const img = document.createElement('img')
    img.src = attachment.url
    img.alt = attachment.caption ?? 'Evidence for this question'
    img.loading = 'eager'
    wrap.append(img)
  } else if (attachment.type === 'text') {
    const p = document.createElement('p')
    p.style.margin = '0'
    p.textContent = attachment.body
    wrap.append(p)
  } else {
    const pre = document.createElement('pre')
    pre.textContent = JSON.stringify(attachment.body, null, 2)
    wrap.append(pre)
  }

  return wrap
}

/** One control per possible answer, each big enough to hit with a thumb. */
function renderAnswerControls(assignment: Assignment): HTMLElement[] {
  const submitWith = (value: boolean | number | string) => () => void submit(value)

  if (assignment.schema.kind === 'boolean')
    return [
      option('Yes', submitWith(true)),
      option('No', submitWith(false)),
    ]

  if (assignment.schema.kind === 'choice')
    return assignment.schema.options.map((choice) => option(choice, submitWith(choice)))

  const input = document.createElement('input')
  input.type = 'number'
  input.inputMode = 'decimal'
  input.step = 'any'
  input.placeholder = assignment.schema.unit ? `Amount in ${assignment.schema.unit}` : 'Your answer'
  const send = document.createElement('button')
  send.className = 'primary'
  send.textContent = 'Send answer'
  send.addEventListener('click', () => {
    if (input.value.trim() === '') return
    void submit(Number(input.value))
  })
  return [input, send]
}

function option(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.textContent = label
  button.addEventListener('click', onClick)
  return button
}

async function submit(value: boolean | number | string): Promise<void> {
  if (!session || !current) return
  const assignment = current
  current = null

  for (const button of el('q-options').querySelectorAll('button')) button.disabled = true

  const result = await client.answer({
    assignmentId: assignment.assignmentId,
    workerId: session.workerId,
    value,
    selfConfidence: Number(slider.value) / 100,
  })

  el('question').classList.add('hidden')
  el('paid').classList.remove('hidden')

  if (result.accepted) {
    el('paid-title').textContent = 'Answer sent'
    el('paid-note').textContent = `${formatCents(assignment.paysCents)} is on its way to your account now.`
  } else {
    // Being honest about this matters: the usual reason is that the question finished
    // while they were reading, and a worker should not be left wondering.
    el('paid-title').textContent = 'That one closed'
    el('paid-note').textContent = `${result.reason ?? 'The question is no longer open.'} Nothing was lost — the next one is on its way.`
  }

  await refreshEarnings()
  setTimeout(showWaiting, 2_000)
}

async function refreshEarnings(): Promise<void> {
  if (!session) return
  try {
    const me = await client.me(session.workerId)
    render(me)
  } catch {
    // Leave the last known figures on screen rather than blanking them.
  }
}

function render(me: Me): void {
  el('net').textContent = me.network
  el('balance').textContent = formatCents(me.balanceCents ?? me.earnedCents)
  el('balance-note').textContent =
    me.balanceCents === null
      ? 'Read from your own account. Reconnecting to check the latest.'
      : me.feesSponsored
        ? 'In your own account. Transaction fees are covered, so you hold nothing but what you earn.'
        : 'In your own account.'
  el('address').textContent = me.address
  el('worker-id').textContent = me.workerId
  el('answered').textContent = String(me.answered)
  el('waiting-note').textContent = `You have answered ${me.answered} ${me.answered === 1 ? 'question' : 'questions'}.`

  const reputation = el('reputation')
  reputation.replaceChildren(
    ...Object.entries(me.reputation).map(([kind, stats]) => {
      const row = document.createElement('div')
      row.className = 'row'
      const k = document.createElement('span')
      k.className = 'k'
      k.textContent = kindLabel(kind)
      const v = document.createElement('span')
      v.className = 'v'
      v.textContent =
        stats.agreements + stats.disagreements === 0
          ? 'no history yet'
          : `${Math.round(stats.score * 100)}% · ${stats.agreements + stats.disagreements} answered`
      row.append(k, v)
      return row
    }),
  )
}

function kindLabel(kind: string): string {
  if (kind === 'disambiguate') return 'Telling two readings apart'
  if (kind === 'verify') return 'Checking something is real'
  return kind
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Boot: a returning worker goes straight back to the queue.
session = client.session()
if (session) void start()
else show('signin')
