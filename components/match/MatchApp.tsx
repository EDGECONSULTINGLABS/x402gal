"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  matchAlias,
  outsideMetroDirection,
  waitingForFacilityList,
} from "@/lib/match/aliases";
import { loadCollection } from "@/lib/match/geo";
import { METROS, metroById, metroForPoint, type MetroId } from "@/lib/match/metros";
import type {
  AquiferHit,
  GeoJsonFeatureCollection,
  SelectedLocation,
  WatershedHit,
} from "@/lib/match/types";
import { resolveAquifer, resolveWatershed } from "@/lib/match/watershed";
import { GlossaryProvider, GlossaryRow, GlossaryTerm } from "./GlossaryTerm";

const MatchMap = dynamic(() => import("./MatchMap").then((m) => m.MatchMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#1a1a1a]" />,
});

type Step = "place" | "resolved" | "close";

function metroData(id: MetroId) {
  const base = `/match/data/${id}`;
  return {
    huc12: `${base}/huc12.geojson`,
    huc10: `${base}/huc10.geojson`,
    huc8: `${base}/huc8.geojson`,
    huc6: `${base}/huc6.geojson`,
    aquifers: `${base}/aquifers.geojson`,
  };
}

export function MatchApp() {
  const first = METROS[0];
  const [step, setStep] = useState<Step>("place");
  const [metroId, setMetroId] = useState<MetroId>(first.id);
  const [zoom, setZoom] = useState(first.zoom);
  const [selected, setSelected] = useState<SelectedLocation>({
    lng: first.center[0],
    lat: first.center[1],
    label: `${first.name} metro center`,
    source: "metro",
  });
  const [radiusKm, setRadiusKm] = useState(25);
  const [showWbd, setShowWbd] = useState(true);
  const [showAquifer, setShowAquifer] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placeMsg, setPlaceMsg] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [panelH, setPanelH] = useState(420);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [huc12, setHuc12] = useState<GeoJsonFeatureCollection | null>(null);
  const [huc10, setHuc10] = useState<GeoJsonFeatureCollection | null>(null);
  const [huc8, setHuc8] = useState<GeoJsonFeatureCollection | null>(null);
  const [huc6, setHuc6] = useState<GeoJsonFeatureCollection | null>(null);
  const [aquifers, setAquifers] = useState<GeoJsonFeatureCollection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [watershed, setWatershed] = useState<WatershedHit | null>(null);
  const [aquifer, setAquifer] = useState<AquiferHit | null>(null);

  const metro = metroById(metroId);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    const max = Math.round(window.innerHeight * 0.78);
    const wide = window.innerWidth >= 1024;
    if (step === "close") setPanelH(wide ? max : Math.round(window.innerHeight * 0.56));
    else setPanelH(wide ? Math.min(560, max) : 480);
    scrollRef.current?.scrollTo(0, 0);
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    setHuc12(null);
    setHuc10(null);
    setHuc8(null);
    setHuc6(null);
    setAquifers(null);
    setWatershed(null);
    setAquifer(null);
    setLoadError(null);
    (async () => {
      try {
        const urls = metroData(metroId);
        const [a12, aq] = await Promise.all([
          loadCollection(urls.huc12),
          loadCollection(urls.aquifers),
        ]);
        if (cancelled) return;
        setHuc12(a12);
        setAquifers(aq);
        const [a10, a8, a6] = await Promise.all([
          loadCollection(urls.huc10),
          loadCollection(urls.huc8),
          loadCollection(urls.huc6),
        ]);
        if (cancelled) return;
        setHuc10(a10);
        setHuc8(a8);
        setHuc6(a6);
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [metroId]);

  const resolveAt = useCallback(
    (lng: number, lat: number) => {
      setWatershed(resolveWatershed(lng, lat, { huc12, huc10, huc8, huc6 }));
      setAquifer(resolveAquifer(lng, lat, aquifers));
    },
    [huc12, huc10, huc8, huc6, aquifers]
  );

  useEffect(() => {
    if (!huc12) {
      setWatershed(null);
      setAquifer(null);
      return;
    }
    resolveAt(selected.lng, selected.lat);
  }, [huc12, aquifers, selected.lng, selected.lat, resolveAt]);

  const applyPlace = (hit: {
    metroId: MetroId;
    lng: number;
    lat: number;
    label: string;
    note?: string;
    zoom?: number;
  }) => {
    const next = metroById(hit.metroId);
    setMetroId(hit.metroId);
    setZoom(hit.zoom ?? next.zoom);
    setSelected({
      lng: hit.lng,
      lat: hit.lat,
      label: hit.label,
      source: hit.zoom ? "geocode" : "metro",
    });
    setWatershed(null);
    setAquifer(null);
    setPlaceMsg(hit.note ?? null);
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
    });
  };

  const submitPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    const local = matchAlias(q);
    if (local) {
      applyPlace(local);
      return;
    }
    if (/^[a-z][a-z0-9 .,'&-]{3,}$/i.test(q) && !/\d/.test(q) && q.split(/\s+/).length >= 2) {
      setPlaceMsg(waitingForFacilityList());
      return;
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
      applyPlace({
        metroId: hit.metroId,
        lng: hit.lng,
        lat: hit.lat,
        label: hit.label,
        zoom: 12,
      });
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

  const aquiferTitle =
    aquifer && aquifer.name.toLowerCase() !== "other rocks"
      ? aquifer.name
      : aquifer
        ? "Not a named principal aquifer"
        : null;

  return (
    <GlossaryProvider newYorkLesson={metroId === "nyc"}>
      <div className="relative h-[100dvh] overflow-hidden bg-[var(--paper)]">
        <MatchMap
          key={metroId}
          selected={selected}
          zoom={zoom}
          radiusKm={radiusKm}
          showWbd={showWbd}
          showAquifer={showAquifer}
          huc12={huc12}
          aquifers={aquifers}
          selectedHuc12={step === "place" ? null : watershed?.huc12.code ?? null}
          showPin={step !== "place"}
          onMapClick={onMapClick}
        />

        <header className="absolute inset-x-0 top-0 z-20 flex items-center px-3 py-2">
          <p className="match-panel px-2 py-1 text-[13px] font-medium">x402GAL</p>
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
                  <button
                    type="button"
                    onClick={() => setTypeOpen(false)}
                    className="text-[13px] text-[var(--water)]"
                  >
                    Back to the metro list
                  </button>
                ) : step === "close" ? (
                  <button
                    type="button"
                    onClick={goResolved}
                    className="text-[13px] text-[var(--ink)]"
                  >
                    Back to the watershed
                  </button>
                ) : (
                  <span className="text-[13px] text-[var(--quiet)]">{metro.name}</span>
                )}
                {step !== "place" && (
                  <button
                    type="button"
                    onClick={goPlace}
                    className="text-[13px] text-[var(--water)]"
                  >
                    Choose another metro
                  </button>
                )}
              </div>
            )}

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {step === "place" && (
                <>
                  <h1 className="text-[1.35rem] font-medium leading-tight">Choose a metro</h1>
                  <p className="mt-2 max-w-[40ch] text-[14px] leading-relaxed text-[var(--quiet)]">
                    The map will show the <GlossaryTerm id="watershed" /> around it. These metros
                    only.
                  </p>
                  {typeOpen ? (
                    <form onSubmit={submitPlace} className="mt-4 flex flex-col gap-3">
                      <button
                        type="button"
                        onClick={() => setTypeOpen(false)}
                        className="match-choice w-full px-3 py-2.5 text-left text-[15px]"
                      >
                        Back to the metro list
                      </button>
                      <div className="flex gap-2">
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Ashburn VA, 85003, us-east-1"
                        className="min-w-0 flex-1 border border-[var(--ink)] bg-white px-3 py-2 text-[14px] outline-none"
                      />
                      <button type="submit" disabled={geocoding} className="match-action px-3 py-2 text-[14px]">
                        Show the watershed
                      </button>
                      </div>
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
                      </div>
                      <button
                        type="button"
                        onClick={() => setTypeOpen(true)}
                        className="mt-3 text-[13px] text-[var(--quiet)]"
                      >
                        Or type a city or zip
                      </button>
                    </>
                  )}
                  {placeMsg && <p className="mt-2 text-[13px]">{placeMsg}</p>}
                </>
              )}

              {step === "resolved" && (
                <>
                  <p className="text-[13px] text-[var(--quiet)]">{metro.name}</p>
                  <h1 className="mt-1 text-[1.4rem] font-medium leading-tight">
                    {watershed ? watershed.huc12.name : "No watershed at this point"}
                  </h1>
                  <p className="mt-2 max-w-[40ch] text-[14px] leading-relaxed">
                    This is the <GlossaryTerm id="watershed" /> that drains past the pin.
                  </p>
                  {watershed && (
                    <p className="match-mono mt-3 text-[12px] text-[var(--quiet)]">
                      HUC12 {watershed.huc12.code}
                    </p>
                  )}
                  <p className="match-mono mt-1 text-[12px] text-[var(--quiet)]">
                    {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                  </p>
                  {aquiferTitle && (
                    <p className="mt-3 text-[14px]">
                      <GlossaryTerm id="aquifer" />: {aquiferTitle}
                    </p>
                  )}
                  {placeMsg && <p className="mt-2 text-[13px]">{placeMsg}</p>}
                  <button
                    type="button"
                    onClick={() => setStep("close")}
                    className="match-action mt-5 w-full px-3 py-2.5 text-[15px]"
                  >
                    What you just saw
                  </button>
                </>
              )}

              {step === "close" && (
                <>
                  <h1 className="text-[1.35rem] font-medium leading-tight">What you just saw</h1>
                  <p className="mt-2 max-w-[40ch] text-[14px] leading-relaxed">
                    {metro.name} sits in {watershed ? watershed.huc12.name : "an unresolved HUC12"}.
                    {watershed ? (
                      <span className="match-mono block mt-1 text-[12px] text-[var(--quiet)]">
                        HUC12 {watershed.huc12.code}
                      </span>
                    ) : null}
                  </p>
                  {aquiferTitle && (
                    <p className="mt-2 max-w-[40ch] text-[14px]">
                      <GlossaryTerm id="aquifer" /> under the pin: {aquiferTitle}.
                    </p>
                  )}

                  <div className="mt-4 flex flex-col gap-2">
                    <div className="match-measured p-3">
                      <p className="text-[13px] font-medium">Measured</p>
                      <p className="mt-1 text-[13px] leading-relaxed">
                        Supply. <GlossaryTerm id="infiltration" /> after independent review.
                      </p>
                      <p className="mt-2 text-[13px] text-[var(--quiet)]">
                        Waits on a verified gallon.
                      </p>
                    </div>
                    <div className="match-estimated p-3">
                      <p className="text-[13px] font-medium">Estimated</p>
                      <p className="mt-1 text-[13px] leading-relaxed">
                        Demand. A published coefficient, not a meter.
                      </p>
                      <p className="mt-2 text-[13px] text-[var(--quiet)]">
                        Waits on the stewardship layer.
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-[13px] leading-relaxed text-[var(--quiet)]">
                    Nearby facilities will list when the metro file is loaded. Candidate sites will
                    list when a record is marked for public display.
                  </p>

                  <div className="mt-4">
                    <p className="mb-1 text-[13px] text-[var(--quiet)]">Terms</p>
                    <GlossaryRow />
                  </div>

                  <p className="mt-4 text-[13px] leading-relaxed">
                    This summary is local. The payment demonstration needs a network and is a
                    testnet path.
                  </p>
                  <Link href="/console" className="mt-2 inline-block text-[13px] text-[var(--water)]">
                    Open the payment demonstration
                  </Link>
                </>
              )}

              {step !== "place" && (
                <div className="mt-4 border-t border-[var(--ink)]/20 pt-3">
                  <button
                    type="button"
                    onClick={() => setAdjustOpen((v) => !v)}
                    className="text-[13px] text-[var(--quiet)]"
                  >
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
                          <input
                            type="checkbox"
                            checked={showWbd}
                            onChange={(e) => setShowWbd(e.target.checked)}
                          />
                          Watershed
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={showAquifer}
                            onChange={(e) => setShowAquifer(e.target.checked)}
                          />
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
          </article>
        </div>
      </div>
    </GlossaryProvider>
  );
}
