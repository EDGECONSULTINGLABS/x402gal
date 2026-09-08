"use client";

import { useEffect, useRef, useState } from "react";
import maplibreImport from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BBox } from "@/lib/match/esg";
import { circlePolygon, emptyCollection, featureBounds, featureContains } from "@/lib/match/geo";
import { ALL_VISIBLE, HUC_MINZOOM, HUC_WIDTH, basemapGroup, type LayerKey, type LayerVisibility } from "@/lib/match/legend";
import { CANDIDATE, HUC10, HUC12, HUC8, INK, PAPER, QUIET, STEWARD, SUBSURFACE, WATER } from "@/lib/match/theme";
import type { GeoJsonFeatureCollection, SelectedLocation } from "@/lib/match/types";

type Maplibre = typeof maplibreImport;
const maplibregl: Maplibre =
  typeof (maplibreImport as unknown as { Map?: unknown }).Map === "function"
    ? maplibreImport
    : ((maplibreImport as unknown as { default: Maplibre }).default ?? maplibreImport);

/**
 * Basemap: a vector style whose hydrography, boundaries, roads and land use are separate layers the
 * legend can switch off (engineering review, Zina, 8 Sep 2026 — "nothing on the map that isn't in
 * the legend"). Dark, because every overlay colour here was chosen against a dark ground. OpenFreeMap
 * serves OpenMapTiles with no key and no quota; if the style or its tiles fail, the map falls back
 * to OSM raster tiles so the demo never shows a black screen.
 */
const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/dark";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function rasterFallback(): maplibreImport.StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [OSM],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

type Props = {
  selected: SelectedLocation;
  zoom: number;
  radiusKm: number;
  /** Legend state. Rows are the toggles; the map only obeys. */
  layers?: LayerVisibility;
  huc12: GeoJsonFeatureCollection | null;
  huc10?: GeoJsonFeatureCollection | null;
  huc8?: GeoJsonFeatureCollection | null;
  aquifers: GeoJsonFeatureCollection | null;
  facilities: GeoJsonFeatureCollection | null;
  /** Curated stewardship points (spec §5). Listed in the panel and drawn here so the legend row is true. */
  stewardship?: GeoJsonFeatureCollection | null;
  /** Candidate project records marked for public display. None yet; the source exists so the row is honest. */
  candidates?: GeoJsonFeatureCollection | null;
  /**
   * A project's footprint where one was delivered (Utah: the Stratos parcels and the spring it
   * applied for). Polygons draw as outlines only — they are digitized, not surveyed.
   */
  footprint?: GeoJsonFeatureCollection | null;
  selectedHuc12: string | null;
  showPin?: boolean;
  /** Extra right-hand camera padding in px while the legend is open, so it never covers the fitted polygon. */
  legendPad?: number;
  onMapClick: (lng: number, lat: number) => void;
  /** Live camera zoom after each move, so the legend can say which levels are drawn right now. */
  onZoomChange?: (zoom: number) => void;
  /** A listed facility was tapped. Name is the facility's `name` property. */
  onFacilityClick?: (lng: number, lat: number, name: string) => void;
  /**
   * A national point layer (ESG companies or data centers). The caller supplies the colour and
   * filter expressions; the map only knows that features have an `id` and that the `approximate`
   * filter selects the ones to draw as hollow rings.
   */
  points?: NationalPoints | null;
  /** When set, the camera fits this box instead of centring on `selected`. */
  viewBounds?: BBox | null;
};

export type NationalPoints = {
  data: GeoJsonFeatureCollection | null;
  /** MapLibre `match` expression → colour. */
  color: unknown[];
  /** Filters for the two sub-layers; each must already include the exact/approximate split. */
  filter: { exact: unknown[]; approximate: unknown[] };
  selectedId: string | null;
  onClick?: (id: string) => void;
};

const asExpr = (e: unknown[]) => e as unknown as maplibreImport.ExpressionSpecification;
const asFilter = (e: unknown[]) => e as unknown as maplibreImport.FilterSpecification;
const NONE: unknown[] = ["==", ["get", "id"], ""];

/** Our GeoJSON types are structural and narrower than maplibre's; the shape is identical. */
type MlGeoJson = Parameters<maplibreImport.GeoJSONSource["setData"]>[0];
const asMl = (data: GeoJsonFeatureCollection) => data as unknown as MlGeoJson;

function setSourceData(map: maplibreImport.Map, id: string, data: GeoJsonFeatureCollection) {
  const source = map.getSource(id) as maplibreImport.GeoJSONSource | undefined;
  source?.setData(asMl(data));
}

