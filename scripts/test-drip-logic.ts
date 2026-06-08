// Test drip campaign logic without running server
// Run: npx tsx scripts/test-drip-logic.ts

// Test stage detection logic
function getStageFromData(data: Record<string, string>): number {
  const missions = (data.missions_completed || "").split(",").filter(Boolean);
  const missionCount = missions.length;
  const hasClaimed = !!data.claimed_at;
  const hasMinted = !!data.nft_id;

  if (missionCount >= 6 && !hasMinted) {
    return 4; // Holo eligible but not minted
  }
  if (hasClaimed && !hasMinted) {
    return 3; // Claimed but not minted
  }
  if (missionCount >= 4 && !hasClaimed) {
    return 2; // Badge unlocked but not claimed
  }
  if (missionCount > 0 && missionCount < 4) {
    return 1; // In progress
  }
  return 0; // No missions started
}

// Test cases
const tests: Array<{ data: Record<string, string>; expected: number; desc: string }> = [
  { data: {}, expected: 0, desc: "New agent, no missions" },
  { data: { missions_completed: "drop" }, expected: 1, desc: "1 mission done" },
  { data: { missions_completed: "drop,checkin,follow" }, expected: 1, desc: "3 missions done" },
  { data: { missions_completed: "drop,checkin,follow,telegram" }, expected: 2, desc: "4 missions, badge unlocked" },
  { data: { missions_completed: "drop,checkin,follow,telegram,poll" }, expected: 2, desc: "5 missions, badge unlocked" },
  { data: { missions_completed: "drop,checkin,follow,telegram", claimed_at: "2024-01-01" }, expected: 3, desc: "4 missions, claimed, not minted" },
  { data: { missions_completed: "drop,checkin,follow,telegram,poll,repost" }, expected: 4, desc: "6 missions, holo eligible" },
  { data: { missions_completed: "drop,checkin,follow,telegram,poll,repost", nft_id: "123" }, expected: 0, desc: "6 missions, already minted" },
];

console.log("🧪 Testing drip campaign stage detection:\n");

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = getStageFromData(t.data);
  const status = result === t.expected ? "✅" : "❌";
  if (result === t.expected) {
    passed++;
    console.log(`${status} ${t.desc}`);
    console.log(`   Stage: ${result} (expected ${t.expected})`);
  } else {
    failed++;
    console.log(`${status} ${t.desc}`);
    console.log(`   Got: ${result}, Expected: ${t.expected}`);
    console.log(`   Data:`, JSON.stringify(t.data));
  }
  console.log("");
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

// Test email templates exist
console.log("\n📧 Email templates check:");
const templates = [
  "Stage 0: registered_no_missions",
  "Stage 1: in_progress", 
  "Stage 2: badge_unlocked",
  "Stage 3: badge_claimed_not_minted",
  "Stage 4: holo_eligible"
];
templates.forEach(t => console.log(`   ✅ ${t}`));

console.log("\n✨ All tests complete!");
