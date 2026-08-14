# Week 1 — Make the answers good enough to keep

**Time: a few hours across the week. Cost: $0.00.**

Days 1–3 proved the machinery works. This week is about the only thing that
actually determines whether this business exists: **answer quality.**

If an agent calls once and never returns, we have nothing — regardless of how
elegant the payment layer is.

---

## The week's goal

> On 20 real upgrades that you personally care about, the answer is genuinely
> useful at least 15 times.

Below that bar, do not publish. Publishing a mediocre tool burns the one
first impression you get.

---

## Day 4 — Build an honest scorecard

Pick 20 upgrades across both ecosystems. Include easy ones and nasty ones.

Suggested starting set:

| Ecosystem | Package | from → to | Why it's a good test |
|---|---|---|---|
| npm | react | 18.2.0 → 19.0.0 | Well-documented major |
| npm | express | 4.18.0 → 5.0.0 | Long-awaited major |
| npm | zod | 3.22.0 → 4.0.0 | Type-level breaks |
| npm | next | 14.0.0 → 15.0.0 | Framework-wide |
| npm | eslint | 8.0.0 → 9.0.0 | Config format change |
| pypi | pydantic | 1.10.0 → 2.0.0 | Famously painful |
| pypi | flask | 2.3.0 → 3.0.0 | Moderate |
| pypi | sqlalchemy | 1.4.0 → 2.0.0 | Large API shift |
| npm | (a package with no GitHub releases) | any | Failure mode |
| npm | (a tiny package) | any | Sparse-data mode |

Score each: **useful / partly useful / useless**, and write one line on what was
missing. Keep it in a file — this is your regression suite.

---

## Day 5 — Fix the biggest failure class

You will likely find one dominant gap. The usual suspects:

### "No release notes found"

Many packages keep a `CHANGELOG.md` instead of GitHub Releases. Add a fallback
in `src/sources/github.ts` that fetches `CHANGELOG.md` from the default branch
and splits it by version heading. This is the highest-value single improvement
for coverage.

### Breaking changes found, but no code fix

That is the deterministic tier doing what it can. The LLM tier produces
before/after fragments — but it costs money, so it needs approval. See
[docs/COSTS.md](docs/COSTS.md). Do not enable it without deciding deliberately.

### Missed obvious breaks

Add patterns to `PHRASE_RE` in `src/engine/extract.ts`, then `npm test`.

### Too noisy

Raise the confidence bar, or filter out `low` confidence entries in the renderer.

---

## Day 6 — Precompute the popular pairs

Cold-cache latency is a first-impression problem. Warm it up.

Write `scripts/ingest.ts` to walk the top few hundred npm and PyPI packages and
compute deltas across their recent major versions. Run it overnight on the Mac
Mini. Every pair it computes is one a real user never waits for.

This is also where the moat begins: the cache compounds, and it is not
something a latecomer can conjure retroactively.

---

## Day 7 — Harden and back up

```bash
# Verify no secrets are staged
git status
git check-ignore .env .wallet-testnet.json    # both should be listed

# Set up the weekly backup
mkdir -p ~/backups
crontab -e
# 0 3 * * 0 sqlite3 ~/X402/data/driftwatch.db ".backup '$HOME/backups/driftwatch-$(date +\%F).db'"
```

Run through the [pre-mainnet checklist](docs/SECURITY.md#12-pre-mainnet-checklist)
even though you are not going to mainnet yet. Knowing what it asks for shapes
what you do this month.

---

## End of week — checklist

- [ ] 20-upgrade scorecard exists and is filled in
- [ ] At least 15 of 20 rated useful
- [ ] Biggest failure class identified and addressed
- [ ] Popular version pairs precomputed
- [ ] Backups running
- [ ] No secrets tracked by git

**Spent so far: $0.00.**

**Decision point.** If you cannot get to 15/20, stop and reconsider before
publishing. The problem is real, but our answer may not be good enough yet —
and that is worth knowing now.
