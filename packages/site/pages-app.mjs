import { ic, caret, MARK } from './build.mjs'
import {
  appPage,
  av,
  back,
  card,
  cardHead,
  chip,
  hello,
  info,
  metric,
  more,
  pill,
  row,
  script,
  stat,
  themeToggle,
  tile,
  workerSide,
  workerTop,
  ASSESSMENT_NAV,
} from './app-shell.mjs'

/**
 * The worker app — surface A, and the one that carries the product.
 *
 * Every screen in the approved comps is here, plus the states the comps do not
 * draw but the app spends most of its life in: the question that closed while
 * somebody was reading it, the failed assessment, the dropped connection, the
 * wage whose chain write did not land. Most design work fails on those rather
 * than on the happy path, and a worker meets all four in a normal evening.
 *
 * WHERE THE COMPS AND THE PRODUCT DISAGREE
 *
 * The comps were drawn without the product's economics, so several of them say
 * things that are not true of this system. The layout, spacing, panels and
 * geometry are reproduced exactly; the claims inside them are corrected:
 *
 *   $2.50 an answer        The wage is twenty cents. Every amount is rendered from
 *                          the gateway rather than typed, so it cannot drift
 *                          again.
 *   "your balance"         We hold no balance. A wage goes to an account only
 *                          the worker controls, and the copy says so wherever
 *                          the comps said otherwise.
 *   A Withdraw button      There is nothing to withdraw from. The control is
 *                          removed rather than disabled — a greyed-out button
 *                          still teaches that a withdrawal is a thing that
 *                          exists here.
 *   "Bank transfer,        Wages settle to the worker's own account on Tempo.
 *   Chase Bank"            The panel stays; the destination is the real one.
 *   ETH, "onchain",        A worker never needs the word. The public record of
 *   "wallet"               a payment stays — it is the trust mechanism and the
 *                          one permitted exception — but it reads as a receipt.
 *   "Keep it up!"          Removed. Pay is per answer, and nothing here is
 *                          allowed to make stopping feel like a loss.
 *
 * Two things the comps omit are added back, because the product does not work
 * without them: the uncertainty scale and skip, both on the question screen.
 * Both are drawn in the comps' own visual language.
 */

/* ------------------------------------------------------------------ parts -- */

/**
 * The earnings rail.
 *
 * The comps head this "Total balance", which is precisely the impression the
 * product cannot give. What sits in that account is the worker's, we cannot
 * reach it, and the label has to carry that or the screen has quietly undone
 * the thing that makes Quorum different from everything it replaces.
 */
const earningsRail = () => card(`
  ${cardHead('Your earnings')}
  <div class="ap-rows ap-rows-inset">
    <a class="ap-row ap-row-lead" href="app-earnings.html">
      ${tile('wallet')}
      <div><span>In your own account</span><b data-app="balance">Loading</b></div>
      ${caret}
    </a>
    ${row({ icon: 'db', title: 'Last payment', note: 'Loading', value: 'Loading', key: 'last-amount', href: 'app-payments.html' }).replace('<span>Loading</span>', '<span data-app="last-when">Loading</span>')}
    ${row({ icon: 'check', title: 'Questions answered', value: 'Loading', key: 'answered', href: 'app-payments.html' })}
    ${row({ icon: 'clock', title: 'Paid to you, all time', value: 'Loading', key: 'earned', href: 'app-earnings.html' })}
  </div>
  <div class="ap-pad">
    ${info('link', 'Every payment has a public record', 'A wage is sent the moment your answer is accepted. Open any payment to see it on the public ledger, so you never have to take our word for the number.')}
  </div>
`)

/* ------------------------------------------------------------------- home -- */

/*
  Waiting.

  The default state and the one a worker sits in for minutes, so it must not
  look broken and must not look busy either. Earnings stay on screen so the wait
  reads as productive, and there is no countdown anywhere: a clock ticking at
  somebody who is waiting is pressure applied for no purpose.

  The comps close this screen with "The more you answer, the more opportunities
  you'll get." That is a streak mechanic in one sentence — it makes stopping
  feel like a loss, which is banned outright on a surface where people earn
  cents. The panel stays; it now says something true and neutral.
*/
const home = () =>
  appPage({
    title: 'Home',
    script: true,
    side: workerSide('home'),
    main: `${workerTop(hello())}
<div class="ap-cols">
  <div class="ap-stack">
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
      <div style="flex:1;min-width:270px">
        ${chip('Work status')}
        <h1 class="ap-h1 ap-h1-lg" data-app="state-title">Waiting for<em>a question…</em></h1>
        <p class="ap-sub" style="margin-bottom:0" data-app="state-note">Nothing is available right now. You will be paid for each one you answer, and one can arrive at any moment.</p>
      </div>
      <div class="ap-wait" aria-hidden="true"><i></i><i></i><i></i>${ic('chat')}</div>
    </div>

    ${info('clock', 'You are paid for each one you answer', 'A question can arrive at any moment. Nothing is lost by waiting, and nothing is lost by closing this and coming back.')}

    ${card(`<div class="ap-split">
      ${metric('db', 'Paid to you, all time', 'Loading', 'in your own account', 'earned')}
      ${metric('check', 'Questions answered', 'Loading', '', 'answered')}
      ${metric('clock', 'Last payment', 'Loading', '', 'last-when')}
    </div>`)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Quick actions')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'wallet', title: 'Your earnings', note: 'Every payment and its record', href: 'app-earnings.html' })}
        ${row({ icon: 'user', title: 'Your profile', note: 'Where wages are sent', href: 'app-profile.html' })}
        ${row({ icon: 'question', title: 'Help', note: 'How this works, and who to ask', href: 'app-help.html' })}
      </div>
    `)}
    ${card(`<div class="ap-pad">
      ${info('shield', 'Nothing to put up front', 'No deposit, no stake, no minimum before you are paid and no pay day to wait for. There never will be.')}
      ${script(['Real people.', 'Real work.'])}
    </div>`)}
  </div>
