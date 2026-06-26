"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { Bot, Zap, RefreshCw } from "lucide-react";

const CHAIN_MAP: Record<number, string> = {
  8453: "base",
  1: "ethereum",
  137: "polygon",
  43114: "avalanche",
};

function resolveChain(chainId?: number): string {
  if (!chainId) return "base";
  return CHAIN_MAP[chainId] ?? "base";
}

interface SessionResult {
  status: number;
  completion?: string;
  footprintMl?: number;
  usdcCharged?: number;
  error?: string;
}

export function AgentSessionPanel() {
  // Always call hooks at top level - never conditionally
  const account = useAccount();
  const chainId = useChainId();

  // Safely extract values (these will be undefined during SSR)
  const address = account?.address;
  const isConnected = account?.isConnected ?? false;

  const [prompt, setPrompt] = useState("What is the water cost of this AI inference?");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);

  if (!isConnected || !address) return null;

  const chain = resolveChain(chainId);
  const agentId = `agent_${address.slice(2, 10).toLowerCase()}`;

  async function runQuery() {
    setRunning(true);
    setResult(null);
    try {
      // Register / top-up agent if needed
      await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, chain, balanceUsdc: 100_000_000, walletAddress: address }),
      });

      // Fire the x402 round-trip: first call returns 402 with requirements,
      // then we sign a payment payload and retry with the X-PAYMENT header.
      let res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-agent-id": agentId,
          "x-agent-chain": chain,
        },
        body: JSON.stringify({ prompt, agentId, chain }),
      });

      let data = await res.json();

      if (res.status === 402 && data?.accepts?.[0]) {
        const req = data.accepts[0];
        const sigHex = Array.from(`${agentId}|${req.nonce}`)
          .map((c) => c.charCodeAt(0).toString(16))
          .join("")
          .slice(0, 48);
        const payload = {
          x402Version: 1,
          scheme: "exact",
          network: req.network,
          asset: "USDC",
          amountUsdc: req.amountUsdc,
          offsetHydroDroplets: req.offsetHydroDroplets,
          payer: agentId,
          recipient: req.recipient,
          nonce: req.nonce,
          signature: `sig_${sigHex}`,
          sourceChain: chain,
        };
        res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-agent-id": agentId,
            "x-agent-chain": chain,
            "X-PAYMENT": btoa(JSON.stringify(payload)),
          },
          body: JSON.stringify({ prompt, agentId, chain }),
        });
        data = await res.json();
      }

      setResult({
        status: res.status,
        completion: data.completion ?? data.response ?? data.message,
        footprintMl: data.pricing?.water_ml ?? data.footprintMl,
        usdcCharged: data.pricing?.amountUsdc ?? data.usdcCharged,
        error: data.error,
      });
    } catch (e) {
      setResult({ status: 0, error: String(e) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="glass-strong mt-4 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
        <Bot size={14} /> Your Agent Session
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-edge bg-ink/40 p-2">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Agent ID</div>
          <div className="mt-0.5 truncate font-mono text-slate-200">{agentId}</div>
        </div>
        <div className="rounded-md border border-edge bg-ink/40 p-2">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Chain</div>
          <div className="mt-0.5 font-mono text-slate-200 capitalize">{chain}</div>
        </div>
        <div className="col-span-2 rounded-md border border-edge bg-ink/40 p-2">
          <div className="text-[9px] uppercase tracking-wider text-slate-500">Wallet</div>
          <div className="mt-0.5 truncate font-mono text-slate-200">{address}</div>
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        className="mt-3 w-full resize-none rounded-md border border-edge bg-ink/60 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-hydro-500/50 focus:outline-none"
        placeholder="Enter your prompt…"
      />

      <button
        onClick={runQuery}
        disabled={running || !prompt.trim()}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-hydro-400/40 bg-hydro-500/10 px-3 py-2 text-xs font-medium text-hydro-300 transition hover:bg-hydro-500/20 disabled:opacity-50"
      >
        {running ? (
          <RefreshCw size={12} className="animate-spin" />
        ) : (
          <Zap size={12} />
        )}
        {running ? "Sending x402 query…" : "Send paid query as your agent"}
      </button>

      {result && (
        <div className="mt-3 rounded-md border border-edge bg-ink/60 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">
              Response · HTTP {result.status}
            </span>
            {result.footprintMl !== undefined && (
              <span className="text-[9px] text-hydro-300">
                {result.footprintMl.toFixed(3)} mL offset
              </span>
            )}
          </div>
          {result.status === 402 ? (
            <div className="mt-2 space-y-2">
              <p className="font-medium text-hydro-300">Payment Required</p>
              <p className="leading-relaxed text-slate-400">
                The endpoint returned 402 and the auto-signed x402 payment was not accepted — usually an expired requirement or an out-of-funds agent.
              </p>
              <div className="rounded-md border border-hydro-400/20 bg-hydro-500/5 p-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-hydro-200/80">What normally happens:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>The endpoint replies 402 with a water-footprint price</li>
                  <li>Your agent auto-signs an x402 payment header and retries</li>
                  <li>Payment verifies → inference runs → offset settles live on XRPL testnet</li>
                </ol>
                <p className="mt-2 text-slate-500">
                  Hit <span className="text-slate-300">+$100 USDC</span> to top up the agent and try again, or use the demo buttons on the left panel.
                </p>
              </div>
            </div>
          ) : result.error ? (
            <p className="mt-1 text-red-400">{result.error}</p>
          ) : (
            <p className="mt-1 leading-relaxed text-slate-300">{result.completion}</p>
          )}
          {result.usdcCharged !== undefined && (
            <p className="mt-1 text-slate-500">
              Charged: ${(result.usdcCharged / 1_000_000).toFixed(6)} USDC
            </p>
          )}
        </div>
      )}
    </div>
  );
}
