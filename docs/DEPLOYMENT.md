# Production Deployment Guide

Four phases, cheapest and safest first. **Do them in order.** You may never need
phase 4.

---

## Phase 1 — Your Mac Mini (free, do this first)

The Mac Mini already runs 24/7. That is real infrastructure and it costs nothing.

### Run it as a background service

macOS uses `launchd`. Create `~/Library/LaunchAgents/com.driftwatch.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.driftwatch</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>--experimental-strip-types</string>
    <string>/Users/YOUR_USERNAME/X402/src/api/server.ts</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/YOUR_USERNAME/X402</string>
  <key>EnvironmentVariables</key>
  <dict><key>START_SERVER</key><string>1</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/YOUR_USERNAME/X402/logs/out.log</string>
  <key>StandardErrorPath</key><string>/Users/YOUR_USERNAME/X402/logs/err.log</string>
</dict>
</plist>
```

Replace `YOUR_USERNAME`, then:

```bash
mkdir -p ~/X402/logs
which node                                    # confirm the path matches the plist
launchctl load ~/Library/LaunchAgents/com.driftwatch.plist
curl localhost:4021/health                    # verify
```

**Managing it:**

```bash
launchctl unload ~/Library/LaunchAgents/com.driftwatch.plist   # stop
launchctl load   ~/Library/LaunchAgents/com.driftwatch.plist   # start
tail -f ~/X402/logs/out.log                                    # watch
```

### Keep it awake

```bash
sudo pmset -a sleep 0 disablesleep 1
```

---

## Phase 2 — Put it on the internet safely

**Do not port-forward your home router.** That exposes your home network. Use a
Cloudflare Tunnel instead — it makes an *outbound* connection, so no inbound
port is ever opened.

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create driftwatch
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: driftwatch
credentials-file: /Users/YOUR_USERNAME/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: driftwatch.yourdomain.com
    service: http://localhost:4021
  - service: http_status:404
```

```bash
cloudflared tunnel route dns driftwatch driftwatch.yourdomain.com
cloudflared tunnel run driftwatch
```

Then update `.env`:

```bash
PUBLIC_URL=https://driftwatch.yourdomain.com
```

**Restart after changing `PUBLIC_URL`** — it is baked into the OpenAPI spec,
`llms.txt`, and the Bazaar listing.

### Run the tunnel as a service too

```bash
sudo cloudflared service install
```

### Verify from outside

```bash
curl https://driftwatch.yourdomain.com/health
curl https://driftwatch.yourdomain.com/llms.txt
curl https://driftwatch.yourdomain.com/openapi.json | head -20
```

Confirm `/admin/stats` is **not** reachable from outside — it should 403:

```bash
curl -i https://driftwatch.yourdomain.com/admin/stats   # expect 403
```

---

## Phase 3 — Go live with payments

> **STOP. This is the real-money step. Do not proceed without deliberately
> deciding to.** Work through the pre-mainnet checklist in
> [SECURITY.md](SECURITY.md#12-pre-mainnet-checklist) first.

### 3a. Prove it on testnet (at least one week)

```bash
# .env
X402_ENABLED=true
X402_NETWORK=base-sepolia
X402_PAY_TO=<your testnet address>
```

```bash
npm run wallet:new     # generates a testnet wallet, prints faucet links
npm run testclient     # full discover -> 402 -> pay -> retry -> verify loop
```

Do not move on until that passes cleanly and repeatedly.

### 3b. Create the receiving wallet

1. Install Coinbase Wallet (or use a hardware wallet).
2. Create a **brand-new wallet used for nothing else.**
3. Copy the **address** only. The private key stays on your device forever.
4. Send it ~$2 of ETH on Base so you can pay withdrawal gas later.

### 3c. Switch to mainnet

```bash
# .env
X402_NETWORK=base
X402_PAY_TO=0xYourRealReceivingAddress
X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
I_UNDERSTAND_THIS_IS_REAL_MONEY=yes
```

The server **refuses to start** on mainnet without that last line. That guardrail
is there so this cannot happen by accident. Do not remove it.

### 3d. Verify before announcing

```bash
curl -i "https://driftwatch.yourdomain.com/v1/delta?ecosystem=npm&name=react&from=18.2.0&to=19.0.0"
# Expect: HTTP 402, and a PAYMENT-REQUIRED header naming Base mainnet USDC
```

---

## Phase 4 — Move to a VPS (only if needed)

Signals it is time: sustained 10,000+ requests/month, home internet becoming a
reliability problem, or you want the Mac Mini back.

```bash
# On a fresh Debian/Ubuntu box
curl -fsSL https://get.docker.com | sh
git clone <your repo> driftwatch && cd driftwatch
cp .env.example .env && nano .env        # fill in real values
docker compose up -d
docker compose logs -f
```

`docker-compose.yml` binds to `127.0.0.1:4021` deliberately. Put Caddy or nginx
in front for TLS; never expose the app port directly.

---

## Discovery — how agents find you

Once live, publish through these. Free, and no human selling required.

### 1. x402 Bazaar (automatic)

With `X402_DISCOVERABLE=true` and the CDP facilitator, listing happens on its
own. Verify after your first paid call:

```bash
curl "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=100" \
  | grep -i driftwatch
