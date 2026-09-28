import { ic, MARK, nav, page } from './build.mjs'
import { foot } from './pages-marketing.mjs'

/* ------------------------------------------------------------------ proof -- */

/*
  The homepage is one scroll, as the brief lays it out, and these three blocks
  are the last of it. They live here as named sections rather than inline in the
  proof page so the scroll and the standalone page cannot drift apart.

  `h` lets the homepage demote the heading: a scroll has exactly one h1, up in
  the hero, and every block under it is an h2.
*/
const proofSection = () => `<section class="section"><div class="shell split">
  <div>
    <p class="eyebrow">Proof</p>
    <h1 class="h-xl">Real performance.<br/>Settlement you can check.</h1>
    <p class="lede">The numbers below are measured, not projected. Every wage is a transaction on a public ledger, so you can open any answer and see who was paid, how much, and when.</p>
    <ul class="feats">
      ${[['bolt', 'Avg. latency', '6s from question to answer'], ['money', 'Avg. cost', '$0.02 per answer'], ['cube', 'On-chain', 'Every wage is inspectable']].map(([i, t, d]) => `<li class="feat"><span class="ico ico-sm">${ic(i)}</span><b>${t}</b><span>${d}</span></li>`).join('')}
    </ul>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
    ${[
      ['clock', 'Latency', 'Time from request to answer', '6.3s', 'Median across resolved questions'],
      ['money', 'Cost', 'Per resolved answer', '$0.02', 'Wage paid per responder'],
    ].map(([i, t, s, v, n]) => `<div class="card card-lg"><div style="display:flex;gap:10px;align-items:center"><span class="ico ico-sm">${ic(i)}</span><div><b style="font-size:13px;display:block">${t}</b><span class="dim" style="font-size:11.5px">${s}</span></div></div><div style="font-size:28px;font-weight:700;letter-spacing:-.03em;margin:18px 0 4px;font-variant-numeric:tabular-nums">${v}</div><span class="dim" style="font-size:11.5px">${n}</span></div>`).join('')}
    <div class="card card-lg">
      <div style="display:flex;gap:10px;align-items:center"><span class="ico ico-sm">${ic('cube')}</span><div><b style="font-size:13px;display:block">Settlement</b><span class="dim" style="font-size:11.5px">Verifiable on the explorer</span></div></div>
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:9px;font-size:12px">
        <div style="display:flex;justify-content:space-between"><span class="dim">Status</span><span class="badge badge-good">Success</span></div>
        <div style="display:flex;justify-content:space-between"><span class="dim">Network</span><b>Tempo (Moderato)</b></div>
        <div style="display:flex;justify-content:space-between"><span class="dim">Tx</span><b style="font-family:var(--mono);font-size:11px">0x5555c6…4e09</b></div>
        <div style="display:flex;justify-content:space-between"><span class="dim">Settled in</span><b>1.17s</b></div>
      </div>
      <a class="btn btn-ghost" style="width:100%;margin-top:16px" href="https://explore.testnet.tempo.xyz/tx/0x5555c664fc570178d3c68a4471c9673dfc67cea24881c2546bffb0225c764e09">${ic('link')} View transaction</a>
    </div>
  </div>
</div></section>`

const limitsSection = () => `<section class="section-tight" style="background:var(--surface);border-block:1px solid var(--border)"><div class="shell">
  <p class="eyebrow">Limits</p>
  <h2 class="h-lg">What Quorum isn&rsquo;t for (yet).</h2>
  <p class="lede">Stated plainly, because a page that admits its limits is worth more than one that claims everything works.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-top:30px">
    ${[
      ['globe', 'Approvals', 'It answers questions about data, never questions about what you are allowed to do.', 'By design'],
      ['file', 'Free-text answers', 'Answers must fit a constrained space so agreement can be measured.', 'By design'],
      ['pin', 'Physical tasks', 'Someone going somewhere is declared but has no workforce behind it.', 'Planned'],
      ['clock', 'Long-running work', 'Built for seconds, not for multi-hour jobs.', 'Planned'],
      ['users', 'Sybil resistance', 'One identity per passkey is weak, and we say so.', 'In development'],
    ].map(([i, t, d, s]) => `<div class="card"><span class="ico ico-sm ico-plain">${ic(i)}</span><b class="h-sm" style="display:block;margin:12px 0 5px">${t}</b><span class="feat"><span>${d}</span></span><span class="badge ${s === 'By design' ? 'badge-accent' : ''}" style="margin-top:12px;${s === 'By design' ? '' : 'background:var(--warn-wash);color:var(--warn)'}">${s}</span></div>`).join('')}
  </div>
</div></section>`

