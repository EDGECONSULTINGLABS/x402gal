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
import {
  Cpu,
  Zap,
  ArrowRightLeft,
  ShieldCheck,
  Send,
  Layers,
  Beaker,
  Droplets,
  ExternalLink,
  Activity,
  Wallet,
  Map,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "./Logo";
import { ChainBadge } from "./ChainBadge";
import { RouteTrace } from "./RouteTrace";
import { SettlementRow } from "./SettlementRow";
import { WaterBackdrop } from "./WaterBackdrop";
import { HydroCoinPanel } from "./HydroCoinPanel";
import { AnimatedNumber } from "./AnimatedNumber";
import { ConnectButton } from "./ConnectButton";
import { AgentSessionPanel } from "./AgentSessionPanel";
import { OnboardingGuide } from "./OnboardingGuide";
import { useAccount } from "wagmi";
import { Agent, Settlement } from "@/lib/types";
import { DashboardState } from "@/lib/getState";

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
    pendingUsdc: number;
    pendingOffsetDrops: number;
    pendingMl: number;
    lastFlushAt: number;
  };
  totals: {
    settlements: number;
    litersOffset: number;
    mlOffset: number;
    callsServed: number;
  };
  xrpl: {
    live: boolean;
    endpoint: string | null;
    explorerBase: string | null;
  };
}

function useSafeAccount() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAccount();
  } catch {
    return { isConnected: false, address: undefined };
  }
}