</div>`,
  })

/* --------------------------------------------------------------- question -- */

/*
  The question. The core screen, and the one that gets the most attention.

  The prompt is the largest thing on it, the options are full-width 56px
  targets, and the evidence sits above the fold. Two controls the comps do not
  show are here because the product does not function without them.

  THE UNCERTAINTY SCALE is counter-intuitive and load-bearing. A worker saying
  "not sure" is rewarded, not penalised: a hedged answer buys a second opinion
  rather than being trusted, and the worker is paid either way. If this ever
  reads as a test of confidence, everyone claims certainty and the quality
  system underneath stops working — so the reassurance is inside the control,
  not in a tooltip nobody opens.

  SKIP is free, quiet and never confirmed. A worker trapped on a question they
  cannot answer will answer it badly, which costs more than the skip.
*/
const question = () =>
  appPage({
    title: 'Question',
    side: workerSide('work'),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div class="ap-cols">
  <div class="ap-stack">
    <div>
      ${chip('Real question')}
      <h1 class="ap-h1">Your question</h1>
      <p class="ap-sub" style="margin-bottom:18px"><span class="ap-pill ap-pill-accent ap-pill-icon">${ic('db')}<span data-app="wage">Loading</span></span> <span style="margin-left:8px">for this answer</span></p>
    </div>

    <hr class="ap-divide"/>

    <div>
      <h2 class="ap-h3" data-app="prompt" style="font-size:24px;line-height:1.3">Waiting for a question…</h2>
      <p class="ap-sub" style="margin-bottom:20px">Choose the option that answers it. If none of them does, skip. That costs you nothing.</p>

      <div data-app="evidence" hidden style="margin-bottom:20px"></div>

      <div class="ap-opts" role="radiogroup" aria-label="Your answer" data-app="options"></div>

      <fieldset class="ap-sure" data-app="sure">
        <legend>How sure are you?</legend>
        <p>Saying you are unsure is not penalised. It buys a second opinion on the question, and you are paid either way.</p>
        <div class="ap-sure-scale">
          <button type="button" data-sure="0.25" aria-pressed="false">Guessing</button>
          <button type="button" data-sure="0.5" aria-pressed="false">Not sure</button>
          <button type="button" data-sure="0.75" aria-pressed="false">Fairly sure</button>
          <button type="button" data-sure="1" aria-pressed="true">Certain</button>
        </div>
      </fieldset>

      <button class="ap-primary" type="button" data-app="submit" disabled>Submit answer ${ic('arrow')}</button>
      <button class="ap-skip" type="button" data-app="skip">Skip this one</button>
    </div>
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('clipboard', '', 'sm')} Question details`)}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'layers', title: 'Kind', note: 'What is being asked of you', value: 'Loading', key: 'kind' })}
        ${row({ icon: 'db', title: 'You are paid', note: 'When your answer is accepted', value: 'Loading', key: 'wage' })}
        ${row({ icon: 'clock', title: 'Unhurried reading time', note: 'Not a limit. Take longer if you need it', value: 'Loading', key: 'reading' })}
      </div>
      <div class="ap-pad">
        ${info('question', 'Read it carefully', 'There is a deadline on the question, but no clock is counting down at you. A careful answer is worth more to everyone than a fast one.')}
      </div>
    `)}
  </div>
</div>`,
  })

/* -------------------------------------------------------------- submitted -- */

/*
  Answer sent.

  The comps head the middle figure "Payment status: Processing — will be sent to
  your balance shortly", which describes a custodial platform. Nothing lands in
  a balance we keep. It goes to the worker's own account, and the transaction
  panel beneath is how they check that without asking us.
*/
const submitted = () =>
  appPage({
    title: 'Answer sent',
    body: ' data-return-to-work',
    side: workerSide('work'),
    main: `${workerTop(back('Back to questions', 'app-home.html'))}
<div class="ap-cols">
  <div class="ap-stack">
    <div class="ap-centre">
      <div class="ap-ok" aria-hidden="true">
        <i style="top:14px;left:20px"></i><i style="top:6px;right:30px"></i><i style="bottom:16px;left:10px"></i>
        <i style="bottom:8px;right:18px"></i><i style="top:34px;right:6px"></i><i style="bottom:34px;left:2px"></i>
        <span class="ap-ok-badge">${ic('check')}</span>
      </div>
      <h1 class="ap-h1 ap-h1-lg">Answer sent</h1>
      <p class="ap-sub" style="margin-inline:auto">Your answer has been received. The wage is sent to your own account the moment it is accepted, which is usually within seconds.</p>
    </div>

    ${card(`<div class="ap-split">
      ${metric('db', 'You earned', 'Loading', 'for this answer', 'wage')}
      ${metric('clock', 'Payment', 'Sending', 'Straight to your own account', 'pay-state')}
      ${metric('wallet', 'Paid to you, all time', 'Loading', '', 'earned')}
    </div>`)}

    ${card(`<div class="ap-pad" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      ${tile('receipt')}
      <div style="flex:1;min-width:200px">
        <b style="display:block;font-size:13.5px">Public record</b>
        <span style="display:block;font-size:12.5px;color:var(--ink-3);margin-top:3px">This payment can be looked up by anyone. You never have to believe our number.</span>
        <a class="ap-more" style="margin-top:8px" data-app="tx-link" href="#" hidden>Open the record ${ic('out')}</a>
      </div>
      <div style="text-align:right">
        <span style="display:block;font-size:11.5px;color:var(--ink-4)">Reference</span>
        <span class="ap-mono" data-app="tx-hash">pending</span>
      </div>
      <button class="ap-copy" type="button" data-copy="tx-hash" aria-label="Copy the reference">${ic('copy')}</button>
    </div>`)}

    <a class="ap-primary" href="app-home.html">Back to questions ${ic('arrow')}</a>
  </div>

  <div class="ap-stack">
    ${earningsRail()}
  </div>
</div>`,
  })

/* ----------------------------------------------------------------- closed -- */

