/**
 * POST /api/xaman/quote
 *
 * Returns a server-derived RLUSD Payment txjson (amount + destination + a fresh
 * 32-byte InvoiceID) WITHOUT creating a Xaman sign request. Used by the
 * connected (JWT) pay flow: the browser hands this txjson to the user's
 * authorized Xaman session via `pushSignRequest`, which pushes the sign request
 * straight to their device. Amount/destination are derived from the live
 * water-footprint quote here so the client cannot tamper with them.
 *
 * Response (200):
 *   { txjson, instruction, invoiceId, amountMicros, destination,
 *     offsetHydroDroplets, estimatedMl, resource, asset: "RLUSD" }
 */

import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { buildRequirement } from "@/lib/x402";
import { assetBySymbol } from "@/lib/xrplAssets";

export const runtime = "nodejs";

const DEFAULT_RESOURCE = "/api/ai/chat";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const resource = typeof body?.resource === "string" ? body.resource : DEFAULT_RESOURCE;

  let quote;
  try {
    quote = buildRequirement(resource);
  } catch {
    return Response.json({ error: `unknown resource ${resource}` }, { status: 400 });
  }

  const amountMicros = quote.amountUsdc;
  const destination = quote.recipient;
  const rlusd = assetBySymbol("RLUSD");

  // 32-byte hex InvoiceID binds the on-ledger tx to this settlement (replay guard).
  const invoiceId = randomBytes(32).toString("hex").toUpperCase();
  const rlusdValue = (amountMicros / 1_000_000).toFixed(6);

  const txjson = {
    TransactionType: "Payment",
    Destination: destination,
    Amount: { currency: rlusd.currency, issuer: rlusd.issuer, value: rlusdValue },
    InvoiceID: invoiceId,
  };

  return Response.json({
    txjson,
    instruction: `Offset ${quote.estimatedMl.toFixed(2)} mL of AI water use · ${rlusdValue} RLUSD`,
    invoiceId,
    amountMicros,
    destination,
    offsetHydroDroplets: quote.offsetHydroDroplets,
    estimatedMl: quote.estimatedMl,
    resource,
    asset: "RLUSD",
  });
}
