"use client";

import { useEffect, useRef, useState } from "react";
import maplibreImport from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { FIT, FIT_CATEGORIES, type BBox, type FitCategory } from "@/lib/match/esg";
import { circlePolygon, emptyCollection, featureBounds, featureContains } from "@/lib/match/geo";
import { INK, PAPER, QUIET, SUBSURFACE, WATER } from "@/lib/match/theme";
import type { GeoJsonFeatureCollection, SelectedLocation } from "@/lib/match/types";

type Maplibre = typeof maplibreImport;
const maplibregl: Maplibre =
  typeof (maplibreImport as unknown as { Map?: unknown }).Map === "function"
    ? maplibreImport
    : ((maplibreImport as unknown as { default: Maplibre }).default ?? maplibreImport);

const IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

function baseStyle(tiles: "imagery" | "osm"): maplibreImport.StyleSpecification {
  if (tiles === "osm") {
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
  return {
    version: 8,
    sources: {
      imagery: {
        type: "raster",
        tiles: [IMAGERY],
        tileSize: 256,
        attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
        maxzoom: 19,
      },
      labels: {
        type: "raster",
        tiles: [LABELS],
        tileSize: 256,
      },
    },
    layers: [
      { id: "imagery", type: "raster", source: "imagery" },
      { id: "labels", type: "raster", source: "labels" },
    ],
  };
}

type Props = {
  selected: SelectedLocation;
  zoom: number;
  radiusKm: number;
  showWbd: boolean;
  showAquifer: boolean;
  huc12: GeoJsonFeatureCollection | null;
  aquifers: GeoJsonFeatureCollection | null;
  facilities: GeoJsonFeatureCollection | null;
  selectedHuc12: string | null;
  showPin?: boolean;
  onMapClick: (lng: number, lat: number) => void;
  /** A listed facility was tapped. Name is the facility's `name` property. */
  onFacilityClick?: (lng: number, lat: number, name: string) => void;
  /** National ESG company layer (public/match/data/us/esg.geojson). Coloured by Fit Category. */
  esg?: GeoJsonFeatureCollection | null;
  esgFilter?: EsgFilter | null;
  esgSelectedId?: string | null;
  onEsgClick?: (id: string) => void;
  /** When set, the camera fits this box instead of centring on `selected`. */
  viewBounds?: BBox | null;
};

export type EsgFilter = { fits: readonly FitCategory[]; st: string | null; company: string | null };

const FIT_COLOR_EXPR = [
  "match",
  ["get", "fit"],
  ...FIT_CATEGORIES.flatMap((f) => [f, FIT[f].color]),
  FIT.Other.color,
] as unknown as maplibreImport.ExpressionSpecification;

function esgFilterExpr(f: EsgFilter | null | undefined, approximate: boolean): maplibreImport.FilterSpecification {
  const parts: unknown[] = [approximate ? ["==", ["get", "placement"], "city"] : ["!=", ["get", "placement"], "city"]];
  if (f) {
    parts.push(["in", ["get", "fit"], ["literal", [...f.fits]]]);
    if (f.st) parts.push(["==", ["get", "st"], f.st]);
    if (f.company) parts.push(["==", ["get", "company"], f.company]);
  }
  return ["all", ...parts] as unknown as maplibreImport.FilterSpecification;
}

/** Our GeoJSON types are structural and narrower than maplibre's; the shape is identical. */
type MlGeoJson = Parameters<maplibreImport.GeoJSONSource["setData"]>[0];
const asMl = (data: GeoJsonFeatureCollection) => data as unknown as MlGeoJson;

function setSourceData(
  map: maplibreImport.Map,
  id: string,
  data: GeoJsonFeatureCollection
) {
  const source = map.getSource(id) as maplibreImport.GeoJSONSource | undefined;
  source?.setData(asMl(data));
}

function applySelectedFilter(map: maplibreImport.Map, code: string | null) {
  if (!map.getLayer("huc12-selected-fill")) return;
  const value = code ?? "";
  map.setFilter("huc12-selected-fill", ["==", ["get", "huc12"], value]);
  map.setFilter("huc12-selected-line", ["==", ["get", "huc12"], value]);
}

function addOverlayLayers(map: maplibreImport.Map) {
  if (map.getSource("aquifers")) return;
  map.addSource("aquifers", { type: "geojson", data: asMl(emptyCollection()) });
  map.addSource("huc12", { type: "geojson", data: asMl(emptyCollection()) });
  map.addSource("radius", { type: "geojson", data: asMl(emptyCollection()) });
  map.addSource("facilities", { type: "geojson", data: asMl(emptyCollection()) });
  map.addSource("pin", { type: "geojson", data: asMl(emptyCollection()) });

  map.addLayer({
    id: "aquifers-fill",
    type: "fill",
    source: "aquifers",
    filter: ["all", ["has", "AQ_NAME"], ["!=", ["get", "AQ_NAME"], "Other rocks"]],
    paint: { "fill-color": SUBSURFACE, "fill-opacity": 0.22 },
  });
  map.addLayer({
    id: "aquifers-line",
    type: "line",
    source: "aquifers",
    filter: ["all", ["has", "AQ_NAME"], ["!=", ["get", "AQ_NAME"], "Other rocks"]],
    paint: { "line-color": SUBSURFACE, "line-width": 1.4 },
  });
  map.addLayer({
    id: "huc12-line",
    type: "line",
    source: "huc12",
    paint: { "line-color": WATER, "line-width": 0.7, "line-opacity": 0.35 },
  });
  map.addLayer({
    id: "huc12-selected-fill",
    type: "fill",
    source: "huc12",
    filter: ["==", ["get", "huc12"], ""],
    paint: { "fill-color": WATER, "fill-opacity": 0 },
  });
  map.addLayer({
    id: "huc12-selected-line",
    type: "line",
    source: "huc12",
    filter: ["==", ["get", "huc12"], ""],
    paint: {
      "line-color": WATER,
      "line-width": 2.8,
      "line-dasharray": [0, 4],
    },
  });
  map.addLayer({
    id: "radius-fill",
    type: "fill",
    source: "radius",
    paint: { "fill-color": QUIET, "fill-opacity": 0.08 },
  });
  map.addLayer({
    id: "radius-line",
    type: "line",
    source: "radius",
    paint: { "line-color": QUIET, "line-width": 1.4, "line-dasharray": [2, 1.6] },
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
      "circle-stroke-color": INK,
    },
  });

  // National ESG layer. Solid dot = placed at the address; hollow ring = city-centre approximate.
  map.addSource("esg", { type: "geojson", data: asMl(emptyCollection()) });
  map.addLayer({
    id: "esg-approx",
    type: "circle",
    source: "esg",
    filter: esgFilterExpr(null, true),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3.5, 6, 5, 10, 7],
      "circle-color": PAPER,
      "circle-opacity": 0.35,
      "circle-stroke-width": 1.6,
      "circle-stroke-color": FIT_COLOR_EXPR,
    },
  });
  map.addLayer({
    id: "esg-dot",
    type: "circle",
    source: "esg",
    filter: esgFilterExpr(null, false),
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 3.5, 6, 5, 10, 7],
      "circle-color": FIT_COLOR_EXPR,
      "circle-opacity": 0.9,
      "circle-stroke-width": 1,
      "circle-stroke-color": PAPER,
    },
  });
  map.addLayer({
    id: "esg-selected",
    type: "circle",
    source: "esg",
    filter: ["==", ["get", "id"], ""],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 9, 10, 13],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-width": 2.5,
      "circle-stroke-color": INK,
    },
  });
}

