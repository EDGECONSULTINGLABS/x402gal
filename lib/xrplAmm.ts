// XRPL testnet AMM operations for the HYDRO/USDC pool.
//
// This replaces the fictional "issuer mints HYDRO straight to treasury" leg with
// a REAL on-chain swap through an XRPL Automated Market Maker:
//
//   payment-time swap : treasury spends its USDC reserve to BUY HYDRO from the
//                       pool (Payment routed through the AMM), then retires it.
//   pool seed/refill  : treasury DEPOSITS HYDRO (+USDC) into the pool. Every HYDRO
//                       deposit is checked against the verified-minted ceiling
//                       (see lib/hydroSupply.ts) so the pool can never hold more
//                       HYDRO than has been MRV-verified-and-minted.
//
// HONESTY (testnet): the swapped USDC is the TREASURY's own pre-funded XRPL-USDC
// reserve, not the agent's Fuji payment bridged on-chain. The swap proves the AMM
// MECHANISM end-to-end on testnet; it is not market liquidity. See README.
//
// MAINNET GATE: AMM writes refuse to run against a non-testnet XRPL endpoint
// unless XRPL_AMM_ALLOW_MAINNET === "true" is explicitly set. Fail-closed.

import { Client, Wallet, type OfferCreate, type TrustSet, type AMMCreate, type AMMDeposit } from "xrpl";
import { reservePoolDeposit, releasePoolDeposit } from "./hydroSupply";

// ── Errors ──────────────────────────────────────────────────────────────────
export class PoolNotFoundError extends Error {
  constructor(msg = "AMM pool not found — run pool seed first") {
    super(msg);
    this.name = "PoolNotFoundError";
  }
}
export class PoolInsufficientError extends Error {
  constructor(msg = "AMM pool cannot deliver requested HYDRO (depleted)") {
    super(msg);
    this.name = "PoolInsufficientError";
  }
}
export class CeilingExceededError extends Error {
  constructor(msg = "HYDRO pool deposit would exceed verified-minted ceiling") {
    super(msg);
    this.name = "CeilingExceededError";
  }
}
export class MainnetGateError extends Error {
  constructor(msg = "XRPL AMM writes are gated off mainnet (set XRPL_AMM_ALLOW_MAINNET=true to override)") {
    super(msg);
    this.name = "MainnetGateError";
  }
}

// ── Assets ────────────────────────────────────────────────────────────────────
function hydCurrency(): string {
  return process.env.HYDROCOIN_CURRENCY ?? "HYD";
}
function hydIssuer(): string {
  return process.env.HYDROCOIN_ISSUER_ADDRESS!;
}
// Circle XRPL testnet USDC defaults (overridable for other testnet issuers).
function usdcCurrency(): string {
  return process.env.XRPL_USDC_CURRENCY ?? "5553444300000000000000000000000000000000";
}
function usdcIssuer(): string {
  return process.env.XRPL_USDC_ISSUER ?? "rHuGNhqTG32mfmAvWA8hUyWRLV3tCSwKQt";
}

