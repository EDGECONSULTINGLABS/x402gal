// scripts/test-email.ts
// Send a test badge email to verify the template and unsubscribe functionality
// Usage: npx ts-node scripts/test-email.ts

import { Resend } from "resend";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const TEST_EMAIL = "alula@edgeconsultinglabs.com";
const TEST_NAME = "Alula";
const TEST_AGENT_NUMBER = "1337";

const EXPLORER = "https://testnet.xrpl.org/nft/";
const META_BASE = process.env.BADGE_META_BASE || "https://www.x402gal.com/api/badge-meta";

async function sendTestEmail() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set in .env.local");
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM || "INFILTRATE · Do Not Reply <onboarding@resend.dev>";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://x402gal.com";
  const unsubscribeUrl = `${siteUrl}/api/unsubscribe?email=${encodeURIComponent(TEST_EMAIL)}`;

  const tier = "Genesis Holo";
  const metaUrl = `${META_BASE}/${TEST_AGENT_NUMBER}?tier=holo`;
  const nftokenID = "00080000C9AFA8056A2E78275C7E75F3566A9CC8C78C6E2B50062BFCA0E8A8A8";
  const explorerUrl = `${EXPLORER}${encodeURIComponent(nftokenID)}`;
  const offerIndex = "F1D3101C38C1A3F1D3101C38C1A3F1D3101C38C1A3F1D3101C38C1A3";

  const subject = `TEST: Your INFILTRATE badge is minted — Agent #${TEST_AGENT_NUMBER}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#000814;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#B8D4E8">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <div style="font-family:monospace;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#00E5FF;margin-bottom:8px">x402GAL · INFILTRATE</div>
    <h1 style="margin:0 0 4px;font-size:28px;font-weight:800;color:#FFFFFF">Badge Minted</h1>
    <div style="font-size:13px;color:#6E92AB;margin-bottom:32px">ETHConf NYC · Genesis 2026</div>

    <div style="background:#04162A;border:1px solid rgba(0,229,255,0.25);border-radius:14px;padding:24px;margin-bottom:24px">
      <div style="font-size:12px;font-family:monospace;color:#00E5FF;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px">${tier}</div>
      <div style="font-size:22px;font-weight:700;color:#FFFFFF;margin-bottom:4px">${TEST_NAME}</div>
      <div style="font-family:monospace;font-size:14px;color:#00E5FF">AGENT #${TEST_AGENT_NUMBER}</div>
    </div>

    <p style="font-size:14px;line-height:1.6;color:#B8D4E8;margin:0 0 16px">
      Your badge has been minted on the XRPL testnet. To receive it in your wallet, accept the transfer offer from your XRPL wallet app.
    </p>
    <div style="background:#04162A;border:1px solid rgba(0,229,255,0.15);border-radius:10px;padding:14px;margin-bottom:16px;word-break:break-all;font-family:monospace;font-size:11px;color:#6E92AB">NFT ID: <span style="color:#00E5FF">${nftokenID}</span></div>
    <a href="${explorerUrl}" style="display:inline-block;background:rgba(0,229,255,0.15);border:1px solid rgba(0,229,255,0.4);border-radius:8px;padding:10px 20px;color:#00E5FF;text-decoration:none;font-size:13px;font-weight:600;margin-bottom:16px">View on XRPL testnet explorer →</a>
    <p style="font-size:12px;color:#6E92AB;margin:0 0 16px">Transfer offer index: <span style="font-family:monospace;color:#B8D4E8">${offerIndex}</span></p>

    <hr style="border:none;border-top:1px solid rgba(0,229,255,0.1);margin:24px 0">
    <p style="font-size:11px;color:#4A6B82;margin:0;line-height:1.6">
      x402GAL · Water for the age of AI · Every AI query has a water footprint. x402GAL settles it in real time on XRPL.<br>
      <a href="https://www.hydrocoin.com" style="color:#00E5FF">hydrocoin.com</a> · <a href="https://x402gal.com" style="color:#00E5FF">x402gal.com</a><br><br>
      <a href="${unsubscribeUrl}" style="color:#6E92AB;text-decoration:underline">Unsubscribe</a> · This is an automated message — please do not reply to this email.
    </p>
  </div>
</body>
</html>`;

  try {
    const result = await resend.emails.send({
      from,
      to: TEST_EMAIL,
      subject,
      html,
    });

    console.log("✅ Test email sent successfully!");
    console.log("   To:", TEST_EMAIL);
    console.log("   Subject:", subject);
    console.log("   Unsubscribe URL:", unsubscribeUrl);
    console.log("   Resend ID:", result.data?.id);
  } catch (err) {
    console.error("❌ Failed to send test email:", err);
    process.exit(1);
  }
}

sendTestEmail();
