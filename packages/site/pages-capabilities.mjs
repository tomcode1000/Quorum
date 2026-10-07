import { ic, MARK, nav, page } from './build.mjs'
import { foot } from './pages-marketing.mjs'

/**
 * The five capability pages.
 *
 * One template, five sets of content. They differ in what the worker is looking
 * at and what comes back, never in structure — which is the point: a caller
 * learning one capability has learned all five.
 */

const arrow = `<span class="flow-arrow" style="align-self:center;padding:0">${ic('arrow')}</span>`

const capabilityPage = ({ n, slug, tag, title, lede, feats, input, analysis, result, steps, example, crypto }) =>
  page({
    title,
    body: `${nav('product')}<main>
<section class="section"><div class="shell">
  <a class="back" href="capabilities.html">${ic('arrowLeft')}All capabilities</a>
  <div class="split" style="align-items:start">
    <div>
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:18px"><span class="tag">${n}</span><span class="tag tag-accent">${tag}</span></div>
      <h1 class="h-xl">${title}</h1>
      <p class="lede">${lede}</p>
      <ul class="feats">
        ${feats.map(([i, t, d]) => `<li class="feat"><span class="ico ico-sm">${ic(i)}</span><b>${t}</b><span>${d}</span></li>`).join('')}
      </ul>
    </div>

    <div style="display:grid;grid-template-columns:minmax(0,.95fr) auto minmax(0,1.25fr) minmax(0,.85fr);gap:14px;align-items:start">
      <div class="card">${input}</div>
      ${arrow}
      <div class="panel"><div class="panel-head"><span class="mark">${MARK}</span>Quorum&rsquo;s analysis</div><div class="panel-body">${analysis}</div></div>
      <div class="card" style="background:var(--good-wash);border-color:#cfead9">${result}</div>
    </div>
  </div>
</div></section>

<section class="section-tight" style="background:var(--surface);border-block:1px solid var(--border)"><div class="shell split">
  <div>
    <p class="eyebrow">How it works</p>
    <h2 class="h-lg">Step by step.</h2>
    <p class="lede">${example.intro}</p>
    <div class="flow" style="margin-top:28px">
      ${steps.map(([t, d], x) => `${x ? arrow : ''}<div class="flow-step" style="text-align:left"><span class="dim" style="font-size:11px">0${x + 1}</span><b style="margin-top:4px">${t}</b><span>${d}</span></div>`).join('')}
    </div>
  </div>
  <div class="card card-lg">
    <p class="eyebrow" style="display:flex;align-items:center;gap:7px;margin-bottom:10px">${ic('pin')} Real-world example</p>
    <b class="h-md">${example.title}</b>
    <p class="dim" style="margin:10px 0 16px;line-height:1.65">${example.body}</p>
    ${example.panel}
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">${example.tags.map((t) => `<span class="chip">${t}</span>`).join('')}</div>
  </div>
</div></section>
${crypto ? cryptoSection(crypto) : ''}
${foot()}</main>`,
  })

/*
  For crypto agents.

  Each capability with the crypto cases that fall under it. An agent that moves
  money on chain cannot take a payment back, so this is where asking first is
  worth the most. The images are the question bank's own (drawn by
  scripts/bank-images.mjs), so what a reader sees here is what a worker sees.
*/
const cryptoSection = (cases) => `<section class="section-tight"><div class="shell">
  <p class="eyebrow">For crypto agents</p>
  <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap">
    <div><h2 class="h-lg">Where this saves a transaction.</h2><p class="lede">An on-chain payment cannot be taken back, so the moment before the agent signs is the moment to ask.</p></div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:28px">
    ${cases.map(({ title, body, image, agent }) => `<div class="card" style="padding:0;overflow:hidden">${image ? `<div style="height:170px;background:#e9edf3 url(assets/bank/${image}.png) center / cover no-repeat;border-bottom:1px solid var(--border)" role="img" aria-label="${title}"></div>` : ''}<div style="padding:18px 20px"><span class="chip">${agent}</span><b class="h-sm" style="display:block;margin:12px 0 6px">${title}</b><span class="feat"><span>${body}</span></span></div></div>`).join('')}
  </div>
  <div class="note-box" style="margin-top:20px">${ic('clock')}<span><b>The agent holds the transaction, not the market.</b> It asks before it signs and waits about six seconds for the answer. Set <code>deadline_ms</code> to the window you actually have: if nobody answers in time you are refunded, and the agent takes its safe path, which is not to sign.</span></div>
</div></section>`

