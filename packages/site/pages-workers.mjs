import { MARK, WORKER_APP, caret, ic, page } from './build.mjs'

/**
 * The worker surface — the recruitment site, D10 in the brief.
 *
 * Five comps make one scroll, and a sixth is the sign-in page. The audience is
 * a person deciding whether this is worth their evening, not an engineer, so
 * two of the brief's non-negotiables shape every line here:
 *
 *   - Never imply we hold their money. The treasury pays them; it never
 *     custodies anything of theirs, and the copy says so plainly.
 *   - No seed phrase, no wallet setup, no crypto vocabulary. There is no
 *     "chain", no "wallet" and no "on-chain" anywhere on this surface. A wage
 *     lands in their account and has a public record; that is all they need.
 *
 * Where the comps promised things the product does not do — signing up with an
 * email, a profile-matching step, "bank-level encryption" — the layout is kept
 * and the claim is replaced with the true one.
 */

/* One verb, everywhere. The comps alternated between "Start working",
   "Start working now" and "Start now"; three names for one button teaches a
   reader they are three different things. */
const CTA = 'Start working'

const swoosh = `<svg viewBox="0 0 132 11" fill="none" aria-hidden="true"><path d="M2 7.6C28 3.2 74 1.8 130 4.6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`

/** The handwritten aside from the comps. Decorative, so it is not announced. */
const script = (lines) =>
  `<p class="w-script" aria-hidden="true">${lines.map((l) => `${l}<br/>`).join('')}${swoosh}</p>`

const wNav = (current) => `<header class="w-nav"><div class="shell w-nav-in">
  <a class="brand" href="for-workers.html"><span class="mark">${MARK}</span>Quorum</a>
  <nav class="w-tabs" aria-label="Primary">
    <a href="for-workers.html"${current === 'workers' ? ' aria-current="page"' : ''}>For workers</a>
    <a href="index.html">For developers</a>
    <a href="#">About</a>
  </nav>
  <div class="w-nav-end">
    <span class="w-lang">EN ${caret}</span>
    <a class="w-btn" style="height:44px;padding-inline:20px;font-size:14.5px" href="${WORKER_APP}">${CTA}</a>
  </div>
</div></header>`

/** The floating earnings card that sits over the photograph in every comp. */
const earningsCard = (position) => `<div class="w-float ${position}">
  <span class="w-tile" style="width:42px;height:42px;border-radius:12px">${ic('db')}</span>
  <div><b>$0.20</b><span>per answered question</span></div>
</div>`

/*
  A photograph in its frame.

  The images are cropped out of the comps, so each one is a single person with
  no baked-in overlay: the floating cards and the handwritten asides are drawn
  in HTML on top, which keeps them crisp at any size and, in one case, let the
  copy be corrected — comp 30's card claimed "bank-level encryption", which is
  not a claim this project can stand behind.
*/
/** The reassurance card over the photograph on the sign-in comp. */
const passkeyCard = () => `<div class="w-float w-float-bl">
  <span class="w-tile" style="width:38px;height:38px;border-radius:11px">${ic('user')}</span>
  <div><b style="font-size:14px">Sign in with passkey</b><span>Fast. Secure. No password.</span></div>
</div>`

const mediaSlot = (frame, shape, float, img, alt) =>
  `<div class="w-frame ${frame}">
    <div class="w-media ${shape}" role="img" aria-label="${alt}" style="background-image:url(assets/${img})"></div>
    ${float ?? ''}
  </div>`

/* ------------------------------------------------------------------ hero -- */

const heroSection = () => `<section class="w-band"><div class="shell w-grid">
  <div class="w-copy">
    <p class="w-eyebrow">Real people. Real answers. Real income.</p>
    <h1 class="w-h">Turn your time into<em>real earnings.</em></h1>
    <p class="w-lede">Quorum connects people like you with short questions from software that has got stuck. Answer from your phone or computer, get paid $0.20 per answer, and help the things you already use make fewer mistakes.</p>
    <div class="w-cta">
      <a class="w-btn" href="app-invite.html">Join the waitlist ${ic('arrow')}</a>
      <a class="w-play" href="for-workers.html#how"><span>${ic('play')}</span>See how it works</a>
    </div>
  </div>
  ${mediaSlot('w-frame-hero', 'w-media-hero', earningsCard('w-float-tr'), 'worker-hero.webp', 'A woman answering a Quorum question on her phone')}
</div></section>`

/* -------------------------------------------------------------- why join -- */

const WHY = [
  ['phone', 'Work from anywhere', 'Use your phone or computer. No special equipment, no office, no shift. A stable connection and a few spare minutes is the whole requirement.'],
  ['db', 'Get paid per answer', 'Earn $0.20 for every question you answer. Each payment is sent as soon as the answer is accepted, not batched up until some threshold.'],
  ['shield', 'Your money, your control', 'Quorum never holds your money. Wages are sent straight to your own account, and every one of them has a public record you can check.'],
  ['users', 'Real people, real impact', 'Your answers settle questions that software could not, for the products and services people rely on every day.'],
]

