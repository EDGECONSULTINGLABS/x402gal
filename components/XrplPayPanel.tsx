"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Droplets,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  QrCode,
} from "lucide-react";

// Human-facing RLUSD pay flow on XRPL via Xaman (formerly XUMM).
//
// 1. POST /api/xaman/payload → server builds an RLUSD Payment from the live
//    water-footprint quote and returns a Xaman sign request (QR + deeplink).
// 2. User approves in Xaman; we poll until the signed blob is returned.
// 3. We forward the signed blob to /api/x402/facilitate, which submits it on
//    XRPL and runs the HYDRO swap + retire. Same rail verified for agents.

type Phase = "idle" | "creating" | "awaiting" | "settling" | "done" | "error";

interface CreatedPayload {
  uuid: string;
  qrPng: string;
  deeplink: string;
  invoiceId: string;
  amountMicros: number;
  destination: string;
  offsetHydroDroplets?: number;
  estimatedMl?: number;
  resource: string;
}

interface Receipt {
  success?: boolean;
  duplicate?: boolean;
  txHash?: string | null;
  retirementTxHash?: string | null;
  paymentTxHash?: string | null;
  explorerPayment?: string | null;
  explorerSwap?: string | null;
  explorerRetirement?: string | null;
  errorReason?: string;
}

const POLL_MS = 2500;

