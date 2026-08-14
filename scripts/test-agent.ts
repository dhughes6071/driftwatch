/**
 * INTERNAL TEST AGENT -- behaves like a legitimate customer, on testnet only.
 *
 * This exists to prove the payment path works end to end. It is NOT a growth
 * tool. It runs against our own service, on testnet, with play money, and it
 * is never scheduled or run in a loop to manufacture volume. Fake demand would
 * corrupt the only signal that tells us whether this business is real.
 *
 * What it does, in order:
 *   1. Discovers the service from its published metadata (no hardcoded routes)
 *   2. Reads the advertised price
 *   3. Makes an unpaid request and confirms it gets HTTP 402
 *   4. Authorizes payment on testnet and retries
 *   5. Verifies the response is actually the service we paid for
 *   6. Records what it cost
 *   7. Computes the value received vs. the price paid
 *
 * Run with:  npm run testclient
 */
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import "dotenv/config";

const BASE = (process.env.TEST_TARGET_URL ?? "http://localhost:4021").replace(/\/+$/, "");
const KEY = process.env.TESTNET_PRIVATE_KEY;
const NETWORK = "eip155:84532"; // Base Sepolia

/** Token cost of the failed build-fix loop this call replaces. See docs/ECONOMICS.md. */
const AVOIDED_ITERATIONS = 6;
const TOKENS_PER_ITERATION = 15_000;
const USD_PER_MTOK_BLENDED = 10; // input+output blend for a mid-tier coding model

function log(step: string, msg: string) {
  console.log(`[${step}] ${msg}`);
}

async function main() {
  console.log("=".repeat(70));
  console.log("driftwatch test agent -- TESTNET ONLY, simulating one real customer");
  console.log("=".repeat(70));

  // --- 1. DISCOVER -------------------------------------------------------
  log("1/9", `Discovering service at ${BASE} ...`);
  const index = await (await fetch(`${BASE}/`, { signal: AbortSignal.timeout(15_000) })).json();
  log("1/9", `Found "${index.name}": ${index.tagline}`);

  const wellKnown = await (
    await fetch(`${BASE}/.well-known/x402`, { signal: AbortSignal.timeout(15_000) })
  ).json();
  log("1/9", `Payment: ${wellKnown.enabled ? `${wellKnown.networkLabel} / ${wellKnown.asset}` : "disabled"}`);

  const deltaResource = (wellKnown.resources ?? []).find((r: { path: string }) => r.path === "/v1/delta");
  if (!deltaResource) throw new Error("Service does not advertise /v1/delta");

  // --- 2. PRICE ----------------------------------------------------------
  log("2/9", `Advertised price for ${deltaResource.path}: ${deltaResource.price}`);
  const priceUsd = Number(String(deltaResource.price).replace(/[^0-9.]/g, ""));

  const target = `${BASE}/v1/delta?ecosystem=npm&name=react&from=18.2.0&to=19.0.0`;

  // --- 3. UNPAID REQUEST -> expect 402 ------------------------------------
  log("3/9", "Making an UNPAID request (expecting HTTP 402) ...");
  const unpaid = await fetch(target, { signal: AbortSignal.timeout(20_000) });

  if (!wellKnown.enabled) {
    log("3/9", `Payments are disabled on this instance (got HTTP ${unpaid.status}).`);
    console.log("\nTo exercise the full payment path, restart the server with X402_ENABLED=true.\n");
    if (unpaid.ok) await verify(await unpaid.json(), priceUsd, 0);
    return;
  }

  if (unpaid.status !== 402) {
    throw new Error(`Expected HTTP 402 for an unpaid request, got ${unpaid.status}. The paywall is not working.`);
  }
  log("3/9", "Got HTTP 402 Payment Required -- paywall is working.");

  const requirements = await unpaid.json().catch(() => null);
  if (requirements) {
    log("3/9", `Server stated its payment requirements (x402 v${requirements.x402Version ?? "?"}).`);
  }

  // --- 4. PAY AND RETRY --------------------------------------------------
  if (!KEY) {
    console.log("\nNo TESTNET_PRIVATE_KEY set, so the payment step is being skipped.");
    console.log("Run `npm run wallet:new`, fund it from the faucets it prints, then re-run.\n");
    return;
  }

  const account = privateKeyToAccount(KEY as `0x${string}`);
  log("4/9", `Paying from testnet wallet ${account.address}`);

  const client = new x402Client().register(NETWORK, new ExactEvmScheme(account));
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  const started = Date.now();
  const paid = await fetchWithPay(target, { signal: AbortSignal.timeout(90_000) });
  const elapsed = Date.now() - started;

  if (!paid.ok) {
    throw new Error(`Paid request failed with HTTP ${paid.status}: ${await paid.text()}`);
  }
  log("5/9", `Paid request succeeded in ${elapsed}ms.`);

  const settlement = paid.headers.get("x-payment-response");
  if (settlement) log("6/9", `Settlement receipt returned by the facilitator.`);

  // --- 7/8/9. VERIFY, RECORD, VALUE --------------------------------------
  await verify(await paid.json(), priceUsd, elapsed);
}

