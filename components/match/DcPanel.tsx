"use client";

import { useEffect, useMemo, useState } from "react";
import {
  STATUS,
  STATUSES,
  dcMatches,
  dcPlacementNote,
  isApproximate,
  searchDc,
  type DcSite,
  type DcSummary,
  type DcView,
  type Status,
} from "@/lib/match/datacenters";
import { STATES_BY_NAME, readHomeState, stateByCode, statesInDivision, statesInRegion, writeHomeState } from "@/lib/match/states";
import { Dot } from "./Dot";

type Props = {
  sites: DcSite[] | null;
  summary: DcSummary | null;
  view: DcView;
  onView: (next: DcView) => void;
  loadError: boolean;
  /** Hop to the companion national layer. */
  onSwitchToEsg: () => void;
};

const LIST_LIMIT = 40;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Every data center in the 50-state workbook, coloured by status. Filters are the workbook's tabs
 * (Summary by State, Summary by Operator, Summary by Market) plus a "where do you live" block that
 * answers the first question a stranger asks: how many of these are near me.
 */
export function DcPanel({ sites, summary, view, onView, loadError, onSwitchToEsg }: Props) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [home, setHome] = useState<string | null>(null);

  useEffect(() => {
    setHome(readHomeState());
  }, []);

  const filtered = useMemo(() => {
    if (!sites) return [];
    return sites
      .filter((s) => dcMatches(s, view))
      .sort((a, b) => a.st.localeCompare(b.st) || a.market.localeCompare(b.market) || a.name.localeCompare(b.name));
  }, [sites, view]);

  const selected = view.selectedId && sites ? sites.find((s) => s.id === view.selectedId) ?? null : null;
  const hits = useMemo(() => (sites && !view.operator ? searchDc(sites, query) : []), [sites, query, view.operator]);
  const approxCount = filtered.filter((s) => isApproximate(s.placement)).length;

  const marketsForState = useMemo(() => {
    if (!summary || !view.st) return [];
    return summary.byMarket.filter((m) => m.st === view.st).sort((a, b) => b.listed - a.listed || a.market.localeCompare(b.market));
  }, [summary, view.st]);

  /** Counts for the home-state block, from the workbook's own per-state totals. */
  const homeCounts = useMemo(() => {
    if (!summary || !home) return null;
    const info = stateByCode(home);
    if (!info) return null;
    const row = summary.byState.find((s) => s.st === home);
    const sum = (codes: string[]) => summary.byState.filter((s) => codes.includes(s.st)).reduce((n, s) => n + s.listed, 0);
    const active = row ? row.byStatus.Active + row.byStatus.Expanding : 0;
    const coming = row ? row.byStatus.Building + row.byStatus.Planned : 0;
    return {
      info,
      state: row?.listed ?? 0,
      active,
      coming,
      division: sum(statesInDivision(info.division).map((s) => s.code)),
      region: sum(statesInRegion(info.region).map((s) => s.code)),
    };
  }, [summary, home]);

  const setHomeState = (code: string | null) => {
    setHome(code);
    writeHomeState(code);
  };

  const toggleStatus = (x: Status) => {
    const on = view.statuses.includes(x);
    const next = on ? view.statuses.filter((y) => y !== x) : [...view.statuses, x];
    onView({ ...view, statuses: next.length ? next : STATUSES, selectedId: null });
  };

  if (loadError) return <p className="mt-3 text-[13px]">The data center layer failed to load. Reload the page.</p>;

  return (
    <>
      <h1 className="text-[1.35rem] font-medium leading-tight">Data centers, all 50 states</h1>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-relaxed text-[var(--quiet)]">
        {summary
          ? `${summary.facilities.toLocaleString()} facilities · ${summary.operators} operators. Coloured by status.`
          : "Loading the 50-state list."}
      </p>

      {/* Where do you live */}
      <div className="match-card mt-3 p-3">
        <label className="block text-[13px] text-[var(--quiet)]">
          Where do you live?
          <select
            value={home ?? ""}
            onChange={(e) => setHomeState(e.target.value || null)}
            className="match-input mt-1 w-full px-3 py-2 text-[14px]"
          >
            <option value="">Pick a state</option>
            {STATES_BY_NAME.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {homeCounts && (
          <>
            <p className="mt-2 text-[15px] leading-snug">
              <strong>{plural(homeCounts.state, "data center")}</strong> in {homeCounts.info.name}
              {homeCounts.coming ? (
                <span className="text-[var(--quiet)]">
                  {" "}
                  — {homeCounts.active} operating, {homeCounts.coming} being built or planned
                </span>
              ) : null}
              .
            </p>
            <p className="mt-1 text-[13px] leading-snug text-[var(--quiet)]">
              {homeCounts.division.toLocaleString()} across the {homeCounts.info.division} states ·{" "}
              {homeCounts.region.toLocaleString()} in the {homeCounts.info.region}.
            </p>
            {view.st !== home && (
              <button
                type="button"
                onClick={() => onView({ ...view, st: home, operator: null, market: null, selectedId: null })}
                className="match-action mt-2 w-full px-3 py-2 text-[14px]"
              >
                Show {homeCounts.info.name} on the map
              </button>
            )}
          </>
        )}
      </div>

      {/* Status legend: tap to filter */}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Status">
        {STATUSES.map((x) => {
          const on = view.statuses.includes(x);
          const n = summary?.byStatus[x] ?? 0;
          return (
            <button
              key={x}
              type="button"
              onClick={() => toggleStatus(x)}
              data-selected={on}
              className="match-choice flex items-center gap-1.5 px-2.5 py-1.5 text-[13px]"
              style={{ opacity: on ? 1 : 0.45 }}
              title={STATUS[x].meaning}
            >
              <Dot color={STATUS[x].color} />
              {STATUS[x].label}
              <span className="match-mono text-[11px] text-[var(--quiet)]">{n.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      {/* Summary by State */}
      <label className="mt-3 block text-[13px] text-[var(--quiet)]">
        State
        <select
          value={view.st ?? ""}
          onChange={(e) => onView({ ...view, st: e.target.value || null, market: null, selectedId: null })}
          className="match-input mt-1 w-full px-3 py-2 text-[14px]"
        >
          <option value="">All 50 states</option>
          {summary?.byState.map((s) => (
            <option key={s.st} value={s.st}>
              {s.state} · {s.listed}
            </option>
          ))}
        </select>
      </label>

      {/* Summary by Market, scoped to the state */}
      {view.st && marketsForState.length > 1 && (
        <label className="mt-3 block text-[13px] text-[var(--quiet)]">
          Market
          <select
            value={view.market ?? ""}
            onChange={(e) => onView({ ...view, market: e.target.value || null, selectedId: null })}
            className="match-input mt-1 w-full px-3 py-2 text-[14px]"
          >
            <option value="">All markets in {stateByCode(view.st)?.name ?? view.st}</option>
            {marketsForState.map((m) => (
              <option key={m.market} value={m.market}>
                {m.market} · {m.listed}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Summary by Operator + name search */}
      <div className="mt-3 text-[13px] text-[var(--quiet)]">
        <p id="dc-search-label">Operator or facility</p>
        {view.operator ? (
          <div className="mt-1 flex items-center justify-between gap-2 rounded-[var(--hc-radius-lg)] border border-[var(--hc-border-strong)] px-3 py-2 text-[14px] text-[var(--ink)]">
            <span className="truncate">{view.operator}</span>
            <button
              type="button"
              onClick={() => onView({ ...view, operator: null, selectedId: null })}
              className="shrink-0 text-[13px] text-[var(--water)]"
            >
              Clear
            </button>
          </div>
        ) : (
          <input
            aria-labelledby="dc-search-label"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Equinix, QTS, Ashburn DC2"
            className="match-input mt-1 w-full px-3 py-2 text-[14px]"
          />
        )}
      </div>
      {hits.length > 0 && (
        <ul className="mt-1 flex flex-col">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => {
                  const q = query.trim().toLowerCase();
                  const byOperator = h.operator.toLowerCase().startsWith(q);
                  onView(
                    byOperator
                      ? { ...view, operator: h.operator, st: null, market: null, statuses: STATUSES, selectedId: null }
                      : { ...view, selectedId: h.id }
                  );
                  setQuery("");
                }}
                className="flex w-full items-start gap-2 px-1 py-1.5 text-left text-[14px]"
              >
                <Dot color={STATUS[h.status].color} hollow={isApproximate(h.placement)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{h.name}</span>
                  <span className="block truncate text-[12px] text-[var(--quiet)]">
                    {h.operator} · {h.city}, {h.st}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Selected facility */}
      {selected && (
        <div className="match-card mt-4 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[15px] font-medium leading-snug">{selected.name}</p>
              <p className="text-[13px] leading-snug">{selected.operator}</p>
              <p className="mt-0.5 text-[12px] text-[var(--quiet)]">
                {selected.city}, {selected.st}
                {selected.market && selected.market !== selected.city ? ` · ${selected.market} market` : ""}
              </p>
            </div>
            <button type="button" onClick={() => onView({ ...view, selectedId: null })} className="shrink-0 text-[13px] text-[var(--water)]">
              Close
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[13px]">
            <Dot color={STATUS[selected.status].color} hollow={isApproximate(selected.placement)} />
            <span>{STATUS[selected.status].label}</span>
            {selected.statusRaw && selected.statusRaw !== STATUS[selected.status].label && (
              <span className="text-[var(--quiet)]">— listed as “{selected.statusRaw}”</span>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onView({ ...view, operator: selected.operator, st: null, market: null, statuses: STATUSES, selectedId: null })}
              className="match-link text-[12px]"
            >
              All {selected.operator} sites
            </button>
            {selected.market && (
              <button
                type="button"
                onClick={() => onView({ ...view, st: selected.st, market: selected.market, operator: null, selectedId: null })}
                className="match-link text-[12px]"
              >
                Everything in {selected.market}
              </button>
            )}
          </div>
          {dcPlacementNote(selected) && (
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--quiet)]">{dcPlacementNote(selected)}</p>
          )}
        </div>
      )}

      {/* The rows behind the dots */}
      <section className="mt-4 border-t border-[var(--ink)]/15 pt-3">
        <p className="text-[13px] text-[var(--quiet)]">
          {sites
            ? `${plural(filtered.length, "facility", "facilities")} shown${approxCount ? ` · ${approxCount} at a city or market centre` : ""}`
            : "Loading."}
        </p>
        <ul className="mt-2 flex flex-col gap-1">
          {(showAll ? filtered : filtered.slice(0, LIST_LIMIT)).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onView({ ...view, selectedId: s.id })}
                data-selected={view.selectedId === s.id}
                className="flex w-full items-start gap-2 rounded px-1 py-1 text-left data-[selected=true]:bg-[var(--hc-bg-card-hover)]"
              >
                <Dot color={STATUS[s.status].color} hollow={isApproximate(s.placement)} size={9} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] leading-snug">{s.name}</span>
                  <span className="block truncate text-[12px] leading-snug text-[var(--quiet)]">
                    {s.operator} · {s.city}, {s.st}
                    {s.status !== "Active" ? ` · ${STATUS[s.status].label.toLowerCase()}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {filtered.length > LIST_LIMIT && !showAll && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[13px] text-[var(--water)]">
            Show all {filtered.length.toLocaleString()}
          </button>
        )}
      </section>

      <button type="button" onClick={onSwitchToEsg} className="match-link mt-4 block text-[13px]">
        See companies with published water goals instead →
      </button>

      <p className="mt-3 text-[12px] leading-relaxed text-[var(--quiet)]">
        From the 50-state data center workbook{summary ? ` (built ${summary.built})` : ""}, compiled from public
        directories and operator sites. Hollow rings sit at a city or market centre because the operator does not
        publish the address{summary ? ` (${summary.addressNotPublic} of ${summary.facilities.toLocaleString()})` : ""} or
        it was not confirmed.
      </p>
    </>
  );
}
