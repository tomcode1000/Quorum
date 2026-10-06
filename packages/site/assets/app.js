/*
  The app client.

  One file for both product surfaces, with no framework and no build step. That
  is not minimalism for its own sake: the worker app runs on whatever phone
  somebody has, often on a connection that drops in lifts, and every dependency
  is one more thing that can fail in their hand at the moment they are trying to
  earn twenty cents.

  The rule the whole file is written to: nothing on screen is invented. Every
  figure is filled from the gateway or left as an em dash. The comps this UI was
  built from are full of plausible round numbers — a $42.50 balance, 248
  questions answered, 0.0034 ETH — and none of them are real. A false number on
  a live screen is the first thing anyone checks and the fastest way to lose the
  argument the product is making.
*/

/* ---------------------------------------------------------------- gateway -- */

const gateway = (() => {
  const explicit = new URL(document.baseURI).searchParams.get('gateway')
  if (explicit) return explicit.replace(/\/$/, '')
  // Set at build time from QUORUM_GATEWAY_URL for a deployed site (see render.mjs);
  // left as the placeholder in development, where the gateway is on port 8787.
  const configured = '__QUORUM_GATEWAY_URL__'
  if (!configured.startsWith('__')) return configured.replace(/\/$/, '')
  if (location.port === '8787') return location.origin
  return `${location.protocol}//${location.hostname}:8787`
})()

/* The console's token, sent with every operator read; see initOperatorGate. */
const operatorToken = () => {
  try {
    return localStorage.getItem('quorum-operator-token') ?? ''
  } catch {
    return ''
  }
}

const get = async (path, timeout = 8000) => {
  const operator = path.startsWith('/v1/operator')
  const response = await fetch(`${gateway}${path}`, {
    signal: AbortSignal.timeout(timeout),
    ...(operator ? { headers: { authorization: `Bearer ${operatorToken()}` } } : {}),
  })
  if (operator && response.status === 401) showOperatorGate()
  // An account that has not redeemed an invite can do nothing yet; see initInvite.
  if (response.status === 403 && path.startsWith('/v1/worker') && !location.pathname.includes('app-invite')) location.href = 'app-invite.html'
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.json()
}

