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
  <span class="badge" data-cap-state>Checking</span></div>
  <div class="dim" style="margin-top:14px;font-size:11px;letter-spacing:.09em">${n}</div>
  <b class="h-sm" style="display:block;margin:3px 0 6px">${name}</b>
  <span class="feat"><span>${desc}</span></span>
  <span style="display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-size:12.5px;font-weight:600;margin-top:12px">Learn more <svg width="11" height="11" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.4 9h11.2M10.2 4.6 14.6 9l-4.4 4.4"/></svg></span>
</a>`

/* ids match the gateway catalog, so live.js can price each card from it. */
const CAPS = [
  ['01', 'swap', 'Telling readings apart', 'When the OCR misread it, every model after it reads the same mistake.', 'capability-readings.html', 'disambiguate'],
  ['02', 'shield', 'Checking something is real', 'A lookalike is built to pass the checks a model can run.', 'capability-real.html', 'verify'],
  ['03', 'link', 'Matching records', 'A 0.93 score does not say which side of &ldquo;the same&rdquo; it is on.', 'capability-matching.html', 'match_entity'],
  ['04', 'tag', 'Categorising', 'Where a category ends is a rule people agreed, not a fact in the data.', 'capability-categorising.html', 'categorise'],
  ['05', 'list', 'Comparing', 'Your agent wrote both drafts. It is the worst judge of which is better.', 'capability-comparing.html', 'compare_outputs'],
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
        <div class="code code-light"><pre><span class="ln">{</span><span class="ln">  <span class="k">"kind"</span>: <span class="s">"disambiguate"</span>,</span><span class="ln">  <span class="k">"question"</span>: <span class="s">"Is the total 45.00 or 4.50?"</span>,</span><span class="ln">  <span class="k">"answer_schema"</span>: { <span class="k">"type"</span>: <span class="s">"enum"</span>, <span class="k">"options"</span>: [<span class="s">"45.00"</span>, <span class="s">"4.50"</span>] },</span><span class="ln">  <span class="k">"cost_of_error"</span>: <span class="s">"40.50"</span>,</span><span class="ln">  <span class="k">"caller_confidence"</span>: <span class="n">0.41</span></span><span class="ln">}</span></pre></div>
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
          ['users', 'An uncorrelated check', 'Retries and bigger models share your agent&rsquo;s blind spot. A person looking at the evidence does not.'],
          ['target', 'Priced by the mistake', 'Send what being wrong would cost. The price, and the certainty it buys, follow from it.'],
          ['shield', 'Only as many people as it takes', 'A proven worker can settle it alone. A second is bought only when the first cannot.'],
          ['spark', 'No answer is an answer', 'If people disagree, the question is genuinely ambiguous. You are told so, and refunded.'],
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
    <p class="lede">Call it at the moment your agent is about to act on something it cannot check: forward the <code>input-required</code> status it already emits, or send the question directly. Say what a mistake would cost, and the price follows.</p>
    <ul class="feats">
      ${[['bolt', 'A2A, MCP or HTTP', 'Forward input-required, call a tool, or POST.'], ['clock', 'About six seconds', 'Blocking, like any other call your agent makes.'], ['money', 'From 50\u00a2 a question', 'Set by what being wrong would cost, up to $5.'], ['check', 'Confidence you can check', 'Who answered, how they agreed, and every payment on chain.']]
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
        <pre><span class="ln"><span class="f">curl</span> $QUORUM_URL/v1/questions \\</span><span class="ln">  -X POST \\</span><span class="ln">  -H <span class="s">"Content-Type: application/json"</span> \\</span><span class="ln">  -d <span class="s">'{</span></span><span class="ln"><span class="s">    "kind": "verify",</span></span><span class="ln"><span class="s">    "question": "Is this the brand\u2019s own store?",</span></span><span class="ln"><span class="s">    "answer_schema": { "type": "boolean" },</span></span><span class="ln"><span class="s">    "context": { "text": "Nike Official Store, nike-outlet-sale.shop" },</span></span><span class="ln"><span class="s">    "cost_of_error": "180.00",</span></span><span class="ln"><span class="s">    "caller_confidence": 0.9</span></span><span class="ln"><span class="s">  }'</span></span><span class="ln"><span class="c"># 402 with a quote; pay it over MPP on Tempo, then claim.</span></span></pre>
      </div>

      <div class="card card-lg">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:14px"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:var(--good);display:inline-block"></span><b style="font-size:13px">Response</b><span class="badge badge-good" style="margin-left:auto">200 OK</span></div>
        <div class="code code-light"><pre><span class="ln">{</span><span class="ln"> <span class="k">"answer"</span>: <span class="s">"no"</span>,</span><span class="ln"> <span class="k">"confidence"</span>: <span class="n">0.98</span>,</span><span class="ln"> <span class="k">"responders"</span>: <span class="n">2</span>,</span><span class="ln"> <span class="k">"agreement"</span>: <span class="s">"unanimous"</span>,</span><span class="ln"> <span class="k">"latency_ms"</span>: <span class="n">6120</span>,</span><span class="ln"> <span class="k">"receipts"</span>: [<span class="s">"0x5555c6…"</span>]</span><span class="ln">}</span></pre></div>
        <a href="#" style="display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-size:12.5px;font-weight:600;margin-top:14px">View transaction ${ic('arrow')}</a>
        <p class="dim" style="margin:6px 0 0">Inspect the wage payment and the worker record.</p>
      </div>
    </div>

    <div class="card card-lg" style="margin-top:18px">
      <p class="eyebrow" style="margin-bottom:8px">Real example</p>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap">
        <div><b class="h-md">Before a shopping agent pays a lookalike store</b><p class="dim" style="margin:6px 0 0;max-width:62ch">Every signal the agent can compute says the store is real, because that is what it was built to make them say. The question goes to people proven at spotting fakes, and the order is held on their answer.</p></div>
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
    <div><h2 class="h-lg">What Quorum can do.</h2><p class="lede">Each one is a kind of mistake an agent cannot catch in itself, because every check it could run makes the same mistake. A person answers from what you send, in seconds, and nothing else leaves your system.</p></div>
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
    <p class="lede">Each is a place where an agent&rsquo;s own checks share its blind spot. The question goes only to people who passed an assessment in that capability, and the answer comes back as one of the options you sent, with its confidence.</p>
    <ul class="checks">${['Priced by the cost of error', 'Answered by people assessed in it', 'One of your options, never free text', 'Refunded when people disagree'].map((t) => `<li>${ic('check')}${t}</li>`).join('')}</ul>
  </div>

  <div class="panel"><div class="panel-body">
    <div class="panel-head" style="border:0;padding:0 0 14px"><span class="mark">${MARK}</span>Quorum</div>
    <div class="card card-flat" style="display:flex;align-items:center;gap:10px;padding:12px 14px">
      <span style="font-size:13px;color:var(--ink-2)">Is the total on this receipt 45.00 or 4.50?</span>
      <span class="ico ico-sm" style="margin-left:auto;background:var(--accent);color:#fff">${ic('arrow')}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
      ${[['Routing to workers with a record on this', true], ['Amara answered, confidence 0.93', true], ['Second opinion bought', true], ['Joel agreed, confidence 0.99', false]]
        .map(([t, done]) => `<div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-2)"><span class="ico ico-sm ${done ? 'ico-good' : ''}" style="width:18px;height:18px;border-radius:50%">${ic('check')}</span>${t}</div>`).join('')}
    </div>
  </div></div>
</div></section>

${capsGridSection()}
${foot()}</main>`,
})

export { howItDecides, developers, capabilities, foot, CAPS, capCard, decidesSection, devSection, capsGridSection }
