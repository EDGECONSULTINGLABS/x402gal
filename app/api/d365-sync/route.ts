// app/api/d365-sync/route.ts
// Pushes INFILTRATE leads to Microsoft Dynamics 365 as Lead records.
// Uses the D365 Web API with OAuth2 client_credentials flow.
//
// POST /api/d365-sync   — sync all unsynced agents for the event
// Body (optional): { eventId, emails[] }  — omit to sync all
//
// Required env vars:
//   D365_TENANT_ID       — Azure AD tenant ID
//   D365_CLIENT_ID       — App registration client ID
//   D365_CLIENT_SECRET   — App registration client secret
//   D365_ORG_URL         — e.g. https://yourorg.crm.dynamics.com
//   LEADS_SECRET         — shared secret to protect this endpoint

import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const redis = Redis.fromEnv();
const DEFAULT_EVENT_ID = process.env.EVENT_ID || "ethconf-nyc-2026";
const LEADS_SECRET = process.env.LEADS_SECRET || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ---- D365 OAuth token (cached in memory for the lifetime of the serverless instance) ----
let _token: string | null = null;
let _tokenExpiry = 0;

async function getD365Token(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token;

  const tenantId = process.env.D365_TENANT_ID!;
  const clientId = process.env.D365_CLIENT_ID!;
  const clientSecret = process.env.D365_CLIENT_SECRET!;
  const orgUrl = process.env.D365_ORG_URL!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: `${orgUrl}/.default`,
      }),
    }
  );

  if (!res.ok) throw new Error(`D365 token error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  _token = data.access_token;
  _tokenExpiry = Date.now() + data.expires_in * 1000;
  return _token;
}

// ---- Map INFILTRATE role to D365 leadsourcecode ----
const LEAD_SOURCE: Record<string, number> = {
  investor: 8,   // 8 = Word of Mouth (closest to "investor interest")
  builder: 10,   // 10 = Partner
  operator: 3,   // 3 = Advertisement
  curious: 1,    // 1 = Advertisement
};

// ---- Upsert one lead in D365 (match on emailaddress1) ----
async function upsertLead(agent: Record<string, string>, token: string, orgUrl: string) {
  const leadPayload: Record<string, unknown> = {
    subject: `INFILTRATE ETHConf 2026 — Agent #${agent.agentNumber || "?"}`,
    firstname: (agent.name || "").split(" ")[0] || agent.name || "",
    lastname: (agent.name || "").split(" ").slice(1).join(" ") || "-",
    emailaddress1: agent.email,
    companyname: agent.company || "Unknown",
    description: [
      `Role: ${agent.role || "—"}`,
      `Intent: ${agent.intent || "—"}`,
      `Points: ${agent.points || 0}`,
      `Missions: ${agent.missions_completed || "none"}`,
      `Squad: ${agent.squad || "—"}`,
      `Agent #: ${agent.agentNumber || "—"}`,
      `Wallet: ${agent.wallet || "none"}`,
      `NFT: ${agent.nft_id || "none"}`,
      `Captured: ${agent.capturedAt || "—"}`,
    ].join("\n"),
    leadsourcecode: LEAD_SOURCE[agent.role] ?? 1,
    // Custom fields — add these to your D365 Lead entity if needed:
    // "new_infiltrate_agent_number": agent.agentNumber,
    // "new_infiltrate_points": agent.points,
    // "new_infiltrate_event": "ethconf-nyc-2026",
  };

  // Use alternate key upsert by emailaddress1
  const url = `${orgUrl}/api/data/v9.2/leads(emailaddress1='${encodeURIComponent(agent.email)}')`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      "If-None-Match": "null",   // upsert: create if not exists
      Prefer: "return=representation",
    },
    body: JSON.stringify(leadPayload),
  });

  if (!res.ok && res.status !== 204) {
    throw new Error(`D365 upsert failed for ${agent.email}: ${res.status} ${await res.text()}`);
  }
  return true;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-leads-secret") || "";
  // Fail closed: an unset LEADS_SECRET must not leave this endpoint open.
  if (!LEADS_SECRET || secret !== LEADS_SECRET) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401, headers: CORS });
  }

  // Check D365 config
  const orgUrl = process.env.D365_ORG_URL;
  if (!process.env.D365_TENANT_ID || !process.env.D365_CLIENT_ID || !process.env.D365_CLIENT_SECRET || !orgUrl) {
    return Response.json({ ok: false, error: "D365 env vars not configured (D365_TENANT_ID, D365_CLIENT_ID, D365_CLIENT_SECRET, D365_ORG_URL)" }, { status: 503, headers: CORS });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const eventId = (body.eventId as string) || DEFAULT_EVENT_ID;
  const filterEmails = (body.emails as string[]) || null;

  try {
    const token = await getD365Token();

    // Get all registered agent emails
    const allEmails = await redis.smembers(`event:${eventId}:agents`) as string[];
    const emails = filterEmails
      ? allEmails.filter(e => filterEmails.includes(e))
      : allEmails;

    const results: { email: string; ok: boolean; error?: string }[] = [];

    for (const email of emails) {
      const agent = await redis.hgetall(`event:${eventId}:agent:${email}`) as Record<string, string> | null;
      if (!agent) { results.push({ email, ok: false, error: "not found in Redis" }); continue; }
      try {
        await upsertLead(agent, token, orgUrl);
        // Mark as synced in Redis
        await redis.hset(`event:${eventId}:agent:${email}`, { d365_synced_at: new Date().toISOString() });
        results.push({ email, ok: true });
      } catch (err) {
        results.push({ email, ok: false, error: String((err as Error).message) });
      }
    }

    const synced = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    return Response.json({ ok: true, synced, failed, results }, { headers: CORS });
  } catch (err) {
    console.error("[d365-sync] error:", err);
    return Response.json({ ok: false, error: String((err as Error).message || err) }, { status: 500, headers: CORS });
  }
}
