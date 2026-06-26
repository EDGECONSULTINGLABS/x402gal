/**
 * POST /api/xaman/payload
 *
 * Creates a Xaman (XUMM) sign request for a native XRPL RLUSD Payment that pays
 * an AI query's water bill to the 402GAL treasury. The amount and destination
 * are derived SERVER-SIDE from the live water-footprint quote (buildRequirement)
 * so the client cannot tamper with them. We embed a fresh InvoiceID and return
 * it; the client passes the same InvoiceID to the facilitator after signing.
 *
 * `submit: false` — Xaman returns the SIGNED blob without broadcasting; the
 * 402GAL facilitator submits it and runs the HYDRO swap + retire.
 *
 * Response (200):
 *   { uuid, qrPng, deeplink, websocket, invoiceId, amountMicros,
 *     destination, offsetHydroDroplets, estimatedMl, resource, asset: "RLUSD" }
 */

import { NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { buildRequirement } from "@/lib/x402";
import { assetBySymbol } from "@/lib/xrplAssets";
import { createSignPayload, isXamanConfigured, type XamanTxJson } from "@/lib/xaman";

export const runtime = "nodejs";

const DEFAULT_RESOURCE = "/api/ai/chat";

export async function POST(req: NextRequest) {
  if (!isXamanConfigured()) {
    return Response.json(
      { error: "Xaman not configured — set XUMM_API_KEY and XUMM_API_SECRET" },
      { status: 503 },
    );
  }

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

  const txjson: XamanTxJson = {
    TransactionType: "Payment",
    Destination: destination,
    Amount: { currency: rlusd.currency, issuer: rlusd.issuer, value: rlusdValue },
    InvoiceID: invoiceId,
  };

  try {
    const payload = await createSignPayload(txjson, {
      expireMinutes: 5,
      instruction: `Offset ${quote.estimatedMl.toFixed(2)} mL of AI water use · ${rlusdValue} RLUSD`,
    });

    return Response.json({
      ...payload,
      invoiceId,
      amountMicros,
      destination,
      offsetHydroDroplets: quote.offsetHydroDroplets,
      estimatedMl: quote.estimatedMl,
      resource,
      asset: "RLUSD",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Xaman payload create failed: ${msg}` }, { status: 502 });
  }
}