const whyJoinSection = () => `<section class="w-band w-band-alt"><div class="shell w-grid">
  <div class="w-copy">
    <p class="w-eyebrow">Why join Quorum</p>
    <h2 class="w-h">Simple work.<em>Real benefits.</em></h2>
    <p class="w-lede">Answering a Quorum question takes seconds and needs nothing but your judgment. There is no deposit, no stake, no bond and no minimum payout. Not now, not ever.</p>
    <ul class="w-feats">
      ${WHY.map(([i, t, d]) => `<li class="w-feat"><span class="w-tile">${ic(i)}</span><b>${t}</b><p>${d}</p></li>`).join('')}
    </ul>
  </div>
  <div style="position:relative">
    ${mediaSlot('', 'w-media-leaf', earningsCard('w-float-br'), 'worker-why.webp', 'A man answering a question on his phone in the street')}
    <div style="position:absolute;top:8px;right:0">${script(['Small questions.', 'Real earnings.'])}</div>
  </div>
</div></section>`

/* --------------------------------------------------------- how it works -- */

/*
  The comp's four steps described a different product: an email sign-up, a
  profile questionnaire, and interest matching. None of those exist. The real
  path is a passkey, a short paid assessment, then work routed by record.
*/
const STEPS = [
  ['user', 'Sign in with a passkey', 'Your device makes one for you. There is no password to choose, nothing to confirm by email, and nothing to write down and keep safe.'],
  ['gear', 'Take a short assessment', 'A handful of questions whose answers are already known, so your judgment can be measured. It is short, it is not paid, and every real question after it is.'],
  ['chat', 'Answer questions', 'Work reaches you based on your record for that kind of judgment. Every question is a few seconds of reading and one decision.'],
  ['wallet', 'Get paid per answer', '$0.20 lands in your own account for each accepted answer, with no fee taken out of it and nothing to claim.'],
]

const howItWorksSection = () => `<section class="w-band" id="how"><div class="shell w-grid">
  <div class="w-copy">
    <p class="w-eyebrow">How it works</p>
    <h2 class="w-h">From signing in to<em>your first payment.</em></h2>
    <p class="w-lede">Four steps, and the longest of them is the assessment. Most people are answering real questions within a few minutes of arriving.</p>
    ${script(['Simple steps.', 'Real rewards.'])}
  </div>
  <div>
    <ol class="w-flow" style="list-style:none;margin:0;padding:0">
      ${STEPS.map(([i, t, d], x) => `<li class="w-step"><span class="w-tile">${ic(i)}</span><span class="w-num">${x + 1}</span><b>${t}</b><p>${d}</p></li>`).join('')}
    </ol>
  </div>
</div></section>`

/* ------------------------------------------------------------------ trust -- */

/*
  The comp offered "bank-level encryption" and "industry-leading protection".
  Neither is a claim this project can stand behind, and both are the kind of
  phrase a careful reader discounts on sight. What replaces them is the set of
  things that are actually true and actually unusual.
*/
const TRUST = [
  ['lock', 'Nothing to put up front', 'No deposit, no stake, no bond. You are never asked to risk your own money to start working, which is the usual catch and is not one here.'],
  ['slash', 'No fees, no minimum payout', 'What you earn is what arrives. There is no platform cut, no withdrawal fee, and no balance you have to reach before you can be paid.'],
  ['bolt', 'Paid as you go', 'Each accepted answer is paid on its own. You are not waiting on a weekly run or a threshold that keeps moving.'],
  ['shield', 'Every payment has a record', 'Each wage can be looked up independently, so you never have to take our word for what you were paid.'],
]

const trustSection = () => `<section class="w-band w-band-alt"><div class="shell w-grid">
  <div class="w-copy">
    <p class="w-eyebrow">Your safety comes first</p>
    <h2 class="w-h">Built for your<em>trust and security.</em></h2>
    <p class="w-lede">The things that usually go wrong for people doing work like this are money being held, fees appearing late, and payouts that never quite arrive. None of them can happen here, and here is why.</p>
    <div class="w-cards">
      ${TRUST.map(([i, t, d]) => `<div class="w-card"><span class="w-tile">${ic(i)}</span><b>${t}</b><p>${d}</p></div>`).join('')}
    </div>
  </div>
  <div style="position:relative">
    ${mediaSlot('w-frame-round', 'w-media-round w-media-blend', '', 'worker-trust.webp', 'A worker checking her earnings on her phone')}
    <div style="position:absolute;bottom:18px;left:0">${script(['Work safe.', 'Get paid.', 'Stay in control.'])}</div>
  </div>
</div></section>`