const ctaSection = () => `<section class="foot-cta"><div class="shell">
  <h2 class="h-lg">Ready to build with Quorum?</h2>
  <p class="lede" style="margin-inline:auto;text-align:center">Add one tool to your agent and start getting verified answers from real people.</p>
  <a class="btn btn-primary btn-lg" style="margin-top:22px" href="docs/index.html">Get started ${ic('arrow')}</a>
</div></section>`

const proof = () => page({
  title: 'Proof',
  body: `${nav('product')}<main>${proofSection()}
${limitsSection()}
${ctaSection()}
${foot()}</main>`,
})

/* ------------------------------------------------------------ integration -- */

const integration = () => page({
  title: 'Integration',
  body: `${nav('dev')}<main>
<section class="section"><div class="shell split">
  <div>
    <p class="eyebrow">Integration</p>
    <h1 class="h-xl">Build with Quorum.<br/>Integrate with confidence.</h1>
    <p class="lede">Quorum fits into what you already run. One MCP tool, or one HTTP call \u2014 no SDK to adopt, no account to provision, and no change to your workflow.</p>
    <div style="display:flex;gap:12px;margin-top:28px;flex-wrap:wrap">
      <a class="btn btn-primary btn-lg" href="docs/index.html">View developer docs ${ic('arrow')}</a>
      <a class="btn btn-ghost btn-lg" href="#">Get started</a>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:16px">
    <div style="display:flex;flex-direction:column;gap:12px">
      ${[['plug', 'MCP tool', 'One entry in your agent\u2019s config.'], ['code', 'REST API', 'Plain HTTP for anything else.'], ['globe', 'Webhooks', 'Results delivered when you are not waiting.'], ['book', 'Documentation', 'Guides, examples and a full reference.']]
        .map(([i, t, d]) => `<div class="card" style="padding:14px"><div style="display:flex;gap:10px;align-items:flex-start"><span class="ico ico-sm">${ic(i)}</span><div><b style="font-size:13px;display:block">${t}</b><span class="dim" style="font-size:11.5px">${d}</span></div></div></div>`).join('')}
    </div>
    <div class="panel"><div class="panel-head">${ic('code')} Quickstart <span class="badge badge-accent" style="margin-left:auto">MCP</span></div><div class="panel-body">
      <div class="code code-light"><pre><span class="ln">{</span><span class="ln"> <span class="k">"mcpServers"</span>: {</span><span class="ln">   <span class="k">"quorum"</span>: {</span><span class="ln">     <span class="k">"url"</span>: <span class="s">"https://api.quorum.dev/mcp"</span></span><span class="ln">   }</span><span class="ln"> }</span><span class="ln">}</span></pre></div>
      <p class="dim" style="margin:14px 0 8px">Your agent now has <code style="font-family:var(--mono);font-size:11.5px">ask_human</code> alongside its own tools.</p>
      <div class="code code-light"><pre><span class="ln">{</span><span class="ln"> <span class="k">"answer"</span>: <span class="s">"45.00"</span>,</span><span class="ln"> <span class="k">"confidence"</span>: <span class="n">0.99</span>,</span><span class="ln"> <span class="k">"responders"</span>: <span class="n">2</span></span><span class="ln">}</span></pre></div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
        ${['No account or API key', 'Paid per call, refunded on failure', 'Works with any MCP client'].map((t) => `<div style="display:flex;gap:9px;align-items:center;font-size:12.5px;color:var(--ink-2)"><span class="ico ico-sm ico-good" style="width:18px;height:18px;border-radius:50%">${ic('check')}</span>${t}</div>`).join('')}
      </div>
    </div></div>
  </div>
</div></section>
${foot()}</main>`,
})

