import { caret, ic } from './build.mjs'
import {
  appPage,
  av,
  back,
  card,
  cardHead,
  chip,
  consoleSide,
  consoleTop,
  info,
  more,
  pill,
  row,
  stat,
  tile,
} from './app-shell.mjs'

/**
 * The operator console — surface C.
 *
 * Internal, the most data-dense of the three, and treated as a monitoring tool
 * rather than a product: legible tables and live numbers, no marketing polish.
 * It is also what gets projected during a demo, so Live Activity has to be
 * watchable and Question detail has to be readable by somebody who has never
 * seen the system before.
 *
 * The comps for this surface carry ETH balances, invented percentages and
 * confidence read as "High (92%)". All three are corrected. The last one is not
 * cosmetic: 0.92 is below the bar this engine clears, so a comp showing a
 * question marked answered at 92% is showing the system doing the exact thing
 * the product exists to prevent. Confidence is rendered as the engine's own
 * number, to three places, next to the target it had to beat.
 *
 * Nothing on this surface is seeded. Every table renders from the gateway or
 * renders its empty state, because a console that shows a plausible night's
 * traffic on a network that had none is a console nobody can trust in the one
 * moment they need to.
 */

/* ------------------------------------------------------------------ parts -- */

const QUESTION_TABS = ['Live feed', 'Questions', 'Workers', 'Payments']

const tabs = (items, current, end = '') =>
  `<div class="ap-tabs" role="tablist">${items
    .map(
      (label) =>
        `<button type="button" role="tab" data-tab="${label.toLowerCase().replace(/\s+/g, '-')}" aria-selected="${label === current}">${label}</button>`,
    )
    .join('')}${end ? `<div class="ap-tabs-end">${end}</div>` : ''}</div>`

const emptyCell = (text) => `<p class="ap-empty">${text}</p>`

/* --------------------------------------------------------- live activity -- */