const post = async (path, body) => {
  const response = await fetch(`${gateway}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (parsed?.blocked === 'invite-required') location.href = 'app-invite.html'
  if (!response.ok) throw new Error(parsed?.error ?? text ?? `${response.status}`)
  return parsed
}

/* ------------------------------------------------------------------ dom -- */

const $ = (key, root = document) => root.querySelector(`[data-app="${key}"]`)
const $$ = (key, root = document) => [...root.querySelectorAll(`[data-app="${key}"]`)]

/** Fills every element carrying a key. Several screens show the same figure twice. */
const fill = (key, value) => {
  for (const el of $$(key)) el.textContent = value
}

const html = (key, markup) => {
  for (const el of $$(key)) el.innerHTML = markup
}

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/* ---------------------------------------------------------------- format -- */

/*
  Cents, as a worker reads them.

  A wage is twenty cents, so an evening's work is often a few dollars and the dollar and the
  usual two-decimal format rounds it to "$0.06" or hides it entirely at
  "$0.00". Three decimals appear only below a dime, where they are carrying
  meaning, so the ordinary case still looks like money rather than telemetry.
*/
const money = (cents) => {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return 'Unavailable'
  const dollars = cents / 100
  if (dollars !== 0 && Math.abs(dollars) < 0.1) return `$${dollars.toFixed(3)}`
  return `$${dollars.toFixed(2)}`
}

const shortHash = (hash) => (hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : 'Pending')

const shortAddress = (address) => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Unknown')

/*
  A time, in words.

  Wages land seconds after an answer, so "just now" and "2m ago" are the two
  cases that matter and an absolute timestamp is the one nobody reads. Past a
  day it switches to a date, because "31,100m ago" is not a unit of anything.
*/
const ago = (at) => {
  if (!at) return 'Never'
  const seconds = Math.round((Date.now() - at) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const clockTime = (at) =>
  new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })

const duration = (ms) => {
  if (ms === null || ms === undefined) return 'Not measured'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

/** Two letters for an avatar. Derived, never a name we made up. */
const initials = (value) =>
  String(value ?? '?')
    .replace(/^0x/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase() || '??'

const KIND_LABELS = {
  disambiguate: 'Telling two readings apart',
  verify: 'Checking something is real',
  match: 'Matching records',
  categorise: 'Categorising',
  compare: 'Comparing',
}

const kindLabel = (kind) => KIND_LABELS[kind] ?? kind ?? 'Unknown'

/* ------------------------------------------------------------------ icons -- */

/* The handful the client draws at runtime. The rest are rendered at build time. */
const ICONS = {
  arrow: '<path d="M3.4 9h11.2M10.2 4.6 14.6 9l-4.4 4.4"/>',
  check: '<path d="m3.6 9.4 3.4 3.4 7.4-7.4"/>',
  x: '<path d="M5 5l8 8M13 5l-8 8"/>',
  clock: '<circle cx="9" cy="9" r="7"/><path d="M9 4.8V9l2.8 1.7"/>',
  out: '<path d="M11.4 2.6h4v4M15.4 2.6 8.6 9.4"/><path d="M13.6 10.6v3.8a1.6 1.6 0 0 1-1.6 1.6H3.6A1.6 1.6 0 0 1 2 14.4V6a1.6 1.6 0 0 1 1.6-1.6h3.8"/>',
  warn: '<path d="M9 2.4 16.2 15H1.8L9 2.4Z"/><path d="M9 7.2v3.2"/><circle cx="9" cy="12.6" r=".8" fill="currentColor" stroke="none"/>',
  file: '<path d="M10.4 1.8H5a1.6 1.6 0 0 0-1.6 1.6v11.2A1.6 1.6 0 0 0 5 16.2h8a1.6 1.6 0 0 0 1.6-1.6V6l-4.2-4.2Z"/><path d="M10.2 1.9V6h4.2"/>',
  user: '<circle cx="9" cy="6" r="3.2"/><path d="M3.4 15.4c.5-2.7 2.8-4.4 5.6-4.4s5.1 1.7 5.6 4.4"/>',
  db: '<ellipse cx="9" cy="4.4" rx="5.8" ry="2.4"/><path d="M3.2 4.4v9.2c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V4.4M3.2 9c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4"/>',
  swap: '<path d="M3 6.4h10.4M10.6 3.6 13.4 6.4l-2.8 2.8M15 11.6H4.6M7.4 8.8 4.6 11.6l2.8 2.8"/>',
  wallet: '<rect x="2.2" y="4" width="13.6" height="10" rx="2.2"/><path d="M2.2 7.4h13.6"/><circle cx="12.4" cy="10.8" r=".9" fill="currentColor" stroke="none"/>',
  users: '<circle cx="9" cy="6.2" r="3.1"/><path d="M3.2 15.2c.6-2.8 2.9-4.5 5.8-4.5s5.2 1.7 5.8 4.5"/>',
  clipboard:
    '<rect x="3.6" y="3.2" width="10.8" height="12.6" rx="2"/><path d="M6.6 3.2a1.6 1.6 0 0 1 1.6-1.6h1.6a1.6 1.6 0 0 1 1.6 1.6"/><path d="M6.6 8.4h4.8M6.6 11.6h3.2"/>',
  key: '<circle cx="6" cy="10.4" r="3.4"/><path d="m8.5 8 6-6M12.4 4.1l1.7 1.7M10.9 5.6l1.7 1.7"/>',
  download: '<path d="M9 2.4v8.4M5.6 7.8 9 11.2l3.4-3.4"/><path d="M2.8 12.8v1.6a1.6 1.6 0 0 0 1.6 1.6h9.2a1.6 1.6 0 0 0 1.6-1.6v-1.6"/>',
}

const icon = (name) =>
  `<svg class="i" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ICONS.file}</svg>`

const tile = (name, tone = '', size = 'sm') =>
  `<span class="ap-tile${size ? ` ap-tile-${size}` : ''}${tone ? ` ap-tile-${tone}` : ''}">${icon(name)}</span>`

const pill = (label, tone = '', name = null) =>
  `<span class="ap-pill${tone ? ` ap-pill-${tone}` : ''}${name ? ' ap-pill-icon' : ''}">${name ? icon(name) : ''}${esc(label)}</span>`

const empty = (text) => `<p class="ap-empty">${text}</p>`

/*
  A payment's status, as a shape and a word.

  Never a colour on its own: this is the cell that tells somebody whether they
  have their money, and red/green colour blindness would make a paid row and a
  failed row identical.
*/
const paymentPill = (status) =>
  status === 'settled'
    ? pill('Paid', 'good', 'check')
    : status === 'failed'
      ? pill('Did not send', 'bad', 'warn')
      : pill('Sending', 'warn', 'clock')

/* ------------------------------------------------------------------ theme -- */

/*
  Dark mode.

  Stored per device and shared by both surfaces. The label names the mode the
  button switches *to*, which is what makes it pressable without surprise — the
  comps drew "Light mode" on a light page, where pressing it would have done
  nothing a reader could predict.
*/
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme)
  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.setAttribute('aria-pressed', String(theme === 'dark'))
    const label = button.querySelector('[data-theme-label]')
    if (label) label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode'
  }
}

/*
  Light until somebody says otherwise.

  This used to follow the operating system, which made the product look broken:
  the marketing site is light-only by design, so a visitor whose laptop was in
  dark mode met white pages and then a black app, and nothing on screen
  explained why. One surface being a different colour from the next reads as a
  bug, not as a preference.

  So the default is light everywhere, uniformly, and dark is something a person
  chooses with the control in the rail. That choice is stored per device and
  carries across the worker app and the console.
*/
const initTheme = () => {
  let stored = null
  try {
    stored = localStorage.getItem('quorum-theme')
  } catch {
    /* Private browsing, or storage blocked. The control still works for this page. */
  }
  applyTheme(stored === 'dark' ? 'dark' : 'light')

  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      try {
        localStorage.setItem('quorum-theme', next)
      } catch {
        /* Nothing to do: the choice applies to this page and is not remembered. */
      }
    })
  }
}

/* ------------------------------------------------------------------- copy -- */

const initCopy = () => {
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      const source = $(button.dataset.copy)
      const text = source?.dataset.full ?? source?.textContent?.trim()
      if (!text || text === 'Loading' || text === 'Unavailable') return
      try {
        await navigator.clipboard.writeText(text)
        const was = button.innerHTML
        button.innerHTML = icon('check')
        setTimeout(() => {
          button.innerHTML = was
        }, 1400)
      } catch {
        /* Clipboard refused. The value is on screen and selectable either way. */
      }
    })
  }
}

/* ------------------------------------------------------------------ clock -- */

const initClock = () => {
  if (!$('clock-time')) return
  const tick = () => {
    const now = new Date()
    fill('clock-date', now.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))
    fill('clock-time', `${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })} local`)
  }
  tick()
  setInterval(tick, 30000)
}

/* ---------------------------------------------------------------- session -- */

/*
  The worker's identity.

  There is no password and no seed phrase: the passkey, or Tempo Wallet, is the
  identity, and the account it controls is where wages land.

  Versioned, because sessions saved before this version carry an address that
  was derived by a hash of our own rather than by Tempo's rule: an address no
  key can sign for. Ignoring them sends the worker through sign-in again, where
  an old passkey is recognised and they are asked to make a new one.
*/
const SESSION_KEY = 'quorum.session.v2'

const session = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const passkeysAvailable = () =>
  window.isSecureContext && 'credentials' in navigator && typeof PublicKeyCredential !== 'undefined'

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * Loads one of the wallet bundles on demand.
 *
 * They are the only part of the app with dependencies, and large ones, so no
 * page pays for them until it is about to sign something.
 */
const loadBundle = (file, global) =>
  window[global]
    ? Promise.resolve(window[global])
    : new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = `assets/${file}`
        script.onload = () => (window[global] ? resolve(window[global]) : reject(new Error('The wallet did not load.')))
        script.onerror = () => reject(new Error('The wallet could not be downloaded. Check your connection.'))
        document.head.append(script)
      })

const wallet = () => loadBundle('wallet.js', 'QuorumWallet')

/** The public key registered for a passkey, or null when there is none on record. */
const lookupKey = async (workerId) => {
  try {
    return (await get(`/v1/worker/key?workerId=${encodeURIComponent(workerId)}`)).publicKey
  } catch {
    return null
  }
}

/** Set when an old passkey had to be replaced, so the next page can say so. */
let legacyReplaced = false

/**
 * Establishes the worker's identity with a passkey.
 *
 * Existing passkey first, new one only if there is not one. This order is what
 * makes the button safe to press twice. A worker who clears their browser, or
 * whose first attempt failed after the passkey was already saved, would
 * otherwise be handed a brand new credential, and since the credential is the
 * identity, that is a brand new account with none of their earnings in it.
 *
 * The account is the one Tempo itself derives from the passkey's public key, so
 * the passkey can later sign transfers out of it. A browser hands over the key
 * only when a passkey is made, which is why it is registered with the gateway and
 * looked up again on every later sign-in.
 */
const createIdentity = async () => {
  if (!passkeysAvailable()) {
    /*
      No secure context: in practice a phone opening this over plain http on a
      LAN address, where the browser refuses WebAuthn outright. A browser-local
      identity keeps the app usable for that, and for nothing else: an identity
      anybody can mint is not an identity, and nothing paid to it can be moved.
      Production is https, where the passkey path is the only path.
    */
    const random = crypto.getRandomValues(new Uint8Array(20))
    const address = `0x${hex(random)}`
    return { workerId: `local-${address.slice(2, 18)}`, address, signer: null }
  }

  const { existingPasskey, createPasskey } = await wallet()
  try {
    return { ...(await existingPasskey(lookupKey)), signer: 'passkey' }
  } catch (error) {
    /*
      No passkey for this site yet, or the person dismissed the picker: make one.
      A passkey from before accounts were derived properly lands here too. It
      cannot be upgraded, because the browser will not give its key back, so it
      is replaced and the worker is told why rather than left wondering.
    */
    if (error?.name === 'LegacyPasskey') legacyReplaced = true
  }
  return { ...(await createPasskey()), signer: 'passkey' }
}

const signIn = async () => {
  const existing = session()
  if (existing) return existing
  const identity = await createIdentity()
  const { signer, ...registration } = identity
  const registered = await post('/v1/worker/register', registration)
  return remember({
    workerId: identity.workerId,
    address: identity.address,
    signer,
    ...(identity.publicKey ? { publicKey: identity.publicKey } : {}),
    assessment: registered.assessment,
  })
}

/**
 * Signs in with Tempo Wallet.
 *
 * Wages then go to the Tempo Wallet account itself. The wallet proves the
 * address is theirs by signing the gateway's challenge while it connects, and
 * only then does the gateway hand back a worker id.
 */
const signInWithTempoWallet = async () => {
  const health = await get('/health')
  const { connect } = await loadBundle('tempo-wallet.js', 'QuorumTempoWallet')
  const signed = await connect({ chainId: health.chainId, authUrl: `${gateway}/v1/auth` })
  return remember({ workerId: signed.workerId, address: signed.address, signer: 'tempo-wallet', assessment: signed.assessment })
}

/** Where a worker goes next, by where they stand. See the gateway's skills.ts. */
const landingFor = (standing) =>
  standing === 'invite'
    ? 'app-invite.html'
    : standing === 'passed'
    ? 'app-home.html'
    : standing === 'choose'
      ? 'app-skills.html'
      : standing === 'failed'
        ? 'app-assessment-failed.html'
        : 'app-assessment.html'

const remember = (saved) => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(saved))
  } catch {
    /* Nothing to store into. The session lasts this page and no longer. */
  }
  return saved
}

/* ------------------------------------------------------------------- bell -- */

/*
  The bell.

  A dot only when something is genuinely waiting, and never a count that climbs.
  The comps draw it permanently lit, which on this surface would be a standing
  demand for attention aimed at somebody earning twenty cents an answer — and a
  worker who puts the phone down is not behind on anything.

  There are exactly two things worth a dot: work is available for them now, or a
  wage did not settle. The first is useful, the second is owed to them.
*/
const initBell = async () => {
  const bells = $$('bell')
  if (!bells.length) return

  const current = session()
  if (!current) return

  const mark = (state, title) => {
    for (const bell of bells) {
      if (state) bell.dataset.dot = state
      else delete bell.dataset.dot
      bell.setAttribute('aria-label', title)
    }
  }

  try {
    const me = await get(`/v1/worker/me?workerId=${encodeURIComponent(current.workerId)}`)
    const failed = (me.payments ?? []).filter((p) => p.status === 'failed')
    if (failed.length) {
      mark('alert', `${failed.length} payment${failed.length === 1 ? '' : 's'} did not settle`)
      return
    }
  } catch {
    return
  }

  mark(null, 'Notifications. Nothing is waiting')
}

/* ------------------------------------------------------------ worker data -- */

const WAGE_FALLBACK_NOTE = 'Sign in to see your own figures.'

/**
 * Fills every worker figure on the page from one read.
 *
 * `balanceCents` comes from the ledger rather than from our own ledger entry,
 * which is the point: a worker should be able to check what they hold when we
 * are not cooperating. When the read fails it stays an em dash instead of
 * falling back to our number, because quietly substituting our figure for the
 * authoritative one is the exact swap this design refuses to make.
 */
const loadMe = async () => {
  const current = session()
  if (!current) {
    fill('greeting', 'Not signed in')
    for (const el of $$('state-note')) el.textContent = WAGE_FALLBACK_NOTE
    return null
  }

  let me
  try {
    me = await get(`/v1/worker/me?workerId=${encodeURIComponent(current.workerId)}`)
  } catch {
    fill('greeting', 'Offline')
    return null
  }

  fill('greeting', `Signed in as ${shortAddress(me.address)}`)
  fill('balance', money(me.balanceCents))
  fill('earned', money(me.earnedCents))
  fill('answered', String(me.answered))
  fill('network', me.network ?? 'Network unknown')
  fill('worker-id', me.workerId)
  fill('display-name', shortAddress(me.address))
  fill('initials', initials(me.address))
  fill('payment-count', String(me.payments?.length ?? 0))

  for (const el of $$('address')) {
    el.textContent = me.address
    el.dataset.full = me.address
  }

  const last = me.payments?.[0]
  fill('last-when', last ? ago(last.at) : 'No payments yet')
  fill('last-amount', last ? money(last.amountCents) : 'Nothing yet')

  /*
    Standing.

    Shown as the best of the five kinds of judgment, with its count, because
    that is the number that decides which questions reach them. It is never
    shown as a grade or a level: there are no levels, and inventing one would be
    a scoreboard on a screen the brief keeps scoreboards off.
  */
  const scores = Object.entries(me.reputation ?? {})
  const best = scores.sort(([, a], [, b]) => b.score - a.score)[0]
  const answered = best ? best[1].agreements + best[1].disagreements : 0
  fill(
    'standing',
    me.assessment === 'failed'
      ? 'Not active'
      : me.assessment !== 'passed'
        ? 'Assessment not finished'
        : best && answered > 0
          ? `${Math.round(best[1].score * 100)}% on ${kindLabel(best[0]).toLowerCase()}`
          : 'New, no record yet',
  )

  /*
    Onboarding state, from the roster rather than from the markup.

    Both of these badges used to be written into the page, so somebody who had
    not answered a single assessment question was told on their own profile
    that they were verified and that work could reach them. Neither was true.
    A product whose entire argument is "we will not tell you a comfortable
    number" cannot afford a comfortable badge either.
  */
  const STANDING = {
    passed: [
      ['Verified by passkey', 'good', 'check'],
      ['Work can reach you', 'good', 'check'],
    ],
    required: [
      ['Passkey set up', 'accent', 'key'],
      ['Assessment not finished', 'warn', 'clock'],
    ],
    failed: [
      ['Passkey set up', 'accent', 'key'],
      ['Work is not being routed to you', 'bad', 'x'],
    ],
  }
  const [verified, reach] = STANDING[me.assessment] ?? STANDING.required

  for (const el of $$('verified-pill')) el.innerHTML = pill(...verified)
  for (const el of $$('status-pill')) el.innerHTML = pill(...reach)

  const explorer = last?.explorerUrl
  for (const el of $$('address-link')) {
    if (explorer) el.href = explorer
    else el.setAttribute('aria-disabled', 'true')
  }

  renderPayments(me)
  return me
}

/* ------------------------------------------------------------------ send -- */

/**
 * Moving money out of a passkey worker's own account.
 *
 * Only a passkey worker gets this. Their passkey works on this site alone, so
 * this is the one place they can sign a transfer. A Tempo Wallet worker's wages
 * are already in their wallet, and a browser-local identity has no key that
 * could move anything, so neither is shown a control that cannot work.
 */
const initSend = (me) => {
  const current = session()
  const sendCard = $('send-card')
  const tempoCard = $('tempo-wallet-card')
  if (!current || !me || (!sendCard && !tempoCard)) return
  if (tempoCard) tempoCard.hidden = me.signer !== 'tempo-wallet'
  if (!sendCard) return
  sendCard.hidden = !(me.signer === 'passkey' && current.publicKey)
  if (sendCard.hidden) return

  const button = $('send')
  const status = $('send-status')
  const say = (text, tone = '') => {
    status.hidden = false
    status.className = `ap-info${tone ? ` ap-info-${tone}` : ''}`
    status.textContent = text
  }

  button.addEventListener('click', async () => {
    const to = $('send-to').value.trim()
    const amountCents = Math.round(Number($('send-amount').value) * 100)
    if (!/^0x[0-9a-fA-F]{40}$/.test(to)) return say('That does not look like a Tempo address. It starts with 0x and has 40 characters after it.', 'bad')
    if (!(amountCents > 0)) return say('Enter an amount of at least one cent.', 'bad')
    if (me.balanceCents !== null && amountCents > me.balanceCents)
      return say(`You hold ${money(me.balanceCents)}, so that is more than is in your account.`, 'bad')

    const was = button.innerHTML
    button.disabled = true
    button.textContent = 'Confirm with your passkey…'
    try {
      const { sendFromPasskey, explorerTx } = await wallet()
      const hash = await sendFromPasskey({
        workerId: current.workerId,
        publicKey: current.publicKey,
        chainId: me.chainId,
        currency: me.currency,
        relayUrl: `${gateway}/v1/relay`,
        to,
        amountCents,
      })
      status.hidden = false
      status.className = 'ap-info ap-info-good'
      status.innerHTML = `Sent ${money(amountCents)}. <a href="${explorerTx(me.chainId, hash)}" target="_blank" rel="noopener">See it on the public record</a>.`
      $('send-amount').value = ''
      await loadMe()
    } catch (error) {
      say(`Nothing was sent: ${String(error.shortMessage ?? error.message ?? error)}`, 'bad')
    } finally {
      button.disabled = false
      button.innerHTML = was
    }
  })
}

/** The wage, read from a live assignment or from the catalog rather than typed. */
const loadWage = async () => {
  if (!$('wage')) return
  try {
    const caps = await get('/v1/capabilities')
    const servable = caps.capabilities?.filter((c) => c.servable) ?? []
    // Every capability pays the worker the same wage; the caller's price varies.
    const wage = caps.wage_cents ?? servable[0]?.worker_wage_cents ?? null
    if (wage !== null) fill('wage', money(wage))
  } catch {
    /* Left as an em dash. A wage figure typed into the markup would be a guess. */
  }
}

const paymentRow = (payment) => `<tr>
  <td><div class="ap-cell">${tile('file', 'plain')}<div><b>${esc(kindLabel(payment.kind))}</b><small>${esc(ago(payment.at))}</small></div></div></td>
  <td><span title="${esc(payment.label ?? '')}">${esc((payment.label ?? '').slice(0, 64))}${(payment.label ?? '').length > 64 ? '…' : ''}</span></td>
  <td class="ap-num"><b>${money(payment.amountCents)}</b></td>
  <td>${paymentPill(payment.status)}</td>
  <td>${
    payment.explorerUrl
      ? `<a class="ap-more" href="${esc(payment.explorerUrl)}" target="_blank" rel="noopener">View public record ${icon('out')}</a>`
      : '<span style="font-size:12px;color:var(--ink-4)">No record yet</span>'
  }</td>
