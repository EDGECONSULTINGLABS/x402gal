"use client";
import { motion } from "framer-motion";
import { XrplHop } from "@/lib/types";
import { ChainBadge } from "./ChainBadge";

const actionLabel: Record<XrplHop["action"], string> = {
  swap: "Swap USDC → HYDRO (XRPL DEX)",
  burn: "Burn HYDRO",
  retire: "Retire HYDRO → water credit (XRPL)",
};

export function RouteTrace({ hops }: { hops: XrplHop[] }) {
  return (
    <div className="space-y-2">
      {hops.map((h, i) => (
        <motion.div
          key={h.hash}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className="flex items-center gap-3 rounded-lg border border-edge bg-panel/60 px-3 py-2"
        >
          <span className="font-mono text-[10px] text-slate-500">{i + 1}</span>
          <ChainBadge chain={h.chain} />
          <span className="text-xs text-slate-300">{actionLabel[h.action]}</span>
          <span className="ml-auto font-mono text-[10px] text-slate-500">
            {h.hash.slice(0, 14)}…
          </span>
          <span className="font-mono text-[10px] text-hydro-300">
            {h.ms.toFixed(0)}ms
          </span>
        </motion.div>
      ))}
    </div>
  );
}
