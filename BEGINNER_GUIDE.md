# Beginner's Guide

Written for someone who has never built an x402 application. Plain English, no
assumed knowledge. Read it top to bottom once; after that use it as a reference.

---

## 1. What we built

A service called **driftwatch** that answers one question:

> "This software library went from version A to version B. What broke, and what
> edits does my code need?"

Concretely: you send it `react`, `18.2.0`, `19.0.0`. It sends back a structured
list — *"`ReactDOM.render` was removed, use `createRoot` instead"* — with a link
to the official release note proving each claim.

It runs three ways, all from one engine:

| Surface | What it is | Who uses it |
|---|---|---|
| **MCP server** | A plugin for AI coding tools (Claude Code, Cursor, Windsurf) | Developers — this is how people find us |
| **HTTP API** | A normal web API with an OpenAPI spec | CI systems, automated agents |
| **x402 endpoint** | The same API, payable with crypto, no signup | Autonomous agents with a wallet |

### Why "driftwatch"?

Software libraries *drift* away from what an AI model learned during training.
We watch that drift and report it.

---

## 2. Why people and agents would pay

Every AI model has a **knowledge cutoff** — a date after which it knows nothing.
Libraries keep changing after that date. So when an AI writes code using a
library, it often uses a function that no longer exists.

What happens then is the expensive part. The AI:

1. Writes the code
2. Runs the build — it fails
3. Reads the error, guesses a fix
4. Runs the build — it fails again
5. …repeats, typically about six times

Each of those attempts costs money in AI tokens. Six attempts at roughly 15,000
tokens each is somewhere around **$0.30 to $1.50** of wasted spend, plus ten to
twenty minutes of waiting.

**One call to us costs $0.05 and replaces that loop.**

That is the whole pitch. The buyer does not have to like us or trust our brand —
they only have to do the arithmetic. That is the strongest kind of demand there
is, because it survives contact with a spreadsheet.

### The honest caveat

That 6-iteration figure is a **modelled estimate**, not something we measured.
It is the assumption the business rests on. The first real job is to find out
whether actual users experience it that way. If they do not, we adjust the price
or the pitch — not the evidence.

---

## 3. How x402 works

x402 revives HTTP status code **402 Payment Required**, which was reserved in
1997 and never used. The flow has four steps:

```
  1. Agent asks for something          GET /v1/delta?name=react&from=18.2.0&to=19.0.0
                                                    |
  2. We say "that costs money"          <-- HTTP 402 Payment Required
                                            + a header saying: $0.05 in USDC,
                                              on Base, send it to <our address>
                                                    |
  3. Agent signs a payment                  (its wallet approves $0.05)
                                                    |
  4. Agent asks again, with proof       GET /v1/delta?...  + PAYMENT header
                                                    |
                                        <-- HTTP 200 + the actual answer
```

### Why this exists at all

An autonomous software agent has no credit card, no legal identity, and cannot
sign up for a SaaS account. But it can hold a crypto wallet. x402 lets it buy
one API call for five cents with no account, no invoice, and no human.

### Words you will see

| Word | What it actually means |
|---|---|
| **USDC** | A digital dollar. 1 USDC is intended to always equal $1. |
| **Base** | A fast, cheap blockchain built by Coinbase. Where payments settle. |
| **Base Sepolia** | The practice version of Base. Play money. Free. Cannot become real money. |
| **Facilitator** | A middleman service that checks a payment is valid and settles it. We use the free public one. |
| **Wallet address** | Like an account number. **Public — safe to share.** Starts with `0x`. |
| **Private key** | The password to a wallet. **Anyone who has it owns the money.** Never share it, never commit it, never put it on a server. |
| **Testnet / Mainnet** | Practice mode / real money mode. |

---

## 4. How money flows

```
  An AI agent somewhere
          |
          |  pays $0.05 in USDC
          v
  x402 facilitator  (verifies the payment is real, settles it on Base)
          |
          v
  YOUR RECEIVING WALLET  <-- money arrives here, on the Base blockchain
          |
          |  you move it, manually, whenever you want
          v
  Coinbase (or another exchange)
          |
          v
  Your bank account, as dollars
```

**Three things to hold onto:**

1. **Money never touches our server.** The server only knows the *address* to
   send payments to. Addresses are public information, like a P.O. box number.
2. **We hold no private key.** Not in code, not in the environment, not in a
   file. There is nothing on that machine for an attacker to steal.