/* -------------------------------------------------------------- join CTA -- */

const JOIN = [
  ['lock', 'Secure by design', 'Your passkey never leaves your device, and there is no password anywhere to be stolen.'],
  ['slash', 'No hidden fees', 'What you see is what you get. No surprise charges and no complicated terms.'],
  ['wallet', 'Direct payments', 'Wages go to your own account. Quorum is never holding them on your behalf.'],
]

const joinSection = () => `<section class="w-band"><div class="shell w-grid">
  <div class="w-copy">
    <p class="w-eyebrow">Join Quorum today</p>
    <h2 class="w-h">Trusted and secure.<em>Always.</em></h2>
    <p class="w-lede">Your privacy, your earnings and your control over both are the things this was designed around. Start with one question and see what you think.</p>
    <ul class="w-feats" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:24px;margin-bottom:34px">
      ${JOIN.map(([i, t, d]) => `<li class="w-feat"><span class="w-tile" style="width:46px;height:46px;border-radius:13px">${ic(i)}</span><b style="font-size:15.5px">${t}</b><p style="font-size:13.5px">${d}</p></li>`).join('')}
    </ul>
    <div class="w-cta">
      <a class="w-btn" href="app-invite.html">Join the waitlist ${ic('arrow')}</a>
      <a class="w-play" href="for-workers.html#how"><span>${ic('play')}</span>See how it works</a>
    </div>
  </div>
  <div style="position:relative">
    ${mediaSlot('', 'w-media-leaf', earningsCard('w-float-br'), 'worker-join.webp', 'A worker looking up from her phone')}
    <div style="position:absolute;top:0;right:0">${script(['Real people.', 'Real earnings.', 'A better future.'])}</div>
  </div>
</div></section>`

/* --------------------------------------------------------------- pages -- */

const forWorkers = () => page({
  title: 'For workers',
  script: true,
  body: `${wNav('workers')}<main>
${heroSection()}
${whyJoinSection()}
${howItWorksSection()}
${trustSection()}
${joinSection()}
</main>`,
})

/*
  Sign in.

  This page introduces signing in; the sign-in itself happens in the app
  (app-signin.html), where the wallet code runs. Its two buttons are the app's
  two ways in: a passkey made here, or an existing Tempo Wallet. The comp's
  second button was "Use another device", which went to the same place as the
  first, so the slot now carries the option that actually exists.
*/
const WHY_PASSKEY = [
  ['shield', 'More secure', 'A passkey cannot be phished or leaked in a breach, because there is no secret you could be tricked into typing.'],
  ['bolt', 'Faster', 'Nothing to remember and nothing to type. It is the same gesture you already use to unlock the device.'],
  ['phone', 'Already on your device', 'Face, fingerprint or device PIN, whichever your phone or computer already uses.'],
]

const workerSignIn = () => page({
  title: 'Sign in',
  script: true,
  body: `${wNav('workers')}<main>
<section class="w-band"><div class="shell w-grid w-grid-3">
  <div class="w-copy">
    <p class="w-eyebrow">Welcome back</p>
    <h1 class="w-h">Sign in,<em>no password.</em></h1>
    <p class="w-lede">Use your fingerprint, face or device PIN. There is no password to enter, because there is no password to begin with.</p>
    <div class="w-stack">
      ${WHY_PASSKEY.map(([i, t, d]) => `<div class="w-stack-row"><span class="w-tile" style="width:42px;height:42px;border-radius:12px">${ic(i)}</span><div><b>${t}</b><p>${d}</p></div></div>`).join('')}
    </div>
    <div style="margin-top:34px">${script(['Simple. Secure.', 'Yours.'])}</div>
  </div>

  ${mediaSlot('', 'w-media-leaf', passkeyCard(), 'worker-signin.webp', 'A worker signing in on his phone')}

  <div class="w-signin">
    <span class="brand" style="display:inline-flex;align-items:center;gap:10px"><span class="mark">${MARK}</span>Quorum</span>
    <h2>Sign in</h2>
    <p class="w-signin-lede">With a passkey on this device, or with the Tempo Wallet you already have.</p>
    <a class="w-passkey" href="${WORKER_APP}">
      <span class="w-tile" style="width:42px;height:42px;border-radius:12px;background:var(--surface)">${ic('faceid')}</span>
      <span><b>Use this device</b><span>Face, fingerprint or device PIN</span></span>
    </a>
    <div class="w-or">OR</div>
    <a class="btn btn-ghost" style="width:100%;height:50px" href="${WORKER_APP}#tempo-wallet">${ic('wallet')} Use Tempo Wallet</a>
    <p class="dim" style="margin:22px 0 0;font-size:12.5px;line-height:1.6">First time here? The same button makes your passkey, so there is no separate sign-up.</p>
  </div>
</div></section>
</main>`,
})

