# Summit match layers

Clipped public polygons plus geocoded facilities for New York, Phoenix, Northern Virginia, Dallas, and Columbus.
Each metro is a folder so the demo only loads the geography on screen. Utah is added once its footprint is confirmed.

Per metro:

- `huc12.geojson`, `huc10.geojson`, `huc8.geojson` — USGS Watershed Boundary Dataset. Properties slimmed to `huc{n}` + `name`.
- `aquifers.geojson` — USGS Principal Aquifers of the United States (ScienceBase doi:10.5066/P9Y2HOUJ), clipped to the metro bbox.
- `facilities.geojson` — data centers from the master facilities workbook, filtered to the metro's cities, geocoded with the US Census batch geocoder. Street-level (rooftop / interpolated) matches only; anything the geocoder could not place is dropped, never approximated.
- `stewardship.geojson` — curated water commitments from the ESG workbook. A row renders only if `data/summit/stewardship-curation.json` includes it with a ≤160-char commitment in the company's own words and a company source URL that resolved at build. Properties: `company`, `facility`, `sector`, `commitment`, `source_url`. The workbook's fit/category/notes columns are never read.
- `manifest.json` — source (`usgs-services` interim, or `source-data` once rebuilt from the delivered layers), sha256 of each source file, feature counts, and the clip bbox.

Shared:

- `facilities-index.json` — compact `{ n, o, m, c }` (name, operator, metro, [lng, lat]) list for the typed-name search. Loaded only when the type field opens.

Regenerate:

- Polygons: `npm run match:clip` (interim, USGS services) or `npm run match:clip -- --source=source-data` once the full delivery (HUC12/10/8 `.shp` + `.dbf` + `.shx` + `.prj`, aquifers) is in `source-data/`.
- Facilities: `npm run match:facilities -- --xlsx=source-data/Master_50State_DataCenters_All_Locations.xlsx`.
- Stewardship: `npm run match:stewardship -- --xlsx=source-data/Master_50State_ESG_Companies_All_Locations.xlsx` (lists any in-metro row not yet in the curation file).

Do not call these services at demo time. Everything the instrument reads is in this folder.