</tr>`

const renderPayments = (me) => {
  const rows = me.payments ?? []
  const table = rows.length
    ? `<table class="ap-tbl"><thead><tr><th>Question</th><th>What was asked</th><th class="ap-num">Amount</th><th>Status</th><th>Record</th></tr></thead><tbody>${rows
        .map(paymentRow)
        .join('')}</tbody></table>`
    : empty('No payments yet.<br/>Every answer you are paid for appears here within seconds, with its public record.')

  html('payments-table', table)
  initFilter('payment-search', 'payments-table')

  const recent = rows.slice(0, 5)
  html(
    'recent-payments',
    recent.length
      ? `<table class="ap-tbl"><tbody>${recent.map(paymentRow).join('')}</tbody></table>`
      : empty('No payments yet.'),
  )

  /*
    The chart.

    Drawn only when there is more than one day of history behind it. A line
    shaped like a plausible week on a screen that has no week is the easiest
    way there is to put a false number in front of somebody, and this is a
    screen about money.
  */
  const byDay = new Map()
  for (const payment of rows) {
    if (payment.status !== 'settled') continue
    const day = new Date(payment.at).toISOString().slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + payment.amountCents)
  }
  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  if (days.length < 2) {
    html('chart', empty('Your earnings will be drawn here once there are a couple of days of them.'))
    return
  }

  const max = Math.max(...days.map(([, cents]) => cents))
  const w = 600
  const h = 140
  const points = days.map(([, cents], i) => [
    (i / (days.length - 1)) * w,
    h - (max ? (cents / max) * (h - 16) : 0) - 8,
  ])
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  html(
    'chart',
    `<svg class="ap-chart" viewBox="0 0 ${w} ${h + 22}" preserveAspectRatio="none" role="img" aria-label="Daily earnings over ${days.length} days, highest ${money(max)}">
      <path class="area" d="${line} L${w} ${h} L0 ${h} Z"/>
      <path class="line" d="${line}"/>
      ${points.map(([x, y]) => `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5"/>`).join('')}
    </svg>
    <p style="margin:10px 0 0;font-size:11.5px;color:var(--ink-4)">${days.length} days · highest ${money(max)} in a day</p>`,
  )
}

/* ------------------------------------------------------------- just paid -- */

/*
  The confirmation screen's receipt.

  A wage settles a moment or two after an answer, so this page arrives before
  the transaction exists. It polls the worker's own payment list for one that
  landed after they pressed submit, and until that arrives it says "Sending"
  rather than showing a reference it does not have. Inventing a plausible hash
  here would be inventing the one thing on the screen a worker might check.
*/
const initReceipt = () => {
  if (!$('tx-hash')) return
  const current = session()
  if (!current) return

  let since = 0
  try {
    since = Number(sessionStorage.getItem('quorum.submitted-at') ?? 0)
  } catch {
    since = 0
  }

  let tries = 0
  const look = async () => {
    tries += 1
    let me
    try {
      me = await get(`/v1/worker/me?workerId=${encodeURIComponent(current.workerId)}`)
    } catch {
      return tries < 20 && setTimeout(look, 2000)
    }

    const payment = (me.payments ?? []).find((p) => !since || p.at >= since - 5000)
    if (!payment) {
      if (tries < 20) setTimeout(look, 2000)
      // Twenty tries is about forty seconds. Past that, say so plainly rather
      // than spinning: the answer is in and the wage is owed either way.
      else fill('pay-state', 'Still settling')
      return
    }

    if (payment.status === 'failed') {
      fill('pay-state', 'Did not send')
      fill('tx-hash', 'no record yet')
      return
    }

    fill('pay-state', 'Paid')
    fill('wage', money(payment.amountCents))
    for (const el of $$('tx-hash')) {
      el.textContent = shortHash(payment.txHash)
      el.dataset.full = payment.txHash ?? ''
    }
    for (const el of $$('tx-link')) {
      if (!payment.explorerUrl) continue
      el.href = payment.explorerUrl
      el.target = '_blank'
      el.rel = 'noopener'
      el.hidden = false
    }
  }

  void look()
}

/* --------------------------------------------------------------- sign in -- */

const initSignIn = () => {
  const button = $('passkey')
  if (!button) return

  if (session()) {
    button.textContent = 'Continue'
    button.addEventListener('click', async () => {
      const current = session()
      location.href = landingFor(await redeemInvite(current).catch(() => current?.assessment))
    })
    return
  }

  const tempoButton = $('tempo-wallet')
  // Arriving from the site's "Use Tempo Wallet" button: point at it rather than
  // opening the wallet unasked, which a browser would block as a pop-up anyway.
  if (tempoButton && location.hash === '#tempo-wallet') tempoButton.focus()
  if (tempoButton)
    tempoButton.addEventListener('click', async () => {
      const was = tempoButton.innerHTML
      tempoButton.disabled = true
      tempoButton.textContent = 'Waiting for Tempo Wallet…'
      try {
        const signed = await signInWithTempoWallet()
        location.href = landingFor(await redeemInvite(signed).catch(() => signed.assessment))
      } catch (error) {
        tempoButton.disabled = false
        tempoButton.innerHTML = was
        const box = $('signin-error')
        if (box) {
          box.hidden = false
          box.textContent = `Tempo Wallet did not finish signing you in: ${String(error.message ?? error)}. Nothing was charged. You can try again, or use a passkey on this device.`
        }
      }
    })

  button.addEventListener('click', async () => {
    const was = button.innerHTML
    button.disabled = true
    button.textContent = 'Waiting for your device…'
    try {
      const signed = await signIn()
      const next = landingFor(await redeemInvite(signed).catch(() => signed.assessment))
      const box = $('signin-error')
      if (legacyReplaced && box) {
        // Said before moving on, because it explains why their account looks new.
        box.hidden = false
        box.className = 'ap-info'
        box.textContent =
          'Your old passkey was made before Quorum could read your account from it, so a new one has been made and your account starts fresh. Taking you in now.'
        setTimeout(() => {
          location.href = next
        }, 5000)
        return
      }
      location.href = next
    } catch (error) {
      button.disabled = false
      button.innerHTML = was
      const box = $('signin-error')
      if (box) {
        /*
          Say what failed and what happens next.

          Not "nothing was created": the browser makes the passkey before we
          ever call the gateway, so on a network failure the person has a saved
          passkey and a message telling them they have not. Pressing the button
          again reuses it rather than making a second one.
        */
        const reason = String(error.message ?? error)
        const offline = /fetch|network|load failed/i.test(reason)
        box.hidden = false
        box.textContent = offline
          ? 'Your passkey was saved on this device, but Quorum could not be reached to finish signing you in. Nothing was charged. Check your connection and press the button again — it will reuse the passkey you just made.'
          : `${reason}. Nothing was charged. You can press the button again.`
      }
    }
  })
}

/* -------------------------------------------------------------- answering -- */

const renderEvidence = (attachments) => {
  const target = $('evidence')
  if (!target) return
  if (!attachments?.length) {
    target.hidden = true
    return
  }
  target.hidden = false
  target.innerHTML = attachments
    .map((attachment) => {
      if (attachment.type === 'image')
        return `<figure style="margin:0"><img class="ap-evidence" src="${esc(attachment.url)}" alt="${esc(attachment.caption ?? 'Evidence for this question')}"/>${
          attachment.caption ? `<figcaption style="margin-top:8px;font-size:12.5px;color:var(--ink-3)">${esc(attachment.caption)}</figcaption>` : ''
        }</figure>`
      const body = attachment.type === 'json' ? JSON.stringify(attachment.body, null, 2) : attachment.body
      return `<div class="ap-info ap-info-plain"><div>${
        attachment.caption ? `<b>${esc(attachment.caption)}</b>` : ''
      }<p style="font-family:var(--mono);white-space:pre-wrap;word-break:break-word">${esc(body)}</p></div></div>`
    })
    .join('')
}

/**
 * Draws the options for one question.
 *
 * Full-width tap targets, never a text field. A number question still gets a
 * field, because there is no way to enumerate it — but it is the exception and
 * it is sized like the buttons around it.
 */
const renderOptions = (schema, onPick) => {
  const target = $('options')
  if (!target) return
  let picked = null

  const choices =
    schema?.kind === 'boolean'
      ? [
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ]
      : schema?.kind === 'choice'
        ? schema.options.map((option) => ({ label: option, value: option }))
        : null

  if (!choices) {
    target.innerHTML = `<label class="ap-field ap-field-lg"><span style="font-size:13px;color:var(--ink-3)">${esc(
      schema?.unit ?? 'Your answer',
    )}</span><input type="number" inputmode="decimal" step="any" data-app="number-answer" aria-label="Your answer"/></label>`
    const field = $('number-answer')
    field?.addEventListener('input', () => onPick(field.value === '' ? null : Number(field.value)))
    return
  }

  target.innerHTML = choices
    .map(
      (choice, index) =>
        `<button class="ap-opt" type="button" role="radio" aria-checked="false" data-index="${index}">${esc(choice.label)}</button>`,
    )
    .join('')

  for (const button of target.querySelectorAll('.ap-opt')) {
    button.addEventListener('click', () => {
      picked = choices[Number(button.dataset.index)].value
      for (const other of target.querySelectorAll('.ap-opt')) other.setAttribute('aria-checked', 'false')
      button.setAttribute('aria-checked', 'true')
      onPick(picked)
    })
  }
}

/**
 * The uncertainty scale.
 *
 * Load-bearing and counter-intuitive: hedging buys a second opinion rather than
 * discounting the worker, and they are paid either way. Defaults to certain
 * because that is the common case, and every other setting is one tap.
 */
const initSureness = () => {
  const scope = $('sure')
  let value = 1
  if (!scope) return () => value
  for (const button of scope.querySelectorAll('[data-sure]')) {
    button.addEventListener('click', () => {
      value = Number(button.dataset.sure)
      for (const other of scope.querySelectorAll('[data-sure]')) other.setAttribute('aria-pressed', 'false')
      button.setAttribute('aria-pressed', 'true')
    })
  }
  return () => value
}

/*
  The question screen.

  Long-polls for work, hands the same assignment back on reconnect, and treats a
  dropped connection as ordinary rather than exceptional — because on the phones
  this runs on, it is. Nothing here counts down at the worker.
*/
const initQuestion = async () => {
  const submit = $('submit')
  const options = $('options')
  if (!submit || !options || document.body.dataset.flow === 'assessment') return

  const current = session()
  if (!current) {
    location.href = 'app-signin.html'
    return
  }

  const sureness = initSureness()
  let answer = null
  let assignment = null

  // Nothing to answer yet, so nothing to answer with. The controls appear with the
  // question; before that they only invite a worker to press things that do nothing.
  const controls = [$('sure'), submit, $('skip')].filter(Boolean)
  const showControls = (on) => {
    for (const el of controls) el.hidden = !on
  }
  showControls(false)

  const onPick = (value) => {
    answer = value
    submit.disabled = value === null || value === undefined
  }

  $('skip')?.addEventListener('click', () => {
    // No confirmation, no penalty, no record. Straight back to waiting.
    location.href = 'app-home.html'
  })

  const waitForWork = async () => {
    try {
      const body = await get(`/v1/worker/next?workerId=${encodeURIComponent(current.workerId)}`, 30000)
      if (body.blocked === 'skills-required') {
        location.href = 'app-skills.html'
        return
      }
      if (body.blocked === 'assessment-required') {
        location.href = 'app-assessment.html'
        return
      }
      if (body.blocked === 'assessment-failed') {
        location.href = 'app-assessment-failed.html'
        return
      }
      if (!body.assignment) {
        // The poll ran its course with nothing to hand out. Keep waiting here:
        // sending the worker back to Home would lose the page they chose to wait on.
        void waitForWork()
        return
      }

      assignment = body.assignment
      fill('prompt', assignment.prompt)
      fill('kind', kindLabel(assignment.kind))
      fill('wage', money(assignment.paysCents))
      fill('reading', duration(assignment.suggestedReadingMs))
      renderEvidence(assignment.attachments)
      renderOptions(assignment.schema, onPick)
      showControls(true)
    } catch {
      // The poll timed out or the connection dropped. Both are ordinary here.
      fill('prompt', 'Reconnecting…')
      setTimeout(waitForWork, 2000)
    }
  }

  submit.addEventListener('click', async () => {
    if (!assignment || answer === null) return
    submit.disabled = true
    submit.textContent = 'Sending…'
    try {
      try {
        // The confirmation screen looks for a payment that landed after this.
        sessionStorage.setItem('quorum.submitted-at', String(Date.now()))
      } catch {
        /* It falls back to the newest payment, which is the same one in practice. */
      }
      const result = await post('/v1/worker/answer', {
        assignmentId: assignment.assignmentId,
        workerId: current.workerId,
        value: answer,
        selfConfidence: sureness(),
      })
      // A question that resolved while they were reading is not a failure and is
      // not their fault. It has its own screen, which says exactly that.
      location.href = result.accepted ? 'app-submitted.html' : 'app-closed.html'
    } catch {
      location.href = 'app-closed.html'
    }
  })

  await waitForWork()
}

/* ------------------------------------------------------------- assessment -- */

const initAssessment = async () => {
  if (document.body.dataset.flow !== 'assessment') return
  const submit = $('submit')
  if (!submit) return

  const current = session()
  if (!current) {
    location.href = 'app-signin.html'
    return
  }

  let answer = null
  const onPick = (value) => {
    answer = value
    submit.disabled = value === null || value === undefined
  }

  const show = (body) => {
    // Nothing left to assess: go wherever their standing now points.
    if (body.status !== 'in-progress') {
      location.href = landingFor(body.status)
      return false
    }
    fill('q-skill', `Assessment · ${kindLabel(body.skill)}`)
    fill('q-number', String(body.number))
    fill('q-of', String(body.of))
    fill('prompt', body.question.prompt)
    for (const bar of $$('q-progress')) bar.style.width = `${(body.number / body.of) * 100}%`
    renderEvidence(body.question.attachments)
    renderOptions(body.question.schema, onPick)
    answer = null
    submit.disabled = true
    submit.innerHTML = `Next ${icon('arrow')}`
    return true
  }

  submit.addEventListener('click', async () => {
    if (answer === null) return
    submit.disabled = true
    submit.textContent = 'Sending…'
    try {
      const result = await post('/v1/worker/assessment', { workerId: current.workerId, value: answer })
      if (result.status === 'in-progress') {
        show(result)
        return
      }
      // Passed or failed. Both outcomes are paid, and both are stored so the
      // screen that follows can show the score rather than ask for it again.
      try {
        sessionStorage.setItem('quorum.assessment', JSON.stringify(result))
      } catch {
        /* The next screen falls back to reading the roster instead. */
      }
      location.href = result.status === 'passed' ? 'app-assessment-passed.html' : 'app-assessment-failed.html'
    } catch (error) {
      submit.disabled = false
      submit.textContent = 'Try sending that again'
      console.error(error)
    }
  })

  try {
    const body = await get(`/v1/worker/assessment?workerId=${encodeURIComponent(current.workerId)}`)
    show(body)
  } catch {
    fill('prompt', 'Could not reach Quorum. Your connection may have dropped, and this page will work again when it is back.')
  }
}

/** The result screens read what the assessment call already told us. */
const initAssessmentResult = () => {
  if (!$('score')) return
  let result = null
  try {
    result = JSON.parse(sessionStorage.getItem('quorum.assessment') ?? 'null')
  } catch {
    result = null
  }
  if (!result) return
  const skill = kindLabel(result.skill).toLowerCase()
  const next = $('result-next')
  if (result.next && next) {
    // Another skill they picked is waiting; that comes before anything else.
    next.href = 'app-assessment-question.html'
    next.innerHTML = `Next: ${esc(kindLabel(result.next).toLowerCase())} ${icon('arrow')}`
  }
  if (result.status === 'passed')
    fill('passed-note', `Questions about ${skill} can reach you now, and every one of them is paid the moment your answer is accepted.`)
  if (result.status === 'failed' && result.standing !== 'failed') {
    fill(
      'failed-note',
      `Too many of the five were missed, so questions about ${skill} will not be routed to you. Your other skills are unaffected, and anything you have earned stays in your own account where we cannot reach it.`,
    )
    if (!result.next && next) {
      next.href = 'app-home.html'
      next.innerHTML = `Back to work ${icon('arrow')}`
    }
  }
  fill('score', `${result.correct} of ${result.of}`)
  fill('assessment-correct', String(result.correct))
  fill('assessment-wrong', String(result.of - result.correct))
  fill('assessment-of', String(result.of))
  /*
    No assessment wage to report. The five questions have known answers and
    never reach a caller, so there is no revenue behind them to pay out of;
    what the result screens now show is the wage waiting on the other side of
    it, which is the number that actually matters to somebody deciding whether
    to carry on.
  */
}

/* ----------------------------------------------------------------- skills -- */

/**
 * Picking skills.
 *
 * A skill already passed or not passed is shown as such and cannot be switched:
 * the gateway would refuse it anyway, and a switch that springs back teaches
 * nothing. A skill without enough known answers to assess is marked plainly
 * rather than hidden, because a missing option reads as one that does not exist.
 */
const initSkills = async () => {
  const save = $('skills-save')
  if (!save) return
  const current = session()
  if (!current) {
    location.href = 'app-signin.html'
    return
  }

  const box = $('skills-error')
  const say = (text) => {
    box.hidden = false
    box.textContent = text
  }

  let view
  try {
    view = await get(`/v1/worker/skills?workerId=${encodeURIComponent(current.workerId)}`)
  } catch {
    say('Could not reach Quorum to load your skills. This page will work again when your connection is back.')
    return
  }

  const toggles = [...document.querySelectorAll('[data-skill-toggle]')]
  const open = (kind) => {
    const skill = view.skills.find((entry) => entry.kind === kind)
    return skill?.assessable && (skill.state === null || skill.state === 'chosen')
  }
  const hasPassed = view.skills.some((entry) => entry.state === 'passed')

  const refresh = () => {
    const picked = toggles.filter((t) => open(t.dataset.skillToggle) && t.getAttribute('aria-checked') === 'true')
    save.disabled = picked.length === 0 && !hasPassed
    save.innerHTML = picked.length > 0 ? `Start the assessment ${icon('arrow')}` : `Back to work ${icon('arrow')}`
  }

  for (const toggle of toggles) {
    const kind = toggle.dataset.skillToggle
    const skill = view.skills.find((entry) => entry.kind === kind)
    const slot = document.querySelector(`[data-skill-state="${kind}"]`)
    const decided = skill?.state === 'passed' || skill?.state === 'failed'
    if (decided || !skill?.assessable) {
      toggle.hidden = true
      if (slot)
        slot.innerHTML = !skill?.assessable
          ? pill('No test yet', '', 'clock')
          : skill.state === 'passed'
            ? pill('Passed', 'good', 'check')
            : pill('Not passed', 'bad', 'x')
      continue
    }
    toggle.setAttribute('aria-checked', String(skill.state === 'chosen'))
    toggle.addEventListener('click', () => {
      toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true'))
      refresh()
    })
  }
  refresh()

  save.addEventListener('click', async () => {
    const kinds = toggles
      .filter((t) => open(t.dataset.skillToggle) && t.getAttribute('aria-checked') === 'true')
      .map((t) => t.dataset.skillToggle)
    save.disabled = true
    try {
      const saved = await post('/v1/worker/skills', { workerId: current.workerId, kinds })
      remember({ ...current, assessment: saved.standing })
      location.href = kinds.length > 0 ? 'app-assessment.html' : landingFor(saved.standing)
    } catch (error) {
      save.disabled = false
      say(`Your skills were not saved: ${String(error.message ?? error)}. Nothing has changed, so you can try again.`)
    }
  })
}

/* ----------------------------------------------------------------- notify -- */

/** The optional email for being told that work is waiting. Empty and saved removes it. */
const initNotify = (me) => {
  const field = $('notify-email')
  const save = $('notify-save')
  const current = session()
  if (!field || !save || !current) return
  if (me?.email) field.value = me.email

  const status = $('notify-status')
  const say = (text, tone = '') => {
    status.hidden = false
    status.className = `ap-info${tone ? ` ap-info-${tone}` : ''}`
    status.textContent = text
  }

  save.addEventListener('click', async () => {
    const email = field.value.trim()
    save.disabled = true
    try {
      const saved = await post('/v1/worker/notify', { workerId: current.workerId, email: email || null })
      say(
        saved.email
          ? `You will be told at ${saved.email} when work in your skills is waiting and you are away.`
          : 'Removed. You will not be emailed.',
        'good',
      )
    } catch (error) {
      say(`Not saved: ${String(error.message ?? error)}`, 'bad')
    } finally {
      save.disabled = false
    }
  })
}

/* ------------------------------------------------------------ home state -- */

/*
  Home.

  Reads the roster to decide which of four things a worker is actually looking
  at: work waiting for them, an assessment to finish, an assessment they did not
  pass, or the quiet wait. Rendering "waiting for a question" at somebody who is
  blocked would be the app lying to them about why nothing arrives.
*/
const setState = (title, note) => {
  /*
    The heading is two lines in the comps, and the break is part of the design
    rather than a wrap that happens to fall there. `title` therefore carries its
    own `<em>`, which is why this writes markup: filling textContent would
    collapse a deliberate two-line heading into whatever the column width gives.
    The strings come from this file, never from the gateway, so there is nothing
    untrusted going into innerHTML here.
  */
  for (const el of $$('state-title')) el.innerHTML = title
  fill('state-note', note)
}

const initHome = async () => {
  if (!$('state-title')) return
  const current = session()
  if (!current) {
    setState('Sign in<em>to start.</em>', 'One tap with your fingerprint, face or device PIN. There is nothing to set up and nothing to pay.')
    return
  }

  try {
    const body = await get(`/v1/worker/next?workerId=${encodeURIComponent(current.workerId)}`, 30000)
    if (body.blocked === 'skills-required') {
      setState('Pick what you<em>are good at.</em>', 'Choose the kinds of question you want to answer. Each has a five-question assessment, and passing one brings you that kind of work.')
      return
    }
    if (body.blocked === 'assessment-required') {
      setState('Your assessment<em>is waiting.</em>', 'Five short questions for each skill you picked. They are not paid, because none of them reach a customer; work of that kind starts reaching you once you pass.')
      return
    }
    if (body.blocked === 'assessment-failed') {
      setState('No more<em>questions.</em>', 'Too many questions were missed in every skill you picked, so work is not being routed to you. Everything you earned is yours and is already in your own account.')
      return
    }
    if (body.assignment) {
      location.href = 'app-question.html'
      return
    }
    setState('Waiting for<em>a question…</em>', 'Nothing is available right now. You will be paid for each one you answer, and one can arrive at any moment.')
  } catch {
    setState('Reconnecting…', 'The connection dropped. Nothing you have done is lost, and this will pick up again on its own.')
  }
}

/* ------------------------------------------------------------- the console -- */

const FEED_COPY = {
  'question.received': (e) => ['A question arrived', `${kindLabel(e.kind)} · ${e.prompt ?? ''}`, 'clipboard', ''],
  'worker.asked': (e) => [
    e.calibration ? `${shortAddress(e.workerId)} was given a known-answer check` : `${shortAddress(e.workerId)} was asked`,
    e.calibration
      ? 'Paid like any question, not billed to the caller, and graded against the truth'
      : (e.reason ?? (e.exploratory ? 'Chosen to learn what they are good at' : 'Chosen on their record')),
    'user',
    'accent',
  ],
  'calibration.answered': (e) => [
    `${shortAddress(e.workerId)} answered the check`,
    e.correct ? 'Matched the known answer' : 'Did not match the known answer, and their record says so',
    'check',
    e.correct ? 'good' : 'warn',
  ],
  'answer.received': (e) => [
    `${shortAddress(e.workerId)} answered`,
    `They said they were ${Math.round((e.confidence ?? 1) * 100)}% sure`,
    'check',
    'good',
  ],
  'worker.paid': (e) => [`${shortAddress(e.workerId)} was paid`, `${money(e.amountCents)} · ${shortHash(e.txHash)}`, 'wallet', 'good'],
  'caller.refunded': (e) => ['The caller was refunded', `${money(e.amountCents)} · ${shortHash(e.txHash)}`, 'swap', 'warn'],
  'question.settled': (e) => [
    e.status === 'resolved' ? 'Resolved' : `Not resolved: ${e.status.replace('_', ' ')}`,
    `Confidence ${(e.confidence ?? 0).toFixed(3)} · ${money(e.wagesCents)} in wages`,
    e.status === 'resolved' ? 'check' : 'warn',
    e.status === 'resolved' ? 'good' : 'warn',
  ],
}

const feedRow = (event, at) => {
  const shape = FEED_COPY[event.type]
  const [title, note, name, tone] = shape ? shape(event) : [event.type, '', 'file', '']
  return `<div class="ap-feed-row">
    <span class="ap-feed-at">${at ? clockTime(at) : ''}</span>
    ${tile(name, tone)}
    <div><b>${esc(title)}</b><span>${esc(note)}</span></div>
    ${event.questionId ? `<a class="ap-more" href="console-question.html?id=${encodeURIComponent(event.questionId)}">Open</a>` : ''}
  </div>`
}

const setSystem = (up, note) => {
  for (const el of $$('system-pill')) {
    el.className = `ap-pill ap-pill-lg ${up ? 'ap-pill-good' : 'ap-pill-bad'}`
    el.textContent = up ? 'Gateway reachable' : 'Gateway unreachable'
  }
  for (const el of $$('gateway-state')) el.className = `ap-note ${up ? 'ap-note-good' : ''}`
  fill('gateway-title', up ? 'Reading live state' : 'Cannot reach the gateway')
  fill('gateway-note', note)
  fill('c-reachable', up ? 'Yes' : 'No')
}

const initConsole = async () => {
  if (!document.body.dataset.console) return
  fill('c-gateway', gateway)

  const refresh = async () => {
    let overview
    try {
      overview = await get('/v1/operator/overview')
    } catch {
      setSystem(false, `Nothing is reachable at ${gateway}. Start the gateway, or append ?gateway= to this page.`)
      return
    }
    setSystem(true, `${overview.network}. Figures below are live.`)

    const { counts, pipeline, treasury, performance } = overview

    fill('c-inflight', String(counts.questionsInFlight))
    fill('c-online', String(counts.workersOnline))
    fill('c-answers', String(counts.answersReceived))
    fill('c-registered', String(counts.workersRegistered))
    fill('c-answering', String(counts.workersAnswering))
    fill('c-assessing', String(counts.workersInAssessment))
    fill('c-blocked', String(counts.workersBlocked))
    fill('c-settled', String(counts.questionsSettled))
    fill('c-resolved-n', String(counts.questionsResolved))
    fill('c-refunded-n', String(counts.questionsSettled - counts.questionsResolved))
    fill('c-network', overview.network)
    fill('c-fees', overview.feesSponsored ? 'Covered by the treasury' : 'Covered. Workers only receive')

    fill('c-wages', money(treasury.wagesPaidCents))
    fill('c-refunded', money(treasury.refundedCents))
    fill('c-failed', money(treasury.failedPaymentsCents))

    fill('c-pipe-quoted', String(pipeline.quoted))
    fill('c-pipe-awaiting', String(pipeline.awaitingWorker))
    fill('c-pipe-answering', String(pipeline.beingAnswered))
    fill('c-pipe-answers', String(pipeline.answersIn))
    fill('c-pipe-settled', String(pipeline.settled))

    fill('c-latency', duration(performance.medianLatencyMs))
    fill('c-resolved', performance.resolutionRate === null ? 'No data yet' : `${Math.round(performance.resolutionRate * 100)}%`)
    fill('c-responders', performance.meanResponders === null ? 'No data yet' : performance.meanResponders.toFixed(2))

    html(
      'c-feed',
      overview.feed.length
        ? overview.feed.map((event) => feedRow(event, null)).join('')
        : empty('Nothing has happened yet.<br/>Every question, answer and payment appears here the moment it does.'),
    )

    html(
      'c-worker-list',
      overview.workers.length
        ? overview.workers
            .map(
              (worker) => `<a class="ap-row" href="console-worker.html?id=${encodeURIComponent(worker.workerId)}">
        <span class="ap-av ap-av-sm">${initials(worker.address)}</span>
        <div><b>${esc(shortAddress(worker.address))}</b><span>${worker.answered} answered · ${money(worker.earnedCents)}</span></div>
        ${pill(
          { answering: 'Answering', available: 'Available', blocked: 'Blocked', 'in-assessment': 'Assessment', offline: 'Offline' }[worker.status],
          { answering: 'accent', available: 'good', blocked: 'bad', 'in-assessment': 'warn', offline: '' }[worker.status],
        )}
      </a>`,
            )
            .join('')
        : empty('Nobody has signed in yet.'),
    )

    /*
      The capability table.

      Anything declared without a workforce is marked as unavailable rather than
      greyed out ambiguously or quietly left off. This is the one screen where an
      operator would otherwise not notice a queue that has had nobody on it all
      day, and an agent calling a capability we cannot serve has been misled by
      us rather than by its own uncertainty.
    */
    html(
      'c-capabilities',
      `<table class="ap-tbl"><thead><tr><th>Capability</th><th>Kind</th><th>Status</th><th class="ap-num">People who can serve it</th></tr></thead><tbody>${overview.capabilities
        .map(
          (capability) => `<tr>
        <td><b>${esc(capability.name)}</b><small>${esc(capability.id)}</small></td>
        <td>${esc(kindLabel(capability.kind))}</td>
        <td>${
          !capability.servable
            ? pill('Not servable yet', 'bad', 'x')
            : capability.staffed === 0
              ? pill('Declared, nobody behind it', 'warn', 'warn')
              : pill('Live', 'good', 'check')
        }</td>
        <td class="ap-num">${capability.staffed}</td>
      </tr>`,
        )
        .join('')}</tbody></table>`,
    )

    const failing = overview.workers.filter((w) => w.status === 'blocked')
    if (treasury.failedPaymentsCents > 0)
      html(
        'c-attention',
        `<div class="ap-info ap-info-bad">${icon('warn')}<div><b>${money(treasury.failedPaymentsCents)} did not settle</b><p>One or more wages failed their chain write. Somebody is owed this. Open the worker to see which question it was for.</p></div></div>`,
      )
    else if (failing.length)
      html(
        'c-attention',
        `<div class="ap-info ap-info-plain">${icon('check')}<div><b>Nothing outstanding</b><p>Every wage settled. ${failing.length} worker${failing.length === 1 ? '' : 's'} did not pass the assessment and keep what they earned.</p></div></div>`,
      )

    if ($('c-donut')) renderDonut(counts)
    await refreshWorkersTable()
    await refreshQuestions()
    await refreshTreasury()
    await refreshAnalytics()
    await refreshEscalations()
  }

  await refresh()
  initFilter('c-worker-search', 'c-workers-table')
  initFilter('c-question-search', 'c-questions-full')
  setInterval(refresh, 4000)
}

/** The roster, as a ring. Segments are counts, and the legend carries the numbers. */
const renderDonut = (counts) => {
  const total = counts.workersRegistered || 1
  const segments = [
    [counts.workersOnline, 'var(--good)'],
    [counts.workersAnswering, 'var(--accent)'],
    [counts.workersInAssessment, 'var(--warn)'],
    [counts.workersBlocked, 'var(--bad)'],
  ]
  const r = 52
  const circumference = 2 * Math.PI * r
  let offset = 0
  const arcs = segments
    .map(([value, colour]) => {
      const length = (value / total) * circumference
      const arc = `<circle cx="66" cy="66" r="${r}" fill="none" stroke="${colour}" stroke-width="16" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`
      offset += length
      return arc
    })
    .join('')
  const svg = $('c-donut')?.querySelector('svg')
  if (svg) svg.innerHTML = `<circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--border)" stroke-width="16"/>${arcs}`
}

