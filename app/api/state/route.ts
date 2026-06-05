// Read-only snapshot of ledger state for the dashboard.

import { getDashboardState } from "@/lib/getState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getDashboardState());
}