export function XrplPayPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [priceMicros, setPriceMicros] = useState<number | null>(null);
  const [payload, setPayload] = useState<CreatedPayload | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const busy = phase === "creating" || phase === "awaiting" || phase === "settling";
  const rlusdLabel = priceMicros != null ? `${(priceMicros / 1_000_000).toFixed(6)} RLUSD` : null;

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Price preview from the live 402 quote (RLUSD rail).
  useEffect(() => {
    let alive = true;
    fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Offset the water cost of this inference" }),
    })
      .then((r) => r.json())
      .then((data) => {
        const accepts: Array<{ network?: string; amountUsdc?: number; asset?: string }> =
          data?.accepts ?? [];
        const xrpl = accepts.find((a) => a.network === "xrpl");
        if (alive && xrpl?.amountUsdc != null) setPriceMicros(Number(xrpl.amountUsdc));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => clearPoll, [clearPoll]);

  async function settle(p: CreatedPayload, hex: string, account: string | null) {
    setPhase("settling");
    const now = Math.floor(Date.now() / 1000);
    const r = await fetch("/api/x402/facilitate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requirement: {
          x402Version: 1,
          scheme: "exact",
          network: "xrpl",
          asset: "RLUSD",
          maxAmountRequired: String(p.amountMicros),
          resource: p.resource,
          description: "Public self-serve water offset (RLUSD via Xaman)",
          mimeType: "application/json",
          payTo: p.destination,
          requiredDeadlineSeconds: 60,
          invoiceId: p.invoiceId,
          offsetHydroDroplets: p.offsetHydroDroplets,
          estimatedMl: p.estimatedMl ?? 0,
        },
        payload: {
          x402Version: 1,
          scheme: "exact",
          network: "xrpl",
          payload: {
            signature: "xaman-signed-blob",
            authorization: {
              from: account ?? p.destination,
              to: p.destination,
              value: String(p.amountMicros),
              validAfter: "0",
              validBefore: String(now + 300),
              nonce: p.invoiceId,
            },
          },
          xrplSignedTx: hex,
          invoiceId: p.invoiceId,
        },
      }),
    });
    const data: Receipt = await r.json();
    if (!data.success) throw new Error(data.errorReason ?? `settlement failed (HTTP ${r.status})`);
    setReceipt(data);
    setPhase("done");
  }

  function startPolling(p: CreatedPayload) {
    clearPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/xaman/payload/${p.uuid}`);
        const s = await res.json();
        if (s.cancelled) {
          clearPoll();
          setError("Sign request cancelled in Xaman — nothing moved. Try again.");
          setPhase("error");
          return;
        }
        if (s.expired) {
          clearPoll();
          setError("Sign request expired. Click Pay with Xaman to generate a new one.");
          setPhase("error");
          return;
        }
        if (s.signed && s.hex) {
          clearPoll();
          await settle(p, s.hex as string, s.account ?? null);
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_MS);
  }

  async function payWithXaman() {
    setReceipt(null);
    setError("");
    setPayload(null);
    try {
      setPhase("creating");
      const res = await fetch("/api/xaman/payload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "/api/ai/chat" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `failed to create sign request (HTTP ${res.status})`);
      const p = data as CreatedPayload;
      setPayload(p);
      setPriceMicros(p.amountMicros);
      setPhase("awaiting");
      startPolling(p);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  return (
    <div className="glass-strong mt-4 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/rlusd.png" alt="RLUSD" className="h-4 w-4 rounded-full" />
        Pay in RLUSD · native on XRP Ledger
      </div>

      {/* Onboarding */}
      <div className="mt-3 rounded-xl border border-hydro-400/20 bg-hydro-500/5 p-3 text-xs leading-relaxed text-slate-300">
        <p className="font-medium text-hydro-200">
          Pay an AI query&apos;s water bill in <span className="text-hydro-300">RLUSD</span> straight
          from your Xaman wallet — settled natively on the XRP Ledger.
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-400">
          <li>
            Install <span className="text-slate-200">Xaman</span> and hold a little testnet RLUSD
            (trust line + faucet at{" "}
            <a
              href="https://tryrlusd.com"
              target="_blank"
              rel="noreferrer"
              className="text-hydro-300 underline decoration-dotted hover:text-hydro-200"
            >
              tryrlusd.com
            </a>
            ).
          </li>
          <li>Click <span className="text-slate-200">Pay with Xaman</span>, scan the QR (or tap on mobile).</li>
          <li>Approve once → we submit it on XRPL and retire the water credit.</li>
        </ol>
      </div>

      {/* Action */}
      <button
        onClick={payWithXaman}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-hydro-400/40 bg-hydro-500/10 px-3 py-2.5 text-sm font-medium text-hydro-300 transition hover:bg-hydro-500/20 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}
        {phase === "creating" && "Creating sign request…"}
        {phase === "awaiting" && "Waiting for Xaman approval…"}
        {phase === "settling" && "Settling on XRPL…"}
        {(phase === "idle" || phase === "done" || phase === "error") &&
          `Pay with Xaman${rlusdLabel ? ` · ${rlusdLabel}` : ""}`}
      </button>

      {/* QR / deeplink */}
      {phase === "awaiting" && payload && (
        <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-hydro-400/30 bg-ink/60 p-4">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-hydro-200">
            <QrCode size={12} /> Scan with Xaman
          </div>
          {payload.qrPng && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={payload.qrPng}
              alt="Xaman sign request QR"
              className="h-44 w-44 rounded-lg border border-edge bg-white p-1"
            />
          )}
          <a
            href={payload.deeplink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-hydro-400/40 bg-hydro-500/10 px-3 py-1.5 text-xs font-medium text-hydro-300 transition hover:bg-hydro-500/20"
          >
            <Smartphone size={12} /> Open in Xaman <ExternalLink size={11} />
          </a>
        </div>
      )}

      {/* Error */}
      {phase === "error" && error && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Receipt */}
      {phase === "done" && receipt && (
        <div className="mt-3 rounded-xl border border-hydro-400/30 bg-ink/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-hydro-200">
            <CheckCircle2 size={16} className="text-hydro-300" />
            {receipt.duplicate ? "Already settled — original receipt" : "Settled on the XRP Ledger"}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            <span className="font-medium text-slate-200">What just happened:</span> you signed one
            RLUSD payment in Xaman — the treasury swapped it for HYDRO and retired the water credit.
          </p>
          <div className="mt-3 space-y-2 text-xs">
            <ReceiptLink
              label={`Paid ${rlusdLabel ?? "RLUSD"} on XRPL`}
              hint="real testnet RLUSD payment"
              href={receipt.explorerPayment ?? (receipt.paymentTxHash ? `https://testnet.xrpscan.com/tx/${receipt.paymentTxHash}` : null)}
            />
            <ReceiptLink
              label="RLUSD reserve swapped for HYDRO on XRPL AMM"
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
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-amber-300/90">
            ◆ RLUSD → XRPL · testnet · real AMM swap + retire · no real-world value
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
