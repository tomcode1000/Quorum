import { MARK, caret, ic } from './build.mjs'

/**
 * The chrome both product surfaces share.
 *
 * The worker app and the operator console are one design with two navs, so the
 * rail, the page header, the cards and the tables are defined once here and the
 * two page files supply only their own content. When a comp shows the same
 * panel on both surfaces, it is the same function.
 *
 * Two decisions in this file are worth stating up front, because every screen
 * inherits them and both come from the brief rather than from the comps:
 *
 *   - Nothing here can imply Quorum holds a worker's money. There is no
 *     "balance", no "wallet", no "withdraw" and no "payout threshold" in any
 *     string below. A wage lands in an account the worker controls, and the
 *     copy says that every time it has the chance.
 *   - Every figure is rendered from data or rendered as a dash. The comps are
 *     full of round numbers a design tool invented — $42.50 balances, 248
 *     questions, 0.0034 ETH — and none of them survive here. What ships is the
 *     real figure from the gateway, or an honest zero, or an em dash.
 */

/* ------------------------------------------------------------------ money -- */

/**
 * Cents, as a worker reads them.
 *
 * Wages are twenty cents, so a session total is often a few dollar and the usual
 * two-decimal format rounds a real morning's work to "$0.06" or hides it at
 * "$0.00". Three decimals appear only where they are load-bearing — under a
 * dime — so the common case still looks like money rather than like telemetry.
 */
const money = (cents) => {
  if (cents === null || cents === undefined) return 'Loading'
  const dollars = cents / 100
  if (dollars !== 0 && Math.abs(dollars) < 0.1) return `$${dollars.toFixed(3)}`
  return `$${dollars.toFixed(2)}`
}

/** A hash, shortened the way every explorer shortens one. Never invented. */
const shortHash = (hash) => (hash ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : 'Loading')

/* ------------------------------------------------------------------ chips -- */

const chip = (text) => `<p class="ap-chip">${text}</p>`

/**
 * A status pill.
 *
 * Takes a word and a tone, and always renders both. There is no variant that
 * draws a dot without a label, because this is the element that tells a worker
 * whether they have been paid.
 */
const pill = (label, tone = '', icon = null) =>
  `<span class="ap-pill${tone ? ` ap-pill-${tone}` : ''}${icon ? ' ap-pill-icon' : ''}">${icon ? ic(icon) : ''}${label}</span>`

const tile = (icon, tone = '', size = '') =>
  `<span class="ap-tile${size ? ` ap-tile-${size}` : ''}${tone ? ` ap-tile-${tone}` : ''}">${ic(icon)}</span>`

const av = (initials, size = '') => `<span class="ap-av${size ? ` ap-av-${size}` : ''}">${initials}</span>`

/* ------------------------------------------------------------------ cards -- */

const card = (body, extra = '') => `<section class="ap-card"${extra}>${body}</section>`

const cardHead = (title, right = '') =>
  `<div class="ap-card-head"><h2 class="ap-h2">${title}</h2>${right}</div>`

const more = (label, href = '#') => `<a class="ap-more" href="${href}">${label} ${ic('arrow')}</a>`

/** One figure in a divided strip. */
const metric = (icon, label, value, note = '', key = '') =>
  `<div class="ap-metric">${tile(icon)}<div><span>${label}</span><b${key ? ` data-app="${key}"` : ''}>${value}</b>${note ? `<em>${note}</em>` : ''}</div></div>`

/** One stat card in the row across the top of a console screen. */
const stat = (icon, label, value, note = '', key = '', tone = '') =>
  `<div class="ap-stat">${tile(icon, tone)}<div><span>${label}</span><b${key ? ` data-app="${key}"` : ''}>${value}</b>${note ? `<em>${note}</em>` : ''}</div></div>`

/**
 * The comps' repeating list element.
 *
 * The chevron is drawn only when the row actually goes somewhere. The comps use
 * one on every row of every rail card, but half of those rows are figures rather
 * than destinations, and a chevron on a row that does not move is an affordance
 * the interface does not honour — a worker taps it, nothing happens, and they
 * learn to distrust the rest of the page.
 */