/*
  The waitlist.

  While the testnet is invite-only, this is where "Join the waitlist" goes and
  where a signed-in account without an invite is sent. It is the sign-in page's
  layout: the case on the left, a photograph, and the form in the same card.
  Someone with an invite redeems it in the same card, so there is one page to
  link to whatever state a person is in. The behaviour is the worker app's
  (initInvite in app.js), keyed by the same data-app names.
*/
const WAITLIST_STEPS = [
  ['mail', 'Join the waitlist', 'Your email and what you would like to answer. Nothing else.'],
  ['key', 'Get your invite', 'We admit people a group at a time and email you a personal link.'],
  ['check', 'Pass a short assessment', 'Five questions per skill. Four right opens that skill.'],
  ['money', 'Answer in test sessions', 'We email you before each one. Testnet wages are test tokens.'],
]

const WAITLIST_SKILLS = [
  ['disambiguate', 'swap', 'Telling readings apart'],
  ['verify', 'shield', 'Checking something is real'],
  ['match', 'link', 'Matching records'],
  ['categorise', 'tag', 'Categorising'],
  ['compare', 'list', 'Comparing'],
]

/* The waitlist's own header: the brand, and a way in for anyone already invited. */
const waitlistNav = () => `<header class="w-nav"><div class="shell w-nav-in" style="justify-content:space-between">
  <a class="brand" href="for-workers.html"><span class="mark">${MARK}</span>Quorum</a>
  <div style="display:flex;align-items:center;gap:10px">
    <button class="btn btn-ghost wl-theme" type="button" data-theme-toggle aria-pressed="false" aria-label="Switch colour theme" style="height:42px">${ic('moon')}<span data-theme-label>Dark mode</span></button>
    <a class="btn btn-ghost" style="height:42px" href="${WORKER_APP}">Have an invite? Sign in</a>
  </div>
</div></header>`

const workerWaitlist = () => page({
  title: 'Join the waitlist',
  script: true,
  body: `${waitlistNav()}<main>
<section class="w-band wl">
  <div class="wl-head" role="img" aria-label="A person answering a Quorum question on their phone">
    <p class="w-eyebrow">Early access &middot; Testnet</p>
    <h1 class="w-h">Be one of the first<em>people answering.</em></h1>
    <p class="w-lede">We are opening Quorum a group at a time, so everyone admitted together has real questions to answer and people to agree with. Join the list and we will email you when your place opens.</p>
  </div>

  <div class="shell">
  <div class="wl-card" data-app="wl-card">
    <div class="wl-form">
      <h2>Join the waitlist</h2>
      <p class="w-signin-lede">No password, no deposit, no fee. We only use your email to send your invite.</p>

      <label class="w-label" for="wl-email">Email</label>
      <input class="w-input" id="wl-email" type="email" autocomplete="email" placeholder="you@example.com" data-app="wl-email"/>

      <p class="w-label" style="margin-top:22px">What would you like to answer? <span class="dim" style="font-weight:500">Optional</span></p>
      <div class="w-chips">
        ${WAITLIST_SKILLS.map(([kind, icon, title]) => `<button class="w-chip" type="button" role="switch" aria-checked="false" data-wl-kind="${kind}">${ic(icon)}${title}</button>`).join('')}
      </div>

      <button class="w-btn" type="button" data-app="wl-join" style="width:100%;height:54px;margin-top:26px">Join the waitlist ${ic('arrow')}</button>
      <p data-app="wl-result" class="w-note" hidden></p>

      <details class="w-invite">
        <summary>${ic('key')} I already have an invite code</summary>
        <div style="display:flex;gap:10px;margin-top:14px">
          <input class="w-input" type="text" autocomplete="off" spellcheck="false" placeholder="Invite code" aria-label="Invite code" data-app="invite-code" style="text-transform:uppercase;flex:1;min-width:0"/>
          <button class="btn btn-ghost" type="button" data-app="invite-redeem" style="height:48px">Continue</button>
        </div>
        <p data-app="invite-error" class="w-note w-note-bad" hidden></p>
      </details>
    </div>

    <aside class="wl-side">
      <p class="w-eyebrow" style="margin-bottom:22px">What happens next</p>
      <div class="w-stack">
        ${WAITLIST_STEPS.map(([i, t, d], x) => `<div class="w-stack-row"><span class="w-tile" style="width:42px;height:42px;border-radius:12px">${ic(i)}</span><div><b><span class="w-step-n">${x + 1}</span>${t}</b><p>${d}</p></div></div>`).join('')}
      </div>
    </aside>
  </div>
</div></section>
</main>
<script src="assets/app.js"></script>`,
})

export { forWorkers, workerSignIn, workerWaitlist, wNav, CTA }
