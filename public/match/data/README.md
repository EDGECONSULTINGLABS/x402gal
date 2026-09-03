# Summit match layers

Clipped public USGS polygons for New York, Phoenix, Northern Virginia, Dallas, and Columbus.
Each metro is a folder so the demo only loads the geography on screen.

- `{metro}/huc12.geojson` … `huc6.geojson` — USGS Watershed Boundary Dataset (The National Map).
- `{metro}/aquifers.geojson` — USGS Principal Aquifers of the United States (ScienceBase doi:10.5066/P9Y2HOUJ), clipped to that metro.
- `facilities.geojson` / `candidates.geojson` — empty until the client packet is parsed. Do not invent points.

Regenerate with `npm run match:clip`. Do not call these services at demo time.
