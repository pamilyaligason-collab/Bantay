# Hazards where I am: NOAH + HazardHunterPH design

Status: **Bohol and South Cotabato hazard packs live in the `region-packs` bucket since 2026-11-01; app side not built.** Facts read 2026-10-31 in a browser; sources and licences are in `RESEARCH.md` rows 9 and 13.

## 1. What the member sees

"Hazards at my location" gives three levels for the phone's position, the same words NOAH uses: **Flood**, **Landslide**, **Storm surge**,
each *Little to none / Low / Medium / High*, plus a small map with the hazard areas around them. It works offline once the province's hazard pack
is on the phone. Earthquake, volcano and tsunami (PHIVOLCS) stay a short hand-read summary for the home zones (today's `hazards.json`) and an
"Open HazardHunterPH" button, until PHIVOLCS agrees in writing to more (section 6).

## 2. NOAH facts (VERIFIED in a browser, 2026-10-31)

| What | Finding |
|---|---|
| Embedding | `noah.up.edu.ph` sends `X-Frame-Options: SAMEORIGIN` (orchestrator check), so no iframe. We open it in the browser instead. |
| Downloads | The site's "Downloads" link is a public Google Drive folder, https://drive.google.com/drive/folders/1ALE4-E9c-4AGjm1fqiPprWHrLUskeY9o, with folders `Flood` (`5yr`, `25yr`, `100yr`, one zip **per province**, e.g. `Abra.zip`), `Landslide` (`LandslideHazards`, `DebrisFlowAlluvialFan`), `Storm Surge` (`StormSurgeAdvisory1`..`4`), each with a `01ReadMe_*.pdf` and `metadata_*.txt`. |
| Licence | `NOAH_License.pdf` in that folder: "Project NOAH Open Data License … open data licensed under the Open Data Commons Open Database License (ODC-ODbL)". Free to download, copy, redistribute and adapt "provided that Project NOAH and its contributors are always properly attributed"; changed data "only under the same license (ODC-ODbL)". |
| Flood classes | `01ReadMe_Flood.pdf`: 100-year rain return maps show **low, medium, high** (yellow, orange, red), from depth and velocity; for an average 5'6" Filipino, below knee = low, knee to neck = medium, above neck = high. Modelled with FLO-2D on PAGASA rainfall. |
| Point check on the site | Know Your Hazards uses 100-year flood, shallow and structurally controlled landslides, and the **5 m storm surge** scenario, and reports *Little to none / Low / Medium / High*. The page calls `noah-api.up.edu.ph` with Mapbox tilesets (`webgis-static.up.edu.ph/api/hazards/ph_combined_tileset.json`). That API is the site's own backend and is **not** covered by the download licence, so Bantay does not call it. |
| Deep link | **None.** Know Your Hazards reads no location from the URL (checked in its JS bundle: the pin starts at UP Diliman 14.6577, 121.0710 and moves only by drag or place search). |
| Files (downloaded 2026-10-31, `data/noah/MANIFEST.md`) | ESRI shapefiles in WGS 84 (EPSG:4326), one multipolygon per level. Fields: flood `Var` 1/2/3 (0-0.5 m, 0.5-1.5 m, >1.5 m), landslide `LH` 1/2/3 (build with monitoring / with slope protection / no dwelling zone), storm surge SSA4 `HAZ` 1/2/3 (depth and depth x velocity). SSA levels: SSA1 up to 2 m, SSA2 up to 3 m, SSA3 up to 4 m, SSA4 more than 4 m. Metadata says "Update Frequency: Annual, or as needed"; Drive files dated Oct 2021. |

## 3. Hazard pack per province

One file per pack unit, beside the places pack: `region-packs/<psgc>/hazards-<sha256>.pmtiles`, listed in `region_packs` with `layer = 'hazards'`
(migration 0045, applied 2026-11-01, already has the column, path check and a 50 MB bucket limit). `index.json` carries `hazards: {pack, version, checksum, size, path, bounds}` per unit (`supabase/seed/local-data/hazards.json` holds the bounds and which unit's file covers which unit; `refresh.mjs packs` merges it with `region_packs`).

- **Content**: three vector layers from NOAH's downloads for that province: `flood` (100-year), `landslide` (LandslideHazards), `surge`
  (StormSurgeAdvisory4, the scenario NOAH's own point check uses). Each feature keeps one property, `level` 1/2/3 (low/medium/high) from
  NOAH's `Var` / `LH` / `HAZ`. Debris-flow and alluvial-fan areas (a separate NOAH folder) are not included yet.
- **Why PMTiles**: one static file the app reads by HTTP range or from IndexedDB, the same format as the Protomaps basemap (D-105..107), drawn
  by MapLibre, no tile server. Zoom 8-12 (`MAXZOOM`); the map overzooms z12 above that, and lookups always read z12 (section 4).
- **Build** (`scripts/local-data/hazards.sh`, Linux or WSL with GDAL 3.12, python3-gdal and tippecanoe 2.53): explode the source multipolygons,
  `-makevalid`, **no pre-simplification** (NOAH's cells are 10 m, and a 10 m simplify deleted whole cells: Opus review 3), then
  `tippecanoe -Z8 -z12 --no-feature-limit --no-tile-size-limit --no-tiny-polygon-reduction-at-maximum-zoom --detect-shared-borders` (every cell kept at z12, the lookup zoom; tiny polygons may
  merge at z8-11, which are only drawn). Not clipped to the PSGC
  outline: NOAH's files are already per province.
- **Check** (`scripts/local-data/hazards_check.py`, run by the build before the pack is copied out; a failure publishes nothing): per layer, 150 parts picked by index (mostly
  single 10 m cells) and 150 area-weighted points, all from the unsimplified source with a fixed seed. Expected = the highest source level
  at the point (NOAH levels overlap a little); got = the app-like lookup below. An under-report passes only if the point is within 2.5 m (one z12 tile unit) of a source edge **and** the pack shows
  that level within 2.5 m; a lost 10 m cell (centre 5 m from every edge) always fails. The check runs before the pack is copied to the
  publish folder.
- **Sizes and results**: see the table in section 4 (rebuilt after review 3). The first builds (z14 55.7 MB, z13 35.2 MB, z12 25.4 MB with a
  10 m pre-simplify) are withdrawn: they lost about 40% of single-cell landslide and flood parts.
- **Download rule**: a hazard pack is tens of MB, too much for mobile data by default. It downloads on Wi-Fi, or on mobile data only after the
  member taps "Download hazard map (<size>)". That holds for home zones too: their hazard packs are pinned (never cleaned up) but still wait for
  Wi-Fi or the tap, and until then section 4 step 3 applies. Places packs (tens of KB) keep downloading on any network. A smaller lookup-only
  file is the next step if members skip the download; not built.
- **Attribution** (ODbL): "Hazard data: UP NOAH Center (Project NOAH), ODbL 1.0" on the hazards screen and the About page; the pack is
  published under ODbL too.

## 4. Point lookup "hazard levels at my location"

`hazardsAt(lat, lon)` in the app, offline:
1. Pick the unit (same `unitAt` as the places packs) and its hazards entry in `index.json`. A unit without its own NOAH file points at another
   unit's pack: **General Santos** (`1230800000`) has `hazards: {pack: "1206300000", ...}` because NOAH ships GenSan inside `SouthCotabato.zip`.
   Each entry also carries the pack's `bounds` per layer (from the source extents).
2. For each layer, read the tile at `min(12, header.maxZoom)` holding the point (PMTiles JS `getZxy`), decode it (`@mapbox/vector-tile`), and
   test the point against every ring (even-odd ray casting). Highest `level` found wins.
3. Nothing found **and** the point inside that layer's bounds: show "No mapped hazard here in NOAH's maps (100-year scenario). That is not a promise of safety: the maps may not cover every place, and a phone's position can be off by tens of metres", never a
   bare "Little to none". **When a 0 can be trusted** (checked 2026-11-05 against both live packs): the pack holds NO survey-coverage data, only the source extents (the `bounds` per layer, null outside them), and tippecanoe writes no tile where no feature falls. So a 0 means "NOAH's maps show nothing here", which equals "not surveyed" in an unmodelled gap inside the box. It is only verified at the two home pins (Dampas and Conel, compared with the source shapefiles, and read back through the app's reader from the live files). For any other place it needs a coverage outline for the layer (NOAH publishes none) or a source-side comparison before the app may say more than the sentence above. A point is read only when it is inside a unit the file covers: a picked home zone, or an outline of that unit once `public/geo/units.json` ships. No pack yet, the point outside the bounds, or outside every unit: "Not on this phone yet" plus the Open NOAH button.
4. Tests: `hazards_check.py` per build; the two home pins below; and a hand check of the same pins on NOAH's site by dragging its pin there
   (still to do: the site's search does not take coordinates).

Current packs (v3, 2026-11-01): every cell kept at z12, tiny polygons merged below it. `hazards_check.py` per layer: 150 single-cell picks
(cell centres) + 150 area-weighted points, fixed seed 20261101; an under-report passes only within 2.5 m of a source edge with the level
present in the pack within 2.5 m; source parts narrower than about 2.5 m (clipping strips with no interior after a 1.25 m inward buffer,
which tippecanoe collapses at z12 anyway; a 10 m cell never qualifies) are neither sampled nor expected (Opus review 5).

| Unit | Pack | Size | Points | Exact | Edge rounding | Real misses |
|---|---|---|---|---|---|---|
| Bohol 0701200000 | `hazards-3d7584c4….pmtiles` | 33.1 MB | 900 | 899 | 1 | 0 |
| South Cotabato 1206300000 (also GenSan) | `hazards-ec65c11b….pmtiles` | 28.8 MB | 900 | 894 | 6 | 0 |
| Bohol, withdrawn v1 (10 m pre-simplify), same check | `hazards-684f0cac….pmtiles` | 25.4 MB | 900 | 766 | 11 | **123** |

History: v2 (every cell at every zoom) was 41.4 / 35.6 MB; v3 keeps the same z12 tiles and only lightens z8-11. The check failed one
South Cotabato v3 build on a near-zero-area source sliver (the real level-3 area was 3 m away and in the pack within 4 m), and review 5 showed
an area cut (1.2 m2) still failed good packs on 0.4-2.5 m wide strips by chance; slivers are now judged by width. The table above is from
the area-cut check; the width-cut re-check of the same packs (2026-11-01): Bohol 900 points, 896 exact, 4 edge, 0 misses, 0 slivers skipped;
South Cotabato 896 / 4 / 0, 2 slivers skipped. tippecanoe output can differ by a byte between identical runs (28,763,650 vs 28,763,651), so a rebuild of unchanged data may
get a new version; harmless, the app just downloads it again. The 50 MB bucket limit (migration 0045, one `hazards-<sha>.pmtiles` per unit)
leaves room; a province that still exceeds it needs a 0045 change (per-layer files) before upload.

Home pins, NOAH source shapefile vs pack: **Dampas** 9.645705, 123.877951: flood Low, no landslide, no surge. **Conel** 6.2015121, 125.1878084:
flood **Medium** (knee to neck deep in a 100-year rain), no landslide, no surge (both confirmed by Opus review 3 in the source and in the first
packs; and re-checked on the v2 packs: same levels). NOAH's site, searched for "Dampas, Tagbilaran", answered Little to none for all three, but at its
own geocoded barangay point, which the page does not show; it is not the home pin.

**Not verified**: that NOAH's South Cotabato files cover all of General Santos. Their extents end at 125.27 E (flood, landslide) and 125.10 to
125.24 E (surge); parts of eastern and coastal GenSan may fall outside. Needs a GenSan outline; until then the bounds rule in step 3 answers
"Not on this phone yet" outside them rather than "No mapped hazard".

### NCR (Metro Manila), D-147

One unit for the whole region, owned by the **City of Manila** (`1380600000`). Why not a region code: `region_packs.province_code` references
`coverage(psgc_code)` and `coverage.kind` allows province, huc, icc and municipality only (0045), so `1300000000` cannot own a file without a migration.
The pack was built from NOAH's NCR source zips ("Metro Manila.zip" / "MetroManila.zip", prefix `MetroManila`); `hazards_check.py`: 900 points, 898 exact,
2 edge under-reports, 0 real misses. File: `hazards-cab7167a8b8d96006664f1ff47a6806447472b982ecdfbbec2afff4ab8e1c3d8.pmtiles`, 5,930,579 B.
Bounds (in `hazards.json`): flood [120.906739, 14.351791, 121.135036, 14.784376], landslide [120.908724, 14.351861, 121.133416, 14.78513], surge [120.906395, 14.446421, 121.016527, 14.737182].
Outline: `units.mjs` files geoBoundaries' four NCR district shapes ("NCR, City of Manila, First District", "NCR, Second/Third/Fourth District") under `1380600000`
(`ALIAS`), so `unitAt` returns it for any point in NCR. The 15 other NCR cities and Pateros have no shape of their own, so they are never returned and need no
pointer; if a city outline is added later, give that city `{ "pack": "1380600000" }` in `hazards.json` like General Santos. The coverage name is "City of Manila";
the app shows "Metro Manila" (PACK_NAMES in packs.ts). `refresh.mjs` now emits an index entry, with an empty places pack, for a unit that has a hazard file but no verified rows yet:
the app stores hazards only in a unit row it holds, so without this the NCR file could never download until Manila had places.

### City outlines (S23 F)

geoBoundaries ADM2 holds the provinces only, so 43 PSGC pack units had no outline (General Santos, Cebu, Davao, Tacloban, Lapu-Lapu, Mandaue, Baguio, Zamboanga and other highly urbanized cities; Maguindanao del Norte/Sur, split out of one ADM2 shape; the NCR cities; the BARMM clusters). A GPS place in one of them fell in the province outline or nowhere. `units.mjs --from <ADM2> --from3 <ADM3>` now fills 19 of them from the ADM3 simplified file (ADM3 revision 9469f09, ADM2 revision 41af8f1): the feature named "<name> City" (never a bare folded name: "Bacolod" is also a Lanao del Norte town), and for Maguindanao del Norte/Sur the union of its municipalities found by name inside the old ADM2 shape. `units.json` went from 552,586 B (82 units) to 595,469 B (101 units; the first city build was 595,095 B, the 17 `parent` fields add 374 B). A city outline lies inside its province outline, so `nest` writes `parent` (the province code) on each of the 17 city units and `claims()` in `unitAt.ts` does not count a province while a city that names it as parent also holds the point: a point in a city is claimed once and stays proven (before this a GenSan GPS place counted 2 claims and lost its hazard reading). Provinces are never nested, so a real border strip between two provinces still counts 2. Download both files to a temp folder outside the repo. `--strict` is the check: it prints every PSGC unit still without an outline and every PSGC city (psgc_lgus.csv) whose ADM3 shape is not inside its PSGC province outline, and exits 1 on any that is not accepted. City of Cotabato (`1908703000`) is accepted and listed: PSGC files it under Maguindanao del Norte, its shape lies in the Cotabato outline, so a GPS place there reads as Cotabato; neither has a hazard pack yet. Cities with no ADM3 feature of that name (Baliwag, Munoz, Calaca, Sto. Tomas, Catbalogan, Ozamiz, Samal) are listed as not checked. Accepted on purpose: the 15 NCR cities and Pateros (inside the Manila union that owns the one NCR pack) and the 8 BARMM SGA clusters (groups of barangays; no boundary file outlines them, a point there falls in the Cotabato outline). General Santos keeps its pointer to the South Cotabato pack (`hazards.json`); other new city units have no hazard pack yet and answer "Not on this phone yet".

Orchestrator upload steps (nothing here ran them):
1. Copy the file to a relative path, then `supabase storage cp <relative path> ss:///region-packs/1380600000/hazards-cab7167a8b8d96006664f1ff47a6806447472b982ecdfbbec2afff4ab8e1c3d8.pmtiles --experimental --linked --project-ref wuakimpssycbtnmoexuc --content-type application/vnd.pmtiles --cache-control max-age=31536000` (the build output folder is named `1300000000`: the storage code must be `1380600000`).
2. Insert the `region_packs` row: `province_code` `1380600000`, `layer` `hazards`, `version` 1, `checksum` `cab7167a8b8d96006664f1ff47a6806447472b982ecdfbbec2afff4ab8e1c3d8`, `size_bytes` 5930579, `row_count` = exploded source features (the build prints no count; the column only needs >= 0), `storage_path` `1380600000/hazards-cab7167a8b8d96006664f1ff47a6806447472b982ecdfbbec2afff4ab8e1c3d8.pmtiles` (0045 checks this equals code + '/hazards-' + checksum + '.pmtiles').
3. `node scripts/local-data/refresh.mjs packs --upload` (writes the empty Manila places pack, its `region_packs` places row, and the new `index.json`).
4. Ship the app build that carries `public/geo/units.json` (geoBoundaries release 41af8f1, CC BY 3.0 IGO). It is fetched on demand (`loadUnits`), not precached (`globPatterns` takes js, css, html only).

## 5. "Open NOAH"

Button opens `https://noah.up.edu.ph/know-your-hazards` in the system browser (Capacitor Browser) and copies the member's coordinates to the
clipboard with a one-line hint: "NOAH opens at UP Diliman. Search your barangay or drag the pin to your place." (its search does not take coordinates) The UP NOAH mobile app
(Play Store / App Store links are in NOAH's footer) is offered as a second button. Revisit if NOAH adds URL parameters.

## 6. HazardHunterPH / GeoRiskPH (earthquake, volcano, tsunami)

Second source, for what NOAH does not cover: ground shaking, ground rupture, liquefaction, tsunami, volcanic hazards (PHIVOLCS).
- Terms: "© 2018 - 2020 DOST-PHIVOLCS, All rights reserved"; no public API; per-point reports in the web app (RESEARCH.md row 9).
- So: keep the hand-read home-zone summaries (`hazards.json`, now Dampas only; add Conel the same way), each with its read date, and an
  "Open HazardHunterPH" button (`https://hazardhunter.georisk.gov.ph/`, no deep link checked). No automated queries.
- Ask PHIVOLCS / GeoRiskPH in writing for permission to ship their hazard layers or per-point results in a family app (draft for the owner to send;
  sending is his call).

## 7. Order of work (each gate needs the owner's OK where marked)

1. Done 2026-10-31 (the owner: "use in app browser to download and retrieve necessary resources online"): Bohol and South Cotabato files downloaded,
   attributes read, `hazards.sh` written, both packs built and self-checked. General Santos has no NOAH file of its own (NOAH's set is
   80 provinces); its pack unit reuses the South Cotabato hazard pack when the point falls inside it.
2. Done 2026-11-01 (the owner: "Yes, import and upload"): both packs uploaded, sha256 of the public bytes matches, range requests answer 206. Next provinces in COVERAGE order, by hand: run `hazards.sh`; `supabase storage cp <relative path> ss:///region-packs/<code>/hazards-<sha>.pmtiles --experimental --linked --project-ref wuakimpssycbtnmoexuc --content-type application/vnd.pmtiles --cache-control max-age=31536000` (a `C:/` source path fails: use a relative one); insert the `region_packs` row (`layer` hazards, `row_count` = exploded source features); add the unit's bounds to `hazards.json`; run `refresh.mjs packs --upload` to rewrite the index.
4. App lane: `hazardsAt`, the hazards screen, Open NOAH / Open HazardHunterPH, attribution.