const row = (label, value, state) =>
  `<div style="display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--border)"><span class="ico ico-sm ${state === 'bad' ? 'ico-bad' : state === 'good' ? 'ico-good' : 'ico-plain'}" style="width:19px;height:19px;border-radius:50%">${ic(state === 'bad' ? 'x' : 'check')}</span><span style="font-size:12.5px;color:var(--ink-2)">${label}</span><span class="badge ${state === 'bad' ? 'badge-bad' : 'badge-good'}" style="margin-left:auto">${value}</span></div>`

const checks = (items) =>
  `<div style="display:flex;flex-direction:column;gap:14px">${items.map(([t, d]) => `<div style="display:flex;gap:10px"><span class="ico ico-sm ico-good" style="width:19px;height:19px;border-radius:50%">${ic('check')}</span><div><b style="font-size:12.5px;display:block">${t}</b><span class="dim" style="font-size:11.5px">${d}</span></div></div>`).join('')}</div>`

const verdict = (title, sub) =>
  `<span class="ico ico-good" style="border-radius:50%">${ic('check')}</span><b class="h-sm" style="display:block;margin:14px 0 6px">${title}</b><p class="dim" style="margin:0;line-height:1.6">${sub}</p>`

/* ------------------------------------------------------------- the five -- */

/*
  What each page argues.

  Every capability exists for one reason: a kind of error an agent cannot catch
  in itself, because every check it could run makes the same error. Each page
  names that blind spot, shows the one question that settles it, shows what the
  engine actually does (who was asked, at what confidence), and ends on an answer
  of the shape the product really returns: one of the options sent, or a yes or
  no, with its confidence. The scenarios deliberately come from different kinds
  of agent, because the problem is not a payments problem. It is any decision an
  agent is about to act on without being able to tell it is wrong.

  The comps drew these pages with a passport authenticity check, a record merge,
  a whole inbox sorted and a contract diff. None of those is what this product
  does, so the panels stay and what is in them is the product's own.
*/

const asked = (lines) =>
  `<p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">What happened</p>${checks(lines)}`

const option = (label, value) =>
  `<div class="card card-flat" style="padding:10px;margin-top:8px"><div class="dim" style="font-size:10.5px;margin-bottom:3px">${label}</div><b style="font-size:13px">${value}</b></div>`

const readings = () => capabilityPage({
  n: '01', slug: 'readings', tag: 'Telling readings apart',
  title: 'Telling readings apart.',
  lede: 'Your OCR turned a smudged &ldquo;4S.00&rdquo; into text, and every model after it reads the same text. Asking again gets the same wrong number with more confidence. A person looks at the image itself and says which reading it is.',
  feats: [
    ['eye', 'Looks at the original', 'The image travels with the question, not the string your extraction made of it.'],
    ['swap', 'One of your readings', 'You send the candidates. The answer is one of them, never a third guess.'],
    ['target', 'Priced by the mistake', 'Send what a wrong figure would cost, and the certainty bought matches it.'],
    ['shield', 'Says when it cannot tell', 'If people disagree, the print is unreadable. You are told so, and refunded.'],
  ],
  input: `<span class="tag">Your agent sends</span><p style="font-size:12.5px;color:var(--ink-2);margin:12px 0 10px">The printed line reads &ldquo;TOTAL 4S.00&rdquo;. Is the total 45.00 or 4.50?</p>
    ${option('Its reading, 0.41 confident', '4.50')}${option('The other reading', '45.00')}`,
  analysis: asked([
    ['Priced from the cost of error', 'A $40.50 mistake buys an answer at 0.96 confidence.'],
    ['Amara looked at the receipt', 'Answered 45.00. One answer reaches 0.926.'],
    ['Joel was asked independently', 'Also 45.00. Together, 0.990.'],
  ]),
  result: verdict('45.00, at 0.990.', 'Two people who had not seen each other&rsquo;s answer read the same total. About five seconds.'),
  steps: [['Send', 'The image and both readings.'], ['Ask', 'Someone proven at reading documents.'], ['Weigh', 'A second look if one is not enough.'], ['Answer', 'One reading, with its confidence.']],
  crypto: [
    { agent: 'Payments agent', image: 'invoice-smudge', title: 'A smudged total on a scanned invoice', body: 'The agent reads $20,500 at 62% confidence. Or is it $2,500? Every reread, and every bigger model, sees the same smudge. A person sees a comma under the ink before $18,000 goes out that can&rsquo;t be taken back.' },
    { agent: 'Treasury agent', title: 'A figure in a screenshot', body: 'A counterparty sends a screenshot of the amount owed. Before paying, a person reads which of the agent&rsquo;s two readings is on the screen.' },
  ],
  example: {
    intro: 'The question is the one your extraction could not settle, with the evidence it was looking at. Nothing else from your system leaves it.',
    title: 'An expense recorded at a tenth of its value.',
    body: 'A finance agent reads a thermal receipt at 0.41 confidence and records $4.50 against a $45.00 purchase. No error is raised, because nothing knows it is wrong. With the question sent to a person, the right figure is back before the entry is posted.',
    panel: `${row('Agent&rsquo;s reading: 4.50', 'Not used', 'bad')}${row('Answer: 45.00, 0.990', 'Posted', 'good')}`,
    tags: ['Document extraction', 'Receipts and invoices', 'Labels and forms'],
  },
})