function applySelectedFilter(map: maplibreImport.Map, code: string | null) {
  if (!map.getLayer("huc12-selected-fill")) return;
  const value = code ?? "";
  map.setFilter("huc12-selected-fill", ["==", ["get", "huc12"], value]);
  map.setFilter("huc12-selected-line", ["==", ["get", "huc12"], value]);
}

/** Layer ids behind each legend row, for the rows we draw ourselves. Basemap rows are matched by source-layer. */
const OVERLAY_IDS: Partial<Record<LayerKey, string[]>> = {
  huc8: ["huc8-line"],
  huc10: ["huc10-line"],
  huc12: ["huc12-line"],
  selected: ["huc12-selected-fill", "huc12-selected-line"],
  aquifer: ["aquifers-fill", "aquifers-line"],
  facilities: ["facilities-circle"],
  candidates: ["candidates-ring"],
  stewardship: ["stewardship-circle"],
  footprint: ["footprint-line", "footprint-fill", "footprint-source"],
  radius: ["radius-fill", "radius-line"],
  pin: ["pin-circle"],
  national: ["national-approx", "national-dot", "national-selected"],
};

const OVERLAY_SOURCES = new Set([
  "aquifers", "huc8", "huc10", "huc12", "radius", "facilities", "stewardship", "candidates", "footprint", "pin", "national",
]);

function applyVisibility(map: maplibreImport.Map, vis: LayerVisibility) {
  const set = (id: string, on: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  for (const [key, ids] of Object.entries(OVERLAY_IDS) as [LayerKey, string[]][]) {
    for (const id of ids) set(id, vis[key]);
  }
  // Basemap layers, grouped by what the line is. The raster fallback has one layer and no groups.
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type === "background" || layer.type === "raster") continue;
    if ("source" in layer && OVERLAY_SOURCES.has(String(layer.source))) continue;
    const group = basemapGroup("source-layer" in layer ? layer["source-layer"] : undefined);
    if (group) set(layer.id, vis[group]);
  }
}

