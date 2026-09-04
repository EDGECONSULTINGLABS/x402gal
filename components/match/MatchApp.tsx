"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cityAmbiguity,
  facilityListLoading,
  facilityNotFound,
  matchAlias,
  outsideMetroDirection,
} from "@/lib/match/aliases";
import {
  facilitiesFrom,
  nearbyFacilities,
  searchFacilityIndex,
  type FacilityIndexEntry,
} from "@/lib/match/facilities";
import {
  DC_COLOR_EXPR,
  STATUSES,
  dcFilterExpr,
  dcMatches,
  dcSitesFrom,
  type DcSite,
  type DcSummary,
  type DcView,
} from "@/lib/match/datacenters";
import {
  CONUS_BBOX,
  FIT_CATEGORIES,
  FIT_COLOR_EXPR,
  bboxOf,
  esgFilterExpr,
  esgMatches,
  esgSitesFrom,
  type BBox,
  type EsgSite,
  type EsgSummary,
  type EsgView,
} from "@/lib/match/esg";
import { findContainingFeature, haversineMeters, loadCollection } from "@/lib/match/geo";
import { LEGAL_LINE } from "@/lib/match/legal";
import { METROS, PENDING_METROS, metroById, metroForPoint, type MetroId } from "@/lib/match/metros";
import {
  HUC_LEVEL_NAME,
  type AquiferHit,
  type FacilityHit,
  type GeoJsonFeatureCollection,
  type HucUnit,
  type SelectedLocation,
  type WatershedHit,
} from "@/lib/match/types";
import { resolveAquifer, resolveWatershed } from "@/lib/match/watershed";
import { DcPanel } from "./DcPanel";
import { EsgPanel } from "./EsgPanel";
import { GlossaryProvider, GlossaryRow, GlossaryTerm } from "./GlossaryTerm";
import { Lockup } from "./Lockup";
import type { NationalPoints } from "./MatchMap";

const MatchMap = dynamic(() => import("./MatchMap").then((m) => m.MatchMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#0d1117]" />,
});

/** "national" is the 50-state view (data centers or ESG companies); the other three are the metro instrument. */
type Step = "place" | "resolved" | "close" | "national";
type NationalLayer = "datacenters" | "esg";

const US = "/match/data/us";
const ESG_DEFAULT_VIEW: EsgView = { fits: FIT_CATEGORIES, st: null, company: null, selectedId: null };
const DC_DEFAULT_VIEW: DcView = { statuses: STATUSES, st: null, operator: null, market: null, selectedId: null };

async function loadJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

/** Where the assessment lands: a representative facility, or the metro center if none loaded. */
export type Handoff = {
  metroId: MetroId;
  lng: number;
  lat: number;
  label: string;
  /** e.g. "About 20 mL a day, estimated." */
  resultLine: string;
};

type Props = {
  /** Assessment CTA. Instrument → loop. */
  onAssess: () => void;
  /** Learn CTA. Shown once the assessment has run. */
  onLearn: () => void;
  assessed: boolean;
  /** e.g. "About 6 mL a day" once the assessment has run. */
  estimateLine?: string | null;
  handoff?: Handoff | null;
  onMetroChosen?: (metroId: MetroId) => void;
  onContext?: (ctx: { metroName: string; subwatershed: string | null }) => void;
};

const FACILITY_INDEX_URL = "/match/data/facilities-index.json";

function metroData(id: MetroId) {
  const base = `/match/data/${id}`;
  return {
    huc12: `${base}/huc12.geojson`,
    huc10: `${base}/huc10.geojson`,
    huc8: `${base}/huc8.geojson`,
    aquifers: `${base}/aquifers.geojson`,
    facilities: `${base}/facilities.geojson`,
    stewardship: `${base}/stewardship.geojson`,
    /** Optional. Only metros with a delivered project footprint have one (Utah). */
    footprint: `${base}/footprint.geojson`,
  };
}

/** One line per footprint feature within the radius: "~307 acres · Stratos Parcel — Hansel Valley Cluster". */
type FootprintNote = { name: string; kind: string; lead: string; precision: string | null; sourceUrl: string | null };

function footprintNotes(col: GeoJsonFeatureCollection | null, lng: number, lat: number, radiusKm: number): FootprintNote[] {
  if (!col) return [];
  const out: FootprintNote[] = [];
  for (const f of col.features) {
    const g = f.geometry;
    if (!g) continue;
    let near = false;
    if (g.type === "Point") {
      const [x, y] = g.coordinates as [number, number];
      near = haversineMeters(lng, lat, x, y) / 1000 <= radiusKm;
    } else if (g.type === "Polygon") {
      const ring = (g.coordinates as [number, number][][])[0] ?? [];
      near = ring.some(([x, y]) => haversineMeters(lng, lat, x, y) / 1000 <= radiusKm);
    }
    if (!near) continue;
    const p = (f.properties ?? {}) as Record<string, unknown>;
    out.push({
      name: String(p.name ?? ""),
      kind: String(p.kind ?? ""),
      lead: String(p.lead ?? ""),
      precision: p.precision ? String(p.precision) : null,
      sourceUrl: p.source_url ? String(p.source_url) : null,
    });
  }
  return out;
}

