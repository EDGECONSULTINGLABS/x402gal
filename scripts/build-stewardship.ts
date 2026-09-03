/**
 * Stewardship layer — the ESG prospecting workbook → per-metro stewardship.geojson (spec §5).
 *
 *   npm run match:stewardship -- --xlsx="<path to Master_50State_ESG_Companies_All_Locations.xlsx>"
 *   npx tsx scripts/build-stewardship.ts --xlsx=<path> [--dry] [--no-url-check]
 *
 * The workbook is a prospecting database, not display content. Nothing renders without a row in
 * data/summit/stewardship-curation.json → include. That file holds the ≤160-char commitment in the
 * company's own terms and a company source URL. Columns J, K and M of the sheet are never read.
 *
 *   1. Sheet "All Companies (All States)", header row 3. Keep rows whose (City, State Code) is a metro.
 *   2. Join with the curation file. Uncurated in-metro rows are listed for the curator and skipped.
 *   3. Geocode the street address (Census batch, cached). No match → dropped, never approximated.
 *   4. Verify the source URL resolves (2xx/3xx). 403 behind a bot wall is accepted only when the
 *      curation entry carries a `verified` date. 404/5xx/network error → dropped.
 *   5. Emit <metro>/stewardship.geojson with properties company, facility, sector, commitment, source_url.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as XLSX from "xlsx";
import { metroForCity } from "../lib/match/metroCities";
import { METROS, pointInBbox, type MetroId } from "../lib/match/metros";
import type { GeoJsonFeature } from "../lib/match/types";
import {
  BENCHMARK,
  OUT,
  ROOT,
  addrKey,
  arg,
  geocodeBatch,
  loadCache,
  matchAgrees,
  normalizeStreet,
  patchManifest,
  s,
} from "./lib/geocode";

const SHEET = "All Companies (All States)";
const CURATION = join(ROOT, "data", "summit", "stewardship-curation.json");
const MAX_COMMITMENT = 160;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36 x402gal-build";

type Curated = { commitment: string; source_url: string; verified?: string };
type Curation = { include: Record<string, Curated>; exclude: Record<string, string> };

type Row = {
  key: string;
  company: string;
  facility: string;
  sector: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  metro: MetroId;
};

function readRows(xlsxPath: string): { rows: Row[]; noStreet: string[] } {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`sheet "${SHEET}" not found (${wb.SheetNames.join(", ")})`);
  const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: 2, defval: "" });
  const header = (table[0] ?? []).map((h) => s(h).toLowerCase());
  const col = (label: string) => {
    const i = header.findIndex((h) => h === label.toLowerCase());
    if (i < 0) throw new Error(`column "${label}" not in header: ${header.join(" | ")}`);
    return i;
  };
  const iCompany = col("Company");
  const iFacility = col("Facility/Site Name");
  const iStreet = col("Street Address");
  const iCity = col("City");
  const iState = col("State Code");
  const iZip = col("ZIP");
  const iSector = col("Sector");
  // Columns I (goal prose), J, K, L, M are intentionally never read here.
  // The commitment and the source come from the curation file.

  const rows: Row[] = [];
  const noStreet: string[] = [];
  for (const r of table.slice(1)) {
    if (!r.some((c) => s(c))) continue;
    const city = s(r[iCity]);
    const state = s(r[iState]);
    const metro = metroForCity(city, state, "");
    if (!metro) continue;
    const company = s(r[iCompany]);
    const facility = s(r[iFacility]);
    const key = `${company}|${facility}`;
    const street = normalizeStreet(s(r[iStreet]));
    if (!street) {
      noStreet.push(key);
      continue;
    }
    rows.push({ key, company, facility, sector: s(r[iSector]), street, city, state, zip: s(r[iZip]), metro });
  }
  return { rows, noStreet };
}

async function urlStatus(url: string): Promise<number | "error"> {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    return res.status;
  } catch {
    return "error";
  }
}

async function main() {
  const xlsxPath = arg("xlsx");
  if (!xlsxPath) throw new Error("--xlsx=<path to the ESG workbook> is required");
  const dry = process.argv.includes("--dry");
  const checkUrls = !process.argv.includes("--no-url-check");

  const curation = JSON.parse(await readFile(CURATION, "utf8")) as Curation;
  const { rows, noStreet } = readRows(resolve(xlsxPath));
  console.log(`rows in metros: ${rows.length + noStreet.length} (${noStreet.length} without a street address)`);

  const included: Row[] = [];
  const uncurated: string[] = [];
  let excluded = 0;
  for (const r of rows) {
    if (curation.include[r.key]) included.push(r);
    else if (curation.exclude[r.key]) excluded++;
    else uncurated.push(r.key);
  }
  for (const k of noStreet) if (!curation.exclude[k] && !curation.include[k]) uncurated.push(`${k} (no street address)`);
  console.log(`curation: ${included.length} included, ${excluded} excluded, ${uncurated.length} uncurated`);
  if (uncurated.length) {
    console.log("UNCURATED — add to include or exclude in data/summit/stewardship-curation.json:");
    for (const k of uncurated) console.log(`  - ${k}`);
  }
  for (const r of included) {
    const c = curation.include[r.key];
    if (c.commitment.length > MAX_COMMITMENT) throw new Error(`${r.key}: commitment is ${c.commitment.length} chars (max ${MAX_COMMITMENT})`);
    if (!/^https:\/\//.test(c.source_url)) throw new Error(`${r.key}: source_url must be https`);
  }
  if (dry) return;

  const cache = await loadCache();
  await geocodeBatch(included, cache);

  const today = new Date().toISOString().slice(0, 10);
  const byMetro = new Map<MetroId, GeoJsonFeature[]>();
  const why: Record<string, number> = { "no match": 0, "city and zip mismatch": 0, "outside bbox": 0, "source url failed": 0 };

  for (const r of included) {
    const c = curation.include[r.key];
    const g = cache[addrKey(r)];
    if (!g || g.match !== "Match" || g.lng == null || g.lat == null) {
      why["no match"]++;
      console.log(`  drop ${r.key}: no street-level match`);
      continue;
    }
    if (!matchAgrees(g, r)) {
      why["city and zip mismatch"]++;
      console.log(`  drop ${r.key}: geocode disagrees on city and zip`);
      continue;
    }
    const metro = METROS.find((m) => m.id === r.metro)!;
    if (!pointInBbox(g.lng, g.lat, metro.bbox)) {
      why["outside bbox"]++;
      console.log(`  drop ${r.key}: outside ${metro.id} bbox`);
      continue;
    }
    if (checkUrls) {
      const status = await urlStatus(c.source_url);
      const ok = (typeof status === "number" && status < 400) || (status === 403 && Boolean(c.verified));
      console.log(`  url ${status}${status === 403 && c.verified ? " (bot wall; verified " + c.verified + ")" : ""} ${c.source_url}`);
      if (!ok) {
        why["source url failed"]++;
        console.log(`  drop ${r.key}: source did not resolve`);
        continue;
      }
    }
    const point: [number, number] = [Number(g.lng.toFixed(6)), Number(g.lat.toFixed(6))];
    byMetro.set(r.metro, [
      ...(byMetro.get(r.metro) ?? []),
      {
        type: "Feature",
        properties: {
          company: r.company,
          facility: r.facility,
          sector: r.sector,
          commitment: c.commitment,
          source_url: c.source_url,
        },
        geometry: { type: "Point", coordinates: point },
      },
    ]);
  }

  let total = 0;
  for (const metro of METROS) {
    const features = (byMetro.get(metro.id) ?? []).sort((a, b) =>
      String(a.properties?.company).localeCompare(String(b.properties?.company))
    );
    total += features.length;
    await mkdir(join(OUT, metro.id), { recursive: true });
    const json = JSON.stringify({ type: "FeatureCollection", features });
    await writeFile(join(OUT, metro.id, "stewardship.geojson"), json);
    console.log(`  ${metro.id}/stewardship.geojson ${features.length}`);
    await patchManifest(metro.id, "stewardship.geojson", {
      features: features.length,
      bytes: Buffer.byteLength(json),
      source: `ESG workbook, sheet "${SHEET}", curated via data/summit/stewardship-curation.json (include only)`,
      geocoder: `US Census batch (${BENCHMARK}), Match + Exact/Non_Exact, ZIP or city agreement, inside metro bbox`,
      sourceUrls: checkUrls ? "verified to resolve at build" : "not checked (--no-url-check)",
      built: today,
    });
  }
  console.log(`stewardship cards: ${total}`, why);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
