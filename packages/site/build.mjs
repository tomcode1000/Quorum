import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Site builder.
 *
 * Seventeen pages share one nav, one footer, one icon set and one stylesheet.
 * Holding those here rather than in each file is what stops the pages drifting
 * apart: change the nav once and every page has it.
 *
 * Output is plain static HTML — no runtime framework, nothing to hydrate.
 */

const OUT = join(import.meta.dirname, 'dist')

/*
  Where the worker app lives.

  Every "Sign in", "Get started" and "For Workers" control on the site points
  here — it is the only destination on the marketing site that is a product
  rather than a page. Kept in one place because a stale sign-in link is the one
  dead link a visitor actually notices.

  The default is now the app built into this site rather than a localhost port,
  so the whole thing is navigable from a plain `dist/` with nothing else
  running. The override remains for a deploy that serves the worker app from its
  own origin.
*/
const WORKER_APP = process.env.QUORUM_WORKER_APP_URL ?? 'app-signin.html'

/* ------------------------------------------------------------------ icons -- */

const I = {
  search: '<path d="M7.6 13.2a5.6 5.6 0 1 0 0-11.2 5.6 5.6 0 0 0 0 11.2ZM11.8 11.8 16 16"/>',
  code: '<path d="M6 12 2 8l4-4M12 4l4 4-4 4"/>',
  brain: '<circle cx="9" cy="9" r="6.3"/><path d="M9 2.7v12.6M2.7 9h12.6"/>',
  shield: '<path d="M9 1.8 3.4 4.2v4.3c0 3.4 2.3 6.5 5.6 7.7 3.3-1.2 5.6-4.3 5.6-7.7V4.2L9 1.8Z"/>',
  link: '<path d="M7.4 10.6a3 3 0 0 0 4.3 0l2.2-2.2a3 3 0 1 0-4.3-4.3l-1 1M10.6 7.4a3 3 0 0 0-4.3 0L4.1 9.6a3 3 0 1 0 4.3 4.3l1-1"/>',
  spark: '<path d="M9 1.8 10.7 7 16 8.7 10.7 10.4 9 15.6 7.3 10.4 2 8.7 7.3 7 9 1.8Z"/>',
  users: '<circle cx="9" cy="6.2" r="3.1"/><path d="M3.2 15.2c.6-2.8 2.9-4.5 5.8-4.5s5.2 1.7 5.8 4.5"/>',
  question: '<circle cx="9" cy="9" r="7"/><path d="M7 7a2 2 0 1 1 2.4 2.8v1"/><circle cx="9" cy="13" r=".8" fill="currentColor" stroke="none"/>',
  db: '<ellipse cx="9" cy="4.4" rx="5.8" ry="2.4"/><path d="M3.2 4.4v9.2c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V4.4M3.2 9c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4"/>',
  file: '<path d="M10.4 1.8H5a1.6 1.6 0 0 0-1.6 1.6v11.2A1.6 1.6 0 0 0 5 16.2h8a1.6 1.6 0 0 0 1.6-1.6V6l-4.2-4.2Z"/><path d="M10.2 1.9V6h4.2"/>',
  image: '<rect x="2.2" y="3.4" width="13.6" height="11.2" rx="1.8"/><circle cx="6.4" cy="7.4" r="1.3"/><path d="m3 12.6 3.6-3 3 2.4 2.6-2.2 2.8 2.4"/>',
  mail: '<rect x="2.2" y="3.8" width="13.6" height="10.4" rx="1.8"/><path d="m2.6 5 6.4 4.6L15.4 5"/>',
  tag: '<path d="M2.4 8.2V3.2a.8.8 0 0 1 .8-.8h5l7.4 7.4-5.8 5.8L2.4 8.2Z"/><circle cx="5.9" cy="5.9" r="1.1"/>',
  clock: '<circle cx="9" cy="9" r="7"/><path d="M9 4.8V9l2.8 1.7"/>',
  money: '<circle cx="9" cy="9" r="7"/><path d="M9 4.8v8.4M11.2 6.7c-.4-.7-1.2-1.1-2.2-1.1-1.3 0-2.2.7-2.2 1.7 0 2.4 4.6 1.2 4.6 3.6 0 1.1-1 1.8-2.4 1.8-1.1 0-2-.4-2.4-1.2"/>',
  cube: '<path d="M9 1.9 15 5.2v7.6L9 16.1 3 12.8V5.2L9 1.9Z"/><path d="m3.2 5.3 5.8 3.2 5.8-3.2M9 8.5v7.5"/>',
  globe: '<circle cx="9" cy="9" r="7"/><path d="M2 9h14M9 2a11 11 0 0 1 0 14 11 11 0 0 1 0-14Z"/>',
  check: '<path d="m3.6 9.4 3.4 3.4 7.4-7.4"/>',
  x: '<path d="M5 5l8 8M13 5l-8 8"/>',
  arrow: '<path d="M3.4 9h11.2M10.2 4.6 14.6 9l-4.4 4.4"/>',
  arrowLeft: '<path d="M14.6 9H3.4M7.8 4.6 3.4 9l4.4 4.4"/>',
  bolt: '<path d="M9.8 1.8 3.6 10.2h4.3l-.7 6 6.2-8.4H9.1l.7-6Z"/>',
  target: '<circle cx="9" cy="9" r="7"/><circle cx="9" cy="9" r="3.4"/><circle cx="9" cy="9" r=".9" fill="currentColor" stroke="none"/>',
  layers: '<path d="m9 2.2 6.6 3.4L9 9 2.4 5.6 9 2.2Z"/><path d="m2.4 9.4 6.6 3.4 6.6-3.4"/>',
  book: '<path d="M2.6 3.4h4.2A2.2 2.2 0 0 1 9 5.6v9a1.7 1.7 0 0 0-1.7-1.6H2.6V3.4Z"/><path d="M15.4 3.4h-4.2A2.2 2.2 0 0 0 9 5.6v9a1.7 1.7 0 0 1 1.7-1.6h4.7V3.4Z"/>',
  key: '<circle cx="6" cy="10.4" r="3.4"/><path d="m8.5 8 6-6M12.4 4.1l1.7 1.7M10.9 5.6l1.7 1.7"/>',
  gauge: '<path d="M2.4 13.4a7 7 0 1 1 13.2 0"/><path d="m9 9.6 3-3"/>',
  plug: '<rect x="2.2" y="4.6" width="13.6" height="8.8" rx="2"/><path d="M6 4.6V2.4M12 4.6V2.4"/>',
  lock: '<rect x="3.6" y="7.8" width="10.8" height="7.4" rx="2"/><path d="M6 7.8V5.6a3 3 0 0 1 6 0v2.2"/>',
  headset: '<path d="M3.4 12V9a5.6 5.6 0 0 1 11.2 0v3"/><rect x="2" y="10.4" width="3.2" height="4.4" rx="1.4"/><rect x="12.8" y="10.4" width="3.2" height="4.4" rx="1.4"/>',
  chat: '<path d="M15.4 11.2a1.8 1.8 0 0 1-1.8 1.8H5.4L2.6 15.8V4.2a1.8 1.8 0 0 1 1.8-1.8h9.2a1.8 1.8 0 0 1 1.8 1.8v7Z"/>',
  grid: '<rect x="2.4" y="2.4" width="5.6" height="5.6" rx="1.4"/><rect x="10" y="2.4" width="5.6" height="5.6" rx="1.4"/><rect x="2.4" y="10" width="5.6" height="5.6" rx="1.4"/><rect x="10" y="10" width="5.6" height="5.6" rx="1.4"/>',
  swap: '<path d="M3 6.4h10.4M10.6 3.6 13.4 6.4l-2.8 2.8M15 11.6H4.6M7.4 8.8 4.6 11.6l2.8 2.8"/>',
  eye: '<path d="M1.8 9S4.6 3.8 9 3.8 16.2 9 16.2 9 13.4 14.2 9 14.2 1.8 9 1.8 9Z"/><circle cx="9" cy="9" r="2.4"/>',
  pin: '<path d="M9 16s5.4-4.7 5.4-8.4a5.4 5.4 0 1 0-10.8 0C3.6 11.3 9 16 9 16Z"/><circle cx="9" cy="7.4" r="2"/>',
  id: '<rect x="2.2" y="3.8" width="13.6" height="10.4" rx="1.8"/><circle cx="6.8" cy="8.4" r="1.7"/><path d="M3.9 12.6c.4-1.2 1.5-1.9 2.9-1.9s2.5.7 2.9 1.9M11.4 7.6h3.1M11.4 10.2h3.1"/>',
  list: '<path d="M6.4 4.8h9M6.4 9h9M6.4 13.2h9"/><circle cx="3.2" cy="4.8" r=".9" fill="currentColor" stroke="none"/><circle cx="3.2" cy="9" r=".9" fill="currentColor" stroke="none"/><circle cx="3.2" cy="13.2" r=".9" fill="currentColor" stroke="none"/>',
  phone: '<rect x="5" y="1.8" width="8" height="14.4" rx="1.9"/><path d="M7.9 13.6h2.2"/>',
  gear: '<circle cx="9" cy="9" r="2.5"/><path d="M14.4 11a1.2 1.2 0 0 0 .24 1.32l.05.05a1.45 1.45 0 1 1-2.06 2.06l-.04-.05a1.2 1.2 0 0 0-1.33-.24 1.2 1.2 0 0 0-.73 1.1v.13a1.45 1.45 0 1 1-2.9 0v-.07a1.2 1.2 0 0 0-.78-1.1 1.2 1.2 0 0 0-1.33.25l-.04.04a1.45 1.45 0 1 1-2.06-2.05l.05-.05a1.2 1.2 0 0 0 .24-1.33 1.2 1.2 0 0 0-1.1-.73H2.5a1.45 1.45 0 1 1 0-2.9h.07a1.2 1.2 0 0 0 1.1-.78 1.2 1.2 0 0 0-.25-1.33l-.04-.04A1.45 1.45 0 1 1 5.43 3.2l.05.05a1.2 1.2 0 0 0 1.32.24h.06a1.2 1.2 0 0 0 .73-1.1V2.3a1.45 1.45 0 1 1 2.9 0v.07a1.2 1.2 0 0 0 .73 1.1 1.2 1.2 0 0 0 1.33-.24l.04-.05a1.45 1.45 0 1 1 2.06 2.06l-.05.04a1.2 1.2 0 0 0-.24 1.33v.06a1.2 1.2 0 0 0 1.1.73h.13a1.45 1.45 0 1 1 0 2.9h-.07a1.2 1.2 0 0 0-1.1.73Z"/>',
  wallet: '<rect x="2.2" y="4" width="13.6" height="10" rx="2.2"/><path d="M2.2 7.4h13.6"/><circle cx="12.4" cy="10.8" r=".9" fill="currentColor" stroke="none"/>',
  slash: '<circle cx="9" cy="9" r="7"/><path d="M4 4l10 10"/>',
  faceid: '<path d="M2.6 6.2V4.4a1.8 1.8 0 0 1 1.8-1.8h1.8M11.8 2.6h1.8a1.8 1.8 0 0 1 1.8 1.8v1.8M15.4 11.8v1.8a1.8 1.8 0 0 1-1.8 1.8h-1.8M6.2 15.4H4.4a1.8 1.8 0 0 1-1.8-1.8v-1.8"/><path d="M6.6 7.4v1M11.4 7.4v1M6.8 11a3 3 0 0 0 4.4 0"/>',
  user: '<circle cx="9" cy="6" r="3.2"/><path d="M3.4 15.4c.5-2.7 2.8-4.4 5.6-4.4s5.1 1.7 5.6 4.4"/>',
  play: '<path d="M7 5.2 12.6 9 7 12.8V5.2Z"/>',
  warn: '<path d="M9 2.4 16.2 15H1.8L9 2.4Z"/><path d="M9 7.2v3.2"/><circle cx="9" cy="12.6" r=".8" fill="currentColor" stroke="none"/>',

  /* Added for the worker app and the operator console. */
  bell: '<path d="M14 6.6a5 5 0 0 0-10 0c0 5.2-2 6.7-2 6.7h14s-2-1.5-2-6.7Z"/><path d="M10.4 15.6a1.6 1.6 0 0 1-2.8 0"/>',
  sun: '<circle cx="9" cy="9" r="3.4"/><path d="M9 1.6v1.8M9 14.6v1.8M3.8 3.8l1.3 1.3M12.9 12.9l1.3 1.3M1.6 9h1.8M14.6 9h1.8M3.8 14.2l1.3-1.3M12.9 5.1l1.3-1.3"/>',
  moon: '<path d="M15.2 10.4A6.6 6.6 0 0 1 7.6 2.8a6.6 6.6 0 1 0 7.6 7.6Z"/>',
  copy: '<rect x="6.4" y="6.4" width="9.2" height="9.2" rx="2"/><path d="M12.6 4.6V4a1.6 1.6 0 0 0-1.6-1.6H4A1.6 1.6 0 0 0 2.4 4v7a1.6 1.6 0 0 0 1.6 1.6h.6"/>',
  home: '<path d="M2.6 7.4 9 2.2l6.4 5.2V15a1.2 1.2 0 0 1-1.2 1.2H3.8A1.2 1.2 0 0 1 2.6 15V7.4Z"/><path d="M7 16.2v-6h4v6"/>',
  clipboard: '<rect x="3.6" y="3.2" width="10.8" height="12.6" rx="2"/><path d="M6.6 3.2a1.6 1.6 0 0 1 1.6-1.6h1.6a1.6 1.6 0 0 1 1.6 1.6"/><path d="M6.6 8.4h4.8M6.6 11.6h3.2"/>',
  receipt: '<path d="M4 1.8h10v14.4l-2-1.4-1.6 1.4L9 14.8l-1.4 1.4L6 14.8l-2 1.4V1.8Z"/><path d="M6.6 6h4.8M6.6 9.2h4.8"/>',
  activity: '<path d="M1.8 9h3.2l2-5.4 4 11L13 9h3.2"/>',
  chart: '<path d="M2.6 15.4h12.8"/><rect x="3.4" y="9" width="2.8" height="4.8" rx="1"/><rect x="7.6" y="5.6" width="2.8" height="8.2" rx="1"/><rect x="11.8" y="7.8" width="2.8" height="6" rx="1"/>',
  filter: '<path d="M2.4 3.6h13.2l-5.2 6v5l-2.8 1.4V9.6L2.4 3.6Z"/>',
  sliders: '<path d="M2.6 5.4h12.8M2.6 12.6h12.8"/><circle cx="6.6" cy="5.4" r="1.9"/><circle cx="11.4" cy="12.6" r="1.9"/>',
  dots: '<circle cx="4" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="14" cy="9" r="1.1" fill="currentColor" stroke="none"/>',
  bank: '<path d="M9 1.9 16 5.6H2L9 1.9Z"/><path d="M4 7.6v5.2M7.4 7.6v5.2M10.6 7.6v5.2M14 7.6v5.2M2.2 15.4h13.6"/>',
  download: '<path d="M9 2.4v8.4M5.6 7.8 9 11.2l3.4-3.4"/><path d="M2.8 12.8v1.6a1.6 1.6 0 0 0 1.6 1.6h9.2a1.6 1.6 0 0 0 1.6-1.6v-1.6"/>',
  out: '<path d="M11.4 2.6h4v4M15.4 2.6 8.6 9.4"/><path d="M13.6 10.6v3.8a1.6 1.6 0 0 1-1.6 1.6H3.6A1.6 1.6 0 0 1 2 14.4V6a1.6 1.6 0 0 1 1.6-1.6h3.8"/>',
  power: '<path d="M9 2.2v6.6"/><path d="M13.2 4.6a6 6 0 1 1-8.4 0"/>',
  exit: '<path d="M7 15.4H4.2a1.6 1.6 0 0 1-1.6-1.6V4.2a1.6 1.6 0 0 1 1.6-1.6H7"/><path d="M11.4 12.2 14.8 9l-3.4-3.2M14.4 9H6.6"/>',
  pencil: '<path d="M11.4 2.8a1.9 1.9 0 0 1 2.7 2.7L5.8 13.8l-3.5 1 1-3.5 7.9-8.5Z"/>',
  refresh: '<path d="M15.2 7.6A6.4 6.4 0 0 0 4.2 4.6L2.4 6.4"/><path d="M2.8 10.4a6.4 6.4 0 0 0 11 3l1.8-1.8"/><path d="M2.4 2.8v3.6H6M15.6 15.2v-3.6H12"/>',
  up: '<path d="M9 14V4M4.8 8.2 9 4l4.2 4.2"/>',
  down: '<path d="M9 4v10M13.2 9.8 9 14l-4.2-4.2"/>',
  calendar: '<rect x="2.4" y="3.8" width="13.2" height="11.8" rx="2"/><path d="M2.4 7.6h13.2M6 2.4v2.8M12 2.4v2.8"/>',
  pie: '<path d="M9 2.2v6.8h6.8A6.8 6.8 0 0 0 9 2.2Z"/><path d="M15.4 11.4A6.8 6.8 0 1 1 6.6 2.6"/>',
  ban: '<circle cx="9" cy="9" r="6.8"/><path d="M4.2 4.2 13.8 13.8"/>',
  pause: '<rect x="4.6" y="3.4" width="3" height="11.2" rx="1.2"/><rect x="10.4" y="3.4" width="3" height="11.2" rx="1.2"/>',
  expand: '<path d="M11 2.6h4.4V7M7 15.4H2.6V11M15.4 2.6 10.6 7.4M2.6 15.4l4.8-4.8"/>',
  dollar: '<path d="M9 2v14M12 5.2c-.6-1-1.7-1.5-3-1.5-1.8 0-3 1-3 2.4 0 3.3 6.3 1.7 6.3 5 0 1.5-1.4 2.5-3.3 2.5-1.5 0-2.7-.6-3.3-1.7"/>',
  route: '<circle cx="4.4" cy="4.4" r="2.2"/><circle cx="13.6" cy="13.6" r="2.2"/><path d="M6.6 4.4h3.6a3.4 3.4 0 0 1 0 6.8H7.8a3.4 3.4 0 0 0 0 .1"/><path d="M4.4 6.6v5a2.2 2.2 0 0 0 2.2 2.2h4.8"/>',
}

