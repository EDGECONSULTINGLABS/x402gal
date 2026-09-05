# The Summit instrument (`/match`)

A phone-sized web app for the Avalanche Summit floor in New York, 16 September 2026. One sentence
it serves: **give me one of your data center locations and I will show you the water around it.**

It runs at `/match` inside the x402GAL Next.js app. It is not the payments product — it is the
conversation-opener the team carries on a phone, and it is built so that nothing on it can be
mistaken for a measurement, an offer, or a token.

---

## What a person experiences

Roughly ninety seconds, in this order. Steps 2–3 work with the network off; the rest degrade
gracefully.

| # | Screen | What happens | Where the code is |
|---|---|---|---|
| 1 | **Gate** | A living water surface (canvas: ripples on tap, heat on hold, lava-lamp blobs underneath; no map, no tile request). "Six fields, then the map." Name, email, company, role, what brought you here, consent. A returning phone skips this. | `components/match/Gate.tsx`, `WaterSurface.tsx`, `lib/match/attendee.ts` |
| 2 | **Place** | Choose a metro (New York, Phoenix, Northern Virginia, Dallas, Columbus, Utah), or type a facility / city / zip (local, instant, sloppy input accepted), or open the national views. | `components/match/MatchApp.tsx`, `lib/match/aliases.ts` |
| 3 | **Watershed** | Satellite map, a pin, and the USGS hierarchy that drains past it: subwatershed (HUC12) → watershed (HUC10) → subbasin (HUC8), plus the principal aquifer. Data centers within the radius, flagged when they share the subwatershed. Curated water-stewardship commitments nearby. In Utah, the project footprint. Tap any glossary word for a definition; in New York the definition adds the "your tap water comes from upstate" lesson. | `MatchApp.tsx`, `MatchMap.tsx`, `lib/match/watershed.ts`, `GlossaryTerm.tsx` |
| 4 | **Assess** | Three taps: how much text AI a day, how often images/video, where you are based. | `components/match/Assessment.tsx`, `lib/match/assessment.ts` |
| 5 | **Result** | "About 70 mL a day", bottles and gallons a year, in a dashed **Estimated** block with the methodology name, edition, hash and a link to the published methodology. Then: *Your AI's water didn't come from here* → tap to see the watershed it draws from. | `Assessment.tsx`, `app/match/methodology/page.tsx` |
| 6 | **Map handoff** | Back to the map, pin on the listed facility nearest that metro's centre. The **What you just saw** screen puts Measured (watershed lines, facility points) and Estimated (the number) side by side, one sentence each. | `MatchApp.tsx` (`step === "close"`) |
| 7 | **Learn** | Four short screens: you are standing in a watershed · where the water goes · what a verified gallon is · why retirement matters. | `components/match/Learn.tsx`, `lib/match/learn.ts` |
| 8 | **Badge** | A code (`HC-XXX-XXX`) derived from the email. *Show this to anyone on the x402GAL team for your coin.* The coin is a physical keepsake; nothing on-chain attaches to it. | `components/match/Badge.tsx` |
| 9 | Continue | An optional x402 payment demonstration was scoped last. **Not built.** The badge screen links to the x402GAL/HydroCoin site instead. | — |

Two national views hang off the Place screen: every data center in the 50 states (3,184 rows,
coloured by status, "where do you live" state counts) and every company with a published water
goal (414 rows, coloured by fit). They are browse-everything companions to the per-metro layers.

---

## The rules the whole thing is built around

These are decisions, recorded in `docs/summit-launch-spec.md` and the session notes; changing one
means saying so.

- **Measured and estimated are never the same colour.** Solid teal border = measured (public
  geometry, geocoded points). Dashed grey border = estimated (the assessment). The "What you just
  saw" screen exists to make that distinction explicit.
- **One line on every map screen:** *Estimates only. Nothing here is a measurement, an offer, or a
  water right.* (`lib/match/legal.ts`, panel footer, outside the scroll.)