const row = ({ icon, title, note = '', value = '', tag = '', href = null, tone = '', key = '' }) => {
  const inner = `${icon ? tile(icon, tone, 'sm') : ''}<div><b>${title}</b>${note ? `<span>${note}</span>` : ''}</div>${
    value ? `<div class="ap-row-val"${key ? ` data-app="${key}"` : ''}>${value}</div>` : ''
  }${tag}${href ? caret : ''}`
  return href ? `<a class="ap-row" href="${href}">${inner}</a>` : `<div class="ap-row">${inner}</div>`
}

const info = (icon, title, body, tone = '') =>
  `<div class="ap-info${tone ? ` ap-info-${tone}` : ''}">${ic(icon)}<div><b>${title}</b><p>${body}</p></div></div>`

/* -------------------------------------------------------------------- nav -- */

/**
 * The worker's rail.
 *
 * Seven destinations and no more. Every one of them is somewhere a worker
 * actually needs to go; the comps also drew a "Work" and a "Home" that were the
 * same screen, which is collapsed here into one.
 */
const WORKER_NAV = [
  ['home', 'Home', 'app-home.html'],
  ['db', 'Earnings', 'app-earnings.html'],
  ['clipboard', 'Work', 'app-question.html'],
  ['receipt', 'Payments', 'app-payments.html'],
  ['user', 'Profile', 'app-profile.html'],
  ['question', 'Help', 'app-help.html'],
  ['gear', 'Settings', 'app-settings.html'],
]

/** The same rail during onboarding: there is no work to reach yet. */
const ASSESSMENT_NAV = [
  ['home', 'Home', 'app-home.html'],
  ['db', 'Earnings', 'app-earnings.html'],
  ['target', 'Skills', 'app-skills.html'],
  ['clipboard', 'Assessment', 'app-assessment.html'],
  ['user', 'Profile', 'app-profile.html'],
  ['question', 'Help', 'app-help.html'],
]

const CONSOLE_NAV = [
  ['activity', 'Live Activity', 'console.html'],
  ['clipboard', 'Questions', 'console-questions.html'],
  ['users', 'Workers', 'console-workers.html'],
  ['wallet', 'Payments', 'console-payments.html'],
  ['route', 'Escalations', 'console-escalations.html'],
  ['layers', 'Capabilities', 'console-capabilities.html'],
  ['chart', 'Analytics', 'console-analytics.html'],
  ['gear', 'Settings', 'console-settings.html'],
]

const navList = (items, current) =>
  `<nav class="ap-nav" aria-label="Sections">${items
    .map(
      ([icon, label, href]) =>
        `<a href="${href}" title="${label}"${label.toLowerCase() === current ? ' aria-current="page"' : ''}>${ic(icon)}${label}</a>`,
    )
    .join('')}</nav>`

/**
 * Collapsing the rail to icons, for more room to work. The choice is remembered
 * and applied before first paint, so no page flashes the other width.
 */
const railToggle = `<button class="ap-rail-toggle" type="button" data-rail-toggle aria-label="Collapse navigation" aria-expanded="true">${ic('panel')}</button>`

/**
 * The theme control.
 *
 * It reads "Light mode" in the comps because the comps are light. What it
 * actually says is the mode you would switch to, which is what the label has to
 * mean for the control to be pressable without surprise. `app.js` rewrites it.
 */
const themeToggle = () =>
  `<button class="ap-theme" type="button" data-theme-toggle aria-pressed="false">${ic('sun')}<span data-theme-label>Light mode</span>${caret}</button>`

/**
 * The worker's rail, foot included.
 *
 * The comp's card claimed "industry-standard encryption", which is marketing
 * rather than a fact about this system and is exactly the sort of line a
 * careful reader discounts. Replaced with the thing that is both true and
 * unusual: there is no password anywhere, so there is none to leak.
 */
const workerSide = (current, nav = WORKER_NAV) => `<aside class="ap-side ap-side-worker">
  <div class="ap-side-head"><a class="brand" href="app-home.html"><span class="mark">${MARK}</span>Quorum</a>${railToggle}</div>
  ${navList(nav, current)}
  <div class="ap-side-foot">
    <div class="ap-note">${ic('shield')}<div><b>Nothing to steal</b><p>You sign in with your device, so there is no password stored anywhere and none to lose.</p></div></div>
    ${themeToggle()}
  </div>
</aside>`

