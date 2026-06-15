// XRPL HydroCoin operations — real two-wallet on-chain flow with a REAL AMM swap.
//
// Two-wallet architecture:
//   ISSUER  (cold) = rBKe5... — issues HYD IOUs, seeds the pool, receives burns
//   TREASURY (hot) = rWVeb... — holds HYD + USDC trust lines, swaps + retires
//
// Hop 1 — SWAP  : Treasury BUYS HYD from the XRPL AMM with its USDC reserve
//                 (real on-chain swap routed through the HYDRO/USDC pool).
// Hop 2 — RETIRE: Treasury sends HYD back to Issuer (IOU returning to issuer
//                 is destroyed on XRPL — the canonical burn, no black-hole needed)
//
// Bootstrap (one-time, called automatically on first settlement):
//   - Treasury sets TrustSet for HYD from Issuer (limit 1B)
//   - Treasury sets TrustSet for USDC from the XRPL USDC issuer
//   - Issuer sets AccountSet asfDefaultRipple=false (best practice)

import { Client, Wallet, type Payment, type TrustSet, type AccountSet } from "xrpl";
import { getClient } from "./xrplClient";
import { swapUsdcForHydro, ensureTreasuryUsdcTrustline } from "./xrplAmm";

export interface HydroSwapResult {
  swapHash: string;
  retireHash: string;
  hydroAmount: string;
}

function currency(): string {
  return process.env.HYDROCOIN_CURRENCY ?? "HYD";
}
function issuerAddress(): string {
  return process.env.HYDROCOIN_ISSUER_ADDRESS!;
}

// Convert HYDRO drops (6-decimal integer) to the IOU value string XRPL expects.
function hydroDropsToIou(drops: number): string {
  return Math.max(drops / 1_000_000, 0.000001).toFixed(6);
}

function txResult(result: Awaited<ReturnType<Client["submitAndWait"]>>): string {
  const meta = result.result.meta as { TransactionResult?: string } | undefined;
  return meta?.TransactionResult ?? "";
}

function txHash(result: Awaited<ReturnType<Client["submitAndWait"]>>): string {
  // xrpl.js v2+ returns hash at result.result.hash (top-level)
  // and also duplicated inside tx_json — check both.
  const r = result.result as { hash?: string; tx_json?: { hash?: string } };
  return r.hash ?? r.tx_json?.hash ?? "";
}

// One-time bootstrap: set treasury trust line for HYD.
// Safe to call repeatedly — XRPL is idempotent on duplicate TrustSet.
async function bootstrapTrustLine(client: Client, treasury: Wallet): Promise<void> {
  const tx: TrustSet = {
    TransactionType: "TrustSet",
    Account: treasury.address,
    LimitAmount: {
      currency: currency(),
      issuer: issuerAddress(),
      value: "1000000000",
    },
  };
  const r = await client.submitAndWait(tx, { wallet: treasury });
  const res = txResult(r);
  if (res && res !== "tesSUCCESS") {
    throw new Error(`TrustSet failed: ${res}`);
  }
}

// Optional: disable rippling on issuer account (best practice for IOU issuers).
async function disableRippling(client: Client, issuer: Wallet): Promise<void> {
  const tx: AccountSet = {
    TransactionType: "AccountSet",
    Account: issuer.address,
    SetFlag: 8, // asfDefaultRipple = 8 to disable
  };
  await client.submitAndWait(tx, { wallet: issuer });
}

// Track whether bootstrap has run this process lifetime.
let bootstrapped = false;

async function ensureBootstrapped(client: Client, issuer: Wallet, treasury: Wallet): Promise<void> {
  if (bootstrapped) return;
  await bootstrapTrustLine(client, treasury);
  await ensureTreasuryUsdcTrustline(client, treasury);
  await disableRippling(client, issuer);
  bootstrapped = true;
}

// Hop 2 — RETIRE: Treasury → Issuer  (IOU returns to issuer = destroyed = water credit)
async function retireHydroToIssuer(
  client: Client,
  issuer: Wallet,
  treasury: Wallet,
  hydroDrops: number,
): Promise<string> {
  const tx: Payment = {
    TransactionType: "Payment",
    Account: treasury.address,
    Destination: issuer.address,
    Amount: {
      currency: currency(),
      issuer: issuerAddress(),
      value: hydroDropsToIou(hydroDrops),
    },
  };
  const r = await client.submitAndWait(tx, { wallet: treasury });
  const res = txResult(r);
  if (res && res !== "tesSUCCESS") {
    throw new Error(`Retire Payment failed: ${res}`);
  }
  return txHash(r);
}

// High-level entry point called by lib/settlement.ts on every batch flush.
export async function swapAndRetireHydro(
  usdcMicros: number,
  hydroDrops: number,
): Promise<HydroSwapResult> {
  void usdcMicros;

  // ── Fault-injection hook (testing only) ────────────────────────────────────
  // Deterministically fails the XRPL leg so a Level 2 fault-injection run can
  // force the money-in/nothing-out desync (Fuji pull succeeds, retire fails) and
  // observe the obligation capture + worker self-heal. Double-gated so a stray
  // env var can NEVER force-fail real settlements: requires both a non-production
  // NODE_ENV AND the explicit flag.
  if (process.env.NODE_ENV !== "production" && process.env.XRPL_FORCE_FAIL === "1") {
    throw new Error("XRPL_FORCE_FAIL: injected XRPL settlement failure (testing only)");
  }

  // usdcMicros is the agent's PAID amount (on Fuji, or XRPL-native). The USDC
  // actually spent in the swap below is the treasury's own XRPL-USDC reserve,
  // priced by the pool — a real on-chain mechanism demo, not bridged funds.
  void usdcMicros;

  const client = await getClient();
  const issuer = Wallet.fromSeed(process.env.HYDROCOIN_ISSUER_SEED!);
  const treasury = Wallet.fromSeed(process.env.XRPL_TREASURY_SEED!);

  await ensureBootstrapped(client, issuer, treasury);

  // Hop 1 — REAL AMM swap: treasury buys HYD from the HYDRO/USDC pool.
  const { swapHash, hydroAcquiredDrops } = await swapUsdcForHydro(client, treasury, hydroDrops);
  // Hop 2 — retire EXACTLY what the swap delivered back to the issuer (burn = water credit).
  const retireHash = await retireHydroToIssuer(client, issuer, treasury, hydroAcquiredDrops);

  return { swapHash, retireHash, hydroAmount: hydroDropsToIou(hydroAcquiredDrops) };
}
