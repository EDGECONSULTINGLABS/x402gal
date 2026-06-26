// Validation suite for dual-rail 402GAL
const BASE = "https://www.x402gal.com";

async function main() {
  // 1. Check XRPL live status
  const state = await fetch(`${BASE}/api/state`).then((r) => r.json());
  console.log("xrpl.live:", state.xrpl.live);

  // 2. Check dual-rail 402
  const r402 = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "validate" }),
  });
  const d402 = await r402.json();
  console.log("\n402 accepts count:", d402.accepts?.length);
  d402.accepts?.forEach((a: any, i: number) => {
    console.log(`  [${i}] scheme=${a.scheme} network=${a.network} asset=${a.asset}`);
    if (a.network === "avalanche-fuji") console.log(`       payTo=${a.payTo} maxAmountRequired=${a.maxAmountRequired}`);
    if (a.network === "xrpl") console.log(`       recipient=${a.recipient} amountUsdc=${a.amountUsdc}`);
  });

  // 3. Test XRPL native path
  const agentId = `agent_val_${Date.now()}`;
  await fetch(`${BASE}/api/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, chain: "avalanche", balanceUsdc: 100_000_000 }),
  });

  let res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "validate" }),
  });
  let data = await res.json();

  if (res.status === 402 && data?.accepts) {
    const req = data.accepts.find((a: any) => a.network === "xrpl");
    const sigHex = Array.from(`${agentId}|${req.nonce}`).map((c) => c.charCodeAt(0).toString(16)).join("").slice(0, 48);
    const payload = {
      x402Version: 1, scheme: "exact", network: req.network, asset: "USDC",
      amountUsdc: req.amountUsdc, offsetHydroDroplets: req.offsetHydroDroplets,
      payer: agentId, recipient: req.recipient, nonce: req.nonce,
      signature: `sig_${sigHex}`, sourceChain: "avalanche",
    };
    res = await fetch(`${BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-PAYMENT": btoa(JSON.stringify(payload)) },
      body: JSON.stringify({ prompt: "validate" }),
    });
    data = await res.json();
  }

  console.log("\nXRPL path:", res.status === 200 ? "OK" : `FAIL (${res.status})`);
  console.log("  charged:", data.pricing?.amountUsdc, "water_ml:", data.pricing?.water_ml, "pending:", data.batch?.pending_calls);

  // 4. Test forged ERC-3009 rejection
  const fake = btoa(JSON.stringify({
    x402Version: 1, scheme: "exact", network: "avalanche-fuji",
    payload: {
      signature: "0x" + "ab".repeat(65),
      authorization: {
        from: "0x1111111111111111111111111111111111111111",
        to: "0xF72c755B8987E285c0C7C22c5fB51E6965709a84",
        value: "22", validAfter: "0", validBefore: "9999999999",
        nonce: "0x" + "11".repeat(32),
      },
    },
  }));
  const rFake = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-PAYMENT": fake },
    body: JSON.stringify({ prompt: "forged" }),
  });
  console.log("\nForged ERC-3009:", rFake.status === 402 ? "REJECTED OK" : `UNEXPECTED ${rFake.status}`);
}

main().catch(console.error);
