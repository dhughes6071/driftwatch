# Security Model

The financial security question has a short answer: **this server never holds a
private key, so there is nothing on it to steal.**

Everything below explains why that is true and what else is protected.

---

## 1. Where private keys live

| Key | Location | On the server? | If stolen |
|---|---|---|---|
| **Mainnet receiving key** | Your wallet app or hardware wallet, on your own device | **No. Never.** | You lose your earnings |
| **Testnet key** | `.wallet-testnet.json` (gitignored, mode 0600) | Only for local tests | Nothing — play money |
| **Receiving address** | `.env` as `X402_PAY_TO` | Yes | Nothing — addresses are public |

### Why the server needs no key

Blockchain payments are asymmetric:

- **Receiving** money requires only a public address.
- **Spending** money requires the private key.

We only ever receive. So the server needs the address and nothing more.
`grep -r "privateKey" src/` returns nothing outside the testnet script.

### How signing is controlled

Two signing operations exist in this project, and neither is done by the server:

1. **The buyer signs the payment.** That happens in the agent's wallet, on the
   agent's machine. We never see their key.
2. **You sign withdrawals.** That happens in your wallet app, by hand, when you
   choose to move funds.

There is no code path in which this service signs a transaction. An AI agent —
ours or anyone else's — cannot move funds, because nothing in the system has the
authority to.

---

## 2. Spending controls

The service can spend money in exactly one place: optional LLM calls. Four
controls stack on top of it.

| Control | Setting | Default | Effect |
|---|---|---|---|
| Master switch | `LLM_ENABLED` | `false` | No spending is possible at all |
| Daily ceiling | `LLM_MAX_DAILY_SPEND_USD` | `$1.00` | Checked *before* every call; on breach we fall back to the free tier |
| Per-call output cap | `LLM_MAX_OUTPUT_TOKENS` | `2000` | Bounds the cost of any single call |
| Permanent cache | always on | — | Each version pair is paid for exactly once, ever |

The daily ceiling is enforced in `src/engine/synth.ts` before the API call is
made, and the actual cost is recorded after. Exceeding it degrades the service
gracefully — it never fails a paid request, it just returns the deterministic
tier.

**Nothing else in the system can spend money.** Every data source (npm, PyPI,
GitHub, OSV.dev) is free and public.

---

## 3. Emergency shutdown

```bash
# In .env:
EMERGENCY_SHUTDOWN=true
```

Restart, and every `/v1/*` endpoint returns HTTP 503. Free endpoints and
`/health` keep working so you can confirm the service is alive and paused.

Narrower switches, when you do not want the whole thing down:

| Goal | Setting |
|---|---|
| Stop all spending | `LLM_ENABLED=false` |
| Stop taking payments | `X402_ENABLED=false` |
| Delist from Bazaar | `X402_DISCOVERABLE=false` |
| Stop everything | `EMERGENCY_SHUTDOWN=true` |

---

## 4. Rate limits and abuse prevention

Two tiers, both keyed on a **salted hash of the client IP** — the raw IP is
never stored.

| Limit | Default | Applies to |
|---|---|---|
| `FREE_RATE_PER_HOUR` | 60 | Unpaid callers |
| `HARD_RATE_PER_HOUR` | 600 | **Everyone, including paying callers** |

The hard ceiling matters. A paying customer should never be able to run our
upstream quotas dry — payment buys service, not unlimited leverage over our
dependencies.

Additional brakes:

- `MAX_MANIFEST_PACKAGES` (50) caps batch size
- `MAX_BODY_BYTES` (256KB) caps request size
- `UPSTREAM_TIMEOUT_MS` (10s) prevents slow upstreams from piling up connections
- Manifest analysis runs at concurrency 4 — we are a polite upstream citizen

---

## 5. Request validation

Every parameter is validated before it reaches any logic:

| Parameter | Rule | Attack it blocks |
|---|---|---|
| `ecosystem` | Must be exactly `npm` or `pypi` | Injection via enum |
| `name` | `^[@a-zA-Z0-9._/-]+$`, max 214 chars | Path traversal, header injection, SSRF |
| `from` / `to` | `^[0-9A-Za-z.+_-]+$`, max 64 chars | Same |
| `packages[]` | Array, typed, length-capped | Resource exhaustion |