/**
 * One icon, stroked.
 *
 * The `i` class is not decoration: an inline SVG with a viewBox but no width or
 * height has no intrinsic size, so in any context that does not set one it
 * expands to fill its parent. That is how a 16px magnifier became a 200px one
 * in the docs header. `.i` is the floor; the context rules that want a
 * different size are more specific and still win.
 */
const ic = (name) =>
  `<svg class="i" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] ?? I.spark}</svg>`

/* ------------------------------------------------------------------- mark -- */

const MARK = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><defs><mask id="qm"><rect width="40" height="40" fill="#fff"/><line x1="25" y1="41" x2="41" y2="25" stroke="#000" stroke-width="4.4" stroke-linecap="round"/></mask></defs><g mask="url(#qm)" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M13 2h14a11 11 0 0 1 11 11v14a11 11 0 0 1-11 11H13A11 11 0 0 1 2 27V13A11 11 0 0 1 13 2Zm-.4 10.6a2 2 0 0 0-2 2v10.8a2 2 0 0 0 2 2h14.8a2 2 0 0 0 2-2V14.6a2 2 0 0 0-2-2H12.6Z"/><rect x="26.6" y="26.6" width="11.4" height="11.4" rx="3.6"/></g></svg>`

const caret = `<svg class="caret" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`