const refreshWorkersTable = async () => {
  if (!$('c-workers-table')) return
  let body
  try {
    body = await get('/v1/operator/workers')
  } catch {
    return
  }
  html(
    'c-workers-table',
    body.workers.length
      ? `<table class="ap-tbl"><thead><tr><th>Worker</th><th>Account</th><th>Assessment</th><th class="ap-num">Answered</th><th class="ap-num">Paid to them</th><th class="ap-num">Reliability</th><th>Last seen</th><th>Status</th></tr></thead><tbody>${body.workers
          .map(
            (worker) => `<tr>
      <td><a class="ap-cell" href="console-worker.html?id=${encodeURIComponent(worker.workerId)}"><span class="ap-av ap-av-sm">${initials(worker.address)}</span><div><b>${esc(shortAddress(worker.address))}</b><small>${esc(worker.workerId.slice(0, 16))}</small></div></a></td>
      <td><span class="ap-mono">${esc(shortAddress(worker.address))}</span></td>
      <td>${
        worker.assessment === 'passed'
          ? pill('Passed', 'good', 'check')
          : worker.assessment === 'failed'
            ? pill('Failed', 'bad', 'x')
            : pill('In progress', 'warn', 'clock')
      }</td>
      <td class="ap-num">${worker.answered}</td>
      <td class="ap-num">${money(worker.earnedCents)}</td>
      <td class="ap-num">${worker.reliability === null ? '<span style="color:var(--ink-4)">no record yet</span>' : worker.reliability.toFixed(3)}</td>
      <td>${esc(ago(worker.lastSeenAt))}</td>
      <td>${pill(
        { answering: 'Answering', available: 'Available', blocked: 'Blocked', 'in-assessment': 'Assessment', offline: 'Offline' }[worker.status],
        { answering: 'accent', available: 'good', blocked: 'bad', 'in-assessment': 'warn', offline: '' }[worker.status],
      )}</td>
    </tr>`,
          )
          .join('')}</tbody></table>`
      : empty('Nobody has signed in yet.<br/>A worker appears here the moment their passkey makes an account.'),
  )
}

