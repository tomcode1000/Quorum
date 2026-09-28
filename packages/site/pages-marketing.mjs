import { ic, MARK, nav, statsStrip, page } from './build.mjs'

/**
 * The marketing pages.
 *
 * Each one is a section stack over the shared chrome. Content is the product's
 * own — the five capabilities are the five a caller can actually reach, and the
 * examples are the ones the engine really serves.
 */

const foot = () => `<footer class="foot">${statsStrip()}</footer>`

const capCard = (n, icon, name, desc, href, id) => `<a class="card" href="${href}" style="display:block" data-capability="${id}">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
  <span class="ico">${ic(icon)}</span>
  <span class="badge" data-cap-state>—</span></div>
  <div class="dim" style="margin-top:14px;font-size:11px;letter-spacing:.09em">${n}</div>
  <b class="h-sm" style="display:block;margin:3px 0 6px">${name}</b>
  <span class="feat"><span>${desc}</span></span>
  <span style="display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-size:12.5px;font-weight:600;margin-top:12px">Learn more <svg width="11" height="11" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 9h11.2M10.2 4.6 14.6 9l-4.4 4.4"/></svg></span>
</a>`

/* ids match the gateway catalog, so live.js can price each card from it. */
const CAPS = [
  ['01', 'swap', 'Telling readings apart', 'Decide which of two readings of the same evidence is right.', 'capability-readings.html', 'disambiguate'],
  ['02', 'shield', 'Checking something is real', 'Confirm a document, address or listing is genuine.', 'capability-real.html', 'verify'],
  ['03', 'link', 'Matching records', 'Decide whether records from different sources are the same thing.', 'capability-matching.html', 'match_entity'],
  ['04', 'tag', 'Categorising', 'Put an item in the right bucket when the classifier cannot.', 'capability-categorising.html', 'categorise'],
  ['05', 'list', 'Comparing', 'Say which of two candidates is better, and why.', 'capability-comparing.html', 'compare_outputs'],
]

/* ------------------------------------------------------- how it decides -- */

const decidesSection = () => `<section class="section"><div class="shell split">
  <div>
    <p class="eyebrow">How it decides</p>
    <h1 class="h-xl">From question to answer.<br/>Built on real consensus.</h1>
    <p class="lede">Quorum does not take the first answer it is given. It routes your question to independent people, weighs what they say against their record, and only returns an answer once it is trustworthy.</p>
    <ol class="steps">
      ${[
        ['01', 'question', 'Parse & route', 'Your question is checked against the capability you asked for and routed to the workers with the best record on that kind of judgment.'],
        ['02', 'users', 'Get independent answers', 'One worker is asked first. A second is bought only if the first answer cannot carry the question alone.'],
        ['03', 'shield', 'Weigh & score', 'Each answer is weighted by that worker record and combined into a posterior. Disagreement buys another opinion rather than a coin flip.'],
        ['04', 'spark', 'Return, or refund', 'Once the bar is cleared the answer is returned with its confidence. If it is never cleared, you are refunded and told why.'],
      ].map(([n, i, t, d]) => `<li class="step"><span class="step-n">${n}</span><span class="ico">${ic(i)}</span><div class="step-b"><b class="h-sm">${t}</b><p>${d}</p></div></li>`).join('')}
    </ol>
  </div>

  <div class="split-even" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:20px">
    <div class="panel"><div class="panel-body">
      <span class="tag">The process</span>
      <div class="flow" style="margin:18px 0 20px">
        ${[['question', 'Your request', 'Parsed & routed'], ['users', 'Independent workers', 'Asked in turn'], ['shield', 'Verification', 'Weigh & score'], ['spark', 'Final answer', 'Returned to you']]
          .map(([i, t, s], x) => `${x ? '<span class="flow-arrow"><svg width="13" height="13" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 9h11.2M10.2 4.6 14.6 9l-4.4 4.4"/></svg></span>' : ''}<div class="flow-step"><span class="ico">${ic(i)}</span><b>${t}</b><span>${s}</span></div>`).join('')}
      </div>
      <div class="card card-flat" style="padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><b style="font-size:12.5px">Your request</b><span style="font-size:11.5px;color:var(--accent);font-weight:500">Copy</span></div>
        <div class="code code-light"><pre><span class="ln">{</span><span class="ln">  <span class="k">"capability"</span>: <span class="s">"telling_readings_apart"</span>,</span><span class="ln">  <span class="k">"question"</span>: <span class="s">"Is the total 45.00 or 4.50?"</span>,</span><span class="ln">  <span class="k">"options"</span>: [<span class="s">"45.00"</span>, <span class="s">"4.50"</span>],</span><span class="ln">  <span class="k">"max_price"</span>: <span class="s">"0.25"</span></span><span class="ln">}</span></pre></div>
      </div>
      <div class="card card-flat" style="padding:14px;margin-top:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px"><b style="font-size:12.5px">Quorum response</b><span class="badge badge-good">${ic('check')} Resolved · 2 of 2</span></div>
        <div class="code code-light"><pre><span class="ln">{</span><span class="ln">  <span class="k">"answer"</span>: <span class="s">"45.00"</span>,</span><span class="ln">  <span class="k">"confidence"</span>: <span class="n">0.99</span>,</span><span class="ln">  <span class="k">"agreement"</span>: <span class="s">"unanimous"</span>,</span><span class="ln">  <span class="k">"responders"</span>: <span class="n">2</span>,</span><span class="ln">  <span class="k">"latency_ms"</span>: <span class="n">5312</span></span><span class="ln">}</span></pre></div>
      </div>
    </div></div>

    <div class="card card-lg">
      <b class="h-md">Why it works</b>
      <div style="display:flex;flex-direction:column;gap:20px;margin-top:20px">
        ${[
          ['shield', 'More accurate', 'Independent answers cancel out one person having a bad moment.'],
          ['link', 'More reliable', 'A worker who hedges gets a second opinion bought rather than trusted.'],
          ['bolt', 'More transparent', 'Every answer carries its confidence, its responders and their standing.'],
          ['target', 'Built for real apps', 'Structured responses and an automatic refund when nothing resolves.'],
        ].map(([i, t, d]) => `<div style="display:flex;gap:12px"><span class="ico ico-sm">${ic(i)}</span><div><b class="h-sm" style="display:block">${t}</b><span class="feat"><span style="margin-top:3px">${d}</span></span></div></div>`).join('')}
      </div>
    </div>
  </div>
</div></section>`

