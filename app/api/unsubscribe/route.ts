// app/api/unsubscribe/route.ts
// Unsubscribe endpoint for badge emails
// GET /api/unsubscribe?email=xxx

import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const runtime = "nodejs";

// Reject Redis glob metacharacters so a crafted "email" like *@*.* can't
// match every agent key in redis.keys(), and HTML-escape reflected values.
const SAFE_EMAIL = /^[^\s@*?[\]\\]+@[^\s@*?[\]\\]+\.[^\s@*?[\]\\]+$/;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");

  if (!email || !SAFE_EMAIL.test(email)) {
    return new Response(
      `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px;text-align:center">
<h1>Invalid email address</h1>
<p>Please provide a valid email address.</p>
</body></html>`,
      { status: 400, headers: { "Content-Type": "text/html", ...CORS } }
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Check if email exists in our system
    const keys = await redis.keys(`*agent*${normalizedEmail}*`);
    
    if (keys.length === 0) {
      return new Response(
        `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#000814;color:#B8D4E8">
<div style="max-width:480px;margin:0 auto">
<h1 style="color:#00E5FF">Email Not Found</h1>
<p>We couldn't find <strong>${escapeHtml(normalizedEmail)}</strong> in our system.</p>
<p>If you believe this is an error, please contact us.</p>
</div></body></html>`,
        { status: 404, headers: { "Content-Type": "text/html", ...CORS } }
      );
    }

    // Mark as unsubscribed in all matching records
    for (const key of keys) {
      await redis.hset(key, {
        unsubscribed: "true",
        unsubscribed_at: new Date().toISOString(),
      });
    }

    return new Response(
      `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#000814;color:#B8D4E8">
<div style="max-width:480px;margin:0 auto">
<div style="font-size:48px;margin-bottom:20px">✓</div>
<h1 style="color:#00E5FF">Successfully Unsubscribed</h1>
<p><strong>${escapeHtml(normalizedEmail)}</strong> has been removed from our mailing list.</p>
<p style="color:#6E92AB;font-size:14px;margin-top:30px">You will no longer receive badge or marketing emails from x402GAL.</p>
<a href="https://x402gal.com" style="display:inline-block;margin-top:20px;color:#00E5FF;text-decoration:none">← Return to x402gal.com</a>
</div></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html", ...CORS } }
    );
  } catch (err) {
    console.error("[unsubscribe] error:", err);
    return new Response(
      `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:40px;text-align:center">
<h1>Error</h1>
<p>Something went wrong. Please try again later.</p>
</body></html>`,
      { status: 500, headers: { "Content-Type": "text/html", ...CORS } }
    );
  }
}