const refreshQuestions = async () => {
  if (!$('c-questions') && !$('c-questions-full')) return
  let body
  try {
    body = await get('/v1/operator/questions')
  } catch {
    return
  }

  const liveRows = body.live.map(
    (question) => `<tr>
      <td><a href="console-question.html?id=${encodeURIComponent(question.questionId)}"><b>${esc((question.prompt ?? '').slice(0, 56))}${(question.prompt ?? '').length > 56 ? '…' : ''}</b><small class="ap-mono">${esc(question.questionId.slice(0, 14))}</small></a></td>
      <td>${esc(kindLabel(question.kind))}</td>
      <td>${pill(
        { 'awaiting-worker': 'Waiting for a person', 'being-answered': 'Being answered', 'answers-in': 'Deciding' }[question.status],
        { 'awaiting-worker': 'warn', 'being-answered': 'accent', 'answers-in': 'good' }[question.status],
      )}</td>
      <td class="ap-num">${question.answers} / ${question.assigned}</td>
      <td class="ap-num">${money(question.priceCents)}</td>
      <td>${esc(ago(question.startedAt))}</td>
    </tr>`,
  )

  const settledRows = body.settled.map(
    (question) => `<tr>
      <td><a href="console-question.html?id=${encodeURIComponent(question.questionId)}"><b class="ap-mono">${esc(question.questionId.slice(0, 18))}</b><small>${esc(question.agreement)}</small></a></td>
      <td>Not settled</td>
      <td>${
        question.status === 'resolved'
          ? pill('Resolved', 'good', 'check')
          : pill(question.status.replace('_', ' '), 'warn', 'warn')
      }</td>
      <td class="ap-num">${question.responders}</td>
      <td class="ap-num">${question.confidence.toFixed(3)}</td>
      <td>${esc(ago(question.resolvedAt))}</td>
    </tr>`,
  )

  const rows = [...liveRows, ...settledRows]
  const table = rows.length
    ? `<table class="ap-tbl"><thead><tr><th>Question</th><th>Kind</th><th>Outcome</th><th class="ap-num">People</th><th class="ap-num">Price / confidence</th><th>When</th></tr></thead><tbody>${rows.join('')}</tbody></table>`
    : empty('No questions yet.<br/>One appears here the moment an agent asks something.')

  html('c-questions', rows.length ? `<table class="ap-tbl"><tbody>${rows.slice(0, 6).join('')}</tbody></table>` : empty('No questions yet.'))
  html('c-questions-full', table)
}

/* ------------------------------------------------------ console: treasury -- */