const howItDecides = () => page({
  title: 'How it decides',
  body: `${nav('product')}<main>
${decidesSection()}
${foot()}</main>`,
})

/* ---------------------------------------------------------- developers -- */

const devSection = () => `<section class="section"><div class="shell split">
  <div>
    <p class="eyebrow">Developer experience</p>
    <h1 class="h-xl">One tool call.<br/>Real people. Real answers.</h1>
    <p class="lede">Add Quorum to your agent in minutes. Here is a complete example: ask a question, get a verified answer from a real person, and handle the response in your application.</p>
    <ul class="feats">
      ${[['bolt', 'Single API call', 'No orchestration. No queue to manage.'], ['clock', '~6 second average', 'From question to verified answer.'], ['money', '$0.02 per answer', 'Paid straight to the worker\u2019s own account.'], ['check', 'Verified response', 'With a confidence score and an audit trail.']]
        .map(([i, t, d]) => `<li class="feat"><span class="ico ico-sm">${ic(i)}</span><b>${t}</b><span>${d}</span></li>`).join('')}
    </ul>
  </div>

  <div>
    <div class="split-even" style="grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:18px">
      <div class="code">
        <div class="code-tabs" role="tablist">
          ${['cURL', 'Node.js', 'Python', 'Go'].map((t, x) => `<button role="tab" aria-selected="${x === 0}">${t}</button>`).join('')}
          <button class="code-copy">${ic('file')} Copy</button>
        </div>
        <pre><span class="ln"><span class="f">curl</span> https://api.quorum.dev/v1/ask \\</span><span class="ln">  -X POST \\</span><span class="ln">  -H <span class="s">"Authorization: Payment &lt;credential&gt;"</span> \\</span><span class="ln">  -H <span class="s">"Content-Type: application/json"</span> \\</span><span class="ln">  -d <span class="s">'{</span></span><span class="ln"><span class="s">    "capability": "checking_something_is_real",</span></span><span class="ln"><span class="s">    "question": "Is this a valid postal address?",</span></span><span class="ln"><span class="s">    "options": ["yes", "no"],</span></span><span class="ln"><span class="s">    "context": { "text": "123 Main St, Austin, TX 78701" },</span></span><span class="ln"><span class="s">    "max_price": "0.25"</span></span><span class="ln"><span class="s">  }'</span></span></pre>
      </div>

      <div class="card card-lg">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:14px"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:var(--good);display:inline-block"></span><b style="font-size:13px">Response</b><span class="badge badge-good" style="margin-left:auto">200 OK</span></div>
        <div class="code code-light"><pre><span class="ln">{</span><span class="ln"> <span class="k">"answer"</span>: <span class="s">"yes"</span>,</span><span class="ln"> <span class="k">"confidence"</span>: <span class="n">0.98</span>,</span><span class="ln"> <span class="k">"responders"</span>: <span class="n">2</span>,</span><span class="ln"> <span class="k">"agreement"</span>: <span class="s">"unanimous"</span>,</span><span class="ln"> <span class="k">"latency_ms"</span>: <span class="n">6120</span>,</span><span class="ln"> <span class="k">"receipts"</span>: [<span class="s">"0x5555c6…"</span>]</span><span class="ln">}</span></pre></div>
        <a href="#" style="display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-size:12.5px;font-weight:600;margin-top:14px">View transaction ${ic('arrow')}</a>
        <p class="dim" style="margin:6px 0 0">Inspect the wage payment and the worker record.</p>
      </div>
    </div>

    <div class="card card-lg" style="margin-top:18px">
      <p class="eyebrow" style="margin-bottom:8px">Real example</p>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap">
        <div><b class="h-md">Validate an address</b><p class="dim" style="margin:6px 0 0;max-width:62ch">A verification question. Quorum routes it to workers with a record on that kind of judgment, gets an answer in about six seconds, and returns a structured response.</p></div>
        <a class="btn btn-ghost" href="docs/index.html">${ic('book')} View full API reference</a>
      </div>
    </div>
  </div>
</div></section>`