function applyEsgFilter(map: maplibreImport.Map, f: EsgFilter | null | undefined, selectedId: string | null | undefined) {
  if (!map.getLayer("esg-dot")) return;
  map.setFilter("esg-approx", esgFilterExpr(f, true));
  map.setFilter("esg-dot", esgFilterExpr(f, false));
  map.setFilter("esg-selected", ["==", ["get", "id"], selectedId ?? ""]);
}

function drawWatershed(map: maplibreImport.Map, code: string | null) {
  applySelectedFilter(map, code);
  if (!map.getLayer("huc12-selected-line")) return;
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!code || reduce) {
    map.setPaintProperty("huc12-selected-line", "line-dasharray", [1, 0]);
    map.setPaintProperty("huc12-selected-fill", "fill-opacity", 0.32);
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / 600);
    map.setPaintProperty("huc12-selected-line", "line-dasharray", [t * 4, 4 - t * 4]);
    map.setPaintProperty("huc12-selected-fill", "fill-opacity", 0.32 * t);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function MatchMap({
  selected,
  zoom,
  radiusKm,
  showWbd,
  showAquifer,
  huc12,
  aquifers,
  facilities,
  selectedHuc12,
  showPin = true,
  onMapClick,
  onFacilityClick,
  esg = null,
  esgFilter = null,
  esgSelectedId = null,
  onEsgClick,
  viewBounds = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibreImport.Map | null>(null);
  /**
   * True once the style has loaded. Not map.isStyleLoaded(): that also reports false while raster
   * tiles are still streaming, which silently dropped camera and filter updates mid-load.
   */
  const readyRef = useRef(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const facilityClickRef = useRef(onFacilityClick);
  facilityClickRef.current = onFacilityClick;
  const esgClickRef = useRef(onEsgClick);
  esgClickRef.current = onEsgClick;
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
    const padding = wide
      ? { top: 56, left: 420, bottom: 24, right: 16 }
      : { top: 56, left: 12, bottom: 300, right: 12 };
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
        style: baseStyle("imagery"),
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
      if (e.sourceId === "imagery" || /arcgisonline|esri/i.test(msg)) {
        if (map.getSource("osm")) return;
        readyRef.current = false; // style.load → onLoad re-arms it and re-adds the overlays
        map.setStyle(baseStyle("osm"));
      }
    };

    const onLoad = () => {
      if (cancelled) return;
      readyRef.current = true;
      addOverlayLayers(map);
      map.resize();
      applyView(map);
    };

    map.on("load", onLoad);
    map.on("style.load", onLoad);
    map.on("error", onError);
    map.on("click", (e) => {
      const box: [[number, number], [number, number]] = [
        [e.point.x - 8, e.point.y - 8],
        [e.point.x + 8, e.point.y + 8],
      ];
      if (map.getLayer("esg-dot") && esgClickRef.current) {
        const hit = map.queryRenderedFeatures(box, { layers: ["esg-dot", "esg-approx"] })[0];
        if (hit?.properties?.id) {
          esgClickRef.current(String(hit.properties.id));
          return;
        }
      }
      if (map.getLayer("facilities-circle") && facilityClickRef.current) {
        const hits = map.queryRenderedFeatures(
          [
            [e.point.x - 8, e.point.y - 8],
            [e.point.x + 8, e.point.y + 8],
          ],
          { layers: ["facilities-circle"] }
        );
        const hit = hits[0];
        if (hit && hit.geometry.type === "Point") {
          const [lng, lat] = hit.geometry.coordinates as [number, number];
          facilityClickRef.current(lng, lat, String(hit.properties?.name ?? "Listed facility"));
          return;
        }
      }
      clickRef.current(e.lngLat.lng, e.lngLat.lat);
    });
    for (const layer of ["facilities-circle", "esg-dot", "esg-approx"]) {
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
      if (aquifers) setSourceData(map, "aquifers", aquifers);
      setSourceData(map, "facilities", facilities ?? emptyCollection());
      if (huc12 && selectedHuc12) drawWatershed(map, selectedHuc12);
      else applySelectedFilter(map, selectedHuc12);
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [huc12, aquifers, facilities, selectedHuc12]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      addOverlayLayers(map);
      setSourceData(map, "esg", esg ?? emptyCollection());
      applyEsgFilter(map, esgFilter, esgSelectedId);
    };
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [esg, esgFilter, esgSelectedId]);

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
    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [selected.lng, selected.lat, radiusKm, selectedHuc12, showPin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer("huc12-selected-fill")) return;
    drawWatershed(map, selectedHuc12);
  }, [selectedHuc12, huc12]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const vis = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    };
    vis("huc12-line", showWbd);
    vis("huc12-selected-fill", showWbd);
    vis("huc12-selected-line", showWbd);
    vis("aquifers-fill", showAquifer);
    vis("aquifers-line", showAquifer);
  }, [showWbd, showAquifer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyView(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.lng, selected.lat, zoom, selectedHuc12, huc12, viewBounds?.join(",")]);

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