/*
  Wages, across every worker.

  Assembled from each worker's ledger rather than from a treasury log, because
  the ledger rows are the ones that carry a transaction hash — and a payments
  screen whose rows cannot be opened and checked is only our own assertion about
  our own spending.
*/
const refreshTreasury = async () => {
  if (!$('c-payments-table')) return
  let roster
  try {
    roster = await get('/v1/operator/workers')
  } catch {
    return
  }

  const details = await Promise.all(
    roster.workers
      .filter((w) => w.payments > 0)
      .map((w) => get(`/v1/operator/workers/${encodeURIComponent(w.workerId)}`).catch(() => null)),
  )

  const paid = details.filter(Boolean)
  const rows = paid
    .flatMap((worker) => worker.payments.map((payment) => ({ ...payment, worker })))
    .sort((a, b) => b.at - a.at)

  fill('c-paid-workers', String(paid.length))

  html(
    'c-payments-table',
    rows.length
      ? `<table class="ap-tbl"><thead><tr><th>When</th><th>Worker</th><th>For</th><th class="ap-num">Amount</th><th>Status</th><th>Record</th></tr></thead><tbody>${rows
          .map(
            (payment) => `<tr>
      <td>${esc(ago(payment.at))}</td>
      <td><a class="ap-cell" href="console-worker.html?id=${encodeURIComponent(payment.worker.workerId)}"><span class="ap-av ap-av-sm">${initials(payment.worker.address)}</span><b>${esc(shortAddress(payment.worker.address))}</b></a></td>
      <td>${esc(kindLabel(payment.kind))}</td>
      <td class="ap-num">${money(payment.amountCents)}</td>
      <td>${paymentPill(payment.status)}</td>
      <td>${payment.explorerUrl ? `<a class="ap-more" href="${esc(payment.explorerUrl)}" target="_blank" rel="noopener">${shortHash(payment.txHash)} ${icon('out')}</a>` : '<span style="color:var(--ink-4)">No record</span>'}</td>
    </tr>`,
          )
          .join('')}</tbody></table>`
      : empty('No wages yet.<br/>Every payment appears here with the transaction that proves it.'),
  )

  /*
    Anything that did not settle is listed by worker and by amount, never merely
    counted. Somebody is owed it, and a total on its own is not something an
    operator can act on.
  */
  const failed = rows.filter((p) => p.status === 'failed')
  if (failed.length)
    html(
      'c-attention',
      `<div class="ap-info ap-info-bad">${icon('warn')}<div><b>${failed.length} wage${failed.length === 1 ? '' : 's'} did not settle</b><p>${failed
        .map((p) => `${shortAddress(p.worker.address)} is owed ${money(p.amountCents)}`)
        .join('. ')}. These are retried. If one keeps failing, a transfer policy on the recipient is the usual cause.</p></div></div>`,
    )
}

/* ----------------------------------------------------- console: analytics -- */

/*
  Outcomes.

  Refused, timed out and no-consensus are kept apart rather than rolled into one
  "failed" bar. They mean three different things — we would not take it, nobody
  was there, and two careful people disagreed — and only the last is one the
  caller learned something from.
*/
const OUTCOMES = [
  ['resolved', 'Resolved', 'var(--good)', 'An answer cleared the bar and was returned'],
  ['no_consensus', 'No consensus', 'var(--warn)', 'People answered and did not converge. Refunded'],
  ['timeout', 'Nobody answered', 'var(--ink-4)', 'No worker took it in time. Refunded'],
  ['refused', 'Refused', 'var(--bad)', 'Not servable, so refunded before any work'],
]

const refreshAnalytics = async () => {
  if (!$('c-outcomes')) return
  let body
  try {
    body = await get('/v1/operator/questions')
  } catch {
    return
  }

  const settled = body.settled
  if (!settled.length) {
    html('c-outcomes', empty('No questions have settled yet.'))
    html('c-by-kind', empty('Nothing to break down yet.'))
    return
  }

  html(
    'c-outcomes',
    `<ul class="ap-legend">${OUTCOMES.map(([key, label, colour, note]) => {
      const n = settled.filter((q) => q.status === key).length
      return `<li style="align-items:flex-start"><i style="background:${colour};margin-top:5px"></i><div style="flex:1"><span>${label}</span><em style="display:block">${note}</em></div><b>${n}</b></li>`
    }).join('')}</ul>
    <p style="margin:16px 0 0;font-size:11.5px;color:var(--ink-4)">${settled.length} settled question${settled.length === 1 ? '' : 's'} since this gateway started.</p>`,
  )

  html(
    'c-by-kind',
    `<table class="ap-tbl"><thead><tr><th>Question</th><th>Outcome</th><th class="ap-num">People</th><th class="ap-num">Confidence</th><th class="ap-num">Wages</th></tr></thead><tbody>${[...settled]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 12)
      .map(
        (q) => `<tr>
      <td><a class="ap-mono" href="console-question.html?id=${encodeURIComponent(q.questionId)}">${esc(q.questionId.slice(0, 20))}</a></td>
      <td>${q.status === 'resolved' ? pill('Resolved', 'good', 'check') : pill(q.status.replace('_', ' '), 'warn', 'warn')}</td>
      <td class="ap-num">${q.responders}</td>
      <td class="ap-num">${q.confidence.toFixed(3)}</td>
      <td class="ap-num">${money(q.wagesCents)}</td>
    </tr>`,
      )
      .join('')}</tbody></table>`,
  )
}

/* -------------------------------------------------------------- filtering -- */

/*
  The search box the comps draw over each table.

  It filters what is already on screen rather than asking the gateway, which
  keeps it instant and means a dropped connection does not make the filter stop
  working. When a filter empties a table it says so, rather than leaving a
  header sitting over nothing.
*/
const initFilter = (inputKey, tableKey) => {
  const input = $(inputKey)
  const scope = $(tableKey)
  if (!input || !scope) return

  input.addEventListener('input', () => {
    const needle = input.value.trim().toLowerCase()
    const rows = [...scope.querySelectorAll('tbody tr')]
    let shown = 0
    for (const tr of rows) {
      const match = !needle || tr.textContent.toLowerCase().includes(needle)
      tr.hidden = !match
      if (match) shown += 1
    }

    let note = scope.querySelector('[data-filter-note]')
    if (!note) {
      note = document.createElement('p')
      note.className = 'ap-empty'
      note.setAttribute('data-filter-note', '')
      scope.append(note)
    }
    note.hidden = shown > 0 || rows.length === 0
    note.textContent = `Nothing here matches "${input.value.trim()}".`
  })
}

/* --------------------------------------------------- console: escalations -- */

const ESCALATION_STATE = {
  queued: ['Waiting for somebody', 'warn'],
  assigned: ['Somebody is holding it', 'accent'],
  in_progress: ['Being worked on', 'accent'],
  completed: ['Completed', 'good'],
  failed: ['Failed', 'bad'],
  cancelled: ['Cancelled', ''],
  expired: ['Expired', 'warn'],
}

const refreshEscalations = async () => {
  if (!$('c-escalations')) return
  let body
  try {
    body = await get('/v1/operator/escalations')
  } catch {
    return
  }

  html(
    'c-escalations',
    body.escalations.length
      ? `<table class="ap-tbl"><thead><tr><th>Task</th><th>Capability</th><th>State</th><th class="ap-num">Holding it</th><th class="ap-num">Price</th><th class="ap-num">Wages</th><th>Started</th></tr></thead><tbody>${body.escalations
          .map((e) => {
            const [label, tone] = ESCALATION_STATE[e.state] ?? [e.state, '']
            return `<tr>
      <td><b>${esc((e.task ?? '').slice(0, 52))}${(e.task ?? '').length > 52 ? '…' : ''}</b><small class="ap-mono">${esc(e.id.slice(0, 16))}</small></td>
      <td>${esc(e.capabilityId)}${e.location ? `<small>${esc(e.location)}</small>` : ''}</td>
      <td>${pill(label, tone)}</td>
      <td class="ap-num">${e.workerIds.length}</td>
      <td class="ap-num">${money(e.priceCents)}</td>
      <td class="ap-num">${money(e.wagesCents)}</td>
      <td>${esc(ago(e.createdAt))}</td>
    </tr>`
          })
          .join('')}</tbody></table>`
      : empty('Nothing in the queue.<br/>The two field capabilities below cannot be served yet, so an escalation only appears here once one of them has a workforce.'),
  )

  /*
    The catalog, with the refusal stated.

    "Declared, cannot be served" is the honest line: the capability is published
    so an agent can discover the shape of it, and the gateway turns the request
    down rather than accepting work nobody can do.
  */
  html(
    'c-field-capabilities',
    `<table class="ap-tbl"><thead><tr><th>Capability</th><th>Status</th><th>Needs a location</th></tr></thead><tbody>${body.fieldCapabilities
      .map(
        (capability) => `<tr>
      <td><b>${esc(capability.name)}</b><small class="ap-mono">${esc(capability.id)}</small></td>
      <td>${capability.servable ? pill('Live', 'good', 'check') : pill('Declared, cannot be served', 'bad', 'x')}</td>
      <td>${capability.requiresLocation ? 'Yes' : 'No'}</td>
    </tr>`,
      )
      .join('')}</tbody></table>`,
  )
}

/* --------------------------------------------------- console: one question -- */

/*
  The audit trail for one question.

  The screen the whole quality claim rests on, so it renders the mechanism
  rather than a summary: each answer in order, the reliability behind it, where
  confidence landed, whether that cleared the bar, and the transaction for every
  wage. Confidence is printed to three places because the difference between
  0.926 and 0.990 is the difference between buying a second opinion and not.
*/
const initQuestionDetail = async () => {
  if (document.body.dataset.console !== 'question') return
  const id = new URL(location.href).searchParams.get('id')
  if (!id) {
    html('q-answers', empty('No question was named. Open one from the questions list.'))
    return
  }

  const render = async () => {
    let body
    try {
      body = await get(`/v1/operator/questions/${encodeURIComponent(id)}`)
    } catch {
      html('q-answers', empty('That question is not in the gateway’s memory. Questions are short-lived and are dropped once a caller has taken the answer.'))
      return
    }

    fill('q-id', id)
    const question = body.question
    const resolution = body.resolution

    if (question) {
      fill('q-prompt', question.prompt)
      fill('q-kind', kindLabel(question.kind))
      fill('q-price', money(question.priceCents))
      fill('q-meta', `Arrived ${ago(question.startedAt)}`)
      html('q-tags', `${pill(kindLabel(question.kind), 'accent')} ${pill(question.schema?.kind ?? 'choice')}`)
      if (question.attachments?.length)
        html(
          'q-evidence',
          `<section class="ap-card"><div class="ap-card-head"><h2 class="ap-h2">Evidence the worker saw</h2></div><div class="ap-pad" style="padding-top:0">${question.attachments
            .map((a) =>
              a.type === 'image'
                ? `<img class="ap-evidence" src="${esc(a.url)}" alt="${esc(a.caption ?? 'Evidence')}"/>`
                : `<pre class="ap-mono" style="white-space:pre-wrap;margin:0">${esc(a.type === 'json' ? JSON.stringify(a.body, null, 2) : a.body)}</pre>`,
            )
            .join('')}</div></section>`,
        )
    }

    for (const el of $$('q-status')) {
      el.innerHTML = resolution
        ? resolution.status === 'resolved'
          ? pill('Resolved', 'good', 'check')
          : pill(resolution.status.replace('_', ' '), 'warn', 'warn')
        : pill('In flight', 'accent', 'clock')
    }

    const answers = resolution?.evidence ?? body.live?.answers ?? []
    html(
      'q-answers',
      answers.length
        ? answers
            .map(
              (answer, index) => `<div class="ap-row" style="align-items:flex-start;padding:16px 20px">
        <span class="ap-av ap-av-sm">${initials(answer.workerId)}</span>
        <div>
          <b>${esc(shortAddress(answer.workerId))}</b>
          <span>Asked ${index === 0 ? 'first' : index === 1 ? 'second' : `${index + 1}th`} · reliability ${(answer.reputation ?? answer.reliability ?? 0).toFixed(3)}${
            answer.selfConfidence !== undefined ? ` · said they were ${Math.round(answer.selfConfidence * 100)}% sure` : ''
          }</span>
          <div style="margin-top:10px;padding:12px 14px;border-radius:var(--r-md);background:var(--ground-2);font-size:14px;font-weight:600;color:var(--ink)">${esc(String(answer.value))}</div>
        </div>
      </div>`,
            )
            .join('')
        : empty('Nobody has answered yet.'),
    )

    if (resolution) {
      fill('q-latency', duration(resolution.latencyMs))
      fill('q-wages', money(resolution.wagesCents))
      fill('q-refund', resolution.refund ? money(resolution.refund.amountCents) : 'Not refunded')

      /*
        The outcome.

        An unresolved question renders as unresolved. The best guess we happened
        to hold is never drawn as though it were an answer — that is the exact
        failure this product exists to stop, and it does not get to happen on our
        own screen either.
      */
      const cleared = resolution.status === 'resolved'
      html(
        'q-outcome',
        `<div style="margin-bottom:14px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:12.5px;color:var(--ink-3)">Confidence reached</span>
            <b style="font-size:18px;font-weight:700;font-variant-numeric:tabular-nums">${resolution.confidence.toFixed(3)}</b>
          </div>
          <div class="ap-meter${cleared ? '' : ' ap-meter-short'}"><i style="width:${Math.min(100, resolution.confidence * 100).toFixed(1)}%"></i></div>
        </div>
        ${
          cleared
            ? `<div class="ap-info ap-info-good">${icon('check')}<div><b>The caller was given: ${esc(String(resolution.value))}</b><p>${resolution.responders} ${resolution.responders === 1 ? 'person' : 'people'} answered, ${esc(resolution.agreement)}. Confidence cleared the bar for what this caller paid, so the answer was returned and they were charged.</p></div></div>`
            : `<div class="ap-info ap-info-warn">${icon('warn')}<div><b>No answer was returned</b><p>${resolution.responders} answered but confidence never cleared the bar, so the caller was told we could not resolve it and was refunded in full. The workers were paid regardless — a question we cannot answer is a loss we absorb, not one we push onto the people who did the work.</p></div></div>`
        }`,
      )

      html(
        'q-receipts',
        resolution.receipts.length
          ? `<span style="display:block;font-size:11.5px;color:var(--ink-4);margin-bottom:8px">Every wage, with its record</span>${resolution.receipts
              .map(
                (receipt) =>
                  `<a class="ap-more" style="display:flex;justify-content:space-between;padding:7px 0" href="${esc(receipt.explorerUrl)}" target="_blank" rel="noopener"><span class="ap-mono">${esc(shortAddress(receipt.workerId))} · ${money(receipt.amountCents)}</span><span>${shortHash(receipt.txHash)} ${icon('out')}</span></a>`,
              )
              .join('')}`
          : '',
      )
    }

    const trail = body.trail ?? []
    html(
      'q-trail',
      trail.length
        ? trail
            .map((event) => {
              const shape = FEED_COPY[event.type]
              const [title, note] = shape ? shape(event) : [event.type, '']
              const state = event.type === 'question.settled' && event.status !== 'resolved' ? 'bad' : 'done'
              return `<li data-state="${state}"><b>${esc(title)}</b><span>${esc(note)}</span></li>`
            })
            .join('')
        : '<li data-state="open"><b>Nothing recorded for this question</b><span>The event log holds the most recent activity only.</span></li>',
    )
  }

  await render()
  setInterval(render, 4000)
}