const real = () => capabilityPage({
  n: '02', slug: 'real', tag: 'Checking something is real',
  title: 'Checking something is real.',
  lede: 'A lookalike is built to pass the checks a model can run: the name matches, the page looks right, the text is fluent. A person sees what the lookalike got wrong, and your agent is told before it acts on it.',
  feats: [
    ['eye', 'Sees what was built to fool a model', 'Swapped letters, borrowed branding, a domain one character off.'],
    ['check', 'A plain yes or no', 'Is this what it claims to be. Nothing to interpret.'],
    ['target', 'Priced by the mistake', 'Checking a store before a $12 order and before a $1,200 one is not the same purchase.'],
    ['shield', 'Evidence stays yours', 'The person sees only what you send with the question.'],
  ],
  input: `<span class="tag">Your agent sends</span><div class="card card-flat" style="padding:12px;margin-top:12px"><div style="display:flex;align-items:center;gap:9px"><span class="ico ico-sm">${ic('globe')}</span><div><b style="font-size:12.5px;display:block">Nike Official Store</b><span class="dim" style="font-size:11px">nike-outlet-sale.shop</span></div></div></div><p class="dim" style="margin:10px 0 0">Is this the brand&rsquo;s own store?</p>`,
  analysis: asked([
    ['The agent&rsquo;s own check passed', 'Name, logo and product photos all match.'],
    ['Amara looked at the listing', 'No: not the brand&rsquo;s domain. 0.926.'],
    ['Joel was asked independently', 'No. Together, 0.990.'],
  ]),
  result: verdict('No. Not the brand&rsquo;s store.', 'Two people agreed independently, 0.990 confidence. The agent does not place the order.'),
  steps: [['Send', 'What the agent is about to trust.'], ['Look', 'A person proven at spotting fakes.'], ['Weigh', 'A second look if one is not enough.'], ['Answer', 'Yes or no, with its confidence.']],
  crypto: [
    { agent: 'Wallet agent', image: 'phishing-dapp', title: 'A fake airdrop site', body: 'The agent is sent a &ldquo;claim your airdrop&rdquo; link that copies Uniswap to the pixel. Connecting would hand over approvals. A person sees it is not the real app.' },
    { agent: 'Shopping agent', image: 'fake-store', title: 'A store that only takes crypto', body: 'A lookalike shop, registered last week, accepts card or crypto only. A person says it is not the brand, before the agent pays.' },
  ],
  example: {
    intro: 'The agent asks at the moment it is about to act on something it cannot verify, and not before.',
    title: 'A shopping agent about to pay a lookalike store.',
    body: 'A buying agent finds the trainers its user asked for, at a good price, on a page that looks exactly like the brand&rsquo;s. Every automated signal says it is the real store, because that is what the page was built to make them say. A person says it is not, and the order goes to the real one.',
    panel: `${row('Agent: official store, 0.90', 'Not used', 'bad')}${row('Answer: lookalike, 0.990', 'Order held', 'good')}`,
    tags: ['Shopping agents', 'Brand safety', 'Payment links'],
  },
})