/*
  Live activity.

  The demo screen. A judge watching this should see a question arrive, a person
  be chosen, an answer come back, confidence move and a wage land, in that
  order, without anyone narrating it — so the feed is the widest column and the
  pipeline sits beside it rather than under it.

  The four figures across the top are counts of things that exist right now.
  Where the comps put a "↑ 12% vs. previous 24h" under each one, this renders a
  real comparison or renders nothing: a trend arrow is a claim about history,
  and this gateway keeps hours of it, not days.
*/
const liveActivity = () =>
  appPage({
    title: 'Live activity',
    body: ' data-console="overview"',
    side: consoleSide('live activity'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Live activity</h1><p class="ap-sub" style="margin-bottom:0">Questions, workers, answers and payments across Quorum, as they happen.</p></div>`)}

<div class="ap-stats">
  ${stat('clipboard', 'Questions in flight', 'Loading', 'being routed or answered now', 'c-inflight')}
  ${stat('users', 'Workers online', 'Loading', 'polled in the last minute', 'c-online')}
  ${stat('check', 'Answers received', 'Loading', 'across every worker, all time', 'c-answers')}
  ${stat('wallet', 'Wages paid', 'Loading', 'to workers, all time', 'c-wages')}
</div>

<div class="ap-cols-3">
  <div class="ap-stack">
    ${card(`
      ${tabs(QUESTION_TABS, 'Live feed', `<span class="ap-select">All activity ${caret}</span>`)}
      <div class="ap-feed" data-app="c-feed">${emptyCell('Nothing has happened yet.<br/>Every question, answer and payment appears here the moment it does.')}</div>
    `)}

    ${card(`
      ${cardHead('Recent questions', more('See all', 'console-questions.html'))}
      <div class="ap-tbl-wrap" data-app="c-questions">${emptyCell('No questions yet.')}</div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Where questions are', more('See all', 'console-questions.html'))}
      <div class="ap-pad" style="padding-top:0"><ul class="ap-legend">
        <li><i style="background:var(--ink-4)"></i>Quoted, not yet paid for<b data-app="c-pipe-quoted">Loading</b></li>
        <li><i style="background:var(--warn)"></i>Waiting for a person<b data-app="c-pipe-awaiting">Loading</b></li>
        <li><i style="background:var(--accent)"></i>Being answered<b data-app="c-pipe-answering">Loading</b></li>
        <li><i style="background:var(--good)"></i>Answers in, deciding<b data-app="c-pipe-answers">Loading</b></li>
        <li><i style="background:var(--ink-5)"></i>Settled<b data-app="c-pipe-settled">Loading</b></li>
      </ul></div>
    `)}

    ${card(`
      ${cardHead('Workers', more('See all', 'console-workers.html'))}
      <div class="ap-rows ap-rows-inset" data-app="c-worker-list">${emptyCell('Nobody has signed in yet.')}</div>
    `)}

    ${card(`
      ${cardHead('Go to')}
      <div class="ap-pad" style="padding-top:0"><div class="ap-grid2">
        <a class="ap-quick" href="console-questions.html">${tile('clipboard', '', 'sm')} Questions</a>
        <a class="ap-quick" href="console-workers.html">${tile('users', '', 'sm')} Workers</a>
        <a class="ap-quick" href="console-payments.html">${tile('wallet', '', 'sm')} Payments</a>
        <a class="ap-quick" href="console-capabilities.html">${tile('layers', '', 'sm')} Capabilities</a>
      </div></div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('How it is going')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'clock', title: 'Median time to resolve', note: 'From arrival to a settled answer', value: 'Loading', key: 'c-latency' })}
        ${row({ icon: 'check', title: 'Resolved', note: 'The rest were refunded', value: 'Loading', key: 'c-resolved' })}
        ${row({ icon: 'users', title: 'People per question', note: 'One unless the first answer was not sure enough', value: 'Loading', key: 'c-responders' })}
        ${row({ icon: 'swap', title: 'Refunded to callers', note: 'Workers were paid regardless', value: 'Loading', key: 'c-refunded' })}
      </div>
    `)}

    ${card(`
      ${cardHead('Needs a person')}
      <div class="ap-pad" style="padding-top:0" data-app="c-attention">
        ${info('check', 'Nothing outstanding', 'No wage has failed to settle. If one does, it appears here with the worker it is owed to.', 'good')}
      </div>
    `)}

    ${card(`
      ${cardHead('Network')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'cube', title: 'Chain', value: 'Loading', key: 'c-network' })}
        ${row({ icon: 'bolt', title: 'Worker fees', note: 'Workers only ever receive, so no fee reaches them', value: 'Covered', key: 'c-fees' })}
      </div>
    `)}
  </div>
</div>`,
  })

/* -------------------------------------------------------------- questions -- */