- **No on-chain anything attaches to completion.** The coin is a keepsake and is described as one.
  Nothing is minted or for sale on the floor.
- **Never approximate a facility onto a city centre** in a metro layer. Street-level geocode or a
  cited override, or the row is dropped. (The national browse layers *do* place unplaceable rows at
  city/market centres, drawn as hollow rings and captioned "approximate", because counting is the
  point there.)
- **Nothing calls a geocoder, a tile clip service or a spreadsheet at demo time.** Everything the
  instrument reads is a static file under `public/match/data/`, built once by scripts.
- **No location prompt, ever.** The app does not call `navigator.geolocation`. The metro picker is
  the location.
- **Never scold.** No "heavy user". The person holding the phone is the buyer.
- **No internal vocabulary in empty states.** Copy says "subwatershed", not "HUC12", unless it is
  showing the code.

---

## The estimate and its hash

`lib/footprint.ts` is the x402GAL footprint model (Green Grid WUE v1, boundary-aware split):

```
W_site = WUE × [(T_in/1000)*e_in + (T_out/1000)*e_out + e_overhead] × F_boundary
```

`lib/match/assessment.ts` maps the three taps onto it: the text bucket becomes tokens in/out, the
image bucket becomes a fixed kWh overhead, the metro only chooses the map handoff. Site mode only
(water at the data center; no upstream power-plant water, no hardware lifecycle). Results are
rounded to one significant figure until the coefficient owner signs off.

The line on the result screen — `2026-09 edition · sha256:7f27ac…` — is two things:

- **Edition** (`METHODOLOGY_VERSION`) bumps when the question tables change.
- **Hash** (`FOOTPRINT_METHODOLOGY_HASH`) is SHA-256 of `METHODOLOGY_PAYLOAD_JSON`: spec, formula,
  references and the three default tables, in that key order. `npm run hash:methodology`
  recomputes it; if the model's constants change, the pinned string must be updated.

`/match/methodology` is the document that line resolves to. It is public (outside the preview
gate), rendered from the same constants the app computes with, and shows the exact hashed string
so anyone can re-hash it. If that page ever stops matching, the version line comes off the result
screen.

---

## Data: six metros, one folder each

`public/match/data/<metro>/` — see `public/match/data/README.md` for the field-level detail.

| File | What | Built by |
|---|---|---|
| `huc12/huc10/huc8.geojson` | USGS Watershed Boundary Dataset, clipped to the metro bbox, slimmed to code + name | `npm run match:clip` |
| `aquifers.geojson` | USGS Principal Aquifers, clipped | `npm run match:clip` |
| `facilities.geojson` | Data centers from Joe's 50-state workbook, Active rows in the metro's cities, Census-geocoded to the street | `npm run match:facilities` |
| `stewardship.geojson` | Water commitments from the ESG workbook, only rows curated in `data/summit/stewardship-curation.json` with a ≤160-char quote and a source URL that resolved at build | `npm run match:stewardship` |
| `footprint.geojson` | Optional. Utah only today: the three Stratos parcels and Salt Wells Spring from Joe's KMZ, drawn as dashed outlines | `npm run match:footprint` |
| `candidates.geojson` | Candidate project locations with a `display_public` flag. Empty everywhere; the UI says so | — |
| `manifest.json` | Source, sha256 of source files, feature counts, every coordinate override with its citation | all of the above |

Shared: `facilities-index.json` (typed-name search; loaded only when the type field opens) and
`us/` (the two national layers plus summaries; loaded only when a national view opens).

**Metros.** `lib/match/metros.ts` is the single list (id, name, centre, zoom, bbox);
`metroCities.ts` says which workbook cities/markets belong to each; `aliases.ts` handles what
people type. Utah was the sixth, added 2026-09-04 once Joe delivered the Stratos site
(Hansel Valley, Box Elder County); its facility row is placed by a cited override in
`data/summit/facility-overrides.json` because the sheet address is a road intersection the Census
geocoder cannot match, and its status is corrected from the workbook's "Active" to
"Proposed (Phase 1)" with the reason recorded.

