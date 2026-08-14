# Day 3 — Prove payments work, with play money

**Time: about 1 hour. Cost: $0.00 — testnet funds are free and worthless.**

Goal: complete the full discover → 402 → pay → retry → verify loop on testnet.
No real money is involved anywhere in this file.

---

## 1. Understand what you are about to do (10 min)

Read [§3–5 of the Beginner's Guide](BEGINNER_GUIDE.md#3-how-x402-works) — how
x402 works, how money flows, how the wallet works.

The one idea to hold onto: **receiving money needs only a public address;
spending needs the private key.** We only receive, so the server never needs a
key. That is why this is safe.

---

## 2. Create a testnet wallet (5 min)

```bash
npm run wallet:new
```

Writes `.wallet-testnet.json` (gitignored, mode 0600) and prints faucet links.

**This is play money.** Base Sepolia USDC cannot be converted into anything real.
If you lost this key entirely, you would lose nothing.

---

## 3. Get free testnet funds (15 min)

1. **Base Sepolia ETH** (for gas): https://www.alchemy.com/faucets/base-sepolia
2. **Base Sepolia USDC**: https://faucet.circle.com — choose *Base Sepolia*

Paste the address the script printed. Both faucets are free.

Add the private key it printed to `.env`:

```bash
TESTNET_PRIVATE_KEY=0x...
```

---

## 4. Turn payments on — testnet only (10 min)

```bash
# .env
X402_ENABLED=true
X402_NETWORK=base-sepolia
X402_PAY_TO=<the address from step 2>
```

Restart. Confirm the log says **Base Sepolia (testnet)**.

Verify the paywall:

```bash
curl -i "localhost:4021/v1/delta?ecosystem=npm&name=react&from=18.2.0&to=19.0.0"
```

Expect **HTTP 402** and a `PAYMENT-REQUIRED` header. That header is the machine-
readable "here's what it costs and where to send it".

Confirm free routes still work:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "localhost:4021/v1/check?ecosystem=npm&name=react"
# expect 200
```

---

## 5. Run the full paid loop (15 min)

```bash
npm run testclient
```

This time it goes all the way: discovers, sees 402, signs a testnet payment,
retries, verifies the response, records the cost, and reports the value received.

**If it fails**, the usual causes are:

| Error | Cause |
|---|---|
| "insufficient funds" | Faucet USDC hasn't arrived — wait, check the explorer |
| "no gas" | Need Base Sepolia ETH too, not just USDC |
| Connection refused | Server not running |
| Still 402 after paying | `X402_NETWORK` mismatch between server and client |

---

## 6. Look at your ledger (5 min)

```bash
curl localhost:4021/admin/stats
```

Requests, paid requests, revenue, costs, gross profit, cache hits, unique payers.
Revenue is in testnet dollars, so it is not real — but the plumbing that will
track real revenue is now proven.

---

## Done — checklist

- [ ] Read how x402 and the wallet work
- [ ] Testnet wallet created and funded from faucets
- [ ] Unpaid request returns 402
- [ ] Free endpoints still return 200
- [ ] `npm run testclient` completes the full paid loop
- [ ] `/admin/stats` shows the transaction

**Spent so far: $0.00. No real money has been involved at any point.**

This week: make the answers good enough that people would keep it installed.