/* ----------------------------------------------------- console: one worker -- */

const initWorkerDetail = async () => {
  if (document.body.dataset.console !== 'worker') return
  const id = new URL(location.href).searchParams.get('id')
  if (!id) return

  const render = async () => {
    let worker
    try {
      worker = await get(`/v1/operator/workers/${encodeURIComponent(id)}`)
    } catch {
      html('w-payments', empty('No such worker on this gateway.'))
      return
    }

    fill('w-id', shortAddress(worker.address))
    fill('w-initials', initials(worker.address))
    fill('w-answered', String(worker.answered))
    fill('w-earned', money(worker.earnedCents))
    fill('w-balance', 'Not read')
    fill('w-reliability', worker.reliability === null ? 'No record yet' : worker.reliability.toFixed(3))
    fill('w-toofast', String(worker.tooFastCount))
    fill('w-lastseen', ago(worker.lastSeenAt))
    fill('w-assessment', worker.assessment === 'passed' ? 'Passed' : worker.assessment === 'failed' ? 'Did not pass' : 'In progress')

    for (const el of $$('w-address')) {
      el.textContent = worker.address
      el.dataset.full = worker.address
    }

    for (const el of $$('w-status')) {
      el.innerHTML = pill(
        { answering: 'Answering', available: 'Available', blocked: 'Blocked', 'in-assessment': 'In assessment', offline: 'Offline' }[worker.status],
        { answering: 'accent', available: 'good', blocked: 'bad', 'in-assessment': 'warn', offline: '' }[worker.status],
      )
    }

    html(
      'w-payments',
      worker.payments.length
        ? `<table class="ap-tbl"><thead><tr><th>When</th><th>For</th><th class="ap-num">Amount</th><th>Status</th><th>Record</th></tr></thead><tbody>${worker.payments
            .map(
              (payment) => `<tr>
        <td>${esc(ago(payment.at))}</td>
        <td><b>${esc(kindLabel(payment.kind))}</b><small>${esc((payment.label ?? '').slice(0, 44))}</small></td>
        <td class="ap-num">${money(payment.amountCents)}</td>
        <td>${paymentPill(payment.status)}</td>
        <td>${payment.explorerUrl ? `<a class="ap-more" href="${esc(payment.explorerUrl)}" target="_blank" rel="noopener">${shortHash(payment.txHash)} ${icon('out')}</a>` : '<span style="color:var(--ink-4)">No record</span>'}</td>
      </tr>`,
            )
            .join('')}</tbody></table>`
        : empty('No payments yet.'),
    )

    /*
      Standing, by kind.

      All five, never averaged into one. Someone can be excellent at telling two
      readings apart and unremarkable at matching records, and a single number
      would hide exactly the thing the router reads.
    */
    html(
      'w-reputation',
      worker.reputation
        .map(
          (entry) => `<div style="margin-bottom:16px">
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:6px">
          <span style="font-size:13px;color:var(--ink-2)">${esc(kindLabel(entry.kind))}</span>
          <b style="font-size:13px;font-variant-numeric:tabular-nums">${entry.score.toFixed(3)}</b>
        </div>
        <div class="ap-meter${entry.score < 0.9 ? ' ap-meter-short' : ''}"><i style="width:${(entry.score * 100).toFixed(1)}%"></i></div>
        <span style="display:block;margin-top:5px;font-size:11.5px;color:var(--ink-4)">${entry.agreements} agreed · ${entry.disagreements} disagreed · ${entry.ambiguous} unresolved</span>
      </div>`,
        )
        .join(''),
    )

    html(
      'w-trail',
      worker.events.length
        ? worker.events
            .map((event) => {
              const shape = FEED_COPY[event.type]
              const [title, note] = shape ? shape(event) : [event.type, '']
              return `<li data-state="done"><b>${esc(title)}</b><span>${esc(note)}</span></li>`
            })
            .join('')
        : '<li data-state="open"><b>Nothing recorded yet</b><span>Their activity appears here as it happens.</span></li>',
    )
  }

  await render()
  setInterval(render, 5000)
}

/* ----------------------------------------------------------------- export -- */

/*
  Taking the account details away with you.

  The point of this button is that it works when we do not. The account is on
  Tempo and belongs to the person holding the passkey, so what they need in
  order to reach it without Quorum is the address, the network and where to look
  it up. That is what this writes out.

  It deliberately does not offer to export a private key, and not because we are
  withholding one: there is no key here to give. The account is controlled by
  the passkey on their device, which is what makes it unphishable and is also
  why it cannot be copied into a text file. The note in the download says so,
  rather than leaving somebody hunting for a key that does not exist.
*/
const initExport = () => {
  const buttons = $$('export')
  if (!buttons.length) return

  for (const button of buttons) {
    button.addEventListener('click', async () => {
      const current = session()
      if (!current) return

      let me = null
      try {
        me = await get(`/v1/worker/me?workerId=${encodeURIComponent(current.workerId)}`)
      } catch {
        // Offline is fine: the address is the part that matters and we have it.
      }

      const address = me?.address ?? current.address
      const lines = [
        'Your Quorum account',
        '',
        `Account address   ${address}`,
        `Network           ${me?.network ?? 'Tempo'}`,
        `Saved             ${new Date().toISOString()}`,
        '',
        'This account is yours. Quorum cannot move, hold or freeze what is in it,',
        'and does not need to be running for you to reach it.',
        '',
        'It is controlled by the passkey on your device, so there is no private key',
        'or seed phrase to write down here. Keep the passkey and you keep the',
        'account. Your device can add the same passkey to another phone or computer',
        'if you want a second way in.',
        '',
        'Every payment into this account is public and can be looked up by anyone,',
        'including you, at any time:',
        me?.payments?.[0]?.explorerUrl
          ? `  ${me.payments[0].explorerUrl.split('/tx/')[0]}/address/${address}`
          : `  search for ${address} on the Tempo explorer`,
      ]

      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `quorum-account-${address.slice(0, 10)}.txt`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      const was = button.innerHTML
      button.innerHTML = `${icon('check')} Saved`
      setTimeout(() => {
        button.innerHTML = was
      }, 2000)
    })
  }
}

/* ------------------------------------------------------------------- rail -- */

const initRail = () => {
  const root = document.documentElement
  const sync = () => {
    const collapsed = root.getAttribute('data-rail') === 'collapsed'
    for (const button of document.querySelectorAll('[data-rail-toggle]')) {
      button.setAttribute('aria-expanded', String(!collapsed))
      button.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation')
    }
  }
  for (const button of document.querySelectorAll('[data-rail-toggle]'))
    button.addEventListener('click', () => {
      const collapse = root.getAttribute('data-rail') !== 'collapsed'
      if (collapse) root.setAttribute('data-rail', 'collapsed')
      else root.removeAttribute('data-rail')
      try {
        localStorage.setItem('quorum-rail', collapse ? 'collapsed' : 'open')
      } catch {
        /* Not remembered, but still applies to this page. */
      }
      sync()
    })
  sync()
}

/* -------------------------------------------------------- back to work -- */

/*
  After an answer, straight back to Work.

  Work only reaches someone whose app is listening for it. Left on the "Answer
  sent" screen, a worker stops listening, the gateway counts them as gone within
  half a minute, and the next question goes elsewhere or nowhere. So these two
  screens say their piece and then return to Work on their own. No countdown is
  shown: this is a pause to read, not a clock to beat.
*/
const initReturnToWork = () => {
  if (!document.body.hasAttribute('data-return-to-work')) return
  setTimeout(() => {
    location.href = 'app-question.html'
  }, 4000)
}

/* ---------------------------------------------------------- operator gate -- */

/*
  The console is the operator's alone. Its reads carry the gateway's
  QUORUM_OPERATOR_TOKEN, typed once here and kept in this browser; without it
  every console page shows this and nothing else.
*/
let gateShown = false
const showOperatorGate = () => {
  if (gateShown || !document.querySelector('.ap-side .ap-side-label')) return
  gateShown = true
  const gate = document.createElement('div')
  gate.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;padding:16px;background:var(--ground)'
  gate.innerHTML = `<section class="ap-card" style="width:100%;max-width:400px"><div class="ap-pad">
    <h2 class="ap-h3" style="margin:0 0 6px">Operator console</h2>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:var(--ink-3)">Enter the operator token to continue. It is kept in this browser only.</p>
    <form><div class="ap-field"><input type="password" autocomplete="current-password" placeholder="Operator token" aria-label="Operator token" required/></div>
    <button class="ap-primary" type="submit" style="margin-top:14px">Open the console</button></form>
    <p class="ap-info ap-info-bad" style="margin-top:14px" hidden>That token was not accepted.</p>
  </div></section>`
  document.body.append(gate)
  const input = gate.querySelector('input')
  if (operatorToken()) gate.querySelector('.ap-info').hidden = false
  gate.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault()
    try {
      localStorage.setItem('quorum-operator-token', input.value.trim())
    } catch {}
    location.reload()
  })
  input.focus()
}

const initOperatorGate = async () => {
  if (!document.querySelector('.ap-side .ap-side-label')) return
  if (!operatorToken()) return showOperatorGate()
  try {
    const response = await fetch(`${gateway}/v1/operator/overview`, { headers: { authorization: `Bearer ${operatorToken()}` } })
    if (response.status === 401) return showOperatorGate()
  } catch {
    /* Gateway unreachable: the console says so itself, and shows no data. */
  }
  document.documentElement.setAttribute('data-operator', 'ok')
}

/* ------------------------------------------------------- console waitlist -- */

const KIND_NAMES = { disambiguate: 'Readings', verify: 'Real or fake', match: 'Matching', categorise: 'Categorising', compare: 'Comparing' }