/** Diagonal hatch for the aquifer fill — the certification GIS convention for a subsurface unit. */
function hatchImage(color: string): ImageData | null {
  if (typeof document === "undefined") return null;
  // 28 device px at pixelRatio 2 = a 14 css-px stripe spacing: readable as a hatch, quiet enough
  // that a basin-fill aquifer under a whole metro (Utah, Phoenix) does not shout over the lines.
  const size = 28;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = "square";
  ctx.beginPath();
  // Two strokes so the tile joins seamlessly at the edges.
  ctx.moveTo(-size / 2, size);
  ctx.lineTo(size, -size / 2);
  ctx.moveTo(size / 2, size * 1.5);
  ctx.lineTo(size * 1.5, size / 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** The first basemap label layer — our fills and lines slot in under it so place names stay legible. */
function firstSymbolLayer(map: maplibreImport.Map): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
}

function addOverlayLayers(map: maplibreImport.Map) {
  if (map.getSource("aquifers")) return;
  for (const id of OVERLAY_SOURCES) map.addSource(id, { type: "geojson", data: asMl(emptyCollection()) });

  if (!map.hasImage("aquifer-hatch")) {
    const img = hatchImage(SUBSURFACE);
    if (img) map.addImage("aquifer-hatch", img, { pixelRatio: 2 });
  }

  const under = firstSymbolLayer(map);
  const area = (layer: maplibreImport.AddLayerObject) => map.addLayer(layer, under);

  const aquiferFilter: maplibreImport.FilterSpecification = ["all", ["has", "AQ_NAME"], ["!=", ["get", "AQ_NAME"], "Other rocks"]];
  area({
    id: "aquifers-fill",
    type: "fill",
    source: "aquifers",
    filter: aquiferFilter,
    paint: map.hasImage("aquifer-hatch")
      ? { "fill-pattern": "aquifer-hatch", "fill-opacity": 0.4 }
      : { "fill-color": SUBSURFACE, "fill-opacity": 0.22 },
  });
  area({
    id: "aquifers-line",
    type: "line",
    source: "aquifers",
    filter: aquiferFilter,
    paint: { "line-color": SUBSURFACE, "line-width": 1.2, "line-opacity": 0.9 },
  });

  // The selected HUC12 keeps its fill; every other unit is outline only.
  area({
    id: "huc12-selected-fill",
    type: "fill",
    source: "huc12",
    filter: ["==", ["get", "huc12"], ""],
    paint: { "fill-color": HUC12, "fill-opacity": 0 },
  });
  // Three nested levels, three hues, coarser = heavier, revealed as you zoom in.
  area({
    id: "huc12-line",
    type: "line",
    source: "huc12",
    minzoom: HUC_MINZOOM.huc12,
    paint: { "line-color": HUC12, "line-width": HUC_WIDTH.huc12, "line-opacity": 0.85 },
  });
  area({
    id: "huc10-line",
    type: "line",
    source: "huc10",
    minzoom: HUC_MINZOOM.huc10,
    paint: { "line-color": HUC10, "line-width": HUC_WIDTH.huc10, "line-opacity": 0.9 },
  });
  area({
    id: "huc8-line",
    type: "line",
    source: "huc8",
    minzoom: HUC_MINZOOM.huc8,
    paint: { "line-color": HUC8, "line-width": HUC_WIDTH.huc8, "line-opacity": 0.95 },
  });
  area({
    id: "huc12-selected-line",
    type: "line",
    source: "huc12",
    filter: ["==", ["get", "huc12"], ""],
    paint: {
      "line-color": HUC12,
      "line-width": 3,
      "line-dasharray": [0, 4],
    },
  });
  area({
    id: "radius-fill",
    type: "fill",
    source: "radius",
    paint: { "fill-color": QUIET, "fill-opacity": 0.08 },
  });
  area({
    id: "radius-line",
    type: "line",
    source: "radius",
    paint: { "line-color": QUIET, "line-width": 1.4, "line-dasharray": [2, 1.6] },
  });
  // Project footprint: parcel outlines (dashed — digitized, not surveyed) and the water source applied for.
  area({
    id: "footprint-line",
    type: "line",
    source: "footprint",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "line-color": INK, "line-width": 1.6, "line-dasharray": [2, 1.4], "line-opacity": 0.9 },
  });
  area({
    id: "footprint-fill",
    type: "fill",
    source: "footprint",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": INK, "fill-opacity": 0.06 },
  });

  // Points sit above the basemap labels.
  map.addLayer({
    id: "footprint-source",
    type: "circle",
    source: "footprint",
    filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "kind"], "source"]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 6],
      "circle-color": PAPER,
      "circle-opacity": 0.4,
      "circle-stroke-width": 1.8,
      "circle-stroke-color": WATER,
    },
  });
  map.addLayer({
    id: "stewardship-circle",
    type: "circle",
    source: "stewardship",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 12, 5.5, 15, 7],
      "circle-color": STEWARD,
      "circle-opacity": 0.95,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": PAPER,
    },
  });
  map.addLayer({
    id: "candidates-ring",
    type: "circle",
    source: "candidates",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 5, 12, 8],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2.2,
      "circle-stroke-color": CANDIDATE,
    },
  });
  map.addLayer({
    id: "facilities-circle",
    type: "circle",
    source: "facilities",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 3, 12, 5, 15, 7],
      "circle-color": INK,
      "circle-opacity": 0.85,
      "circle-stroke-width": 1.2,
      "circle-stroke-color": PAPER,
    },
  });
  map.addLayer({
    id: "pin-circle",
    type: "circle",
    source: "pin",
    paint: {
      "circle-radius": 7,
      "circle-color": PAPER,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": WATER,
    },
  });

  // National point layer. Solid dot = placed at the address; hollow ring = city/market approximate.
  map.addLayer({
    id: "national-approx",
    type: "circle",
    source: "national",
    filter: asFilter(NONE),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3.5, 6, 5, 10, 7],
      "circle-color": PAPER,
      "circle-opacity": 0.35,
      "circle-stroke-width": 1.6,
      "circle-stroke-color": INK,
    },
  });
  map.addLayer({
    id: "national-dot",
    type: "circle",
    source: "national",
    filter: asFilter(NONE),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3.5, 6, 5, 10, 7],
      "circle-color": INK,
      "circle-opacity": 0.9,
      "circle-stroke-width": 1,
      "circle-stroke-color": PAPER,
    },
  });
  map.addLayer({
    id: "national-selected",
    type: "circle",
    source: "national",
    filter: asFilter(NONE),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 9, 10, 13],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2.5,
      "circle-stroke-color": INK,
    },
  });
}

/**
 * Run `apply` now if the style is ready, else on the next `load`. Returns an effect cleanup that
 * cancels the pending callback: MapLibre fires `style.load` (which arms readyRef) before `load`, so a
 * stale closure from an earlier effect run would otherwise land AFTER the fresh one and undo it.
 */
function whenReady(map: maplibreImport.Map, ready: boolean, apply: () => void): (() => void) | undefined {
  if (ready) {
    apply();
    return undefined;
  }
  map.once("load", apply);
  return () => {
    map.off("load", apply);
  };
}