/*
  The question closed while they were reading it.

  Happens constantly — enough people answer a question in six seconds that a
  careful reader routinely loses one — so this screen has to reassure rather
  than apologise. Nothing was lost, nothing was taken, another is coming.
*/
const closed = () =>
  appPage({
    title: 'That one closed',
    body: ' data-return-to-work',
    side: workerSide('work'),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div class="ap-cols">
  <div class="ap-stack">
    <div class="ap-centre">
      <div class="ap-ok ap-ok-bad" aria-hidden="true">
        <span class="ap-ok-badge">${ic('clock')}</span>
      </div>
      <h1 class="ap-h1 ap-h1-lg">That one closed</h1>
      <p class="ap-sub" style="margin-inline:auto">It closed before your answer reached it: enough people had already answered, or its time ran out. Nothing was lost and nothing was counted against you. The next question is on its way.</p>
    </div>

    ${info('check', 'This is normal', 'Questions resolve in about six seconds, so a careful reader loses one regularly. It has no effect on your record, your standing or what you are paid.', 'plain')}

    <a class="ap-primary" href="app-question.html">Wait for the next one ${ic('arrow')}</a>
  </div>
  <div class="ap-stack">${earningsRail()}</div>
</div>`,
  })

/* --------------------------------------------------------------- earnings -- */

/*
  Earnings.

  The comp titles this "Wallet balance", puts an ETH figure beside it and gives
  it a Withdraw button. All three are wrong in the same direction: they describe
  money we are holding on the worker's behalf, in a currency they did not choose,
  which they must ask us to release.

  What is true is plainer and better. Wages are a dollar-denominated stablecoin
  sent to an account only they control, the moment each answer is accepted. So
  the headline is "In your own account", the currency is dollars, and there is
  no Withdraw button because there is nothing to withdraw from.

  The chart draws the real series or says there is not one yet. A line shaped
  like a plausible week, on a screen with no week behind it, is a false number.
*/
const earnings = () =>
  appPage({
    title: 'Earnings',
    side: workerSide('earnings'),
    main: `${workerTop(hello())}
<div>
  ${chip('Earnings')}
  <h1 class="ap-h1">Your earnings</h1>
  <p class="ap-sub">Everything you have been paid, and the public record of each payment. Quorum never holds any of it.</p>
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`<div class="ap-pad" style="display:flex;gap:22px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:220px">
        <span style="display:flex;align-items:center;gap:9px;font-size:13px;color:var(--ink-3)">${tile('wallet', '', 'sm')} In your own account</span>
        <b style="display:block;margin:12px 0 6px;font-size:40px;font-weight:700;letter-spacing:-0.035em;font-variant-numeric:tabular-nums" data-app="balance">Loading</b>
        <span style="font-size:12.5px;color:var(--ink-4)">Read from the public ledger, not from our records. <span data-app="network">Loading</span>.</span>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a class="ap-second" data-app="address-link" href="#" target="_blank" rel="noopener">${ic('out')} Open the public record</a>
        <button class="ap-second" type="button" data-app="export">${ic('download')} Export account details</button>
      </div>
    </div>
    ${info('shield', 'Your money, and you can move it whenever you like', 'Quorum has no access to this account and cannot hold, freeze or delay what is in it. There is no withdrawal to request and no approval to wait for, because nothing of yours is ever sitting with us. Spend or transfer it on Tempo whenever you want, using the passkey on your device.').replace('<div class="ap-info"', '<div class="ap-info" style="margin:0 22px 22px"')}`)}

    <div class="ap-stats" style="margin-bottom:0">
      ${stat('db', 'Paid to you, all time', 'Loading', 'across every answer', 'earned')}
      ${stat('check', 'Questions answered', 'Loading', '', 'answered')}
      ${stat('clock', 'Per answer', 'Loading', 'the same for every question', 'wage')}
    </div>

    ${card(`
      ${cardHead('Over time', `<span class="ap-select">Last 7 days ${caret}</span>`)}
      <div class="ap-pad" data-app="chart"><p class="ap-empty">Your earnings will be drawn here once there are a few days of them.</p></div>
    `)}

    ${card(`
      ${cardHead('Recent payments', more('See all', 'app-payments.html'))}
      <div data-app="recent-payments"><p class="ap-empty">No payments yet. Your first one appears here the moment an answer is accepted.</p></div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Where your wages go')}
      <div class="ap-pad" style="padding-top:0">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          ${tile('id')}
          <div style="min-width:0"><b style="display:block;font-size:13.5px">Your own account</b><span class="ap-mono" data-app="address" style="display:block;overflow:hidden;text-overflow:ellipsis">Loading</span></div>
          <button class="ap-copy" type="button" data-copy="address" aria-label="Copy your account">${ic('copy')}</button>
        </div>
        ${info('link', 'Anyone can check it', 'Your account and every payment into it are public. That is deliberate: it is how you can prove what you were paid without our help.')}
      </div>
    `)}

    ${card(
      `
      ${cardHead('Send from your account')}
      <div class="ap-pad" style="padding-top:0;display:grid;gap:12px">
        <div class="ap-field">${ic('out')}<input type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="Send to, 0x…" data-app="send-to" aria-label="Address to send to"/></div>
        <div class="ap-field">${ic('money')}<input type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="Amount in dollars" data-app="send-amount" aria-label="Amount in dollars"/></div>
        <button class="ap-primary" type="button" data-app="send">${ic('faceid')} Send with your passkey</button>
        <p data-app="send-status" class="ap-info" style="margin:0" hidden></p>
        ${info('shield', 'Nothing to pay to move it', 'Your passkey signs the transfer on this device. Quorum pays the network fee and can do nothing else with your account.')}
      </div>
    `,
      ' data-app="send-card" hidden',
    )}

    ${card(
      `
      ${cardHead('Your wages go to Tempo Wallet')}
      <div class="ap-pad" style="padding-top:0">
        ${info('wallet', 'Already where you use it', 'You signed in with Tempo Wallet, so every wage lands in it directly. Spend or send it there like anything else you hold.')}
        <a class="ap-second" href="https://wallet.tempo.xyz" target="_blank" rel="noopener" style="margin-top:14px">${ic('out')} Open Tempo Wallet</a>
      </div>
    `,
      ' data-app="tempo-wallet-card" hidden',
    )}

    ${card(`
      ${cardHead('How you get paid')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'bolt', title: 'Each answer, on its own', note: 'Not batched, not weekly, no threshold to reach' })}
        ${row({ icon: 'slash', title: 'Nothing taken out', note: 'No platform cut and no transfer fee. The fee is ours, not yours' })}
        ${row({ icon: 'lock', title: 'Nothing held back', note: 'There is no balance with us, so there is nothing we could withhold' })}
        ${row({ icon: 'out', title: 'Yours to move, any time', note: 'Transfer or spend it on Tempo with your passkey. No request, no approval, no waiting' })}
      </div>
    `)}
  </div>
</div>`,
  })

/* --------------------------------------------------------------- payments -- */

/*
  Payment history.

  The comp's Transaction column says "View public record", which is exactly
  right and is kept verbatim. It is the product's trust mechanism: a worker who
  suspects the number taps it and checks, and the link is never behind an
  "advanced" toggle or replaced by an icon.
*/
const payments = () =>
  appPage({
    title: 'Payments',
    side: workerSide('payments'),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start;margin-bottom:24px">
  <div style="flex:1;min-width:280px">
    ${chip('Payment history')}
    <h1 class="ap-h1">Every payment</h1>
    <p class="ap-sub" style="margin-bottom:0">All of your earnings, each with the public record that proves it.</p>
  </div>
  ${card(`<div class="ap-pad" style="display:flex;align-items:center;gap:14px">
    ${tile('wallet')}
    <div><span style="display:block;font-size:12px;color:var(--ink-3)">Paid to you, all time</span>
    <b style="display:block;font-size:26px;font-weight:700;letter-spacing:-0.03em;font-variant-numeric:tabular-nums" data-app="earned">Loading</b>
    <span style="display:block;font-size:11.5px;color:var(--ink-4)"><span data-app="payment-count">0</span> payments</span></div>
  </div>`)}
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      <div class="ap-bar">
        <span class="ap-select">All time ${caret}</span>
        <div class="ap-field">${ic('search')}<input type="search" placeholder="Search by question or reference…" data-app="payment-search" aria-label="Search your payments"/></div>
      </div>
      <div class="ap-tbl-wrap" data-app="payments-table">
        <p class="ap-empty">No payments yet.<br/>Every answer you are paid for appears here within seconds, with its public record.</p>
      </div>
    `)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('chart', '', 'sm')} Your numbers`)}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'db', title: 'Paid to you, all time', value: 'Loading', key: 'earned' })}
        ${row({ icon: 'check', title: 'Questions answered', value: 'Loading', key: 'answered' })}
        ${row({ icon: 'clock', title: 'Per answer', value: 'Loading', key: 'wage' })}
        ${row({ icon: 'calendar', title: 'Last payment', value: 'Loading', key: 'last-when' })}
      </div>
    `)}

    ${card(`<div class="ap-pad">
      ${info('shield', 'Every payment is public', 'Each row links to the record of that transfer. You can open it, show it to somebody else, or check it years from now. It does not depend on us still being here.')}
      <a class="ap-more" style="margin-top:14px" href="app-help.html">How payment works ${ic('arrow')}</a>
    </div>`)}
  </div>
