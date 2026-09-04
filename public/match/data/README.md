# Summit match layers

Clipped public polygons plus geocoded facilities for New York, Phoenix, Northern Virginia, Dallas, and Columbus.
Each metro is a folder so the demo only loads the geography on screen. Utah is added once its footprint is confirmed.

Per metro:

- `huc12.geojson`, `huc10.geojson`, `huc8.geojson` — USGS Watershed Boundary Dataset. Properties slimmed to `huc{n}` + `name`.
- `aquifers.geojson` — USGS Principal Aquifers of the United States (ScienceBase doi:10.5066/P9Y2HOUJ), clipped to the metro bbox.
- `facilities.geojson` — data centers from the master facilities workbook, filtered to the metro's cities, geocoded with the US Census batch geocoder. Street-level (rooftop / interpolated) matches only; anything the geocoder could not place is dropped, never approximated.
- `stewardship.geojson` — curated water commitments from the ESG workbook. A row renders only if `data/summit/stewardship-curation.json` includes it with a ≤160-char commitment in the company's own words and a company source URL that resolved at build. Properties: `company`, `facility`, `sector`, `commitment`, `source_url`. The workbook's fit/category/notes columns are never read for this layer.
- `manifest.json` — source (`usgs-services` interim, or `source-data` once rebuilt from the delivered layers), sha256 of each source file, feature counts, and the clip bbox.

Shared:

- `facilities-index.json` — compact `{ n, o, m, c }` (name, operator, metro, [lng, lat]) list for the typed-name search. Loaded only when the type field opens.

National (`us/`, the "All 50 states" view; loaded only when that view opens):

- `esg.geojson` — every facility row in the ESG workbook (414), one point each, coloured in the UI by the workbook's **Fit Category** (Legend tab: HydroCoin / Parjana / x402gal / Multiple / Other). Properties: `id`, `company`, `facility`, `sector`, `goal` (Sustainability/ESG Goal, unedited), `fit`, `state`, `st`, `city`, `source`, `placement`. Columns J (Parjana Product Fit) and M (Notes) are never shipped; Street Address is used for geocoding only.
- `placement` records how each point was placed, most to least precise: `census` (street-level Census match), `osm` (OpenStreetMap building/campus object — road interpolations rejected), `override` (cited record in `data/summit/esg-overrides.json`), `city` (city centre; drawn as a hollow ring and captioned approximate).
- `esg-summary.json` — the Summary by State and Summary by Company tabs with per-row `placed` counts, `byFit`, `byPlacement`, and the `approximate` / `unplaced` lists to take back to the workbook owner.
- `datacenters.geojson` — every row of the 50-state data center workbook (3,184), one point each, coloured in the UI by **status**. Short property keys because it ships to phones: `id`, `n` (name), `o` (operator), `city`, `st`, `mkt` (market), `s` (status folded to Active / Expanding / Building / Planned / Inactive — see `statusOf` in `lib/match/datacenters.ts`), `raw` (status as written), `p` (placement), `np` (1 when the workbook says "exact address not public"). Street Address and ZIP are used for geocoding only; Notes never ships.
- Placement tiers here are `census`, `osm`, `city`, and `market` (centre of the workbook's Market when the city itself cannot be found). The 161 "address not public" rows and the ~200 rows without a house number land in `city`/`market` on purpose: they still count toward their state and can be found by name, they just draw as hollow rings.
- `datacenters-summary.json` — the Summary by State (with per-state `placed` and `byStatus`), Summary by Operator, and Summary by Market tabs; `byStatus`, `byPlacement`, `addressNotPublic`, `unplaced`. The "Where do you live?" block reads the per-state totals from here and rolls them up by US Census division and region (`lib/match/states.ts`).
- `manifest.json` — workbook sha256, sheets and columns read, placement method per tier, every OSM object and override used.

Regenerate:

- Polygons: `npm run match:clip` (interim, USGS services) or `npm run match:clip -- --source=source-data` once the full delivery (HUC12/10/8 `.shp` + `.dbf` + `.shx` + `.prj`, aquifers) is in `source-data/`.
- Facilities: `npm run match:facilities -- --xlsx=source-data/Master_50State_DataCenters_All_Locations.xlsx`.
- Stewardship: `npm run match:stewardship -- --xlsx=source-data/Master_50State_ESG_Companies_All_Locations.xlsx` (lists any in-metro row not yet in the curation file).
- National ESG: `npm run match:esg -- --xlsx=source-data/Master_50State_ESG_Companies_All_Locations.xlsx` (Census batch, then Nominatim at ≤1 req/s for the fallbacks — a cold run takes ~4 min; both caches live in `source-data/`).
- National data centers: `npm run match:datacenters -- --xlsx=source-data/Master_50State_DataCenters_All_Locations.xlsx` (same pipeline; a cold run takes ~15 min because ~800 rows fall through to Nominatim).

Do not call these services at demo time. Everything the instrument reads is in this folder.