const developers = () => page({
  title: 'Developer experience',
  body: `${nav('dev')}<main>
${devSection()}
${foot()}</main>`,
})

/* -------------------------------------------------------- capabilities -- */

const capsGridSection = () => `<section class="section-tight" style="background:var(--surface);border-block:1px solid var(--border)"><div class="shell">
  <p class="eyebrow">The five capabilities</p>
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap">
    <div><h2 class="h-lg">What Quorum can do.</h2><p class="lede">Each one is a question a person answers in seconds from what you send. None of them needs access to your systems.</p></div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:34px">
    ${CAPS.map((c) => capCard(...c)).join('')}
  </div>
</div></section>`

const capabilities = () => page({
  title: 'Capabilities',
  body: `${nav('product')}<main>
<section class="section"><div class="shell split">
  <div>
    <p class="eyebrow">Capabilities</p>
    <h1 class="h-xl"><span data-live="capabilities">Five</span> capabilities.<br/>One call each.</h1>
    <p class="lede">Every capability is a kind of judgment a person can make from evidence you already hold. Each routes to the workers with the best record on that kind, and each returns a structured answer with its confidence.</p>
    <ul class="checks">${['More accurate', 'More transparent', 'More reliable', 'Less friction', 'Built for real use'].map((t) => `<li>${ic('check')}${t}</li>`).join('')}</ul>
  </div>

  <div class="panel"><div class="panel-body">
    <div class="panel-head" style="border:0;padding:0 0 14px"><span class="mark">${MARK}</span>Quorum</div>
    <div class="card card-flat" style="display:flex;align-items:center;gap:10px;padding:12px 14px">
      <span style="font-size:13px;color:var(--ink-2)">Is the total on this receipt 45.00 or 4.50?</span>
      <span class="ico ico-sm" style="margin-left:auto;background:var(--accent);color:#fff">${ic('arrow')}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
      ${[['Routing to workers with a record on this', true], ['Amara answered \u2014 confidence 0.93', true], ['Second opinion bought', true], ['Joel agreed \u2014 confidence 0.99', false]]
        .map(([t, done]) => `<div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-2)"><span class="ico ico-sm ${done ? 'ico-good' : ''}" style="width:18px;height:18px;border-radius:50%">${ic('check')}</span>${t}</div>`).join('')}
    </div>
  </div></div>
</div></section>

${capsGridSection()}
${foot()}</main>`,
})

export { howItDecides, developers, capabilities, foot, CAPS, capCard, decidesSection, devSection, capsGridSection }
