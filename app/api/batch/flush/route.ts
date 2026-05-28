// Manual batch flush — drains the pending batch and triggers a direct XRPL
// settlement immediately. Useful for the BATCH_FLUSH_MS timer surrogate
// and for the dashboard's "settle now" button.

import { drainBatch, ledger } from "@/lib/ledger";
import { settleBatch } from "@/lib/settlement";

export const runtime = "nodejs";

export async function POST() {
  const before = ledger().pendingTotals.calls;
  if (before === 0) {
    return Response.json({ ok: true, flushed: null, pending_calls: 0 });
  }
  const settlement = await settleBatch(drainBatch());
  return Response.json({ ok: true, flushed: settlement, pending_calls: 0 });
}