</div>`,
  })

/* ---------------------------------------------------------------- profile -- */

/*
  Profile.

  The comp's payout panel offers a bank transfer to a masked account at a named
  US bank. That is not how anybody here is paid, and for most of this workforce
  it is not a thing they have. Wages settle to the account their passkey made,
  which needs no setting up and belongs to nobody else. The panel keeps its
  position, its Edit affordance and its verified badge; what it describes is
  real.
*/
const profile = () =>
  appPage({
    title: 'Profile',
    side: workerSide('profile'),
    main: `${workerTop(hello())}
<div>
  <h1 class="ap-h1">Profile</h1>
  <p class="ap-sub">Your account, where your wages go, and how you sign in.</p>
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${card(`
      ${cardHead('Account', `<a class="ap-more" href="app-settings.html">${ic('pencil')} Edit</a>`)}
      <div class="ap-pad" style="padding-top:0;display:flex;align-items:center;gap:16px">
        ${av('Loading', 'lg').replace('>Loading<', ' data-app="initials">Loading<')}
        <div style="min-width:0">
          <b style="display:block;font-size:19px;font-weight:700;letter-spacing:-0.025em" data-app="display-name">Not signed in</b>
          <span class="ap-mono" data-app="worker-id" style="display:block;margin:3px 0 7px">Loading</span>
          <span data-app="verified-pill">${pill('Checking your account', '', 'clock')}</span>
        </div>
      </div>
      <div class="ap-kv">
        <div>${ic('key')}<div><span>How you sign in</span><b>A passkey on this device</b></div></div>
        <div>${ic('id')}<div><span>Your account</span><b class="ap-mono" data-app="address">Loading</b></div></div>
        <div>${ic('calendar')}<div><span>Standing</span><b data-app="standing">Loading</b></div></div>
      </div>
    `)}

    ${card(`<div class="ap-rows">
      ${row({ icon: 'target', title: 'Your skills', note: 'What you answer, and adding more', href: 'app-skills.html' })}
      ${row({ icon: 'shield', title: 'Sign-in and security', note: 'Your passkey, and the devices you use', href: 'app-settings.html' })}
      ${row({ icon: 'wallet', title: 'Where wages are sent', note: 'The account your passkey made', href: 'app-settings.html' })}
      ${row({ icon: 'lock', title: 'Privacy', note: 'What is kept about you, and what is not', href: 'app-settings.html' })}
      ${row({ icon: 'check', title: 'Account status', note: 'Your assessment and whether work can reach you', tag: `<span data-app="status-pill">${pill('Loading')}</span>`, href: 'app-settings.html' })}
      ${row({ icon: 'exit', title: 'Sign out', note: 'You can sign back in with the same passkey', href: 'app-signin.html' })}
    </div>`)}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Where wages are sent')}
      <div class="ap-pad" style="padding-top:0">
        <div style="display:flex;align-items:center;gap:13px;margin-bottom:14px">
          ${tile('id')}
          <div style="flex:1;min-width:0">
            <b style="display:block;font-size:13.5px">Your own account</b>
            <span class="ap-mono" data-app="address" style="display:block;overflow:hidden;text-overflow:ellipsis">Loading</span>
          </div>
          ${pill('Active', 'good', 'check')}
        </div>
        ${info('shield', 'It is yours, not ours', 'Your passkey made this account and only your device can move what is in it. Quorum can send wages to it and can do nothing else with it.')}
      </div>
    `)}

    ${card(`
      ${cardHead('Your numbers')}
      <div class="ap-grid2" style="padding:0 20px 20px">
        <div class="ap-metric" style="display:block"><span>Paid to you</span><b data-app="earned">Loading</b></div>
        <div class="ap-metric" style="display:block"><span>Answered</span><b data-app="answered">Loading</b></div>
        <div class="ap-metric" style="display:block"><span>Per answer</span><b data-app="wage">Loading</b></div>
        <div class="ap-metric" style="display:block"><span>In your account</span><b data-app="balance">Loading</b></div>
      </div>
    `)}

    ${card(`<div class="ap-pad">
      ${info('headset', 'Something wrong?', 'If a payment has not arrived or your account will not open, the help page says what to check and how to reach a person.')}
      <a class="ap-more" style="margin-top:14px" href="app-help.html">Go to help ${ic('arrow')}</a>
    </div>`)}
  </div>
</div>`,
  })

/* ------------------------------------------------------------------- help -- */

const HELP_CARDS = [
  ['route', 'How Quorum works', 'Where the questions come from, why you were chosen for one, and what happens to your answer after you send it.'],
  ['chat', 'Questions and answers', 'What makes a good answer, what the "how sure are you" scale is for, and why skipping costs you nothing.'],
  ['wallet', 'Payment', 'When you are paid, how to check a payment yourself, and what happens if one does not arrive.'],
  ['clipboard', 'The assessment', 'What the five questions are for, what happens if you pass, and what happens if you do not.'],
  ['shield', 'Account and security', 'Passkeys, signing in on a second device, and what is kept about you.'],
  ['headset', 'Contact a person', 'When the answer is not on this page. We reply to everything, and we say when we cannot help.'],
]

const QUICK = [
  ['When am I paid?', 'app-help.html#paid'],
  ['How do I check a payment myself?', 'app-help.html#check'],
  ['Why did that question disappear?', 'app-help.html#closed'],
  ['What if I fail the assessment?', 'app-help.html#assessment'],
  ['Is there anything I have to pay for?', 'app-help.html#free'],
]

