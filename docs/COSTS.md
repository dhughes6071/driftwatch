# What This Actually Costs

Every recurring cost, stated before you commit to it. Per your stop conditions,
nothing here gets switched on without your explicit approval.

---

## Right now: $0.00/month

| Item | Cost | Status |
|---|---|---|
| Mac Mini hosting | $0 | Already running 24/7 |
| npm / PyPI / GitHub / OSV.dev | $0 | Free public APIs, no key required |
| SQLite | $0 | A file on disk |
| x402 testnet facilitator | $0 | Public, no account |
| Testnet USDC | $0 | Faucet play money |
| LLM | $0 | **Disabled by default** |

**Nothing has been spent. Nothing recurring has been added.**

---

## Optional additions, in the order I'd recommend them

### 1. Domain name — ~$12/year ($1/month)

**Why:** Agents need a stable address. `driftwatch.dev` outlives any IP or
tunnel URL, and the OpenAPI spec and Bazaar listing both bake it in.

**When:** Before you list on the Bazaar or publish the MCP server.
**Recommendation: yes, when you're ready to publish.** Cheapest real commitment
in the project.

### 2. GitHub token — $0

**Why:** Raises the GitHub API limit from 60 requests/hour to 5,000/hour. Below
60/hr, some packages come back with "no release notes found".

**Cost: free.** Read-only, public data only.
**Recommendation: yes, do this immediately.** It is free and it directly improves
answer quality.

### 3. LLM synthesis — capped at $30/month, realistically far less

**Why:** Turns raw release notes into structured migration steps with concrete
before/after code. It is a genuine quality upgrade over the deterministic tier.

**Pricing** (Anthropic, as of 2026-08-07, per million tokens):

| Model | Input | Output | Est. cost per NEW version pair |
|---|---|---|---|
| `claude-opus-5` (default) | $5 | $25 | ~$0.10 |
| `claude-sonnet-5` | $3 | $15 | ~$0.06 |
| `claude-haiku-4-5` | $1 | $5 | ~$0.02 |

**The key point: you pay per version pair exactly once, ever.** Results are
cached permanently. Cost does not scale with traffic — it scales with how many
*distinct* upgrades anyone has ever asked about.

| Scenario | New pairs/mo | Cost with Opus 5 |
|---|---|---|
| Light | 50 | ~$5 |
| Moderate | 200 | ~$20 |
| Capped ceiling | — | **$30 (hard limit)** |

`LLM_MAX_DAILY_SPEND_USD` is enforced *before* each call. On breach the service
silently serves the free tier instead — it degrades, it never overspends.

**Currently set to $2.00/day** (raised from $1.00 on 2026-08-08 for Day 2
testing, so the scorecard reflects real quality rather than the free tier).
That is a **$62/month worst case**, not $31.

**Lower it back to 1.00 after Day 2.** Steady-state running needs nowhere near
$2/day — the cache means you only pay for version pairs nobody has asked about
before, and that number falls fast.

**Recommendation: leave it OFF until you have paying users.** The deterministic
tier already produces cited, correct output — verified against React 19. Turn
this on when quality is what limits growth, not before.

### 4. VPS hosting — ~$6/month

**Why:** Only if the Mac Mini becomes a constraint (home internet, power cuts,
or you want a static IP).

**Options:** Hetzner CX22 ~$4.50/mo · Fly.io ~$5/mo · Railway ~$5/mo

**Recommendation: not yet.** The Mac Mini plus a free Cloudflare Tunnel handles
far more traffic than we expect. Revisit at sustained 10,000+ requests/month.

### 5. Stripe — 2.9% + $0.30 per transaction

**Why:** Card billing is the most probable real revenue channel (see
[ECONOMICS.md](ECONOMICS.md)). No monthly fee.

**Note:** the per-transaction fee makes $0.05 charges uneconomic — this means
prepaid credit packs or monthly plans, not per-call billing.

**Recommendation: revisit at month 2–3**, once there is demand to bill for.

---

## Worst case if you enable everything

| Item | Monthly |
|---|---|
| Domain | $1 |
| LLM (hard cap) | $31 |
| VPS | $6 |
| **Maximum** | **$38/month** |

That is the ceiling with every optional component on and the LLM budget maxed
out every single day. Realistic month-one spend with my recommendations is
**$1/month** — just the domain.

---

## Approval checkpoints

Per your Step 14 stop conditions, I will stop and ask before:

- [ ] Buying a domain (~$12/year)
- [ ] Enabling the LLM (up to $31/month)
- [ ] Renting a VPS (~$6/month)
- [ ] Adding Stripe
- [ ] **Any mainnet deployment**
- [ ] **Creating or funding a production wallet**

**None of these have been done. Current spend: $0.00.**
