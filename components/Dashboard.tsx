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
import { Droplets, Cpu, Zap, ArrowRightLeft, ShieldCheck, Send } from "lucide-react";
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
  amm: {
    priceUSDC: number;
    marketCapUSDC: number;
    circulatingHydro: number;
    retiredHydro: number;
    totalLitersOffset: number;
  };
  totals: { settlements: number; litersOffset: number };
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

  const runDemo = useCallback(async () => {
    setRunning(true);
    setCompletion("");
    setLastSettlement(null);
    try {
      const r = await fetch("/api/demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selected, prompt }),
      });
      const data = await r.json();
      if (data.settlement) setLastSettlement(data.settlement);
      if (data.completion) setCompletion(data.completion);
      await refresh();
    } finally {
      setRunning(false);
    }
  }, [selected, prompt, refresh]);

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
                      label="Paid"
                      value={`${(lastSettlement.amountDrops / DROPS_PER_HYDRO).toFixed(4)} HYDRO`}
                    />
                    <Mini
                      label="Water restored"
                      value={`${lastSettlement.litersOffset.toFixed(3)} L`}
                      accent
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
            <SpecCard />
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
  settlements,
  retired,
  price,
  marketCap,
}: {
  totalLiters: number;
  settlements: number;
  retired: number;
  price: number;
  marketCap: number;
}) {
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
        Agents discover an HTTP <code className="text-hydro-300">402 Payment Required</code> on
        every inference, sign an x402 payload, and route HydroCoin through Wire&rsquo;s Universal
        Transaction Layer to retire a verifiable water-restoration credit — all in under 200ms.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat
          label="Liters restored"
          value={totalLiters.toFixed(2)}
          sub="Audited via Wire UTL"
          accent
        />
        <Stat label="Settlements" value={settlements} sub="x402 round-trips" />
        <Stat
          label="HYDRO retired"
          value={retired.toFixed(3)}
          sub="Permanently out of supply"
        />
        <Stat
          label="Market cap"
          value={`$${(marketCap / 1000).toFixed(1)}k`}
          sub={`@ $${price.toFixed(4)} per HYDRO`}
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
        <div className="col-span-3">Agent</div>
        <div className="col-span-2">Source chain</div>
        <div className="col-span-2">Resource</div>
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
  onRun: () => void;
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

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={onRun}
            disabled={running}
            className="group relative inline-flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-md border border-hydro-500/40 bg-hydro-500/10 px-3 py-2 text-xs font-medium text-hydro-300 transition hover:bg-hydro-500/20 disabled:opacity-60"
          >
            {running ? (
              <>
                <Zap size={14} className="animate-pulse" /> Routing through Wire UTL…
              </>
            ) : (
              <>
                <Send size={14} /> Send 402-paid query
              </>
            )}
            {running && <span className="shimmer absolute inset-0" />}
          </button>
          <button
            onClick={onTopUp}
            className="rounded-md border border-edge bg-panel/60 px-3 py-2 text-xs text-slate-300 hover:border-hydro-500/30"
          >
            +$100 → HYDRO
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

function SpecCard() {
  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
        <Droplets size={14} /> How it works
      </div>
      <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
        <li>
          <span className="text-hydro-300">1.</span> Agent calls{" "}
          <code className="text-slate-200">/api/ai/chat</code>. Server returns{" "}
          <code className="text-hydro-300">402</code> with x402 payment requirements.
        </li>
        <li>
          <span className="text-hydro-300">2.</span> Agent signs a HydroCoin
          payload and retries with <code className="text-slate-200">X-PAYMENT</code>.
        </li>
        <li>
          <span className="text-hydro-300">3.</span> Wire UTL routes the
          payment from the agent&rsquo;s native chain to the Meraxis treasury.
        </li>
        <li>
          <span className="text-hydro-300">4.</span> Equivalent HYDRO is
          retired against a real water-restoration credit. Receipt is on-chain.
        </li>
      </ol>
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
        <span>
          Built for Consensus Hackathon · x402 + Wire UTL + HydroCoin
        </span>
        <span>
          Water cost calibrated to UC Riverside <em>Making AI Less Thirsty</em> (2023)
        </span>
      </div>
    </footer>
  );
}
