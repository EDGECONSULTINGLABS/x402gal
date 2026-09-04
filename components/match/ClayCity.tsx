"use client";

import { useEffect, useRef, useState } from "react";
import maplibreImport from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CLAY } from "@/lib/match/theme";

type Maplibre = typeof maplibreImport;
const maplibregl: Maplibre =
  typeof (maplibreImport as unknown as { Map?: unknown }).Map === "function"
    ? maplibreImport
    : ((maplibreImport as unknown as { default: Maplibre }).default ?? maplibreImport);

/** OpenStreetMap vector tiles (OpenMapTiles schema) with a render_height on buildings. No key. */
const TILES = "https://tiles.openfreemap.org/planet";

/**
 * Lower Manhattan from above Tribeca looking south: the towers mid-frame, the harbor at the far
 * edge under the heading, the foreground under the sheet. Below zoom 14 the tile buildings flatten.
 */
const CAMERA = { center: [-74.0075, 40.7165] as [number, number], zoom: 14.3, pitch: 64, bearing: 181 };
const DRIFT_DEG_PER_S = 0.4;

function style(): maplibreImport.StyleSpecification {
  return {
    version: 8,
    // Low, slightly rosy sun from behind-left. Above ~0.6 the clay goes brown.
    light: { anchor: "viewport", color: CLAY.light, intensity: 0.5, position: [1.3, 250, 50] },
    sources: { ofm: { type: "vector", url: TILES, attribution: "© OpenStreetMap contributors" } },
    layers: [
      // The ground plane is the shadow: MapLibre casts none, so the street canyons carry the red.
      { id: "ground", type: "background", paint: { "background-color": CLAY.ground } },
      { id: "water", type: "fill", source: "ofm", "source-layer": "water", paint: { "fill-color": CLAY.water } },
      { id: "park", type: "fill", source: "ofm", "source-layer": "park", paint: { "fill-color": CLAY.park, "fill-opacity": 0.9 } },
      {
        id: "grass",
        type: "fill",
        source: "ofm",
        "source-layer": "landcover",
        filter: ["in", "class", "grass", "wood"],
        paint: { "fill-color": CLAY.park, "fill-opacity": 0.8 },
      },
      {
        id: "bridge",
        type: "line",
        source: "ofm",
        "source-layer": "transportation",
        filter: ["==", "brunnel", "bridge"],
        paint: { "line-color": CLAY.ground, "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.5, 16, 8] },
      },
      {
        id: "buildings",
        type: "fill-extrusion",
        source: "ofm",
        "source-layer": "building",
        minzoom: 12,
        paint: {
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], 10],
            0,
            CLAY.building,
            200,
            CLAY.buildingTall,
          ],
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 1,
          "fill-extrusion-vertical-gradient": true,
        },
      },
    ],
  };
}

/**
 * The city in relief behind the gate: building footprints pulled to their heights, pale clay, the
 * ground in Avalanche red so every street reads as shadow, dark water. Decorative and inert — it
 * takes no pointer input and is hidden from assistive tech. Invisible until the first frame with
 * tiles has drawn, so a dead hotspot leaves the brand gradient underneath and nothing else.
 */
export function ClayCity() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const map = new maplibregl.Map({
      container: el,
      style: style(),
      ...CAMERA,
      interactive: false,
      attributionControl: false,
      maxPitch: 75,
      antialias: true,
    });

    // The model turns slowly once it has drawn: a place, not a wallpaper. Not under reduced motion.
    let raf = 0;
    let ready = false;
    const drift = () => {
      if (raf || reduced || !ready) return;
      let last = performance.now();
      const tick = (t: number) => {
        map.setBearing(map.getBearing() + (DRIFT_DEG_PER_S * (t - last)) / 1000);
        last = t;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const still = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    map.once("idle", () => {
      ready = true;
      setShown(true);
      drift();
    });
    // Battery: stop turning while the tab is hidden.
    const onVisibility = () => (document.hidden ? still() : drift());
    document.addEventListener("visibilitychange", onVisibility);
    // Tile errors are expected offline; the fade-in simply never happens.
    map.on("error", () => undefined);

    return () => {
      still();
      document.removeEventListener("visibilitychange", onVisibility);
      map.remove();
    };
  }, []);

  return (
    <div className="clay-city" aria-hidden="true" data-shown={shown}>
      <div ref={ref} className="clay-city-map" />
      <div className="clay-city-scrim" />
    </div>
  );
}
