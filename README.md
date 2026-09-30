# Quorum

**A2A defines `input-required` for the moment an agent needs a human. In an autonomous chain nobody is there, so the agent guesses instead. Quorum makes `input-required` resolvable.**

An agent hands over the clarifying question it was about to show a person, blocks for a few seconds, and gets a real answer back. The person who answered is paid the instant their answer is accepted — a stablecoin, to an account only they control, with no balance held, no threshold and no pay day.

---

## The problem

The A2A task lifecycle is `submitted → working → input-required → auth-required → completed | failed | canceled | rejected`. On entering `input-required`, the specification says the agent emits its clarifying question and the task pauses, waiting for the user, negotiating via the UI.

In an autonomous agent-to-agent chain there is no UI and no user. Agent A hired Agent B, B hit `input-required`, and nobody is listening. So the hook is a dead end, and B does the only other thing available to it: it picks its best guess and reports success.

Nothing breaks when that happens. That is the problem. No error is raised, no retry fires, no alert goes off — the chain cannot tell you it went wrong because as far as it knows it did not. This is the failure mode documented as *silent delegation failure*, and it is the dominant one in 2026 multi-agent stacks.

## Why a person, and not a retry

An agent can fix most of its own mistakes: retry, call a bigger model, search, ask itself to check its work. What it cannot fix is a mistake that every one of those checks makes too. If the OCR read a smudged "4S.00" as 4.50, every model downstream reads the same wrong string. If a store was built to look like the brand's, it was built to pass exactly the checks a model can run. If the agent wrote both drafts, it is grading its own work. More compute makes the wrong answer more confident, not right.

A person looking at the evidence is the one check whose errors are not the agent's errors. Each capability is one place where that blind spot shows up:

| Capability | Why the agent cannot settle it itself | A moment it matters |
| --- | --- | --- |
| Tell two readings apart | The extraction already turned the image into text; every later model reads the same text | "Is the total 45.00 or 4.50?" before an entry is posted |
| Check something is real | A lookalike is built to pass the checks a model can run | "Is this the brand's own store?" before a shopping agent pays |
| Match records | A 0.93 similarity score does not say which side of "the same" it is on | "Are these two customers one person?" before a merge |
| Categorise | Where one category ends is a rule people agreed, not a fact in the data | "Allowed, or a counterfeit listing?" for a moderation agent |
| Compare | The agent produced both candidates, and a model tends to prefer its own work | "Which reply goes to the customer?" for a support agent |

And the agent should not ask whenever it is unsure. It should ask **when being wrong costs more than asking**. Send `cost_of_error` with the question and Quorum does that arithmetic: it prices the question from the cost, buying more certainty for a bigger mistake, and when the agent's own guess is the better bet it says so and charges nothing.

Run the comparison yourself:

```bash
npm install
npm run demo
```

One accounts-payable agent closing out its week, run twice. It meets three moments it cannot check for itself: a misread receipt total, an invoice from a lookalike of a known supplier with new bank details, and a payment link on a domain one character off. Alone, it makes all three wrong decisions and nothing flags any of them. With Quorum, each goes to a person, priced by its cost of error ($1.42 for a $40.50 mistake, $5.00 for a $4,800 one), and all three come back right, for $11.42 in total.

## How it works

```mermaid
sequenceDiagram
    autonumber
    participant A as Agent A<br/>(assigns the work)
    participant B as Agent B<br/>(does the work)
    participant Q as Quorum gateway
    participant P as People<br/>(passed in that skill)
    participant T as Tempo

    A->>B: A2A message/send: "process this invoice"
    Note over B: unsure, and every check it could run<br/>shares its blind spot
    B->>Q: POST the input-required task, with cost_of_error
    Q-->>B: 402, priced by the cost of error<br/>(or not_worth_asking, free)
    B->>T: pays the 402 over MPP, in stablecoin
    B->>Q: claim, holding the connection
    Q->>P: the question, to the best-proven person first
    P-->>Q: an answer, with how sure they are
    Note over Q: weighs answers by record;<br/>asks again only if needed
    Q->>T: pays each person who answered, 20c each
    Q-->>B: one of B's options, with its confidence
    B-->>A: task completed, correctly
```

Nothing in steps 3 to 11 is visible to Agent A. From where it sits, B simply came back right, which is what a resolver on `input-required` is for. When people disagree, B is told the question is ambiguous and is refunded, and A holds that step instead of acting on a guess.

## What this is not

Not a human work marketplace. The distinction is the product:

|                    | Supply-side platforms (Toloka, Sapien, HUMAN Protocol) | Quorum                        |
| ------------------ | ------------------------------------------------------ | ----------------------------- |
| Who calls it       | a company wanting a dataset                            | an agent, mid-execution       |
| When               | ahead of time, as a batch                              | at a protocol state transition |
| Latency budget     | hours to weeks                                         | seconds                       |
| Integration point  | a job-posting console                                  | the `input-required` state    |
| What is sold       | labour                                                 | correctness                   |

Because what is sold is correctness, the price is set by what the caller's error would have cost — fifty cents to five dollars a question — not by what the labour costs. This is not a cheaper way to buy piecework and does not try to be.

## Using it

Ask, get a `402`, pay, claim. Two calls.

```http
POST /v1/questions

{
  "question": "Is the total on this receipt 45.00 or 4.50?",
  "kind": "disambiguate",
  "context": { "image_url": "https://…", "extracted": { "total": "4.50", "confidence": 0.41 } },
  "answer_schema": { "type": "enum", "options": ["45.00", "4.50", "neither"] },
  "cost_of_error": "40.50",
  "caller_confidence": 0.41,
  "deadline_ms": 30000
}
```

`cost_of_error` is what acting on a wrong answer would cost you. Quorum prices the question from it; send `max_price` instead, or as well, to set a ceiling yourself. If your own guess is the better bet, the answer is `200 {"status": "not_worth_asking"}` with the arithmetic, before anything is charged.

```http
HTTP/1.1 402 Payment Required
WWW-Authenticate: Payment realm="…", amount="2.50", currency="USD", recipient="0x…"

{ "question_id": "q_…", "quote": "2.50", "claim_url": "…/v1/questions/q_…/claim" }
```

```http
POST /v1/questions/q_…/claim
Authorization: Payment <credential>
```

The connection is held open until the question resolves. Terminal statuses are `resolved`, `no_consensus`, `timeout` and `refused`; **the last three refund you.**

You can also POST an A2A `input-required` task status **unmodified**, with a `dev.quorum.resolver` entry in its metadata carrying `answer_schema` and `cost_of_error` or `max_price`. The response is the task status to resume with. Your agent does not restate its question in our vocabulary — it forwards the thing it was already going to emit.

Most agents will reach it through MCP instead, via one tool, `ask_human`.

### What it answers

Data judgment, in the five capabilities above, and only from people who passed an assessment in that capability. Every answer is one of the options the caller sent, with its confidence.

**Not approvals.** Deploying to production, sending external communications, moving money, deleting data, changing privileges — these always need a human with authority, that human is always a colleague, and nobody outsources them to a stranger. Quorum has no access to your systems and questions that would require it are refused.

## How it decides when to stop asking

The interesting engineering is in [`packages/core/src/quorum.ts`](packages/core/src/quorum.ts).

Fixed three-way majority voting triples the wage bill on every question, including the large majority that one competent worker would have got right alone. Instead each answer is treated as evidence:

- a proven worker, asked alone, can clear the bar by themselves;
- an unproven one cannot, so a second opinion is bought;
- two workers who disagree cancel out, so a third is bought to break it.

**Only the first of those is a rule.** The second and third are not coded anywhere — they fall out of the arithmetic, which is the point: the escalation ladder is a consequence of the confidence model rather than a second set of heuristics that can drift out of step with it.

The model is a Dawid-Skene style weighted vote with a symmetric error assumption. Each worker is a noisy channel reporting the truth with probability `p`, otherwise reporting one of the `k - 1` wrong answers uniformly; the posterior is the resulting likelihood normalised across all `k` hypotheses. That is stricter than multiplying reputations together, and the difference shows up exactly where it matters: multiplying says two 0.9 workers who *disagree* give you 0.81 confidence in one of them, while the posterior correctly says you have a coin flip and need to buy a third answer. It also makes agreement worth more on a question with eight possible answers than on a yes/no one, which vote-counting cannot express.

**Price is the confidence dial, exposed once.** Fifty cents buys a quick single opinion; five dollars buys near-certainty and funds the extra answers that certainty costs. There is deliberately no second knob for confidence — see the note on `trustTarget` for why letting a caller's self-doubt raise the bar turned the hardest questions into refunds.

**And the cost of error sets the price.** An answer bought at price `P` leaves at most `1 − trustTarget(P)` chance of being wrong, so asking costs `P + (1 − trustTarget(P)) × cost_of_error` and not asking costs `(1 − caller_confidence) × cost_of_error`. `adviseFromCost` in [`pricing.ts`](packages/core/src/pricing.ts) picks the price that minimises the first, and says not to ask when the second is smaller.

