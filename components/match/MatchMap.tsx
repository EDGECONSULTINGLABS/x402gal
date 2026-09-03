"use client";

import { useEffect, useRef, useState } from "react";
import maplibreImport from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
  selectedHuc12: string | null;
  showPin?: boolean;
  onMapClick: (lng: number, lat: number) => void;
};

function setSourceData(
  map: maplibreImport.Map,
  id: string,
  data: GeoJsonFeatureCollection
) {
  const source = map.getSource(id) as maplibreImport.GeoJSONSource | undefined;
  source?.setData(data);
}

function applySelectedFilter(map: maplibreImport.Map, code: string | null) {
  if (!map.getLayer("huc12-selected-fill")) return;
  const value = code ?? "";
  map.setFilter("huc12-selected-fill", ["==", ["get", "huc12"], value]);
  map.setFilter("huc12-selected-line", ["==", ["get", "huc12"], value]);
}

function addOverlayLayers(map: maplibreImport.Map) {
  if (map.getSource("aquifers")) return;
  map.addSource("aquifers", { type: "geojson", data: emptyCollection() });
  map.addSource("huc12", { type: "geojson", data: emptyCollection() });
  map.addSource("radius", { type: "geojson", data: emptyCollection() });
  map.addSource("pin", { type: "geojson", data: emptyCollection() });

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
  selectedHuc12,
  showPin = true,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibreImport.Map | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
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
    bounds: aroundPin && feature ? featureBounds(feature) : null,
  };

  const applyView = (map: maplibreImport.Map) => {
    if (!map.isStyleLoaded()) {
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
    map.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom });
    if (v.bounds) {
      try {
        map.fitBounds(v.bounds, { padding: 40, maxZoom: 12, duration: 0 });
      } catch {
        map.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom });
      }
    }
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
        map.setStyle(baseStyle("osm"));
      }
    };

    const onLoad = () => {
      if (cancelled) return;
      addOverlayLayers(map);
      map.resize();
      applyView(map);
    };

    map.on("load", onLoad);
    map.on("style.load", onLoad);
    map.on("error", onError);
    map.on("click", (e) => clickRef.current(e.lngLat.lng, e.lngLat.lat));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    requestAnimationFrame(() => map.resize());

    return () => {
      cancelled = true;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
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
      if (huc12 && selectedHuc12) drawWatershed(map, selectedHuc12);
      else applySelectedFilter(map, selectedHuc12);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [huc12, aquifers, selectedHuc12]);

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
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [selected.lng, selected.lat, radiusKm, selectedHuc12, showPin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer("huc12-selected-fill")) return;
    drawWatershed(map, selectedHuc12);
  }, [selectedHuc12, huc12]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
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
  }, [selected.lng, selected.lat, zoom, selectedHuc12, huc12]);

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
