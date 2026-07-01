// app/api/drip/trigger/route.ts
// Drip campaign trigger endpoint for INFILTRATE leads.
// Sends stage-appropriate emails to agents who haven't completed missions.
//
// POST /api/drip/trigger
// Headers: Authorization: Bearer <DRIP_API_KEY>
// Body: { dryRun?: boolean, stage?: "all" | "0" | "1" | "2" | "3" | "4" }
//
// Stages:
//   0: Registered but no missions started
//   1: Started missions (1-3 missions, no badge yet)
//   2: Badge unlocked (4-5 missions) but not claimed
//   3: Badge claimed but not minted
//   4: Holo eligible (all 6 missions) but not minted

import { Redis } from "@upstash/redis";
import { Resend } from "resend";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const redis = Redis.fromEnv();
const DEFAULT_EVENT_ID = process.env.EVENT_ID || "ethconf-nyc-2026";
const BADGE_THRESHOLD = 4;
const HOLO_THRESHOLD = 6;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Stage definitions with email content
const STAGES = {
  0: {
    name: "registered_no_missions",
    subject: (agentNumber: string) => `Agent #${agentNumber}: Your mission is ready`,
    getHtml: (name: string, agentNumber: string, link: string, unsubscribeUrl: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000814;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#B8D4E8">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#00E5FF;margin-bottom:8px">x402GAL · INFILTRATE</div>
    <h1 style="margin:0 0 4px;font-size:28px;font-weight:800;color:#FFFFFF">Your mission awaits, Agent</h1>
    <div style="font-size:13px;color:#6E92AB;margin-bottom:32px">ETHConf NYC · Genesis 2026</div>

    <div style="background:#04162A;border:1px solid rgba(0,229,255,0.25);border-radius:14px;padding:24px;margin-bottom:24px">
      <div style="font-family:monospace;font-size:14px;color:#00E5FF;letter-spacing:0.1em">AGENT #${agentNumber}</div>
      <div style="font-size:18px;color:#FFFFFF;margin-top:8px">Status: Briefing</div>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 16px">
      You registered for INFILTRATE but haven't started your missions yet. Six missions stand between you and your Genesis badge.
    </p>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 24px">
      <strong>Complete 4 missions</strong> to unlock your badge. Finish all 6 to earn the rare <strong style="color:#FFD37A">Holo edition</strong>.
    </p>

    <a href="${link}?agent=${agentNumber}" style="display:inline-block;background:linear-gradient(120deg,#00E5FF,#00B8E5);color:#001824;text-decoration:none;font-weight:700;font-size:15px;padding:16px 32px;border-radius:12px;margin-bottom:24px">Start Your Mission →</a>

    <hr style="border:none;border-top:1px solid rgba(0,229,255,0.1);margin:24px 0">
    <p style="font-size:11px;color:#4A6B82;margin:0;line-height:1.6">
      x402GAL · Water for the age of AI<br>
      <a href="${unsubscribeUrl}" style="color:#6E92AB;text-decoration:underline">Unsubscribe</a> · This is an automated message
    </p>
  </div>
</body>
</html>`,
  },
  1: {
    name: "in_progress",
    subject: (agentNumber: string) => `Agent #${agentNumber}: You're on the board`,
    getHtml: (name: string, agentNumber: string, link: string, unsubscribeUrl: string, data: { missions: number; points: number }) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000814;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#B8D4E8">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#00E5FF;margin-bottom:8px">x402GAL · INFILTRATE</div>
    <h1 style="margin:0 0 4px;font-size:28px;font-weight:800;color:#FFFFFF">Keep pushing, Agent</h1>
    <div style="font-size:13px;color:#6E92AB;margin-bottom:32px">ETHConf NYC · Genesis 2026</div>

    <div style="background:#04162A;border:1px solid rgba(0,229,255,0.25);border-radius:14px;padding:24px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-family:monospace;font-size:14px;color:#00E5FF;letter-spacing:0.1em">AGENT #${agentNumber}</div>
        <div style="font-size:12px;color:#6E92AB">${data.missions}/6 missions</div>
      </div>
      <div style="height:8px;background:rgba(0,229,255,0.1);border-radius:4px;overflow:hidden">
        <div style="width:${(data.missions / 6) * 100}%;height:100%;background:linear-gradient(90deg,#00E5FF,#00B8E5);border-radius:4px"></div>
      </div>
      <div style="font-size:14px;color:#FFFFFF;margin-top:12px">${data.points} points earned</div>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 16px">
      You've started strong with ${data.missions} mission${data.missions === 1 ? "" : "s"} completed. <strong>${BADGE_THRESHOLD - data.missions} more</strong> to unlock your Genesis badge.
    </p>

    <a href="${link}?agent=${agentNumber}" style="display:inline-block;background:linear-gradient(120deg,#00E5FF,#00B8E5);color:#001824;text-decoration:none;font-weight:700;font-size:15px;padding:16px 32px;border-radius:12px;margin-bottom:24px">Continue Mission →</a>

    <hr style="border:none;border-top:1px solid rgba(0,229,255,0.1);margin:24px 0">
    <p style="font-size:11px;color:#4A6B82;margin:0;line-height:1.6">
      x402GAL · Water for the age of AI<br>
      <a href="${unsubscribeUrl}" style="color:#6E92AB;text-decoration:underline">Unsubscribe</a> · This is an automated message
    </p>
  </div>
</body>
</html>`,
  },
  2: {
    name: "badge_unlocked",
    subject: (agentNumber: string) => `Agent #${agentNumber}: Your badge is unlocked!`,
    getHtml: (name: string, agentNumber: string, link: string, unsubscribeUrl: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000814;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#B8D4E8">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#00E5FF;margin-bottom:8px">x402GAL · INFILTRATE</div>
    <h1 style="margin:0 0 4px;font-size:28px;font-weight:800;color:#FFFFFF">Badge unlocked, Agent!</h1>
    <div style="font-size:13px;color:#6E92AB;margin-bottom:32px">ETHConf NYC · Genesis 2026</div>

    <div style="background:#04162A;border:1px solid rgba(70,224,140,0.4);border-radius:14px;padding:24px;margin-bottom:24px;background:linear-gradient(180deg,rgba(70,224,140,0.1),rgba(4,22,42,0.8))">
      <div style="font-size:12px;font-family:monospace;color:#46E08C;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px">✓ Badge Unlocked</div>
      <div style="font-size:22px;font-weight:700;color:#FFFFFF;margin-bottom:4px">${name}</div>
      <div style="font-family:monospace;font-size:14px;color:#00E5FF">AGENT #${agentNumber}</div>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 16px">
      Congratulations! You've completed enough missions to unlock your <strong>Genesis badge</strong>.
    </p>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 24px">
      <strong style="color:#FFD37A">Going for Holo?</strong> Complete all 6 missions to earn the rare Holo edition — minted one-for-one with the genesis drop.
    </p>

    <a href="${link}?action=claim&agent=${agentNumber}" style="display:inline-block;background:linear-gradient(120deg,#00E5FF,#00B8E5);color:#001824;text-decoration:none;font-weight:700;font-size:15px;padding:16px 32px;border-radius:12px;margin-bottom:24px">Claim Your Badge →</a>

    <hr style="border:none;border-top:1px solid rgba(0,229,255,0.1);margin:24px 0">
    <p style="font-size:11px;color:#4A6B82;margin:0;line-height:1.6">
      x402GAL · Water for the age of AI<br>
      <a href="${unsubscribeUrl}" style="color:#6E92AB;text-decoration:underline">Unsubscribe</a> · This is an automated message
    </p>
  </div>
</body>
</html>`,
  },
  3: {
    name: "badge_claimed_not_minted",
    subject: (agentNumber: string) => `Agent #${agentNumber}: Mint your NFT now`,
    getHtml: (name: string, agentNumber: string, link: string, unsubscribeUrl: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000814;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#B8D4E8">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#00E5FF;margin-bottom:8px">x402GAL · INFILTRATE</div>
    <h1 style="margin:0 0 4px;font-size:28px;font-weight:800;color:#FFFFFF">Your NFT is waiting, Agent</h1>
    <div style="font-size:13px;color:#6E92AB;margin-bottom:32px">ETHConf NYC · Genesis 2026</div>

    <div style="background:#04162A;border:1px solid rgba(0,229,255,0.25);border-radius:14px;padding:24px;margin-bottom:24px">
      <div style="font-size:12px;font-family:monospace;color:#00E5FF;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px">Badge Reserved</div>
      <div style="font-size:22px;font-weight:700;color:#FFFFFF;margin-bottom:4px">${name}</div>
      <div style="font-family:monospace;font-size:14px;color:#00E5FF">AGENT #${agentNumber}</div>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 16px">
      You've claimed your badge but haven't minted it yet. Don't let it sit in limbo — mint it on XRPL testnet now.
    </p>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 24px">
      The mainnet genesis mint follows this summer, but your testnet badge is ready today.
    </p>

    <a href="${link}?action=mint&agent=${agentNumber}" style="display:inline-block;background:linear-gradient(120deg,#00E5FF,#00B8E5);color:#001824;text-decoration:none;font-weight:700;font-size:15px;padding:16px 32px;border-radius:12px;margin-bottom:24px">Mint Your NFT →</a>

    <hr style="border:none;border-top:1px solid rgba(0,229,255,0.1);margin:24px 0">
    <p style="font-size:11px;color:#4A6B82;margin:0;line-height:1.6">
      x402GAL · Water for the age of AI<br>
      <a href="${unsubscribeUrl}" style="color:#6E92AB;text-decoration:underline">Unsubscribe</a> · This is an automated message
    </p>
  </div>
</body>
</html>`,
  },
  4: {
    name: "holo_eligible",
    subject: (agentNumber: string) => `Agent #${agentNumber}: Holo badge ready!`,
    getHtml: (name: string, agentNumber: string, link: string, unsubscribeUrl: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000814;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#B8D4E8">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#00E5FF;margin-bottom:8px">x402GAL · INFILTRATE</div>
    <h1 style="margin:0 0 4px;font-size:28px;font-weight:800;color:#FFFFFF">Holo edition earned!</h1>
    <div style="font-size:13px;color:#6E92AB;margin-bottom:32px">ETHConf NYC · Genesis 2026</div>

    <div style="background:conic-gradient(from 0deg,#62F1FF,#FFD37A,#46E08C,#1E90FF,#62F1FF);border-radius:16px;padding:3px;margin-bottom:24px;animation:pulse 4s linear infinite">
      <div style="background:#04162A;border-radius:14px;padding:22px">
        <div style="font-size:12px;font-family:monospace;color:#FFD37A;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px">✨ Genesis · Holo</div>
        <div style="font-size:22px;font-weight:700;color:#FFFFFF;margin-bottom:4px">${name}</div>
        <div style="font-family:monospace;font-size:14px;color:#00E5FF">AGENT #${agentNumber}</div>
        <div style="font-size:11px;color:#6E92AB;margin-top:8px">All 6 missions completed</div>
      </div>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 16px">
      Exceptional work, Agent. You've completed all six missions and earned the <strong style="color:#FFD37A">Genesis Holo</strong> — the rarest badge in the genesis drop.
    </p>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 24px">
      Mint it now before the holo supply runs out.
    </p>

    <a href="${link}?action=mint&agent=${agentNumber}" style="display:inline-block;background:linear-gradient(120deg,#FFD37A,#FF9D00);color:#001824;text-decoration:none;font-weight:700;font-size:15px;padding:16px 32px;border-radius:12px;margin-bottom:24px">Mint Holo Badge →</a>

    <hr style="border:none;border-top:1px solid rgba(0,229,255,0.1);margin:24px 0">
    <p style="font-size:11px;color:#4A6B82;margin:0;line-height:1.6">
      x402GAL · Water for the age of AI<br>
      <a href="${unsubscribeUrl}" style="color:#6E92AB;text-decoration:underline">Unsubscribe</a> · This is an automated message
    </p>
  </div>
</body>
</html>`,
  },
};

function getStageFromData(data: Record<string, string>): number {
  const missions = (data.missions_completed || "").split(",").filter(Boolean);
  const missionCount = missions.length;
  const hasClaimed = !!data.claimed_at;
  const hasMinted = !!data.nft_id;

  if (missionCount >= HOLO_THRESHOLD && !hasMinted) {
    return 4; // Holo eligible but not minted
  }
  if (hasClaimed && !hasMinted) {
    return 3; // Claimed but not minted
  }
  if (missionCount >= BADGE_THRESHOLD && !hasClaimed) {
    return 2; // Badge unlocked but not claimed
  }
  if (missionCount > 0 && missionCount < BADGE_THRESHOLD) {
    return 1; // In progress
  }
  return 0; // No missions started
}

async function sendDripEmail(
  email: string,
  name: string,
  agentNumber: string,
  stage: number,
  data: Record<string, string>,
  dryRun: boolean,
  force: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const stageConfig = STAGES[stage as keyof typeof STAGES];
  if (!stageConfig) {
    return { success: false, error: "Invalid stage" };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const from = process.env.EMAIL_FROM || "INFILTRATE · Do Not Reply <onboarding@resend.dev>";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://x402gal.com";
  const infiltrateUrl = `${baseUrl}/infiltrateETHConf2026.html`;
  const unsubscribeUrl = `${baseUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`;

  // Check if already sent this drip (skip if force=true)
  const dripKey = `drip_${stageConfig.name}_sent_at`;
  if (data[dripKey] && !force) {
    return { success: false, error: "Drip already sent" };
  }

  // Check if unsubscribed
  if (data.unsubscribed === "true") {
    return { success: false, error: "User unsubscribed" };
  }

  const subject = stageConfig.subject(agentNumber);
  const missions = (data.missions_completed || "").split(",").filter(Boolean);
  const points = Number(data.points) || 0;

  const html = stageConfig.getHtml(
    name || "Agent",
    agentNumber,
    infiltrateUrl,
    unsubscribeUrl,
    { missions: missions.length, points }
  );

  if (dryRun) {
    console.log(`[DRIP DRY RUN] Would send to ${email}: ${subject}`);
    return { success: true };
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from, to: email, subject, html });

    // Mark drip as sent
    await redis.hset(`event:${DEFAULT_EVENT_ID}:agent:${email.toLowerCase()}`, {
      [dripKey]: new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  // Check authorization using X-API-Key header.
  // Cron invocations are verified via CRON_SECRET (Vercel sends it as a
  // Bearer token) — the X-Vercel-CRON header is client-spoofable and must
  // never be trusted for auth.
  const DRIP_API_KEY = process.env.DRIP_API_KEY;
  const apiKey = req.headers.get("X-API-Key");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && req.headers.get("Authorization") === `Bearer ${cronSecret}`;

  if (!isCron && (!DRIP_API_KEY || apiKey !== DRIP_API_KEY)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: CORS });
  }
  
  // Only run drip campaign between 6/8/2026 and 6/10/2026
  const today = new Date();
  const startDate = new Date("2026-06-08");
  const endDate = new Date("2026-06-10");
  endDate.setHours(23, 59, 59, 999);
  
  if (today < startDate || today > endDate) {
    return Response.json({ ok: false, error: "Campaign not active. Runs 6/8/2026 - 6/10/2026" }, { status: 403, headers: CORS });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const dryRun = !!body.dryRun;
  const targetStage = body.stage as string || "all";
  const force = !!body.force;

  try {
    // Get all agents
    const members = await redis.smembers(`event:${DEFAULT_EVENT_ID}:agents`);
    const results: Array<{ email: string; stage: number; sent: boolean; error?: string }> = [];

    for (const email of members) {
      const data = await redis.hgetall(`event:${DEFAULT_EVENT_ID}:agent:${email}`) as Record<string, string> | null;
      if (!data || !data.agentNumber) continue;

      const stage = getStageFromData(data);

      // Skip if stage doesn't match target
      if (targetStage !== "all" && String(stage) !== targetStage) {
        continue;
      }

      // Skip completed users (minted holo)
      if (stage === 4 && data.nft_id) {
        continue;
      }

      const result = await sendDripEmail(
        email,
        data.name || "",
        String(data.agentNumber).padStart(4, "0"),
        stage,
        data,
        dryRun,
        force
      );

      results.push({
        email,
        stage,
        sent: result.success,
        error: result.error,
      });
    }

    const sent = results.filter(r => r.sent).length;
    const skipped = results.filter(r => !r.sent && r.error === "Drip already sent").length;
    const failed = results.filter(r => !r.sent && r.error !== "Drip already sent").length;

    return Response.json({
      ok: true,
      dryRun,
      targetStage,
      totalAgents: members.length,
      processed: results.length,
      sent,
      skipped,
      failed,
      details: results,
    }, { headers: CORS });

  } catch (err) {
    console.error("[drip] error:", err);
    return Response.json({
      ok: false,
      error: String((err as Error).message || err),
    }, { status: 500, headers: CORS });
  }
}