/* ------------------------------------------------------------------ docs -- */

const SIDE = [
  ['Docs', [['index.html', 'home', 'Getting started'], ['quickstart.html', 'bolt', 'Quickstart'], ['first-request.html', 'code', 'Make your first request'], ['response.html', 'file', 'Understand the response']]],
  ['Core concepts', [['capability-reference.html', 'layers', 'Capability reference'], ['#', 'users', 'Workers'], ['#', 'shield', 'Confidence'], ['#', 'money', 'Pricing & refunds']]],
  ['Reference', [['#', 'code', 'Endpoints'], ['#', 'db', 'Schemas'], ['#', 'warn', 'Errors']]],
]

const docsSide = (current) => `<aside class="docs-side">${SIDE.map(([h, items]) => `<h4>${h}</h4>${items.map(([href, i, t]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${ic(i === 'home' ? 'book' : i)}${t}</a>`).join('')}`).join('')}
<div class="help"><div style="display:flex;gap:9px;align-items:center"><span class="ico ico-sm">${ic('chat')}</span><div><b style="font-size:12.5px;display:block">Need help?</b><span class="dim" style="font-size:11px">Join the developer community.</span></div></div><a href="#" style="display:inline-flex;gap:6px;align-items:center;color:var(--accent);font-size:12px;font-weight:600;margin-top:10px">Get support ${ic('arrow')}</a></div></aside>`

/*
  "On this page", read off the page itself.

  This used to be a hand-written list of labels sitting beside hand-placed
  id="sN" anchors, and the two had drifted apart on five of the six pages: the
  docs home offered six entries to a page with two headings, and every label was
  one heading out of step because the h1 also carried an id. Deriving the list
  from the rendered body means a link can only exist if its heading does.

  The h1 is listed as "Overview", which is what the comp shows, rather than
  repeating the page title back at the reader.
*/
const HEADING = /<h([12])\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g

const docsToc = (body) => {
  const items = [...body.matchAll(HEADING)].map(([, level, id, text]) => [
    id,
    level === '1' ? 'Overview' : text.replace(/<[^>]*>/g, '').trim(),
  ])
  return `<aside class="docs-toc"><h4>On this page</h4>${items
    .map(([id, text], x) => `<a href="#${id}"${x === 0 ? ' aria-current="true"' : ''}>${text}</a>`)
    .join('')}
<h4 style="margin-top:26px">Related</h4>${['API reference', 'Authentication', 'Examples'].map((t) => `<a href="#">${t}</a>`).join('')}</aside>`
}

const docsNav = () => `<header class="docs-nav"><div class="docs-nav-in">
  <a class="brand" href="../index.html"><span class="mark">${MARK}</span>Quorum</a>
  <nav class="docs-tabs"><a href="index.html" aria-current="page">Docs</a><a href="#">API Reference</a><a href="#">Guides</a><a href="#">Examples</a><a href="#">Changelog</a></nav>
  <span class="search">${ic('search')} Search docs… <kbd>⌘K</kbd></span>
</div></header>`

const docsPage = ({ title, current, body }) =>
  page({ title, docs: true, body: `${docsNav()}<div class="docs-grid">${docsSide(current)}<main class="docs-main">${body}</main>${docsToc(body)}</div>` })

const docsHome = () => docsPage({
  title: 'Docs', current: 'index.html',
  body: `<p class="eyebrow">Getting started</p>
    <h1 class="h-lg" id="s0">Welcome to Quorum Docs</h1>
    <p class="lede">Quorum lets your agent ask a real person a question mid-task and get a structured answer in about six seconds. Start with the quickstart, then read the capability reference.</p>
    <div style="display:flex;gap:12px;margin:24px 0 34px"><a class="btn btn-primary" href="quickstart.html">Quickstart ${ic('arrow')}</a><a class="btn btn-ghost" href="#">View API reference</a></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px">
      ${[['bolt', 'Fast integration', 'One tool call. No SDK, no account.'], ['shield', 'Refunded on failure', 'You never pay for an answer you did not get.'], ['db', 'Structured results', 'Confidence, responders and receipts.'], ['users', 'Five capabilities', 'Each routed to a proven worker.']]
        .map(([i, t, d]) => `<div class="card"><span class="ico ico-sm">${ic(i)}</span><b class="h-sm" style="display:block;margin:11px 0 4px">${t}</b><span class="feat"><span>${d}</span></span></div>`).join('')}
    </div>
    <h2 class="h-md" id="s1" style="margin-top:40px">Quickstart</h2>
    <p class="muted" style="margin:6px 0 18px;font-size:14px">Make your first request and see Quorum work.</p>
    <div class="split-even" style="gap:22px">
      <ol class="steps" style="margin:0">
        ${[['Add the MCP server', 'One entry in your agent config.'], ['Ask a question', 'Send the question and its options.'], ['Handle the answer', 'Read the confidence and act on it.']]
          .map(([t, d], x) => `<li class="step" style="grid-template-columns:24px minmax(0,1fr)"><span class="step-n">${x + 1}</span><div class="step-b"><b class="h-sm">${t}</b><p>${d}</p></div></li>`).join('')}
      </ol>
      <div class="code"><div class="code-tabs">${['Python', 'Node.js', 'cURL'].map((t, x) => `<button role="tab" aria-selected="${x === 0}">${t}</button>`).join('')}<button class="code-copy">Copy</button></div>
      <pre><span class="ln"><span class="k">from</span> quorum <span class="k">import</span> Quorum</span><span class="ln"></span><span class="ln">q = Quorum()</span><span class="ln"></span><span class="ln">result = q.<span class="f">ask</span>(</span><span class="ln">    capability=<span class="s">"telling_readings_apart"</span>,</span><span class="ln">    question=<span class="s">"Is the total 45.00 or 4.50?"</span>,</span><span class="ln">    options=[<span class="s">"45.00"</span>, <span class="s">"4.50"</span>],</span><span class="ln">)</span><span class="ln"><span class="f">print</span>(result.answer, result.confidence)</span></pre></div>
    </div>
    <div class="note-box" style="margin-top:22px">${ic('question')}<span>There is no API key to create. Payment happens per call over the 402 flow, and a question that does not resolve is refunded automatically.</span></div>`,
})

const quickstart = () => docsPage({
  title: 'Quickstart', current: 'quickstart.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Docs</a>
    <p class="eyebrow">Quickstart</p>
    <h1 class="h-lg" id="s0">Get started with Quorum in minutes.</h1>
    <p class="lede">This walks you through making your first request, reading the answer, and handling the case where nothing resolves. Zero to a working integration in a few minutes.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin:28px 0 40px">
      ${[['plug', '1. Add the server', 'One entry in your agent config.'], ['code', '2. Make a request', 'Send a question with its options.'], ['check', '3. See the response', 'Structured, with a confidence score.']]
        .map(([i, t, d]) => `<div class="card"><span class="ico ico-sm">${ic(i)}</span><b class="h-sm" style="display:block;margin:11px 0 4px">${t}</b><span class="feat"><span>${d}</span></span></div>`).join('')}
    </div>
    <h2 class="h-md" id="s1">1. Add the server</h2>
    <p class="muted" style="margin:8px 0 16px;font-size:14px">Point your MCP client at Quorum. There is no signup and no key to paste.</p>
    <div class="code"><div class="code-tabs"><button role="tab" aria-selected="true">JSON</button><button class="code-copy">Copy</button></div>
    <pre><span class="ln">{</span><span class="ln">  <span class="k">"mcpServers"</span>: {</span><span class="ln">    <span class="k">"quorum"</span>: { <span class="k">"url"</span>: <span class="s">"https://api.quorum.dev/mcp"</span> }</span><span class="ln">  }</span><span class="ln">}</span></pre></div>
    <h2 class="h-md" id="s2" style="margin-top:36px">2. Make a request</h2>
    <p class="muted" style="margin:8px 0 16px;font-size:14px">Your agent now has <code style="font-family:var(--mono);font-size:12.5px">ask_human</code>. Over plain HTTP the same call looks like this.</p>
    <div class="code"><div class="code-tabs">${['cURL', 'Python', 'Node.js'].map((t, x) => `<button role="tab" aria-selected="${x === 0}">${t}</button>`).join('')}<button class="code-copy">Copy</button></div>
    <pre><span class="ln">curl -X POST https://api.quorum.dev/v1/questions \\</span><span class="ln">  -H <span class="s">"Content-Type: application/json"</span> \\</span><span class="ln">  -d <span class="s">'{</span></span><span class="ln"><span class="s">    "capability": "checking_something_is_real",</span></span><span class="ln"><span class="s">    "question": "Is this a valid postal address?",</span></span><span class="ln"><span class="s">    "options": ["yes", "no"],</span></span><span class="ln"><span class="s">    "max_price": "0.25"</span></span><span class="ln"><span class="s">  }'</span></span></pre></div>
    <div class="note-box" style="margin-top:20px">${ic('question')}<span>The first call returns <b>402</b> with a payment challenge and a claim URL. Pay it, then call the claim URL \u2014 that request blocks until a person answers.</span></div>`,
})

