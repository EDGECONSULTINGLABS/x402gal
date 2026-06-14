/**
 * x402 XRPL Network Adapter
 *
 * Implements the two-function facilitator interface from the x402 spec:
 *   verify(payload, requirement) → { isValid, invalidReason }
 *   settle(payload, requirement) → { success, txHash, retirementTxHash, errorReason }
 *
 * This is the first XRPL network adapter for the x402 ecosystem.
 * Compatible with x402-hono and x402-client from https://github.com/coinbase/x402
 *
 * ── Wiring into x402-hono (resource server) ─────────────────────────────────
 *
 *   import { xrplVerify, xrplSettle } from "./x402XrplAdapter";
 *   import { paymentMiddleware } from "x402-hono";
 *
 *   app.use("/api/*", paymentMiddleware(priceInUsdc, {
 *     verify: xrplVerify,
 *     settle: xrplSettle,
 *   }));
 *
 * ── Wiring into x402-client (agent) ─────────────────────────────────────────
 *
 *   import { xrplFacilitatorUrl } from "./x402XrplAdapter";
 *   // Point your x402 client at the 402GAL facilitator endpoint:
 *   // POST https://x402gal.xyz/api/x402/facilitate
 *   // Body: { requirement, payload }
 *   // Response: { isValid, success, txHash, retirementTxHash }
 *
 * ── Settlement flow ──────────────────────────────────────────────────────────
 *
 *   1. Resource server returns HTTP 402 with PaymentRequirement in body
 *   2. Agent builds X402Payload and retries with X-PAYMENT header
 *   3. verify() validates network, recipient, amount, expiry, signature
 *   4. settle() executes two XRPL hops via the two-wallet issuer/treasury pattern:
 *        Hop 1 (swap):    Issuer  → Treasury  Payment (HYD IOU issuance)
 *        Hop 2 (retire):  Treasury → Issuer   Payment (canonical IOU burn = water credit)
 *   5. Both on-chain XRPL tx hashes returned in SettleResult
 *
 * ── Open contribution ────────────────────────────────────────────────────────
 *
 *   verify() currently does presence + structural checks on the signature field.
 *   Full XRPL ed25519/secp256k1 signature verification against the canonical
 *   auth hash is the one remaining piece — see CONTRIBUTING.md for the spec.
 *
 * ── Environment variables required ──────────────────────────────────────────
 *
 *   XRPL_ENDPOINT          wss://s.altnet.rippletest.net:51233  (testnet)
 *   XRPL_TREASURY_SEED     sEd...   treasury (hot) wallet seed
 *   HYDROCOIN_ISSUER_SEED  sEd...   issuer (cold) wallet seed
 *   HYDROCOIN_ISSUER       r...     issuer wallet address
 *   HYDROCOIN_CURRENCY     HYD      3-char currency code
 */

import { isXrplConfigured, getClient } from "./xrplClient";
import { swapAndRetireHydro } from "./xrplHydro";
import { decode, verifySignature, type Client, type Transaction } from "xrpl";

// ── Types ─────────────────────────────────────────────────────────────────────
//
// These mirror the canonical x402 spec wire format so this adapter can be
// dropped into any x402-hono / x402-client integration with no type changes.

/** Payment requirement returned with HTTP 402. */
export interface X402Requirement {
  x402Version: 1;
  scheme: "exact";
  network: string;            // "xrpl" for this adapter
  asset: string;              // "USDC"
  maxAmountRequired: string;  // micro-USDC as decimal string
  resource: string;           // e.g. "/api/ai/chat"
  description: string;
  mimeType: string;
  payTo: string;              // treasury wallet address on XRPL
  requiredDeadlineSeconds: number;
  facilitatorUrl?: string;
  // 402GAL extensions — water footprint metadata
  offsetHydroDrops?: number;  // HYDRO drops to retire for this payment
  estimatedMl?: number;       // site water footprint in mL
  footprint?: Record<string, unknown>;
  // Native XRPL settlement binding
  invoiceId?: string;        // 64-char hex (32 bytes) — quote binding hash
}

/** Payment payload sent by the agent in the X-PAYMENT header (base64 JSON). */
export interface X402Payload {
  x402Version: 1;
  scheme: "exact";
  network: string;
  payload: {
    signature: string;        // XRPL ed25519 or secp256k1 signature over auth hash
    authorization: {
      from: string;           // payer address (XRPL r-address or EVM 0x address)
      to: string;             // treasury address (must match payTo)
      value: string;          // micro-USDC as decimal string
      validAfter: string;     // unix seconds string
      validBefore: string;    // unix seconds string (expiry)
      nonce: string;
      // ERC-3009 signature components (EVM chains) — optional for XRPL
      v?: number | string;
      r?: string;
      s?: string;
    };
  };
  // Native XRPL Payment tx settlement — when present, the facilitator
  // validates the signed blob and submits it to XRPL on-chain.
  xrplSignedTx?: string;     // hex-encoded signed Payment tx blob
  invoiceId?: string;         // 64-char hex echoing the 402 quote
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
}

