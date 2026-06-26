"use client";

import { Loader2, Smartphone, LogOut } from "lucide-react";
import { useXaman } from "./XamanProvider";

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

// XRPL (Xaman) sign-in button for the header — sits beside the EVM ConnectButton.
// Hidden entirely when Xaman isn't configured so it never shows a dead control.
export function XamanConnectButton() {
  const { status, account, rlusd, connect, disconnect } = useXaman();

  if (status === "unconfigured" || status === "loading") return null;

  if (status === "connected" && account) {
    return (
      <div className="flex items-center gap-2">
        {rlusd != null && (
          <span className="hidden items-center rounded-lg border border-edge bg-panel/60 px-2.5 py-1.5 font-mono text-[11px] text-slate-300 sm:inline-flex">
            {Number(rlusd).toFixed(2)} RLUSD
          </span>
        )}
        <button
          onClick={disconnect}
          type="button"
          className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-hydro-400/30 bg-hydro-500/10 px-3 py-1.5 text-xs font-medium text-hydro-200 transition active:scale-95 hover:bg-hydro-500/20"
          title="Disconnect Xaman"
        >
          <Smartphone size={14} />
          <span>{shortAddr(account)}</span>
          <LogOut size={12} className="text-slate-400" />
        </button>
      </div>
    );
  }

  const connecting = status === "connecting";

  return (
    <button
      onClick={connect}
      disabled={connecting}
      type="button"
      className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-violet-400/50 bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-200 transition active:scale-95 hover:border-violet-300 hover:bg-violet-500/25 disabled:opacity-60 sm:px-4 sm:py-2.5"
      aria-label="Connect XRPL wallet with Xaman"
    >
      {connecting ? <Loader2 size={16} className="animate-spin" /> : <Smartphone size={16} />}
      <span className="hidden sm:inline">{connecting ? "Connecting…" : "Connect XRPL"}</span>
    </button>
  );
}
