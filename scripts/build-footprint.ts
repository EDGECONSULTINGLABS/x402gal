/**
 * Site footprint — a delivered KMZ → public/match/data/<metro>/footprint.geojson.
 *
 *   npm run match:footprint -- --metro=utah --kmz=data/summit/utah/Stratos_GSL_Water_Atlas_1.kmz --folder="Stratos project"
 *
 * Takes the placemarks of ONE named folder in the KMZ and ships them as the metro's project
 * footprint: parcel outlines and the water source the project applied for. Everything else in the
 * atlas (contamination sites, basin water-quality zones, 55 reconnaissance wells, the soil transect)
 * stays in the KMZ under data/summit/<metro>/ for engineering — it is either far outside the metro
 * bbox or too uncertain (±0.25–0.5 mi) to put on a phone next to a survey-grade watershed line.
 *
 * Properties shipped: name, kind (parcel | source | site), lead (the bold first line of the
 * placemark's note), precision (the caveat in parentheses after it, if any), source_url.
 * The facility pin itself is not duplicated here — it is in facilities.geojson through
 * data/summit/facility-overrides.json, which cites the same placemark.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { METROS, pointInBbox, type MetroId } from "../lib/match/metros";
import type { GeoJsonFeature } from "../lib/match/types";
import { OUT, ROOT, arg, patchManifest } from "./lib/geocode";

type Kind = "parcel" | "source" | "site";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&deg;/g, "°")
    .replace(/&plusmn;/g, "±")
    .replace(/&nbsp;/g, " ");
}

function text(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (cdata) v = cdata[1];
  return decodeEntities(v);
}

function coords(raw: string): [number, number][] {
  return raw
    .trim()
    .split(/\s+/)
    .map((triple) => triple.split(",").map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [Number(c[0].toFixed(6)), Number(c[1].toFixed(6))]);
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** The folder's own <Placemark> blocks, not those of nested folders. */
function folderPlacemarks(kml: string, folderName: string): string[] {
  const folders = kml.split(/<Folder>/).slice(1);
  const hit = folders.find((f) => text(f, "name") === folderName);
  if (!hit) throw new Error(`no <Folder> named "${folderName}" in the KML`);
  const body = hit.slice(0, hit.indexOf("</Folder>"));
  return body.match(/<Placemark>[\s\S]*?<\/Placemark>/g) ?? [];
}

function kindOf(block: string, name: string): Kind | null {
  if (/<Polygon>/.test(block)) return "parcel";
  if (/#style-datacenter/.test(block)) return null; // the facility pin lives in facilities.geojson
  if (/spring|well|creek|river|aquifer/i.test(name)) return "source";
  return "site";
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function readKml(kmzPath: string): Promise<{ kml: string; hash: string }> {
  const buf = await readFile(kmzPath);
  if (kmzPath.toLowerCase().endsWith(".kml")) return { kml: buf.toString("utf8"), hash: sha256(buf) };
  const dir = await mkdtemp(join(tmpdir(), "summit-kmz-"));
  try {
    if (process.platform === "win32") execFileSync("tar", ["-xf", kmzPath, "-C", dir]);
    else execFileSync("unzip", ["-o", kmzPath, "-d", dir]);
    const names = await readdir(dir);
    const kmlName = names.find((n) => n.toLowerCase().endsWith(".kml"));
    if (!kmlName) throw new Error(`no .kml inside ${kmzPath}`);
    return { kml: await readFile(join(dir, kmlName), "utf8"), hash: sha256(buf) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  const metroId = arg("metro") as MetroId | undefined;
  const kmzArg = arg("kmz");
  const folder = arg("folder");
  if (!metroId || !kmzArg || !folder) throw new Error("--metro=<id> --kmz=<path> --folder=<KML folder name> are required");
  const metro = METROS.find((m) => m.id === metroId);
  if (!metro) throw new Error(`unknown metro: ${metroId}`);

  const kmzPath = resolve(ROOT, kmzArg);
  const { kml, hash } = await readKml(kmzPath);
  const features: GeoJsonFeature[] = [];
  const skipped: string[] = [];

  for (const block of folderPlacemarks(kml, folder)) {
    const name = text(block, "name") ?? "unnamed";
    const kind = kindOf(block, name);
    if (!kind) {
      skipped.push(`${name} (facility pin — see facilities.geojson)`);
      continue;
    }
    const description = text(block, "description") ?? "";
    const lead = stripTags(description.match(/<b>([\s\S]*?)<\/b>/)?.[1] ?? "");
    const precision = description.match(/<\/b>\s*\(([^)]*)\)/)?.[1]?.trim() ?? null;
    const sourceUrl = description.match(/href="([^"]+)"/)?.[1] ?? null;

    let geometry: GeoJsonFeature["geometry"];
    if (kind === "parcel") {
      const ring = coords(text(block, "coordinates") ?? "");
      if (ring.length < 4) {
        skipped.push(`${name} (degenerate ring)`);
        continue;
      }
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
      geometry = { type: "Polygon", coordinates: [ring] };
    } else {
      const [pt] = coords(text(block, "coordinates") ?? "");
      if (!pt) {
        skipped.push(`${name} (no point)`);
        continue;
      }
      geometry = { type: "Point", coordinates: pt };
    }

    const probe = geometry.type === "Point" ? (geometry.coordinates as [number, number]) : (geometry.coordinates as [number, number][][])[0][0];
    if (!pointInBbox(probe[0], probe[1], metro.bbox)) {
      skipped.push(`${name} (outside ${metro.id} bbox)`);
      continue;
    }

    features.push({
      type: "Feature",
      properties: {
        name,
        kind,
        lead,
        ...(precision ? { precision } : {}),
        ...(sourceUrl ? { source_url: sourceUrl } : {}),
      },
      geometry,
    });
  }

  const json = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(join(OUT, metro.id, "footprint.geojson"), json);
  console.log(`${metro.id}/footprint.geojson ${features.length} features ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`);
  for (const f of features) console.log(`  + ${f.properties?.kind}  ${f.properties?.name}  — ${f.properties?.lead}`);
  for (const s of skipped) console.log(`  - ${s}`);

  await patchManifest(metro.id, "footprint.geojson", {
    features: features.length,
    bytes: Buffer.byteLength(json),
    source: `${kmzArg} folder "${folder}"`,
    sha256: hash,
    note: "Parcel boundaries were digitized from a parcel-map screen capture and georeferenced to the confirmed site point; not surveyed. Shown as outlines, never as a fill that reads as a measured boundary.",
    built: new Date().toISOString().slice(0, 10),
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
