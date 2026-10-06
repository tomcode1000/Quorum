import { ic } from './build.mjs'
import { docsPage } from './pages-docs.mjs'

/**
 * The rest of the docs: core concepts and the reference.
 *
 * Same chrome and the same blocks as the pages beside them (cards, the .tbl
 * table, .code panels, note boxes). Every number here is the engine's own:
 * the floors from core/pricing.ts, the trust curve from core/quorum.ts, the
 * assessment from core/onboarding.ts, the routes from the gateway.
 */

/* --------------------------------------------------------------- blocks -- */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A JSON value, highlighted the way the hand-written panels are. */
const hl = (value, indent = '') => {
  if (value === null) return '<span class="n">null</span>'
  if (typeof value === 'string') return `<span class="s">"${esc(value)}"</span>`
  if (typeof value !== 'object') return `<span class="n">${value}</span>`
  const inner = indent + '  '
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== 'object' || v === null)) return `[${value.map((v) => hl(v)).join(', ')}]`
    return `[\n${value.map((v) => inner + hl(v, inner)).join(',\n')}\n${indent}]`
  }
  const entries = Object.entries(value)
  if (entries.length <= 2 && JSON.stringify(value).length < 34 && entries.every(([, v]) => typeof v !== 'object' || v === null))
    return `{ ${entries.map(([k, v]) => `<span class="k">"${k}"</span>: ${hl(v)}`).join(', ')} }`
  return `{\n${entries.map(([k, v]) => `${inner}<span class="k">"${k}"</span>: ${hl(v, inner)}`).join(',\n')}\n${indent}}`
}

const lines = (text) => text.split('\n').map((l) => `<span class="ln">${l}</span>`).join('')

const code = (tab, body, style = '') =>
  `<div class="code"${style ? ` style="${style}"` : ''}><div class="code-tabs"><button role="tab" aria-selected="true">${tab}</button><button class="code-copy">Copy</button></div><pre>${lines(body)}</pre></div>`

const json = (tab, value, style) => code(tab, hl(value), style)