The character allowlists are deliberately narrower than what registries
technically permit. Anything failing validation gets a 400 — we never attempt to
sanitize and continue.

---

## 6. Payment verification and replay protection

We do not implement payment verification ourselves. That is the facilitator's
job, and rolling our own would be a mistake.

The `@x402/*` v2 middleware handles:

- Signature verification on the payment payload
- **Replay protection** via nonces and `maxTimeoutSeconds` (300s) — a captured
  payment header cannot be reused
- Amount and asset checking against the declared requirements
- Settlement, with a receipt returned in the `x-payment-response` header

If verification fails, the middleware returns 402 and our handler never runs.
The service cannot be tricked into doing paid work for free by a malformed
payment.

---

## 7. Least privilege

| Component | Privilege held |
|---|---|
| Server process | Read/write one SQLite file. Runs as non-root in Docker. |
| Wallet | Receive-only (no key present) |
| GitHub token | Optional, read-only public data. Only raises a rate limit. |
| Anthropic key | Optional, capped by daily spend limit |
| `/admin/stats` | Localhost only, enforced by IP check |

---

## 8. Logging and privacy

Logs are structured JSON on stdout. We deliberately **do not** log:

- Raw IP addresses (hashed with a per-install salt before storage)
- Request bodies
- API keys, tokens, or any secret
- Payer wallet addresses beyond the revenue ledger

What we do log: route, status, duration, cost, cache hit, and error type.

---

## 9. Backups

One file matters: `data/driftwatch.db`. It holds your cache (the thing that
makes the margin work) and your revenue ledger.

```bash
# Safe hot backup -- SQLite-aware, works while running
sqlite3 data/driftwatch.db ".backup '/path/to/backups/driftwatch-$(date +%F).db'"
```

Losing it is recoverable — the cache rebuilds itself as requests arrive — but
you would lose your revenue history and pay to recompute deltas. Back it up
weekly. It is small.

---

## 10. Threat model

| Threat | Impact | Mitigation |
|---|---|---|
| Server fully compromised | Cache and ledger lost | **No funds at risk — no key present.** Rotate the GitHub and Anthropic keys, restore the DB. |
| `.env` leaked | GitHub + Anthropic keys exposed | Rotate both. No wallet key to lose. |
| Repo made public with secrets | Same as above | `.gitignore` covers `.env`, `.wallet-testnet.json`, `*.key`, `*.pem` |
| Payment replay | Free service | Handled by facilitator nonces + timeout |
| Free-tier abuse | Upstream quota exhaustion | Two-tier rate limiting |
| Malicious package name | Traversal / SSRF | Strict character allowlist |
| Runaway LLM spend | Unexpected bill | Daily cap, checked before each call |
| Upstream (npm/GitHub) outage | Degraded answers | Graceful degradation; warnings surfaced in the response |

---

## 11. What we deliberately do not do

- **No user accounts, no passwords, no PII.** Nothing to breach.
- **No storing of payer identity** beyond the ledger.
- **No outbound calls to anything but four documented public APIs.**
- **No execution of untrusted input.** We read package metadata; we never run it.
- **No reselling of licensed data.** All sources are free and public.

---

## 12. Pre-mainnet checklist

Every box must be ticked before `X402_NETWORK=base`:

- [ ] Ran on testnet for at least one week with no unexplained errors
- [ ] `git status` shows no `.env` and no `.wallet-testnet.json`
- [ ] `X402_PAY_TO` is a **fresh** wallet used for nothing else
- [ ] That wallet's private key exists **only** on your own device
- [ ] `CLIENT_HASH_SALT` changed from the default
- [ ] `LLM_MAX_DAILY_SPEND_USD` set to a number you would not mind losing
- [ ] Backup of `data/driftwatch.db` verified restorable
- [ ] You have read [§14 of the Beginner's Guide](../BEGINNER_GUIDE.md#14-what-you-should-never-do)
- [ ] You know how to trigger `EMERGENCY_SHUTDOWN`