**Provenance still to close.** The polygons are currently clipped from USGS services ("interim"
in every manifest). The spec wants them rebuilt from Zina's Drive layers so the demo polygons are
byte-for-byte the engineering polygons; `match:clip -- --source=source-data` is wired for it and
waits on the full `.shp + .dbf + .shx + .prj` delivery. Joe's workbook credits commercial
directories (Data Center Map, Baxtel, cloudandcolocation) — fine for the floor, confirm before it
is handed to anyone else.

Source workbooks and geocode caches live in `source-data/` (gitignored). Delivered artefacts with
provenance value (Joe's KMZ, the GSL salinity chart, curation and override files) live in
`data/summit/` (committed).

---

## Attendees, codes and privacy

- The gate writes one record to `localStorage` (`x402gal.summit.attendee`) and POSTs it to
  `/api/match/attend` (Upstash Redis, one record per email per event, later posts patch it:
  metro chosen, assessment result, badge time). If the POST fails the record is queued and retried
  on `online`.
- **Badge code** = `HC-` + six characters from SHA-256 of `eventId:email`, unambiguous alphabet.
  Computed on the phone and reproducible on the server, so the team can verify a code without the
  phone.
- **Export**: `GET /api/match/attendees` returns CSV, gated by the existing `/leads` session cookie.
- **What is never stored**: device location (never requested), the workbook's Notes columns, the
  ESG file's fit/notes columns, anything from the glossary or learn taps.
- Consent copy is rendered verbatim from `CONSENT_COPY` in `lib/match/attendee.ts`.

---

## Environments

| Where | Gate | Data |
|---|---|---|
| `npm run dev` → `http://localhost:3000/match` | attendee gate only | reads `public/match/data/` |
| Vercel **Preview** | password gate first (`PREVIEW_PASSWORD`, allow-listed emails, signed cookie), then the attendee gate | same |
| Vercel **Production** | attendee gate only | same |

`/match/methodology` is never behind the password gate — it has to be openable by anyone who reads
the hash off a phone.

Environment variables the instrument touches: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
(attendee capture; without them the app still runs, records stay on the phone),
`PREVIEW_PASSWORD`, `PREVIEW_SESSION_SECRET`, `FORCE_PREVIEW_GATE` (=1 to force the password gate
locally), `NEXT_PUBLIC_SUMMIT_GEOFENCE` (=nyc to force the New York lesson in rehearsal; `?at=nyc`
on the URL does the same).

---

## Performance and offline

- Every control answers in under 400 ms on the venue phone; that is the bar, not a target.
- One metro's layers load on selection, never all six on first paint. Phoenix HUC12 is simplified
  (`mapshaper -simplify`, visually lossless at metro zoom) because raw vertex density exceeds what a
  phone renders.
- Base map is Esri World Imagery with an automatic fall-back to OpenStreetMap raster tiles when the
  imagery source errors. The base map is the one thing that needs the network; the polygons, points
  and the resolver do not, so on a dead hotspot the sheet still tells you the watershed.
- The gate makes zero external requests (verified). The first thing a stranger sees is not a tile.
- `prefers-reduced-motion` stops the watershed draw animation, freezes the lava lamp and reduces a
  tap on the water to one fading ring.

---

## Running it

```bash
npm install
npm run dev                      # http://localhost:3000/match
npx tsc --noEmit                 # type-check
npx eslint components/match lib/match app/match
```

Rebuilding data (never at demo time):

```bash
npm run match:clip                                   # polygons, USGS services (interim)
npm run match:clip -- --source=source-data           # polygons from Zina's layers, once delivered
npx tsx scripts/build-facilities.ts --xlsx="<Master_50State_DataCenters_All_Locations.xlsx>"
npx tsx scripts/build-stewardship.ts --xlsx="<Master_50State_ESG_Companies_All_Locations.xlsx>"
npx tsx scripts/build-esg.ts --xlsx="<ESG workbook>"          # national, ~4 min cold
npx tsx scripts/build-datacenters.ts --xlsx="<DC workbook>"   # national, ~15–20 min cold
npx tsx scripts/build-footprint.ts --metro=utah --kmz=data/summit/utah/Stratos_GSL_Water_Atlas_1.kmz "--folder=Stratos project"
npm run hash:methodology                              # after touching lib/footprint.ts constants
```

On Windows PowerShell pass script flags directly to `npx tsx …` — `npm run … -- --flag` swallows
the `--`. Geocode caches in `source-data/` make warm rebuilds take seconds; do not clear them casually.

---

## Code map

```
app/match/
  page.tsx                 preview gate → SummitApp
  methodology/page.tsx     the public methodology document
  layout.tsx, tokens.css   DM Sans / DM Mono, HydroCoin brand tokens
app/api/match/
  attend/route.ts          attendee capture (Redis)
  attendees/route.ts       CSV export (leads cookie)
  geocode/route.ts         typed-address geocode, Census, restricted to the metros
components/match/
  SummitApp.tsx            the stage machine: gate → instrument → assess → learn → badge
  Gate.tsx, WaterSurface.tsx
  MatchApp.tsx             place / watershed / close / national — the instrument
  MatchMap.tsx             MapLibre: base, WBD, aquifers, facilities, footprint, national points
  Assessment.tsx, Learn.tsx, Badge.tsx
  GlossaryTerm.tsx         tap-to-define, New York lesson
  DcPanel.tsx, EsgPanel.tsx, Dot.tsx, Lockup.tsx
lib/match/
  metros.ts, metroCities.ts, aliases.ts      where
  watershed.ts, geo.ts, facilities.ts        resolving a point against loaded layers
  assessment.ts, legal.ts                    the estimate, its label, the legal line
  attendee.ts                                record shape, consent copy, badge code, redeem copy
  learn.ts, glossary.ts, surfaceFacts.ts     copy
  datacenters.ts, esg.ts, states.ts          national layers
lib/footprint.ts           the hashed model
scripts/                   clip-summit-geodata, build-facilities, build-stewardship, build-esg,
                           build-datacenters, build-footprint, hash-methodology, check-resolve
public/match/data/         everything the phone reads
data/summit/               curation, overrides, delivered artefacts (committed)
source-data/               workbooks, shapefiles, geocode caches (gitignored)
docs/summit-launch-spec.md the controlling spec; decisions and their dates
```

Session-by-session decisions, gotchas and QA scripts live in the HydroCoin repo under
`.agent/sessions/` (tags `summit`, `gis`, `map`, `geocoding`, `data-pipeline`).

---

## What is true on the floor, and what is not

True:
- Six metros resolve a tap to subwatershed / watershed / subbasin / aquifer offline.
- 342 data centers placed at street level across the metros; 3,184 browsable nationally.
- The estimate is labelled, versioned and hashed, and the hash resolves to a public document.
- A code the team can verify without the phone; a physical coin; consent captured verbatim.

Not true, and not implied anywhere on screen:
- No token, credit or allocation is issued for completing the loop.
- No facility's water use is measured. The polygons are public geometry; the points are
  directory addresses.
- The x402 payment continuation is not built.
- Candidate project locations are not shown (none are marked public).
- The watershed polygons are not yet rebuilt from the engineering team's own layers.
- The assessment coefficients are not signed off (hence one significant figure).

---

## QA

Each session note carries a numbered `## QA Steps` block that is sent verbatim to QA. The standing
checks: the whole loop on the venue phone over hotspot Wi-Fi; airplane mode after the gate (the
sheet must still resolve); ten minutes of holding the water surface (heat, battery); no location
prompt anywhere; every map screen shows the legal line; the result-screen hash matches
`/match/methodology`; a non-developer runs the demo unaided.