export interface SettleResult {
  success: boolean;
  txHash?: string;            // XRPL Payment tx hash (native) OR swap hop hash
  retirementTxHash?: string;  // XRPL retirement hop tx hash (treasury → issuer = burn)
  errorReason?: string;
  network: "xrpl";
  simulated?: boolean;        // true when XRPL env vars are not configured
  paymentTxHash?: string;   // native XRPL Payment tx hash (when xrplSignedTx path used)
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Circle XRPL testnet USDC currency code (40-char hex). */
const USDC_CURRENCY_XRPL = "5553444300000000000000000000000000000000";
/** Circle XRPL testnet USDC issuer address. */
const USDC_ISSUER_XRPL = "rHuGNhqTG32mfmAvWA8hUyWRLV3tCSwKQt";

import { Redis } from "@upstash/redis";

// Replay guard uses Upstash Redis when available (survives serverless isolates).
// Falls back to in-memory Set for local dev when Redis env vars are absent.
// Redis keys expire after 5 minutes — longer than any LastLedgerSequence window.
const REPLAY_TTL_S = 300;
const REPLAY_KEY_PREFIX = "x402:invoice:";

function redisConfigured(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

let _redis: ReturnType<typeof Redis.fromEnv> | null = null;
function getRedis(): ReturnType<typeof Redis.fromEnv> | null {
  if (!redisConfigured()) return null;
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

const seenInvoices = new Set<string>();

/** Convert a USDC decimal string (e.g. "1.000001") to micro-USDC as BigInt,
 *  without any floating-point arithmetic. Rejects over-precision (>6 decimals). */
function usdcDecimalToMicros(v: string): bigint {
  const [whole, frac = ""] = v.split(".");
  if (frac.length > 6) throw new Error("AMOUNT_TOO_PRECISE");
  const sign = whole.startsWith("-") ? -1n : 1n;
  const absWhole = whole.replace(/^-/, "");
  return sign * (BigInt(absWhole) * 1_000_000n + BigInt(frac.padEnd(6, "0")));
}

async function isReplay(invoiceId: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `${REPLAY_KEY_PREFIX}${invoiceId}`;
      const exists = await redis.get(key);
      if (exists !== null) return true;
      await redis.setex(key, REPLAY_TTL_S, "1");
      return false;
    } catch {
      // Fail-closed: if Redis is unreachable we cannot confirm uniqueness,
      // so we reject the payment to prevent replay under sustained traffic.
      return true;
    }
  }
  // Fallback: in-memory only. Does NOT survive across serverless invocations.
  if (seenInvoices.has(invoiceId)) return true;
  seenInvoices.add(invoiceId);
  if (seenInvoices.size > 1_000) {
    const iter = seenInvoices.values();
    seenInvoices.delete(iter.next().value as string);
  }
  return false;
}

// ── verify() ─────────────────────────────────────────────────────────────────

/**
 * Verify an x402 payment payload against the requirement.
 *
 * Two paths:
 *   A) Native XRPL — payload.xrplSignedTx present.
 *      Decodes the signed Payment blob, validates all fields against the quote,
 *      verifies the signature offline, and checks for replay.
 *   B) EVM-auth fallback — no xrplSignedTx. Checks authorization struct only.
 */
export async function xrplVerify(
  payload: X402Payload,
  requirement: X402Requirement,
): Promise<VerifyResult> {
  if (payload.network !== "xrpl") {
    return {
      isValid: false,
      invalidReason: `unsupported network "${payload.network}" — this adapter handles "xrpl" only`,
    };
  }

  // ── Path A: Native XRPL Payment tx ────────────────────────────────────────
  if (payload.xrplSignedTx) {
    let decoded: Record<string, unknown>;
    try {
      decoded = decode(payload.xrplSignedTx) as Record<string, unknown>;
    } catch {
      return { isValid: false, invalidReason: "INVALID_TX_BLOB: could not decode xrplSignedTx" };
    }

    // 1. Transaction type
    if (decoded.TransactionType !== "Payment") {
      return { isValid: false, invalidReason: `INVALID_TX_TYPE: expected Payment, got ${decoded.TransactionType}` };
    }

    // 2. Destination
    if (decoded.Destination !== requirement.payTo) {
      return { isValid: false, invalidReason: `INVALID_DESTINATION: got ${decoded.Destination}, expected ${requirement.payTo}` };
    }

    // 3. Amount — must be issued-currency USDC
    const amt = decoded.Amount as Record<string, unknown> | undefined;
    if (!amt || typeof amt !== "object") {
      return { isValid: false, invalidReason: "AMOUNT_MISMATCH: Amount is not an issued-currency object" };
    }
    if (amt.currency !== USDC_CURRENCY_XRPL) {
      return { isValid: false, invalidReason: `AMOUNT_MISMATCH: currency ${amt.currency}, expected ${USDC_CURRENCY_XRPL}` };
    }
    if (amt.issuer !== USDC_ISSUER_XRPL) {
      return { isValid: false, invalidReason: `AMOUNT_MISMATCH: issuer ${amt.issuer}, expected ${USDC_ISSUER_XRPL}` };
    }
    const requiredMicro = BigInt(requirement.maxAmountRequired ?? "0");
    let actualMicro: bigint;
    try {
      actualMicro = usdcDecimalToMicros(String(amt.value));
    } catch {
      return { isValid: false, invalidReason: `AMOUNT_MISMATCH: value ${amt.value} has >6 decimal places or is malformed` };
    }
    if (actualMicro !== requiredMicro) {
      return { isValid: false, invalidReason: `AMOUNT_MISMATCH: value ${amt.value} (${actualMicro} µUSDC), required ${requiredMicro} µUSDC` };
    }

    // 4. InvoiceID binding
    const invoiceId = payload.invoiceId ?? requirement.invoiceId;
    if (invoiceId && decoded.InvoiceID !== invoiceId) {
      return { isValid: false, invalidReason: `INVOICE_MISMATCH: got ${decoded.InvoiceID}, expected ${invoiceId}` };
    }

    // 5. Offline signature verification (no RPC — rejects forged blobs)
    try {
      verifySignature(decoded as Transaction);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { isValid: false, invalidReason: `INVALID_SIGNATURE: ${msg}` };
    }

    // 6. Replay guard
    const replayKey = (decoded.InvoiceID as string | undefined) ?? payload.xrplSignedTx;
    if (await isReplay(replayKey)) {
      return { isValid: false, invalidReason: "REPLAY_DETECTED: InvoiceID or tx blob already used" };
    }

    return { isValid: true };
  }

  // ── Path B: EVM-auth fallback (existing logic, unchanged) ────────────────
  const auth = payload.payload?.authorization;
  if (!auth) {
    return { isValid: false, invalidReason: "missing payload.authorization" };
  }

  if (auth.to !== requirement.payTo) {
    return {
      isValid: false,
      invalidReason: `payTo mismatch: got ${auth.to}, expected ${requirement.payTo}`,
    };
  }

  const paid = BigInt(auth.value ?? "0");
  const required = BigInt(requirement.maxAmountRequired ?? "0");
  if (paid < required) {
    return {
      isValid: false,
      invalidReason: `underpayment: paid ${paid} µUSDC, required ${required} µUSDC`,
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const validBefore = parseInt(auth.validBefore ?? "0", 10);
  if (validBefore > 0 && nowSec > validBefore) {
    return {
      isValid: false,
      invalidReason: `payment expired at ${validBefore}, now ${nowSec}`,
    };
  }

  const sig = payload.payload?.signature ?? "";
  if (!sig || sig.length < 16) {
    return { isValid: false, invalidReason: "missing or malformed signature" };
  }

  return { isValid: true };
}

// ── Native XRPL Payment settlement ────────────────────────────────────────────

/**
 * Submit a pre-signed XRPL Payment tx, then on `tesSUCCESS` execute the
 * two-hop HYDRO swap + retire.
 *
 * Field validation + signature verification happen in xrplVerify() above.
 * This function only does the ledger-sequence check, submission, and
 * retirement hand-off.
 */
export async function xrplSettleNative(
  xrplSignedTx: string,
  usdcMicros: number,
  hydroDrops: number,
): Promise<SettleResult> {
  if (!isXrplConfigured()) {
    const rndHex = (n: number) =>
      Array.from({ length: n }, () => "0123456789ABCDEF"[(Math.random() * 16) | 0]).join("");
    return {
      success: true,
      paymentTxHash: rndHex(64),
      txHash: rndHex(64),
      retirementTxHash: rndHex(64),
      network: "xrpl",
      simulated: true,
    };
  }

  const client = await getClient();

  // Decode to inspect LastLedgerSequence before burning a submission.
  let decoded: Record<string, unknown>;
  try {
    decoded = decode(xrplSignedTx) as Record<string, unknown>;
  } catch {
    return { success: false, errorReason: "INVALID_TX_BLOB: decode failed before submit", network: "xrpl" };
  }

  const lastLedgerSeq = decoded.LastLedgerSequence as number | undefined;
  if (lastLedgerSeq !== undefined) {
    const ledgerInfo = await client.getLedgerIndex();
    if (ledgerInfo >= lastLedgerSeq) {
      return { success: false, errorReason: `EXPIRED_LEDGER: LastLedgerSequence ${lastLedgerSeq}, current ${ledgerInfo}`, network: "xrpl" };
    }
  }

  // Submit the pre-signed Payment tx.
  let submitResult: Awaited<ReturnType<Client["submitAndWait"]>>;
  try {
    submitResult = await client.submitAndWait(xrplSignedTx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, errorReason: `SUBMIT_ERROR: ${msg}`, network: "xrpl" };
  }

  const meta = submitResult.result.meta as { TransactionResult?: string } | undefined;
  const resultCode = meta?.TransactionResult ?? "";
  const paymentTxHash = (submitResult.result as { hash?: string }).hash ?? "";

  if (resultCode !== "tesSUCCESS") {
    return {
      success: false,
      errorReason: `XRPL_REJECTED: ${resultCode} — tx hash ${paymentTxHash}`,
      network: "xrpl",
    };
  }

  // Only on confirmed tesSUCCESS → proceed to HYDRO swap + retire.
  try {
    const { swapHash, retireHash } = await swapAndRetireHydro(usdcMicros, hydroDrops);
    return {
      success: true,
      paymentTxHash,
      txHash: swapHash,
      retirementTxHash: retireHash,
      network: "xrpl",
      simulated: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errorReason: `RETIRE_FAILED_AFTER_PAYMENT: ${msg} — payment tx ${paymentTxHash}`,
      network: "xrpl",
    };
  }
}

// ── settle() ─────────────────────────────────────────────────────────────────

/**
 * Execute XRPL settlement for a verified x402 payment.
 *
 * Two-hop flow (issuer/treasury two-wallet pattern):
 *   Hop 1 — swap:    Issuer wallet sends HYD IOU to Treasury wallet
 *   Hop 2 — retire:  Treasury wallet sends HYD IOU back to Issuer wallet
 *                    (canonical IOU destruction = verifiable water credit)
 *
 * Falls back to simulated hashes when XRPL env vars are absent (dev/CI safe).
 */
export async function xrplSettle(
  payload: X402Payload,
  requirement: X402Requirement,
): Promise<SettleResult> {
  const usdcMicros = parseInt(payload.payload?.authorization?.value ?? "0", 10);
  const hydroDrops = requirement.offsetHydroDrops ?? Math.max(1, Math.round(usdcMicros / 1_000));

  // Native XRPL Payment path — the buyer submitted a pre-signed tx blob.
  if (payload.xrplSignedTx) {
    return xrplSettleNative(payload.xrplSignedTx, usdcMicros, hydroDrops);
  }

  // EVM-auth fallback path — no pre-signed XRPL tx; HYDRO retire only.
  if (!isXrplConfigured()) {
    const rndHex = (n: number) =>
      Array.from({ length: n }, () => "0123456789ABCDEF"[(Math.random() * 16) | 0]).join("");
    return {
      success: true,
      txHash: rndHex(64),
      retirementTxHash: rndHex(64),
      network: "xrpl",
      simulated: true,
    };
  }

  try {
    const { swapHash, retireHash } = await swapAndRetireHydro(usdcMicros, hydroDrops);
    return {
      success: true,
      txHash: swapHash,
      retirementTxHash: retireHash,
      network: "xrpl",
      simulated: false,
    };
  } catch (err) {
    return {
      success: false,
      errorReason: err instanceof Error ? err.message : String(err),
      network: "xrpl",
    };
  }
}

// ── Facilitator URL ───────────────────────────────────────────────────────────

/**
 * The 402GAL facilitator endpoint.
 * Point x402-client here to use XRPL as the settlement network.
 *
 *   POST /api/x402/facilitate
 *   Body: { requirement: X402Requirement, payload: X402Payload }
 *   Response: { isValid, success, txHash, retirementTxHash, network, simulated }
 */
export const xrplFacilitatorUrl =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "https://x402gal.xyz/api/x402/facilitate")
    : "https://x402gal.xyz/api/x402/facilitate";
