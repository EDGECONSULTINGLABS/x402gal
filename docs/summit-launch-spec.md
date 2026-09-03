<!-- Filed verbatim from the 3 September 2026 launch spec. Controlling document for the Summit build; edits go through the author. -->

# x402GAL WATER INTELLIGENCE — SUMMIT LAUNCH SPEC

**Date:** 3 September 2026
**Event:** Avalanche Summit, Chelsea Industrial, New York, 16–17 September
**Repo:** `x402gal`, branch `feat/summit-match`
**Status:** controlling. Supersedes `summit-mvp-brief.md`, `summit-teaching-addendum.md` §C, and `summit-design-directive.md` §3. Where anything conflicts with this file, this file wins.

---

## 0. WHAT CHANGED ON THE 3 SEPTEMBER CALL

Read this before touching code. Several earlier instructions are reversed.

| Earlier instruction | Now |
|---|---|
| No accounts, no gating | **Gated access with attendee capture is the front door** |
| Education module: do not build | **Build it.** Assessment → learn → badge → physical coin at the booth |
| Visual design diverges from campaign graphics | **Align to HydroCoin's blue gradient.** One visual system across ads, site, app, booth |
| Four metros | **Six.** Add NYC (venue) and Utah |
| Car analogy for the assessment | **Dropped.** Compare water to water |
| Demand layer: consumed from a service | **Built here from supplied files** |

Interaction constraints (400ms, one primary action, sloppy input, complexity on screen, ending that cannot fail, empty-as-direction, build the demo then stop) are unchanged.

---

## 1. THE EXPERIENCE, END TO END

A person on a phone, on the floor, in about ninety seconds.

```
1. GATE        name · email · company · role · what brought you · consent
2. PLACE       type or pick a facility → watershed + aquifer draw around it
3. NEIGHBORS   nearby data centers · candidate projects · stewardship (radius, same-watershed)
4. ASSESS      3–4 questions → estimated daily water, in bottles and gallons
5. MAP IT      "your AI drinks from here" → representative facility's watershed
6. LEARN       glossary terms, tapped in place; short teaching sequence
7. BADGE       completion record + a code
8. BOOTH       "show this at the booth" → physical HydroCoin keepsake, conversation
9. CONTINUE    optional: x402 payment demonstration (testnet)
```

Steps 2–3 are the instrument and must work with the network off. Steps 4–8 are the loop. Step 9 is optional and last.

**The one sentence the whole thing serves:** *give me one of your data center locations and I will show you the water around it.*

---

## 2. METROS

| Key | Coverage | Why |
|---|---|---|
| `nyc` | Chelsea / Manhattan clip | Venue. The glossary hook (city water comes from upstate) lands standing in it |
| `phoenix` | Phoenix metro | Demand geography |
| `nova` | Ashburn–Sterling–Manassas corridor | Densest facility set (258 rows) |
| `dallas` | DFW | 123 rows |
| `columbus` | Columbus / New Albany | 50 rows |
| `utah` | Northern Utah corridor | Specific target conversation. **Confirm the facility location with Joe before clipping** — do not guess it |

Load one metro at a time on selection. Never pull all six on first paint. Phoenix at 1.4M needs simplification (`mapshaper -simplify` at a visually lossless tolerance) — HUC12 vertex density far exceeds what a phone renders at metro zoom.

---

## 3. GEODATA — REBUILD FROM ZINA'S LAYERS

Source: Drive folder **Watershed Boundary** (owner parjanad), four subfolders:

| Folder | Layer | USGS name for it |
|---|---|---|
| `huc8_conus` | HUC8 | Subbasin |
| `WBDHU10` | HUC10 | Watershed |
| `HUC12` | HUC12 | Subwatershed |
| `aquifers_us` | Principal aquifers | — |

Two rules:

1. **Rebuild every metro clip from these files, not from a separate USGS download.** The point is provenance: the polygons Joe demos are the polygons the engineering team works from. Record the source folder and file hash in `public/match/data/<metro>/manifest.json`.
2. **Add HUC10.** The hierarchy on tap is HUC12 → HUC10 → HUC8. Use USGS names in the UI (subwatershed / watershed / subbasin) so the app and the engineers say the same words.

Extend `match:clip` for this. Do not write a second clipping path.

---

## 4. FACILITY DATA — JOE'S MASTER FILE

`Master_50State_DataCenters_All_Locations.xlsx`, sheet **All Facilities (All States)**. Header is row 3, data starts row 4. 3,184 rows.

| Col | Field | Use |
|---|---|---|
| A | State | filter |
| B | Name | display name |
| C | Operator | display |
| D | Street Address | geocode input |
| E | City | geocode input, metro filter |
| F | State Code | filter |
| G | ZIP | geocode input |
| H | Market | secondary metro filter |
| I | Status | keep Active only |
| J | Notes | **drop** — internal |

