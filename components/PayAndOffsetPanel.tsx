"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSwitchChain, useSignTypedData } from "wagmi";
import { parseSignature, type Hex } from "viem";
import { Droplets, ExternalLink, Loader2, CheckCircle2, AlertTriangle, PenLine } from "lucide-react";

const FUJI_CHAIN_ID = 43113;

interface Receipt {
  success?: boolean;
  duplicate?: boolean;
  usdcTxHash?: string | null;
  explorerUsdc?: string | null;
  txHash?: string | null;
  retirementTxHash?: string | null;
  explorerSwap?: string | null;
  explorerRetirement?: string | null;
  errorReason?: string;
}

type Phase = "idle" | "switching" | "quoting" | "signing" | "settling" | "done" | "error";

const STEPS = [
  { key: "quoting", label: "Quote" },
  { key: "signing", label: "Sign" },
  { key: "settling", label: "Settle" },
  { key: "done", label: "Receipt" },
] as const;

function randomNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return ("0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as Hex;
}

function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("user rejected") || m.includes("rejected the request") || m.includes("denied") || m.includes("user denied"))
    return "Signature cancelled — nothing moved. Click Pay & Offset to try again.";
  if (m.includes("balance") || m.includes("insufficient") || m.includes("exceeds") || m.includes("transfer amount"))
    return "Your wallet holds no Fuji testnet USDC. Get some free at faucet.circle.com (select Avalanche Fuji), then try again.";
  if (m.includes("chain") || m.includes("network") || m.includes("switch"))
    return "Couldn't switch your wallet to Avalanche Fuji. Switch the network manually in your wallet, then retry.";
  if (m.includes("treasury not configured") || m.includes("rail not advertised"))
    return "The live testnet rail isn't enabled right now. Try again shortly.";
  return raw;
}