export interface IouAsset {
  currency: string;
  issuer: string;
}
export function hydAsset(): IouAsset {
  return { currency: hydCurrency(), issuer: hydIssuer() };
}
export function usdcAsset(): IouAsset {
  return { currency: usdcCurrency(), issuer: usdcIssuer() };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
export function hydroDropsToIou(drops: number): string {
  return Math.max(drops / 1_000_000, 0.000001).toFixed(6);
}

function txResult(result: Awaited<ReturnType<Client["submitAndWait"]>>): string {
  const meta = result.result.meta as { TransactionResult?: string } | undefined;
  return meta?.TransactionResult ?? "";
}
function txHash(result: Awaited<ReturnType<Client["submitAndWait"]>>): string {
  const r = result.result as { hash?: string; tx_json?: { hash?: string } };
  return r.hash ?? r.tx_json?.hash ?? "";
}

// ── Mainnet gate ──────────────────────────────────────────────────────────────
export function isTestnetEndpoint(): boolean {
  const ep = (process.env.XRPL_ENDPOINT ?? "wss://s.altnet.rippletest.net:51233").toLowerCase();
  return ep.includes("altnet") || ep.includes("testnet") || ep.includes("devnet");
}

/** Throw unless we are on a testnet endpoint OR mainnet is explicitly authorized. */
export function assertAmmNetworkAllowed(): void {
  if (isTestnetEndpoint()) return;
  if (process.env.XRPL_AMM_ALLOW_MAINNET === "true") return;
  throw new MainnetGateError();
}

// ── Pool info ─────────────────────────────────────────────────────────────────
export interface PoolReserves {
  /** HYDRO reserve as a decimal unit value (e.g. "1000.000000"). */
  hydValue: number;
  /** USDC reserve as a decimal unit value. */
  usdcValue: number;
  /** Trading fee in units of 1/100000 (e.g. 500 = 0.5%). */
  tradingFee: number;
}

function iouValue(amount: unknown): number {
  if (typeof amount === "string") return Number(amount) / 1_000_000; // XRP drops — not expected here
  const a = amount as { value?: string } | undefined;
  return Number(a?.value ?? 0);
}

/** Returns pool reserves, or null if the AMM does not yet exist. */
export async function getPoolInfo(client: Client): Promise<PoolReserves | null> {
  try {
    const res = await client.request({
      command: "amm_info",
      asset: hydAsset(),
      asset2: usdcAsset(),
    } as Parameters<Client["request"]>[0]);
    const amm = (res as { result?: { amm?: { amount?: unknown; amount2?: unknown; trading_fee?: number } } })
      .result?.amm;
    if (!amm) return null;
    return {
      hydValue: iouValue(amm.amount),
      usdcValue: iouValue(amm.amount2),
      tradingFee: amm.trading_fee ?? 0,
    };
  } catch (e) {
    const msg = (e as Error).message ?? "";
    // amm_info throws actNotFound when the pool doesn't exist.
    if (msg.includes("actNotFound") || msg.includes("ammNotFound") || msg.toLowerCase().includes("not found")) {
      return null;
    }
    throw e;
  }
}

// ── Treasury USDC trust line ────────────────────────────────────────────────
export async function ensureTreasuryUsdcTrustline(client: Client, treasury: Wallet): Promise<void> {
  const tx: TrustSet = {
    TransactionType: "TrustSet",
    Account: treasury.address,
    LimitAmount: {
      currency: usdcCurrency(),
      issuer: usdcIssuer(),
      value: "1000000000",
    },
  };
  const r = await client.submitAndWait(tx, { wallet: treasury });
  const res = txResult(r);
  if (res && res !== "tesSUCCESS" && res !== "tecNO_LINE_REDUNDANT") {
    throw new Error(`USDC TrustSet failed: ${res}`);
  }
}

// ── Pool seed (one-time, ceiling-checked) ─────────────────────────────────────
// Deposits HYDRO + USDC to create the AMM. The HYDRO deposited draws down the
// verified-minted ceiling. Treasury must already hold both balances.
export interface SeedResult {
  ammCreateHash: string;
  hydDeposited: number;
  usdcDeposited: number;
}

export async function seedPool(
  client: Client,
  treasury: Wallet,
  hydDrops: number,
  usdcValue: number,
  tradingFee = 500,
): Promise<SeedResult> {
  assertAmmNetworkAllowed();

  const existing = await getPoolInfo(client);
  if (existing) throw new Error("AMM pool already exists — use refillPool to add HYDRO");

  // Reserve ceiling headroom BEFORE depositing freshly-issued HYDRO into the pool.
  const reservation = await reservePoolDeposit(hydDrops);
  if (!reservation.ok) {
    throw new CeilingExceededError(
      `seedPool blocked: ${reservation.reason} (remaining headroom ${reservation.remaining} drops)`,
    );
  }

  try {
    const tx: AMMCreate = {
      TransactionType: "AMMCreate",
      Account: treasury.address,
      Amount: { currency: hydCurrency(), issuer: hydIssuer(), value: hydroDropsToIou(hydDrops) },
      Amount2: { currency: usdcCurrency(), issuer: usdcIssuer(), value: usdcValue.toFixed(6) },
      TradingFee: tradingFee,
    };
    const r = await client.submitAndWait(tx, { wallet: treasury });
    const res = txResult(r);
    if (res !== "tesSUCCESS") throw new Error(`AMMCreate failed: ${res}`);
    return { ammCreateHash: txHash(r), hydDeposited: hydDrops, usdcDeposited: usdcValue };
  } catch (e) {
    // On-chain deposit did not land — give the ceiling headroom back.
    await releasePoolDeposit(hydDrops);
    throw e;
  }
}

// ── Pool refill (ceiling-checked) ─────────────────────────────────────────────
export async function refillPool(
  client: Client,
  treasury: Wallet,
  hydDrops: number,
  usdcValue: number,
): Promise<{ depositHash: string; hydDeposited: number }> {
  assertAmmNetworkAllowed();

  const reservation = await reservePoolDeposit(hydDrops);
  if (!reservation.ok) {
    throw new CeilingExceededError(
      `refillPool blocked: ${reservation.reason} (remaining headroom ${reservation.remaining} drops)`,
    );
  }

  try {
    const tx: AMMDeposit = {
      TransactionType: "AMMDeposit",
      Account: treasury.address,
      Asset: hydAsset(),
      Asset2: usdcAsset(),
      Amount: { currency: hydCurrency(), issuer: hydIssuer(), value: hydroDropsToIou(hydDrops) },
      Amount2: { currency: usdcCurrency(), issuer: usdcIssuer(), value: usdcValue.toFixed(6) },
      Flags: 0x00100000, // tfTwoAsset
    };
    const r = await client.submitAndWait(tx, { wallet: treasury });
    const res = txResult(r);
    if (res !== "tesSUCCESS") throw new Error(`AMMDeposit failed: ${res}`);
    return { depositHash: txHash(r), hydDeposited: hydDrops };
  } catch (e) {
    await releasePoolDeposit(hydDrops);
    throw e;
  }
}

// ── Swap: buy HYDRO from the AMM with USDC ────────────────────────────────────
// XRPL AMMs auto-participate in order-book crossing, so an Immediate-or-Cancel
// OfferCreate (buy HYD, pay USDC) is the reliable way to swap against the pool —
// a self-payment Payment will NOT be routed through the AMM by the path-finder.
// Returns the ACTUAL HYDRO delivered (from the balance delta) so the caller
// retires exactly what was acquired. Fails closed if the pool delivers nothing.
const SLIPPAGE_BUFFER = 1.5; // aggressive LIMIT price; the AMM fills at its own (better) price
const tfImmediateOrCancel = 0x00040000;

export interface SwapResult {
  swapHash: string;
  hydroAcquiredDrops: number;
  hydroAcquired: string;
  usdcSpentMax: string;
}

async function hydBalance(client: Client, account: string): Promise<number> {
  const lines = await client.request({ command: "account_lines", account, peer: hydIssuer() });
  const l = (lines.result.lines as Array<{ currency: string; balance: string }>).find(
    (x) => x.currency === hydCurrency(),
  );
  return l ? Number(l.balance) : 0;
}

export async function swapUsdcForHydro(
  client: Client,
  treasury: Wallet,
  hydroDrops: number,
): Promise<SwapResult> {
  assertAmmNetworkAllowed();

  const pool = await getPoolInfo(client);
  if (!pool) throw new PoolNotFoundError();

  const dy = hydroDrops / 1_000_000; // HYDRO units to receive
  if (dy <= 0) throw new Error("swapUsdcForHydro: non-positive HYDRO amount");

  const { hydValue: y, usdcValue: x, tradingFee } = pool;
  if (dy >= y) throw new PoolInsufficientError(`pool holds ${y} HYDRO, need ${dy}`);

  // Constant-product estimate of USDC cost; used only to size an aggressive LIMIT.
  const fee = tradingFee / 100_000;
  const grossIn = (x * y) / (y - dy) - x;
  const usdcIn = grossIn / (1 - fee);
  const usdcMax = (usdcIn * SLIPPAGE_BUFFER).toFixed(6);

  const before = await hydBalance(client, treasury.address);

  // Buy `dy` HYD, willing to pay up to usdcMax USDC. IoC fills immediately against
  // the AMM at its price (≤ limit) and cancels any unfilled remainder.
  const tx: OfferCreate = {
    TransactionType: "OfferCreate",
    Account: treasury.address,
    TakerGets: { currency: usdcCurrency(), issuer: usdcIssuer(), value: usdcMax },
    TakerPays: { currency: hydCurrency(), issuer: hydIssuer(), value: hydroDropsToIou(hydroDrops) },
    Flags: tfImmediateOrCancel,
  };

  let r: Awaited<ReturnType<Client["submitAndWait"]>>;
  try {
    r = await client.submitAndWait(tx, { wallet: treasury });
  } catch (e) {
    throw new Error(`AMM swap submit failed: ${(e as Error).message}`);
  }
  const res = txResult(r);
  if (res !== "tesSUCCESS") {
    // tecKILLED / tecUNFUNDED_OFFER → could not fill against the pool: treat as depletion.
    if (res === "tecKILLED" || res === "tecUNFUNDED_OFFER" || res === "tecPATH_DRY") {
      throw new PoolInsufficientError(`AMM swap ${res}: pool/reserve cannot deliver ${dy} HYDRO`);
    }
    throw new Error(`AMM swap failed: ${res}`);
  }

  // An IoC offer returns tesSUCCESS even if nothing filled — confirm via balance delta.
  const after = await hydBalance(client, treasury.address);
  const acquired = after - before;
  const acquiredDrops = Math.round(acquired * 1_000_000);
  if (acquiredDrops <= 0) {
    throw new PoolInsufficientError("AMM swap delivered 0 HYDRO (pool depleted or reserve unfunded)");
  }

  return {
    swapHash: txHash(r),
    hydroAcquiredDrops: acquiredDrops,
    hydroAcquired: acquired.toFixed(6),
    usdcSpentMax: usdcMax,
  };
}

// ── Monitoring ────────────────────────────────────────────────────────────────
/** True when an error indicates pool depletion / insufficient liquidity / ceiling. */
export function isPoolDepletionError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return /pool|tecPATH|tecUNFUNDED|depleted|ceiling/i.test(msg);
}

/** Grep-able alert line so monitoring can page for a pool refill before DEAD-lettering. */
export function alertPoolDepleted(context: string, detail: string): void {
  console.error(`[amm][POOL_DEPLETION_ALERT] context=${context} detail=${JSON.stringify(detail)}`);
}