export function Dashboard({ initialState }: { initialState?: DashboardState }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { isConnected: walletConnected } = useSafeAccount();
  const isConnected = mounted && walletConnected;
  const [state, setState] = useState<State | null>(initialState ?? null);
  const [selected, setSelected] = useState<string>("agent_meridian_v3");
  const [prompt, setPrompt] = useState(
    "How should I price autonomous AI inference?",
  );
  const [running, setRunning] = useState(false);
  const [lastSettlement, setLastSettlement] = useState<Settlement | null>(null);
  const [completion, setCompletion] = useState<string>("");
  const [history, setHistory] = useState<
    { t: number; price: number; liters: number }[]
  >(() => {
    // Seed with demo data so the chart shows movement on load
    const now = Date.now();
    const seed: { t: number; price: number; liters: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const progress = i / 29;
      seed.push({
        t: now - (29 - i) * 2500,
        price: 1.2 + Math.sin(progress * Math.PI * 2) * 0.08 + progress * 0.05,
        liters: progress * 0.42 + Math.sin(progress * 5) * 0.02,
      });
    }
    return seed;
  });
  const [guideKey, setGuideKey] = useState(0);
  const [forceShowGuide, setForceShowGuide] = useState(false);
  const lastIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    const data = (await r.json()) as State;
    setState(data);
    setHistory((h) => {
      const next = [
        ...h,
        {
          t: Date.now(),
          price: data.amm.priceUSDC,
          liters: data.totals.litersOffset,
        },
      ];
      return next.slice(-60);
    });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (!state) return;
    lastIdsRef.current = new Set(state.settlements.map((s) => s.id));
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

  const handleGuideComplete = () => {
    setForceShowGuide(false);
  };

  const restartGuide = () => {
    localStorage.removeItem("x402gal-guide-completed");
    localStorage.removeItem("x402gal-guide-skipped");
    setForceShowGuide(true);
    setGuideKey(prev => prev + 1); // Force remount
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <WaterBackdrop />
      <OnboardingGuide 
        key={guideKey}
        isConnected={isConnected} 
        onComplete={handleGuideComplete}
        forceShow={forceShowGuide}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1100px] gridline opacity-40" />

      <Nav price={state?.amm.priceUSDC} retired={state?.amm.retiredHydro ?? 0} xrplLive={state?.xrpl.live ?? false} onRestartTour={restartGuide} />

      <main className="relative mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <Hero
          totalLiters={state?.totals.litersOffset ?? 0}
          totalMl={state?.totals.mlOffset ?? 0}
          callsServed={state?.totals.callsServed ?? 0}
          settlements={state?.totals.settlements ?? 0}
          retired={state?.amm.retiredHydro ?? 0}
          onRun={() => runDemo(1)}
          onBurst={() => runDemo(100)}
          running={running}
          isConnected={isConnected}
        />

        <div className="mt-10 sm:mt-14" data-guide="hydrocoin">
          <HydroCoinPanel
            priceUSDC={state?.amm.priceUSDC ?? 0}
            marketCap={state?.amm.marketCapUSDC ?? 0}
            retiredHydro={state?.amm.retiredHydro ?? 0}
            circulatingHydro={state?.amm.circulatingHydro ?? 0}
            totalLitersOffset={state?.totals.litersOffset ?? 0}
          />
        </div>

        {!isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 flex items-center justify-center rounded-2xl border border-hydro-400/20 bg-hydro-500/5 px-6 py-10 text-center"
          >
            <div>
              <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full border border-hydro-400/30 bg-hydro-500/10">
                <Wallet size={22} className="text-hydro-300" />
              </div>
              <p className="text-sm font-medium text-slate-200">Connect your wallet to interact</p>
              <p className="mt-1 text-xs text-slate-500">Send queries, flush batches, and track your agent&apos;s water offset</p>
              <div className="mt-4 flex justify-center">
                <ConnectButton />
              </div>
            </div>
          </motion.div>
        )}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div data-guide="price-chart">
              <PriceChart history={history} />
            </div>
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
            <div data-guide="batch-panel">
              <BatchPanel
                batch={state?.batch}
                onFlush={flushNow}
                running={running}
              />
            </div>
            <div data-guide="methodology">
              <SpecCard methodologyHash={state?.methodologyHash} />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {lastSettlement && (
            <motion.div
              key={lastSettlement.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              data-guide="settlement"
              className="glass-strong mt-6 rounded-2xl p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
                  <ShieldCheck size={14} /> XRPL settlement
                </div>
                <span className="font-mono text-[10px] text-slate-500">
                  {lastSettlement.id}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Quadrant step={1} title="Inference served">
                  <div className="text-xs leading-relaxed text-slate-300">
                    {completion ||
                      "x402-paid completion returned to the agent over HTTP 200."}
                  </div>
                </Quadrant>
                <Quadrant step={2} title={"Batch settled \u00b7 x402 \u2192 XRPL"}>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <Mini
                      label={`Aggregated calls`}
                      value={`${lastSettlement.callCount.toLocaleString()} \u00d7 \u22480.07 mL`}
                    />
                    <Mini
                      label="USDC settled"
                      value={`$${(lastSettlement.usdcSettled / 1_000_000).toFixed(4)}`}
                    />
                    <Mini
                      label="HYDRO retired (XRPL)"
                      value={`${(lastSettlement.amountDrops / 1_000_000).toFixed(6)} HYDRO`}
                    />
                    <Mini
                      label="Water restored"
                      value={`${(lastSettlement.litersOffset * 1000).toFixed(2)} mL`}
                      accent
                    />
                  </div>
                </Quadrant>
                <Quadrant step={3} title={"Swap \u2192 retire on XRPL"}>
                  <RouteTrace hops={lastSettlement.hops} />
                  <div className="mt-3 space-y-2 text-xs">
                    <HashRow label="Swap hash" hash={lastSettlement.settlementHash} explorerBase={state?.xrpl.explorerBase} />
                    <HashRow label="Retirement receipt" hash={lastSettlement.retirementReceipt} explorerBase={state?.xrpl.explorerBase} accent />
                  </div>
                </Quadrant>
                <Quadrant step={4} title="Verifiable water credit">
                  <Mini
                    label="Methodology hash"
                    value={lastSettlement.methodologyHash}
                    mono
                  />
                  <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                    The retirement receipt above is the on-chain proof that the
                    aggregated water footprint was offset. Auditors can re-derive
                    the price independently from the pinned methodology hash.
                  </p>
                </Quadrant>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <Footer />
      </main>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */

function Nav({ price, retired, xrplLive, onRestartTour }: { price?: number; retired: number; xrplLive: boolean; onRestartTour?: () => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-[65] border-b border-edge/60 bg-abyss/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:px-6 lg:px-8">
        {/* Logo — always visible */}
        <div className="flex min-w-0 items-center gap-2">
          <Logo size={28} />
          <div className="min-w-0">
            <div className="font-display text-sm font-semibold tracking-tight">
              x402GAL
            </div>
            <div className="hidden text-[10px] uppercase tracking-[0.18em] text-slate-500 lg:block">
              Water-offset rails for AI agents
            </div>
          </div>
        </div>

        {/* Pills — desktop only */}
        <div className="hidden items-center gap-1.5 xl:flex">
          <Pill>
            <Activity size={10} className="text-hydro-300 animate-pulse" />
            <span className="text-[10px]">HYDRO ${price ? price.toFixed(4) : "—"}</span>
          </Pill>
          <Pill>
            <Droplets size={10} className="text-hydro-300" />
            <span className="text-[10px]">{retired.toFixed(3)} gal</span>
          </Pill>
          {xrplLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[10px] text-amber-300/80">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400/60" />
              sim
            </span>
          )}
        </div>

        {/* Right actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Infiltrate ETHConf — always visible */}
          <a
            href="/infiltrateETHConf2026"
            className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/50 bg-cyan-500/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-300 transition hover:border-cyan-300 hover:bg-cyan-500/20 md:px-3"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-300" />
            </span>
            <span className="hidden sm:inline">Infiltrate ETHConf</span>
            <span className="sm:hidden">Infiltrate</span>
          </a>
          {/* Tour — icon only on mobile, label on md+ */}
          <button
            onClick={onRestartTour}
            className="inline-flex items-center gap-1 rounded-md border border-transparent px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-edge hover:bg-panel/50 hover:text-white"
            aria-label="Restart tour"
          >
            <Map size={11} className="opacity-60" />
            <span className="hidden md:inline">Tour</span>
          </button>
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-md border border-edge bg-panel/60 p-2 text-slate-300 transition hover:border-hydro-400/50 hover:text-white lg:hidden"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {/* Nav links — desktop only */}
          <nav className="hidden items-center gap-0.5 text-[11px] lg:flex">
            <NavLink href="https://www.hydrocoin.com/" highlight>
              HydroCoin
            </NavLink>
            <NavLink href="https://github.com/EDGECONSULTINGLABS/x402gal">
              GitHub
            </NavLink>
          </nav>
          <div className="hidden lg:block">
            <ConnectButton />
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="border-t border-edge/60 bg-abyss/95 px-3 py-4 lg:hidden">
          <nav className="flex flex-col gap-2">
            <MobileNavLink href="https://www.hydrocoin.com/" highlight>
              HydroCoin
            </MobileNavLink>
            <MobileNavLink href="https://github.com/EDGECONSULTINGLABS/x402gal">
              GitHub
            </MobileNavLink>
          </nav>
          <div className="mt-4 border-t border-edge/60 pt-4">
            <ConnectButton />
          </div>
        </div>
      )}
    </header>
  );
}

