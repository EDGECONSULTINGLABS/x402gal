"use client";
import { motion } from "framer-motion";
import { Settlement } from "@/lib/types";
import { ChainBadge } from "./ChainBadge";

export function SettlementRow({ s, isNew }: { s: Settlement; isNew?: boolean }) {
  const ago = Math.max(0, Math.round((Date.now() - s.createdAt) / 1000));
  const ml = s.litersOffset * 1000;
  const restored = ml >= 1 ? `${ml.toFixed(1)} mL` : `${ml.toFixed(2)} mL`;
  const usdc = s.usdcSettled / 1_000_000;
  const agoLabel = ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`;
  const agentLabel = s.agentId === "batch" ? "batch" : s.agentId.replace("agent_", "");
  const usdcLabel = usdc >= 1 ? `$${usdc.toFixed(2)}` : `$${usdc.toFixed(4)}`;

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -8, backgroundColor: "rgba(34,211,238,0.18)" } : false}
      animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
      transition={{ duration: 0.6 }}
      className="border-b border-edge/60 px-4 py-2.5 text-xs"
    >
      {/* Mobile: two-line stacked layout */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-slate-300">{agentLabel}</span>
          <ChainBadge chain={s.sourceChain} />
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono">
          <span className="tick text-hydro-300">{usdcLabel}</span>
          <span className="tick text-slate-200">{restored}</span>
          <span className="text-[10px] text-slate-500">{agoLabel}</span>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 md:hidden">
        <span className="truncate text-slate-500">{s.resource}</span>
        <span className="shrink-0 text-slate-500">·</span>
        <span className="tick shrink-0 text-slate-400">
          {s.callCount.toLocaleString()} <span className="text-slate-600">calls</span>
        </span>
      </div>

      {/* Desktop: original grid layout */}
      <div className="hidden grid-cols-12 items-center gap-3 md:grid">
        <div className="col-span-2 truncate font-mono text-slate-300">{agentLabel}</div>
        <div className="col-span-2 truncate text-slate-400">{s.resource}</div>
        <div className="col-span-1"><ChainBadge chain={s.sourceChain} /></div>
        <div className="col-span-2 tick text-right text-slate-200">
          {s.callCount.toLocaleString()} <span className="text-slate-500">calls</span>
        </div>
        <div className="col-span-2 tick text-right text-hydro-300">{usdcLabel}</div>
        <div className="col-span-2 tick text-right text-slate-200">{restored}</div>
        <div className="col-span-1 text-right font-mono text-[10px] text-slate-500">{agoLabel}</div>
      </div>
    </motion.div>
  );
}
