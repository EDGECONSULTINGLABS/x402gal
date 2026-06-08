// scripts/trigger-drip.ts
// Trigger the drip campaign for INFILTRATE leads
// Usage: npx tsx scripts/trigger-drip.ts [stage] [--dry-run]
//
// Stages:
//   all (default) - All stages
//   0 - Registered but no missions started
//   1 - Started missions (1-3 missions)
//   2 - Badge unlocked (4-5 missions) but not claimed
//   3 - Badge claimed but not minted
//   4 - Holo eligible (all 6 missions) but not minted
//
// Examples:
//   npx tsx scripts/trigger-drip.ts           # Dry run all stages
//   npx tsx scripts/trigger-drip.ts 1         # Dry run stage 1
//   npx tsx scripts/trigger-drip.ts all --send # Actually send emails

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE = process.env.BASE || "http://localhost:3000";
const DRIP_API_KEY = process.env.DRIP_API_KEY;

async function main() {
  const args = process.argv.slice(2);
  const stage = args.find(a => !a.startsWith("--")) || "all";
  const dryRun = !args.includes("--send");

  if (!DRIP_API_KEY) {
    console.error("❌ DRIP_API_KEY not set in .env.local");
    console.log("\nAdd to .env.local:");
    console.log("DRIP_API_KEY=your_secret_key_here");
    process.exit(1);
  }

  console.log(`🚀 Triggering drip campaign...`);
  console.log(`   Stage: ${stage}`);
  console.log(`   Mode: ${dryRun ? "DRY RUN (preview only)" : "LIVE (sending emails)"}`);
  console.log("");

  try {
    console.log(`   URL: ${BASE}/api/drip/trigger`);
    console.log(`   Auth: Bearer ${DRIP_API_KEY?.substring(0, 15)}...`);
    const res = await fetch(`${BASE}/api/drip/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": DRIP_API_KEY,
      },
      body: JSON.stringify({ stage, dryRun }),
    });

    const data = await res.json();

    if (!data.ok) {
      console.error("❌ Failed:", data.error);
      process.exit(1);
    }

    console.log("✅ Drip campaign completed!");
    console.log("");
    console.log(`📊 Results:`);
    console.log(`   Total agents: ${data.totalAgents}`);
    console.log(`   Processed: ${data.processed}`);
    console.log(`   Sent: ${data.sent}`);
    console.log(`   Skipped (already sent): ${data.skipped}`);
    console.log(`   Failed: ${data.failed}`);
    console.log("");

    if (data.details.length > 0) {
      console.log("📋 Details:");
      for (const d of data.details.slice(0, 20)) {
        const icon = d.sent ? "✅" : d.error === "Drip already sent" ? "⏭️" : "❌";
        console.log(`   ${icon} Stage ${d.stage}: ${d.email}${d.error ? ` (${d.error})` : ""}`);
      }
      if (data.details.length > 20) {
        console.log(`   ... and ${data.details.length - 20} more`);
      }
    }

    if (dryRun) {
      console.log("");
      console.log("💡 This was a dry run. No emails were actually sent.");
      console.log("   Add --send flag to send emails for real:");
      console.log(`   npx tsx scripts/trigger-drip.ts ${stage} --send`);
    }

  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
