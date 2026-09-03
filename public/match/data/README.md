# Summit match layers

Clipped public polygons plus geocoded facilities for New York, Phoenix, Northern Virginia, Dallas, and Columbus.
Each metro is a folder so the demo only loads the geography on screen. Utah is added once its footprint is confirmed.

Per metro:

- `huc12.geojson`, `huc10.geojson`, `huc8.geojson` — USGS Watershed Boundary Dataset. Properties slimmed to `huc{n}` + `name`.
- `aquifers.geojson` — USGS Principal Aquifers of the United States (ScienceBase doi:10.5066/P9Y2HOUJ), clipped to the metro bbox.
- `facilities.geojson` — data centers from the master facilities workbook, filtered to the metro's cities, geocoded with the US Census batch geocoder. Street-level (rooftop / interpolated) matches only; anything the geocoder could not place is dropped, never approximated.
- `manifest.json` — source (`usgs-services` interim, or `source-data` once rebuilt from the delivered layers), sha256 of each source file, feature counts, and the clip bbox.

Shared:

- `facilities-index.json` — compact `{ n, o, m, c }` (name, operator, metro, [lng, lat]) list for the typed-name search. Loaded only when the type field opens.

Regenerate:

- Polygons: `npm run match:clip` (interim, USGS services) or `npm run match:clip -- --source=source-data` once the full delivery (HUC12/10/8 `.shp` + `.dbf` + `.shx` + `.prj`, aquifers) is in `source-data/`.
- Facilities: `npm run match:facilities -- --xlsx=source-data/Master_50State_DataCenters_All_Locations.xlsx`.

Do not call these services at demo time. Everything the instrument reads is in this folder.
