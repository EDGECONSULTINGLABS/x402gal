/**
 * Build the 50-state data center layer from Master_50State_DataCenters_All_Locations.xlsx.
 *
 *   npm run match:datacenters -- --xlsx="<path to workbook>"
 *
 * Reads four tabs: "All Facilities (All States)", "Summary by State", "Summary by Operator",
 * "Summary by Market". Every row is placed, in tiers (recorded per point as `p`):
 *   census   US Census street-level match
 *   osm      OpenStreetMap building/campus object (no road interpolation)
 *   city     city centre — the workbook says "(exact address not public)" or has no usable street
 *   market   market centre, when the city itself cannot be found
 * City/market placements draw as hollow rings and say so on the card. Column J (Notes) never ships.
 *
 * Distinct from scripts/build-facilities.ts, which feeds the per-metro watershed instrument and is
 * street-level only. Cold run: Census batch (~3k rows, a few minutes) + Nominatim at ≤1 req/s for the
 * fallbacks. Both caches live in source-data/.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { STATUSES, statusOf, type DcProps, type DcSummary, type Status } from "../lib/match/datacenters";
import type { GeoJsonFeature } from "../lib/match/types";
import { BENCHMARK, OUT, addrKey, arg, geocodeBatch, loadCache, matchAgrees, normalizeStreet, s, zip5 } from "./lib/geocode";
import { placeAddress, placeCity } from "./lib/nominatim";

const SHEET_ALL = "All Facilities (All States)";
const SHEET_STATE = "Summary by State";
const SHEET_OPERATOR = "Summary by Operator";
const SHEET_MARKET = "Summary by Market";
const OUT_DIR = join(OUT, "us");

type Row = {
  id: string;
  name: string;
  operator: string;
  city: string;
  state: string;
  st: string;
  zip: string;
  market: string;
  statusRaw: string;
  status: Status;
  rawStreet: string;
  street: string | null;
  notPublic: boolean;
};

function sheetTable(wb: XLSX.WorkBook, name: string, headerRow: number): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`sheet "${name}" not found (${wb.SheetNames.join(", ")})`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: headerRow, defval: "" });
}

function columns(header: unknown[]) {
  const h = header.map((x) => s(x).toLowerCase());
  return (label: string) => {
    const i = h.findIndex((x) => x === label.toLowerCase());
    if (i < 0) throw new Error(`column "${label}" not in header: ${h.join(" | ")}`);
    return i;
  };
}

function readAll(wb: XLSX.WorkBook): Row[] {
  const table = sheetTable(wb, SHEET_ALL, 2);
  const col = columns(table[0] ?? []);
  const i = {
    state: col("State"),
    name: col("Name"),
    operator: col("Operator"),
    street: col("Street Address"),
    city: col("City"),
    st: col("State Code"),
    zip: col("ZIP"),
    market: col("Market"),
    status: col("Status"),
    // "Notes" is deliberately not read.
  };
  const rows: Row[] = [];
  const seen = new Map<string, number>();
  for (const r of table.slice(1)) {
    if (!r.some((c) => s(c))) continue;
    const name = s(r[i.name]);
    const operator = s(r[i.operator]);
    const st = s(r[i.st]).toUpperCase();
    const city = s(r[i.city]);
    const base = `${name}|${operator}|${city}|${st}`;
    const dup = seen.get(base) ?? 0;
    seen.set(base, dup + 1);
    const rawStreet = s(r[i.street]);
    const notPublic = /not public/i.test(rawStreet);
    const statusRaw = s(r[i.status]);
    rows.push({
      id: createHash("sha1").update(dup ? `${base}#${dup}` : base).digest("hex").slice(0, 10),
      name,
      operator,
      city,
      state: s(r[i.state]),
      st,
      zip: s(r[i.zip]),
      market: s(r[i.market]),
      statusRaw,
      status: statusOf(statusRaw),
      rawStreet,
      street: notPublic ? null : normalizeStreet(rawStreet),
      notPublic,
    });
  }
  return rows;
}

function readStates(wb: XLSX.WorkBook) {
  const t = sheetTable(wb, SHEET_STATE, 0);
  const col = columns(t[0] ?? []);
  const iState = col("State"), iSt = col("State Code"), iFac = col("Facilities Listed");
  return t
    .slice(1)
    .filter((r) => s(r[iSt]).length === 2)
    .map((r) => ({ state: s(r[iState]), st: s(r[iSt]).toUpperCase(), listed: Number(r[iFac]) || 0 }));
}

function readOperators(wb: XLSX.WorkBook) {
  const t = sheetTable(wb, SHEET_OPERATOR, 0);
  const col = columns(t[0] ?? []);
  const iOp = col("Operator"), iFac = col("Facilities Nationwide"), iStates = col("States Present");
  return t
    .slice(1)
    .filter((r) => s(r[iOp]))
    .map((r) => ({ operator: s(r[iOp]), facilities: Number(r[iFac]) || 0, states: s(r[iStates]) }));
}

function readMarkets(wb: XLSX.WorkBook, stateCodes: Map<string, string>) {
  const t = sheetTable(wb, SHEET_MARKET, 0);
  const col = columns(t[0] ?? []);
  const iMkt = col("Market"), iState = col("State"), iFac = col("Facilities Listed");
  return t
    .slice(1)
    .filter((r) => s(r[iMkt]))
    .map((r) => ({ market: s(r[iMkt]), state: s(r[iState]), st: stateCodes.get(s(r[iState])) ?? "", listed: Number(r[iFac]) || 0 }));
}

const cleanPlace = (v: string) => v.split(/\s*[\/(]/)[0].replace(/\s+(area|metro|region)$/i, "").trim();
/** Markets sometimes carry the state: "Kansas City KS", "Jackson MS". */
const cleanMarket = (v: string, st: string) => cleanPlace(v).replace(new RegExp(`\\s+${st}$`, "i"), "").trim();