const help = () =>
  appPage({
    title: 'Help',
    side: workerSide('help'),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div>
  ${chip('Help')}
  <h1 class="ap-h1 ap-h1-lg">How can we help?</h1>
  <p class="ap-sub">Answers to the things people ask most, how Quorum works, and how to reach a person when the page does not cover it.</p>
</div>

<div class="ap-cols">
  <div class="ap-stack">
    <div class="ap-field ap-field-lg">${ic('search')}<input type="search" placeholder="Search help: payment, assessment, account…" aria-label="Search help"/></div>
    <div class="ap-list">
      ${HELP_CARDS.map(([icon, title, body]) => `<a class="ap-hcard" href="#">${tile(icon)}<div><b>${title}</b><p>${body}</p></div>${caret}</a>`).join('')}
    </div>
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('file', '', 'sm')} Asked most often`)}
      <div class="ap-rows ap-rows-inset">
        ${QUICK.map(([q, href]) => row({ title: q, href })).join('')}
      </div>
    `)}

    ${card(`<div class="ap-pad">
      ${info('wallet', 'A payment has not arrived?', 'Open it in your payment history first. The public record shows whether it settled, and when. If it says failed, we are already retrying it and you do not need to do anything.')}
      <a class="ap-more" style="margin-top:14px" href="app-payments.html">Open payment history ${ic('arrow')}</a>
    </div>`)}

    ${card(`<div class="ap-pad">
      ${info('headset', 'Still stuck?', 'Write to us and say what happened. We answer every message, and we tell you plainly when something is not something we can fix.')}
      <a class="ap-primary" style="margin-top:14px" href="mailto:help@quorum.work">Contact us ${ic('arrow')}</a>
    </div>`)}
  </div>
</div>`,
  })

/* --------------------------------------------------------------- settings -- */

const settingRow = (icon, title, note, items) => card(`
  <div class="ap-card-head">${tile(icon)}<div style="flex:1;min-width:0"><h2 class="ap-h2">${title}</h2><span style="display:block;font-size:12.5px;color:var(--ink-3);margin-top:2px">${note}</span></div></div>
  <div class="ap-rows">${items.join('')}</div>
`)

const toggleRow = (title, note, on = true) =>
  `<div class="ap-row"><div><b>${title}</b><span>${note}</span></div><button class="ap-toggle" type="button" role="switch" aria-checked="${on}" aria-label="${title}"></button></div>`

/*
  Settings.

  The comp's notification block offers three switches, all on. Two of them are
  fine — a worker choosing to be told when work is available is not nagging.
  The third in the comp was a general "important account notifications" that
  cannot be turned off; that is kept, because a security notice genuinely should
  not be optional, and it says so rather than being drawn as a dead switch.
*/
const settings = () =>
  appPage({
    title: 'Settings',
    side: workerSide('settings'),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div>
  <h1 class="ap-h1">Settings</h1>
  <p class="ap-sub">Your account, how you sign in, and what you are told about.</p>
</div>

<div class="ap-cols">
  <div class="ap-stack">
    ${settingRow('user', 'Account', 'Your details and how you sign in.', [
      row({ title: 'Your name', note: 'Shown only to you', value: 'Loading', key: 'display-name' }),
      row({ title: 'Sign-in', note: 'A passkey on this device, so there is no password to change' }),
      row({ title: 'Other devices', note: 'Add a passkey on a second phone or computer' }),
    ])}

    ${settingRow('wallet', 'Where wages are sent', 'The account your passkey made. It is yours.', [
      row({ title: 'Your account', note: 'Wages arrive here the moment an answer is accepted', value: '<span class="ap-mono" data-app="address">Loading</span>' }),
      row({ title: 'Save your account details', note: 'Download the address and network so you can reach the account without us' }),
    ])}

    ${settingRow('shield', 'Security', 'What protects the account.', [
      row({ title: 'Passkey', note: 'Face, fingerprint or device PIN. It never leaves the device' }),
      row({ title: 'Signed-in devices', note: 'See where you are signed in, and end any of them' }),
    ])}

    ${settingRow('bell', 'What you are told about', 'Nothing here will nag you.', [
      `<div class="ap-row" style="align-items:flex-start"><div><b>Work is waiting</b><span>One email when questions in your skills arrive while you are away. At most once every ten minutes, and only if you add an address. Signing up never asks for one</span>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><div class="ap-field" style="flex:1;min-width:220px">${ic('mail')}<input type="email" autocomplete="email" placeholder="you@example.com" data-app="notify-email" aria-label="Email for work notifications"/></div><button class="ap-second" type="button" data-app="notify-save">Save</button></div>
        <p data-app="notify-status" class="ap-info" style="margin:10px 0 0" hidden></p></div></div>`,
      `<div class="ap-row"><div><b>A payment settled</b><span>Every wage appears in Earnings the moment it lands, with its public record. There is no email for each one: however small or large the wage, that would be a stream of noise</span></div>${pill('In the app', '')}</div>`,
      `<div class="ap-row"><div><b>Security notices</b><span>Not sent yet. Your passkey never leaves your device, and Quorum cannot move anything in your account, so there is no account change for us to warn you about</span></div>${pill('Not sent yet', '')}</div>`,
    ])}

    ${settingRow('power', 'Account', 'Leaving, and what happens to what you earned.', [
      row({ title: 'Sign out', note: 'You can sign back in with the same passkey', href: 'app-signin.html' }),
      row({ title: 'Close your account', note: 'Work stops reaching you. What you have already been paid stays yours. It is in your account, not ours, so closing this changes nothing about it' }),
    ])}
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Your account')}
      <div class="ap-pad" style="padding-top:0">
        <span style="display:block;font-size:11.5px;color:var(--ink-4)">Where wages are sent</span>
        <div style="display:flex;align-items:center;gap:8px;margin:5px 0 14px">
          <span class="ap-mono" data-app="address" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">Loading</span>
          <button class="ap-copy" type="button" data-copy="address" aria-label="Copy your account">${ic('copy')}</button>
        </div>
        <button class="ap-second" type="button" style="width:100%" data-app="export">${ic('download')} Save your account details</button>
        <p style="margin:12px 0 0;font-size:11.5px;line-height:1.55;color:var(--ink-4)">Keep this somewhere safe. It is how you reach the account if Quorum is ever gone.</p>
      </div>
    `)}

    ${card(`
      ${cardHead('Quick actions')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'receipt', title: 'Payment history', note: 'Every payment and its record', href: 'app-payments.html' })}
        ${row({ icon: 'db', title: 'Earnings', note: 'What is in your account now', href: 'app-earnings.html' })}
      </div>
    `)}

    ${card(`<div class="ap-pad">${info('headset', 'Need a person?', 'The help page covers the common things. If it does not cover yours, write to us and say what happened.')}<a class="ap-more" style="margin-top:14px" href="app-help.html">Go to help ${ic('arrow')}</a></div>`)}
  </div>