const table = (head, rows) =>
  `<div class="card" style="padding:0;overflow:hidden;margin-top:12px"><table class="tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((cell, x) => `<td${x ? ' class="dim"' : ''}>${cell}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`

const cards = (items, min = 170) =>
  `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(${min}px,1fr));gap:14px;margin-top:22px">${items
    .map(([i, t, d]) => `<div class="card"><span class="ico ico-sm">${ic(i)}</span><b class="h-sm" style="display:block;margin:11px 0 4px">${t}</b><span class="feat"><span>${d}</span></span></div>`)
    .join('')}</div>`

const note = (icon, html) => `<div class="note-box" style="margin-top:20px">${ic(icon)}<span>${html}</span></div>`

const h2 = (id, text, first = false) => `<h2 class="h-md" id="${id}" style="margin-top:${first ? 30 : 38}px">${text}</h2>`
const p = (html) => `<p class="muted" style="margin:8px 0 14px;font-size:14px;line-height:1.65">${html}</p>`
const c = (t) => `<code>${t}</code>`
const badge = (t, kind = '') => `<span class="badge${kind ? ` badge-${kind}` : ''}">${t}</span>`
const method = (m) => badge(m, m === 'GET' ? 'good' : 'accent')

/* -------------------------------------------------------------- workers -- */

const workers = () => docsPage({
  title: 'Workers', current: 'workers.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Docs</a>
    <p class="eyebrow">Core concepts</p>
    <h1 class="h-lg" id="s0">Workers</h1>
    <p class="lede">The people who answer. Nobody is sent your question because they happen to be online: each one has passed an assessment in that capability, and keeps a record that decides whether they are asked again.</p>
    ${cards([['id', 'Passkey sign-in', 'No password, no deposit, no stake.'], ['check', 'Assessed per capability', 'Five known-answer questions; four right to pass.'], ['target', 'A record per capability', 'Agreement is tracked separately for each kind.'], ['money', 'Paid per answer', '20¢ on chain, the moment it is accepted.']])}
    ${h2('s1', 'Getting in')}
    ${p('A worker signs in with a passkey and takes an assessment for each capability they want to answer: five questions whose answers are already known. Four of five is a pass. Passing opens that capability, and the questions that reach them from then on are real ones.')}
    <ol class="steps" style="margin:6px 0 0">
      ${[['Sign in', 'A passkey on their phone. No password and nothing to deposit.'], ['Take the assessment', 'Five known-answer questions in the capability they chose.'], ['Answer real questions', 'Only in the capabilities they passed, and only while their record holds.']]
        .map(([t, d], x) => `<li class="step" style="grid-template-columns:24px minmax(0,1fr)"><span class="step-n">${x + 1}</span><div class="step-b"><b class="h-sm">${t}</b><p>${d}</p></div></li>`).join('')}
    </ol>
    ${h2('s2', 'What a worker sees')}
    ${p(`Your question, phrased as you sent it, the evidence you attached in ${c('context')}, and your options as buttons. A screenshot you sent as ${c('image_base64')} is shown in full above the options. They answer with a tap, and nothing else from your system reaches them.`)}
    ${h2('s3', 'How a record is kept')}
    ${p('Every answer is scored afterwards against the answer the question settled on. Agreeing raises a worker’s reliability in that capability; disagreeing lowers it. A new worker starts from a cautious prior, and a record counts as established after 50 scored answers.')}
    ${table(['Rule', 'Value', 'Why'], [
      ['Reliability range', '0.50 – 0.98', 'Nobody is trusted as a coin flip or as infallible.'],
      ['Established after', '50 answers', 'Until then, an answer weighs less.'],
      ['Known-answer checks', 'About 1 in 20 questions', 'Mixed into live work, so a record keeps being tested.'],
      ['Rate limit', '25 a minute', 'Answering faster than reading is flagged, not paid more.'],
      ['Wage', '20¢ an answer', 'Paid even when your question ends up refunded.'],
    ])}
    ${note('shield', 'Answering too fast to have read the question, or failing known-answer checks, counts against a worker. One identity per passkey is a weak defence against one person running many accounts, and the <a href="../proof.html" style="color:var(--accent)">limits</a> say so.')}`,
})

/* ----------------------------------------------------------- confidence -- */