const questions = () =>
  appPage({
    title: 'Questions',
    body: ' data-console="questions"',
    side: consoleSide('questions'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Questions</h1><p class="ap-sub" style="margin-bottom:0">What was asked, who answered, where confidence landed and what it cost.</p></div>`)}

<div class="ap-stats">
  ${stat('clipboard', 'In flight', 'Loading', 'right now', 'c-inflight')}
  ${stat('check', 'Resolved', 'Loading', 'reached the confidence bar', 'c-resolved-n')}
  ${stat('swap', 'Refunded', 'Loading', 'could not be resolved', 'c-refunded-n')}
  ${stat('clock', 'Median time', 'Loading', 'arrival to settled', 'c-latency')}
</div>

${card(`
  <div class="ap-bar">
    <div class="ap-field">${ic('search')}<input type="search" placeholder="Search by question or id…" data-app="c-question-search" aria-label="Search questions"/></div>
    <span class="ap-select">All kinds ${caret}</span>
    <span class="ap-select">All outcomes ${caret}</span>
  </div>
  <div class="ap-tbl-wrap" data-app="c-questions-full">${emptyCell('No questions yet.<br/>One appears here the moment an agent asks something.')}</div>
`)}`,
  })

/*
  Question detail.

  The screen that matters most on this surface, because it is the proof that the
  quality system is real rather than asserted. It should read as an audit log:
  first person asked, what they said, the reputation behind it, where confidence
  landed, whether that cleared the bar, who was asked next, and the transaction
  for every wage.

  The comp renders one answer at "High (92%)" beside a resolved question. That
  cannot happen here — 0.92 does not clear the bar, which is the whole mechanism
  — so the panel repeats per answer, as the real trail does, and confidence is
  printed to three places against the target it had to beat.
*/
const questionDetail = () =>
  appPage({
    title: 'Question',
    body: ' data-console="question"',
    side: consoleSide('questions'),
    main: `${consoleTop(back('Back to questions', 'console-questions.html'))}

<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:22px">
  <h1 class="ap-h1 ap-mono" style="margin:0;font-size:30px" data-app="q-id">Loading</h1>
  <span data-app="q-status">${pill('Loading', '')}</span>
  <span style="font-size:12.5px;color:var(--ink-4)" data-app="q-meta">Loading</span>
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('clipboard', '', 'sm')} The question`)}
      <div class="ap-pad" style="padding-top:0">
        <p style="margin:0 0 14px;font-size:17px;line-height:1.45;font-weight:600;letter-spacing:-0.02em;color:var(--ink)" data-app="q-prompt">Loading</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap" data-app="q-tags"></div>
      </div>
      <div class="ap-kv">
        <div>${ic('layers')}<div><span>Kind</span><b data-app="q-kind">Loading</b></div></div>
        <div>${ic('money')}<div><span>Caller paid</span><b data-app="q-price">Loading</b></div></div>
        <div>${ic('clock')}<div><span>Time to resolve</span><b data-app="q-latency">Loading</b></div></div>
      </div>
    `)}

    <div data-app="q-evidence"></div>

    ${card(`
      ${cardHead('The answers, in order')}
      <div data-app="q-answers">${emptyCell('Nobody has answered yet.')}</div>
    `)}

    ${card(`
      ${cardHead('What the caller got')}
      <div class="ap-pad" style="padding-top:0" data-app="q-outcome">${emptyCell('Not settled yet.')}</div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('wallet', '', 'sm')} Money`)}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'money', title: 'Caller paid', value: 'Loading', key: 'q-price' })}
        ${row({ icon: 'db', title: 'Wages out', note: 'Paid whether or not the caller was', value: 'Loading', key: 'q-wages' })}
        ${row({ icon: 'swap', title: 'Refunded', note: 'Only when we could not answer', value: 'Loading', key: 'q-refund' })}
      </div>
      <div class="ap-pad" data-app="q-receipts"></div>
    `)}

    ${card(`
      ${cardHead('Audit trail')}
      <div class="ap-pad" style="padding-top:0">
        <ol class="ap-time" data-app="q-trail"><li data-state="open"><b>Waiting for this question</b><span>Every step appears here as it happens.</span></li></ol>
      </div>
    `)}
  </div>
</div>`,
  })

/* ---------------------------------------------------------------- workers -- */

/*
  The roster.

  The comp's Earnings column is denominated in ETH. Wages are a dollar
  stablecoin on Tempo and there is no ETH anywhere in this system, so the column
  is dollars. The comp also assigns each worker an "assessment level" from one
  to four; there are no levels — there is a reliability score per kind of
  judgment, which is a different and more useful thing, and it is what the
  router actually reads.
*/
const workers = () =>
  appPage({
    title: 'Workers',
    body: ' data-console="workers"',
    side: consoleSide('workers'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Workers</h1><p class="ap-sub" style="margin-bottom:0">Who is on the network, what they are good at, and everything they have been paid.</p></div>`)}

