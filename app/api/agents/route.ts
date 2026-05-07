import { ledger } from "@/lib/ledger";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ agents: Array.from(ledger().agents.values()) });
}