const consoleSide = (current) => `<aside class="ap-side">
  <div class="ap-side-head"><a class="brand" href="console.html"><span class="mark">${MARK}</span>Quorum</a>${railToggle}</div>
  <p class="ap-side-label">Operator console</p>
  ${navList(CONSOLE_NAV, current)}
  <div class="ap-side-foot">
    <div class="ap-note ap-note-good" data-app="gateway-state">${ic('check')}<div><b data-app="gateway-title">Checking the gateway…</b><p data-app="gateway-note">Reading live state.</p></div></div>
    ${themeToggle()}
    <div class="ap-who">${av('OP')}<div><b>Operator</b><span>Read-only session</span></div>${caret}</div>
  </div>
</aside>`

/* ------------------------------------------------------------------- tops -- */

const back = (label, href) => `<a class="ap-back" href="${href}">${ic('arrowLeft')}${label}</a>`

const hello = () => `<span class="ap-hello" data-app="greeting">${ic('user')}Signed in</span>`

const bell = () => `<button class="ap-bell" type="button" data-app="bell" aria-label="Notifications">${ic('bell')}</button>`

/**
 * The console's clock and status.
 *
 * Both are live. A console header that says "All systems online" because
 * somebody typed it into the markup is worse than no header at all — it is the
 * one place an operator would look to find out otherwise.
 */
const consoleTop = (left) => `<div class="ap-top">
  ${left}
  <div class="ap-top-end">
    ${bell()}
    <div class="ap-clock"><b data-app="clock-date">Loading</b><span data-app="clock-time">Loading</span></div>
    <span class="ap-pill ap-pill-lg" data-app="system-pill">Checking…</span>
  </div>
</div>`

const workerTop = (left) => `<div class="ap-top">${left}<div class="ap-top-end">${bell()}</div></div>`

/* ------------------------------------------------------------------- page -- */

/**
 * One app page.
 *
 * `appScript` is what wires it to the gateway. Every page loads the same file:
 * it reads the `data-app` keys present in the markup and fills only those, so a
 * page never has to declare which figures it wants twice.
 */
const appPage = ({ title, side, main, script = false, body = '' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${title} · Quorum</title>
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500${script ? '&family=Caveat:wght@600;700' : ''}&display=swap"/>
<link rel="stylesheet" href="assets/quorum.css"/>
<link rel="stylesheet" href="assets/app.css"/>
<script>
  /*
    Applied before first paint.

    A person who chose dark mode and then sees a white flash on every navigation
    has been given a strobe rather than a setting, and this app is used at night
    on cheap screens. Reading one key synchronously is worth the blocking script.

    Only an explicit stored choice counts. The operating system's preference is
    deliberately ignored here, and in app.js, so that every surface is light
    unless somebody has asked for dark.
  */
  try {
    if (localStorage.getItem('quorum-theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    if (localStorage.getItem('quorum-rail') === 'collapsed') document.documentElement.setAttribute('data-rail', 'collapsed')
  } catch (e) {}
</script>
</head>
<body${body}>
<div class="ap">
${side}
<main class="ap-main">
${main}
</main>
</div>
<script src="assets/app.js"></script>
</body>
</html>`

const swoosh = `<svg viewBox="0 0 132 11" fill="none" aria-hidden="true"><path d="M2 7.6C28 3.2 74 1.8 130 4.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`

const script = (lines) =>
  `<p class="ap-script" aria-hidden="true">${lines.map((l) => `${l}<br/>`).join('')}${swoosh}</p>`

export {
  money,
  shortHash,
  chip,
  pill,
  tile,
  av,
  card,
  cardHead,
  more,
  metric,
  stat,
  row,
  info,
  back,
  hello,
  bell,
  consoleTop,
  workerTop,
  workerSide,
  consoleSide,
  appPage,
  script,
  themeToggle,
  WORKER_NAV,
  ASSESSMENT_NAV,
  CONSOLE_NAV,
}
