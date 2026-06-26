/**
 * GET /api/xrpl/balance?account=r...
 *
 * Returns the XRP and RLUSD balances for an XRPL account, used by the header
 * Xaman login to show a connected user's RLUSD holdings. Read-only — queries
 * the shared XRPL client singleton; never disconnects it.
 *
 * Response (200):
 *   { account, xrp, rlusd, hasRlusdTrustline }
 */

import { NextRequest } from "next/server";
import { getClient } from "@/lib/xrplClient";
import { rlusdCurrency, rlusdIssuer } from "@/lib/xrplAssets";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account");
  if (!account || !account.startsWith("r")) {
    return Response.json({ error: "missing or invalid account" }, { status: 400 });
  }

  try {
    const client = await getClient();

    let xrp = "0";
    try {
      const info = await client.request({ command: "account_info", account });
      const drops = (info.result.account_data as { Balance?: string }).Balance ?? "0";
      xrp = (parseInt(drops, 10) / 1_000_000).toString();
    } catch {
      // Unactivated account — no XRP reserve yet.
      return Response.json({ account, xrp: "0", rlusd: "0", hasRlusdTrustline: false });
    }

    const lines = await client.request({ command: "account_lines", account });
    const cur = rlusdCurrency();
    const iss = rlusdIssuer();
    const line = (lines.result.lines as Array<{ currency: string; account: string; balance: string }>)
      .find((l) => l.currency === cur && l.account === iss);

    return Response.json({
      account,
      xrp,
      rlusd: line ? line.balance : "0",
      hasRlusdTrustline: !!line,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `XRPL balance lookup failed: ${msg}` }, { status: 502 });
  }
}