**No coordinates in the file.** Geocode offline, once, as a build step:

- Filter to the six metros first (~500 rows), then geocode. Not the reverse.
- Use the US Census Geocoder batch endpoint (free, no key, CSV up to 10,000 rows). The app's existing `app/api/match/geocode` already falls back to Census; reuse that logic in the script.
- Match quality: keep `Match` + `Exact`/`Non_Exact` with rooftop or street-level. **Drop anything that resolves to ZIP centroid or fails.** Do not approximate a facility onto a city center.
- Output `public/match/data/<metro>/facilities.geojson`, properties: `name`, `operator`, `city`, `state`, `status`. Nothing else.

**Provenance flag for Joe, before anything ships publicly:** the file's Overview credits Data Center Map, Baxtel and cloudandcolocation.com. Those are commercial directories. Confirm how it was compiled and whether it can be shown. Fine for an internal preview; not fine to hand to Team1 without that answer.

Metro membership (city, state code) — extend as needed:

```
nyc:      New York NY (Chelsea clip only; facilities optional)
phoenix:  Phoenix, Mesa, Chandler, Tempe, Scottsdale, Goodyear, Glendale, Gilbert, Avondale — AZ
nova:     Ashburn, Sterling, Herndon, Reston, Manassas, Chantilly, Leesburg, Dulles, Vienna,
          Arlington, Alexandria, Centreville, Haymarket, Gainesville, Culpeper — VA
dallas:   Dallas, Fort Worth, Plano, Irving, Richardson, Garland, Carrollton, Lewisville,
          Allen, Frisco, Arlington, Mesquite, Grand Prairie, Denton, Farmers Branch — TX
columbus: Columbus, Dublin, New Albany, Hilliard, Westerville, Gahanna, Grove City,
          Delaware, Johnstown — OH
utah:     confirm with Joe
```

---

## 5. STEWARDSHIP DATA — JOE'S ESG FILE

`Master_50State_ESG_Companies_All_Locations.xlsx`, sheet **All Companies (All States)**. Header row 3, data row 4. 414 rows; 61 across AZ/VA/TX/OH statewide.

**This file is a prospecting database, not display content.** It needs a curation pass before a single card renders.

| Col | Field | Use |
|---|---|---|
| B | Company | display |
| C | Facility/Site Name | display |
| D–G | Address | geocode |
| H | Sector | display |
| I | Sustainability/ESG Goal | **curate — see below** |
| J | Parjana Product Fit | **never render** |
| K | Fit Category | **never render** |
| L | Source | **normalize — see below** |
| M | Notes | **never render** |

**Columns J and K tag 414 companies as Parjana / HydroCoin / x402gal / Multiple leads.** That is an internal sales categorization the companies never agreed to. It is the assigned-label problem from the graphics, in spreadsheet form. It does not exist in the app, the GeoJSON, or the build output.

**Column I is research prose**, up to 600 characters, in an analyst's voice — many rows say the company has *no* published target. Curation rule per row:

- If a published, quantified water commitment exists → write a `commitment` string, ≤ 160 chars, in the company's own terms, no editorializing.
- If the goal text says none was found → **exclude the row.** A stewardship card for a company with no commitment is a false signal.
- Anything uncertain → exclude.

**Column L has zero http URLs** — 370 bare domain paths, 44 with nothing usable. Normalize to `https://…`, verify the URL resolves, drop rows where it doesn't. Every card carries a working source link or it doesn't render.

Output `public/match/data/<metro>/stewardship.geojson`, properties: `company`, `facility`, `sector`, `commitment`, `source_url`. Card shows exactly those. No logo, no tier, no label.

Expect the curated set to be small — likely under twenty cards across all metros. That is correct. Twenty true cards beat sixty ambiguous ones.

---

## 6. CANDIDATE PROJECT LOCATIONS

Not yet received. When they arrive: point, name, stage (`conceptual` / `in_diligence` / `built`), and a `display_public: true` flag. **Missing flag = point does not exist.** No default-to-show. Most site contracts are unsigned.

Output `public/match/data/<metro>/candidates.geojson`. Until received, the layer is empty and the panel says what it is waiting on.

---

## 7. THE GATE

Reuse the existing auth pattern (preview review gate, server-side PII endpoints). Do not introduce a second auth path.

**Collect the minimum:**

| Field | Type |
|---|---|
| Name | text |
| Email | text, validated |
| Company | text |
| Role | pick: Data centers / AI or cloud / Corporate sustainability / Investor / Ecosystem or payments / Other |
| What brought you here | pick: Saw the ad / Met at the booth / Team1 / Other |
| Consent | checkbox, unchecked by default |