const confidence = () => docsPage({
  title: 'Confidence', current: 'confidence.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Docs</a>
    <p class="eyebrow">Core concepts</p>
    <h1 class="h-lg" id="s0">Confidence</h1>
    <p class="lede">${c('confidence')} is the probability that the answer is right, worked out from who answered and their records. The price you pay sets how high it must be before Quorum returns anything at all.</p>
    ${h2('s1', 'The price sets the bar', true)}
    ${p('An answer is returned only once confidence clears the target for its price. Paying more buys a surer answer, and the extra people it takes to reach it.')}
    ${table(['Price', 'Target confidence', 'In practice'], [
      ['50¢', '0.90', 'Often one proven worker.'],
      ['$1.00', '0.95', 'One strong record, or two who agree.'],
      ['$2.50', '0.98', 'Usually two who agree.'],
      ['$5.00', '0.99', 'As sure as the engine will go.'],
    ])}
    ${h2('s2', 'Only as many people as it takes')}
    ${p('One worker is asked first: the one with the best record in that capability. If their record alone clears the bar, the question resolves on their answer. If not, a second is bought, and so on, up to five. Every answer is weighted by the record behind it, so two proven workers who agree count for more than three new ones.')}
    <div class="flow" style="margin:22px 0 6px">
      ${[['user', 'Ask one', 'The best record first'], ['gauge', 'Check the bar', 'Is confidence high enough?'], ['users', 'Ask another', 'Only if it is not'], ['spark', 'Return', 'Or refund, at five']].map(([i, t, s], x) => `${x ? `<span class="flow-arrow">${ic('arrow')}</span>` : ''}<div class="flow-step"><span class="ico">${ic(i)}</span><b>${t}</b><span>${s}</span></div>`).join('')}
    </div>
    ${h2('s3', 'Reading it')}
    ${table(['Field', 'Meaning'], [
      [c('confidence'), 'Posterior probability that the answer is correct, between 0 and 1.'],
      [c('agreement'), 'unanimous, majority, split or none: how the answers fell.'],
      [c('responders'), 'How many people answered.'],
      [c('evidence'), 'Each answer, with the reputation of the person who gave it.'],
    ])}
    ${note('warn', `When people disagree, the bar is not lowered to produce an answer. You get ${badge('no_consensus', 'bad')} and a refund, because two careful people disagreeing means the question is genuinely ambiguous, and that is worth knowing.`)}`,
})

/* -------------------------------------------------------------- pricing -- */

const pricing = () => docsPage({
  title: 'Pricing & refunds', current: 'pricing.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Docs</a>
    <p class="eyebrow">Core concepts</p>
    <h1 class="h-lg" id="s0">Pricing &amp; refunds</h1>
    <p class="lede">You pay for a question by what a wrong answer would cost you, not by the minute. Between 50¢ and $5, paid per question over HTTP 402, and refunded whenever no answer is reached.</p>
    ${cards([['target', 'Priced by the mistake', 'Send cost_of_error and the price follows.'], ['money', '50¢ to $5', 'A floor per capability, one ceiling.'], ['shield', 'Refunded on failure', 'no_consensus and timeout are refunded on chain.'], ['key', 'No account', 'Each question is paid as it is asked.']])}
    ${h2('s1', 'Two ways to set the price')}
    ${p(`Send ${c('cost_of_error')}: what acting on a wrong answer would cost you, in dollars. Quorum picks the price that minimises your expected cost, and if you also send ${c('caller_confidence')}, it tells you when your own guess is the better bet, with ${badge('not_worth_asking')} and no charge. Or send ${c('max_price')}: your ceiling, charged in full up to $5.`)}
    <div class="split-even" style="gap:20px;margin-top:6px">
      ${json('cost_of_error', { cost_of_error: '40.50', caller_confidence: 0.41 })}
      ${json('max_price', { max_price: '2.50' })}
    </div>
    ${h2('s2', 'Floors')}
    ${p('The least a question can cost, by capability. A wider answer space (more than four options, or a number) adds 20¢.')}
    ${table(['Capability', 'kind', 'Floor'], [
      ['Checking something is real', c('verify'), '50¢'],
      ['Matching records', c('match'), '80¢'],
      ['Telling readings apart', c('disambiguate'), '80¢'],
      ['Categorising', c('categorise'), '80¢'],
      ['Comparing', c('compare'), '$1.20'],
    ])}
    ${p(`A ceiling below the floor is refused with ${badge('409')} and the floor attached, before you pay anything.`)}
    ${h2('s3', 'How payment works')}
    <ol class="steps" style="margin:6px 0 0">
      ${[['Ask', `POST the question. You get ${c('402')} with a quote, a payment challenge and a ${c('claim_url')}. The quote holds for 60 seconds.`], ['Pay', 'Pay the challenge over MPP on Tempo, in stablecoin.'], ['Claim', `POST the ${c('claim_url')} with the payment credential. It blocks until the question settles.`]]
        .map(([t, d], x) => `<li class="step" style="grid-template-columns:24px minmax(0,1fr)"><span class="step-n">${x + 1}</span><div class="step-b"><b class="h-sm">${t}</b><p>${d}</p></div></li>`).join('')}
    </ol>
    ${h2('s4', 'Refunds')}
    ${table(['Status', 'Charged?', 'What happens'], [
      [badge('resolved', 'good'), 'Yes', 'You keep the answer.'],
      [badge('no_consensus', 'bad'), 'Refunded', `The price is sent back on chain; ${c('refunded')} carries the transaction.`],
      [badge('timeout', 'bad'), 'Refunded', 'Nobody answered in time. Refunded the same way.'],
      [badge('refused'), 'Never charged', 'Nobody qualified was online. Turned away before payment.'],
      [badge('not_worth_asking', 'good'), 'Never charged', 'Your own guess was the better bet.'],
    ])}
    ${note('users', 'Workers are paid for their answers even when your question is refunded. They did the work; the question was what failed.')}`,
})

