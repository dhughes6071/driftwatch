# Day 1 — Get it running and see it work

**Time: about 1 hour. Cost: $0.00.**

Goal: the service runs on your Mac Mini and you have seen it answer a real
question. Nothing is published, nothing is paid for, nothing is risky.

---

## 1. Confirm the tools you need (5 min)

```bash
cd ~/X402
node --version    # need v20 or higher -- you have v22
```

If that prints a version, you have everything. There is no build step.

---

## 2. Install and start (10 min)

```bash
npm install
cp .env.example .env
npm start
```

You should see:

```
{"level":"warn","msg":"x402 DISABLED -- all endpoints are free (local development mode)"}
{"level":"info","msg":"driftwatch listening","url":"http://localhost:4021"}
```

Both lines are correct. Payments are off on purpose.

**Leave this terminal running.** Open a second one for everything below.

---

## 3. See it work (15 min)

```bash
curl localhost:4021/health
```

Now the actual product:

```bash
curl "localhost:4021/v1/delta?ecosystem=npm&name=react&from=18.2.0&to=19.0.0"
```

That is real: React 19's actual breaking changes, pulled from React's own
release notes, with links proving each one.

**Try the safety check.** This one is worth understanding:

```bash
curl "localhost:4021/v1/check?ecosystem=npm&name=recat"
```

`recat` is a real package on npm. One typo from `react`, version 0.0.0, no
source code, no description. It is a typosquat waiting for a mistake. We flag it.

Try a few of your own:

```bash
curl "localhost:4021/v1/delta?ecosystem=npm&name=express&from=4.18.0&to=5.0.0"
curl "localhost:4021/v1/delta?ecosystem=pypi&name=pydantic&from=1.10.0&to=2.0.0"
```

---

## 4. Run the tests (5 min)

```bash
npm test
```

17 tests, no network, no cost. All should pass.

---

## 5. Watch a customer go through the whole flow (10 min)

```bash
npm run testclient
```

This simulates a real customer: discovers the service from its published
metadata, reads the price, calls it, verifies it got what it paid for, and
calculates the value received.

Note the last section — the value accounting. That is the argument the whole
business rests on.

---

## 6. Get a free GitHub token (10 min)

Without it, GitHub allows 60 requests/hour and some packages come back missing
release notes. With it, 5,000/hour. It is free.

1. Go to https://github.com/settings/tokens
2. **Generate new token (classic)**
3. Name it `driftwatch`, expiry 90 days, **check no scopes at all** (public data
   only is exactly what we want)
4. Generate, copy it
5. Add to `.env`:

```bash
GITHUB_TOKEN=ghp_yourtokenhere
```

Restart the server (`Ctrl+C`, then `npm start`) and try a package that failed
before.

---

## 7. Read one thing (10 min)

Read [§14 of the Beginner's Guide](BEGINNER_GUIDE.md#14-what-you-should-never-do)
— "What you should never do." It is short, and every item on it is there because
violating it causes real, often irreversible loss.

---

## Done — checklist

- [ ] Server starts and `/health` responds
- [ ] `/v1/delta` returns React 19 breaking changes
- [ ] `/v1/check` flags `recat` as suspicious
- [ ] `npm test` passes
- [ ] `npm run testclient` completes
- [ ] GitHub token added
- [ ] Read "What you should never do"

**Spent so far: $0.00.**

Tomorrow: connect it to your own coding agent and find out whether it is
actually useful.
