# SUMMIT MVP — BUILD BRIEF

Controlling product brief for the 16–17 September 2026 Data Center × Watershed Match demo. Graphics, decks, and spreadsheets lose when they conflict with this file.

The original scope, architecture, claim discipline, and definition of done live in the first section of this document as received. The teaching addendum below is appended and is also controlling for glossary copy.

**Education module:** specified in Part C. Not approved. Not built.

---

# SUMMIT MVP — TEACHING ADDENDUM

Covers §6 (glossary) and the education module.

---

## PART A — GLOSSARY COPY

These are final strings. Use them as written. Do not paraphrase, expand, or let a model regenerate them.

**Interaction:** the term is underlined in place. Tapping or hovering opens a small panel over the map. It closes on the next tap. No separate page, no modal that blocks the map, no navigation away.

**Register:** plain, unhurried, no exclamation.

Implemented in `lib/match/glossary.ts` and `components/match/GlossaryTerm.tsx`. The New York second panel on *watershed* shows only inside the New York geofence (device location in Manhattan, `?at=nyc` for rehearsal, or `NEXT_PUBLIC_SUMMIT_GEOFENCE=nyc` on the Summit preview).

### watershed

An area of land where every drop of rain that falls drains toward the same place — a creek, then a river, then eventually the sea. You are always standing in one. Which one you are standing in decides where your stormwater goes and which body of water it ends up affecting.

*Second panel, shown only for the New York geofence:*

New York City's drinking water does not come from New York City. Most of it comes from the Catskill and Delaware watersheds, more than a hundred miles upstate. The city chose to buy and protect that land rather than build a filtration plant, which is why it is one of the few large cities in the world that does not filter its surface water.

### HUC12

A Hydrologic Unit Code is the number the US Geological Survey assigns to a watershed so it can be referred to exactly. The digit count tells you the scale: two digits covers a region the size of an entire river basin, twelve digits covers a local watershed of a few tens of square miles.

HUC12 is the useful size here. It is small enough that a single infiltration project measurably changes what happens in it, and large enough to contain the facilities drawing water out of it.

### aquifer

An underground layer of rock, sand or gravel that holds water in the spaces between its grains. Wells pull water out of it; rain and snowmelt put water back in, but rarely at the same rate.

Where withdrawal outpaces recharge for long enough, the water level falls, wells have to be drilled deeper, and in some regions the ground surface itself sinks. That is the gap infiltration is meant to narrow.

### infiltration

Water moving down from the surface into the soil instead of running across it. Pavement, roofs and compacted ground block that pathway, which is why cities flood in heavy rain and why the groundwater beneath them stops being replenished.

Engineered infiltration deliberately restores the pathway, and instruments in the ground measure how much water actually goes down.

### stormwater

Rain that lands on a hard surface and runs off rather than soaking in. It picks up whatever is on that surface along the way and arrives at the nearest creek or storm drain fast, warm and dirty.

Managing it is a legal obligation for most large property owners in the United States. That obligation is why the work has to happen; the measurement is what makes it countable.

### retirement

Permanently removing a credit from circulation so that it cannot be counted a second time. The buyer keeps the claim to the outcome; the credit itself no longer exists to be sold.

Retirement is the control that stops one environmental outcome being sold to several buyers — the failure that has damaged trust in other credit markets. Here it is recorded on a public ledger, so anyone can see that it happened and cannot be quietly reversed.

### attestation

A licensed professional putting their name and their licence behind a statement, and being accountable for it. It is the same model used in financial audit: not a claim that any reader can recompute the result, but a record that a qualified person reviewed the work and signed it.

Here a gallon passes through preparation by the site engineer, review by an independent professional engineer, and review by an independent accountant before it is recorded. The ledger shows that those reviews happened and that the documents have not changed since. It does not replace the reviewers.

---

## PART B — WHY THIS SECTION EXISTS

The glossary is not a courtesy feature. It is the answer to the question that will actually be asked on the floor: *why water, and why should a payments person care.*

The audience at an Avalanche summit is fluent in settlement and illiterate in hydrology. Every other exhibitor will be explaining a mechanism. Explaining a watershed to someone standing in Manhattan — and having the answer turn out to be a hundred miles upstate — is the thing they will repeat to someone else at lunch.

---

## PART C — EDUCATION MODULE

**Status: specified, not approved. Do not build until the client closes it.**

Shape, if it goes ahead: a short guided sequence, five or six steps, that walks a person through the same path a real transaction takes. Each step teaches one idea and then does one thing.

1. Where you are — the geofence resolves to a watershed
2. Where the water goes — the aquifer and the basin beneath it
3. What a workload costs — an estimated footprint, stated as an estimate
4. What a gallon is — measured infiltration, and the review it passes through
5. Paying for it — the payment step, on testnet
6. Retiring it — why the credit has to disappear

Completion gives a badge. The badge is a completion record and nothing more.

### Hard constraint on the badge

**No token allocation attaches to completion.** Not now, not promised for later, not "at the mint."

Supply is governed entirely by verified infiltration. A promotional allocation is either unbacked or spends gallons that belong to a site owner who did not agree to give them away. A forward promise of tokens to unidentified people at a crypto conference also lands on the classification question, which is open and has no counsel engaged.