export function PayAndOffsetPanel() {
  const { address, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { signTypedDataAsync } = useSignTypedData();

  const [phase, setPhase] = useState<Phase>("idle");
  const [priceMicros, setPriceMicros] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string>("");

  const busy = phase === "switching" || phase === "quoting" || phase === "signing" || phase === "settling";
  const usdcLabel = priceMicros != null ? `$${(priceMicros / 1_000_000).toFixed(6)}` : null;

  // Lightweight price preview (does not settle — just reads the 402 quote).
  const fetchQuote = useCallback(async (): Promise<{ fuji: any; xrpl: any } | null> => {
    const q = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Offset the water cost of this inference" }),
    });
    const data = await q.json();
    const accepts: any[] = data?.accepts ?? [];
    const fuji = accepts.find((a) => a.scheme === "exact" && String(a.network).startsWith("avalanche"));
    const xrpl = accepts.find((a) => a.network === "xrpl");
    if (!fuji) return null;
    return { fuji, xrpl };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchQuote()
      .then((r) => { if (alive && r) setPriceMicros(Number(r.fuji.maxAmountRequired)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [fetchQuote]);

  async function payAndOffset() {
    if (!address) return;
    setReceipt(null);
    setError("");
    try {
      if (chainId !== FUJI_CHAIN_ID) {
        setPhase("switching");
        await switchChainAsync({ chainId: FUJI_CHAIN_ID });
      }

      setPhase("quoting");
      const quote = await fetchQuote();
      if (!quote) throw new Error("rail not advertised");
      const { fuji, xrpl } = quote;
      setPriceMicros(Number(fuji.maxAmountRequired));

      setPhase("signing");
      const now = Math.floor(Date.now() / 1000);
      const validBefore = String(now + 600);
      const nonce = randomNonce();
      const value = String(fuji.maxAmountRequired);

      const signature = await signTypedDataAsync({
        domain: {
          name: fuji.extra?.name ?? "USD Coin",
          version: fuji.extra?.version ?? "2",
          chainId: FUJI_CHAIN_ID,
          verifyingContract: fuji.asset as Hex,
        },
        types: {
          ReceiveWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "ReceiveWithAuthorization",
        message: {
          from: address,
          to: fuji.payTo as Hex,
          value: BigInt(value),
          validAfter: 0n,
          validBefore: BigInt(validBefore),
          nonce,
        },
      });
      const sig = parseSignature(signature);

      setPhase("settling");
      const r = await fetch("/api/x402/facilitate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement: {
            x402Version: 1,
            scheme: "exact",
            network: "xrpl",
            asset: "USDC",
            maxAmountRequired: value,
            resource: fuji.resource ?? "/api/ai/chat",
            description: "Public self-serve water offset",
            mimeType: "application/json",
            payTo: fuji.payTo,
            requiredDeadlineSeconds: 60,
            offsetHydroDroplets: xrpl?.offsetHydroDroplets,
            estimatedMl: xrpl?.estimatedMl ?? 0,
          },
          payload: {
            x402Version: 1,
            scheme: "exact",
            network: "xrpl",
            payload: {
              signature,
              authorization: {
                from: address,
                to: fuji.payTo,
                value,
                validAfter: "0",
                validBefore,
                nonce,
                v: Number(sig.v),
                r: sig.r,
                s: sig.s,
              },
            },
          },
        }),
      });
      const data: Receipt = await r.json();
      if (!data.success) throw new Error(data.errorReason ?? `settlement failed (HTTP ${r.status})`);

      setReceipt(data);
      setPhase("done");
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setError(friendlyError(err?.shortMessage ?? err?.message ?? String(e)));
      setPhase("error");
    }
  }

  const activeIndex = STEPS.findIndex((s) => s.key === phase);

  return (
    <div className="glass-strong mt-4 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
        <Droplets size={14} /> Try it live · pay an agent&apos;s water bill
      </div>

      {/* ── Onboarding ── */}
      <div className="mt-3 rounded-xl border border-hydro-400/20 bg-hydro-500/5 p-3 text-xs leading-relaxed text-slate-300">
        <p className="font-medium text-hydro-200">
          You&apos;ll need one thing: testnet USDC on Avalanche Fuji (no real value).
          <span className="text-hydro-300"> No gas — we cover the network fees.</span>
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-400">
          <li>
            Get testnet USDC →{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-hydro-300 underline decoration-dotted hover:text-hydro-200">
              faucet.circle.com
            </a>{" "}
            (select <span className="text-slate-200">Avalanche Fuji</span>), send to your wallet.
          </li>
          <li>Connect your <span className="text-slate-200">EVM</span> wallet → one tap to switch to Fuji (no gas).</li>
          <li>Click <span className="text-slate-200">Pay &amp; Offset</span>, sign once → watch it settle on two chains.</li>
        </ol>
      </div>

      {/* ── Action ── */}
      {!isConnected ? (
        <p className="mt-3 rounded-md border border-edge bg-ink/40 p-3 text-center text-xs text-slate-400">
          Connect your EVM wallet (top right) to begin. Paying in RLUSD instead? Use the RLUSD panel above — no EVM wallet needed.
        </p>
      ) : (
        <button
          onClick={payAndOffset}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-hydro-400/40 bg-hydro-500/10 px-3 py-2.5 text-sm font-medium text-hydro-300 transition hover:bg-hydro-500/20 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />}
          {phase === "switching" && "Switching to Fuji…"}
          {phase === "quoting" && "Requesting quote…"}
          {phase === "signing" && "Awaiting your signature…"}
          {phase === "settling" && "Settling on Avalanche + XRPL…"}
          {(phase === "idle" || phase === "done" || phase === "error") &&
            `Pay & Offset${usdcLabel ? ` · ${usdcLabel} USDC` : ""}`}
        </button>
      )}

      {/* ── Progress stepper ── */}
      {(busy || phase === "done") && (
        <div className="mt-3 flex items-center justify-between gap-1">
          {STEPS.map((s, i) => {
            const reached = phase === "done" ? true : i <= activeIndex;
            return (
              <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] ${
                    reached ? "border-hydro-400/60 bg-hydro-500/20 text-hydro-200" : "border-edge bg-ink/40 text-slate-600"
                  }`}
                >
                  {phase === "done" || i < activeIndex ? <CheckCircle2 size={11} /> : i + 1}
                </div>
                <span className={`text-[9px] uppercase tracking-wider ${reached ? "text-hydro-300" : "text-slate-600"}`}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Error ── */}
      {phase === "error" && error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Receipt ── */}
      {phase === "done" && receipt && (
        <div className="mt-3 rounded-xl border border-hydro-400/30 bg-ink/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-hydro-200">
            <CheckCircle2 size={16} className="text-hydro-300" />
            {receipt.duplicate ? "Already settled — original receipt" : "Settled across two chains"}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            <span className="font-medium text-slate-200">What just happened:</span> you signed one
            authorization — your treasury did the rest.
          </p>

          <div className="mt-3 space-y-2 text-xs">
            <ReceiptLink
              label={`Paid ${usdcLabel ?? ""} USDC on Avalanche Fuji`}
              hint="real testnet transfer"
              href={receipt.explorerUsdc ?? (receipt.usdcTxHash ? `https://testnet.snowtrace.io/tx/${receipt.usdcTxHash}` : null)}
            />
            <ReceiptLink
              label="USDC swapped for HYDRO on XRPL AMM"
              hint="real testnet AMM swap"
              href={receipt.explorerSwap ?? (receipt.txHash ? `https://testnet.xrpscan.com/tx/${receipt.txHash}` : null)}
            />
            <ReceiptLink
              label="Water credit retired on XRPL"
              hint="retirement — the proof"
              accent
              href={receipt.explorerRetirement ?? (receipt.retirementTxHash ? `https://testnet.xrpscan.com/tx/${receipt.retirementTxHash}` : null)}
            />
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            All three legs are real on-chain transactions: the USDC pull on Avalanche Fuji,
            the USDC→HYDRO swap through the live XRPL testnet AMM, and the HYDRO retirement (burn).
            Anyone can verify every leg on the explorers above — no trust required.
          </p>

          {/* Honesty label — travels with screenshots */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-300/90">
            ◆ Avalanche Fuji → XRPL · testnet · real AMM swap + retire · no real-world value
          </div>
        </div>
      )}
    </div>
  );
}

function ReceiptLink({
  label,
  hint,
  href,
  accent,
}: {
  label: string;
  hint: string;
  href: string | null;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-md border p-2 ${accent ? "border-hydro-400/30 bg-hydro-500/5" : "border-edge bg-ink/40"}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className={`${accent ? "text-hydro-200" : "text-slate-200"}`}>{label}</div>
          <div className="text-[9px] uppercase tracking-wider text-slate-500">{hint}</div>
        </div>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded border border-hydro-400/30 bg-hydro-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-hydro-300 transition hover:border-hydro-300 hover:bg-hydro-500/20"
          >
            Explorer <ExternalLink size={9} />
          </a>
        )}
      </div>
    </div>
  );
}