/* ------------------------------------------------------------ endpoints -- */

const ENDPOINTS = [
  ['POST', '/v1/questions', 'Ask a question, or forward an A2A input-required task. Returns 402 with a quote.'],
  ['POST', '/v1/questions/{id}/claim', 'Pay and wait. Returns the resolution, or 202 in callback mode.'],
  ['GET', '/v1/questions/{id}', 'Re-read a recent resolution, for a caller whose connection dropped.'],
  ['GET', '/v1/capabilities', 'The capability catalog: prices, the wage, and how many workers are online.'],
  ['POST', '/v1/capabilities/escalations', 'Open an escalation for work that outlives a request.'],
  ['GET', '/v1/capabilities/escalations/{id}/result', 'Collect an escalation result; wait up to 2 minutes with wait_ms.'],
  ['POST', '/v1/capabilities/escalations/{id}/cancel', 'Withdraw an escalation.'],
  ['GET', '/v1/media/{id}', 'An image you sent inline, as the worker sees it.'],
  ['GET', '/.well-known/agent-card.json', 'The A2A agent card.'],
  ['GET', '/.well-known/mpp-service.json', 'The MPP payment manifest.'],
  ['GET', '/health', 'Liveness, network and workers online.'],
  ['GET', '/docs', 'These docs, as markdown, for an agent to read.'],
]