If a badge is minted at all, it is an x402GAL artifact on the settlement side. It is not issued by the credit issuer, it does not touch the credit's supply, and it is not represented as a credit or as a claim on one. Design for no wallet first.

---

## PART D — COPY RULES FOR THIS SECTION

Everything in §5 of the main brief applies, with two additions:

- Never describe the estimated footprint as measured, even inside a teaching step whose whole point is the comparison.
- Never state that the ledger verifies the water. It records that the professional review happened and that the record has not changed.

---

# §12 — DESIGN DIRECTIVE

Governs interaction and visual design. §5 of the main brief (claim discipline) outranks this file wherever they touch.

## 1. WHAT THIS IS ACTUALLY DESIGNED FOR

Not a website. A handheld instrument used in the following conditions:

- A loud room, standing up, in about thirty seconds
- Conference wifi that is saturated by mid-morning
- Often in a stranger's hands, on their phone, with no explanation
- In front of an audience fluent in settlement and illiterate in hydrology
- Watched by people whose default assumption is that a crypto project overstates things

Every choice below follows from those five facts. When a decision is unclear, re-read them rather than reaching for a pattern.

## 2. SEVEN CONSTRAINTS

Testable. Each has a check in §5.

**C1 — Every control answers in under 400ms.**
Dragging the radius, toggling a layer, tapping a pin. No interaction may wait on a network call. Watershed and aquifer polygons resolve locally from committed data. If something cannot meet this, it does not ship.

**C2 — One primary action on screen at a time.**
There is a single obvious next thing at every step, and it is visually louder than everything else on screen. Secondary controls stay available but recede.

**C3 — Accept sloppy input, normalize hard.**
Someone will type "Ashburn VA", "us-east-1", a zip code, a company name, or a misspelling. All of these resolve or fail with a useful direction. The preloaded list is the primary path and the typed field is the fallback, never the reverse.

**C4 — The interface carries the hard distinction, not the presenter.**
Estimated demand and measured supply must be visibly, permanently differentiated wherever both appear — by label, by placement, by treatment.

**C5 — The demo ends on something that cannot fail.**
The peak is the watershed resolving around the facility they named. The ending is a closing state that works with no network: the watershed fact, the glossary entry, the summary of what they just saw.

**C6 — Empty is a direction, not an apology.**
Say what the screen will show and what it is waiting on, in the interface's voice. Never apologize, never say "no data available."

**C7 — Build the demo path, then stop.**
Steps 1 through 4 of the build sequence are the demonstration. An unbuilt feature is a smaller risk than an unrehearsed demo.

## 3. VISUAL DIRECTION

Diverge from the conference graphics, deliberately. The application is the artifact people will hold, and it should look like an instrument, not a launch page.

Look: hydrological survey. Topographic sheets, gauge stations, field instrumentation, bathymetric charts.

Palette — the map is the only dark, saturated element. Everything around it is quiet and light.

```
paper        #EEF1F2   chrome, panels, background
ink          #14212B   text, borders
water        #14607A   watershed boundaries, primary action
subsurface   #8C6239   aquifer hatch (topographic contour brown)
quiet        #6B7A85   secondary text, inactive controls
```

The one loud thing on screen is the watershed boundary itself. Do not use gradient fills, glow or bloom, drop shadows as decoration, tracked-out capital labels, arrows appended to button text, or a different colour on one word of a heading.

Type: IBM Plex Sans for language. IBM Plex Mono for coordinates, HUC codes and measured values only. Sentence case throughout.

Layout: map is full-bleed and permanent. One panel over the map, resizable by drag. The glossary opens in place, over the map, and closes on the next tap.

Motion: one orchestrated moment — the watershed boundary drawing itself (600ms). Everything else is instant.

## 4. COPY IN THE INTERFACE

Plain verbs, sentence case, no filler. A button says what happens. Errors state what happened and what to do. Nothing is sold. The banned-strings list applies to alt text, tooltips, empty states, aria labels and error copy.

## 5. ACCEPTANCE CHECKS

Run these against a build, not against the code.

1. Radius drag, layer toggle and pin tap each respond in under 400ms with the network disabled
2. Watershed and aquifer render with the network disabled, at all five metros
3. A stranger, given the phone and no instruction, reaches a resolved watershed within thirty seconds
4. Only one element on screen reads as the primary action at any moment
5. "Ashburn VA", a zip code, and a misspelled city each resolve or fail with a useful direction
6. Estimated and measured are distinguishable on screen without reading body copy
7. The closing state works with the network disabled
8. No empty state exposes internal vocabulary
9. Nothing on screen glows, gradients, or is set in tracked-out capitals
10. Full path rehearsed twice by someone who did not build it

## 6. OUT OF BOUNDS FOR A REDESIGN

A visual pass does not get to touch:

- Any claim, label or disclosure required by §5 of the main brief
- The fail-closed rule on counts — no number appears because a layout looked empty without it
- The display-flag gate on candidate project locations
- The glossary strings in the teaching addendum, which are final

If a design change would be improved by relaxing one of these, the design change is wrong.

Implemented as a paper instrument over a full-bleed map. Score and demand cards were not polished (C7).