Reputation is a Beta posterior over agreement outcomes, per worker **per question kind**, because the skills do not transfer. It is derived rather than stored: every input is an answer and a payment that exist on chain, so it can be rebuilt after a bug and a worker can check our arithmetic without our cooperation. A question that ends `no_consensus` counts against nobody — penalising the dissenter would teach the pool to guess the popular answer, which would make the whole confidence model a lie.

## What the worker gets

- Passkey sign-in, or Tempo Wallet. No seed phrase, ever.
- A short entry assessment before any caller's question reaches them: five known-answer questions, unpaid because nothing in it is billed to anyone.
- One question at a time, answered by tapping rather than typing.
- Paid per answer, direct to their own account, the moment the answer is accepted.
- **No deposit, no stake, no bond, no minimum payout, and no gas asset to acquire.**
- An optional email when work in their skills is waiting and they are away, at most once every ten minutes. Sent through Resend when `RESEND_API_KEY` is set; signing up never asks for an address.
- A way out that costs nothing. A passkey controls a Tempo account directly, but a passkey only works on the site that made it, so the app has a *Send* control and Quorum pays the network fee. A worker who signs in with Tempo Wallet is paid straight into it and has nothing to move.

That last line is the one differentiator no competitor can copy without rebuilding their economics. HUMAN Protocol pays in HMT. Kleros and Reality.eth require a bond. Sapien requires workers to buy and lock SAPIEN to unlock better-paying tasks. Every prior attempt puts a capital requirement on the person doing the work, which is incoherent for someone earning twenty cents an answer.

Tempo makes it hard to reintroduce by accident, because there is no native gas asset to hold at all: a worker's account holds a stablecoin and nothing else. That is a property of the chain, not a marketing claim.

It also removes the custodian. Every micro-work platform became one for a structural reason — when a payment costs thirty cents to send, a twenty-cent wage cannot be sent, so earnings accumulate in a platform-held balance released monthly above a threshold minus a cut. Every documented harm in that industry, from accounts closed the day before pay day to thousands of workers dropped mid-month with unpaid hours and no redress, is downstream of somebody else holding the worker's money. Quorum holds none of it. That is the actual novelty here: not cheap payments, which several chains offer, but the removal of the custodian — and with it the ability to pay a stranger who has no account and no prior relationship with us.

## Layout

```
quorum/
├── packages/
│   ├── core/            the engine. No I/O, no chain, heavily tested
│   │   ├── quorum.ts        confidence model and when to ask another person
│   │   ├── pricing.ts       price as the confidence dial; cost_of_error advice
│   │   ├── reputation.ts    per-skill reliability from graded history
│   │   ├── onboarding.ts    per-skill assessments
│   │   ├── antifarming.ts   known-answer checks, rate limits, reading time
│   │   ├── a2a.ts           input-required in, task status out
│   │   └── capability.ts    the five capabilities agents can call
│   ├── gateway/         HTTP + MCP surface
│   │   ├── server.ts        /v1/questions: quote, 402, claim, answer
│   │   ├── router.ts        routes to people by skill, settles wages and refunds
│   │   ├── worker-api.ts    sign-up, skills, assessments, work, earnings
│   │   ├── wallet-routes.ts Tempo Wallet sign-in and the worker fee relay
│   │   ├── notifier.ts      opt-in email when work is waiting (Resend)
│   │   └── mcp.ts           the ask_human tool
│   ├── paymaster/       the only code that knows a chain exists: TIP-20 wages on Tempo
│   ├── site/            marketing site, docs, worker app (app-*.html), operator console
│   │   └── wallet/          passkey accounts and Tempo Wallet, bundled on demand
│   └── worker-app/      a bare debug client for the worker API; not for real work
└── demo/
    ├── main.ts          the scripted comparison, one agent run twice
    ├── agent-a.ts       Agent A, a standalone A2A client that assigns the work
    ├── agent-b.ts       Agent B, a standalone A2A server that forwards input-required
    └── chain.ts         the three moments the agent cannot check for itself
```

`Paymaster` is an interface in `core` with one implementation in `packages/paymaster`. Settlement is the part most likely to change and the part that most needs to be swappable, so the routing logic never touches a chain directly — which is also why the router can be tested exhaustively against an in-memory paymaster.

## Running it

```bash
npm install
npm run setup     # writes .env with fresh testnet keys
npm run build
```

Then two terminals:

```bash
npm run gateway   # :8787
npm run site      # :4173
```