/* ------------------------------------------------------------------ chrome -- */

const nav = (current = '') => `<header class="nav"><div class="shell nav-in">
  <a class="brand" href="index.html"><span class="mark">${MARK}</span>Quorum</a>
  <nav class="nav-links" aria-label="Primary">
    <a href="capabilities.html"${current === 'product' ? ' aria-current="page"' : ''}>Product ${caret}</a>
    <a href="developers.html"${current === 'dev' ? ' aria-current="page"' : ''}>Developers ${caret}</a>
    <a href="for-workers.html">For Workers</a><a href="#">Pricing</a><a href="#">About</a>
  </nav>
  <div class="nav-end"><a class="sign" href="worker-signin.html">Sign in</a><a class="btn btn-primary" href="docs/index.html">Get started</a></div>
</div></header>`

/*
  The strip carries four figures and every one of them is either live or
  measured. Two earlier placeholders - a quarter of a million workers and a
  99.9% uptime record - were removed rather than restyled: there is no such
  roster and no such history, and a false number on a live site is worse than
  an unimpressive true one.

  `data-live` values are replaced by assets/live.js from the running gateway.
  What is rendered here is the honest fallback for when it cannot be reached.
*/
const STATS = [
  ['0', 'Workers online', 'workers', 'workers-label'],
  ['Moderato', 'Network', 'network'],
  ['6.1s', 'Avg. response time'],
  ['$0.20', 'Per answer'],
]

