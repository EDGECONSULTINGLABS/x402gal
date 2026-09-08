/**
 * Build gate: the ESG workbook's fit columns must not reach anything we ship.
 *
 *   npm run build            → next build && tsx scripts/check-fit-absent.ts
 *   npm run match:check-fit  → the check alone (needs a prior `next build`)
 *
 * Joe confirmed on the engineering review call (8 Sep 2026) that column J "Parjana Product Fit" and
 * column K "Fit Category" (values HydroCoin / Parjana / x402gal / Multiple / Other) were for
 * internal use only. spec §5 already excludes them; this makes the exclusion fail loudly.
 *
 * What is scanned, and how:
 *   public/match/data/**   every JSON/GeoJSON we serve. Fails on the column names as text, on any
 *                          object key named fit / byFit / fitCategory / productFit, and on any string
 *                          VALUE equal to one of the five category values (exact, case-insensitive) —
 *                          a category riding along as a property is the way this leaks.
 *   .next/**               the compiled app (client chunks, server bundles, prerendered pages). Fails
 *                          on the column names, the identifiers the old code used (FIT_CATEGORIES,
 *                          byFit, fitCategory), the old legend labels, and the map expression
 *                          ["get","fit"]. The bare brand names are NOT forbidden in code — HydroCoin,
 *                          Parjana and x402gal are on the landing page by right — so the data scan is
 *                          where the category values themselves are caught.
 *
 * Exit 1 with file + excerpt on any hit. Exit 2 if .next is missing (run the build first).
 */
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const DATA_DIR = join(ROOT, "public", "match", "data");
const NEXT_DIR = join(ROOT, ".next");

const COLUMN_NAMES = ["Fit Category", "Product Fit"];
const CATEGORY_VALUES = ["HydroCoin", "Parjana", "x402gal", "Multiple", "Other"].map((v) => v.toLowerCase());
const FORBIDDEN_KEYS = new Set(["fit", "byfit", "fitcategory", "productfit", "fit category", "parjana product fit"]);
const CODE_PHRASES = [
  ...COLUMN_NAMES,
  "FIT_CATEGORIES",
  "FIT_COLOR_EXPR",
  "fitCategory",
  "byFit",
  "Multiple fits",
  "Parjana / IRIS",
  '["get","fit"]',
  '"get","fit"',
];
const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".html", ".json", ".rsc", ".txt", ".body", ".map"]);

type Hit = { file: string; what: string; excerpt: string };
const hits: Hit[] = [];

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const st = await stat(p);
    if (st.isDirectory()) {
      if (name === "cache") continue; // .next/cache is webpack's, not shipped
      await walk(p, out);
    } else out.push(p);
  }
  return out;
}

function excerpt(text: string, index: number): string {
  return text.slice(Math.max(0, index - 60), index + 80).replace(/\s+/g, " ");
}

function scanText(file: string, text: string, phrases: string[]) {
  const lower = text.toLowerCase();
  for (const phrase of phrases) {
    const i = lower.indexOf(phrase.toLowerCase());
    if (i >= 0) hits.push({ file, what: `phrase "${phrase}"`, excerpt: excerpt(text, i) });
  }
}

function scanJson(file: string, value: unknown, path: string) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => scanJson(file, v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) hits.push({ file, what: `key "${k}"`, excerpt: `${path}.${k}` });
      scanJson(file, v, `${path}.${k}`);
    }
    return;
  }
  if (typeof value === "string" && CATEGORY_VALUES.includes(value.trim().toLowerCase())) {
    hits.push({ file, what: `category value "${value}"`, excerpt: path });
  }
}

async function main() {
  const dataFiles = (await walk(DATA_DIR)).filter((f) => /\.(geo)?json$/i.test(f));
  for (const f of dataFiles) {
    const text = await readFile(f, "utf8");
    const rel = relative(ROOT, f);
    scanText(rel, text, COLUMN_NAMES);
    try {
      scanJson(rel, JSON.parse(text), "$");
    } catch (err) {
      hits.push({ file: rel, what: "unparseable JSON", excerpt: (err as Error).message });
    }
  }

  if (!existsSync(NEXT_DIR)) {
    console.error("check-fit-absent: .next not found — run `next build` first.");
    process.exit(2);
  }
  const codeFiles = (await walk(NEXT_DIR)).filter((f) => CODE_EXT.has(f.slice(f.lastIndexOf(".")).toLowerCase()));
  for (const f of codeFiles) {
    scanText(relative(ROOT, f), await readFile(f, "utf8"), CODE_PHRASES);
  }

  console.log(`check-fit-absent: ${dataFiles.length} data files, ${codeFiles.length} build files scanned.`);
  if (hits.length) {
    console.error(`FAIL — ${hits.length} fit-category leak(s):`);
    for (const h of hits) console.error(`  ${h.file}: ${h.what}\n    …${h.excerpt}…`);
    process.exit(1);
  }
  console.log("OK — no fit column, key, or category value in the shipped bundle.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
