// Xaman (formerly XUMM) platform API helper — server-side only.
//
// Used to create a sign request (payload) for a native XRPL Payment so a human
// can pay an AI query's water bill in RLUSD from their Xaman wallet. We set
// `submit: false` so Xaman returns the SIGNED tx blob (hex) WITHOUT broadcasting
// it — the 402GAL facilitator submits it (and runs the HYDRO swap + retire),
// reusing the same `xrplSignedTx` path verified for programmatic agents.
//
// Requires env (never exposed client-side):
//   XUMM_API_KEY     — Xaman Developer Console app key
//   XUMM_API_SECRET  — Xaman Developer Console app secret
//
// Docs: https://docs.xaman.dev/concepts/payloads-sign-requests

const XUMM_API_BASE = "https://xumm.app/api/v1/platform";

export function isXamanConfigured(): boolean {
  return !!process.env.XUMM_API_KEY && !!process.env.XUMM_API_SECRET;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-API-Key": process.env.XUMM_API_KEY!,
    "X-API-Secret": process.env.XUMM_API_SECRET!,
  };
}

/** Minimal XRPL transaction JSON we hand to Xaman for signing. */
export interface XamanTxJson {
  TransactionType: "Payment";
  Destination: string;
  Amount: { currency: string; issuer: string; value: string };
  InvoiceID: string;
  [key: string]: unknown;
}

export interface XamanCreatedPayload {
  uuid: string;
  /** Universal deep link — opens Xaman on mobile or shows a sign page on desktop. */
  deeplink: string;
  /** PNG QR code that resolves to the deep link. */
  qrPng: string;
  /** WebSocket URL the client can subscribe to for live resolution events. */
  websocket: string;
}

/** Create a Xaman sign request for the given Payment. `submit: false` → returns hex, not broadcast. */
export async function createSignPayload(
  txjson: XamanTxJson,
  opts: { expireMinutes?: number; instruction?: string } = {},
): Promise<XamanCreatedPayload> {
  const res = await fetch(`${XUMM_API_BASE}/payload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      txjson,
      options: {
        submit: false,
        expire: opts.expireMinutes ?? 5,
      },
      custom_meta: opts.instruction ? { instruction: opts.instruction } : undefined,
    }),
  });
  if (!res.ok) {
    throw new Error(`Xaman payload create failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    uuid: string;
    next?: { always?: string };
    refs?: { qr_png?: string; websocket_status?: string };
  };
  return {
    uuid: data.uuid,
    deeplink: data.next?.always ?? "",
    qrPng: data.refs?.qr_png ?? "",
    websocket: data.refs?.websocket_status ?? "",
  };
}

export interface XamanPayloadStatus {
  resolved: boolean;
  signed: boolean;
  cancelled: boolean;
  expired: boolean;
  /** Signed transaction blob (hex) — present once signed; submit to the ledger yourself. */
  hex: string | null;
  /** On-ledger tx id (only set if Xaman submitted; we use submit:false, so usually null). */
  txid: string | null;
  /** The signer's XRPL account. */
  account: string | null;
  /**
   * Device push token Xaman issues for this user the first time they sign a
   * payload from this app. Persist it and pass as `user_token` on future sign
   * requests so they push straight to the device (no QR re-scan).
   */
  issuedUserToken: string | null;
}

/** Poll a Xaman payload's resolution status. */
export async function getSignPayload(uuid: string): Promise<XamanPayloadStatus> {
  const res = await fetch(`${XUMM_API_BASE}/payload/${uuid}`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Xaman payload fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    meta?: { resolved?: boolean; signed?: boolean; cancelled?: boolean; expired?: boolean };
    application?: { issued_user_token?: string | null };
    response?: { hex?: string | null; txid?: string | null; account?: string | null };
  };
  return {
    resolved: !!data.meta?.resolved,
    signed: !!data.meta?.signed,
    cancelled: !!data.meta?.cancelled,
    expired: !!data.meta?.expired,
    hex: data.response?.hex ?? null,
    txid: data.response?.txid ?? null,
    account: data.response?.account ?? null,
    issuedUserToken: data.application?.issued_user_token ?? null,
  };
}