```

**Calibrate your expectations:** the entire Bazaar is ~$11,700/month across
14,128 services. Listing is worth doing because it is free, not because it is
distribution.

### 2. MCP registries (this is the real channel)

```bash
npm publish            # publish the MCP server
```

Then submit to `mcp.directory`, `mcp-marketplace.io`, and the `awesome-mcp-servers`
list on GitHub. Config users will add:

```json
{
  "mcpServers": {
    "driftwatch": {
      "command": "npx",
      "args": ["-y", "driftwatch-mcp"]
    }
  }
}
```

### 3. Machine-readable metadata (already served)

| Path | Purpose |
|---|---|
| `/openapi.json` | Agent frameworks ingest this directly |
| `/llms.txt` | Plain-text summary written for an LLM reader |
| `/.well-known/x402` | Payment discovery |
| `/` | Human- and agent-readable index |

---

## Monitoring

```bash
curl localhost:4021/health          # liveness
curl localhost:4021/admin/stats     # revenue, costs, cache hits, unique payers
```

Remote access to stats, without exposing them:

```bash
ssh -L 4021:localhost:4021 you@your-server
```

### A simple daily alert

`~/bin/driftwatch-check.sh`:

```bash
#!/bin/bash
if ! curl -sf --max-time 10 http://localhost:4021/health > /dev/null; then
  echo "driftwatch is DOWN at $(date)" | mail -s "driftwatch alert" you@example.com
fi
```

```bash
chmod +x ~/bin/driftwatch-check.sh
# crontab -e
*/15 * * * * ~/bin/driftwatch-check.sh
```

---

## Backups

```bash
mkdir -p ~/backups
# crontab -e -- weekly, Sunday 3am
0 3 * * 0 sqlite3 ~/X402/data/driftwatch.db ".backup '$HOME/backups/driftwatch-$(date +\%F).db'"
```

`.backup` is SQLite-aware and safe to run while the service is live. Copy these
somewhere off the machine periodically.

---

## Rollback

```bash
git log --oneline -10
git checkout <last-good-commit>
launchctl unload ~/Library/LaunchAgents/com.driftwatch.plist
launchctl load   ~/Library/LaunchAgents/com.driftwatch.plist
```

The database is forward-compatible — `CREATE TABLE IF NOT EXISTS` means an older
build reads a newer DB fine.

**Fastest possible mitigation, any situation:** set `EMERGENCY_SHUTDOWN=true` and
restart. Paid endpoints return 503 while you work out what happened.
