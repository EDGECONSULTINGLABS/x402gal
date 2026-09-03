/**
 * Facility converter — the master data-center spreadsheet → per-metro facilities.geojson.
 *
 *   npm run match:facilities -- --xlsx="<path to Master_50State_DataCenters_All_Locations.xlsx>"
 *   npx tsx scripts/build-facilities.ts --xlsx=<path> [--dry] [--metro=phoenix]
 *
 * Pipeline (spec §4): filter to the Summit metros FIRST, then geocode once as a build step.
 *   1. Sheet "All Facilities (All States)", header row 3, data from row 4.
 *   2. Keep Status beginning "Active"; keep rows whose (City, State Code) or (Market, State Code) is a metro.
 *   3. Geocode with the US Census batch geocoder (scripts/lib/geocode.ts, cached).
 *   4. Keep Match + Exact/Non_Exact. The Census geocoder interpolates along the matched street
 *      segment and never falls back to a ZIP or city centroid — a No_Match/Tie is dropped, not
 *      approximated. As a further guard the matched ZIP or city must agree with the input and the
 *      point must fall inside the metro bbox.
 *   5. Emit public/match/data/<metro>/facilities.geojson with properties
 *      name, operator, city, state, status — nothing else. Column J (Notes) never leaves the file.
 *      Also emit public/match/data/facilities-index.json (name, operator, metro, point) for typed input.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as XLSX from "xlsx";
import { metroForCity } from "../lib/match/metroCities";
import { METROS, pointInBbox, type MetroId } from "../lib/match/metros";
import type { GeoJsonFeature } from "../lib/match/types";
import {
  BENCHMARK,
  OUT,
  addrKey,
  arg,
  geocodeBatch,
  loadCache,
  matchAgrees,
  normalizeStreet,
  patchManifest,
  s,
} from "./lib/geocode";

const SHEET = "All Facilities (All States)";

type Row = {
  name: string;
  operator: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  market: string;
  status: string;
  metro: MetroId;
};

// ---------------------------------------------------------------- read + filter

function readRows(xlsxPath: string): { rows: Row[]; total: number; dropped: Record<string, number> } {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`sheet "${SHEET}" not found (${wb.SheetNames.join(", ")})`);
  // range: 2 → start at row 3 (0-indexed), which is the header row.
  const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: 2, defval: "" });
  const header = (table[0] ?? []).map((h) => s(h).toLowerCase());
  const col = (label: string) => {
    const i = header.findIndex((h) => h === label.toLowerCase());
    if (i < 0) throw new Error(`column "${label}" not in header: ${header.join(" | ")}`);
    return i;
  };
  const iName = col("Name");
  const iOperator = col("Operator");
  const iStreet = col("Street Address");
  const iCity = col("City");
  const iState = col("State Code");
  const iZip = col("ZIP");
  const iMarket = col("Market");
  const iStatus = col("Status");
  // Column J "Notes" is intentionally never read.

  const dropped: Record<string, number> = { "not active": 0, "outside metros": 0, "no street address": 0 };
  const rows: Row[] = [];
  let total = 0;
  for (const r of table.slice(1)) {
    if (!r.some((c) => s(c))) continue;
    total++;
    const status = s(r[iStatus]);
    // "Active", "Active/Expanding", "Active/Under construction", "Active (for sale)" are operating
    // facilities. "Proposed/Active", "Planned", "Under construction", "Cancelled" are not.
    if (!/^active\b/i.test(status)) {
      dropped["not active"]++;
      continue;
    }
    const city = s(r[iCity]);
    const state = s(r[iState]);
    const market = s(r[iMarket]);
    const metro = metroForCity(city, state, market);
    if (!metro) {
      dropped["outside metros"]++;
      continue;
    }
    const street = normalizeStreet(s(r[iStreet]));
    if (!street) {
      dropped["no street address"]++;
      continue;
    }
    rows.push({
      name: s(r[iName]),
      operator: s(r[iOperator]),
      street,
      city,
      state,
      zip: s(r[iZip]),
      market,
      status,
      metro,
    });
  }
  return { rows, total, dropped };
}

// ---------------------------------------------------------------- emit

async function main() {
  const xlsxPath = arg("xlsx");
  if (!xlsxPath) throw new Error("--xlsx=<path to the master data-center workbook> is required");
  const dry = process.argv.includes("--dry");
  const only = arg("metro") as MetroId | undefined;

  const { rows, total, dropped } = readRows(resolve(xlsxPath));
  console.log(`rows: ${total} in sheet → ${rows.length} in metros`);
  console.log("dropped before geocode:", dropped);
  const byMetro = new Map<MetroId, Row[]>();
  for (const r of rows) byMetro.set(r.metro, [...(byMetro.get(r.metro) ?? []), r]);
  for (const m of METROS) console.log(`  ${m.id}: ${byMetro.get(m.id)?.length ?? 0}`);
  if (dry) return;

  const targets = only ? rows.filter((r) => r.metro === only) : rows;
  const cache = await loadCache();
  await geocodeBatch(targets, cache);

  const index: { n: string; o: string; m: MetroId; c: [number, number] }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const metro of METROS) {
    if (only && metro.id !== only) continue;
    const input = byMetro.get(metro.id) ?? [];
    const features: GeoJsonFeature[] = [];
    const why: Record<string, number> = { "no match": 0, "city and zip mismatch": 0, "outside bbox": 0 };
    for (const r of input) {
      const g = cache[addrKey(r)];
      if (!g || g.match !== "Match" || g.lng == null || g.lat == null) {
        why["no match"]++;
        continue;
      }
      if (!matchAgrees(g, r)) {
        why["city and zip mismatch"]++;
        continue;
      }
      if (!pointInBbox(g.lng, g.lat, metro.bbox)) {
        why["outside bbox"]++;
        continue;
      }
      const point: [number, number] = [Number(g.lng.toFixed(6)), Number(g.lat.toFixed(6))];
      features.push({
        type: "Feature",
        properties: { name: r.name, operator: r.operator, city: r.city, state: r.state, status: r.status },
        geometry: { type: "Point", coordinates: point },
      });
      index.push({ n: r.name, o: r.operator, m: metro.id, c: point });
    }
    features.sort((a, b) => String(a.properties?.name).localeCompare(String(b.properties?.name)));
    await mkdir(join(OUT, metro.id), { recursive: true });
    const json = JSON.stringify({ type: "FeatureCollection", features });
    await writeFile(join(OUT, metro.id, "facilities.geojson"), json);
    console.log(`  ${metro.id}/facilities.geojson ${features.length}/${input.length} kept`, why);
    await patchManifest(metro.id, "facilities.geojson", {
      features: features.length,
      bytes: Buffer.byteLength(json),
      source: `Master 50-state data-center workbook, sheet "${SHEET}", Active rows in metro cities`,
      geocoder: `US Census batch (${BENCHMARK}), Match + Exact/Non_Exact, ZIP or city agreement, inside metro bbox`,
      dropped: why,
      built: today,
    });
  }

  if (!only) {
    index.sort((a, b) => a.n.localeCompare(b.n));
    await writeFile(join(OUT, "facilities-index.json"), JSON.stringify(index));
    console.log(`facilities-index.json ${index.length} entries`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
