// app/api/mint/route.ts
// Mints the INFILTRATE badge as an NFT on the XRPL testnet.
// Ported from api/mint.js (PointJournal Vercel project).
// NOTE: must use nodejs runtime — xrpl package requires Node APIs.
//
// POST /api/mint
// Body: { wallet, agentNumber, holo, name, role, points, missions }
// Returns: { ok, nftokenID, txHash, offerIndex, network }

import { Client, Wallet, convertStringToHex } from "xrpl";

export const runtime = "nodejs";

const ENDPOINT  = process.env.XRPL_ENDPOINT  || "wss://s.altnet.rippletest.net:51233";
const META_BASE = process.env.BADGE_META_BASE || "https://www.hydrocoin.com/infiltrate/badge";
const TAXON     = 402; // x402GAL collection taxon

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function findOfferIndex(meta: Record<string, unknown>): string | null {
  const nodes = (meta?.AffectedNodes as Array<Record<string, unknown>>) || [];
  for (const n of nodes) {
    const c = n.CreatedNode as Record<string, unknown> | undefined;
    if (c?.LedgerEntryType === "NFTokenOffer") return c.LedgerIndex as string;
  }
  return null;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }

  const recipient = body.wallet as string | undefined;
  const agentNumber = body.agentNumber;
  const holo = body.holo;

  if (recipient && !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(recipient)) {
    return Response.json({ ok: false, error: "invalid XRPL address" }, { status: 400, headers: CORS });
  }

  const client = new Client(ENDPOINT);
  try {
    await client.connect();

    let issuer: Wallet;
    if (process.env.XRPL_ISSUER_SEED) {
      issuer = Wallet.fromSeed(process.env.XRPL_ISSUER_SEED);
    } else {
      const funded = await client.fundWallet();
      issuer = funded.wallet;
      console.log("[mint] no XRPL_ISSUER_SEED set — funded throwaway:", issuer.seed);
    }

    const metaUrl = `${META_BASE}/${agentNumber || "0000"}${holo ? "?tier=holo" : ""}`;

    const mintTx = {
      TransactionType: "NFTokenMint" as const,
      Account: issuer.address,
      URI: convertStringToHex(metaUrl),
      Flags: 8,           // tfTransferable
      NFTokenTaxon: TAXON,
    };
    const minted = await client.submitAndWait(mintTx, { wallet: issuer, autofill: true });
    const mintMeta = minted.result.meta as unknown as Record<string, unknown>;
    if (mintMeta.TransactionResult !== "tesSUCCESS") {
      throw new Error("mint failed: " + mintMeta.TransactionResult);
    }
    const nftokenID = mintMeta.nftoken_id as string;
    if (!nftokenID) throw new Error("could not read NFTokenID from metadata");

    let offerIndex: string | null = null;
    if (recipient) {
      const offerTx = {
        TransactionType: "NFTokenCreateOffer" as const,
        Account: issuer.address,
        NFTokenID: nftokenID,
        Amount: "0",
        Flags: 1,          // tfSellNFToken
        Destination: recipient,
      };
      const offer = await client.submitAndWait(offerTx, { wallet: issuer, autofill: true });
      const offerMeta = offer.result.meta as unknown as Record<string, unknown>;
      if (offerMeta.TransactionResult === "tesSUCCESS") {
        offerIndex = findOfferIndex(offerMeta);
      }
    }

    return Response.json({
      ok: true,
      network: "testnet",
      account: issuer.address,
      nftokenID,
      txHash: minted.result.hash,
      offerIndex,
    }, { headers: CORS });
  } catch (err) {
    console.error("[mint] error:", err);
    return Response.json({ ok: false, error: String((err as Error).message || err) }, { status: 500, headers: CORS });
  } finally {
    try { await client.disconnect(); } catch (_) {}
  }
}
