"use client";

import { motion } from "framer-motion";
import { ExternalLink, Droplets, ShieldCheck } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber";

interface Props {
  priceUSDC: number;
  marketCap: number;
  retiredHydro: number;
  circulatingHydro: number;
  totalLitersOffset: number;
}

/** Hero-tier HydroCoin showcase. Links out to hydrocoin.com. */
export function HydroCoinPanel({
  priceUSDC,
  marketCap,
  retiredHydro,
  circulatingHydro,
  totalLitersOffset,
}: Props) {
  const gallons = retiredHydro; // 1 HYDRO == 1 verified gallon

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="neon-edge glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8"
    >
      {/* Sweeping sheen */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-hydro-300/70 to-transparent" />
      </div>

      <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center lg:gap-8">
        {/* ── Coin orb ── */}
        <div className="flex items-center gap-5 lg:col-span-4">
          <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
            <span className="ring-pulse" />
            <span className="ring-pulse" style={{ animationDelay: "0.8s" }} />
            <div className="absolute inset-2 animate-float rounded-full bg-hydro-gradient shadow-glow-lg">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-transparent to-transparent" />
              <div className="absolute inset-3 rounded-full border border-white/30" />
              <Droplets
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-abyss"
                size={32}
                strokeWidth={2.5}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-hydro-200/80">
              <ShieldCheck size={12} /> Settlement asset
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                HydroCoin
              </span>
              <span
                title="HydroCoin is not yet deployed on-chain. AMM, balances, and HYDRO retirements shown here are an in-memory simulation of the constant-product economics."
                className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-200"
              >
                ◆ Simulated
              </span>
            </div>
            <div className="font-mono text-xs text-hydro-300">
              HYDRO · 1 token = 1 verified gallon
            </div>
          </div>
        </div>

        {/* ── Live stats ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-5 lg:grid-cols-4">
          <Tile label="Price" accent>
            <AnimatedNumber value={priceUSDC} decimals={4} prefix="$" />
          </Tile>
          <Tile label="Gallons restored">
            <AnimatedNumber value={gallons} decimals={4} />
          </Tile>
          <Tile label="Liters offset">
            <AnimatedNumber value={totalLitersOffset} decimals={2} suffix=" L" />
          </Tile>
          <Tile label="Market cap">
            <AnimatedNumber
              value={marketCap / 1_000_000}
              decimals={2}
              prefix="$"
              suffix="M"
            />
          </Tile>
        </div>

        {/* ── CTA ── */}
        <div className="flex flex-col gap-2 lg:col-span-3">
          <a
            href="https://www.hydrocoin.com/"
            target="_blank"
            rel="noreferrer"
            className="group relative inline-flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-hydro-400/40 bg-hydro-500/10 px-5 py-3 text-sm font-medium text-hydro-100 transition hover:border-hydro-300 hover:bg-hydro-500/20"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-hydro-300/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative flex items-center gap-2">
              <Droplets size={14} /> Powered by HydroCoin
            </span>
            <ExternalLink size={14} className="relative text-hydro-300" />
          </a>
          <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Backed by Parjana stormwater · XRPL retired
          </div>
          <div className="px-1 font-mono text-[10px] text-slate-500">
            Circulating · {circulatingHydro.toLocaleString(undefined, { maximumFractionDigits: 0 })} HYDRO
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function Tile({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-edge/80 bg-ink/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={`mt-1 font-display text-xl font-semibold ${
          accent ? "text-hydro-300 text-glow" : "text-white"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
