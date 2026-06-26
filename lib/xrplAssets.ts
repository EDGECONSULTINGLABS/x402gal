// XRPL accepted-asset registry.
//
// Central source of truth for the issued-currency tokens the x402 facilitator
// accepts on the XRP Ledger. Each asset is identified by its on-ledger
// (currency, issuer) pair. The verify() path matches an incoming Payment's
// Amount against this registry, so adding a new accepted stablecoin is a
// one-entry change here.
//
// All issuers default to XRPL testnet and are overridable via env so the same
// build runs against mainnet without code changes.
//
// RLUSD (Ripple USD) reference — https://docs.ripple.com/products/stablecoin/developer-resources/rlusd-on-the-xrpl
//   currency (hex) : 524C555344000000000000000000000000000000  ("RLUSD" padded)
//   testnet issuer : rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV
//   mainnet issuer : rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De

/** Symbolic asset code surfaced in x402 quotes/payloads. */
export type XrplAssetSymbol = "USDC" | "RLUSD";

export interface XrplAsset {
  /** Human-facing symbol used in x402 `asset` fields. */
  symbol: XrplAssetSymbol;
  /** On-ledger currency code: 3-char ISO or 40-char hex. */
  currency: string;
  /** Issuer r-address. */
  issuer: string;
}

// ── USDC (Circle, XRPL) ───────────────────────────────────────────────────────
const USDC_CURRENCY_DEFAULT = "5553444300000000000000000000000000000000";
const USDC_ISSUER_TESTNET = "rHuGNhqTG32mfmAvWA8hUyWRLV3tCSwKQt";

export function usdcCurrency(): string {
  return process.env.XRPL_USDC_CURRENCY ?? USDC_CURRENCY_DEFAULT;
}
export function usdcIssuer(): string {
  return process.env.XRPL_USDC_ISSUER ?? USDC_ISSUER_TESTNET;
}

// ── RLUSD (Ripple USD, XRPL) ──────────────────────────────────────────────────
// The currency code is fixed by Ripple; only the issuer differs by network.
export const RLUSD_CURRENCY = "524C555344000000000000000000000000000000";
const RLUSD_ISSUER_TESTNET = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

export function rlusdCurrency(): string {
  return process.env.XRPL_RLUSD_CURRENCY ?? RLUSD_CURRENCY;
}
export function rlusdIssuer(): string {
  return process.env.XRPL_RLUSD_ISSUER ?? RLUSD_ISSUER_TESTNET;
}

/** All assets the facilitator currently accepts on XRPL, in advertised order. */
export function acceptedXrplAssets(): XrplAsset[] {
  return [
    { symbol: "RLUSD", currency: rlusdCurrency(), issuer: rlusdIssuer() },
    { symbol: "USDC", currency: usdcCurrency(), issuer: usdcIssuer() },
  ];
}

/**
 * Resolve an incoming Payment's (currency, issuer) pair to a registered asset.
 * Returns null when neither accepted asset matches — caller rejects the payment.
 */
export function matchXrplAsset(currency: unknown, issuer: unknown): XrplAsset | null {
  if (typeof currency !== "string" || typeof issuer !== "string") return null;
  return (
    acceptedXrplAssets().find((a) => a.currency === currency && a.issuer === issuer) ?? null
  );
}

/** Look up a registered asset by its symbol. */
export function assetBySymbol(symbol: XrplAssetSymbol): XrplAsset {
  const a = acceptedXrplAssets().find((x) => x.symbol === symbol);
  if (!a) throw new Error(`Unknown XRPL asset symbol: ${symbol}`);
  return a;
}
