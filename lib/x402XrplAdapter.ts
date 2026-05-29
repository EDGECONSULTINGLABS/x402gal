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

import { isXrplConfigured } from "./xrplClient";
import { swapAndRetireHydro } from "./xrplHydro";

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
}

/** Payment payload sent by the agent in the X-PAYMENT header (base64 JSON). */
export interface X402Payload {
  x402Version: 1;
  scheme: "exact";
  network: string;
  payload: {
    signature: string;        // XRPL ed25519 or secp256k1 signature over auth hash
    authorization: {
      from: string;           // payer XRPL address
      to: string;             // treasury XRPL address (must match payTo)
      value: string;          // micro-USDC as decimal string
      validAfter: string;     // unix seconds string
      validBefore: string;    // unix seconds string (expiry)
      nonce: string;
    };
  };
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
}

export interface SettleResult {
  success: boolean;
  txHash?: string;            // XRPL swap hop tx hash (issuer → treasury)
  retirementTxHash?: string;  // XRPL retirement hop tx hash (treasury → issuer = burn)
  errorReason?: string;
  network: "xrpl";
  simulated?: boolean;        // true when XRPL env vars are not configured
}

// ── verify() ─────────────────────────────────────────────────────────────────

/**
 * Verify an x402 payment payload against the requirement.
 *
 * Checks performed:
 *   1. Network is "xrpl"
 *   2. Recipient address matches payTo
 *   3. Amount paid >= amount required
 *   4. Payment has not expired (validBefore)
 *   5. Signature field is present and non-trivial
 *
 * Full XRPL signature verification (ripple-keypairs) is the open contribution
 * described in CONTRIBUTING.md — add it here once agreed with x402 team.
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

  // TODO (open contribution): verify `sig` is a valid XRPL ed25519/secp256k1
  // signature over sha512Half(canonicalAuthHash(auth)) using ripple-keypairs.
  // See CONTRIBUTING.md for the exact signing scheme and test vectors.

  return { isValid: true };
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