const firstRequest = () => docsPage({
  title: 'Make your first request', current: 'first-request.html',
  body: `<a class="back" href="quickstart.html">${ic('arrow')} Quickstart</a>
    <h1 class="h-lg" id="s0">Make your first request</h1>
    <p class="lede">This example asks a person to confirm an address is real, and shows exactly what comes back.</p>
    <div class="flow" style="margin:24px 0 36px">
      ${['Add the server', 'Make a request', 'Read the response', 'Handle failures'].map((t, x) => `${x ? `<span class="flow-arrow">${ic('arrow')}</span>` : ''}<div class="flow-step" style="text-align:left"><span class="ico ico-sm ${x < 2 ? 'ico-good' : 'ico-plain'}">${x < 2 ? ic('check') : `<span style="font-size:10px;font-weight:700">${x + 1}</span>`}</span><b style="margin-top:8px">${t}</b></div>`).join('')}
    </div>
    <div class="split-even" style="gap:24px">
      <div>
        <h2 class="h-md" id="s1">Send the request</h2>
        <p class="muted" style="margin:8px 0 14px;font-size:14px">Post the question to the questions endpoint.</p>
        <div class="code"><div class="code-tabs"><button role="tab" aria-selected="true">POST /v1/questions</button><button class="code-copy">Copy</button></div>
        <pre><span class="ln">curl -X POST https://api.quorum.dev/v1/questions \\</span><span class="ln">  -H <span class="s">"Content-Type: application/json"</span> \\</span><span class="ln">  -d <span class="s">'{</span></span><span class="ln"><span class="s">    "capability": "checking_something_is_real",</span></span><span class="ln"><span class="s">    "question": "Is this address real?",</span></span><span class="ln"><span class="s">    "options": ["yes", "no"]</span></span><span class="ln"><span class="s">  }'</span></span></pre></div>
        <h2 class="h-md" id="s2" style="margin-top:32px">Parameters</h2>
        <div class="card" style="padding:0;overflow:hidden;margin-top:12px"><table class="tbl"><thead><tr><th>Parameter</th><th>Type</th><th>Required</th><th>Description</th></tr></thead><tbody>
          ${[['capability', 'string', 'Yes', 'One of the five capability ids.'], ['question', 'string', 'Yes', 'Phrased for someone with no context on your system.'], ['options', 'array', 'Yes', 'The allowed answers. Free text is not accepted.'], ['context', 'object', 'No', 'Evidence the person needs: image_url, text or extracted.'], ['max_price', 'string', 'No', 'Your ceiling. Also sets how sure the answer must be.']]
            .map(([p, t, r, d]) => `<tr><td><code>${p}</code></td><td class="dim">${t}</td><td>${r === 'Yes' ? '<span class="badge badge-good">Yes</span>' : '<span class="dim">No</span>'}</td><td class="dim">${d}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      <div>
        <h2 class="h-md" id="s3">Response</h2>
        <p class="muted" style="margin:8px 0 14px;font-size:14px">A resolved question returns the answer with its confidence and receipts.</p>
        <div class="code"><div class="code-tabs"><button role="tab" aria-selected="true">200 OK</button><button class="code-copy">Copy</button></div>
        <pre><span class="ln">{</span><span class="ln">  <span class="k">"question_id"</span>: <span class="s">"q_9f2a…"</span>,</span><span class="ln">  <span class="k">"status"</span>: <span class="s">"resolved"</span>,</span><span class="ln">  <span class="k">"answer"</span>: <span class="s">"yes"</span>,</span><span class="ln">  <span class="k">"confidence"</span>: <span class="n">0.98</span>,</span><span class="ln">  <span class="k">"responders"</span>: <span class="n">2</span>,</span><span class="ln">  <span class="k">"agreement"</span>: <span class="s">"unanimous"</span>,</span><span class="ln">  <span class="k">"latency_ms"</span>: <span class="n">6120</span></span><span class="ln">}</span></pre></div>
        <div class="note-box" style="margin-top:18px">${ic('warn')}<span>Check <code style="font-family:var(--mono)">status</code> before using <code style="font-family:var(--mono)">answer</code>. Anything other than <b>resolved</b> means no answer was reached, and you were refunded.</span></div>
      </div>
    </div>`,
})

const response = () => docsPage({
  title: 'Understand the response', current: 'response.html',
  body: `<a class="back" href="quickstart.html">${ic('arrow')} Quickstart</a>
    <h1 class="h-lg" id="s0">Understand the response</h1>
    <p class="lede">Quorum returns structured JSON. Every response carries the answer, how sure it is, who contributed and what they were paid.</p>
    <div class="split-even" style="gap:24px;margin-top:28px">
      <div>
        <h2 class="h-md" id="s1">Response structure</h2>
        <div class="code" style="margin-top:12px"><div class="code-tabs"><button role="tab" aria-selected="true">JSON</button><button class="code-copy">Copy</button></div>
        <pre><span class="ln">{</span><span class="ln">  <span class="k">"question_id"</span>: <span class="s">"q_9f2a…"</span>,</span><span class="ln">  <span class="k">"status"</span>: <span class="s">"resolved"</span>,</span><span class="ln">  <span class="k">"answer"</span>: <span class="s">"45.00"</span>,</span><span class="ln">  <span class="k">"confidence"</span>: <span class="n">0.99</span>,</span><span class="ln">  <span class="k">"agreement"</span>: <span class="s">"unanimous"</span>,</span><span class="ln">  <span class="k">"evidence"</span>: [</span><span class="ln">    { <span class="k">"worker"</span>: <span class="s">"w_8812"</span>, <span class="k">"reputation"</span>: <span class="n">0.96</span> }</span><span class="ln">  ],</span><span class="ln">  <span class="k">"receipts"</span>: [{ <span class="k">"tx"</span>: <span class="s">"0x5555c6…"</span> }]</span><span class="ln">}</span></pre></div>
      </div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${[['file', 'question_id', 'Your handle for this question.'], ['check', 'status', 'resolved, no_consensus, timeout or refused.'], ['shield', 'confidence', 'Posterior probability the answer is right.'], ['users', 'evidence', 'Who answered and their standing.'], ['cube', 'receipts', 'The wage transactions, on chain.']]
          .map(([i, t, d]) => `<div class="card" style="padding:13px"><div style="display:flex;gap:10px;align-items:flex-start"><span class="ico ico-sm">${ic(i)}</span><div><b style="font-family:var(--mono);font-size:12.5px;display:block">${t}</b><span class="dim" style="font-size:11.5px">${d}</span></div></div></div>`).join('')}
      </div>
    </div>
    <h2 class="h-md" id="s2" style="margin-top:36px">Statuses</h2>
    <div class="card" style="padding:0;overflow:hidden;margin-top:12px"><table class="tbl"><thead><tr><th>Status</th><th>What it means</th><th>What to do</th></tr></thead><tbody>
      ${[['resolved', 'good', 'The bar was cleared. The answer is trustworthy.', 'Continue your workflow.'], ['no_consensus', 'bad', 'People looked and disagreed. The question is ambiguous.', 'Surface it. You were refunded.'], ['timeout', 'bad', 'Nobody answered in time.', 'Retry or proceed, saying you are guessing.'], ['refused', 'bad', 'Not servable \u2014 wrong capability, or no supply.', 'Check the capability id.']]
        .map(([s, k, m, a]) => `<tr><td><span class="badge badge-${k}">${s}</span></td><td class="dim">${m}</td><td class="dim">${a}</td></tr>`).join('')}
    </tbody></table></div>
    <h2 class="h-md" id="s3" style="margin-top:36px">Handling it in your app</h2>
    <div class="code" style="margin-top:12px"><div class="code-tabs"><button role="tab" aria-selected="true">Python</button><button class="code-copy">Copy</button></div>
    <pre><span class="ln">result = q.<span class="f">ask</span>(...)</span><span class="ln"></span><span class="ln"><span class="k">if</span> result.status == <span class="s">"resolved"</span>:</span><span class="ln">    use(result.answer)</span><span class="ln"><span class="k">elif</span> result.status == <span class="s">"no_consensus"</span>:</span><span class="ln">    escalate_internally(result.evidence)   <span class="c"># genuinely ambiguous</span></span><span class="ln"><span class="k">else</span>:</span><span class="ln">    proceed_and_flag()                     <span class="c"># never a silent guess</span></span></pre></div>
    <div class="note-box" style="margin-top:20px">${ic('warn')}<span>Do not threshold on <code style="font-family:var(--mono)">confidence</code> alone. Check <code style="font-family:var(--mono)">status</code> first \u2014 an unresolved question has no answer to be confident about.</span></div>`,
})

const nextSteps = () => docsPage({
  title: 'Next steps', current: 'quickstart.html',
  body: `<a class="back" href="quickstart.html">${ic('arrow')} Quickstart</a>
    <h1 class="h-lg" id="s0">Next steps</h1>
    <p class="lede">You have made a request, read the response and handled the failure cases. Here is where to go deeper.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:30px">
      ${[['code', 'Explore the API reference', 'Every endpoint, parameter and response schema.'], ['book', 'Read capability guides', 'How each of the five behaves and what it costs.'], ['shield', 'Understand confidence', 'Why one answer sometimes suffices and sometimes does not.'], ['layers', 'Check out examples', 'Real use cases with complete code.']]
        .map(([i, t, d]) => `<a class="card" href="#" style="display:block"><span class="ico ico-sm">${ic(i)}</span><b class="h-sm" style="display:block;margin:12px 0 5px">${t}</b><span class="feat"><span>${d}</span></span><span style="display:inline-flex;gap:6px;align-items:center;color:var(--accent);font-size:12.5px;font-weight:600;margin-top:12px">Open ${ic('arrow')}</span></a>`).join('')}
    </div>
    <h2 class="h-md" id="s1" style="margin-top:40px">Everything you need to build</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:16px">
      ${[['file', 'API reference', 'Full endpoint documentation and error codes.'], ['book', 'Developer guides', 'In-depth guides for common use cases.'], ['layers', 'Examples', 'Copy and adapt real examples.'], ['users', 'Community & support', 'Get help from the team.']]
        .map(([i, t, d]) => `<a class="card" href="#" style="display:flex;gap:11px;align-items:flex-start"><span class="ico ico-sm">${ic(i)}</span><div><b style="font-size:13px;display:block">${t}</b><span class="dim" style="font-size:11.5px">${d}</span></div><span style="margin-left:auto;color:var(--ink-5)">${ic('arrow')}</span></a>`).join('')}
    </div>
    <div class="note-box" style="margin-top:26px">${ic('spark')}<span><b>Ready to build?</b> Head to the API reference and start integrating Quorum today.</span></div>`,
})

const capabilityReference = () => docsPage({
  title: 'Capability reference', current: 'capability-reference.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Capability reference</a>
    <p class="eyebrow">Capability reference</p>
    <h1 class="h-lg" id="s0">Telling readings apart</h1>
    <p class="lede">Decides which of two readings of the same evidence is correct \u2014 even when they are formatted differently or come from different extractions.</p>
    <ul class="feats" style="margin-top:24px">
      ${[['target', 'High accuracy', 'With the evidence in front of the worker.'], ['file', 'Multiple formats', 'Text, numbers, codes and images.'], ['shield', 'Built for noisy data', 'Smudges, scans and bad OCR.']].map(([i, t, d]) => `<li class="feat"><span class="ico ico-sm">${ic(i)}</span><b>${t}</b><span>${d}</span></li>`).join('')}
    </ul>
    <div class="split-even" style="gap:20px;margin-top:34px">
      <div class="card card-lg"><h2 class="h-md" id="s1" style="margin:0">How it works</h2><p class="dim" style="margin:10px 0 16px;line-height:1.65">The question and its evidence go to the worker with the best record on this kind of judgment. A second opinion is bought only if the first cannot carry the question alone.</p>
        <div class="flow">${[['Submit', 'Send the readings.'], ['Compare', 'A person reads the evidence.'], ['Return', 'Answer, confidence, receipts.']].map(([t, d], x) => `${x ? `<span class="flow-arrow">${ic('arrow')}</span>` : ''}<div class="flow-step" style="text-align:left"><span class="ico ico-sm">${ic('check')}</span><b style="margin-top:7px">${t}</b><span>${d}</span></div>`).join('')}</div>
      </div>
      <div class="card card-lg"><h2 class="h-md" id="s2" style="margin:0">Common use cases</h2>
        <div style="display:flex;flex-direction:column;gap:11px;margin-top:14px">
          ${['Resolving a low-confidence extracted field', 'Choosing between two OCR readings', 'Deciding which of two dates is meant', 'Settling an ambiguous amount before payment'].map((t) => `<div style="display:flex;gap:9px;align-items:center;font-size:12.5px;color:var(--ink-2)"><span class="ico ico-sm ico-good" style="width:18px;height:18px;border-radius:50%">${ic('check')}</span>${t}</div>`).join('')}
        </div>
      </div>
    </div>
    <h2 class="h-md" id="s3" style="margin-top:36px">Example request</h2>
    <div class="split-even" style="gap:20px;margin-top:12px">
      <div class="code"><div class="code-tabs"><button role="tab" aria-selected="true">POST /v1/questions</button><button class="code-copy">Copy</button></div>
      <pre><span class="ln">{</span><span class="ln">  <span class="k">"capability"</span>: <span class="s">"telling_readings_apart"</span>,</span><span class="ln">  <span class="k">"question"</span>: <span class="s">"Is the total 45.00 or 4.50?"</span>,</span><span class="ln">  <span class="k">"options"</span>: [<span class="s">"45.00"</span>, <span class="s">"4.50"</span>],</span><span class="ln">  <span class="k">"context"</span>: {</span><span class="ln">    <span class="k">"image_url"</span>: <span class="s">"https://…/receipt.png"</span></span><span class="ln">  }</span><span class="ln">}</span></pre></div>
      <div class="code"><div class="code-tabs"><button role="tab" aria-selected="true">200 OK</button><button class="code-copy">Copy</button></div>
      <pre><span class="ln">{</span><span class="ln">  <span class="k">"status"</span>: <span class="s">"resolved"</span>,</span><span class="ln">  <span class="k">"answer"</span>: <span class="s">"45.00"</span>,</span><span class="ln">  <span class="k">"confidence"</span>: <span class="n">0.99</span>,</span><span class="ln">  <span class="k">"agreement"</span>: <span class="s">"unanimous"</span>,</span><span class="ln">  <span class="k">"responders"</span>: <span class="n">2</span>,</span><span class="ln">  <span class="k">"latency_ms"</span>: <span class="n">5312</span></span><span class="ln">}</span></pre></div>
    </div>`,
})

export { proofSection, limitsSection, ctaSection, proof, integration, docsHome, quickstart, firstRequest, response, nextSteps, capabilityReference }
