// app/api/mint/route.ts
// Mints the INFILTRATE badge as an NFT on the XRPL testnet.
// NOTE: must use nodejs runtime — xrpl package requires Node APIs.
//
// POST /api/mint
// Body: { wallet, email, agentNumber, holo, name, role, points, missions[] }
// Returns: { ok, nftokenID, txHash, offerIndex, network }
//
// Required env vars:
//   XRPL_ISSUER_SEED   — funded testnet seed (sEd...)
//   RESEND_API_KEY     — Resend API key for badge emails
//   EMAIL_FROM         — sender address e.g. "INFILTRATE <badges@x402gal.com>"

import { Client, Wallet, convertStringToHex } from "xrpl";
import { Resend } from "resend";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

const ENDPOINT  = process.env.XRPL_ENDPOINT  || "wss://s.altnet.rippletest.net:51233";
const META_BASE = process.env.BADGE_META_BASE || "https://www.x402gal.com/api/badge-meta";
const EXPLORER  = "https://testnet.xrpl.org/nft/";
const TAXON     = 402;

const redis = Redis.fromEnv();
const DEFAULT_EVENT_ID = process.env.EVENT_ID || "ethconf-nyc-2026";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ---- Extract NFTokenID from AffectedNodes (xrpl v4) ----
// submitAndWait metadata does NOT have a top-level nftoken_id in all cases.
// The reliable approach is to find the NFToken that was added to the issuer's page.
function extractNFTokenID(meta: Record<string, unknown>, issuerAddress: string): string | null {
  // Try top-level first (some builds do expose it)
  if (meta.nftoken_id) return meta.nftoken_id as string;

  const nodes = (meta.AffectedNodes as Array<Record<string, unknown>>) || [];
  for (const n of nodes) {
    const modified = (n.ModifiedNode || n.CreatedNode) as Record<string, unknown> | undefined;
    if (!modified || modified.LedgerEntryType !== "NFTokenPage") continue;

    // Check FinalFields and NewFields for the token list
    for (const fieldKey of ["FinalFields", "NewFields"]) {
      const fields = modified[fieldKey] as Record<string, unknown> | undefined;
      const tokens = fields?.NFTokens as Array<Record<string, unknown>> | undefined;
      if (!tokens) continue;

      // Also check diff — PreviousFields tokens subtracted from FinalFields tokens
      const prevFields = modified.PreviousFields as Record<string, unknown> | undefined;
      const prevTokens = new Set(
        ((prevFields?.NFTokens as Array<Record<string, unknown>>) || [])
          .map(t => (t.NFToken as Record<string, unknown>)?.NFTokenID as string)
          .filter(Boolean)
      );

      for (const t of tokens) {
        const token = t.NFToken as Record<string, unknown> | undefined;
        const id = token?.NFTokenID as string | undefined;
        if (id && !prevTokens.has(id)) {
          // Verify it belongs to our issuer (first 8 hex chars encode flags+taxon, chars 8-48 = issuer)
          // NFTokenID structure: 4B flags | 4B taxon | 20B issuer | 4B sequence
          // We just return the first new token on the issuer's page — good enough for single-mint
          return id;
        }
      }
    }
  }
  return null;
}

function findOfferIndex(meta: Record<string, unknown>): string | null {
  const nodes = (meta?.AffectedNodes as Array<Record<string, unknown>>) || [];
  for (const n of nodes) {
    const c = n.CreatedNode as Record<string, unknown> | undefined;
    if (c?.LedgerEntryType === "NFTokenOffer") return c.LedgerIndex as string;
  }
  return null;
}

