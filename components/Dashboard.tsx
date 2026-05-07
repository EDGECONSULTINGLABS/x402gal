"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Cpu, Zap, ArrowRightLeft, ShieldCheck, Send, Layers, Beaker } from "lucide-react";
import { Logo } from "./Logo";
import { Stat } from "./Stat";
import { ChainBadge } from "./ChainBadge";
import { RouteTrace } from "./RouteTrace";
import { SettlementRow } from "./SettlementRow";
import { Agent, Settlement } from "@/lib/types";
import { DROPS_PER_HYDRO } from "@/lib/constants";

interface State {
  agents: Agent[];
  settlements: Settlement[];
  methodologyHash: string;
  amm: {
    priceUSDC: number;
    marketCapUSDC: number;
    circulatingHydro: number;
    retiredHydro: number;
    totalLitersOffset: number;
  };
  batch: {
    sizeTarget: number;
    pendingCalls: number;
    pendingDrops: number;
    pendingMl: number;
    lastFlushAt: number;
  };
  totals: {
    settlements: number;
    litersOffset: number;
    mlOffset: number;
    callsServed: number;
  };
}

export function Dashboard() {
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState<string>("agent_meridian_v3");
  const [prompt, setPrompt] = useState("How should I price autonomous AI inference?");
  const [running, setRunning] = useState(false);
  const [lastSettlement, setLastSettlement] = useState<Settlement | null>(null);
  const [completion, setCompletion] = useState<string>("");
  const [history, setHistory] = useState<{ t: number; price: number; liters: number }[]>([]);
  const lastIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    const data = (await r.json()) as State;
    setState(data);
    setHistory((h) => {
      const next = [
        ...h,
        { t: Date.now(), price: data.amm.priceUSDC, liters: data.totals.litersOffset },
      ];
      return next.slice(-60);
    });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  // Track which settlements are new for the slide-in highlight.
  useEffect(() => {
    if (!state) return;
    const seen = lastIdsRef.current;
    const ids = new Set(state.settlements.map((s) => s.id));
    lastIdsRef.current = ids;
    // No-op; we read this in render via the previous set.
  }, [state]);

  const runDemo = useCallback(
    async (count: number) => {
      setRunning(true);
      setCompletion("");
      try {
        const r = await fetch("/api/demo/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: selected, prompt, count }),
        });
        const data = await r.json();
        const flushed = (data.flushed_settlements ?? []).filter(Boolean);
        if (flushed.length) setLastSettlement(flushed[flushed.length - 1]);
        if (data.completion) setCompletion(data.completion);
        await refresh();
      } finally {
        setRunning(false);
      }
    },
    [selected, prompt, refresh],
  );

  const flushNow = useCallback(async () => {
    setRunning(true);
    try {
      const r = await fetch("/api/batch/flush", { method: "POST" });
      const data = await r.json();
      if (data.flushed) setLastSettlement(data.flushed);
      await refresh();
    } finally {
      setRunning(false);
    }
  }, [refresh]);

  const topUp = useCallback(async () => {
    await fetch("/api/amm/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: selected, usdc: 100 }),
    });
    await refresh();
  }, [selected, refresh]);

  const selectedAgent = useMemo(
    () => state?.agents.find((a) => a.id === selected),
    [state, selected],
  );

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 gridline opacity-30" />
      <div className="relative mx-auto max-w-7xl px-6 py-8">
        <Header price={state?.amm.priceUSDC} />

        <Hero
          totalLiters={state?.totals.litersOffset ?? 0}
          totalMl={state?.totals.mlOffset ?? 0}
          callsServed={state?.totals.callsServed ?? 0}
          settlements={state?.totals.settlements ?? 0}
          retired={state?.amm.retiredHydro ?? 0}
          price={state?.amm.priceUSDC ?? 0}
          marketCap={state?.amm.marketCapUSDC ?? 0}
        />

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <PriceChart history={history} />
            <SettlementsTable settlements={state?.settlements ?? []} />
          </div>
          <div className="space-y-6">
            <DemoPanel
              agents={state?.agents ?? []}
              selected={selected}
              onSelect={setSelected}
              prompt={prompt}
              onPrompt={setPrompt}
              onRun={runDemo}
              onTopUp={topUp}
              running={running}
              selectedAgent={selectedAgent}
            />
            <BatchPanel batch={state?.batch} onFlush={flushNow} running={running} />
            <AnimatePresence>
              {lastSettlement && (
                <motion.div
                  key={lastSettlement.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="glass rounded-xl p-5"
                >
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
                    <ShieldCheck size={14} /> Wire UTL route
                  </div>
                  <div className="mt-3"><RouteTrace hops={lastSettlement.hops} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <Mini label="UTL hash" value={lastSettlement.wireUtlHash} mono />
                    <Mini label="Retirement receipt" value={lastSettlement.retirementReceipt} mono />
                    <Mini
                      label={`Aggregated calls`}
                      value={`${lastSettlement.callCount.toLocaleString()} \u00d7 \u22480.07 mL`}
                    />
                    <Mini
                      label="Paid"
                      value={`${(lastSettlement.amountDrops / DROPS_PER_HYDRO).toFixed(6)} HYDRO`}
                    />
                    <Mini
                      label="Water restored"
                      value={`${(lastSettlement.litersOffset * 1000).toFixed(2)} mL`}
                      accent
                    />
                    <Mini
                      label="Methodology hash"
                      value={lastSettlement.methodologyHash}
                      mono
                    />
                  </div>
                  {completion && (
                    <div className="mt-4 rounded-md border border-edge bg-ink/60 p-3 text-xs leading-relaxed text-slate-300">
                      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
                        Inference response
                      </div>
                      {completion}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <SpecCard methodologyHash={state?.methodologyHash} />
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

function Header({ price }: { price?: number }) {
  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Logo size={32} />
        <div>
          <div className="text-lg font-semibold tracking-tight">Meraxis</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Water-offset rails for AI agents
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span className="rounded-md border border-edge bg-panel/60 px-3 py-1.5 font-mono text-hydro-300">
          HYDRO ${price ? price.toFixed(4) : "—"}
        </span>
        <a
          href="https://www.x402.org/"
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-edge bg-panel/60 px-3 py-1.5 text-slate-300 hover:border-hydro-500/40"
        >
          x402 spec ↗
        </a>
        <a
          href="https://wire.network"
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-edge bg-panel/60 px-3 py-1.5 text-slate-300 hover:border-hydro-500/40"
        >
          Wire UTL ↗
        </a>
      </div>
    </header>
  );
}

function Hero({
  totalLiters,
  totalMl,
  callsServed,
  settlements,
  retired,
  price,
  marketCap,
}: {
  totalLiters: number;
  totalMl: number;
  callsServed: number;
  settlements: number;
  retired: number;
  price: number;
  marketCap: number;
}) {
  // Headline framing per the v2 spec: a single GPT-4-class call costs ≈0.07 mL.
  // 1 billion calls/day → ~68,000 L → one swimming pool. We surface mL per
  // call up front so the scale story reads correctly.
  const litersDisplay =
    totalLiters >= 0.01 ? `${totalLiters.toFixed(3)} L` : `${totalMl.toFixed(2)} mL`;
  return (
    <section className="mt-10">
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-tight md:text-5xl"
      >
        Every AI query has a{" "}
        <span className="bg-gradient-to-r from-hydro-300 to-hydro-500 bg-clip-text text-transparent">
          water footprint.
        </span>{" "}
        Meraxis settles it in real time.
      </motion.h1>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
        Each inference returns HTTP <code className="text-hydro-300">402 Payment Required</code>{" "}
        with a v2 boundary-aware footprint (Green Grid WUE). The agent signs an x402 payload, micro-payments
        accrue into a 100-call batch, and Wire&rsquo;s Universal Transaction Layer retires HydroCoin
        against a verifiable water-restoration credit.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Water restored"
          value={litersDisplay}
          sub="Audited via Wire UTL"
          accent
        />
        <Stat
          label="Calls served"
          value={callsServed.toLocaleString()}
          sub="≈0.07 mL each (GPT-4 class)"
        />
        <Stat
          label="HYDRO retired"
          value={retired.toFixed(4)}
          sub={`${settlements} Wire UTL settlement${settlements === 1 ? "" : "s"}`}
        />
        <Stat
          label="Market cap"
          value={`$${(marketCap / 1000).toFixed(1)}k`}
          sub={`@ $${price.toFixed(4)} per HYDRO (1 gal)`}
        />
      </div>
    </section>
  );
}

function PriceChart({ history }: { history: { t: number; price: number; liters: number }[] }) {
  const data = history.map((h, i) => ({
    i,
    price: Number(h.price.toFixed(6)),
    liters: Number(h.liters.toFixed(2)),
  }));
  return (
    <div className="glass rounded-xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
            Live offset throughput
          </div>
          <div className="text-sm text-slate-200">
            Cumulative liters restored vs HYDRO price
          </div>
        </div>
        <div className="text-[10px] text-slate-500">refreshed every 2.5s</div>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#0a1018",
                border: "1px solid #142033",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Area
              type="monotone"
              dataKey="liters"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#lg)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SettlementsTable({ settlements }: { settlements: Settlement[] }) {
  return (
    <div className="glass overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <ArrowRightLeft size={14} className="text-hydro-300" />
          <span className="font-medium">Settlement stream</span>
          <span className="text-[10px] text-slate-500">
            x402 → Wire UTL → HYDRO retired
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {settlements.length} recent
        </span>
      </div>
      <div className="grid grid-cols-12 gap-3 border-b border-edge/60 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500">
        <div className="col-span-2">Payer</div>
        <div className="col-span-2">Resource</div>
        <div className="col-span-1">Chain</div>
        <div className="col-span-2 text-right">Calls</div>
        <div className="col-span-2 text-right">Paid</div>
        <div className="col-span-2 text-right">Restored</div>
        <div className="col-span-1 text-right">Age</div>
      </div>
      <div className="max-h-[420px] overflow-auto">
        {settlements.length === 0 && (
          <div className="px-4 py-12 text-center text-xs text-slate-500">
            No settlements yet — kick off the demo on the right.
          </div>
        )}
        <AnimatePresence initial={false}>
          {settlements.map((s, i) => (
            <SettlementRow key={s.id} s={s} isNew={i === 0} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function DemoPanel({
  agents,
  selected,
  onSelect,
  prompt,
  onPrompt,
  onRun,
  onTopUp,
  running,
  selectedAgent,
}: {
  agents: Agent[];
  selected: string;
  onSelect: (id: string) => void;
  prompt: string;
  onPrompt: (s: string) => void;
  onRun: (count: number) => void;
  onTopUp: () => void;
  running: boolean;
  selectedAgent?: Agent;
}) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
        <Cpu size={14} /> Agent console
      </div>
      <div className="mt-4 space-y-3">
        <label className="text-[11px] uppercase tracking-wider text-slate-500">Agent</label>
        <div className="grid grid-cols-1 gap-2">
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
                selected === a.id
                  ? "border-hydro-500/40 bg-hydro-500/10"
                  : "border-edge bg-panel/60 hover:border-hydro-500/20"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-slate-100">{a.label}</span>
                <ChainBadge chain={a.chain} />
              </span>
              <span className="tick text-[11px] text-slate-400">
                {(a.balanceDrops / DROPS_PER_HYDRO).toFixed(2)} HYDRO
              </span>
            </button>
          ))}
        </div>

        <label className="block pt-2 text-[11px] uppercase tracking-wider text-slate-500">
          Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-md border border-edge bg-ink/60 p-3 text-xs text-slate-200 outline-none focus:border-hydro-500/40"
        />

        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRun(1)}
              disabled={running}
              className="group relative inline-flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-md border border-hydro-500/40 bg-hydro-500/10 px-3 py-2 text-xs font-medium text-hydro-300 transition hover:bg-hydro-500/20 disabled:opacity-60"
            >
              {running ? (
                <>
                  <Zap size={14} className="animate-pulse" /> Working…
                </>
              ) : (
                <>
                  <Send size={14} /> Send 1 paid query
                </>
              )}
              {running && <span className="shimmer absolute inset-0" />}
            </button>
            <button
              onClick={() => onRun(100)}
              disabled={running}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-hydro-500/40 bg-hydro-500/15 px-3 py-2 text-xs font-medium text-hydro-300 hover:bg-hydro-500/25 disabled:opacity-60"
            >
              <Layers size={14} /> Burst 100 → flush
            </button>
          </div>
          <button
            onClick={onTopUp}
            className="rounded-md border border-edge bg-panel/60 px-3 py-2 text-xs text-slate-300 hover:border-hydro-500/30"
          >
            +$100 → HYDRO (top up agent wallet)
          </button>
        </div>

        {selectedAgent && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-edge bg-panel/40 p-3 text-[10px]">
            <div>
              <div className="text-slate-500 uppercase tracking-wider">Operator</div>
              <div className="text-slate-200">{selectedAgent.operator}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wider">Queries</div>
              <div className="tick text-slate-200">{selectedAgent.totalQueries}</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wider">Liters offset</div>
              <div className="tick text-hydro-300">
                {selectedAgent.totalLitersOffset.toFixed(2)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SpecCard({ methodologyHash }: { methodologyHash?: string }) {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
        <Beaker size={14} /> Footprint methodology · v2
      </div>
      <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
        <code className="block break-all rounded-md border border-edge bg-ink/60 p-2 font-mono text-[10px] text-hydro-300">
          W_site = WUE × [(T_in/1000)·e_in + (T_out/1000)·e_out] × F_boundary
        </code>
        <p className="text-slate-400">
          Boundary-aware Green Grid WUE v1 split. WUE encodes site cooling already, so
          we don&rsquo;t multiply by a separate cooling factor (avoids double-count). Defaults:{" "}
          <span className="text-slate-200">WUE 0.20 L/kWh</span>,{" "}
          <span className="text-slate-200">e_in 0.0002 kWh/1K</span>,{" "}
          <span className="text-slate-200">e_out 0.0006 kWh/1K</span>.
        </p>
        <p className="text-slate-400">
          Sourced from LBNL 2024 data-center report, Microsoft FY25 / Meta 2024 / AWS 2024
          disclosures, Epoch AI GPT-4o estimate, TokenPowerBench.
        </p>
        {methodologyHash && (
          <div className="rounded-md border border-edge bg-panel/40 p-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              Methodology hash (pinned in 402)
            </div>
            <div className="truncate font-mono text-[10px] text-slate-300">{methodologyHash}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function BatchPanel({
  batch,
  onFlush,
  running,
}: {
  batch?: { sizeTarget: number; pendingCalls: number; pendingDrops: number; pendingMl: number };
  onFlush: () => void;
  running: boolean;
}) {
  const calls = batch?.pendingCalls ?? 0;
  const target = batch?.sizeTarget ?? 100;
  const pct = Math.min(100, (calls / target) * 100);
  const ml = batch?.pendingMl ?? 0;
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
          <Layers size={14} /> Pending batch
        </div>
        <div className="text-[10px] text-slate-500">flushes at {target} calls</div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="tick text-2xl font-semibold text-slate-100">
          {calls}
          <span className="text-sm text-slate-500">/{target}</span>
        </div>
        <div className="tick text-xs text-hydro-300">{ml.toFixed(3)} mL</div>
        <div className="tick ml-auto text-xs text-slate-500">
          {batch?.pendingDrops ?? 0} drops escrow
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-hydro-500 to-hydro-300"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      <button
        onClick={onFlush}
        disabled={running || calls === 0}
        className="mt-3 w-full rounded-md border border-edge bg-panel/60 px-3 py-2 text-xs text-slate-300 hover:border-hydro-500/30 disabled:opacity-50"
      >
        Force Wire UTL settlement now
      </button>
    </div>
  );
}

function Mini({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-edge bg-ink/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={`truncate ${mono ? "font-mono" : ""} ${
          accent ? "text-hydro-300" : "text-slate-200"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-edge pt-6 text-[11px] text-slate-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>Built for Consensus Hackathon · x402 + Wire UTL + HydroCoin</span>
        <span>
          Footprint v2 · Green Grid WUE · LBNL 2024 · Microsoft / Meta / AWS disclosures · Epoch AI
        </span>
      </div>
    </footer>
  );
}