</div>`,
  })

/* ----------------------------------------------------------------- skills -- */

/*
  Skills.

  A worker picks the kinds of question they want, as on any marketplace, and is
  assessed in each one. There is no comp for this screen, so it is built from the
  settings screen's switch rows and the assessment screen's "What happens" card,
  and reads as part of the same app.

  The icons and names are the capability catalogue's, so a worker choosing
  "Matching records" here is choosing the same thing a caller buys under that
  name. The notes are written for the worker rather than the caller: what they
  will be looking at, not what the caller's pipeline needed.
*/
const SKILLS = [
  ['disambiguate', 'swap', 'Telling readings apart', 'Look at a receipt, label or line of text and say which of two readings is right. For example: is the total 45.00 or 4.50?'],
  ['verify', 'shield', 'Checking something is real', 'Say whether a date, an address or a detail is genuine and consistent. For example: is "31 February" a real date?'],
  ['match', 'link', 'Matching records', 'Decide whether two records describe the same person, place or product, when they are written differently.'],
  ['categorise', 'tag', 'Categorising', 'Put an item or a message in the right group from a short list you are given.'],
  ['compare', 'list', 'Comparing', 'Pick the better of two options: the cheaper one, the correct one, or the one that describes something best.'],
]

const skillRow = ([kind, icon, title, note]) =>
  `<div class="ap-row" data-skill="${kind}">${tile(icon, '', 'sm')}<div><b>${title}</b><span>${note}</span></div><span class="ap-row-val" data-skill-state="${kind}"></span><button class="ap-toggle" type="button" role="switch" aria-checked="false" aria-label="${title}" data-skill-toggle="${kind}"></button></div>`

const skills = () =>
  appPage({
    title: 'Your skills',
    script: true,
    side: workerSide('skills', ASSESSMENT_NAV),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div class="ap-cols">
  <div class="ap-stack">
    <div>
      ${chip('Your skills')}
      <h1 class="ap-h1 ap-h1-lg">What are you<em>good at?</em></h1>
      <p class="ap-sub">Pick the kinds of question you want to answer. Each one has its own five-question assessment, and only the ones you pass bring you work. You can add more whenever you like.</p>
    </div>

    ${card(`
      <div class="ap-card-head">${tile('target')}<div style="flex:1;min-width:0"><h2 class="ap-h2">Skills</h2><span style="display:block;font-size:12.5px;color:var(--ink-3);margin-top:2px">Switch on the ones you want to be assessed in.</span></div></div>
      <div class="ap-rows">${SKILLS.map(skillRow).join('')}</div>
    `)}

    <p data-app="skills-error" class="ap-info ap-info-bad" style="margin:0" hidden></p>
    <button class="ap-primary" type="button" data-app="skills-save" disabled>Start the assessment ${ic('arrow')}</button>
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('shield', '', 'sm')} What happens`)}
      <div class="ap-rows ap-rows-inset">
        ${['Pick what you are good at', 'Five questions for each', 'Work in what you passed'].map((t, i) => `<div class="ap-row"><span class="ap-av ap-av-sm">${i + 1}</span><div><b>${t}</b><span>${['One skill or all five. Picking fewer is fine.', 'Four of five passes that skill. Take as long as you need.', 'Questions of that kind reach you, and every one is paid.'][i]}</span></div></div>`).join('')}
      </div>
      <div class="ap-pad">
        ${info('lock', 'One try at each skill', 'An assessment you could retake until you passed would teach its answers, so each skill is assessed once. Not passing one closes that skill only, and the rest are unaffected.')}
      </div>
    `)}
  </div>
</div>`,
  })

/* ------------------------------------------------------------- assessment -- */

const ASSESS_POINTS = [
  ['user', 'Be yourself', 'Use your own judgment. There is no trick and no preferred answer.'],
  ['clipboard', 'Five per skill', 'Of the kind you picked, in the format you will answer for real.'],
  ['clock', 'About two minutes', 'At your own pace. Nothing is timing you.'],
  ['db', 'Then you are paid per answer', 'The assessment itself is not paid. Every real question after it is.'],
]

/*
  The assessment, before it starts.

  The comp's reassurance card claims "bank-level security". That is a phrase
  with no content, and this audience has been lied to by people using it. What
  replaces it is the specific true thing: there is no password, so there is
  nothing about you that a breach could leak.

  "Paid for the assessment" is real and stays. Refusing to pay for work already
  done is the behaviour this network exists to replace, and "a short unpaid
  test" is how that always begins.
*/
const assessment = () =>
  appPage({
    title: 'Assessment',
    script: true,
    side: workerSide('assessment', ASSESSMENT_NAV),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div class="ap-cols">
  <div class="ap-stack">
    <div>
      ${chip('Assessment')}
      <h1 class="ap-h1 ap-h1-lg">Welcome to your<em>assessment.</em></h1>
      <p class="ap-sub">Five short questions for each skill you picked, before any real work of that kind reaches you. Once you pass a skill, every real question of that kind is paid.</p>
    </div>

    <div class="ap-list" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))">
      ${ASSESS_POINTS.map(([icon, title, body]) => `<div>${tile(icon)}<b style="display:block;margin:14px 0 5px;font-size:14.5px;font-weight:700;letter-spacing:-0.02em">${title}</b><p style="margin:0;font-size:12.5px;line-height:1.55;color:var(--ink-3)">${body}</p></div>`).join('')}
    </div>

    ${info('db', 'Pass a skill and its work starts reaching you', 'You need four of the five in each. The assessment is not paid, because none of it reaches a customer; every question after it is paid the moment your answer is accepted.')}

    <a class="ap-primary" href="app-assessment-question.html">Start the assessment ${ic('arrow')}</a>
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('shield', '', 'sm')} What happens`)}
      <div class="ap-rows ap-rows-inset">
        ${['Five questions per skill', 'Four of five passes it', 'Work in what you passed'].map((t, i) => `<div class="ap-row"><span class="ap-av ap-av-sm">${i + 1}</span><div><b>${t}</b><span>${['Choose the option that answers each one.', 'Take as long as you need on each.', 'Only the kinds you passed reach you, and every one is paid.'][i]}</span></div></div>`).join('')}
      </div>
      <div class="ap-pad">
        ${info('lock', 'There is no password to leak', 'You sign in with your device. We hold nothing about you that a breach could take, because there is nothing of that sort to hold.')}
        ${script(['Real people.', 'Real work.'])}
      </div>
    `)}
  </div>
