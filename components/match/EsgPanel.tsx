"use client";

import { useMemo, useState } from "react";
import {
  FIT,
  FIT_CATEGORIES,
  esgMatches,
  placementNote,
  sourceHost,
  sourceHref,
  type EsgSite,
  type EsgSummary,
  type EsgView,
  type FitCategory,
} from "@/lib/match/esg";
import { Dot } from "./Dot";

type Props = {
  sites: EsgSite[] | null;
  summary: EsgSummary | null;
  view: EsgView;
  onView: (next: EsgView) => void;
  loadError: boolean;
  /** Hop to the companion national layer. */
  onSwitchToDc: () => void;
};

const LIST_LIMIT = 40;

function FitDot({ fit, hollow = false, size = 10 }: { fit: FitCategory; hollow?: boolean; size?: number }) {
  return <Dot color={FIT[fit].color} hollow={hollow} size={size} />;
}

/**
 * The national view: every facility in the 50-state ESG workbook, coloured by Fit Category.
 * Filters are the workbook's own tabs — Summary by State, Summary by Company, Legend.
 */
export function EsgPanel({ sites, summary, view, onView, loadError, onSwitchToDc }: Props) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (!sites) return [];
    return sites
      .filter((s) => esgMatches(s, view))
      .sort((a, b) => a.state.localeCompare(b.state) || a.company.localeCompare(b.company) || a.facility.localeCompare(b.facility));
  }, [sites, view]);

  const selected = view.selectedId && sites ? sites.find((s) => s.id === view.selectedId) ?? null : null;

  const companyHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!summary || q.length < 2) return [];
    return summary.byCompany.filter((c) => c.company.toLowerCase().includes(q)).slice(0, 8);
  }, [summary, query]);

  const approxCount = filtered.filter((s) => s.placement === "city").length;

  const toggleFit = (f: FitCategory) => {
    const on = view.fits.includes(f);
    const next = on ? view.fits.filter((x) => x !== f) : [...view.fits, f];
    // Never leave the map empty: tapping the last lit category turns everything back on.
    onView({ ...view, fits: next.length ? next : FIT_CATEGORIES, selectedId: null });
  };

  if (loadError) {
    return <p className="mt-3 text-[13px]">The company layer failed to load. Reload the page.</p>;
  }

  return (
    <>
      <h1 className="text-[1.35rem] font-medium leading-tight">Companies with water goals</h1>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-relaxed text-[var(--quiet)]">
        {summary
          ? `${summary.facilities} facilities · ${summary.companies} companies · ${summary.states} states. Coloured by where each company fits.`
          : "Loading the 50-state list."}
      </p>

      {/* Legend tab: tap to filter */}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Fit category">
        {FIT_CATEGORIES.map((f) => {
          const on = view.fits.includes(f);
          const n = summary?.byFit[f] ?? 0;
          return (
            <button
              key={f}
              type="button"
              onClick={() => toggleFit(f)}
              data-selected={on}
              className="match-choice flex items-center gap-1.5 px-2.5 py-1.5 text-[13px]"
              style={{ opacity: on ? 1 : 0.45 }}
              title={FIT[f].meaning}
            >
              <FitDot fit={f} />
              {FIT[f].label}
              <span className="match-mono text-[11px] text-[var(--quiet)]">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Summary by State tab */}
      <label className="mt-3 block text-[13px] text-[var(--quiet)]">
        State
        <select
          value={view.st ?? ""}
          onChange={(e) => onView({ ...view, st: e.target.value || null, company: null, selectedId: null })}
          className="match-input mt-1 w-full px-3 py-2 text-[14px]"
        >
          <option value="">All 50 states</option>
          {summary?.byState.map((s) => (
            <option key={s.st} value={s.st}>
              {s.state} · {s.placed} {s.placed === 1 ? "facility" : "facilities"}, {s.companies} {s.companies === 1 ? "company" : "companies"}
            </option>
          ))}
        </select>
      </label>

      {/* Summary by Company tab */}
      <div className="mt-3 text-[13px] text-[var(--quiet)]">
        <p id="esg-company-label">Company</p>
        {view.company ? (
          <div className="mt-1 flex items-center justify-between gap-2 rounded-[var(--hc-radius-lg)] border border-[var(--hc-border-strong)] px-3 py-2 text-[14px] text-[var(--ink)]">
            <span className="truncate">{view.company}</span>
            <button
              type="button"
              onClick={() => onView({ ...view, company: null, selectedId: null })}
              className="shrink-0 text-[13px] text-[var(--water)]"
            >
              Clear
            </button>
          </div>
        ) : (
          <input
            aria-labelledby="esg-company-label"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Intel, Kimberly-Clark, Ford"
            className="match-input mt-1 w-full px-3 py-2 text-[14px]"
          />
        )}
      </div>
      {!view.company && companyHits.length > 0 && (
        <ul className="mt-1 flex flex-col">
          {companyHits.map((c) => (
            <li key={c.company}>
              <button
                type="button"
                onClick={() => {
                  onView({ ...view, company: c.company, st: null, fits: FIT_CATEGORIES, selectedId: null });
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 px-1 py-1.5 text-left text-[14px]"
              >
                <FitDot fit={c.fit} />
                <span className="min-w-0 flex-1 truncate">{c.company}</span>
                <span className="match-mono shrink-0 text-[11px] text-[var(--quiet)]">
                  {c.facilities} · {c.states.split(",").length} {c.states.includes(",") ? "states" : "state"}
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
              <p className="text-[15px] font-medium leading-snug">{selected.company}</p>
              <p className="text-[13px] leading-snug">{selected.facility}</p>
              <p className="mt-0.5 text-[12px] text-[var(--quiet)]">
                {selected.sector ? `${selected.sector} · ` : ""}
                {selected.city}, {selected.st}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onView({ ...view, selectedId: null })}
              className="shrink-0 text-[13px] text-[var(--water)]"
              aria-label="Close"
            >
              Close
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[13px]">
            <FitDot fit={selected.fit} hollow={selected.placement === "city"} />
            <span>{FIT[selected.fit].label}</span>
            <span className="text-[var(--quiet)]">— {FIT[selected.fit].meaning}</span>
          </p>
          {selected.goal && <p className="mt-2 text-[13px] leading-relaxed">{selected.goal}</p>}
          {sourceHref(selected.source) ? (
            <a
              href={sourceHref(selected.source)!}
              target="_blank"
              rel="noopener noreferrer"
              className="match-link mt-2 inline-block text-[12px]"
            >
              Source: {sourceHost(selected.source)}
            </a>
          ) : selected.source ? (
            <p className="mt-2 text-[12px] text-[var(--quiet)]">Source: {selected.source}</p>
          ) : null}
          {placementNote(selected.placement, selected.city) && (
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--quiet)]">{placementNote(selected.placement, selected.city)}</p>
          )}
        </div>
      )}

      {/* The rows behind the dots */}
      <section className="mt-4 border-t border-[var(--ink)]/15 pt-3">
        <p className="text-[13px] text-[var(--quiet)]">
          {sites
            ? `${filtered.length} ${filtered.length === 1 ? "facility" : "facilities"} shown${approxCount ? ` · ${approxCount} at city centre` : ""}`
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
                <FitDot fit={s.fit} hollow={s.placement === "city"} size={9} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] leading-snug">{s.company}</span>
                  <span className="block truncate text-[12px] leading-snug text-[var(--quiet)]">
                    {s.facility} · {s.city}, {s.st}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {filtered.length > LIST_LIMIT && !showAll && (
          <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[13px] text-[var(--water)]">
            Show all {filtered.length}
          </button>
        )}
      </section>

      <button type="button" onClick={onSwitchToDc} className="match-link mt-4 block text-[13px]">
        See every data center instead →
      </button>

      <p className="mt-3 text-[12px] leading-relaxed text-[var(--quiet)]">
        From the 50-state ESG workbook{summary ? ` (built ${summary.built})` : ""}. Goals are in each company&apos;s
        published words. Fit is our read of where a company could use HydroCoin, Parjana or x402gal — not a claim
        about the company. Hollow rings sit at a city centre because the workbook has no confirmed street address.
      </p>
    </>
  );
}