const statsStrip = () => `<div class="shell"><hr class="rule"/><div class="stats-strip">
  <span class="note" data-live-status="down">Live from the Quorum gateway</span>
  <div class="stats-list">${STATS.map(([v, l, k, lk]) => `<div class="stat-i"><b${k ? ` data-live="${k}"` : ''}>${v}</b><span${lk ? ` data-live="${lk}"` : ''}>${l}</span></div>`).join('')}</div>
</div></div>`

/*
  Demote a section that was written to stand alone as a page so it can sit in
  the homepage scroll. A scroll has exactly one h1 — the hero's — and every
  block beneath it is an h2 at the next size down.
*/
const demote = (html) => html.replaceAll('<h1 ', '<h2 ').replaceAll('</h1>', '</h2>').replaceAll('h-xl', 'h-lg')

const page = ({ title, body, docs = false, script = false }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} — Quorum</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700${script ? ';800' : ''}&family=JetBrains+Mono:wght@400;500${script ? '&family=Caveat:wght@600;700' : ''}&display=swap"/>
<link rel="stylesheet" href="${docs ? '../assets/quorum.css' : 'assets/quorum.css'}"/>
<script>
  /* The stored theme, applied before first paint so no page flashes the other one. */
  try {
    if (localStorage.getItem('quorum-theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  } catch (e) {}
</script>
</head>
<body>
${body}
<script src="${docs ? '../assets/live.js' : 'assets/live.js'}"></script>
</body>
</html>`

export { I, ic, MARK, caret, nav, statsStrip, page, demote, OUT, WORKER_APP, mkdir, writeFile, dirname, join }