/** A curated stewardship card (spec §5): exactly these five fields, nothing else. */
type Steward = {
  company: string;
  facility: string;
  sector: string;
  commitment: string;
  sourceUrl: string;
  lng: number;
  lat: number;
  distanceKm: number;
};

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function stewardsFrom(col: GeoJsonFeatureCollection | null, lng: number, lat: number, radiusKm: number): Steward[] {
  if (!col) return [];
  const out: Steward[] = [];
  for (const f of col.features) {
    if (f.geometry?.type !== "Point") continue;
    const [x, y] = f.geometry.coordinates as [number, number];
    const p = (f.properties ?? {}) as Record<string, unknown>;
    const distanceKm = haversineMeters(lng, lat, x, y) / 1000;
    if (distanceKm > radiusKm) continue;
    out.push({
      company: String(p.company ?? ""),
      facility: String(p.facility ?? ""),
      sector: String(p.sector ?? ""),
      commitment: String(p.commitment ?? ""),
      sourceUrl: String(p.source_url ?? ""),
      lng: x,
      lat: y,
      distanceKm,
    });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}

function HucLine({ unit }: { unit: HucUnit | null }) {
  if (!unit) return null;
  return (
    <p className="mt-1 text-[13px] leading-snug">
      <span className="text-[var(--quiet)]">{HUC_LEVEL_NAME[unit.level]}</span>{" "}
      <span>{unit.name}</span>{" "}
      <span className="match-mono text-[12px] text-[var(--quiet)]">HUC{unit.level} {unit.code}</span>
    </p>
  );
}

export function MatchApp({
  onAssess,
  onLearn,
  assessed,
  estimateLine = null,
  handoff = null,
  onMetroChosen,
  onContext,
}: Props) {
  const first = handoff ? metroById(handoff.metroId) : METROS[0];
  const [step, setStep] = useState<Step>(handoff ? "resolved" : "place");
  const [metroId, setMetroId] = useState<MetroId>(first.id);
  const [zoom, setZoom] = useState(handoff ? Math.max(first.zoom, 12.5) : first.zoom);
  const [selected, setSelected] = useState<SelectedLocation>(
    handoff
      ? { lng: handoff.lng, lat: handoff.lat, label: handoff.label, source: "list" }
      : { lng: first.center[0], lat: first.center[1], label: `${first.name} metro center`, source: "metro" }
  );
  const [showHandoff, setShowHandoff] = useState(Boolean(handoff));
  const [radiusKm, setRadiusKm] = useState(25);
  const [showWbd, setShowWbd] = useState(true);
  const [showAquifer, setShowAquifer] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placeMsg, setPlaceMsg] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [panelH, setPanelH] = useState(420);
  const [showAllNeighbors, setShowAllNeighbors] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [huc12, setHuc12] = useState<GeoJsonFeatureCollection | null>(null);
  const [huc10, setHuc10] = useState<GeoJsonFeatureCollection | null>(null);
  const [huc8, setHuc8] = useState<GeoJsonFeatureCollection | null>(null);
  const [aquifers, setAquifers] = useState<GeoJsonFeatureCollection | null>(null);
  const [facilityCol, setFacilityCol] = useState<GeoJsonFeatureCollection | null>(null);
  const [stewardCol, setStewardCol] = useState<GeoJsonFeatureCollection | null>(null);
  const [footprintCol, setFootprintCol] = useState<GeoJsonFeatureCollection | null>(null);
  const [facilityIndex, setFacilityIndex] = useState<FacilityIndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [watershed, setWatershed] = useState<WatershedHit | null>(null);
  const [aquifer, setAquifer] = useState<AquiferHit | null>(null);

  // National views. Each layer loads once, on first entry; nothing national on first paint.
  const [layer, setLayer] = useState<NationalLayer>("datacenters");
  const [esgCol, setEsgCol] = useState<GeoJsonFeatureCollection | null>(null);
  const [esgSummary, setEsgSummary] = useState<EsgSummary | null>(null);
  const [esgError, setEsgError] = useState(false);
  const [esgView, setEsgView] = useState<EsgView>(ESG_DEFAULT_VIEW);
  const [dcCol, setDcCol] = useState<GeoJsonFeatureCollection | null>(null);
  const [dcSummary, setDcSummary] = useState<DcSummary | null>(null);
  const [dcError, setDcError] = useState(false);
  const [dcView, setDcView] = useState<DcView>(DC_DEFAULT_VIEW);

  const metro = metroById(metroId);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const inMetro = step === "resolved" || step === "close";
  const national = step === "national";

  useEffect(() => {
    if (inMetro) onMetroChosen?.(metroId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metroId, inMetro]);

  useEffect(() => {
    if (!national || layer !== "esg" || esgCol || esgError) return;
    let cancelled = false;
    Promise.all([loadCollection(`${US}/esg.geojson`), loadJson<EsgSummary>(`${US}/esg-summary.json`)])
      .then(([col, sum]) => {
        if (cancelled) return;
        setEsgCol(col);
        setEsgSummary(sum);
      })
      .catch(() => {
        if (!cancelled) setEsgError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [national, layer, esgCol, esgError]);

  useEffect(() => {
    if (!national || layer !== "datacenters" || dcCol || dcError) return;
    let cancelled = false;
    Promise.all([loadCollection(`${US}/datacenters.geojson`), loadJson<DcSummary>(`${US}/datacenters-summary.json`)])
      .then(([col, sum]) => {
        if (cancelled) return;
        setDcCol(col);
        setDcSummary(sum);
      })
      .catch(() => {
        if (!cancelled) setDcError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [national, layer, dcCol, dcError]);

  const esgSites: EsgSite[] | null = useMemo(() => (esgCol ? esgSitesFrom(esgCol) : null), [esgCol]);
  const dcSites: DcSite[] | null = useMemo(() => (dcCol ? dcSitesFrom(dcCol) : null), [dcCol]);

  /** Camera for the national view: the lower 48, or the box around whatever is filtered/selected. */
  const nationalBounds: BBox | null = useMemo(() => {
    if (!national) return null;
    if (layer === "esg") {
      if (!esgSites) return CONUS_BBOX;
      if (esgView.selectedId) {
        const s = esgSites.find((x) => x.id === esgView.selectedId);
        if (s) return bboxOf([s]);
      }
      if (esgView.st || esgView.company) return bboxOf(esgSites.filter((s) => esgMatches(s, esgView))) ?? CONUS_BBOX;
      return CONUS_BBOX;
    }
    if (!dcSites) return CONUS_BBOX;
    if (dcView.selectedId) {
      const s = dcSites.find((x) => x.id === dcView.selectedId);
      if (s) return bboxOf([s]);
    }
    if (dcView.st || dcView.operator || dcView.market) return bboxOf(dcSites.filter((s) => dcMatches(s, dcView))) ?? CONUS_BBOX;
    return CONUS_BBOX;
  }, [national, layer, esgSites, esgView, dcSites, dcView]);

  const nationalPoints: NationalPoints | null = useMemo(() => {
    if (!national) return null;
    if (layer === "esg") {
      return {
        data: esgCol,
        color: FIT_COLOR_EXPR,
        filter: { exact: esgFilterExpr(esgView, false), approximate: esgFilterExpr(esgView, true) },
        selectedId: esgView.selectedId,
        onClick: (id) => setEsgView((v) => ({ ...v, selectedId: id })),
      };
    }
    return {
      data: dcCol,
      color: DC_COLOR_EXPR,
      filter: { exact: dcFilterExpr(dcView, false), approximate: dcFilterExpr(dcView, true) },
      selectedId: dcView.selectedId,
      onClick: (id) => setDcView((v) => ({ ...v, selectedId: id })),
    };
  }, [national, layer, esgCol, esgView, dcCol, dcView]);

  useEffect(() => {
    onContext?.({ metroName: metro.name, subwatershed: watershed?.huc12.name ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metro.name, watershed?.huc12.name]);

  useEffect(() => {
    const max = Math.round(window.innerHeight * 0.78);
    const wide = window.innerWidth >= 1024;
    if (step === "close") setPanelH(wide ? max : Math.round(window.innerHeight * 0.56));
    else if (step === "national") setPanelH(wide ? max : Math.round(window.innerHeight * 0.5));
    else setPanelH(wide ? Math.min(560, max) : 480);
    scrollRef.current?.scrollTo(0, 0);
    setShowAllNeighbors(false);
  }, [step]);

  // One metro at a time. Nothing national on first paint.
  useEffect(() => {
    let cancelled = false;
    setHuc12(null);
    setHuc10(null);
    setHuc8(null);
    setAquifers(null);
    setFacilityCol(null);
    setStewardCol(null);
    setFootprintCol(null);
    setWatershed(null);
    setAquifer(null);
    setLoadError(null);
    (async () => {
      try {
        const urls = metroData(metroId);
        const [a12, aq] = await Promise.all([loadCollection(urls.huc12), loadCollection(urls.aquifers)]);
        if (cancelled) return;
        setHuc12(a12);
        setAquifers(aq);
        const [a10, a8, fac, stew, foot] = await Promise.all([
          loadCollection(urls.huc10),
          loadCollection(urls.huc8),
          loadCollection(urls.facilities).catch(() => null),
          loadCollection(urls.stewardship).catch(() => null),
          loadCollection(urls.footprint).catch(() => null),
        ]);
        if (cancelled) return;
        setHuc10(a10);
        setHuc8(a8);
        setFacilityCol(fac);
        setStewardCol(stew);
        setFootprintCol(foot);
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metroId]);

  // The typed-name index loads only when the type field opens.
  useEffect(() => {
    if (!typeOpen || facilityIndex) return;
    let cancelled = false;
    fetch(FACILITY_INDEX_URL)
      .then((r) => (r.ok ? (r.json() as Promise<FacilityIndexEntry[]>) : []))
      .then((rows) => {
        if (!cancelled) setFacilityIndex(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setFacilityIndex([]);
      });
    return () => {
      cancelled = true;
    };
  }, [typeOpen, facilityIndex]);

  const resolveAt = useCallback(
    (lng: number, lat: number) => {
      setWatershed(resolveWatershed(lng, lat, { huc12, huc10, huc8 }));
      setAquifer(resolveAquifer(lng, lat, aquifers));
    },
    [huc12, huc10, huc8, aquifers]
  );

  useEffect(() => {
    if (!huc12) {
      setWatershed(null);
      setAquifer(null);
      return;
    }
    resolveAt(selected.lng, selected.lat);
  }, [huc12, aquifers, selected.lng, selected.lat, resolveAt]);

  const facilities = useMemo(() => facilitiesFrom(facilityCol), [facilityCol]);
  const subwatershedFeature = useMemo(
    () => (huc12 ? findContainingFeature(huc12, selected.lng, selected.lat) : null),
    [huc12, selected.lng, selected.lat]
  );
  const neighbors: FacilityHit[] = useMemo(() => {
    const hits = nearbyFacilities(facilities, selected.lng, selected.lat, radiusKm, subwatershedFeature);
    // The pin itself, when it is a listed facility.
    return selected.source === "list" ? hits.filter((h) => h.distanceKm > 0.02) : hits;
  }, [facilities, selected.lng, selected.lat, selected.source, radiusKm, subwatershedFeature]);
  const sameCount = neighbors.filter((n) => n.sameSubwatershed).length;
  const stewards = useMemo(
    () => stewardsFrom(stewardCol, selected.lng, selected.lat, radiusKm),
    [stewardCol, selected.lng, selected.lat, radiusKm]
  );
  const footprintNear = useMemo(
    () => footprintNotes(footprintCol, selected.lng, selected.lat, radiusKm),
    [footprintCol, selected.lng, selected.lat, radiusKm]
  );

  const applyPlace = (hit: {
    metroId: MetroId;
    lng: number;
    lat: number;
    label: string;
    note?: string;
    zoom?: number;
    source?: SelectedLocation["source"];
  }) => {
    const next = metroById(hit.metroId);
    setMetroId(hit.metroId);
    setZoom(hit.zoom ?? next.zoom);
    setSelected({
      lng: hit.lng,
      lat: hit.lat,
      label: hit.label,
      source: hit.source ?? (hit.zoom ? "geocode" : "metro"),
    });
    // Watershed/aquifer re-resolve from the effect on (layers, lng, lat). Nulling them here
    // left a stale null when the chosen metro and point equal the initial state.
    setPlaceMsg(hit.note ?? null);
    setShowHandoff(false);
    setStep("resolved");
  };

  const pickMetro = (id: MetroId) => {
    const next = metroById(id);
    applyPlace({
      metroId: id,
      lng: next.center[0],
      lat: next.center[1],
      label: `${next.name} metro center`,
    });
  };

  const pickFacility = (lng: number, lat: number, name: string, id?: MetroId) => {
    const hit = id ? metroById(id) : metroForPoint(lng, lat);
    if (!hit) return;
    applyPlace({
      metroId: hit.id,
      lng,
      lat,
      label: name,
      zoom: Math.max(hit.zoom, 12.5),
      source: "list",
    });
  };

  const onMapClick = (lng: number, lat: number) => {
    const hit = metroForPoint(lng, lat);
    if (!hit) {
      setPlaceMsg(outsideMetroDirection());
      return;
    }
    applyPlace({
      metroId: hit.id,
      lng,
      lat,
      label: "Map location",
      zoom: Math.max(hit.zoom, 11),
      source: "map",
    });
  };

  const submitPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    const ambiguous = cityAmbiguity(q);
    if (ambiguous) {
      setPlaceMsg(ambiguous);
      return;
    }
    const local = matchAlias(q);
    if (local) {
      applyPlace(local);
      return;
    }

    const looksLikeName = /^[a-z][a-z0-9 .,'&-]{2,}$/i.test(q) && !/\d{5}/.test(q);
    if (looksLikeName) {
      if (!facilityIndex) {
        setPlaceMsg(facilityListLoading());
        return;
      }
      const hits = searchFacilityIndex(facilityIndex, q);
      if (hits.length) {
        const top = hits[0];
        pickFacility(top.c[0], top.c[1], top.n, top.m);
        if (hits.length > 1) setPlaceMsg(`Showing ${top.n}. ${hits.length - 1} more listed under that name.`);
        return;
      }
      if (q.split(/\s+/).length >= 2 && !/\d/.test(q)) {
        setPlaceMsg(facilityNotFound());
        return;
      }
    }

    setGeocoding(true);
    setPlaceMsg(null);
    try {
      const res = await fetch(`/api/match/geocode?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as {
        results?: { lng: number; lat: number; label: string; metroId: MetroId }[];
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setPlaceMsg(data.error ?? "The address lookup failed. Choose a metro.");
        return;
      }
      const hit = data.results?.[0];
      if (!hit) {
        setPlaceMsg(data.message ?? outsideMetroDirection());
        return;
      }
      applyPlace({ metroId: hit.metroId, lng: hit.lng, lat: hit.lat, label: hit.label, zoom: 12 });
    } catch {
      setPlaceMsg("Address lookup needs a network. Choose a metro — that path is local.");
    } finally {
      setGeocoding(false);
    }
  };

  const onDragStart = (e: React.PointerEvent) => {
    dragRef.current = { startY: e.clientY, startH: panelH };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const max = Math.round(window.innerHeight * 0.72);
    setPanelH(Math.min(max, Math.max(168, dragRef.current.startH + dy)));
  };
  const onDragEnd = () => {
    dragRef.current = null;
  };

  const goPlace = () => {
    setTypeOpen(false);
    setAdjustOpen(false);
    setStep("place");
  };

  const goResolved = () => {
    setAdjustOpen(false);
    setStep("resolved");
  };

  const goNational = (which: NationalLayer) => {
    setTypeOpen(false);
    setAdjustOpen(false);
    setPlaceMsg(null);
    setEsgView(ESG_DEFAULT_VIEW);
    setDcView(DC_DEFAULT_VIEW);
    setLayer(which);
    setStep("national");
    scrollRef.current?.scrollTo(0, 0);
  };

  const aquiferTitle =
    aquifer && aquifer.name.toLowerCase() !== "other rocks"
      ? aquifer.name
      : aquifer
        ? "Not a named principal aquifer"
        : null;

  const visibleNeighbors = showAllNeighbors ? neighbors : neighbors.slice(0, 5);

  return (
    <GlossaryProvider newYorkLesson={metroId === "nyc"}>
      <div className="relative h-[100dvh] overflow-hidden bg-[var(--paper)]">
        <MatchMap
          key={national ? "us" : metroId}
          selected={selected}
          zoom={zoom}
          radiusKm={radiusKm}
          showWbd={showWbd && !national}
          showAquifer={showAquifer && !national}
          huc12={national ? null : huc12}
          aquifers={national ? null : aquifers}
          facilities={inMetro ? facilityCol : null}
          footprint={inMetro ? footprintCol : null}
          selectedHuc12={inMetro ? watershed?.huc12.code ?? null : null}
          showPin={inMetro}
          onMapClick={
            national
              ? () => {
                  setEsgView((v) => ({ ...v, selectedId: null }));
                  setDcView((v) => ({ ...v, selectedId: null }));
                }
              : onMapClick
          }
          onFacilityClick={(lng, lat, name) => pickFacility(lng, lat, name)}
          points={nationalPoints}
          viewBounds={nationalBounds}
        />

        <header className="absolute inset-x-0 top-0 z-20 flex items-center px-3 py-2">
          <div className="match-panel px-2.5 py-1">
            <Lockup size={16} />
          </div>
        </header>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 lg:inset-auto lg:bottom-auto lg:left-4 lg:top-14 lg:w-96 lg:p-0">
          <article
            className="pointer-events-auto match-panel flex flex-col overflow-hidden"
            style={{ height: panelH }}
          >
            <button
              type="button"
              aria-label="Resize panel"
              className="flex h-6 shrink-0 cursor-ns-resize items-center justify-center"
              onPointerDown={onDragStart}
              onPointerMove={onDrag}
              onPointerUp={onDragEnd}
            >
              <span className="block h-0.5 w-10 bg-[var(--ink)]" />
            </button>

            {(step !== "place" || typeOpen) && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ink)]/15 px-4 py-2">
                {typeOpen && step === "place" ? (
                  <button type="button" onClick={() => setTypeOpen(false)} className="text-[13px] text-[var(--water)]">
                    Back to the metro list
                  </button>
                ) : step === "close" ? (
                  <button type="button" onClick={goResolved} className="text-[13px] text-[var(--ink)]">
                    Back to the watershed
                  </button>
                ) : step === "national" ? (
                  <span className="text-[13px] text-[var(--quiet)]">United States</span>
                ) : (
                  <span className="text-[13px] text-[var(--quiet)]">{metro.name}</span>
                )}
                {step !== "place" && (
                  <button type="button" onClick={goPlace} className="text-[13px] text-[var(--water)]">
                    {step === "national" ? "Back to the metros" : "Choose another metro"}
                  </button>
                )}
              </div>
            )}

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {step === "place" && (
                <>
                  <h1 className="text-[1.35rem] font-medium leading-tight">
                    {typeOpen ? "Name a facility or a place" : "Choose a metro"}
                  </h1>
                  <p className="mt-2 max-w-[40ch] text-[14px] leading-relaxed text-[var(--quiet)]">
                    {typeOpen
                      ? "A data center's name, its operator, a city, or a zip inside the metros."
                      : <>The map will show the <GlossaryTerm id="watershed" /> around it. These metros only.</>}
                  </p>
                  {typeOpen ? (
                    <form onSubmit={submitPlace} className="mt-4 flex flex-col gap-3">
                      <div className="flex gap-2">
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Equinix DC2, Ashburn VA, 85003"
                          autoFocus
                          className="match-input min-w-0 flex-1 px-3 py-2 text-[14px]"
                        />
                        <button type="submit" disabled={geocoding} className="match-action px-3 py-2 text-[14px]">
                          Show the watershed
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTypeOpen(false)}
                        className="match-choice w-full px-3 py-2.5 text-left text-[15px]"
                      >
                        Back to the metro list
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="mt-4 flex flex-col gap-2">
                        {METROS.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => pickMetro(m.id)}
                            className="match-choice w-full px-3 py-2.5 text-left text-[15px]"
                          >
                            {m.name}
                          </button>
                        ))}
                        {PENDING_METROS.map((m) => (
                          <div
                            key={m.id}
                            className="match-choice w-full px-3 py-2.5 text-left text-[15px] opacity-60"
                            aria-disabled="true"
                          >
                            {m.name}
                            <span className="mt-0.5 block text-[12px] leading-snug text-[var(--quiet)]">{m.waitingOn}</span>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setTypeOpen(true)} className="mt-3 text-[13px] text-[var(--quiet)]">
                        Or type a facility, city, or zip
                      </button>
                      <p className="mt-5 text-[13px] text-[var(--quiet)]">Or the whole country</p>
                      <div className="mt-2 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => goNational("datacenters")}
                          className="match-choice w-full px-3 py-2.5 text-left text-[15px]"
                        >
                          Every data center, all 50 states
                          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--quiet)]">
                            3,000+ facilities by status. See how many are in your state.
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => goNational("esg")}
                          className="match-choice w-full px-3 py-2.5 text-left text-[15px]"
                        >
                          Companies with water goals
                          <span className="mt-0.5 block text-[12px] leading-snug text-[var(--quiet)]">
                            414 facilities with a published water commitment, coloured by fit.
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                  {placeMsg && <p className="mt-2 text-[13px]">{placeMsg}</p>}
                </>
              )}

              {national && layer === "esg" && (
                <EsgPanel
                  sites={esgSites}
                  summary={esgSummary}
                  view={esgView}
                  onView={setEsgView}
                  loadError={esgError}
                  onSwitchToDc={() => goNational("datacenters")}
                />
              )}
              {national && layer === "datacenters" && (
                <DcPanel
                  sites={dcSites}
                  summary={dcSummary}
                  view={dcView}
                  onView={setDcView}
                  loadError={dcError}
                  onSwitchToEsg={() => goNational("esg")}
                />
              )}

              {step === "resolved" && (
                <>
                  {showHandoff && handoff && (
                    <div className="match-estimated mb-3 p-3">
                      <p className="text-[13px] font-medium">Your AI drinks from here</p>
                      <p className="mt-1 text-[13px] leading-relaxed">
                        {handoff.resultLine} A representative facility in {metro.name}; the boundary below is the ground it draws from.
                      </p>
                    </div>
                  )}
                  <p className="text-[13px] text-[var(--quiet)]">
                    {selected.source === "list" ? selected.label : metro.name}
                  </p>
                  <h1 className="mt-1 text-[1.4rem] font-medium leading-tight">
                    {watershed ? watershed.huc12.name : "No subwatershed at this point"}
                  </h1>
                  <p className="mt-2 max-w-[40ch] text-[14px] leading-relaxed">
                    This is the <GlossaryTerm id="watershed" /> that drains past the pin.
                  </p>
                  {watershed && (
                    <div className="mt-3">
                      <HucLine unit={watershed.huc12} />
                      <HucLine unit={watershed.huc10} />
                      <HucLine unit={watershed.huc8} />
                    </div>
                  )}
                  <p className="match-mono mt-2 text-[12px] text-[var(--quiet)]">
                    {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                  </p>
                  {aquiferTitle && (
                    <p className="mt-3 text-[14px]">
                      <GlossaryTerm id="aquifer" />: {aquiferTitle}
                    </p>
                  )}
                  {placeMsg && <p className="mt-2 text-[13px]">{placeMsg}</p>}

                  <section className="mt-5 border-t border-[var(--ink)]/15 pt-3">
                    <h2 className="text-[14px] font-medium">Data centers nearby</h2>
                    {facilityCol === null ? (
                      <p className="mt-1 text-[13px] text-[var(--quiet)]">Loading the facility list.</p>
                    ) : neighbors.length === 0 ? (
                      <p className="mt-1 text-[13px] text-[var(--quiet)]">
                        None listed within {radiusKm} km. Widen the radius under “Adjust the map.”
                      </p>
                    ) : (
                      <>
                        <p className="mt-1 text-[13px] text-[var(--quiet)]">
                          {neighbors.length} within {radiusKm} km
                          {watershed ? ` · ${sameCount} in this subwatershed` : ""}
                        </p>
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {visibleNeighbors.map((n) => (
                            <li key={`${n.facility.name}|${n.facility.lng}|${n.facility.lat}`}>
                              <button
                                type="button"
                                onClick={() => pickFacility(n.facility.lng, n.facility.lat, n.facility.name, metroId)}
                                className="w-full text-left"
                              >
                                <span className="block text-[14px] leading-snug">{n.facility.name}</span>
                                <span className="block text-[12px] leading-snug text-[var(--quiet)]">
                                  {n.facility.operator ? `${n.facility.operator} · ` : ""}
                                  <span className="match-mono">{formatDistance(n.distanceKm)}</span>
                                  {n.sameSubwatershed ? " · same subwatershed" : ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {neighbors.length > 5 && !showAllNeighbors && (
                          <button type="button" onClick={() => setShowAllNeighbors(true)} className="mt-2 text-[13px] text-[var(--water)]">
                            Show all {neighbors.length}
                          </button>
                        )}
                      </>
                    )}
                  </section>

                  {footprintNear.length > 0 && (
                    <section className="mt-4">
                      <h2 className="text-[14px] font-medium">Project footprint</h2>
                      <ul className="mt-1 flex flex-col gap-1">
                        {footprintNear.map((n) => (
                          <li key={n.name} className="text-[13px] leading-snug">
                            <span>{n.name}</span>
                            <span className="block text-[12px] text-[var(--quiet)]">
                              {n.lead}
                              {n.precision ? ` · ${n.precision}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-1.5 text-[12px] leading-snug text-[var(--quiet)]">
                        Dashed outlines are drawn from a parcel map, not a survey.
                      </p>
                    </section>
                  )}

                  <section className="mt-4">
                    <h2 className="text-[14px] font-medium">Candidate projects</h2>
                    <p className="mt-1 text-[13px] text-[var(--quiet)]">
                      Lists when a project record is marked for public display. None are yet.
                    </p>
                  </section>
                  <section className="mt-3">
                    <h2 className="text-[14px] font-medium">Water stewardship nearby</h2>
                    {stewards.length === 0 ? (
                      <p className="mt-1 text-[13px] text-[var(--quiet)]">
                        {stewardCol
                          ? `No published, quantified water commitment on file within ${radiusKm} km.`
                          : "Loading curated commitments."}
                      </p>
                    ) : (
                      <ul className="mt-2 flex flex-col gap-2">
                        {stewards.map((s) => (
                          <li key={`${s.company}|${s.facility}`} className="match-card p-3">
                            <p className="text-[14px] font-medium leading-snug">{s.company}</p>
                            <p className="text-[12px] text-[var(--quiet)]">
                              {s.facility} · {s.sector} · {formatDistance(s.distanceKm)}
                            </p>
                            <p className="mt-2 text-[13px] leading-relaxed">{s.commitment}</p>
                            <a
                              href={s.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="match-link mt-2 inline-block text-[12px]"
                            >
                              Source: {new URL(s.sourceUrl).hostname.replace(/^www\./, "")}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-2 text-[12px] leading-relaxed text-[var(--quiet)]">
                      Published commitments in the company&apos;s own words. Not a ranking, not a claim about
                      performance.
                    </p>
                  </section>

                  <button
                    type="button"
                    onClick={() => setStep("close")}
                    className="match-action mt-5 w-full px-3 py-2.5 text-[15px]"
                  >
                    What you just saw
                  </button>
                  {showHandoff && (
                    <button type="button" onClick={onLearn} className="match-link mt-2 w-full text-center text-[13px]">
                      Skip ahead: what a verified gallon is
                    </button>
                  )}
                </>
              )}

              {step === "close" && (
                <>
                  <h1 className="text-[1.35rem] font-medium leading-tight">What you just saw</h1>
                  <p className="mt-2 max-w-[40ch] text-[14px] leading-relaxed">
                    {selected.source === "list" ? selected.label : metro.name} sits in{" "}
                    {watershed ? watershed.huc12.name : "an unresolved subwatershed"}.
                  </p>
                  {watershed && (
                    <div className="mt-1">
                      <HucLine unit={watershed.huc12} />
                      <HucLine unit={watershed.huc10} />
                      <HucLine unit={watershed.huc8} />
                    </div>
                  )}
                  {aquiferTitle && (
                    <p className="mt-2 max-w-[40ch] text-[14px]">
                      <GlossaryTerm id="aquifer" /> under the pin: {aquiferTitle}.
                    </p>
                  )}
                  {facilityCol && (
                    <p className="mt-2 max-w-[40ch] text-[14px]">
                      {neighbors.length === 0
                        ? `No listed data center within ${radiusKm} km.`
                        : `${neighbors.length} listed data center${neighbors.length === 1 ? "" : "s"} within ${radiusKm} km${
                            watershed ? `, ${sameCount} sharing this subwatershed` : ""
                          }.`}
                    </p>
                  )}

                  <div className="mt-4 flex flex-col gap-2">
                    <div className="match-measured p-3">
                      <p className="text-[13px] font-medium">Measured</p>
                      <p className="mt-1 text-[13px] leading-relaxed">
                        Supply. <GlossaryTerm id="infiltration" /> after independent review.
                      </p>
                      <p className="mt-2 text-[13px] text-[var(--quiet)]">Waits on a verified gallon.</p>
                    </div>
                    <div className="match-estimated p-3">
                      <p className="text-[13px] font-medium">Estimated</p>
                      <p className="mt-1 text-[13px] leading-relaxed">
                        Demand. A published coefficient, not a meter.
                      </p>
                      <p className="mt-2 text-[13px] text-[var(--quiet)]">
                        {estimateLine ? `${estimateLine}, from your three answers.` : "Run the estimate to see your own number."}
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-[13px] leading-relaxed text-[var(--quiet)]">
                    Facility points come from a street-level geocode of a published address list.
                    Candidate sites list when a record is marked for public display.
                  </p>

                  <div className="mt-4">
                    <p className="mb-1 text-[13px] text-[var(--quiet)]">Terms</p>
                    <GlossaryRow />
                  </div>

                  <div className="mt-5">
                    {assessed ? (
                      <>
                        <button type="button" onClick={onLearn} className="match-action w-full px-3 py-2.5 text-[15px]">
                          Continue: what a verified gallon is
                        </button>
                        <button type="button" onClick={onAssess} className="match-link mt-2 w-full text-center text-[13px]">
                          Redo the estimate
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={onAssess} className="match-action w-full px-3 py-2.5 text-[15px]">
                        Estimate your AI&apos;s water
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-[var(--quiet)]">
                    This summary is local. Nothing here is minted or for sale.
                  </p>
                </>
              )}

              {inMetro && (
                <div className="mt-4 border-t border-[var(--ink)]/20 pt-3">
                  <button type="button" onClick={() => setAdjustOpen((v) => !v)} className="text-[13px] text-[var(--quiet)]">
                    {adjustOpen ? "Hide map controls" : "Adjust the map"}
                  </button>
                  {adjustOpen && (
                    <div className="mt-2">
                      <label className="block text-[13px] text-[var(--quiet)]">
                        Radius
                        <span className="match-mono ml-2 text-[var(--ink)]">{radiusKm} km</span>
                        <input
                          type="range"
                          min={5}
                          max={80}
                          step={5}
                          value={radiusKm}
                          onChange={(e) => setRadiusKm(Number(e.target.value))}
                          className="mt-1 w-full accent-[var(--water)]"
                        />
                      </label>
                      <div className="mt-2 flex gap-4 text-[13px]">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={showWbd} onChange={(e) => setShowWbd(e.target.checked)} />
                          Subwatershed
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={showAquifer} onChange={(e) => setShowAquifer(e.target.checked)} />
                          Aquifer
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {loadError && (
                <p className="mt-3 text-[13px]">The local layer failed to load. Reload the page.</p>
              )}
            </div>

            {/* On every map screen, outside the scroll — the panel can be dragged short, this stays. */}
            <p className="shrink-0 border-t border-[var(--ink)]/15 px-4 py-1.5 text-[11px] leading-snug text-[var(--quiet)]">
              {LEGAL_LINE}
            </p>
          </article>
        </div>
      </div>
    </GlossaryProvider>
  );
}