<div class="ap-stats">
  ${stat('users', 'Registered', 'Loading', 'have signed in at least once', 'c-registered')}
  ${stat('bolt', 'Online', 'Loading', 'polled in the last minute', 'c-online', 'good')}
  ${stat('clipboard', 'In assessment', 'Loading', 'not yet reachable by work', 'c-assessing', 'warn')}
  ${stat('ban', 'Blocked', 'Loading', 'did not pass; keep what they earned', 'c-blocked', 'bad')}
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      <div class="ap-bar">
        <div class="ap-field">${ic('search')}<input type="search" placeholder="Search by id or account…" data-app="c-worker-search" aria-label="Search workers"/></div>
        <span class="ap-select">All statuses ${caret}</span>
        <button class="ap-second" type="button">${ic('sliders')} Columns</button>
      </div>
      <div class="ap-tbl-wrap" data-app="c-workers-table">${emptyCell('Nobody has signed in yet.<br/>A worker appears here the moment their passkey makes an account.')}</div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('The roster')}
      <div class="ap-pad" style="padding-top:0">
        <div class="ap-donut" data-app="c-donut">
          <svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="52" fill="none" stroke="var(--border)" stroke-width="16"/></svg>
          <div><b data-app="c-registered">Loading</b><span>registered</span></div>
        </div>
        <ul class="ap-legend" style="margin-top:20px">
          <li><i style="background:var(--good)"></i>Online<b data-app="c-online">Loading</b></li>
          <li><i style="background:var(--accent)"></i>Answering now<b data-app="c-answering">Loading</b></li>
          <li><i style="background:var(--warn)"></i>In assessment<b data-app="c-assessing">Loading</b></li>
          <li><i style="background:var(--bad)"></i>Blocked<b data-app="c-blocked">Loading</b></li>
        </ul>
      </div>
    `)}

    ${card(`<div class="ap-pad">
      ${info('shield', 'This console cannot change anything', 'It reads. There is no lever here to adjust somebody’s standing or hold their wage, deliberately: what a worker was paid is a public fact, not our opinion of it, and a quiet override would make that untrue.')}
    </div>`)}
  </div>
</div>`,
  })

/*
  One worker.

  Their history, their standing per kind of judgment, their answer latencies and
  every payment with its chain link. The reputation panel lists all five kinds
  rather than a single score, because that is how the router sees them: someone
  can be excellent at telling two readings apart and unremarkable at matching
  records, and one averaged number would hide exactly the thing worth knowing.
*/
const workerDetail = () =>
  appPage({
    title: 'Worker',
    body: ' data-console="worker"',
    side: consoleSide('workers'),
    main: `${consoleTop(back('Back to workers', 'console-workers.html'))}

<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:24px">
  ${av('Loading', 'lg').replace('>Loading<', ' data-app="w-initials">Loading<')}
  <div style="flex:1;min-width:240px">
    <h1 class="ap-h1" style="margin:0;font-size:28px" data-app="w-id">Loading</h1>
    <span class="ap-mono" data-app="w-address" style="display:block;margin-top:4px">Loading</span>
  </div>
  <span data-app="w-status">${pill('Loading', '')}</span>
</div>

<div class="ap-stats">
  ${stat('check', 'Answers given', 'Loading', 'all time', 'w-answered')}
  ${stat('db', 'Paid to them', 'Loading', 'sent to their own account', 'w-earned')}
  ${stat('wallet', 'In their account', 'Loading', 'read from the ledger', 'w-balance')}
  ${stat('gauge', 'Best reliability', 'Loading', 'their strongest kind of judgment', 'w-reliability')}
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead('Every payment')}
      <div class="ap-tbl-wrap" data-app="w-payments">${emptyCell('No payments yet.')}</div>
    `)}

    ${card(`
      ${cardHead('What they have been doing')}
      <div class="ap-pad" style="padding-top:0">
        <ol class="ap-time" data-app="w-trail"><li data-state="open"><b>Nothing recorded yet</b><span>Their activity appears here as it happens.</span></li></ol>
      </div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Standing, by kind')}
      <div class="ap-pad" style="padding-top:0" data-app="w-reputation">${emptyCell('No record yet.')}</div>
    `)}

    ${card(`
      ${cardHead('Signals')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'clipboard', title: 'Assessment', value: 'Loading', key: 'w-assessment' })}
        ${row({ icon: 'bolt', title: 'Answered too fast to have read it', note: 'Counted, never acted on alone', value: 'Loading', key: 'w-toofast' })}
        ${row({ icon: 'clock', title: 'Last seen', value: 'Loading', key: 'w-lastseen' })}
      </div>
    `)}
  </div>