3. **Withdrawal is a manual step you do yourself.** No automated system can move
   your money out, because no automated system has the key.

---

## 5. How the wallet works

You will end up with **two separate wallets**. This separation is the single
most important security decision in the whole project.

| | Testnet wallet | Receiving wallet (later) |
|---|---|---|
| Contains | Play money | Real money |
| Created by | `npm run wallet:new` | You, in Coinbase Wallet or a hardware wallet |
| Key stored | In a gitignored local file | **Never on the server. Ever.** |
| If stolen | You lose nothing | You lose everything in it |
| Server needs | The private key (to *pay*, in tests) | Only the address (to *receive*) |

The asymmetry is what makes this safe: **receiving money requires only a public
address. Only spending requires a key.** We only ever receive. So the server
never needs a key, and we never give it one.

**Sweep regularly.** Move earnings from the receiving wallet to an exchange or
cold wallet on a schedule. A receiving wallet should hold as little as possible
at any moment — it is a mailbox, not a safe.

---

## 6. How to start the application

**One-time setup:**

```bash
cd ~/X402
npm install
cp .env.example .env
```

**Start it:**

```bash
npm start
```

You should see a line like:

```
{"level":"info","msg":"driftwatch listening","url":"http://localhost:4021"}
```

That is it. It is running, with payments **off** and the paid AI features
**off** — so it costs nothing.

**Stop it:** press `Ctrl+C`.

---

## 7. How to test it

With the server running, open a second terminal.

**Check it is alive:**

```bash
curl localhost:4021/health
```

**Ask the real question:**

```bash
curl "localhost:4021/v1/delta?ecosystem=npm&name=react&from=18.2.0&to=19.0.0"
```

You should get back React 19's actual breaking changes, with links.

**Try the safety check — this one is fun:**

```bash
curl "localhost:4021/v1/check?ecosystem=npm&name=recat"
```

`recat` is a real package on npm. It is one typo away from `react`, has version
0.0.0, no source code, and no description. It is a typosquat sitting there
waiting for a mistake. Our service flags it as suspicious.

**Run the automated tests:**

```bash
npm test
```

**Run the test agent** — this simulates a full customer, end to end:

```bash
npm run testclient
```

---

## 8. How to put it online

Full instructions are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). The short
version, in order:

1. **Start on your Mac Mini.** It already runs 24/7. Cost: $0.
2. **Get a domain** (~$12/year) so agents have a stable address.
3. **Expose it safely** with a Cloudflare Tunnel — free, and it means you never
   open a port on your home network.
4. **Move to a VPS later**, only if traffic actually justifies it (~$6/month).

Do these in order. Do not skip to step 4 — you may never need it.

---

## 9. How to receive real payments

**Stop. This is the step where real money becomes possible.** Do not do it until
the service has been running on testnet without errors for at least a week.

When you are ready:

1. Create a **brand-new wallet** in Coinbase Wallet. Use it for nothing else.
2. Copy its **address** (the `0x...` string). Only the address.
3. Put the address in `.env` as `X402_PAY_TO`.
4. Change `X402_NETWORK` from `base-sepolia` to `base`.
5. Add `I_UNDERSTAND_THIS_IS_REAL_MONEY=yes` — the server refuses to start on
   mainnet without it. That guardrail exists so you cannot do this by accident.
6. Restart.

**Never put that wallet's private key anywhere near the server.** The server
does not need it and must never have it.

---

## 10. How to withdraw funds

1. Open your wallet app. Your USDC balance is on the **Base** network.
2. Send the USDC to your Coinbase account (choose Base as the network).
3. In Coinbase, sell USDC for USD.
4. Withdraw to your bank.

A small amount of ETH on Base is needed to pay transaction fees — usually
fractions of a cent. Keep a dollar or two of ETH in the wallet so withdrawals
never get stuck.

**Withdraw on a schedule, not on impulse.** Monthly is fine. Every withdrawal
costs a small fee, and leaving funds in a hot receiving wallet is the risk you
are trying to avoid.

---

## 11. How to monitor revenue

The service keeps its own ledger. From the machine it runs on:

```bash
curl localhost:4021/admin/stats
```

You get requests, paid requests, revenue, costs, gross profit, cache hit rate,
and unique payers — for the last 24 hours, 7 days, 30 days, and all time.

This endpoint **only answers to localhost** on purpose. Your revenue figures are
nobody else's business. To read it from another machine, tunnel over SSH:

```bash
ssh -L 4021:localhost:4021 you@your-server
```

Then open `http://localhost:4021/admin/stats` in your browser.

---

## 12. How to shut everything down

**Pause instantly, keep it running:** set `EMERGENCY_SHUTDOWN=true` in `.env`
and restart. Every paid endpoint returns 503. Nothing is lost.

**Stop the process:** `Ctrl+C`, or `docker compose down`.

**Stop only the spending:** set `LLM_ENABLED=false`. The service keeps working
on its free deterministic tier.

**Stop taking money:** set `X402_ENABLED=false`.

**Shut it all down permanently:**

1. Stop the process
2. Withdraw any funds from the receiving wallet
3. Back up `data/driftwatch.db` (your cache and ledger)
4. Cancel the domain and any hosting

Nothing here has a contract, a lock-in, or a cancellation fee.

---

## 13. What could go wrong

Honest list, most likely first.

| Risk | Likelihood | What it looks like | What to do |
|---|---|---|---|
| **Nobody pays** | **High** | Free MCP installs grow, paid calls stay near zero | The expected early outcome. The MCP tool still builds an audience. Re-evaluate the price and the pitch, not the evidence. |
| **A funded competitor ships this** | Medium | Context7 or Stack Overflow adds version deltas | Real risk we cannot fully defend. Move fast, go deep in a narrow slice. |
| **Answer quality is poor** | Medium | Agents call once, never return | This is the whole product. Test against real upgrades constantly. |
| **GitHub rate-limits us** | Medium | `warnings` mention missing release notes | Add a free `GITHUB_TOKEN` — raises 60/hr to 5000/hr. |
| **Runaway AI costs** | Low | Unexpected Anthropic bill | Capped by `LLM_MAX_DAILY_SPEND_USD`, default $1/day. Verify with `/admin/stats`. |
| **Server compromised** | Low | Unexpected traffic or processes | You lose a cache and a ledger. **You cannot lose money — there is no key on it.** |
| **Mainnet mistake** | Low | Real money moves when you meant to test | Guarded by `I_UNDERSTAND_THIS_IS_REAL_MONEY`. Never remove it. |
| **Someone abuses the free tier** | Low | Traffic spike from one source | Rate limits cap free at 60/hr and everything at 600/hr per client. |

---

## 14. What you should never do

Read this list twice. Every item is here because violating it causes real,
often irreversible loss.

**Money and keys**

1. **Never put a mainnet private key on the server.** Not in `.env`, not in
   code, not in an environment variable. The service does not need one.
2. **Never commit `.env` or `.wallet-testnet.json`.** Both are gitignored.
   Verify with `git status` before every commit.
3. **Never paste a private key into a chat, an issue, a screenshot, or a
   support form.** No legitimate person will ever ask for one.
4. **Never reuse your personal wallet as the receiving wallet.** Make a fresh
   one that does nothing else.
5. **Never skip testnet.** Every payment path gets proven with play money first.

**Business integrity**

6. **Never pay yourself to inflate the numbers.** Fake volume destroys the only
   signal that tells you whether this is real. It is also fraud if presented to
   anyone as traction.
7. **Never fabricate testimonials, reviews, or usage figures.**
8. **Never resell licensed data.** Everything we consume is free and public. The
   most profitable x402 operators today resell paid APIs in breach of their
   terms — we deliberately do not.
9. **Never reproduce documentation wholesale.** We publish facts and short
   citations with links. That is both legally sound and a better product.

**Operations**

10. **Never expose `/admin/stats` publicly.** It is localhost-only by design.
11. **Never remove the rate limits** because a customer asked. They are the
    brake that stops one caller draining your upstream quotas.
12. **Never enable the LLM without a spend cap.** The cap is the only thing
    between you and an unbounded bill.
13. **Never trust an agent's input.** Every parameter is validated. Do not
    loosen that to "make it work".

---

## Where to go next

- [README.md](README.md) — technical overview and architecture
- [docs/SECURITY.md](docs/SECURITY.md) — exactly where keys live and how spending is controlled
- [docs/ECONOMICS.md](docs/ECONOMICS.md) — the money model, three scenarios
- [docs/COSTS.md](docs/COSTS.md) — what running this actually costs
- [DAY_1.md](DAY_1.md) — your first session, step by step
- [PROJECT_STATUS.md](PROJECT_STATUS.md) — what is done and what is next