async function main() {
  const xlsx = arg("xlsx");
  if (!xlsx) throw new Error("--xlsx=<path to Master_50State_DataCenters_All_Locations.xlsx> is required");
  const workbook = await readFile(xlsx);
  const wb = XLSX.read(workbook, { type: "buffer" });
  const rows = readAll(wb);
  const states = readStates(wb);
  const operators = readOperators(wb);
  const markets = readMarkets(wb, new Map(states.map((x) => [x.state, x.st])));
  console.log(`rows: ${rows.length} · states: ${states.length} · operators: ${operators.length} · markets: ${markets.length}`);
  console.log(`address not public: ${rows.filter((r) => r.notPublic).length} · no usable street: ${rows.filter((r) => !r.street && !r.notPublic).length}`);

  const cache = await loadCache();
  const geocodable = rows.filter((r): r is Row & { street: string } => r.street !== null);
  await geocodeBatch(geocodable.map((r) => ({ street: r.street, city: cleanPlace(r.city), state: r.st, zip: r.zip })), cache);

  const features: GeoJsonFeature[] = [];
  const unplaced: DcSummary["unplaced"] = [];
  const byStatus = Object.fromEntries(STATUSES.map((x) => [x, 0])) as Record<Status, number>;
  const byPlacement: DcSummary["byPlacement"] = { census: 0, osm: 0, override: 0, city: 0, market: 0 };
  const perState = new Map<string, { placed: number; byStatus: Record<Status, number> }>();
  const operatorsPlaced = new Set<string>();
  let osmCount = 0;

  for (const [n, r] of rows.entries()) {
    let lng: number | undefined, lat: number | undefined;
    let placement: DcProps["p"] = "census";
    let reason = r.notPublic ? "exact address not public" : r.street ? "no Census street match" : `no house number: "${r.rawStreet}"`;

    if (r.street) {
      const addr = { street: r.street, city: cleanPlace(r.city), state: r.st, zip: r.zip };
      const g = cache[addrKey(addr)];
      if (g && g.match === "Match" && g.lng != null && g.lat != null) {
        if (matchAgrees(g, addr)) {
          lng = g.lng;
          lat = g.lat;
        } else reason = "geocode disagrees on city and ZIP";
      }
    }
    if (lng == null && r.street) {
      const hit = await placeAddress(r.rawStreet.split(/\s+\/\s+/)[0], cleanPlace(r.city), r.st, zip5(r.zip));
      if (hit) {
        lng = hit.lng;
        lat = hit.lat;
        placement = "osm";
        osmCount++;
      }
    }
    if (lng == null) {
      const hit = await placeCity(r.city, r.st);
      if (hit) {
        lng = hit.lng;
        lat = hit.lat;
        placement = "city";
      }
    }
    if (lng == null && r.market) {
      const hit = await placeCity(cleanMarket(r.market, r.st), r.st);
      if (hit) {
        lng = hit.lng;
        lat = hit.lat;
        placement = "market";
      }
    }
    if (lng == null || lat == null) {
      unplaced.push({ name: r.name, operator: r.operator, city: r.city, st: r.st, reason: `${reason}; no city or market match` });
      continue;
    }

    const props: DcProps = {
      id: r.id,
      n: r.name,
      o: r.operator,
      city: r.city,
      st: r.st,
      mkt: r.market,
      s: r.status,
      raw: r.statusRaw,
      p: placement,
    };
    if (r.notPublic) props.np = 1;
    features.push({
      type: "Feature",
      properties: props,
      geometry: { type: "Point", coordinates: [Number(lng.toFixed(5)), Number(lat.toFixed(5))] },
    });
    byStatus[r.status]++;
    byPlacement[placement]++;
    operatorsPlaced.add(r.operator);
    const st = perState.get(r.st) ?? { placed: 0, byStatus: Object.fromEntries(STATUSES.map((x) => [x, 0])) as Record<Status, number> };
    st.placed++;
    st.byStatus[r.status]++;
    perState.set(r.st, st);
    if ((n + 1) % 250 === 0) console.log(`  ${n + 1}/${rows.length} rows processed`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const empty = () => Object.fromEntries(STATUSES.map((x) => [x, 0])) as Record<Status, number>;
  const summary: DcSummary = {
    built: today,
    facilities: features.length,
    operators: operatorsPlaced.size,
    states: perState.size,
    byState: states.map((x) => ({ ...x, placed: perState.get(x.st)?.placed ?? 0, byStatus: perState.get(x.st)?.byStatus ?? empty() })),
    byOperator: operators.sort((a, b) => b.facilities - a.facilities || a.operator.localeCompare(b.operator)),
    byMarket: markets.sort((a, b) => a.state.localeCompare(b.state) || a.market.localeCompare(b.market)),
    byStatus,
    byPlacement,
    addressNotPublic: rows.filter((r) => r.notPublic).length,
    unplaced,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "datacenters.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
  await writeFile(join(OUT_DIR, "datacenters-summary.json"), JSON.stringify(summary));
  const manifestPath = join(OUT_DIR, "manifest.json");
  let manifest: { scope?: string; layers?: Record<string, unknown> } = {};
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    manifest = { scope: "us" };
  }
  manifest.layers = {
    ...(manifest.layers ?? {}),
    "datacenters.geojson": {
      source: "Master_50State_DataCenters_All_Locations.xlsx",
      sourceSha256: createHash("sha256").update(workbook).digest("hex"),
      sheets: [SHEET_ALL, SHEET_STATE, SHEET_OPERATOR, SHEET_MARKET],
      columnsShipped: ["Name", "Operator", "City", "State Code", "Market", "Status"],
      columnsNeverShipped: ["Street Address (geocoding only)", "ZIP (geocoding only)", "Notes"],
      placement: {
        census: `US Census batch (${BENCHMARK}), street-level Match, ZIP or city agreement`,
        osm: "OpenStreetMap Nominatim building/campus object; road interpolations and highway/* rejected. © OpenStreetMap contributors, ODbL",
        city: "OpenStreetMap Nominatim city/town centroid; hollow ring, captioned approximate",
        market: "OpenStreetMap Nominatim centroid of the workbook's Market; hollow ring, captioned approximate",
        counts: byPlacement,
      },
      statusFolding: "20 workbook spellings → Active / Expanding / Building / Planned / Inactive (lib/match/datacenters.ts statusOf); raw text kept per point",
      rows: rows.length,
      placed: features.length,
      addressNotPublic: summary.addressNotPublic,
      unplaced: unplaced.length,
      built: today,
    },
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`placed ${features.length}/${rows.length} · ${operatorsPlaced.size} operators · ${perState.size} states · osm ${osmCount}`);
  console.log("by status:", byStatus);
  console.log("by placement:", byPlacement);
  if (unplaced.length) {
    console.log(`unplaced ${unplaced.length}:`);
    for (const u of unplaced) console.log(`  ${u.st} ${u.operator} — ${u.name} (${u.city}): ${u.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