</div>`,
  })

/* --------------------------------------------------------------- payments -- */

/*
  The treasury.

  Wages out, refunds issued, and the one row that needs a human: a wage whose
  chain write did not land. It is listed by name and amount rather than counted,
  because somebody is owed it.
*/
const paymentsPage = () =>
  appPage({
    title: 'Payments',
    body: ' data-console="payments"',
    side: consoleSide('payments'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Payments</h1><p class="ap-sub" style="margin-bottom:0">Wages out, refunds issued, and anything that did not settle.</p></div>`)}

<div class="ap-stats">
  ${stat('db', 'Wages paid', 'Loading', 'to workers, all time', 'c-wages')}
  ${stat('swap', 'Refunded to callers', 'Loading', 'questions we could not answer', 'c-refunded')}
  ${stat('warn', 'Did not settle', 'Loading', 'owed, and being retried', 'c-failed', 'warn')}
  ${stat('users', 'Workers paid', 'Loading', 'have received at least one wage', 'c-paid-workers')}
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead('Wages, newest first')}
      <div class="ap-tbl-wrap" data-app="c-payments-table">${emptyCell('No wages yet.<br/>Every payment appears here with the transaction that proves it.')}</div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Needs a person')}
      <div class="ap-pad" style="padding-top:0" data-app="c-attention">
        ${info('check', 'Nothing outstanding', 'Every wage settled. A failure would be listed here with the worker it is owed to and the question it was for.', 'good')}
      </div>
    `)}

    ${card(`<div class="ap-pad">
      ${info('shield', 'A refunded question still costs us', 'The people who answered are paid whether or not the caller was, so an unresolved question is a loss we absorb rather than one we push onto the workers who did the work.')}
    </div>`)}
  </div>
</div>`,
  })

/* ----------------------------------------------------------- capabilities -- */

/*
  Capabilities.

  Two of these are declared and cannot be served. The brief is explicit that
  they must be visibly marked rather than greyed out ambiguously or quietly
  dropped, and this is the screen where an operator would otherwise fail to
  notice that a queue has had nobody on it all day.
*/
const capabilitiesPage = () =>
  appPage({
    title: 'Capabilities',
    body: ' data-console="capabilities"',
    side: consoleSide('capabilities'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Capabilities</h1><p class="ap-sub" style="margin-bottom:0">What agents can ask for, which of it we can actually serve, and who is behind each one.</p></div>`)}

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead('The catalog')}
      <div class="ap-tbl-wrap" data-app="c-capabilities">${emptyCell('Reading the catalog…')}</div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`<div class="ap-pad">
      ${info('warn', 'Declared with nobody behind it', 'A capability we advertise and cannot staff is worse than one we do not advertise: an agent that calls it has been misled by us rather than by its own uncertainty. Anything in that state is marked here and refused at the gateway.', 'warn')}
    </div>`)}

    ${card(`
      ${cardHead('Where the catalog comes from')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'globe', title: 'Agent card', note: 'What an agent discovers about us', href: '#' })}
        ${row({ icon: 'plug', title: 'Service manifest', note: 'The catalog entry', href: '#' })}
      </div>
    `)}
  </div>
</div>`,
  })

/* --------------------------------------------------------------- analytics -- */

