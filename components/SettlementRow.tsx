"use client";
import { motion } from "framer-motion";
import { Settlement } from "@/lib/types";
import { ChainBadge } from "./ChainBadge";
import { DROPS_PER_HYDRO } from "@/lib/constants";

export function SettlementRow({ s, isNew }: { s: Settlement; isNew?: boolean }) {
  const ago = Math.max(0, Math.round((Date.now() - s.createdAt) / 1000));
  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: -8, backgroundColor: "rgba(34,211,238,0.18)" } : false}
      animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
      transition={{ duration: 0.6 }}
      className="grid grid-cols-12 items-center gap-3 border-b border-edge/60 px-4 py-3 text-xs"
    >
      <div className="col-span-3 truncate font-mono text-slate-300">{s.agentId}</div>
      <div className="col-span-2"><ChainBadge chain={s.sourceChain} /></div>
      <div className="col-span-2 truncate text-slate-400">{s.resource}</div>
      <div className="col-span-2 tick text-right text-hydro-300">
        {(s.amountDrops / DROPS_PER_HYDRO).toFixed(3)} HYDRO
      </div>
      <div className="col-span-2 tick text-right text-slate-200">
        {s.litersOffset.toFixed(2)} L
      </div>
      <div className="col-span-1 text-right font-mono text-[10px] text-slate-500">
        {ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`}
      </div>
    </motion.div>
  );
}