</div>`,
  })

/*
  One assessment question.

  The comp asks "How much experience do you have in this type of work?", which
  is a sign-up form question rather than an assessment one — it has no right
  answer, so it measures nothing and calibrates nothing. Real assessment
  questions have known answers; that is the entire point of them, and the
  gateway serves them. The layout is the comp's exactly.
*/
const assessmentQuestion = () =>
  appPage({
    title: 'Assessment',
    // The same markup as a real question, driven by the assessment endpoints.
    body: ' data-flow="assessment"',
    side: workerSide('assessment', ASSESSMENT_NAV),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div class="ap-cols">
  <div class="ap-stack">
    <div>
      <p class="ap-chip" data-app="q-skill">Assessment</p>
      <h1 class="ap-h1">Question <span data-app="q-number">1</span> of <span data-app="q-of">5</span></h1>
      <div class="ap-progress" style="margin-top:18px">
        <div class="ap-progress-track"><div class="ap-progress-fill" data-app="q-progress" style="width:20%"></div></div>
        <span><span data-app="q-number">1</span> of <span data-app="q-of">5</span></span>
      </div>
    </div>

    <div>
      <h2 class="ap-h3" data-app="prompt" style="font-size:23px;line-height:1.3">Loading the question…</h2>
      <p class="ap-sub" style="margin-bottom:20px">Choose the option that answers it.</p>

      <div data-app="evidence" hidden style="margin-bottom:20px"></div>
      <div class="ap-opts" role="radiogroup" aria-label="Your answer" data-app="options"></div>

      <button class="ap-primary" type="button" data-app="submit" disabled>Next ${ic('arrow')}</button>
    </div>
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead(`${tile('clipboard', '', 'sm')} Assessment`)}
      <div class="ap-pad" style="padding-top:0">
        <b style="display:block;font-size:14px;font-weight:700;letter-spacing:-0.02em">Why we ask these</b>
        <p style="margin:6px 0 0;font-size:12.5px;line-height:1.6;color:var(--ink-3)">We already know the answers. That is what lets us measure judgment rather than ask you to describe it, and it is why work can be routed to the right person later.</p>
      </div>
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'check', title: 'No trick questions', note: 'Anyone paying attention can answer these' })}
        ${row({ icon: 'db', title: 'Not paid', note: 'These five do not reach a customer. Real questions do, and those are paid' })}
        ${row({ icon: 'clock', title: 'No clock', note: 'Take as long as you need on each one' })}
      </div>
    `)}
  </div>
</div>`,
  })

const assessmentPassed = () =>
  appPage({
    title: 'You passed',
    script: true,
    side: workerSide('assessment', ASSESSMENT_NAV),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div class="ap-cols">
  <div class="ap-stack">
    <div>
      ${chip('Assessment complete')}
      <div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap">
        <div class="ap-ok" style="margin:0" aria-hidden="true">
          <i style="top:14px;left:20px"></i><i style="top:6px;right:30px"></i><i style="bottom:16px;left:10px"></i><i style="bottom:8px;right:18px"></i>
          <span class="ap-ok-badge">${ic('check')}</span>
        </div>
        <div style="flex:1;min-width:240px">
          <h1 class="ap-h1 ap-h1-lg">You passed.</h1>
          <p class="ap-sub" style="margin-bottom:0" data-app="passed-note">Real questions can reach you now, and every one of them is paid the moment your answer is accepted.</p>
        </div>
      </div>
    </div>

    ${card(`<div class="ap-split">
      ${metric('check', 'Your score', 'Loading', 'four of five passes', 'score')}
      ${metric('db', 'From here on', 'Loading', 'for every answer accepted', 'wage')}
    </div>`)}

    ${info('bolt', 'Work can reach you now', 'Only questions of the kinds you passed are sent to you, and the ones you do best on find you first.')}

    <a class="ap-primary" href="app-home.html" data-app="result-next">Start answering ${ic('arrow')}</a>
  </div>

  <div class="ap-stack">
    ${card(`
      ${cardHead('Your assessment')}
      <div class="ap-rows ap-rows-inset">
        ${row({ icon: 'clipboard', title: 'Questions', value: 'Loading', key: 'assessment-of' })}
        ${row({ icon: 'check', title: 'Right', value: 'Loading', key: 'assessment-correct', tone: 'good' })}
        ${row({ icon: 'x', title: 'Wrong', value: 'Loading', key: 'assessment-wrong', tone: 'plain' })}
        ${row({ icon: 'db', title: 'Per answer from now on', value: 'Loading', key: 'wage' })}
      </div>
      <div class="ap-pad">
        ${info('wallet', 'Straight to your own account', 'Every wage from here goes to the account your passkey made. There is nothing to claim, no threshold to reach and no pay day to wait for.')}
        ${script(['Real people.', 'Real work.'])}
      </div>
    `)}
  </div>
</div>`,
  })

/*
  The assessment they did not pass.

  Rare, final and easy to do badly. The comps do not draw it. It has to be kind,
  unambiguous about being final, and absolutely clear that they keep what they
  earned — the accusation this whole product is built against is platforms that
  take the work and then close the account.
*/
const assessmentFailed = () =>
  appPage({
    title: 'Assessment',
    side: workerSide('assessment', ASSESSMENT_NAV),
    main: `${workerTop(back('Back to home', 'app-home.html'))}
<div class="ap-cols">
  <div class="ap-stack">
    <div>
      ${chip('Assessment complete')}
      <h1 class="ap-h1 ap-h1-lg">This did not work out.</h1>
      <p class="ap-sub" data-app="failed-note">Too many of the five were missed, so questions will not be routed to you. The assessment is not paid, so nothing is owed either way, and anything you had already earned stays in your own account where we cannot reach it.</p>
    </div>

    ${card(`<div class="ap-split">
      ${metric('clipboard', 'Your score', 'Loading', 'four of five was needed', 'score')}
      ${metric('wallet', 'In your own account', 'Loading', 'yours, and unaffected by this', 'balance')}
    </div>`)}

    ${info('shield', 'Nothing is being withheld', 'Anything you earned on a real question was sent the moment it was accepted, and it is in an account only you control. You can open every payment and check it.', 'plain')}

    <a class="ap-primary" href="app-payments.html" data-app="result-next">See your payments ${ic('arrow')}</a>
  </div>

  <div class="ap-stack">
    ${card(`<div class="ap-pad">
      ${info('headset', 'If you think this is wrong', 'Tell us what happened and we will look at the five questions with you. We reply to everything.')}
      <a class="ap-more" style="margin-top:14px" href="mailto:help@quorum.work">Write to us ${ic('arrow')}</a>
    </div>`)}
  </div>
</div>`,
  })

/* ----------------------------------------------------------------- signin -- */

/*
  Sign in.

  The list of absences is the screen. Every platform this replaces asks a worker
  for money before they can earn any, so saying plainly that we do not is worth
  more than any amount of reassurance about security, and the brief requires it
  to stay visible rather than live in a footer.
*/
const ABSENCES = [
  'No deposit and no stake',
  'No minimum before you are paid',
  'No pay day to wait for',
  'No seed phrase to keep safe',
  'Nothing to buy first',
]

