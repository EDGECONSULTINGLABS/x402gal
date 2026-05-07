// Manual batch flush — drains the pending escrow and emits a Wire UTL
// settlement immediately. Useful for the BATCH_FLUSH_MS timer surrogate
// and for the dashboard's "force settle now" button.

import { drainBatch, ledger } from "@/lib/ledger";
import { settleBatch } from "@/lib/wire";

export const runtime = "edge";

export async function POST() {
  const before = ledger().pendingTotals.calls;
  if (before === 0) {
    return Response.json({ ok: true, flushed: null, pending_calls: 0 });
  }
  const settlement = await settleBatch(drainBatch());
  return Response.json({ ok: true, flushed: settlement, pending_calls: 0 });
}