function applyNational(map: maplibreImport.Map, p: NationalPoints | null | undefined) {
  if (!map.getLayer("national-dot")) return;
  const source = map.getSource("national") as maplibreImport.GeoJSONSource | undefined;
  source?.setData(asMl(p?.data ?? emptyCollection()));
  if (!p) {
    map.setFilter("national-approx", asFilter(NONE));
    map.setFilter("national-dot", asFilter(NONE));
    map.setFilter("national-selected", asFilter(NONE));
    return;
  }
  map.setPaintProperty("national-approx", "circle-stroke-color", asExpr(p.color));
  map.setPaintProperty("national-dot", "circle-color", asExpr(p.color));
  map.setFilter("national-approx", asFilter(p.filter.approximate));
  map.setFilter("national-dot", asFilter(p.filter.exact));
  map.setFilter("national-selected", asFilter(["==", ["get", "id"], p.selectedId ?? ""]));
}

function drawWatershed(map: maplibreImport.Map, code: string | null) {
  applySelectedFilter(map, code);
  if (!map.getLayer("huc12-selected-line")) return;
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!code || reduce) {
    map.setPaintProperty("huc12-selected-line", "line-dasharray", [1, 0]);
    map.setPaintProperty("huc12-selected-fill", "fill-opacity", 0.28);
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 600);
    map.setPaintProperty("huc12-selected-line", "line-dasharray", [t * 4, 4 - t * 4]);
    map.setPaintProperty("huc12-selected-fill", "fill-opacity", 0.28 * t);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function MatchMap({
  selected,
  zoom,
  radiusKm,
  layers = ALL_VISIBLE,
  huc12,
  huc10 = null,
  huc8 = null,
  aquifers,
  facilities,
  stewardship = null,
  candidates = null,
  footprint = null,
  selectedHuc12,
  showPin = true,
  legendPad = 0,
  onMapClick,
  onZoomChange,
  onFacilityClick,
  points = null,
  viewBounds = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibreImport.Map | null>(null);
  /**
   * True once the style has loaded. Not map.isStyleLoaded(): that also reports false while tiles
   * are still streaming, which silently dropped camera and filter updates mid-load.
   */
  const readyRef = useRef(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const facilityClickRef = useRef(onFacilityClick);
  facilityClickRef.current = onFacilityClick;
  const zoomRef = useRef(onZoomChange);
  zoomRef.current = onZoomChange;
  const pointClickRef = useRef(points?.onClick);
  pointClickRef.current = points?.onClick;
  const visRef = useRef<LayerVisibility>(layers);
  visRef.current = { ...layers, pin: layers.pin && showPin, radius: layers.radius && showPin };
  const padRef = useRef(legendPad);
  padRef.current = legendPad;
  const viewRef = useRef({ lng: selected.lng, lat: selected.lat, zoom, bounds: null as
    | [[number, number], [number, number]]
    | null });
  const [error, setError] = useState<string | null>(null);

  const feature =
    selectedHuc12 && huc12
      ? huc12.features.find((f) => f.properties?.huc12 === selectedHuc12)
      : undefined;
  const aroundPin = feature ? featureContains(feature, selected.lng, selected.lat) : false;
  viewRef.current = {
    lng: selected.lng,
    lat: selected.lat,
    zoom,
    bounds: viewBounds
      ? [[viewBounds[0], viewBounds[1]], [viewBounds[2], viewBounds[3]]]
      : aroundPin && feature
        ? featureBounds(feature)
        : null,
  };

  const applyView = (map: maplibreImport.Map) => {
    if (!readyRef.current) {
      map.once("load", () => {
        if (mapRef.current === map) applyView(map);
      });
      return;
    }
    const v = viewRef.current;
    const wide = window.innerWidth >= 1024;
    // On a phone the open legend is a deliberate look-up, so pad only as far as still leaves the polygon room.
    const padding = wide
      ? { top: 56, left: 420, bottom: 24, right: 16 + padRef.current }
      : { top: 56, left: 12, bottom: 300, right: 12 + Math.min(padRef.current, Math.round(window.innerWidth * 0.4)) };
    map.setPadding(padding);
    if (v.bounds) {
      try {
        map.fitBounds(v.bounds, { padding: 40, maxZoom: 12, duration: 0 });
        return;
      } catch {
        /* fall through to the point camera */
      }
    }
    map.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    let cancelled = false;
    let map: maplibreImport.Map;
    try {
      map = new maplibregl.Map({
        container: el,
        style: VECTOR_STYLE,
        center: [selected.lng, selected.lat],
        zoom,
        attributionControl: { compact: true },
      });
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;

    const onError = (e: { error?: { message?: string }; sourceId?: string }) => {
      const msg = e.error?.message ?? "";
      if (e.sourceId === "openmaptiles" || e.sourceId === "ne2_shaded" || /openfreemap/i.test(msg)) {
        if (map.getSource("osm")) return;
        readyRef.current = false; // style.load → onLoad re-arms it and re-adds the overlays
        map.setStyle(rasterFallback());
      }
    };

    const onLoad = () => {
      if (cancelled) return;
      readyRef.current = true;
      addOverlayLayers(map);
      applyVisibility(map, visRef.current);
      map.resize();
      applyView(map);
    };

    map.on("load", onLoad);
    map.on("style.load", onLoad);
    map.on("error", onError);
    map.on("moveend", () => zoomRef.current?.(map.getZoom()));
    map.on("click", (e) => {
      const box: [[number, number], [number, number]] = [
        [e.point.x - 8, e.point.y - 8],
        [e.point.x + 8, e.point.y + 8],
      ];
      if (map.getLayer("national-dot") && pointClickRef.current) {
        const hit = map.queryRenderedFeatures(box, { layers: ["national-dot", "national-approx"] })[0];
        if (hit?.properties?.id) {
          pointClickRef.current(String(hit.properties.id));
          return;
        }
      }
      if (map.getLayer("facilities-circle") && facilityClickRef.current) {
        const hit = map.queryRenderedFeatures(box, { layers: ["facilities-circle"] })[0];
        if (hit && hit.geometry.type === "Point") {
          const [lng, lat] = hit.geometry.coordinates as [number, number];
          facilityClickRef.current(lng, lat, String(hit.properties?.name ?? "Listed facility"));
          return;
        }
      }
      clickRef.current(e.lngLat.lng, e.lngLat.lat);
    });
    for (const layer of ["facilities-circle", "national-dot", "national-approx"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    requestAnimationFrame(() => map.resize());

    return () => {
      cancelled = true;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      addOverlayLayers(map);
      if (huc12) setSourceData(map, "huc12", huc12);
      setSourceData(map, "huc10", huc10 ?? emptyCollection());
      setSourceData(map, "huc8", huc8 ?? emptyCollection());
      if (aquifers) setSourceData(map, "aquifers", aquifers);
      setSourceData(map, "facilities", facilities ?? emptyCollection());
      setSourceData(map, "stewardship", stewardship ?? emptyCollection());
      setSourceData(map, "candidates", candidates ?? emptyCollection());
      setSourceData(map, "footprint", footprint ?? emptyCollection());
      if (huc12 && selectedHuc12) drawWatershed(map, selectedHuc12);
      else applySelectedFilter(map, selectedHuc12);
    };
    return whenReady(map, readyRef.current, apply);
  }, [huc12, huc10, huc8, aquifers, facilities, stewardship, candidates, footprint, selectedHuc12]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      addOverlayLayers(map);
      applyNational(map, points);
    };
    return whenReady(map, readyRef.current, apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points?.data, points?.color, points?.selectedId, JSON.stringify(points?.filter ?? null)]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      addOverlayLayers(map);
      setSourceData(
        map,
        "radius",
        showPin
          ? {
              type: "FeatureCollection",
              features: [circlePolygon(selected.lng, selected.lat, radiusKm)],
            }
          : emptyCollection()
      );
      setSourceData(
        map,
        "pin",
        showPin
          ? {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Point", coordinates: [selected.lng, selected.lat] },
                },
              ],
            }
          : emptyCollection()
      );
    };
    return whenReady(map, readyRef.current, apply);
  }, [selected.lng, selected.lat, radiusKm, selectedHuc12, showPin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer("huc12-selected-fill")) return;
    drawWatershed(map, selectedHuc12);
  }, [selectedHuc12, huc12]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    return whenReady(map, readyRef.current, () => applyVisibility(map, visRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(layers), showPin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyView(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.lng, selected.lat, zoom, selectedHuc12, huc12, viewBounds?.join(","), legendPad]);

  return (
    <div className="match-map absolute inset-0 bg-[#0b1220]">
      <div ref={containerRef} className="absolute inset-0" />
      {error && (
        <div className="absolute inset-x-6 top-1/2 z-10 -translate-y-1/2 match-panel p-4 text-[14px]">
          Map failed to start. {error}
        </div>
      )}
    </div>
  );
}
