// Force send drip email (bypasses anti-spam tracking)
// Usage: npx tsx scripts/force-send-drip.ts <email> <stage>

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE = process.env.BASE || "https://x402gal.com";
const DRIP_API_KEY = process.env.DRIP_API_KEY;

async function main() {
  const email = process.argv[2] || "a.zeryihun@gmail.com";
  const stage = process.argv[3] || "4";

  if (!DRIP_API_KEY) {
    console.error("❌ DRIP_API_KEY not set");
    process.exit(1);
  }

  console.log(`📧 Force sending drip email to: ${email}`);
  console.log(`📊 Stage: ${stage}`);
  console.log("   (force=true - bypasses anti-spam tracking)");
  console.log("");

  try {
    console.log("🚀 Sending email...");
    
    const res = await fetch(`${BASE}/api/drip/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": DRIP_API_KEY,
      },
      body: JSON.stringify({ stage, dryRun: false, force: true }),
    });

    const data = await res.json();
    
    console.log("📊 API Response:", JSON.stringify(data, null, 2));

    if (!data.ok) {
      console.error("❌ API returned error:", data.error);
      process.exit(1);
    }

    // Check if our target was sent
    const targetDetail = data.details?.find((d: any) => d.email === email);
    
    if (targetDetail?.status === "sent") {
      console.log(`✅ Email FORCE SENT to ${email}!`);
    } else {
      console.log("⚠️ Email not sent. Detail:", targetDetail);
    }

  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
