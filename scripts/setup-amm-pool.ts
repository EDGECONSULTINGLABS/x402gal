/**
 * One-time setup: create the HYDRO/USDC AMM pool on XRPL testnet.
 *
 * Prereqs (in .env.local):
 *   XRPL_ENDPOINT, XRPL_TREASURY_SEED, XRPL_TREASURY_ADDRESS,
 *   HYDROCOIN_ISSUER_SEED, HYDROCOIN_ISSUER_ADDRESS, HYDROCOIN_CURRENCY
 *   XRPL_USDC_ISSUER / XRPL_USDC_CURRENCY  (defaults to Circle testnet USDC)
 *
 * The TREASURY must already hold XRPL-USDC (fund it from the Circle XRPL testnet
 * faucet / a USDC issuer). This script: sets trustlines, mints the seed HYDRO to
 * the treasury, then AMMCreate's the pool. HYDRO deposited is ceiling-checked.
 *
 *   npx tsx scripts/setup-amm-pool.ts [hydUnits] [usdcUnits]
 *
 * MAINNET GATE: refuses to run against a non-testnet endpoint unless
 * XRPL_AMM_ALLOW_MAINNET=true.
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { Client, Wallet, type Payment, type TrustSet } from "xrpl";
import {
  seedPool,
  getPoolInfo,
  ensureTreasuryUsdcTrustline,
  hydAsset,
  usdcAsset,
  assertAmmNetworkAllowed,
  hydroDropletsToIou,
} from "../lib/xrplAmm";
import { remainingHeadroomDroplets, verifiedMintedCeilingDroplets } from "../lib/hydroSupply";

const HYD_UNITS = Number(process.argv[2] ?? "10000");
const USDC_UNITS = Number(process.argv[3] ?? "10000");
const TRADING_FEE = Number(process.env.XRPL_AMM_TRADING_FEE ?? "500"); // 0.5%

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function treasuryUsdcBalance(client: Client, address: string): Promise<number> {
  const { currency, issuer } = usdcAsset();
  const lines = await client.request({ command: "account_lines", account: address, peer: issuer });
  const line = (lines.result.lines as Array<{ currency: string; balance: string }>).find(
    (l) => l.currency === currency,
  );
  return line ? Number(line.balance) : 0;
}

async function main() {
  assertAmmNetworkAllowed();

  const endpoint = process.env.XRPL_ENDPOINT ?? "wss://s.altnet.rippletest.net:51233";
  const issuer = Wallet.fromSeed(requireEnv("HYDROCOIN_ISSUER_SEED"));
  const treasury = Wallet.fromSeed(requireEnv("XRPL_TREASURY_SEED"));
  const hydCurrency = requireEnv("HYDROCOIN_CURRENCY");
  requireEnv("HYDROCOIN_ISSUER_ADDRESS");

  const hydDroplets = Math.round(HYD_UNITS * 1_000_000);

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Issuer:   ${issuer.address}`);
  console.log(`Treasury: ${treasury.address}`);
  console.log(`Seed:     ${HYD_UNITS} HYDRO / ${USDC_UNITS} USDC  (fee ${TRADING_FEE / 1000}%)`);
  console.log(`Ceiling:  ${verifiedMintedCeilingDroplets()} droplets`);

  const client = new Client(endpoint);
  await client.connect();

  try {
    const existing = await getPoolInfo(client);
    if (existing) {
      console.log("\nPool already exists:", existing);
      return;
    }

    // 1) Treasury trustlines (HYD + USDC).
    console.log("\n[1/4] Ensuring treasury trustlines...");
    const hydTrust: TrustSet = {
      TransactionType: "TrustSet",
      Account: treasury.address,
      LimitAmount: { currency: hydCurrency, issuer: issuer.address, value: "1000000000" },
    };
    await client.submitAndWait(hydTrust, { wallet: treasury });
    await ensureTreasuryUsdcTrustline(client, treasury);

    // 2) Mint seed HYDRO to treasury.
    console.log("[2/4] Minting seed HYDRO to treasury...");
    const mint: Payment = {
      TransactionType: "Payment",
      Account: issuer.address,
      Destination: treasury.address,
      Amount: { currency: hydCurrency, issuer: issuer.address, value: hydroDropletsToIou(hydDroplets) },
    };
    await client.submitAndWait(mint, { wallet: issuer });

    // 3) Verify treasury USDC balance is sufficient.
    console.log("[3/4] Checking treasury USDC balance...");
    const usdcBal = await treasuryUsdcBalance(client, treasury.address);
    console.log(`      treasury USDC balance: ${usdcBal}`);
    if (usdcBal < USDC_UNITS) {
      console.error(
        `\nInsufficient treasury USDC (${usdcBal} < ${USDC_UNITS}). Fund ${treasury.address} ` +
          `with XRPL-USDC from issuer ${usdcAsset().issuer} then re-run.`,
      );
      process.exit(1);
    }

    // 4) Create the AMM pool (HYDRO deposit is ceiling-checked inside seedPool).
    console.log("[4/4] Creating AMM pool (AMMCreate)...");
    const result = await seedPool(client, treasury, hydDroplets, USDC_UNITS, TRADING_FEE);
    console.log("\nPool created:", result);

    const pool = await getPoolInfo(client);
    console.log("Pool reserves:", pool);
    console.log("Remaining ceiling headroom (droplets):", await remainingHeadroomDroplets());
    console.log("HYDRO/USDC asset pair:", hydAsset(), usdcAsset());
  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
