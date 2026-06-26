/** Diagnose why the AMM swap path is dry. Read-only. npx tsx scripts/diagnose-amm.ts */
import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { Client, Wallet } from "xrpl";
import { hydAsset, usdcAsset, getPoolInfo, hydroDropletsToIou } from "../lib/xrplAmm";

async function main() {
  const endpoint = process.env.XRPL_ENDPOINT ?? "wss://s.altnet.rippletest.net:51233";
  const treasury = Wallet.fromSeed(process.env.XRPL_TREASURY_SEED!);
  const issuer = Wallet.fromSeed(process.env.HYDROCOIN_ISSUER_SEED!);
  const hyd = hydAsset();
  const usdc = usdcAsset();

  const client = new Client(endpoint);
  await client.connect();
  try {
    console.log("Pool:", await getPoolInfo(client));

    const issuerInfo = await client.request({ command: "account_info", account: issuer.address });
    const flags = (issuerInfo.result.account_data as { Flags?: number }).Flags ?? 0;
    console.log(`\nIssuer ${issuer.address} Flags=${flags} DefaultRipple=${!!(flags & 0x00800000)}`);

    const lines = await client.request({ command: "account_lines", account: treasury.address });
    console.log("\nTreasury trust lines (currency | balance | no_ripple | peer):");
    for (const l of lines.result.lines as Array<{ currency: string; balance: string; no_ripple?: boolean; account: string }>) {
      console.log(`  ${l.currency} | ${l.balance} | no_ripple=${l.no_ripple} | ${l.account}`);
    }

    const destAmount = { currency: hyd.currency, issuer: hyd.issuer, value: hydroDropletsToIou(100000) };
    console.log(`\nripple_path_find USDC->HYD for ${destAmount.value} HYD (self):`);
    const pf = await client.request({
      command: "ripple_path_find",
      source_account: treasury.address,
      destination_account: treasury.address,
      destination_amount: destAmount,
      source_currencies: [{ currency: usdc.currency, issuer: usdc.issuer }],
    } as Parameters<Client["request"]>[0]);
    console.log(JSON.stringify((pf as { result?: { alternatives?: unknown } }).result?.alternatives, null, 2));
  } finally {
    await client.disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