Open **http://localhost:4173/app-signin.html**. Sign in — no password, nothing to fund. The app finds the gateway on port 8787 of whatever host served it, so no query string is needed; pass `?gateway=https://…` if yours is elsewhere.

### Putting a question in front of yourself

The queue will say *waiting for a question* and mean it, because **a question only reaches a worker once a caller has paid the 402.** `npm run setup` turns on two testnet-only dev routes so you can see the app work without a funded treasury:

```bash
# Give every registered worker enough history to settle a question alone. Without
# this you will only ever see `no_consensus` — an unproven worker is never trusted to
# answer on their own, which is the design rather than a bug.
curl -X POST localhost:8787/v1/dev/worker-history -H 'content-type: application/json' -d '{}'

# Put a question in the queue. It appears on screen within a second.
curl -X POST localhost:8787/v1/dev/question -H 'content-type: application/json' -d '{
  "question": "The line reads TOTAL 4S.00. Is the total 45.00 or 4.50?",
  "context": { "text": "Meridian Print & Supply, invoice MPS-2026-0914.",
               "extracted": { "total": "4.50", "confidence": 0.41 } }
}'
```

The first writes reputation nobody earned; the second creates work nobody paid for. Both are refused outside testnet and are not mounted unless `QUORUM_DEV_ENDPOINTS=true`. **Turn them off before showing anyone a real deployment.**

### On a phone

`npm run setup` prints a LAN address and allows it through CORS, so a phone on the same network can open `http://<your-ip>:5173`. One caveat: **passkeys need HTTPS or localhost**, so over a plain LAN address the browser refuses WebAuthn outright. The app detects this, relabels the button *Continue without a passkey*, and issues a temporary identity stored only in that browser. That is for looking at the layout on real hardware — never for real work, because an identity anyone can mint is not an identity. For the genuine passkey flow, use localhost on a desktop or put it behind HTTPS.

### Checking the agent side

```bash
curl localhost:8787/health
curl localhost:8787/.well-known/agent-card.json
curl localhost:8787/docs

# The 402: a quote, a claim url, and a challenge naming chain 42431.
curl -i -X POST localhost:8787/v1/questions -H 'content-type: application/json' -d '{
  "question": "Is the total 45.00 or 4.50?", "kind": "disambiguate",
  "answer_schema": { "type": "enum", "options": ["45.00", "4.50"] },
  "max_price": "2.50", "deadline_ms": 20000 }'
```

### Real settlement

Wages and refunds are real chain writes. Fund the treasury from the Moderato faucet and prove it:

```bash
npm run fund      # faucet -> treasury, prints explorer links
npm run settle    # pays one real wage to a brand-new address
```

`npm run settle` generates an address that has never existed, pays it one wage, and prints the transaction. One from when the wage was two cents:

> **[0x5555c664…c764e09](https://explore.testnet.tempo.xyz/tx/0x5555c664fc570178d3c68a4471c9673dfc67cea24881c2546bffb0225c764e09)** — 2c to `0x65388d86…`, landed in **1.17s**, memo `0x563ab2b2…` binding the payment to the question it paid for.

The recipient held nothing beforehand: no gas asset, no prior balance, no account with us. With an unfunded treasury these writes fail, the gateway logs `wage payment failed`, and the caller is still answered — deliberately, since a settlement failure must not cost a caller the answer they paid for.

### Tests

```bash
npm test          # 108 tests
npm run typecheck
npm run demo      # the two-run comparison, no keys or network needed
```

The demo is seeded, so a run can be replayed exactly; `--random` gives a fresh draw, including the runs where people disagree and the agent is refunded.

Against a real gateway, with a worker signed in and on shift:

```bash
npm run demo -- --live   # a new wallet from the faucet pays all three 402s; wages and refunds print explorer links
```

### Two real agents

The same afternoon as two separate processes speaking A2A, with Quorum between them. Each in its own terminal, with someone signed in to the worker app who has passed Telling readings apart, Matching records and Checking something is real:

```bash
npm run gateway          # Quorum, on :8787
npm run agent-b          # Agent B, an A2A server on :9090; forwards input-required to Quorum
npm run agent-a          # Agent A finds B by its agent card and sends it the week's three tasks
```

Agent B logs each escalation: its own guess, what a mistake would cost, Quorum's price, the answer, and a Tempo explorer link for every wage. Run `npm run agent-b -- --alone` first to see the same agent with nobody on `input-required`, making three wrong decisions that nothing flags.

## On Tempo

| | Moderato testnet | Mainnet |
| --- | --- | --- |
| Chain ID | `42431` | `4217` |
| RPC | `https://rpc.moderato.tempo.xyz` | `https://rpc.tempo.xyz` |
| Wage currency | pathUSD | USDC.e |

What is used and why:

- **Sub-cent fees** — each twenty-cent wage is sent on its own the moment it is earned, so no balance needs holding.
- **TIP-20 memos** — every wage carries the question it paid for, so the receipt *is* the work record and the worker keeps it whatever happens to us.
- **Workers are never charged a fee** — for a wage the treasury is the sender, and when a worker sends from their own account the gateway co-signs as fee payer (`/v1/relay`, Tempo's fee-payer transaction field). That relay is Quorum's own treasury, not Tempo's public testnet sponsor, so it holds on mainnet too. It sponsors one thing only: a registered worker transferring the wage stablecoin.
- **Passkey accounts** — Tempo derives an account's address from a P-256 key, so a passkey made in the browser *is* a Tempo account, and signs for it with no seed phrase anywhere.
- **No native gas asset** — a worker cannot be asked for capital by accident.
- **Concurrent nonce lanes** — three wages on an escalated question settle in parallel, not serially.
- **`transferSync` returning the emitted `Transfer` event** — a TIP-20 transfer can be blocked by a recipient policy and still succeed at the transaction level, so a successful receipt is *not* evidence anyone was paid. The emitted recipient and amount are verified before a wage is called settled.

## What is actually new here

Three claims, each narrow enough to check.

**First human judgment on these rails.** A scan of the MPP services catalog on 19 September 2026 returned 142 live services: 85 data, 28 web, 27 ai, 22 search, 13 social, 10 blockchain, 7 compute, 7 media, 4 storage. There is no human or labour category and no service selling human judgment — `annotate`, `crowd`, `worker`, `expert` and `judgment` all return zero. Every provider an agent can currently discover and pay is another agent. Quorum is the first that is a person.

**First resolver for `input-required`.** Prior art attaches to a job console, an escrow contract or an enterprise contract. Nothing attaches to the protocol state that already exists for precisely this moment. That is the integration point here, and it is why forwarding a paused task costs a caller nothing to adopt.

**First with no worker capital.** HUMAN Protocol pays in HMT. Kleros and Reality.eth require a bond. Sapien requires workers to buy and lock SAPIEN for better-paying work. Every prior attempt puts a capital requirement on the person doing the work. Quorum requires nothing, and on Tempo it cannot be reintroduced by accident because there is no native gas asset to hold.

Together those give the sentence the category does not otherwise have: **an agent can discover a person, pay them, and get an answer back in seconds, with neither side holding an account.**

### What we are not first at

Paying people per task in stablecoins — Sapien does it on Base. Human-in-the-loop APIs — several exist, including Apify's. Crowd judgment settled on-chain — Kleros and Reality.eth have done it for years. This is not a new idea, and the pitch does not need it to be: it is the first time the pieces are assembled at a protocol state transition, at conversational latency, with nothing asked of the worker.

## Known limits

Stated plainly because judges penalise pretending more than an acknowledged gap.

- **Settlement is demonstrated on Moderato**, not mainnet. The mechanism is identical; only the network differs.
- **Supply is the real risk, and it is not an engineering one.** The demo ships with a simulated worker so it runs unattended, and says so on screen every time. Whether real people will answer for twenty cents is settled by recruiting, not by code.
- **Sybil resistance is weak.** One identity per passkey, and a determined operator with several phones defeats it. The usual fix is a worker bond, which this refuses on principle, so the honest position is that it is unsolved. Anti-farming rests on the entry assessment, constrained answer spaces, seeded known-answer questions, rate limits and latency distributions.
- **Account recovery is not built.** A passkey synced through iCloud Keychain or Google Password Manager survives a lost phone, which covers most people most of the time. A device-bound one does not, and the earnings behind it would be unreachable. Tempo smart accounts support multiple authorised keys, so the production answer is a second key registered at sign-up — that is designed and not implemented.
- **Cross-border worker payments raise KYC and labour questions** not solved here.
- **Cheap fees are not a moat.** Base, Solana and Polygon are also cheap. Tempo is the best *fit* — no gas asset, session vouchers, Stripe-backed 402 SDKs — not a defensible technical edge.
- **Tempo Wallet sign-in has not been completed by a person yet.** It is built on Tempo's Accounts SDK and the gateway side is tested, but the wallet's own sign-in window has only been exercised by code, not tapped through on a phone. The passkey path — sign in, be paid, send it on with the fee covered — has been run against Moderato.
- **Session mode is not built.** Charge mode works end to end first, because that is the one a caller hits.

## Licence

MIT.
