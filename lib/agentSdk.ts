// 402GAL agent SDK — what an autonomous agent embeds to transparently
// pay 402 challenges. Mirrors the ergonomics of `fetch` and works with
// any x402-compliant resource. This is the public-facing developer surface.

import { PaymentPayload, PaymentRequirement, Chain } from "./types";

export interface AgentWallet {
  agentId: string;
  sourceChain: Chain;
  sign: (req: PaymentRequirement) => Promise<string>;
}

export interface Gal402FetchOptions extends RequestInit {
  wallet: AgentWallet;
  maxDrops?: number; // refuse to pay more than this per request
}

export async function gal402Fetch(input: string, opts: Gal402FetchOptions): Promise<Response> {
  const first = await fetch(input, opts);
  if (first.status !== 402) return first;

  const body = await first.json();
  const req: PaymentRequirement = body.accepts?.[0];
  if (!req) throw new Error("402 response missing payment requirements");
  if (opts.maxDrops != null && req.amountDrops > opts.maxDrops) {
    throw new Error(`Payment ${req.amountDrops} drops exceeds maxDrops ${opts.maxDrops}`);
  }

  const signature = await opts.wallet.sign(req);
  const payload: PaymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: req.network,
    asset: "HYDRO",
    amountDrops: req.amountDrops,
    payer: opts.wallet.agentId,
    recipient: req.recipient,
    nonce: req.nonce,
    signature,
    routedVia: "wire-utl",
    sourceChain: opts.wallet.sourceChain,
  };
  const headerB64 = Buffer.from(JSON.stringify(payload)).toString("base64");

  return fetch(input, {
    ...opts,
    headers: {
      ...(opts.headers as Record<string, string> | undefined),
      "X-PAYMENT": headerB64,
    },
  });
}

// Reference wallet: deterministic stub signature so the demo is reproducible.
export function memoryWallet(agentId: string, sourceChain: Chain): AgentWallet {
  return {
    agentId,
    sourceChain,
    async sign(req) {
      const base = `${agentId}|${req.nonce}|${req.amountDrops}`;
      return "sig_" + Buffer.from(base).toString("hex").slice(0, 48);
    },
  };
}
