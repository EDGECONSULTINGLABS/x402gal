/**
 * GET /api/xaman/payload/[uuid]
 *
 * Polls a Xaman sign request's resolution status. The client calls this on an
 * interval after showing the QR/deeplink. Once `signed` is true, `hex` holds
 * the signed XRPL Payment blob, which the client forwards to the 402GAL
 * facilitator for submission + HYDRO retirement.
 */

import { NextRequest } from "next/server";
import { getSignPayload, isXamanConfigured } from "@/lib/xaman";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { uuid: string } },
) {
  if (!isXamanConfigured()) {
    return Response.json(
      { error: "Xaman not configured — set XUMM_API_KEY and XUMM_API_SECRET" },
      { status: 503 },
    );
  }

  const uuid = params.uuid;
  if (!uuid) {
    return Response.json({ error: "missing payload uuid" }, { status: 400 });
  }

  try {
    const status = await getSignPayload(uuid);
    return Response.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Xaman status fetch failed: ${msg}` }, { status: 502 });
  }
}