const analytics = () =>
  appPage({
    title: 'Analytics',
    body: ' data-console="analytics"',
    side: consoleSide('analytics'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Analytics</h1><p class="ap-sub" style="margin-bottom:0">How the network is performing, from the questions it has actually handled.</p></div>`)}

<div class="ap-stats">
  ${stat('clock', 'Median time to resolve', 'Loading', 'arrival to settled answer', 'c-latency')}
  ${stat('check', 'Resolved', 'Loading', 'the rest were refunded in full', 'c-resolved')}
  ${stat('users', 'People per question', 'Loading', 'a second is bought only when needed', 'c-responders')}
  ${stat('clipboard', 'Questions handled', 'Loading', 'since this gateway started', 'c-settled')}
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead('Outcomes')}
      <div class="ap-pad" style="padding-top:0" data-app="c-outcomes">${emptyCell('No questions have settled yet.')}</div>
    `)}

    ${card(`
      ${cardHead('By kind of judgment')}
      <div class="ap-tbl-wrap" data-app="c-by-kind">${emptyCell('Nothing to break down yet.')}</div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`<div class="ap-pad">
      ${info('warn', 'This is a short window', 'These figures cover the questions this gateway has handled since it started, which is hours rather than months. They are real and they are small; they are not a benchmark.', 'plain')}
    </div>`)}
  </div>
</div>`,
  })

/* --------------------------------------------------------------- settings -- */

const consoleSettings = () =>
  appPage({
    title: 'Console settings',
    body: ' data-console="settings"',
    side: consoleSide('settings'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Settings</h1><p class="ap-sub" style="margin-bottom:0">Which gateway this console is reading, and what it is configured to do.</p></div>`)}

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead('Gateway')}
      <div class="ap-rows">
        ${row({ title: 'Address', note: 'Override with ?gateway= in the URL', value: '<span class="ap-mono" data-app="c-gateway">Loading</span>' })}
        ${row({ title: 'Reachable', value: 'Loading', key: 'c-reachable' })}
        ${row({ title: 'Chain', value: 'Loading', key: 'c-network' })}
        ${row({ title: 'Wage per answer', value: 'Loading', key: 'wage' })}
      </div>
    `)}

    ${card(`
      ${cardHead('What this console can do')}
      <div class="ap-rows">
        ${row({ title: 'Read live state', note: 'Questions, workers, payments, capabilities', tag: pill('Yes', 'good', 'check') })}
        ${row({ title: 'Change a worker\'s standing', note: 'Reputation is earned from agreement and from known-answer questions. There is no manual override, by design', tag: pill('No', '', 'x') })}
        ${row({ title: 'Hold or reverse a wage', note: 'A wage is sent before anything else happens. There is nothing to hold', tag: pill('No', '', 'x') })}
        ${row({ title: 'Read a worker\'s answers', note: 'Answers are visible in the audit trail for the question they belong to', tag: pill('Yes', 'good', 'check') })}
      </div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`<div class="ap-pad">
      ${info('lock', 'Read-only on purpose', 'Every claim this product makes to a worker depends on there being no quiet lever here. If an operator could adjust standing or withhold a wage by hand, "what you were paid is a public fact" would stop being true.')}
    </div>`)}

    ${card(`<div class="ap-pad">${info('bolt', 'Dark mode', 'Set at the foot of the rail. It is stored on this device only and follows you between the console and the worker app.', 'plain')}</div>`)}
  </div>
</div>`,
  })

/* ------------------------------------------------------------ escalations -- */

/*
  Escalations.

  A judgment question is over in about six seconds; an escalation is the shape
  for work that is not — somebody going somewhere, or looking at something that
  takes longer than a glance. Both field capabilities are declared and cannot be
  served in this version.

  That is why this screen leads with the capability list rather than the table.
  An empty table says "nothing has been asked for today", which is a different
  claim from "this cannot be served at all", and the brief is explicit that a
  capability with no workforce has to be visibly marked rather than quietly
  omitted or greyed out ambiguously.
*/
const escalations = () =>
  appPage({
    title: 'Escalations',
    body: ' data-console="escalations"',
    side: consoleSide('escalations'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Escalations</h1><p class="ap-sub" style="margin-bottom:0">The longer-running jobs: what state each is in, and who is holding it.</p></div>`)}

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead('In progress')}
      <div class="ap-tbl-wrap" data-app="c-escalations">${emptyCell('Reading the queue…')}</div>
    `)}

    ${card(`
      ${cardHead('The field capabilities')}
      <div class="ap-tbl-wrap" data-app="c-field-capabilities">${emptyCell('Reading the catalog…')}</div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`<div class="ap-pad">
      ${info('warn', 'Two of these cannot be served', 'Physical verification and local knowledge are declared in the catalog and have no workforce behind them. The gateway refuses them rather than accepting work it cannot do, and they are listed here so that refusal is visible to whoever is running the network.', 'warn')}
    </div>`)}

    ${card(`
      ${cardHead('How an escalation differs')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'clock', title: 'It does not block the caller', note: 'The agent is given an id and comes back for the result' })}
        ${row({ icon: 'pin', title: 'It can need a place', note: 'Some of this work is somebody being somewhere specific' })}
        ${row({ icon: 'file', title: 'It returns evidence', note: 'Not a single value: photographs, readings, observations' })}
        ${row({ icon: 'db', title: 'Wages work the same way', note: 'Paid per worker, each with its own public record' })}
      </div>
    `)}
  </div>
</div>`,
  })

/* --------------------------------------------------------------- waitlist -- */

/*
  Admitting the next group.

  The one console screen that changes anything: it lists people's email
  addresses and sends them invites. Behind the same operator token as the rest
  of the console, entered once at the gate.
*/
const waitlist = () =>
  appPage({
    title: 'Waitlist',
    body: ' data-console="waitlist"',
    side: consoleSide('waitlist'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Waitlist</h1><p class="ap-sub" style="margin-bottom:0">Who is waiting, and who you have let in. Admit a group and each person is emailed their own invite link.</p></div>`)}

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead('People', '<button class="ap-primary" type="button" data-app="wl-admit" style="width:auto;padding-inline:18px" disabled>Admit selected</button>')}
      <div class="ap-tbl-wrap" data-app="c-waitlist">${emptyCell('Reading the waitlist…')}</div>
    `)}
    <p data-app="wl-admit-result" class="ap-info" style="margin:0" hidden></p>
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Running a group')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'users', title: 'Admit 20 to 50 at a time', note: 'Enough to agree with each other, few enough to watch' })}
        ${row({ icon: 'clipboard', title: 'Wait for the assessments', note: 'The status column shows who has passed what' })}
        ${row({ icon: 'clock', title: 'Then run a session', note: 'Questions reach only people who passed' })}
      </div>
    `)}
  </div>
</div>`,
  })