const signIn = () =>
  appPage({
    title: 'Sign in',
    script: true,
    side: `<aside class="ap-side ap-side-worker">
  <a class="brand" href="index.html"><span class="mark">${MARK}</span>Quorum</a>
  <div class="ap-side-foot">
    <div class="ap-note">${ic('shield')}<div><b>Nothing to steal</b><p>There is no password here, so there is none to leak and none to remember.</p></div></div>
    ${themeToggle()}
  </div>
</aside>`,
    main: `<div class="ap-cols">
  <div class="ap-stack">
    <div>
      ${chip('Sign in')}
      <h1 class="ap-h1 ap-h1-lg">Answer questions,<em>get paid per answer.</em></h1>
      <p class="ap-sub">One tap with your fingerprint, face or device PIN. There is no password to choose because there is no password at all, and nothing to set up afterwards.</p>
    </div>

    <div class="ap-list" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      ${ABSENCES.map((text) => `<div style="display:flex;align-items:center;gap:11px;font-size:14px;font-weight:500">${tile('slash', 'plain', 'sm')}${text}</div>`).join('')}
    </div>

    ${info('shield', 'Your earnings are never held by us', 'Each answer is paid straight to an account only you control. There is no balance with Quorum, which is why there is no threshold, no pay day and nothing to withdraw.')}
  </div>

  <div class="ap-stack">
    ${card(`<div class="ap-pad" style="text-align:center">
      <span class="brand" style="display:inline-flex;align-items:center;gap:10px;font-size:19px;font-weight:700;letter-spacing:-0.035em"><span class="mark" style="width:28px;height:28px;color:var(--accent)">${MARK}</span>Quorum</span>
      <h2 class="ap-h3" style="margin:20px 0 6px">Sign in</h2>
      <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:var(--ink-3)">With a passkey on this device, or with your Tempo Wallet.</p>
      <button class="ap-primary" type="button" data-app="passkey">${ic('faceid')} Use this device</button>
      <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:var(--ink-4)">First time here? The same button makes your passkey, so there is no separate sign-up.</p>
      <button class="ap-second" type="button" data-app="tempo-wallet" style="width:100%;justify-content:center;margin-top:18px">${ic('wallet')} Use Tempo Wallet instead</button>
      <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:var(--ink-4)">Already have a Tempo Wallet? Be paid straight into it, with nothing to move afterwards.</p>
      <p data-app="signin-error" class="ap-info ap-info-bad" style="margin-top:14px;text-align:left" hidden></p>
    </div>`)}

    ${card(`<div class="ap-pad">
      ${info('bolt', 'Why a passkey', 'It cannot be phished and it cannot leak in a breach, because there is no secret you could be tricked into typing. It is the gesture you already use to unlock the device.')}
    </div>`)}
  </div>
</div>`,
  })

/* ----------------------------------------------------------------- invite -- */

/*
  The waitlist and the invite.

  While the testnet is invite-only this is where a new account lands, and where
  the site's "Join the waitlist" points. One page does both jobs: someone with an
  invite code redeems it, and someone without one leaves their email. The toggles
  are the skills page's, so a capability looks the same wherever it is chosen.
*/
const invite = () =>
  appPage({
    title: 'Join the waitlist',
    script: true,
    side: `<aside class="ap-side ap-side-worker">
  <a class="brand" href="index.html"><span class="mark">${MARK}</span>Quorum</a>
  <div class="ap-side-foot">
    <div class="ap-note">${ic('users')}<div><b>A group at a time</b><p>Everyone admitted together answers together, so the first questions have people to agree with.</p></div></div>
    ${themeToggle()}
  </div>
</aside>`,
    main: `<div class="ap-cols">
  <div class="ap-stack">
    <div>
      ${chip('Testnet')}
      <h1 class="ap-h1 ap-h1-lg">We&rsquo;re letting people in<em>a group at a time.</em></h1>
      <p class="ap-sub">Leave your email and pick what you would like to answer. When your group is admitted we email you an invite link; then you sign in, take the short assessment, and questions start reaching you in scheduled test sessions.</p>
    </div>

    ${card(`
      <div class="ap-card-head">${tile('mail')}<div style="flex:1;min-width:0"><h2 class="ap-h2">Join the waitlist</h2><span style="display:block;font-size:12.5px;color:var(--ink-3);margin-top:2px">Only your email. No password, no deposit.</span></div></div>
      <div class="ap-pad" style="padding-top:0"><div class="ap-field">${ic('mail')}<input type="email" autocomplete="email" placeholder="you@example.com" data-app="wl-email" aria-label="Your email"/></div></div>
      <div class="ap-rows">${SKILLS.map(([kind, icon, title, note]) => `<div class="ap-row">${tile(icon, '', 'sm')}<div><b>${title}</b><span>${note}</span></div><button class="ap-toggle" type="button" role="switch" aria-checked="false" aria-label="${title}" data-wl-kind="${kind}"></button></div>`).join('')}</div>
    `)}

    <p data-app="wl-result" class="ap-info" style="margin:0" hidden></p>
    <button class="ap-primary" type="button" data-app="wl-join">Join the waitlist ${ic('arrow')}</button>
  </div>

  <div class="ap-stack">
    ${card(`<div class="ap-pad">
      <h2 class="ap-h3" style="margin:0 0 6px">Have an invite?</h2>
      <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:var(--ink-3)">The link in your email fills this in. Sign in first if you have not, and the code is kept for you.</p>
      <div class="ap-field">${ic('key')}<input type="text" autocomplete="off" spellcheck="false" placeholder="Invite code" data-app="invite-code" aria-label="Invite code" style="text-transform:uppercase"/></div>
      <button class="ap-primary" type="button" data-app="invite-redeem" style="margin-top:14px">Continue ${ic('arrow')}</button>
      <p data-app="invite-error" class="ap-info ap-info-bad" style="margin-top:14px;text-align:left" hidden></p>
    </div>`)}

    ${card(`
      ${cardHead(`${tile('shield', '', 'sm')} What happens`)}
      <div class="ap-rows ap-rows-inset">
        ${[['Join the waitlist', 'Your email and the capabilities you want.'], ['Get your invite', 'We email a link when your group is admitted.'], ['Pass the assessment', 'Five questions per capability; four right to pass.'], ['Answer in test sessions', 'We email you before each one. Testnet wages are test tokens.']].map(([t, d], i) => `<div class="ap-row"><span class="ap-av ap-av-sm">${i + 1}</span><div><b>${t}</b><span>${d}</span></div></div>`).join('')}
      </div>
    `)}
  </div>
</div>`,
  })

export {
  invite,
  skills,
  home,
  question,
  submitted,
  closed,
  earnings,
  payments,
  profile,
  help,
  settings,
  assessment,
  assessmentQuestion,
  assessmentPassed,
  assessmentFailed,
  signIn,
}
