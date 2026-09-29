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

const capabilityPage = ({ n, slug, tag, title, lede, feats, input, analysis, result, steps, example }) =>
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
${foot()}</main>`,
  })

const row = (label, value, state) =>
  `<div style="display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--border)"><span class="ico ico-sm ${state === 'bad' ? 'ico-bad' : state === 'good' ? 'ico-good' : 'ico-plain'}" style="width:19px;height:19px;border-radius:50%">${ic(state === 'bad' ? 'x' : 'check')}</span><span style="font-size:12.5px;color:var(--ink-2)">${label}</span><span class="badge ${state === 'bad' ? 'badge-bad' : 'badge-good'}" style="margin-left:auto">${value}</span></div>`

const checks = (items) =>
  `<div style="display:flex;flex-direction:column;gap:14px">${items.map(([t, d]) => `<div style="display:flex;gap:10px"><span class="ico ico-sm ico-good" style="width:19px;height:19px;border-radius:50%">${ic('check')}</span><div><b style="font-size:12.5px;display:block">${t}</b><span class="dim" style="font-size:11.5px">${d}</span></div></div>`).join('')}</div>`

const verdict = (title, sub) =>
  `<span class="ico ico-good" style="border-radius:50%">${ic('check')}</span><b class="h-sm" style="display:block;margin:14px 0 6px">${title}</b><p class="dim" style="margin:0;line-height:1.6">${sub}</p>`

/* ------------------------------------------------------------- the five -- */

const readings = () => capabilityPage({
  n: '01', slug: 'readings', tag: 'Telling readings apart',
  title: 'Telling readings apart.',
  lede: 'Two readings of the same evidence, and your extraction cannot choose. A person looks at what you looked at and says which it is, in seconds, for cents.',
  feats: [['target', 'High accuracy', 'Settles the reading, not the closest match.'], ['eye', 'Sees the evidence', 'The image travels with the question.'], ['shield', 'Reduces errors', 'Stops a wrong figure entering your ledger.'], ['spark', 'Works across formats', 'Text, numbers, codes and images.']],
  input: `<span class="tag">Input</span><p style="font-size:12.5px;color:var(--ink-2);margin:12px 0 10px">The printed line reads &ldquo;TOTAL 4S.00&rdquo;. Is the total 45.00 or 4.50?</p>
    <div class="card card-flat" style="padding:10px;margin-bottom:8px"><div class="dim" style="font-size:10.5px;margin-bottom:3px">Option A</div><b style="font-size:13px">45.00</b></div>
    <div class="card card-flat" style="padding:10px"><div class="dim" style="font-size:10.5px;margin-bottom:3px">Option B</div><b style="font-size:13px">4.50</b></div>`,
  analysis: checks([['Reads the printed line', 'The S is a 5 in this typeface.'], ['Checks the decimal', 'The smudge sits after the second digit.'], ['Weighs the record', 'Both responders have a long clean history.']]),
  result: verdict('Right answer. Not a guess.', 'Option A is correct. Two people agreed independently, confidence 0.99.'),
  steps: [['Read', 'Understands the evidence.'], ['Ask', 'Routes to a proven worker.'], ['Weigh', 'Buys a second opinion if needed.'], ['Answer', 'Returns the reading and its confidence.']],
  example: {
    intro: 'Quorum shows the worker exactly what your extraction saw, and asks the one question that decides it.',
    title: 'A supplier invoice for the wrong amount.',
    body: 'An accounts-payable agent reads a smudged total as 4.50 at 0.41 confidence. Without a resolver it pays 4.50 against a 45.00 invoice and nothing flags it. With one, the question reaches a person and the correct figure comes back before the payment is scheduled.',
    panel: `${row('Agent reading: 4.50', 'Rejected', 'bad')}${row('Resolved reading: 45.00', 'Accepted', 'good')}`,
    tags: ['Accounts payable', 'Document extraction', 'Finance'],
  },
})

const real = () => capabilityPage({
  n: '02', slug: 'real', tag: 'Checking something is real',
  title: 'Checking something is real.',
  lede: 'Confirm that a document, an address, a listing or a business is genuine. A person checks it against what is actually there and tells you plainly.',
  feats: [['shield', 'Spots the fake', 'Catches altered and out-of-context content.'], ['image', 'Checks authenticity', 'Documents, images and identities.'], ['globe', 'Uses real sources', 'Cross-references what can be checked.'], ['bolt', 'Works in seconds', 'Fast, confident answers.']],
  input: `<span class="tag">Input</span><div class="card card-flat" style="padding:12px;margin-top:12px"><div style="display:flex;align-items:center;gap:9px"><span class="ico ico-sm">${ic('id')}</span><div><b style="font-size:12.5px;display:block">passport_photo.jpg</b><span class="dim" style="font-size:11px">1.4 MB</span></div></div></div><p class="dim" style="margin:10px 0 0">Does this document look genuine?</p>`,
  analysis: checks([['Document structure', 'Matches the official format.'], ['Security features', 'Hologram and ink patterns are consistent.'], ['Issuing authority', 'Matches the stated department.']]),
  result: verdict('Authentic.', 'This document appears genuine. Two responders agreed, confidence 0.98.'),
  steps: [['Upload', 'The image or record arrives with the question.'], ['Inspect', 'A person looks at the actual artefact.'], ['Check', 'Format, features and issuer are compared.'], ['Report', 'A structured verdict with its reasons.']],
  example: {
    intro: 'The worker sees the document itself, not a description of it, which is what makes the check worth anything.',
    title: 'Spotting a fake in onboarding.',
    body: 'A bank receives a passport for KYC. Quorum routes it to a person who checks the format, the security features and the issuer, and flags it as altered in seconds with a clear reason, not a probability with nothing behind it.',
    panel: `${row('Security feature missing', 'Flagged', 'bad')}${row('Document format incorrect', 'Flagged', 'bad')}${row('Issuer details do not match', 'Flagged', 'bad')}`,
    tags: ['KYC', 'Onboarding', 'Fraud'],
  },
})

const matching = () => capabilityPage({
  n: '03', slug: 'matching', tag: 'Matching records',
  title: 'Matching records.',
  lede: 'Decide whether records from different systems are the same thing, even when the names, formats and identifiers do not line up.',
  feats: [['db', 'Finds related data', 'Across different sources and systems.'], ['link', 'Handles variations', 'Different formats and naming styles.'], ['file', 'Reduces duplicates', 'Identifies and merges near-identical records.'], ['shield', 'Improves accuracy', 'Builds one clear, complete picture.']],
  input: `<span class="tag">Input</span>
    ${[['db', 'Hospital system', 'John A. Smith · 12/04/1982'], ['file', 'Insurance claim', 'J. Smith · 12/04/1982'], ['globe', 'National registry', 'John Smith · 12/04/1982']].map(([i, s, v]) => `<div class="card card-flat" style="padding:10px;margin-top:8px"><div style="display:flex;gap:9px;align-items:center"><span class="ico ico-sm">${ic(i)}</span><div><b style="font-size:12px;display:block">${s}</b><span class="dim" style="font-size:11px">${v}</span></div></div></div>`).join('')}`,
  analysis: `<p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">Possible matches found</p>
    ${[['John A. Smith', 'Hospital', '95%'], ['J. Smith', 'Claims', '88%'], ['John Smith', 'Registry', '76%']].map(([n, s, m]) => `<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--border)"><span class="ico ico-sm ico-plain" style="width:19px;height:19px;border-radius:50%">${ic('users')}</span><div style="min-width:0"><b style="font-size:12px;display:block">${n}</b><span class="dim" style="font-size:11px">${s}</span></div><span class="badge badge-good" style="margin-left:auto">${m}</span></div>`).join('')}`,
  result: verdict('One matched record.', 'All three sources refer to the same person. Combined into one profile.'),
  steps: [['Collect', 'Records arrive from several sources.'], ['Compare', 'A person reads the fields that matter.'], ['Decide', 'Same entity, or not.'], ['Merge', 'One accurate record, ready to use.']],
  example: {
    intro: 'Fuzzy matching gets you a score. A person gets you a decision, which is what the pipeline actually needs.',
    title: 'One patient, multiple sources.',
    body: 'A hospital record lists &ldquo;John A. Smith&rdquo;. The insurance claim says &ldquo;J. Smith&rdquo;. Quorum asks a person to compare the names, dates and identifiers, so you get one complete profile instead of three partial ones.',
    panel: `${row('Demographics', 'Merged', 'good')}${row('Medical history', 'Merged', 'good')}${row('Insurance details', 'Merged', 'good')}`,
    tags: ['Healthcare', 'Data quality', 'Deduplication'],
  },
})

const categorising = () => capabilityPage({
  n: '04', slug: 'categorising', tag: 'Categorising',
  title: 'Categorising.',
  lede: 'Put an item in the right bucket when your classifier is between two, or when the item does not obviously fit the taxonomy you gave it.',
  feats: [['db', 'Finds the pattern', 'Reads content and structure, not keywords.'], ['grid', 'Applies your rules', 'Uses the taxonomy you send.'], ['tag', 'Reduces manual work', 'Handles only the items that need a person.'], ['bolt', 'Stays consistent', 'The same judgment across the batch.']],
  input: `<span class="tag">Uncategorised</span>
    ${[['file', 'Invoice #INV-48231', '£1,250.00'], ['mail', 'john@company.com', 'Subject: Partnership'], ['image', 'IMG_2048.jpg', '1.2 MB'], ['file', 'Contract_v3.pdf', '480 KB']].map(([i, t, s]) => `<div class="card card-flat" style="padding:9px;margin-top:7px"><div style="display:flex;gap:9px;align-items:center"><span class="ico ico-sm">${ic(i)}</span><div style="min-width:0"><b style="font-size:11.5px;display:block">${t}</b><span class="dim" style="font-size:10.5px">${s}</span></div></div></div>`).join('')}`,
  analysis: `<p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">Sorted into your taxonomy</p>
    ${[['file', 'Invoices', 'Financial documents', '12'], ['mail', 'Emails', 'Communication', '8'], ['image', 'Images', 'Media files', '4'], ['file', 'Contracts', 'Legal documents', '6']].map(([i, n, d, c]) => `<div style="display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--border)"><span class="ico ico-sm">${ic(i)}</span><div><b style="font-size:12px;display:block">${n}</b><span class="dim" style="font-size:11px">${d}</span></div><span class="badge badge-accent" style="margin-left:auto">${c} items</span></div>`).join('')}`,
  result: verdict('Sorted and ready.', 'Every item is in a bucket you named, with the ambiguous ones decided by a person.'),
  steps: [['Scan', 'Reads the item and its context.'], ['Identify', 'Finds the features that decide it.'], ['Categorise', 'Places it in your taxonomy.'], ['Return', 'Consistent, structured output.']],
  example: {
    intro: 'Send only the items your classifier could not settle. Quorum handles the tail, not the whole batch.',
    title: 'Sorting a mixed inbox.',
    body: 'Documents, emails, images and contracts arrive together. Your classifier is confident about most of them. The handful it is not go to a person, so the whole batch comes out consistent rather than mostly right.',
    panel: `${row('Faster search', 'Improved', 'good')}${row('Less manual sorting', 'Improved', 'good')}${row('Higher accuracy on the tail', 'Improved', 'good')}`,
    tags: ['Document management', 'Operations', 'Data quality'],
  },
})

const comparing = () => capabilityPage({
  n: '05', slug: 'comparing', tag: 'Comparing',
  title: 'Comparing.',
  lede: 'Say which of two candidates is better, or what changed between two versions. You produced both, so you are the worst judge of which one won.',
  feats: [['swap', 'Finds differences', 'Spots changes, gaps and inconsistencies.'], ['file', 'Checks versions', 'Compares versions or sources of the same data.'], ['shield', 'Verifies accuracy', 'Highlights what matches and what does not.'], ['clock', 'Saves time', 'Clear, structured results in seconds.']],
  input: `<span class="tag">Comparison</span>
    ${[['Source A', 'ID document (new)'], ['Source B', 'ID document (existing)']].map(([t, s]) => `<div class="card card-flat" style="padding:10px;margin-top:8px"><div style="display:flex;gap:9px;align-items:center"><span class="ico ico-sm">${ic('id')}</span><div><b style="font-size:12px;display:block">${t}</b><span class="dim" style="font-size:11px">${s}</span></div></div></div>`).join('')}`,
  analysis: `<p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">Comparison results</p>
    ${row('Name', 'Match', 'good')}${row('Date of birth', 'Match', 'good')}${row('Document number', 'Difference', 'bad')}${row('Expiry date', 'Match', 'good')}`,
  result: verdict('One real difference.', 'The document numbers do not match. Everything else is identical.'),
  steps: [['Receive', 'Both candidates arrive together.'], ['Read', 'A person reads them side by side.'], ['Identify', 'What changed, and what did not.'], ['Summarise', 'A structured verdict you can act on.']],
  example: {
    intro: 'A difference a person notices in two seconds is often one a diff cannot express at all.',
    title: 'Two versions of a contract.',
    body: 'A legal team sends two versions of the same agreement. Quorum returns what was added, removed and modified, and flags the one change that actually matters, so nothing is missed in a file nobody has time to read twice.',
    panel: `${row('Payment terms', 'Changed', 'bad')}${row('Parties', 'Unchanged', 'good')}${row('Governing law', 'Unchanged', 'good')}`,
    tags: ['Legal', 'Contracts', 'Review'],
  },
})

export { readings, real, matching, categorising, comparing }