function Quadrant({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-edge bg-ink/30 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hydro-400/40 bg-hydro-500/10 font-mono text-[10px] text-hydro-300">
          {step}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
          {title}
        </span>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-panel/60 px-2 py-0.5 font-mono text-slate-300">
      {children}
    </span>
  );
}

function NavLink({
  href,
  children,
  highlight,
}: {
  href: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
        highlight
          ? "border border-hydro-400/40 bg-hydro-500/10 text-hydro-200 hover:border-hydro-300 hover:bg-hydro-500/20"
          : "border border-transparent text-slate-300 hover:border-edge hover:bg-panel/50 hover:text-white"
      }`}
    >
      {children}
      <ExternalLink size={11} className="opacity-60" />
    </a>
  );
}

function MobileNavLink({
  href,
  children,
  highlight,
}: {
  href: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm transition ${
        highlight
          ? "border border-hydro-400/40 bg-hydro-500/10 text-hydro-200"
          : "border border-edge/60 bg-panel/40 text-slate-300 hover:border-edge hover:bg-panel/60 hover:text-white"
      }`}
    >
      <span>{children}</span>
      <ExternalLink size={14} className="opacity-60" />
    </a>
  );
}

/* ─────────────────────────────────────────────────────── */

function Hero({
  totalLiters,
  totalMl,
  callsServed,
  settlements,
  retired,
  onRun,
  onBurst,
  running,
  isConnected,
}: {
  totalLiters: number;
  totalMl: number;
  callsServed: number;
  settlements: number;
  retired: number;
  onRun: () => void;
  onBurst: () => void;
  running: boolean;
  isConnected: boolean;
}) {
  const litersDisplay =
    totalLiters >= 0.01
      ? `${totalLiters.toFixed(3)} L`
      : `${totalMl.toFixed(2)} mL`;

  return (
    <section className="relative pt-12 sm:pt-20">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-hydro-400/30 bg-hydro-500/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-hydro-200/90"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-hydro-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-hydro-300" />
        </span>
        x402 · XRPL · HydroCoin
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="display-fluid max-w-5xl text-balance font-display font-semibold text-white"
      >
        Every AI query has a{" "}
        <span className="sheen-text">water footprint.</span>
        <br className="hidden sm:block" />{" "}
        <span className="text-slate-400">x402GAL settles it</span>{" "}
        <span className="text-white">in real time.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="mt-6 max-w-2xl text-balance text-base leading-relaxed text-slate-400 sm:text-lg"
      >
        Each inference returns HTTP{" "}
        <code className="rounded bg-hydro-500/10 px-1.5 py-0.5 font-mono text-sm text-hydro-300">
          402 Payment Required
        </code>{" "}
        with a v2 boundary-aware footprint. The agent signs an x402 payload to
        pay in <span className="font-semibold text-hydro-300">USDC</span>,
        micro-payments accrue into a 100-call batch, the treasury swaps the
        USDC for{" "}
        <span className="font-semibold text-hydro-300">HydroCoin</span> on the
        XRPL DEX and retires it as a verifiable water-restoration credit.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-8 flex flex-wrap items-center gap-3"
      >
        {isConnected ? (
          <>
            <button
              onClick={onRun}
              disabled={running}
              className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-hydro-gradient px-6 py-3 text-sm font-semibold text-abyss shadow-glow-lg transition hover:brightness-110 disabled:opacity-60"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <Send size={14} /> Send 1 paid query
            </button>
            <button
              onClick={onBurst}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-xl border border-hydro-400/40 bg-hydro-500/10 px-5 py-3 text-sm font-medium text-hydro-200 transition hover:border-hydro-300 hover:bg-hydro-500/20 disabled:opacity-60"
            >
              <Layers size={14} /> Burst 100 → flush
            </button>
          </>
        ) : (
          <ConnectButton />
        )}
        <a
          href="https://www.hydrocoin.com/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-400 transition hover:text-hydro-200"
        >
          HydroCoin.com <ExternalLink size={11} />
        </a>
      </motion.div>

      {/* Live metric strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.6 }}
        data-guide="metrics"
        className="mt-8 grid grid-cols-2 gap-2 sm:mt-12 sm:gap-3 md:grid-cols-4"
      >
        <Metric label="Water restored" value={litersDisplay} accent />
        <Metric
          label="Calls served"
          value={callsServed.toLocaleString()}
          sub="≈0.07 mL each"
        />
        <Metric
          label="HYDRO retired"
          value={<AnimatedNumber value={retired} decimals={4} />}
          sub={`${settlements} settlement${settlements === 1 ? "" : "s"}`}
        />
        <Metric label="Verified gallons" value={<AnimatedNumber value={retired} decimals={4} />} sub="1 HYDRO = 1 gallon" accent />
      </motion.div>
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass glass-hover rounded-xl p-4 sm:p-5">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div
        className={`tick mt-2 font-display text-2xl font-semibold sm:text-3xl ${
          accent ? "text-hydro-300 text-glow" : "text-white"
        }`}
      >
        {value}
      </div>
      {sub != null && (
        <div className="mt-1 text-[11px] text-slate-500">{sub}</div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── */

function PriceChart({
  history,
}: {
  history: { t: number; price: number; liters: number }[];
}) {
  const data = history.map((h, i) => ({
    i,
    price: Number(h.price.toFixed(6)),
    liters: Number(h.liters.toFixed(2)),
  }));
  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Live offset throughput
          </div>
          <div className="font-display text-base text-white sm:text-lg">
            Cumulative liters restored
          </div>
        </div>
        <div className="shrink-0 font-mono text-[10px] text-slate-500">
          refreshed every 2.5s
        </div>
      </div>
      <div className="h-40 w-full sm:h-56">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#02060d",
                border: "1px solid #16263d",
                borderRadius: 10,
                fontSize: 12,
                boxShadow: "0 0 30px -10px rgba(34,211,238,0.45)",
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
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-edge px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ArrowRightLeft size={14} className="text-hydro-300" />
          <span className="font-display font-medium text-white">
            Settlement stream
          </span>
          <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">
            x402 → XRPL (USDC→HYDRO swap → retire)
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          {settlements.length} recent
        </span>
      </div>
      <div className="hidden grid-cols-12 gap-3 border-b border-edge/60 px-4 py-2 text-[10px] uppercase tracking-wider text-slate-500 sm:grid">
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
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
        <Cpu size={14} /> Agent console
      </div>
      <div data-guide="agent-session">
        <AgentSessionPanel />
      </div>
      <div className="mt-4 space-y-3" data-guide="agent-section">
        <label className="text-[11px] uppercase tracking-wider text-slate-500">
          Agent
        </label>
        <div className="grid grid-cols-1 gap-2">
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition ${
                selected === a.id
                  ? "border-hydro-400/50 bg-hydro-500/10 shadow-glow-inset"
                  : "border-edge bg-panel/60 hover:border-hydro-500/30 hover:bg-panel"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium text-slate-100">{a.label}</span>
                <ChainBadge chain={a.chain} />
              </span>
              <span className="tick font-mono text-[11px] text-slate-400">
                ${(a.balanceUsdc / 1_000_000).toFixed(2)} USDC
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
          className="w-full resize-none rounded-md border border-edge bg-ink/60 p-3 text-xs text-slate-200 outline-none transition focus:border-hydro-400/50 focus:shadow-glow-inset"
        />

        <div className="flex flex-col gap-2 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onRun(1)}
              disabled={running}
              data-guide="send-query"
              className="group relative inline-flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-md border border-hydro-400/50 bg-hydro-500/15 px-3 py-2 text-xs font-medium text-hydro-200 transition hover:bg-hydro-500/25 disabled:opacity-60"
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
              data-guide="burst-mode"
              className="inline-flex items-center justify-center gap-1 rounded-md border border-hydro-400/50 bg-hydro-500/20 px-3 py-2 text-xs font-medium text-hydro-100 hover:bg-hydro-500/30 disabled:opacity-60"
            >
              <Layers size={14} /> Burst 100 → flush
            </button>
          </div>
          <button
            onClick={onTopUp}
            data-guide="top-up"
            className="rounded-md border border-edge bg-panel/60 px-3 py-2 text-xs text-slate-300 transition hover:border-hydro-500/30 hover:text-white"
          >
            +$100 USDC (top up agent wallet)
          </button>
        </div>

        {selectedAgent && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-edge bg-panel/40 p-3 text-[10px]">
            <div>
              <div className="uppercase tracking-wider text-slate-500">
                Operator
              </div>
              <div className="text-slate-200">{selectedAgent.operator}</div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-slate-500">
                Queries
              </div>
              <div className="tick text-slate-200">
                {selectedAgent.totalQueries}
              </div>
            </div>
            <div>
              <div className="uppercase tracking-wider text-slate-500">
                Liters offset
              </div>
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
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
        <Beaker size={14} /> Footprint methodology · v2
      </div>
      <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
        <code className="block break-all rounded-md border border-edge bg-ink/60 p-2 font-mono text-[10px] text-hydro-300">
          W_site = WUE × [(T_in/1000)·e_in + (T_out/1000)·e_out] × F_boundary
        </code>
        <p className="text-slate-400">
          Boundary-aware Green Grid WUE v1 split. WUE encodes site cooling
          already, so we don&rsquo;t multiply by a separate cooling factor
          (avoids double-count). Defaults:{" "}
          <span className="text-slate-200">WUE 0.20 L/kWh</span>,{" "}
          <span className="text-slate-200">e_in 0.0002 kWh/1K</span>,{" "}
          <span className="text-slate-200">e_out 0.0006 kWh/1K</span>.
        </p>
        <p className="text-slate-400">
          Sourced from LBNL 2024, Microsoft FY25 / Meta 2024 / AWS 2024
          disclosures, Epoch AI GPT-4o estimate, TokenPowerBench.
        </p>
        {methodologyHash && (
          <div className="rounded-md border border-edge bg-panel/40 p-2">
            <div className="text-[9px] uppercase tracking-wider text-slate-500">
              Methodology hash (pinned in 402)
            </div>
            <div className="truncate font-mono text-[10px] text-slate-300">
              {methodologyHash}
            </div>
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
  batch?: {
    sizeTarget: number;
    pendingCalls: number;
    pendingUsdc: number;
    pendingOffsetDrops: number;
    pendingMl: number;
  };
  onFlush: () => void;
  running: boolean;
}) {
  const calls = batch?.pendingCalls ?? 0;
  const target = batch?.sizeTarget ?? 100;
  const pct = Math.min(100, (calls / target) * 100);
  const ml = batch?.pendingMl ?? 0;
  const usdc = (batch?.pendingUsdc ?? 0) / 1_000_000;
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-hydro-300">
          <Layers size={14} /> Pending batch
        </div>
        <div className="font-mono text-[10px] text-slate-500">
          flushes at {target} calls
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <div className="tick font-display text-2xl font-semibold text-white sm:text-3xl">
          {calls}
          <span className="text-base text-slate-500">/{target}</span>
        </div>
        <div className="tick font-mono text-xs text-hydro-300">
          {ml.toFixed(3)} mL
        </div>
        <div className="tick ml-auto font-mono text-xs text-slate-500">
          ${usdc.toFixed(4)} USDC escrow
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-panel">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-hydro-500 via-hydro-400 to-hydro-200 shadow-glow"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      <button
        onClick={onFlush}
        disabled={running || calls === 0}
        className="mt-3 w-full rounded-md border border-edge bg-panel/60 px-3 py-2 text-xs text-slate-300 transition hover:border-hydro-500/40 hover:text-white disabled:opacity-50"
      >
        Settle on XRPL now
      </button>
    </div>
  );
}

function HashRow({
  label,
  hash,
  explorerBase,
  accent,
}: {
  label: string;
  hash: string;
  explorerBase?: string | null;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-edge bg-ink/40 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
        {explorerBase && hash && (
          <a
            href={`${explorerBase}${hash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider border border-hydro-400/30 bg-hydro-500/10 text-hydro-300 hover:bg-hydro-500/20 hover:border-hydro-300 transition"
          >
            View on explorer <ExternalLink size={9} />
          </a>
        )}
      </div>
      <div className={`overflow-x-auto font-mono text-[10px] whitespace-nowrap ${accent ? "text-hydro-300" : "text-slate-200"}`}>
        {hash || "—"}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  mono,
  accent,
  explorerBase,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  explorerBase?: string | null;
}) {
  const inner = (
    <div
      className={`truncate ${mono ? "font-mono" : ""} ${
        accent ? "text-hydro-300" : "text-slate-200"
      } ${explorerBase && mono ? "underline decoration-dotted hover:text-hydro-300 cursor-pointer" : ""}`}
    >
      {value}
    </div>
  );
  return (
    <div className="rounded-md border border-edge bg-ink/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      {explorerBase && mono ? (
        <a href={`${explorerBase}${value}`} target="_blank" rel="noreferrer">
          {inner}
        </a>
      ) : inner}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-edge/60 pt-8 text-[11px] text-slate-500">
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span>
            <span className="text-slate-300">x402GAL</span> · Built for Consensus
            Hackathon Miami 2026 · ECL
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>x402 + XRPL + HydroCoin</span>
          <span className="hidden md:inline text-slate-700">|</span>
          <a
            href="https://www.hydrocoin.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-hydro-300 hover:text-hydro-200"
          >
            HydroCoin.com <ExternalLink size={10} />
          </a>
        </div>
      </div>
      <div className="mt-3 text-[10px] text-slate-600">
        Footprint v2 · Green Grid WUE · LBNL 2024 · Microsoft / Meta / AWS
        disclosures · Epoch AI · methodology pinned per 402 response
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-amber-300/80">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 font-mono uppercase tracking-[0.18em]">
          ◆ Simulated
        </span>
        <span>
          HydroCoin is not yet deployed on-chain. AMM, balances, and HYDRO
          retirements are an in-memory simulation of the XRPL DEX settlement.
          The x402 contract, footprint model, and settlement state machine run for real.
        </span>
      </div>
    </footer>
  );
}