const endpoints = () => docsPage({
  title: 'Endpoints', current: 'endpoints.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Docs</a>
    <p class="eyebrow">Reference</p>
    <h1 class="h-lg" id="s0">Endpoints</h1>
    <p class="lede">Every route the gateway serves to a caller. JSON in and out, no API key: a question is paid for as it is asked.</p>
    ${table(['Method', 'Path', 'What it does'], ENDPOINTS.map(([m, path, d]) => [method(m), `<code>${path}</code>`, d]))}
    ${h2('s1', 'POST /v1/questions')}
    ${p(`The native shape below, or an A2A task in ${c('input-required')} with Quorum’s settings under ${c('metadata["dev.quorum.resolver"]')}. Fields are listed under <a href="schemas.html" style="color:var(--accent)">Schemas</a>.`)}
    <div class="split-even" style="gap:20px">
      ${json('Request', { kind: 'disambiguate', question: 'Is the total 45.00 or 4.50?', answer_schema: { type: 'enum', options: ['45.00', '4.50'] }, context: { image_base64: 'iVBORw0KGgo…' }, deadline_ms: 30000, cost_of_error: '40.50' })}
      ${json('402 Payment Required', { question_id: 'q_9f2a…', quote: '1.00', quote_cents: 100, claim_url: '…/v1/questions/q_9f2a…/claim', expires_in_ms: 60000, workers_online: 4, payment: '{ … }' })}
    </div>
    ${h2('s2', 'POST /v1/questions/{id}/claim')}
    ${p(`Send the payment credential in ${c('Authorization: Payment …')}. The connection is held until the question settles or ${c('deadline_ms')} passes, then returns the <a href="response.html" style="color:var(--accent)">response</a>. In callback mode it returns ${c('202')} at once and the answer is posted to your ${c('callback_url')}.`)}
    ${code('cURL', `curl -X POST $QUORUM_URL/v1/questions/q_9f2a…/claim \\\n  -H <span class="s">"Authorization: Payment &lt;credential&gt;"</span>`)}
    ${h2('s3', 'MCP')}
    ${p(`The same question as a tool call: ${c('ask_human')} takes the fields of ${c('POST /v1/questions')} and returns the answer as text an agent can act on. For longer work there are ${c('discover_capabilities')}, ${c('create_human_escalation')}, ${c('get_escalation_status')}, ${c('get_escalation_result')} and ${c('cancel_escalation')}.`)}
    ${note('book', `The gateway serves this reference as markdown at ${c('/docs')}, so an agent can read it for itself.`)}`,
})

/* -------------------------------------------------------------- schemas -- */

const schemas = () => docsPage({
  title: 'Schemas', current: 'schemas.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Docs</a>
    <p class="eyebrow">Reference</p>
    <h1 class="h-lg" id="s0">Schemas</h1>
    <p class="lede">The shapes Quorum reads and returns. Answers are always constrained: a person picks one of your options, a yes or no, or a number, never free text, so agreement can be measured.</p>
    ${h2('s1', 'Question', true)}
    ${table(['Field', 'Type', 'Required', 'Description'], [
      [c('kind'), 'string', badge('Yes', 'good'), 'disambiguate, verify, match, categorise or compare.'],
      [c('question'), 'string', badge('Yes', 'good'), '3 to 500 characters, phrased for someone with no context on your system.'],
      [c('answer_schema'), 'object', badge('Yes', 'good'), 'See Answer schema below.'],
      [c('deadline_ms'), 'number', badge('Yes', 'good'), 'Up to 5 minutes held; up to 24 hours in callback mode.'],
      [c('context'), 'object', 'No', 'See Context below.'],
      [c('cost_of_error'), 'string', 'One of', 'What a wrong answer would cost you, in dollars.'],
      [c('max_price'), 'string', 'these two', 'Your ceiling in dollars, up to 5.00.'],
      [c('caller_confidence'), 'number', 'No', 'How sure you are of your own guess, 0 to 1.'],
      [c('mode'), 'string', 'No', 'blocking (default) or callback.'],
      [c('callback_url'), 'string', 'No', 'Required in callback mode.'],
      [c('task_ref'), 'string', 'No', 'Your own reference, echoed back.'],
    ])}
    ${h2('s2', 'Answer schema')}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:12px">
      ${json('boolean', { type: 'boolean' })}
      ${json('enum', { type: 'enum', options: ['45.00', '4.50'] })}
      ${json('number', { type: 'number', unit: 'kg', tolerance: 0.5 })}
    </div>
    ${p('An enum takes 2 to 12 options. A number answer agrees with another within the tolerance you set.')}
    ${h2('s3', 'Context')}
    ${table(['Field', 'Type', 'Description'], [
      [c('image_url'), 'string', 'A link to an image already on the web, or a data: URI.'],
      [c('image_base64'), 'string', 'The image itself: PNG, JPEG, WebP or GIF, up to 5 MB. Nothing needs hosting; the worker sees it in full.'],
      [c('text'), 'string', 'Text the person needs, such as a store name and domain.'],
      [c('extracted'), 'any', 'What your agent read, shown to the person as “What the agent read”.'],
    ])}
    ${p(`Over A2A, attach the image as a file part, with either ${c('uri')} or ${c('bytes')}.`)}
    ${h2('s4', 'Resolution')}
    ${json('200 OK', { question_id: 'q_9f2a…', status: 'resolved', answer: '45.00', confidence: 0.99, responders: 2, agreement: 'unanimous', latency_ms: 5312, evidence: [{ worker: 'w_8812', answer: '45.00', reputation: 0.96 }], wages_paid_cents: 40, receipts: [{ worker: 'w_8812', amount_cents: 20, tx: '0x5555c6…', explorer: 'https://explore…' }] }, 'margin-top:12px')}
    ${note('file', `When the question is refunded, a ${c('refunded')} object carries the amount and its transaction.`)}`,
})