const matching = () => capabilityPage({
  n: '03', slug: 'matching', tag: 'Matching records',
  title: 'Matching records.',
  lede: 'A similarity score of 0.93 does not say which side of &ldquo;the same person&rdquo; it is on, and a merge cannot be undone quietly. A person reads the fields that decide it and answers the question the pipeline actually has: same, or not.',
  feats: [
    ['link', 'Reads what decides it', 'The field that breaks the match, not the fields that agree.'],
    ['check', 'Same, or not', 'A decision, where fuzzy matching only gives you a score.'],
    ['target', 'Priced by the mistake', 'Merging two people&rsquo;s records costs more than a duplicate row.'],
    ['shield', 'Only what you send', 'The records you put in the question, and nothing from your database.'],
  ],
  input: `<span class="tag">Your agent sends</span>
    ${[['db', 'Record A', 'Sam Okafor · sam.okafor@mail.com · born 1991'], ['db', 'Record B', 'Samuel Okafor · sam.okafor@mail.com · born 1964']].map(([i, s, v]) => `<div class="card card-flat" style="padding:10px;margin-top:8px"><div style="display:flex;gap:9px;align-items:center"><span class="ico ico-sm">${ic(i)}</span><div><b style="font-size:12px;display:block">${s}</b><span class="dim" style="font-size:11px">${v}</span></div></div></div>`).join('')}
    <p class="dim" style="margin:10px 0 0">Are these the same person?</p>`,
  analysis: asked([
    ['The agent&rsquo;s matcher scored 0.93', 'Same name root, same email address.'],
    ['Amara read both records', 'No: born 27 years apart. 0.926.'],
    ['Joel was asked independently', 'No. Together, 0.990.'],
  ]),
  result: verdict('No. Two people.', 'A shared family email, not one customer. The records stay apart, and neither sees the other&rsquo;s history.'),
  steps: [['Send', 'The records in question.'], ['Read', 'Someone proven at matching.'], ['Weigh', 'A second look if one is not enough.'], ['Answer', 'Same or not, with its confidence.']],
  crypto: [
    { agent: 'Payments agent', image: 'invoice-pair', title: 'The same bill, sent twice?', body: 'A contractor&rsquo;s invoice was paid last week. Now one arrives with a new layout, a new reference and the word &ldquo;balance&rdquo;. A new bill, or the same one again? Paying twice in USDC can&rsquo;t be reversed.' },
    { agent: 'Treasury agent', title: 'The same counterparty?', body: '&ldquo;Northwind Security&rdquo; has been paid for a year. &ldquo;NW Sec Audits LLC&rdquo; now sends a bill from a new wallet, citing the same audit. The same firm, or someone borrowing its name? A person reads both records and decides.' },
  ],
  example: {
    intro: 'Send only the pairs your matcher could not settle. Quorum takes the uncertain middle, not the whole table.',
    title: 'A father and son, one inbox.',
    body: 'A customer-data agent deduplicates accounts. Two records share an email address and a surname, and its matcher is 0.93 sure they are one person. Merged, a son would see his father&rsquo;s orders and addresses. A person notices the birth years, and the merge does not happen.',
    panel: `${row('Matcher: same person, 0.93', 'Not merged', 'bad')}${row('Answer: two people, 0.990', 'Kept apart', 'good')}`,
    tags: ['Customer data', 'Deduplication', 'Supplier records'],
  },
})

