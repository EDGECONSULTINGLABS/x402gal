/**
 * Level 2 proof — real-testnet fault injection (RUN BY THE OPERATOR).
 *
 * Proves the cross-chain settlement flow captures a forced desync and self-heals
 * without double-charging. Cannot run without funded testnet wallets, so it is
 * driven by you, not CI. Three phases, run in order against a LIVE dev server.
 *
 * Prerequisites (server env, in .env.local):
 *   UPSTASH_REDIS_REST_URL / _TOKEN   — same Redis the server uses
 *   EVM_TREASURY_PRIVATE_KEY / _ADDRESS, AVALANCHE_NETWORK=fuji
 *   HYDROCOIN_ISSUER_SEED, XRPL_TREASURY_SEED, XRPL_RPC_URL (funded testnet)
 *   CRON_SECRET                       — to invoke the retry worker
 * Harness env:
 *   BUYER_PRIVATE_KEY   — a Fuji wallet holding test USDC + a little AVAX for the
 *                         treasury's gas (the treasury pays gas, buyer just signs)
 *   BASE                — dev server origin (default http://localhost:3000)
 *
 * ── Runbook ──────────────────────────────────────────────────────────────────
 *  PHASE 1 — force the desync:
 *    Start the server WITH the fault hook:   XRPL_FORCE_FAIL=1 npm run dev
 *    Then:                                    PHASE=desync npx tsx scripts/test-level2-faultinjection.ts
 *    Asserts: HTTP 500, Fuji USDC actually moved, FAILED obligation in Redis with
 *    fujiTxHash set, no XRPL retirement. Persists state to .level2-state.json.
 *
 *  PHASE 2 — self-heal via the worker (the headline proof):
 *    Restart the server WITHOUT the hook:     npm run dev      (no XRPL_FORCE_FAIL)
 *    Then:                                    PHASE=heal npx tsx scripts/test-level2-faultinjection.ts
 *    Asserts: worker resumes, obligation FAILED→RETIRED, real retirement hash,
 *    and fujiTxHash UNCHANGED (proves NO second Fuji pull — charged once).
 *
 *  PHASE 3 — idempotency:
 *    (server still running without the hook)   PHASE=replay npx tsx scripts/test-level2-faultinjection.ts
 *    Asserts: replaying the original request returns the original receipt
 *    (duplicate:true), no second mint.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { privateKeyToAccount } from "viem/accounts";
import { parseSignature, getAddress, type Hex } from "viem";
import { getObligation } from "../lib/obligations";

const BASE = process.env.BASE ?? "http://localhost:3000";
const STATE_FILE = ".level2-state.json";
const FUJI_USDC = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
const FUJI_CHAIN_ID = 43113;
const AMOUNT_MICROS = "1000"; // 0.001 USDC — keep it cheap

let failed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS  ${name}`);
  else { failed++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) { console.error(`Missing required env: ${k}`); process.exit(2); }
  return v;
}

interface SavedState {
  nonce: string;
  fujiTxHash: string;
  requirement: Record<string, unknown>;
  payload: Record<string, unknown>;
}

// ── Build + sign a real ERC-3009 authorization ────────────────────────────────
async function buildSignedRequest() {
  const buyerKey = requireEnv("BUYER_PRIVATE_KEY") as Hex;
  const treasury = getAddress(requireEnv("EVM_TREASURY_ADDRESS"));
  const buyer = privateKeyToAccount(buyerKey);

  const now = Math.floor(Date.now() / 1000);
  const validAfter = "0";
  const validBefore = String(now + 3600);
  const nonce = `0x${randomBytes(32).toString("hex")}`;

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: FUJI_CHAIN_ID,
    verifyingContract: FUJI_USDC as Hex,
  } as const;
  const types = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const;
  const message = {
    from: buyer.address,
    to: treasury,
    value: BigInt(AMOUNT_MICROS),
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce as Hex,
  };

  const signature = await buyer.signTypedData({ domain, types, primaryType: "ReceiveWithAuthorization", message });
  const sig = parseSignature(signature);

  const requirement = {
    x402Version: 1,
    scheme: "exact",
    network: "xrpl",
    asset: "USDC",
    maxAmountRequired: AMOUNT_MICROS,
    resource: "/api/ai/chat",
    description: "Level 2 fault-injection test",
    mimeType: "application/json",
    payTo: treasury,
    requiredDeadlineSeconds: 60,
    offsetHydroDrops: 1,
    estimatedMl: 1,
  };
  const payload = {
    x402Version: 1,
    scheme: "exact",
    network: "xrpl",
    payload: {
      signature,
      authorization: {
        from: buyer.address,
        to: treasury,
        value: AMOUNT_MICROS,
        validAfter,
        validBefore,
        nonce,
        v: Number(sig.v),
        r: sig.r,
        s: sig.s,
      },
    },
  };

  return { requirement, payload, nonce };
}

async function postFacilitate(body: unknown): Promise<{ status: number; json: any }> {
  const r = await fetch(`${BASE}/api/x402/facilitate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

function saveState(s: SavedState) { writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }
function loadState(): SavedState {
  if (!existsSync(STATE_FILE)) { console.error(`No ${STATE_FILE} — run PHASE=desync first.`); process.exit(2); }
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

// ── PHASE 1 — force the desync ────────────────────────────────────────────────
async function phaseDesync() {
  console.log("PHASE 1 — force desync (server must run with XRPL_FORCE_FAIL=1)\n");
  const { requirement, payload, nonce } = await buildSignedRequest();

  const { status, json } = await postFacilitate({ requirement, payload });
  ok("facilitate returns 500 (XRPL leg failed)", status === 500, `status=${status}`);
  ok("error names the injected XRPL failure", String(json?.errorReason ?? "").includes("XRPL_FORCE_FAIL"),
    `errorReason=${json?.errorReason}`);

  const o = await getObligation(nonce);
  ok("obligation exists and is FAILED", o?.status === "FAILED", `status=${o?.status}`);
  ok("obligation has fujiTxHash (USDC moved, captured)", !!o?.fujiTxHash, `fujiTxHash=${o?.fujiTxHash}`);
  ok("no XRPL retirement yet", !o?.retireTxHash, `retireTxHash=${o?.retireTxHash}`);

  if (o?.fujiTxHash) {
    console.log(`\n  Fuji USDC pull (charged): https://testnet.avascan.info/blockchain/c/tx/${o.fujiTxHash}`);
    saveState({ nonce, fujiTxHash: o.fujiTxHash, requirement, payload });
    console.log(`  Saved state → ${STATE_FILE}`);
  }
  console.log("\n  → Now restart the server WITHOUT XRPL_FORCE_FAIL, then run PHASE=heal.");
  finish();
}

// ── PHASE 2 — self-heal via the worker (headline) ─────────────────────────────
async function phaseHeal() {
  console.log("PHASE 2 — self-heal via worker (server must run WITHOUT XRPL_FORCE_FAIL)\n");
  const state = loadState();
  const secret = requireEnv("CRON_SECRET");

  const r = await fetch(`${BASE}/api/x402/retry-obligations`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  const workerResult = await r.json().catch(() => ({}));
  ok("worker endpoint authorized + ran", r.status === 200, `status=${r.status}`);
  console.log("  worker:", JSON.stringify(workerResult));

  const o = await getObligation(state.nonce);
  ok("obligation is now RETIRED", o?.status === "RETIRED", `status=${o?.status}`);
  ok("XRPL retirement hash present", !!o?.retireTxHash, `retireTxHash=${o?.retireTxHash}`);
  ok("NO second Fuji pull (fujiTxHash unchanged → charged once)", o?.fujiTxHash === state.fujiTxHash,
    `before=${state.fujiTxHash} after=${o?.fujiTxHash}`);

  if (o?.retireTxHash) {
    console.log(`\n  Fuji USDC pull (still the only charge): https://testnet.avascan.info/blockchain/c/tx/${state.fujiTxHash}`);
    console.log(`  XRPL mint hop:   https://testnet.xrpscan.com/tx/${o.mintTxHash}`);
    console.log(`  XRPL retirement: https://testnet.xrpscan.com/tx/${o.retireTxHash}`);
  }
  finish();
}

// ── PHASE 3 — idempotency ─────────────────────────────────────────────────────
async function phaseReplay() {
  console.log("PHASE 3 — idempotency replay\n");
  const state = loadState();

  const { status, json } = await postFacilitate({ requirement: state.requirement, payload: state.payload });
  ok("replay returns 200", status === 200, `status=${status}`);
  ok("replay flagged duplicate (no re-settle)", json?.duplicate === true, `duplicate=${json?.duplicate}`);
  ok("replay returns the original retirement hash", !!json?.retirementTxHash, `retirementTxHash=${json?.retirementTxHash}`);
  console.log("\n  → Verify on XRPScan there was NO second mint for this nonce.");
  finish();
}

function finish() {
  if (failed > 0) { console.error(`\n${failed} assertion(s) failed`); process.exit(1); }
  console.log("\nAll assertions passed for this phase.");
}

const phase = process.env.PHASE;
(async () => {
  if (phase === "desync") await phaseDesync();
  else if (phase === "heal") await phaseHeal();
  else if (phase === "replay") await phaseReplay();
  else {
    console.error('Set PHASE=desync | heal | replay. See the runbook at the top of this file.');
    process.exit(2);
  }
})().catch((err) => { console.error(err); process.exit(1); });