Consent copy, exactly:

> We'll use this to follow up about x402GAL and HydroCoin. No sharing with third parties. Unsubscribe any time.

Store server-side with timestamp and metro selected. Export to the CRM Pam runs — CSV endpoint gated to admin. Every success metric in the strategy doc (qualified partners, buyer conversations, 30-day follow-up owners) runs through this table. **Treat it as the product's primary output.**

Gate placement: before the map, after a one-screen explanation of what they'll see. The preview password stays on Preview only — never on Production.

---

## 8. THE ASSESSMENT

Three to four questions, water-to-water result, map handoff. **No car analogy.** Cars put people in the carbon-offset frame; the project's whole distinction is that it is water accounting.

**Questions** (buckets, one tap each):

1. How much do you use AI on a typical day? — A few prompts / Steadily through the day / It runs my workflow / I run agents or automations
2. Do you generate images or video? — Rarely / Sometimes / Regularly
3. Where are you based? — pick metro, or "elsewhere" → representative facility from the nearest metro

**Result screen:**

- Estimated daily water, in gallons and in 500 ml bottles
- **Labelled:** *Estimated under the x402GAL Water Intensity Methodology v1.0. This is an estimate from published coefficients, not a measurement.*
- Coefficient version shown, not hidden
- Then the handoff: *Your AI's water didn't come from here. Tap to see the watershed it's drawing from* → representative facility in their metro, watershed draws

**Coefficients come from the x402GAL methodology, versioned, in one config file.** Do not hardcode numbers from third-party papers into the UI. If the methodology file isn't final, the assessment ships with the version label reading `v1.0-draft` and the estimate rounded to one significant figure.

Tone: never scold. No "heavy user," no "lead-footed." The person taking it is the buyer.

---

## 9. LEARN → BADGE → BOOTH

**Learn:** the glossary strings (final, in the teaching addendum Part A) plus a short sequence — watershed, where the water goes, what a gallon is and the review it passes, why retirement matters. Each step is one screen, one idea. Two minutes total.

**Badge:** completion record + a short code. Stored against the gate record. A badge screen the person can show. No wallet required. On-chain issuance (Avalanche) is optional and later — do not block the loop on it.

**Booth:** the badge screen says *Show this at the HydroCoin booth for your coin.* Joe's mechanic — the physical keepsake, handed over in person. The app's job ends at producing the screen.

**Hard rule, unchanged:** no on-chain HydroCoin allocation attaches to completion, now or promised. Supply is governed entirely by verified infiltration. The physical coin is the reward; it is a keepsake and is described as one.

---

## 10. BRAND — ALIGN TO HYDROCOIN

Reverses the earlier directive. One visual system across geofence ads, hydrocoin.com, x402gal.com, this app, and the booth.

- **Palette:** pull tokens from hydrocoin.com's stylesheet — the blue gradient / ombre is the campaign identity. Do not invent hex values; take them from the live site and put them in one `tokens.css`.
- **x402GAL mark:** the water-drop, re-cut to sit on HydroCoin's gradient. Avalanche red appears in the x402GAL lockup and nowhere else in the UI.
- **Dark map, gradient chrome.** The map stays the dominant element. The watershed boundary is still the single loudest thing on screen — full weight, low-opacity fill.
- **Still banned:** glow and bloom effects, gradients on buttons, tracked-out capitals, arrows on button text, decorative drop shadows. Campaign alignment means the palette, not the crypto-launch tics.
- **Type:** one family, two roles. Sentence case. Monospace only for HUC codes and coordinates.

The seven interaction constraints from the design directive are unchanged and take precedence over any visual choice.

---

## 11. CLAIM DISCIPLINE — UNCHANGED, AND NOW A FEATURE

Everything in the original §5 applies: no rendered number without loaded data, zero verified sources exist, two networks no bridge, supply measured / demand estimated, ledger is provenance not verification, banned strings, no third-party logos or assigned labels, present tense only for what runs.

**Added for the launch:** the estimated/measured distinction is message three of the narrative, not a caveat. Show it. The assessment result and the stewardship cards are two different kinds of number and the UI should make that visible — different label, different treatment, side by side where they meet.

Three things from the call that stay inside the room and never reach the UI:

- "Treasury inventory supports market activity"
- "Credits flow to service providers" (settled rule is 80/20, one recipient; service costs are an internal allocation)
- Any running total of verified gallons (there are none)

---

## 12. WHAT'S TRUE ON THE 16TH