/* ---------------------------------------------------------- send questions -- */

/*
  Test sessions.

  On the testnet there is no agent traffic, so the operator supplies it: one
  question written here, or a session that sends questions from the gateway's
  bank on a timer. They reach only people who passed that skill and are paid
  like any other, in test tokens. The gateway runs the session, so closing this
  page does not stop it.
*/
const KIND_OPTIONS = [['disambiguate', 'Telling readings apart'], ['verify', 'Checking something is real'], ['match', 'Matching records'], ['categorise', 'Categorising'], ['compare', 'Comparing']]

const sendQuestions = () =>
  appPage({
    title: 'Send questions',
    body: ' data-console="send"',
    side: consoleSide('send questions'),
    main: `${consoleTop(`<div>${chip('Operator console')}<h1 class="ap-h1">Send questions</h1><p class="ap-sub" style="margin-bottom:0">Run a test session, or write one question yourself. Questions reach only people who passed that skill, and every answer is paid in test tokens.</p></div>`)}

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('clock', '', 'sm')} Run a session`, '<span data-app="ss-state"></span>')}
      <div class="ap-pad" style="padding-top:0">
        <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:var(--ink-3)">Sends questions from the ready-made set, most with an image: receipts, labels, lookalike stores, wallet screens. The gateway runs it, so you can close this page.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="ap-label-sm">Minutes<div class="ap-field"><input type="number" min="1" max="180" value="60" data-app="ss-minutes"/></div></label>
          <label class="ap-label-sm">One question every (seconds)<div class="ap-field"><input type="number" min="5" max="600" value="30" data-app="ss-every"/></div></label>
        </div>
        <p class="ap-label-sm" style="margin:14px 0 8px">Skills <span style="color:var(--ink-4);font-weight:500">(none picked means all)</span></p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${KIND_OPTIONS.map(([k, t]) => `<button class="ap-chip-btn" type="button" aria-pressed="false" data-ss-kind="${k}">${t}</button>`).join('')}</div>
        <div style="display:flex;gap:10px;margin-top:18px">
          <button class="ap-primary" type="button" data-app="ss-start" style="flex:1">Start session ${ic('arrow')}</button>
          <button class="ap-second" type="button" data-app="ss-stop" hidden>Stop</button>
          <button class="ap-second" type="button" data-app="ss-one">Send one now</button>
        </div>
        <p data-app="ss-result" class="ap-info" style="margin:14px 0 0" hidden></p>
      </div>
    `)}

    ${card(`
      <details class="ap-details">
      <summary class="ap-card-head" style="cursor:pointer">${tile('question', '', 'sm')}<h2 class="ap-h2" style="flex:1">Write your own question <span style="font-weight:500;color:var(--ink-4);font-size:12.5px">(optional)</span></h2></summary>
      <div class="ap-pad" style="padding-top:0;display:flex;flex-direction:column;gap:12px">
        <label class="ap-label-sm">Skill<div class="ap-field"><select data-app="q-kind" style="border:0;background:transparent;width:100%;font:inherit;color:inherit;outline:none">${KIND_OPTIONS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div></label>
        <label class="ap-label-sm">Question<div class="ap-field"><input type="text" maxlength="500" placeholder="Is the total 45.00 or 4.50?" data-app="q-text"/></div></label>
        <label class="ap-label-sm">Answers<div class="ap-field"><select data-app="q-type" style="border:0;background:transparent;width:100%;font:inherit;color:inherit;outline:none"><option value="boolean">Yes or no</option><option value="enum">Pick from options</option></select></div></label>
        <label class="ap-label-sm" data-app="q-options-row" hidden>Options, separated by commas<div class="ap-field"><input type="text" placeholder="45.00, 4.50" data-app="q-options"/></div></label>
        <label class="ap-label-sm">What the person needs to see <span style="color:var(--ink-4);font-weight:500">(optional)</span><div class="ap-field" style="height:auto;padding-block:10px"><textarea rows="3" maxlength="4000" placeholder="Paste the text, record or details here" data-app="q-context" style="border:0;background:transparent;width:100%;font:inherit;color:inherit;outline:none;resize:vertical"></textarea></div></label>
        <label class="ap-label-sm">Image <span style="color:var(--ink-4);font-weight:500">(optional, up to 5 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-app="q-image" style="display:block;margin-top:6px;font-size:13px"/></label>
        <label class="ap-label-sm">Wait up to (minutes)<div class="ap-field"><input type="number" min="1" max="30" value="5" data-app="q-deadline"/></div></label>
        <button class="ap-primary" type="button" data-app="q-send">Send question ${ic('arrow')}</button>
        <p data-app="q-result" class="ap-info" style="margin:0" hidden></p>
      </div>
      </details>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Online now')}
      <div class="ap-rows ap-rows-inset" data-app="ss-online">${emptyCell('Reading…')}</div>
    `)}
    ${card(`
      ${cardHead('Sent')}
      <div class="ap-tbl-wrap" data-app="ss-sent">${emptyCell('Nothing sent yet.')}</div>
    `)}
  </div>
</div>`,
  })

export {
  sendQuestions,
  waitlist,
  liveActivity,
  escalations,
  questions,
  questionDetail,
  workers,
  workerDetail,
  paymentsPage,
  capabilitiesPage,
  analytics,
  consoleSettings,
}