const initWaitlistConsole = () => {
  const table = $('c-waitlist')
  if (!table) return
  const admit = $('wl-admit')
  const result = $('wl-admit-result')
  const token = operatorToken()

  const call = async (method, path, body) => {
    const response = await fetch(`${gateway}/v1/admin/waitlist${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const parsed = await response.json().catch(() => ({}))
    if (response.status === 401) showOperatorGate()
    if (!response.ok) throw new Error(response.status === 401 ? 'That token was not accepted.' : response.status === 404 ? 'The gateway has no operator token set, so the waitlist is switched off.' : parsed.error ?? String(response.status))
    return parsed
  }

  const status = (e) => {
    if (e.worker) {
      if (e.worker.passed.length) return pill(`Passed ${e.worker.passed.map((k) => KIND_NAMES[k] ?? k).join(', ')}`, 'good')
      if (e.worker.failed.length) return pill('Did not pass', 'warn')
      return pill('Signed in', 'accent')
    }
    return e.invitedAt ? pill('Invited') : pill('Waiting')
  }

  const selected = () => [...table.querySelectorAll('input[data-wl-email]:checked')].map((box) => box.dataset.wlEmail)
  const sync = () => {
    admit.disabled = selected().length === 0
    admit.textContent = selected().length ? `Admit ${selected().length}` : 'Admit selected'
  }

  const load = async () => {
    let body
    try {
      body = await call('GET', '')
    } catch (error) {
      table.innerHTML = empty(esc(String(error.message ?? error)))
      return
    }
    const waiting = body.entries.filter((e) => !e.invitedAt).length
    table.innerHTML = body.entries.length
      ? `<p class="ap-sub" style="margin:0 20px 12px;font-size:12.5px">${body.entries.length} on the list, ${waiting} waiting. Sign-up is ${body.inviteOnly ? '<b>invite-only</b>' : '<b>open to anyone</b> (set QUORUM_INVITE_ONLY=true to require invites)'}.</p>
      <table class="ap-tbl"><thead><tr><th><input type="checkbox" data-wl-all aria-label="Select everyone waiting"/></th><th>Email</th><th>Wants</th><th>Joined</th><th>Status</th></tr></thead><tbody>${body.entries
          .map(
            (e) => `<tr>
      <td><input type="checkbox" data-wl-email="${esc(e.email)}" aria-label="Select ${esc(e.email)}"/></td>
      <td><b>${esc(e.email)}</b>${e.note ? `<small>${esc(e.note)}</small>` : ''}</td>
      <td>${e.kinds.length ? esc(e.kinds.map((k) => KIND_NAMES[k] ?? k).join(', ')) : '<small>Anything</small>'}</td>
      <td>${esc(ago(e.joinedAt))}</td>
      <td>${status(e)}</td>
    </tr>`,
          )
          .join('')}</tbody></table>`
      : empty('Nobody on the waitlist yet.<br/>The For workers page and the worker app both point to the sign-up.')
    table.querySelector('[data-wl-all]')?.addEventListener('change', (event) => {
      for (const box of table.querySelectorAll('input[data-wl-email]')) {
        const entry = body.entries.find((e) => e.email === box.dataset.wlEmail)
        box.checked = event.target.checked && !entry?.invitedAt
      }
      sync()
    })
    table.addEventListener('change', sync)
    sync()
  }


  admit.addEventListener('click', async () => {
    const emails = selected()
    if (!emails.length) return
    admit.disabled = true
    result.hidden = false
    result.className = 'ap-info'
    result.textContent = `Sending ${emails.length} invite${emails.length === 1 ? '' : 's'}…`
    try {
      const { results } = await call('POST', '/admit', { emails })
      const failed = results.filter((r) => !r.sent)
      result.className = failed.length ? 'ap-info ap-info-bad' : 'ap-info'
      result.textContent = failed.length
        ? `${results.length - failed.length} sent. Not sent: ${failed.map((f) => `${f.email} (${f.error})`).join('; ')}`
        : `${results.length} invite${results.length === 1 ? '' : 's'} sent.`
    } catch (error) {
      result.className = 'ap-info ap-info-bad'
      result.textContent = String(error.message ?? error)
    }
    await load()
  })

  if (token) void load()
}

/* --------------------------------------------------------- send questions -- */

const STATUS_PILL = { 'in flight': ['In flight', 'accent'], resolved: ['Resolved', 'good'], no_consensus: ['No consensus', 'warn'], timeout: ['Nobody answered', 'warn'], refused: ['Refused', 'warn'], failed: ['Failed', 'warn'] }

const initSendConsole = () => {
  const start = $('ss-start')
  if (!start) return
  const stop = $('ss-stop')
  const result = $('q-result')

  const call = async (method, path, body) => {
    const response = await fetch(`${gateway}/v1/admin/questions${path}`, {
      method,
      headers: { authorization: `Bearer ${operatorToken()}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const parsed = await response.json().catch(() => ({}))
    if (response.status === 401) showOperatorGate()
    if (!response.ok) throw new Error(parsed.issues?.join('; ') ?? parsed.error ?? String(response.status))
    return parsed
  }

  for (const chip of document.querySelectorAll('[data-ss-kind]'))
    chip.addEventListener('click', () => chip.setAttribute('aria-pressed', String(chip.getAttribute('aria-pressed') !== 'true')))

  const type = $('q-type')
  type.addEventListener('change', () => {
    $('q-options-row').hidden = type.value !== 'enum'
  })

  const refresh = async () => {
    let body
    try {
      body = await call('GET', '')
    } catch {
      return
    }
    const s = body.session
    start.hidden = s.running
    stop.hidden = !s.running
    $('ss-state').innerHTML = s.running ? pill(`Running · ${s.sent} sent · ends ${new Date(s.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, 'good') : pill('Not running')
    $('ss-online').innerHTML = body.online
      .map((o) => `<div class="ap-row"><div><b>${esc(KIND_NAMES[o.kind] ?? o.kind)}</b><span>${o.workers ? `${o.workers} online who passed it` : 'Nobody online who passed it'}</span></div><span class="ap-row-val">${o.workers}</span></div>`)
      .join('')
    $('ss-sent').innerHTML = body.sent.length
      ? `<table class="ap-tbl"><thead><tr><th>Question</th><th>Status</th><th>Answer</th><th>Sent</th></tr></thead><tbody>${body.sent
          .slice(0, 30)
          .map((q) => {
            const [label, tone] = STATUS_PILL[q.status] ?? [q.status, '']
            return `<tr><td><a href="console-question.html?id=${encodeURIComponent(q.id)}"><b>${esc(q.prompt.slice(0, 60))}${q.prompt.length > 60 ? '…' : ''}</b></a><small>${esc(KIND_NAMES[q.kind] ?? q.kind)} · ${q.source === 'session' ? 'session' : 'written'}</small></td><td>${pill(label, tone)}</td><td>${q.answer === null ? '' : esc(String(q.answer))}</td><td>${esc(ago(q.at))}</td></tr>`
          })
          .join('')}</tbody></table>`
      : empty('Nothing sent yet.')
  }

  start.addEventListener('click', async () => {
    const kinds = [...document.querySelectorAll('[data-ss-kind][aria-pressed="true"]')].map((c) => c.dataset.ssKind)
    start.disabled = true
    try {
      await call('POST', '/session', { minutes: Number($('ss-minutes').value), every_seconds: Number($('ss-every').value), kinds })
    } catch (error) {
      alert(`The session did not start: ${error.message}`)
    }
    start.disabled = false
    void refresh()
  })
  stop.addEventListener('click', async () => {
    await call('POST', '/session/stop').catch(() => {})
    void refresh()
  })

  const readImage = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('could not read that image'))
      reader.readAsDataURL(file)
    })

  $('q-send').addEventListener('click', async () => {
    const send = $('q-send')
    result.hidden = false
    result.className = 'ap-info'
    const question = $('q-text').value.trim()
    if (question.length < 3) {
      result.className = 'ap-info ap-info-bad'
      result.textContent = 'Write the question first.'
      return
    }
    const options = $('q-options').value.split(',').map((o) => o.trim()).filter(Boolean)
    if (type.value === 'enum' && options.length < 2) {
      result.className = 'ap-info ap-info-bad'
      result.textContent = 'Give at least two options, separated by commas.'
      return
    }
    send.disabled = true
    try {
      const file = $('q-image').files?.[0]
      const context = {
        ...($('q-context').value.trim() ? { text: $('q-context').value.trim() } : {}),
        ...(file ? { image_base64: await readImage(file) } : {}),
      }
      const body = await call('POST', '/ask', {
        kind: $('q-kind').value,
        question,
        answer_schema: type.value === 'enum' ? { type: 'enum', options } : { type: 'boolean' },
        ...(Object.keys(context).length ? { context } : {}),
        deadline_ms: Math.round(Number($('q-deadline').value) * 60_000),
      })
      result.textContent = body.workersOnline
        ? `Sent. ${body.workersOnline} ${body.workersOnline === 1 ? 'person' : 'people'} who passed this skill ${body.workersOnline === 1 ? 'is' : 'are'} online.`
        : 'Sent. Nobody who passed this skill is online right now, so it will wait for someone until the time runs out.'
      $('q-text').value = ''
      $('q-context').value = ''
      $('q-image').value = ''
    } catch (error) {
      result.className = 'ap-info ap-info-bad'
      result.textContent = `Not sent: ${error.message}`
    }
    send.disabled = false
    void refresh()
  })

  void refresh()
  setInterval(refresh, 5000)
}

/* ----------------------------------------------------------------- invite -- */

/*
  Invite codes and the waitlist.

  An invite link is the sign-in page with ?invite=CODE. The code is kept here
  until there is a signed-in worker to redeem it for, so it survives the passkey
  ceremony and a Tempo Wallet pop-up alike.
*/
const INVITE_KEY = 'quorum-invite'
const pendingInvite = () => {
  try {
    return localStorage.getItem(INVITE_KEY)
  } catch {
    return null
  }
}
const keepInvite = (code) => {
  try {
    if (code) localStorage.setItem(INVITE_KEY, code.trim().toUpperCase())
    else localStorage.removeItem(INVITE_KEY)
  } catch {
    /* Kept for this page only. */
  }
}
const fromLink = new URL(location.href).searchParams.get('invite')
if (fromLink) keepInvite(fromLink)

/** Redeems a kept invite for a signed-in worker. Returns their standing afterwards. */
const redeemInvite = async (signed, code = pendingInvite()) => {
  if (signed.assessment !== 'invite' || !code) return signed.assessment
  await post('/v1/worker/redeem', { workerId: signed.workerId, code })
  keepInvite(null)
  const me = await get(`/v1/worker/me?workerId=${encodeURIComponent(signed.workerId)}`)
  remember({ ...signed, assessment: me.assessment })
  return me.assessment
}

const initInvite = () => {
  const join = $('wl-join')
  if (!join) return

  for (const toggle of document.querySelectorAll('[data-wl-kind]'))
    toggle.addEventListener('click', () => toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true')))

  const result = $('wl-result')
  join.addEventListener('click', async () => {
    const email = $('wl-email').value.trim()
    const kinds = [...document.querySelectorAll('[data-wl-kind][aria-checked="true"]')].map((t) => t.dataset.wlKind)
    result.hidden = false
    if (!email) {
      result.className = 'w-note w-note-bad'
      result.textContent = 'Enter your email so we can send your invite.'
      return
    }
    join.disabled = true
    try {
      await post('/v1/waitlist', { email, kinds })
      result.className = 'w-note w-note-good'
      result.textContent = `You are on the list. We will email ${email} when your group is admitted.`
      join.textContent = 'You are on the list'
    } catch (error) {
      join.disabled = false
      result.className = 'w-note w-note-bad'
      result.textContent = `That did not go through: ${String(error.message ?? error)}`
    }
  })

  const input = $('invite-code')
  const redeem = $('invite-redeem')
  const error = $('invite-error')
  if (pendingInvite()) input.value = pendingInvite()
  redeem.addEventListener('click', async () => {
    const code = input.value.trim().toUpperCase()
    if (!code) return
    keepInvite(code)
    const current = session()
    // Not signed in yet: sign in first, and the kept code is redeemed on the way back.
    if (!current) {
      location.href = 'app-signin.html'
      return
    }
    redeem.disabled = true
    try {
      location.href = landingFor(await redeemInvite({ ...current, assessment: 'invite' }, code))
    } catch (e) {
      redeem.disabled = false
      error.hidden = false
      error.textContent = String(e.message ?? e)
    }
  })
}

/* ------------------------------------------------------------------- boot -- */

initTheme()
initCopy()
initClock()
initSignIn()
initExport()
void initOperatorGate()
initReturnToWork()
initRail()
initInvite()
initWaitlistConsole()
initSendConsole()

void (async () => {
  await Promise.allSettled([
    loadWage(),
    loadMe().then((me) => {
      initSend(me)
      initNotify(me)
    }),
    initHome(),
    initQuestion(),
    initAssessment(),
    initSkills(),
    initConsole(),
    initQuestionDetail(),
    initWorkerDetail(),
    initBell(),
    initReceipt(),
  ])
  initAssessmentResult()
})()