| Surface | Status |
|---|---|
| Gate, capture, CRM export | Live |
| Six metros, HUC12/10/8, aquifer | Live, offline |
| Facilities, radius, same-watershed | Live, curated set |
| Stewardship cards | Live, curated set, small |
| Candidate projects | Live if files arrive with flags; else empty and labelled |
| Assessment, result, map handoff | Live |
| Glossary, learn, badge, booth screen | Live |
| x402 payment step | Testnet demonstration |
| HydroCoin issuance / retirement / attestation record | Represented, not live. Nothing minted. Nothing for sale |

x402GAL launches as a product. HydroCoin launches as a narrative. Copy must know which is which.

---

## 13. BUILD ORDER

1. **Commit and push** the working tree. Now. Everything below is at risk until this is done.
2. Rebuild clips from Zina's layers; add HUC10; add `utah` and confirm `nyc`; simplify Phoenix; lazy-load per metro
3. Facility converter: filter → geocode (Census batch) → drop non-rooftop → emit
4. Gate + capture + admin CSV export, on the existing auth pattern
5. Stewardship curation script (exclusion rules above) → emit
6. Assessment: questions, methodology config, result, map handoff
7. Learn sequence + badge + booth screen
8. Brand pass: tokens from hydrocoin.com, mark, chrome
9. Candidate layer, flag-gated (when files arrive)
10. Payment continuation wired last
11. Phone layout, hotspot test, two rehearsals by a non-developer

Steps 1–4 are the demo and the list. If 5–10 slip, the summit still works.

---

## 14. SCHEDULE

| Window | Work |
|---|---|
| 3–5 Sept | Steps 1–4 |
| 6–10 Sept | Steps 5–8 |
| 11–13 Sept | Steps 9–10, content load, review against acceptance |
| 14–15 Sept | Rehearsal. Joe walks the full path twice, phone in someone else's hand |
| 16–17 Sept | Summit |

---

## 15. DEFINITION OF DONE

- Runs with the network off for all six metros
- Every control responds in under 400ms
- Cold start to first useful screen under three seconds over a hotspot
- Gate captures and exports; consent stored with timestamp
- Every number on screen traceable to loaded data; every estimate labelled with its method version
- No banned string in the built output — including alt text, tooltips, aria labels
- No internal column (fit category, product fit, notes) anywhere in the build
- Assessment ends on the map, not a metaphor
- Badge screen produces a code the booth can act on
- Rehearsed end to end twice by someone who did not build it

---

## 16. CONVENTIONS

- No client, site, or landowner names in this repo, in commit messages, or in issue titles. Demo metros are fine.
- Anything resembling a decision about token design, issuing entity, attribution, retirement, or classification is not ours. Surface it; do not resolve it in code or copy.
- One authoritative document. This one. c:\Users\alula\Desktop\Edge Consulting\Edge Consulting\Clients\Parjana Engineering\Projects\Phase 2\Dev\Marketing\Events\Avalanche Summit 2026 NYC\Master_50State_ESG_Companies_All_Locations.xlsx c:\Users\alula\Desktop\Edge Consulting\Edge Consulting\Clients\Parjana Engineering\Projects\Phase 2\Dev\Marketing\Events\Avalanche Summit 2026 NYC\Master_50State_DataCenters_All_Locations.xlsx c:\Users\alula\Desktop\Edge Consulting\Edge Consulting\Clients\Parjana Engineering\Projects\Phase 2\Dev\Marketing\Events\Avalanche Summit 2026 NYC\Watershed Boundary-20260903T193155Z-1-002\Watershed Boundary That's the national files — HUC12 for the whole country alone is a few hundred megabytes. Expected, and none of it goes in the repo.

Treat it as source, not asset:

```
source-data/          ← gitignored, 500MB, downloaded once
  huc8_conus/
  WBDHU10/
  HUC12/
  aquifers_us/
public/match/data/    ← committed, ~4–5MB for six metros
  <metro>/huc12.geojson, huc10.geojson, huc8.geojson, aquifer.geojson, manifest.json
```

Add `source-data/` to `.gitignore` before downloading, or the first `git add -A` tries to commit half a gigabyte.

The clip itself is one pass per metro with ogr2ogr or mapshaper against a bounding box — Cursor's `match:clip` already does this for WBD; it just needs to point at Zina's files and add the HUC10 layer. Output for Phoenix will still be the largest; simplify it there.

**Manifest per metro** — this is what makes Zina's copy worth using over a fresh download:

```json
{
  "source": "Watershed Boundary (Drive, parjanad)",
  "files": { "HUC12": "<sha256>", "WBDHU10": "<sha256>", "huc8_conus": "<sha256>", "aquifers_us": "<sha256>" },
  "clipped": "2026-09-03",
  "bbox": [...]
}
```

Hash the source files once and record them. That's the line that says the demo map and the engineering map are the same polygons, and it's cheap.

Download once to a machine with disk, clip, commit the outputs. Cursor never needs the 500MB again.