// ---- Send badge email via Resend ----
async function sendBadgeEmail(opts: {
  to: string;
  name: string;
  agentNumber: string | number;
  nftokenID?: string;
  txHash?: string;
  offerIndex?: string | null;
  holo: boolean;
  reserved: boolean;
  eventId?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn("[mint] RESEND_API_KEY not set — skipping email"); return; }

  // Check if user has unsubscribed
  const normalizedEmail = opts.to.toLowerCase().trim();
  const eventId = opts.eventId || DEFAULT_EVENT_ID;
  const existing = await redis.hgetall(`event:${eventId}:agent:${normalizedEmail}`);
  if (existing?.unsubscribed === "true") {
    console.log(`[mint] Skipping email to ${normalizedEmail} — user unsubscribed`);
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || "INFILTRATE · Do Not Reply <onboarding@resend.dev>";
  const tier = opts.holo ? "Genesis Holo" : "Verified Agent";
  const explorerUrl = opts.nftokenID ? `${EXPLORER}${encodeURIComponent(opts.nftokenID)}` : null;
  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://x402gal.com"}/api/unsubscribe?email=${encodeURIComponent(opts.to)}`;

  const subject = opts.reserved
    ? `Your INFILTRATE badge is reserved — Agent #${String(opts.agentNumber).padStart(4, "0")}`
    : `Your INFILTRATE badge is minted — Agent #${String(opts.agentNumber).padStart(4, "0")}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000814;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#B8D4E8">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#00E5FF;margin-bottom:8px">x402GAL · INFILTRATE</div>
    <h1 style="margin:0 0 4px;font-size:28px;font-weight:800;color:#FFFFFF">${opts.reserved ? "Badge Reserved" : "Badge Minted"}</h1>
    <div style="font-size:13px;color:#6E92AB;margin-bottom:32px">ETHConf NYC · Genesis 2026</div>

    <div style="background:#04162A;border:1px solid rgba(0,229,255,0.25);border-radius:14px;padding:24px;margin-bottom:24px">
      <div style="font-size:12px;font-family:monospace;color:#00E5FF;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px">${tier}</div>
      <div style="font-size:22px;font-weight:700;color:#FFFFFF;margin-bottom:4px">${opts.name}</div>
      <div style="font-family:monospace;font-size:14px;color:#00E5FF">AGENT #${String(opts.agentNumber).padStart(4, "0")}</div>
    </div>

    ${opts.reserved ? `
    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 16px">
      Your badge is reserved against your email. The genesis mint goes live this summer — we'll reach out with your claim link when it's ready.
    </p>
    ` : `
    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 16px">
      Your badge has been minted on the XRPL testnet. To receive it in your wallet, accept the transfer offer from your XRPL wallet app.
    </p>
    ${opts.nftokenID ? `<div style="background:#04162A;border:1px solid rgba(0,229,255,0.15);border-radius:10px;padding:14px;margin-bottom:16px;word-break:break-all;font-family:monospace;font-size:11px;color:#6E92AB">NFT ID: <span style="color:#00E5FF">${opts.nftokenID}</span></div>` : ""}
    ${explorerUrl ? `<a href="${explorerUrl}" style="display:inline-block;background:rgba(0,229,255,0.15);border:1px solid rgba(0,229,255,0.4);border-radius:8px;padding:10px 20px;color:#00E5FF;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:16px">View on XRPL testnet explorer →</a>` : ""}
    ${opts.offerIndex ? `<p style="font-size:12px;color:#6E92AB;margin:0 0 16px">Transfer offer index: <span style="font-family:monospace;color:#B8D4E8">${opts.offerIndex}</span></p>` : ""}
    `}

    <hr style="border:none;border-top:1px solid rgba(0,229,255,0.1);margin:24px 0">
    <p style="font-size:11px;color:#4A6B82;margin:0;line-height:1.6">
      x402GAL · Water for the age of AI · Every AI query has a water footprint. x402GAL settles it in real time on XRPL.<br>
      <a href="https://www.hydrocoin.com" style="color:#00E5FF">hydrocoin.com</a> · <a href="https://x402gal.com" style="color:#00E5FF">x402gal.com</a><br><br>
      <a href="${unsubscribeUrl}" style="color:#6E92AB;text-decoration:underline">Unsubscribe</a> · This is an automated message — please do not reply to this email.
    </p>
  </div>
</body>
</html>`;

  await resend.emails.send({ from, to: opts.to, subject, html });
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
  const email     = body.email as string | undefined;
  const agentNumber = body.agentNumber as string | number | undefined;
  const holo      = !!body.holo;
  const name      = (body.name as string) || "Agent";
  const eventId   = (body.eventId as string) || DEFAULT_EVENT_ID;

  if (recipient && !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(recipient)) {
    return Response.json({ ok: false, error: "invalid XRPL address" }, { status: 400, headers: CORS });
  }

  // ---- Deduplication: one NFT per email ----
  if (email) {
    const existing = await redis.hgetall(`event:${eventId}:agent:${email.toLowerCase()}`);
    if (existing?.nft_id) {
      return Response.json({
        ok: false,
        error: "NFT already minted for this email",
        existing: {
          nftokenID: existing.nft_id,
          txHash: existing.nft_tx,
          offerIndex: existing.nft_offer || null,
          mintedAt: existing.minted_at,
        }
      }, { status: 409, headers: CORS });
    }
  }

  // ---- Email-reserve path (no wallet) ----
  if (!recipient && email) {
    try {
      await sendBadgeEmail({ to: email, name, agentNumber: agentNumber ?? "0000", holo, reserved: true, eventId });
      // Persist reserve record
      if (email) {
        await redis.hset(`event:${eventId}:agent:${email.toLowerCase()}`, {
          reserved_at: new Date().toISOString(),
          badge_email_sent: "true",
        });
      }
    } catch (err) {
      console.error("[mint] email-reserve error:", err);
    }
    return Response.json({ ok: true, reserved: true, network: "testnet" }, { headers: CORS });
  }

  // ---- Live mint path ----
  const client = new Client(ENDPOINT);
  try {
    await client.connect();

    let issuer: Wallet;
    if (process.env.XRPL_ISSUER_SEED) {
      issuer = Wallet.fromSeed(process.env.XRPL_ISSUER_SEED);
    } else {
      const funded = await client.fundWallet();
      issuer = funded.wallet;
      console.log("[mint] no XRPL_ISSUER_SEED — funded throwaway:", issuer.seed);
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

    const nftokenID = extractNFTokenID(mintMeta, issuer.address);
    if (!nftokenID) throw new Error("could not extract NFTokenID from tx metadata");

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

    // Persist to Redis
    if (email) {
      await redis.hset(`event:${eventId}:agent:${email.toLowerCase()}`, {
        nft_id: nftokenID,
        nft_tx: minted.result.hash,
        nft_offer: offerIndex || "",
        minted_at: new Date().toISOString(),
      });
    }

    // Send confirmation email (fire-and-forget — don't fail the mint if email fails)
    if (email) {
      sendBadgeEmail({ to: email, name, agentNumber: agentNumber ?? "0000", nftokenID, txHash: minted.result.hash, offerIndex, holo, reserved: false, eventId })
        .catch(err => console.error("[mint] email send error:", err));
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