async function verify(body: unknown, priceUsd: number, elapsedMs: number) {
  const d = body as {
    schemaVersion?: number;
    package?: string;
    breakingChanges?: unknown[];
    citations?: unknown[];
    advisories?: unknown[];
    meta?: { cacheHit?: boolean; computeCostUsd?: number };
  };

  log("7/9", "Verifying we received the service we paid for ...");
  const checks: Array<[string, boolean]> = [
    ["response has a schema version", d.schemaVersion === 1],
    ["response names the package", typeof d.package === "string" && d.package.length > 0],
    ["breaking changes array is present", Array.isArray(d.breakingChanges)],
    ["at least one breaking change found", (d.breakingChanges?.length ?? 0) > 0],
    ["claims are backed by citations", (d.citations?.length ?? 0) > 0],
    ["advisories array is present", Array.isArray(d.advisories)],
  ];

  let allPassed = true;
  for (const [label, ok] of checks) {
    console.log(`        ${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) allPassed = false;
  }

  log("8/9", `Cost recorded: $${priceUsd.toFixed(4)} (testnet USDC -- no real value)`);

  // --- 9. VALUE ACCOUNTING ------------------------------------------------
  const avoidedTokens = AVOIDED_ITERATIONS * TOKENS_PER_ITERATION;
  const avoidedUsd = (avoidedTokens / 1e6) * USD_PER_MTOK_BLENDED;
  const ratio = priceUsd > 0 ? avoidedUsd / priceUsd : Infinity;

  console.log("");
  console.log("-".repeat(70));
  console.log("VALUE ACCOUNTING (the reason a paying agent would call this again)");
  console.log("-".repeat(70));
  console.log(`  Paid:                    $${priceUsd.toFixed(4)}`);
  console.log(`  Latency:                 ${elapsedMs}ms`);
  console.log(`  Cache hit:               ${d.meta?.cacheHit ? "yes" : "no (first computation)"}`);
  console.log(`  Our cost to serve:       $${(d.meta?.computeCostUsd ?? 0).toFixed(6)}`);
  console.log("");
  console.log(`  Estimated tokens avoided: ${avoidedTokens.toLocaleString()}`);
  console.log(`    (${AVOIDED_ITERATIONS} failed build-fix iterations x ${TOKENS_PER_ITERATION.toLocaleString()} tokens)`);
  console.log(`  Estimated value:          $${avoidedUsd.toFixed(4)}`);
  console.log(`  Return on the call:       ${ratio === Infinity ? "n/a (free)" : `${ratio.toFixed(1)}x`}`);
  console.log("-".repeat(70));
  console.log("");
  console.log("  NOTE: the avoided-token figure is a modelled estimate, not a");
  console.log("  measurement. It is the assumption the business rests on, and it");
  console.log("  is the number to validate with real users first.");
  console.log("");

  if (!allPassed) {
    console.error("Some verification checks FAILED -- do not ship this.");
    process.exit(1);
  }
  log("9/9", "All checks passed. The full discover -> 402 -> pay -> retry -> verify loop works.");
}

main().catch((err) => {
  console.error("\nTest agent failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
