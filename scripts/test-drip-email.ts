// Test sending drip email to specific address
// Usage: npx tsx scripts/test-drip-email.ts <email> <stage>

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

  console.log(`📧 Testing drip email to: ${email}`);
  console.log(`📊 Stage: ${stage}`);
  console.log("");

  try {
    // First test dry run
    console.log("🔍 Dry run test...");
    const dryRes = await fetch(`${BASE}/api/drip/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": DRIP_API_KEY,
      },
      body: JSON.stringify({ stage, dryRun: true }),
    });

    const dryData = await dryRes.json();
    
    if (!dryData.ok) {
      console.error("❌ Dry run failed:", dryData.error);
      process.exit(1);
    }

    // Check if target email is in the list
    const targetAgent = dryData.details?.find((d: any) => d.email === email);
    
    if (!targetAgent) {
      console.log("⚠️ Email not found in this stage");
      console.log("Available agents:", dryData.details?.map((d: any) => d.email));
      process.exit(1);
    }

    console.log(`✅ Found agent: ${targetAgent.name} (Stage ${targetAgent.stage})`);
    console.log("");
    console.log("🚀 Sending REAL email...");
    console.log("   (Press Ctrl+C within 3 seconds to cancel)");
    
    await new Promise(r => setTimeout(r, 3000));

    // Send actual email
    const res = await fetch(`${BASE}/api/drip/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": DRIP_API_KEY,
      },
      body: JSON.stringify({ stage, dryRun: false }),
    });

    const data = await res.json();

    if (!data.ok) {
      console.error("❌ Failed:", data.error);
      process.exit(1);
    }

    // Check if our target was sent
    const sent = data.details?.find((d: any) => d.email === email && d.status === "sent");
    
    if (sent) {
      console.log(`✅ Email sent to ${email}!`);
    } else {
      console.log("⚠️ Email may have been skipped (already sent or error)");
      console.log("Details:", data.details?.find((d: any) => d.email === email));
    }

  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
