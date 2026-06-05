"use client";

import { useEffect, useState, useCallback } from "react";

interface Agent {
  agentNumber?: string;
  name?: string;
  email?: string;
  company?: string;
  role?: string;
  intent?: string;
  points?: string;
  missions_completed?: string;
  wallet?: string;
  squad?: string;
  capturedAt?: string;
  d365_synced_at?: string;
  funnel_view_entry?: string;
  funnel_view_capture?: string;
  funnel_view_missions?: string;
  funnel_view_badge?: string;
  funnel_abandon_capture?: string;
}

interface FunnelCounts {
  view: Record<string, number>;
  abandon: Record<string, number>;
}

interface LeadsResponse {
  ok: boolean;
  total: number;
  agents: Agent[];
  funnel: FunnelCounts;
  eventId: string;
}

const ROLE_LABEL: Record<string, string> = {
  investor: "Investor",
  builder: "Builder",
  operator: "Operator",
  curious: "Curious",
};

function fmt(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function LeadsPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (s: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/leads?secret=${encodeURIComponent(s)}`);
      const json = await res.json() as LeadsResponse;
      if (!json.ok) { setError("Unauthorized or error — check your secret."); return; }
      setData(json); setAuthed(true);
    } catch (e) {
      setError(String(e));
    } finally { setLoading(false); }
  }, []);

  const syncD365 = async () => {
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch("/api/d365-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-leads-secret": secret },
        body: JSON.stringify({}),
      });
      const json = await res.json() as { ok: boolean; synced: number; failed: number; error?: string };
      setSyncResult(json.ok
        ? `Synced ${json.synced} leads to D365. ${json.failed > 0 ? `${json.failed} failed.` : ""}`
        : `D365 sync error: ${json.error}`);
    } catch (e) { setSyncResult(`Error: ${String(e)}`); }
    finally { setSyncing(false); await load(secret); }
  };

  const filtered = (data?.agents ?? []).filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.name || "").toLowerCase().includes(q) ||
      (a.email || "").toLowerCase().includes(q) ||
      (a.company || "").toLowerCase().includes(q);
  });

  const funnelScreens = ["entry", "capture", "missions", "badge"];

  if (!authed) {
    return (
      <div className="min-h-screen bg-[#000814] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <h1 className="font-mono text-lg text-[#00E5FF] tracking-widest uppercase">INFILTRATE · Leads</h1>
          <input
            type="password"
            placeholder="Enter LEADS_SECRET"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(secret)}
            className="w-full rounded-lg border border-[#00E5FF]/30 bg-[#04162A] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-[#00E5FF]/70"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            onClick={() => load(secret)}
            disabled={loading}
            className="w-full rounded-lg bg-[#00E5FF]/20 border border-[#00E5FF]/40 px-4 py-2.5 text-sm font-semibold text-[#00E5FF] hover:bg-[#00E5FF]/30 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Access"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#000814] text-white p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-mono text-lg text-[#00E5FF] tracking-widest uppercase">INFILTRATE · Leads</h1>
          <p className="text-xs text-slate-500 mt-0.5">{data?.eventId} · {data?.total ?? 0} registered agents</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(secret)} disabled={loading} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button onClick={syncD365} disabled={syncing} className="rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3 py-1.5 text-xs font-semibold text-[#00E5FF] hover:bg-[#00E5FF]/20 disabled:opacity-50">
            {syncing ? "Syncing…" : "Sync → D365"}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="mb-4 rounded-lg border border-[#46E08C]/40 bg-[#46E08C]/10 px-4 py-2 text-sm text-[#46E08C]">
          {syncResult}
        </div>
      )}

      {/* Funnel drop-off */}
      {data?.funnel && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {funnelScreens.map(screen => {
            const views = data.funnel.view[screen] ?? 0;
            const prev = screen === "entry" ? views : (data.funnel.view[funnelScreens[funnelScreens.indexOf(screen) - 1]] || 1);
            const pct = prev > 0 ? Math.round(views / prev * 100) : 0;
            const abandons = data.funnel.abandon[screen] ?? 0;
            return (
              <div key={screen} className="rounded-xl border border-[#00E5FF]/20 bg-[#04162A] p-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-[#00E5FF]/70 mb-1">{screen}</div>
                <div className="text-2xl font-bold text-white">{views.toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-0.5">{pct}% from prev</div>
                {abandons > 0 && <div className="text-xs text-orange-400 mt-1">{abandons} abandoned here</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Search name, email, company…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm mb-4 rounded-lg border border-slate-700 bg-[#04162A] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-[#00E5FF]/50"
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-[#04162A] text-left">
              {["#", "Name", "Email", "Company", "Role", "Points", "Missions", "Wallet", "Captured", "D365"].map(h => (
                <th key={h} className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-500">No agents yet.</td></tr>
            )}
            {filtered.map((a, i) => (
              <tr key={a.email ?? i} className="border-b border-slate-800/60 hover:bg-[#04162A]/60">
                <td className="px-3 py-2.5 font-mono text-[#00E5FF]">{a.agentNumber ? `#${a.agentNumber}` : "—"}</td>
                <td className="px-3 py-2.5 text-white whitespace-nowrap">{a.name || "—"}</td>
                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{a.email || "—"}</td>
                <td className="px-3 py-2.5 text-slate-300 whitespace-nowrap">{a.company || "—"}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-[#00E5FF]/10 px-2 py-0.5 font-mono text-[10px] text-[#00E5FF]">
                    {ROLE_LABEL[a.role || ""] || a.role || "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-white">{a.points || 0}</td>
                <td className="px-3 py-2.5 text-slate-300">{a.missions_completed || "—"}</td>
                <td className="px-3 py-2.5 font-mono text-slate-400 max-w-[100px] truncate" title={a.wallet}>{a.wallet ? a.wallet.slice(0, 12) + "…" : "—"}</td>
                <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">{fmt(a.capturedAt)}</td>
                <td className="px-3 py-2.5">
                  {a.d365_synced_at
                    ? <span className="text-[#46E08C]">✓ {fmt(a.d365_synced_at)}</span>
                    : <span className="text-slate-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Export CSV */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => {
            const headers = ["agentNumber","name","email","company","role","intent","points","missions_completed","wallet","squad","capturedAt","d365_synced_at"];
            const rows = filtered.map(a => headers.map(h => JSON.stringify((a as Record<string,unknown>)[h] ?? "")).join(","));
            const csv = [headers.join(","), ...rows].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `infiltrate-leads-${Date.now()}.csv`; a.click();
          }}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
        >
          ↓ Export CSV
        </button>
      </div>
    </div>
  );
}