const categorising = () => capabilityPage({
  n: '04', slug: 'categorising', tag: 'Categorising',
  title: 'Categorising.',
  lede: 'Where one category ends and the next begins is a rule people agreed on, not a fact in the data, so a classifier between two classes has nothing left to learn from. A person applies your rule to the item in front of them.',
  feats: [
    ['grid', 'Your taxonomy, applied', 'You send the categories. The answer is one of them.'],
    ['eye', 'Reads what the words mean', 'Coded language and context a keyword model takes at face value.'],
    ['target', 'Priced by the mistake', 'A mislabelled ticket and a missed counterfeit are not the same cost.'],
    ['tag', 'Only the uncertain ones', 'Your classifier keeps the clear cases. People take the tail.'],
  ],
  input: `<span class="tag">Your agent sends</span><div class="card card-flat" style="padding:12px;margin-top:12px"><b style="font-size:12.5px;display:block">&ldquo;Designer-inspired watch, AAA quality, looks identical to the original&rdquo;</b><span class="dim" style="font-size:11px">Marketplace listing, £45</span></div>
    ${option('Categories', 'Allowed · Counterfeit · Needs more information')}`,
  analysis: asked([
    ['The classifier was split', 'Allowed 0.52, Counterfeit 0.48.'],
    ['Amara read the listing', 'Counterfeit: &ldquo;AAA quality&rdquo; is how replicas are sold. 0.926.'],
    ['Joel was asked independently', 'Counterfeit. Together, 0.990.'],
  ]),
  result: verdict('Counterfeit, at 0.990.', 'The listing comes down under your counterfeit policy, and the decision carries its confidence.'),
  steps: [['Send', 'The item and your categories.'], ['Read', 'Someone proven at your kind of item.'], ['Weigh', 'A second look if one is not enough.'], ['Answer', 'One category, with its confidence.']],
  crypto: [
    { agent: 'Payments agent', title: '&ldquo;Our wallet has changed&rdquo;', body: 'A long-standing vendor emails: pay our new address from now on. Fluent, polite, the right names and invoice numbers. A routine update, or the classic payment-redirection scam? A person puts it in the right category before the next payment goes out.' },
    { agent: 'DAO agent', title: 'Routine proposal, or a treasury drain?', body: 'A governance proposal is labelled a parameter update but moves funds to a new address. A person decides which category it really falls in before the agent votes.' },
  ],
  example: {
    intro: 'The boundary cases are where a model is least sure and where the policy matters most.',
    title: 'A replica sold in plain sight.',
    body: 'A moderation agent reviews new listings. The words are polite and the photos are clean, so the classifier calls it a coin toss. People who have seen the phrase before know exactly what &ldquo;AAA quality&rdquo; means, and the listing is handled under the policy that fits it.',
    panel: `${row('Classifier: allowed, 0.52', 'Not used', 'bad')}${row('Answer: counterfeit, 0.990', 'Removed', 'good')}`,
    tags: ['Trust and safety', 'Support triage', 'Compliance labels'],
  },
})

const comparing = () => capabilityPage({
  n: '05', slug: 'comparing', tag: 'Comparing',
  title: 'Comparing.',
  lede: 'Your agent wrote both drafts, and a model asked to judge its own work tends to like it. A person reads the two side by side and picks the one that should go out.',
  feats: [
    ['users', 'An outside reader', 'Someone who did not write either candidate.'],
    ['swap', 'One of the two', 'The answer is a choice between what you sent, not a rewrite.'],
    ['target', 'Priced by the mistake', 'A reply to an angry customer is worth more certainty than a tagline.'],
    ['shield', 'Says when it is a tie', 'If people split, you are told the two are as good as each other, and refunded.'],
  ],
  input: `<span class="tag">Your agent sends</span>
    ${option('Draft A', '&ldquo;Per our policy, refunds take 14 days.&rdquo;')}${option('Draft B', '&ldquo;Sorry this happened. Your refund is on its way and should arrive by the 14th.&rdquo;')}
    <p class="dim" style="margin:10px 0 0">Which reply should go to a customer charged twice?</p>`,
  analysis: asked([
    ['The agent rated its own drafts', 'A: 0.61, B: 0.58. Too close to choose.'],
    ['Amara read both', 'B. 0.926.'],
    ['Joel was asked independently', 'B. Together, 0.990.'],
  ]),
  result: verdict('Draft B, at 0.990.', 'Two readers who wrote neither chose the same reply, and that is the one sent.'),
  steps: [['Send', 'Both candidates and the question.'], ['Read', 'Someone proven at comparing.'], ['Weigh', 'A second reader if one is not enough.'], ['Answer', 'One candidate, with its confidence.']],
  crypto: [
    { agent: 'DAO agent', title: 'Which summary is accurate?', body: 'The agent wrote two summaries of a treasury proposal for voters. One leaves out that it moves 2,000,000 USDC to a new manager. The agent is the worst judge of its own drafts; a person reads both and picks the faithful one.' },
    { agent: 'Treasury agent', title: 'Which audit finding matters?', body: 'Two auditors&rsquo; reports on the same vault, each written up by the agent. Which write-up reflects the critical finding? A person compares them before the vault takes deposits.' },
  ],
  example: {
    intro: 'The question is the one your agent could not answer about its own work: which of these is better.',
    title: 'The reply that keeps the customer.',
    body: 'A support agent drafts two answers to a customer who was charged twice. Scored by the model that wrote them, the stiff one edges ahead. Read by people, the apology wins every time, and that is the one that goes out.',
    panel: `${row('Agent&rsquo;s pick: Draft A', 'Not sent', 'bad')}${row('Answer: Draft B, 0.990', 'Sent', 'good')}`,
    tags: ['Customer support', 'Drafts and replies', 'Extraction review'],
  },
})

export { readings, real, matching, categorising, comparing }
