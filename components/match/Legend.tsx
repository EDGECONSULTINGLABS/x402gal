"use client";

import { LEGEND_ROWS, type LayerKey, type LayerVisibility, type LegendRow, type Swatch } from "@/lib/match/legend";
import { PAPER, WATER } from "@/lib/match/theme";

/**
 * The legend, same convention as the HydroCoin certification GIS (gis_prototype MapLegend): swatch or
 * line sample on the left, layer name on the right, and the row is the visibility toggle. One
 * control for what is drawn — there is no separate checkbox panel.
 */
type Props = {
  scope: "metro" | "national";
  visibility: LayerVisibility;
  onToggle: (key: LayerKey) => void;
  open: boolean;
  onOpen: (open: boolean) => void;
  /** Rows that have nothing to draw right now (no footprint for this metro, say) are left out. */
  hidden?: LayerKey[];
  /** Current map zoom, so rows below their minimum zoom can say so. */
  zoom?: number;
};

export const LEGEND_WIDTH = 236;

function SwatchGlyph({ swatch }: { swatch: Swatch }) {
  const w = 26;
  const h = 14;
  switch (swatch.kind) {
    case "line":
      return (
        <svg width={w} height={h} aria-hidden>
          <line
            x1="1"
            y1={h / 2}
            x2={w - 1}
            y2={h / 2}
            stroke={swatch.color}
            strokeWidth={Math.max(1.2, swatch.width)}
            strokeLinecap="round"
            strokeDasharray={swatch.dash ? "5 3" : undefined}
          />
        </svg>
      );
    case "fill":
      return (
        <svg width={w} height={h} aria-hidden>
          <rect x="1" y="1" width={w - 2} height={h - 2} rx="2" fill={swatch.color} fillOpacity={0.3} stroke={swatch.stroke} strokeWidth={1.6} />
        </svg>
      );
    case "hatch":
      return (
        <svg width={w} height={h} aria-hidden>
          <defs>
            <pattern id="legend-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke={swatch.color} strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="1" y="1" width={w - 2} height={h - 2} rx="2" fill="url(#legend-hatch)" stroke={swatch.color} strokeWidth={1.2} />
        </svg>
      );
    case "dot":
      return (
        <svg width={w} height={h} aria-hidden>
          <circle cx={w / 2} cy={h / 2} r="5" fill={swatch.color} stroke={swatch.stroke} strokeWidth="1.2" />
        </svg>
      );
    case "ring":
      return (
        <svg width={w} height={h} aria-hidden>
          <circle cx={w / 2} cy={h / 2} r="5" fill="none" stroke={swatch.color} strokeWidth="2.2" />
        </svg>
      );
    case "pin":
      return (
        <svg width={w} height={h} aria-hidden>
          <circle cx={w / 2} cy={h / 2} r="5" fill={PAPER} stroke={WATER} strokeWidth="2.5" />
        </svg>
      );
    case "base":
      return (
        <svg width={w} height={h} aria-hidden>
          <rect x="1" y="1" width={w - 2} height={h - 2} rx="2" fill={swatch.color} stroke="#4b5563" strokeWidth="1" />
        </svg>
      );
  }
}

function Row({ row, on, onToggle, belowZoom }: { row: LegendRow; on: boolean; onToggle: () => void; belowZoom: boolean }) {
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--hc-bg-card-hover)]"
        style={{ opacity: on ? 1 : 0.45 }}
        title={on ? "Tap to hide" : "Tap to show"}
      >
        <span className="shrink-0" style={{ filter: on ? undefined : "grayscale(1)" }}>
          <SwatchGlyph swatch={row.swatch} />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[12.5px]">{row.label}</span>
          {(row.note || belowZoom) && (
            <span className="block truncate text-[10.5px] text-[var(--quiet)]">
              {belowZoom ? `Zoom in past ${row.minZoom} to see it` : row.note}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function Legend({ scope, visibility, onToggle, open, onOpen, hidden = [], zoom }: Props) {
  const rows = LEGEND_ROWS.filter((r) => (r.scope === undefined || r.scope === scope) && !hidden.includes(r.key));
  const ours = rows.filter((r) => !r.key.startsWith("base-"));
  const base = rows.filter((r) => r.key.startsWith("base-"));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpen(true)}
        className="match-panel pointer-events-auto flex items-center gap-2 px-2.5 py-1.5 text-[12.5px]"
        aria-expanded={false}
        aria-controls="match-legend"
      >
        <span className="flex items-center gap-0.5" aria-hidden>
          {ours.slice(0, 3).map((r) => (
            <span
              key={r.key}
              className="block h-2 w-2 rounded-full"
              style={{ background: "color" in r.swatch ? r.swatch.color : WATER }}
            />
          ))}
        </span>
        Legend
      </button>
    );
  }

  return (
    <section
      id="match-legend"
      className="match-panel pointer-events-auto flex max-h-[min(62dvh,560px)] flex-col overflow-hidden"
      style={{ width: LEGEND_WIDTH }}
      aria-label="Legend and layer toggles"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--ink)]/15 px-2.5 py-1.5">
        <span className="text-[12.5px] font-medium">Legend</span>
        <button type="button" onClick={() => onOpen(false)} className="text-[12px] text-[var(--water)]" aria-expanded>
          Hide
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        <ul className="flex flex-col">
          {ours.map((r) => (
            <Row
              key={r.key}
              row={r}
              on={visibility[r.key]}
              onToggle={() => onToggle(r.key)}
              belowZoom={r.minZoom !== undefined && zoom !== undefined && zoom < r.minZoom}
            />
          ))}
        </ul>
        {base.length > 0 && (
          <>
            <p className="mt-1.5 px-1.5 text-[10.5px] uppercase tracking-wide text-[var(--quiet)]">Basemap</p>
            <ul className="flex flex-col">
              {base.map((r) => (
                <Row key={r.key} row={r} on={visibility[r.key]} onToggle={() => onToggle(r.key)} belowZoom={false} />
              ))}
            </ul>
          </>
        )}
      </div>
      <p className="shrink-0 border-t border-[var(--ink)]/15 px-2.5 py-1 text-[10.5px] leading-snug text-[var(--quiet)]">
        Tap a row to hide or show it. Everything drawn is listed here.
      </p>
    </section>
  );
}