/* --------------------------------------------------------------- errors -- */

const errors = () => docsPage({
  title: 'Errors', current: 'errors.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Docs</a>
    <p class="eyebrow">Reference</p>
    <h1 class="h-lg" id="s0">Errors</h1>
    <p class="lede">Every error is JSON with a plain-English ${c('error')} field, written to be acted on. Most arrive before payment, so a refused question never costs anything.</p>
    ${h2('s1', 'HTTP status codes', true)}
    ${table(['Code', 'When', 'What to do'], [
      [badge('400', 'bad'), 'The body is not JSON, a field is missing or out of range, or an image is not a PNG, JPEG, WebP or GIF under 5 MB. issues lists each problem.', 'Fix the request.'],
      [badge('402', 'accent'), 'Expected: the quote and payment challenge.', 'Pay it, then call the claim_url.'],
      [badge('404'), 'Unknown or expired question id.', 'Ask again for a new quote.'],
      [badge('409', 'bad'), 'Your max_price is below the floor for that question. quote carries the floor.', 'Raise the ceiling, or proceed without asking.'],
      [badge('410'), 'The quote expired before you claimed it (60 seconds).', 'Ask again.'],
      [badge('503', 'bad'), 'Nobody who passed that capability is online. Nothing was charged.', 'Retry after retry_after_ms, or use callback mode to wait for someone.'],
    ])}
    ${h2('s2', 'Statuses that are not errors')}
    ${p(`A ${c('200')} can still carry no answer. Check ${c('status')} before you use ${c('answer')}.`)}
    ${table(['Status', 'Meaning'], [
      [badge('no_consensus', 'bad'), 'People disagreed. Refunded.'],
      [badge('timeout', 'bad'), 'Nobody answered in time. Refunded.'],
      [badge('refused', 'bad'), 'The question could not be served. Not charged.'],
      [badge('not_worth_asking', 'good'), 'Your guess is the better bet. Not charged.'],
    ])}
    ${h2('s3', 'Example')}
    ${json('400 Bad Request', { error: 'request does not match the expected shape', issues: [{ path: 'deadline_ms', message: 'Invalid input: expected number, received undefined' }] }, 'margin-top:12px')}`,
})

/* ----------------------------------------------------------------- help -- */

const help = () => docsPage({
  title: 'Get help', current: 'help.html',
  body: `<a class="back" href="index.html">${ic('arrow')} Docs</a>
    <p class="eyebrow">Need help?</p>
    <h1 class="h-lg" id="s0">Get help</h1>
    <p class="lede">Quorum is built in the open. Questions, bugs and requests for a new capability all go to the same place.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:26px">
      ${[['code', 'Open an issue', 'Bugs, questions and feature requests, on GitHub.', 'https://github.com/tomcode1000/Quorum/issues'], ['book', 'Read the source', 'The engine, the gateway and these docs.', 'https://github.com/tomcode1000/Quorum'], ['bolt', 'Start with the quickstart', 'Your first request, step by step.', 'quickstart.html'], ['warn', 'Check the errors', 'What each code means and what to do.', 'errors.html']]
        .map(([i, t, d, href]) => `<a class="card" href="${href}" style="display:flex;gap:11px;align-items:flex-start"><span class="ico ico-sm">${ic(i)}</span><div><b style="font-size:13px;display:block">${t}</b><span class="dim" style="font-size:11.5px">${d}</span></div><span style="margin-left:auto;color:var(--ink-5)">${ic('arrow')}</span></a>`).join('')}
    </div>
    ${h2('s1', 'When you open an issue')}
    ${p(`Include the ${c('question_id')}, the status you got back, and the request body with anything private taken out. A question stays in the gateway’s memory for a few minutes after it settles, and its wage transactions stay on chain for good.`)}`,
})

export { workers, confidence, pricing, endpoints, schemas, errors, help }
