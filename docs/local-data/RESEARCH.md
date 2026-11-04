# Local safety data: sources, licences, access

Read 2026-10-31. **VERIFIED** = read on the source's own page that day (URL given). **UNVERIFIED** = search snippet only, or the page refused us
(many `*.gov.ph` sites return HTTP 403 to non-browser fetchers, and psa.gov.ph shows a bot check we do not bypass). Nothing here is guessed;
an UNVERIFIED line is a to-do for a person with a normal browser. Raw notes: side-session folder `research-sources.md`.

Legal frame (from RA 8293, the Intellectual Property Code, s.175-176; **not re-read today, UNVERIFIED**): facts and news of the day carry no
copyright, and "no copyright shall subsist in any work of the Government of the Philippines", but prior approval of the agency is needed to
exploit a government work *for profit*. Family Bantay is a private, non-commercial family app, so copying facts (names, addresses, numbers)
from government pages with a citation per row is our working rule. Bulk redistribution of a whole government database, and any commercial
use, needs the agency's written OK first. "All rights reserved" footers are recorded per source below.

## Summary

| # | Source | Data we take | Licence / terms | Freshness | Access | Automated access | Status |
|---|---|---|---|---|---|---|---|
| 1 | DOH National Health Facility Registry, https://nhfr.doh.gov.ph/VActivefacilitiesList | Hospitals, RHUs, BHS, city/municipal health offices: name, type, ownership, address, region/province/city/barangay, landline, licence status | Footer "©2022 Department of Health. All rights reserved." No terms page seen | Live registry, 45,076 active records on 2026-10-31; licence dates per row | Public HTML list, filter by type/region, export button (not used). No coordinates in the list | Not stated; robots.txt not read. We do NOT scrape: a person exports per region, or rows are cited one by one | VERIFIED (read in browser) |
| 1b | DOH "List of Health Facilities with GPS Coordinates" (FOI record, 2019-02-08) | Facility coordinates | Unknown | 2019 | FOI request | n/a | UNVERIFIED (snippet) |
| 2 | DSWD DROMIC, https://dromic.dswd.gov.ph/ | Disaster situation reports (evacuees per EC per event) | No terms shown | Reports per event, 2014 to 2026 | HTML + report files | Not stated | VERIFIED: no EC master list is published there. The 2016 EC master list is not on the site today |
| 2b | Newer national EC list (DSWD / DILG / OCD) | Evacuation centres | n/a | n/a | n/a | n/a | UNVERIFIED: none found. ECs come from LGU/PDRRMO pages and DROMIC reports, one LGU at a time |
| 3 | OCD / NDRRMC, https://ndrrmc.gov.ph, https://ocd.gov.ph | National and regional OCD hotlines | Not read (403) | ? | ? | ? | UNVERIFIED |
| 3b | Provincial / city DRRMO pages (e.g. https://southcotabato.gov.ph/contact/, Bohol PDRRMO) | DRRMO hotlines | Usually none stated | Page dates vary; record per row | HTML, Facebook pages | Read by hand | VERIFIED per row in the seed CSVs |
| 4 | PNP https://pnp.gov.ph, BFP https://bfp.gov.ph | Police and fire stations | Not read (403) | ? | ? | ? | UNVERIFIED; stations come from city pages and the stations' own pages per row |
| 5 | Philippine Coast Guard https://coastguard.gov.ph | Stations, districts | Not read (403) | ? | ? | ? | UNVERIFIED |
| 6 | Philippine Red Cross https://redcross.org.ph | Chapters | Footer "Copyright 2024 Philippine Red Cross." No licence | News to Jan 2026 | HTML; chapter numbers only on the blood-service page (https://redcross.org.ph/where-to-donate-and-avail-blood/) | Not stated | VERIFIED (no chapter directory exists; the blood page lists chapter numbers) |
| 7 | 911 (E911, DILG, EO 56 of 2018), 8888 | National numbers | Facts | EO 2018; "Unified 911" launch 2025-09-11 per news | n/a | n/a | UNVERIFIED on a primary page; already in `src/data/safety/hotlines.json` as CONFIRMED from earlier sessions |
| 8 | PSA PSGC, https://psa.gov.ph/classification/psgc | Region/province/city/barangay codes (10 digits) | PSA page not read: bot check, not bypassed | Quarterly releases | **Used: community mirror https://psgc.cloud/api** (v2.1.0; says it follows each PSA release; no quarter shown), pinned 2026-10-31 in `supabase/seed/local-data/psgc-snapshot/` with SHA256SUMS; `scripts/local-data/psgc.mjs` refuses a changed snapshot | Mirror is a public JSON API | VERIFIED as a mirror, not against PSA: 82 provinces incl. Maguindanao del Norte/del Sur; Bohol 0701200000, South Cotabato 1206300000, General Santos 1230800000, Tagbilaran 0701242000, Dampas 0701242006, Conel 1230800006. Cross-check: psgc.gitlab.io/api (older: 81 provinces, Maguindanao unsplit) has 1,597 of psgc.cloud's 1,656 city/municipality codes; the 59 missing are Manila's districts and newer BARMM units. Gaps: no Negros Island Region (2024) in either mirror; psgc.cloud names arrive double-encoded ("PiÃ±as"), fixed in psgc.mjs. Compare with the PSA masterlist when a person downloads it |
| 9 | HazardHunterPH https://hazardhunter.georisk.gov.ph, GeoRiskPH | Hazard assessment per point | "© 2018 - 2020 DOST-PHIVOLCS, All rights reserved." Terms link text not shown | No date | Web map + PDF report per point; no public API; partner accounts for more | Per-user automated queries are not licensed | VERIFIED (notice only). Keep today's one hand-read summary per home zone; ask PHIVOLCS in writing before anything more |
| 10 | OpenStreetMap data | POIs (hospitals, police, fire, shelters), roads | ODbL 1.0: "you may distribute the result only under the same license" + credit "OpenStreetMap and its contributors" (https://www.openstreetmap.org/copyright) | Live | Our own extract only | n/a | VERIFIED |
| 10b | Geofabrik Philippines, https://download.geofabrik.de/asia/philippines.html | The extract | ODbL 1.0 | Daily (PBF to 2026-10-30T21:24Z on the day read) | PBF 583 MB, SHP 1.3 GB, GPKG 1.4 GB | Direct download allowed | VERIFIED |
| 10c | Public Overpass API | — | "Commercial use should use self-hosted or paid Overpass servers"; "No parallel running of multiple scripts" (wiki) | — | — | **Never an app backend.** Fine for a person's one-off query | VERIFIED |
| 10d | tile.openstreetmap.org | — | "Offline use is not permitted"; bulk = "any pre-emptive fetching of tiles" (https://operations.osmfoundation.org/policies/tiles/) | — | — | **Never for offline packs.** Self-host Protomaps extracts (D-105..107) | VERIFIED |
| 10e | Protomaps basemap builds | Vector tiles for offline maps | Not read (redirect not followed) | ? | ? | ? | UNVERIFIED (data is OSM, so ODbL attribution applies anyway) |
| 11 | geoBoundaries PHL ADM2 (https://www.geoboundaries.org) | Province + HUC polygons for offline point-in-polygon | Dataset field: "CC BY 3.0 IGO" (homepage says CC BY 4.0; the dataset field governs). Attribution required | Source 2023-01-19, build 2023-07-05 | API / GeoJSON | Allowed | VERIFIED (API read). Check the file's metadata before shipping |
| 11b | HDX COD-AB Philippines | Same, from PSA/NAMRIA | Not read (403) | ? | ? | ? | UNVERIFIED |
| 12 | PAGASA CAP feed, https://publicalert.pagasa.dost.gov.ph/feeds/ | Warnings (already used by alerts-ingest) | **No licence found on pagasa.dost.gov.ph.** The "CC BY 4.0" seen earlier was a Google developer page about CAP feeds, not PAGASA | Live | CAP XML | Feed is meant for machines | UNVERIFIED: conflicts with the earlier note "PAGASA CAP is CC BY 4.0". Ask PAGASA or find the statement on the feed page |
| 13 | UP NOAH (Project NOAH), https://noah.up.edu.ph | Flood (5/25/100-year), landslide (+ debris flow / alluvial fan), storm surge (advisory 1-4) hazard polygons per province | `NOAH_License.pdf` in the Downloads folder: "open data licensed under the Open Data Commons Open Database License (ODC-ODbL)", attribution to Project NOAH required, share-alike | Drive folder files last modified 14 and 21 Oct 2021 (owner resilience.institute), so the hazard maps are 2021 data or older | Public Google Drive folder linked as "Downloads" from the site (https://drive.google.com/drive/folders/1ALE4-E9c-4AGjm1fqiPprWHrLUskeY9o), one zip per province; the site's point API (noah-api.up.edu.ph) is not covered by that licence | Download allowed by the licence; we do not call their API. `X-Frame-Options: SAMEORIGIN`, so no iframe; no URL deep link | VERIFIED in a browser (licence, folder layout, flood readme). File format and attribute names UNVERIFIED until a download. Design: HAZARDS.md |

## What this means for the build

1. **Seed rows are hand-cited, one source per row** (`supabase/seed/local-data/*.csv`). The refresh job only checks that each source URL still
   answers; it never scrapes. Changed numbers are found by a person re-reading the page (the stale list tells them which rows are due).
2. **Coordinates**: never invented. They come from (a) a source that prints them, (b) our own OSM extract (Geofabrik PBF, matched by name and
   town, then checked by a person). (b) makes `safety_places` partly a *derivative database* of OSM, so the published packs must carry the
   ODbL notice and be offered under ODbL. That is fine for us; the packs are public anyway. Rows without coordinates show as a list, not a pin.
3. **PSGC**: the whole schema keys on 10-digit PSGC codes, taken from the pinned psgc.cloud snapshot (row 8). Seed rows carry PSGC
   *names*; `psgc.mjs` writes `psgc_provinces.csv`, `psgc_lgus.csv` and `coverage.csv`, and `refresh.mjs` maps names to codes (LGUs within
   their province). npm/CRAN PSGC packages are not used. When a person gets the PSA masterlist, diff it against the snapshot and re-pin.
4. **Evacuation centres** have no national source. Per LGU: PDRRMO/CDRRMO pages and Facebook posts during events, DROMIC reports for named
   ECs, then OSM `amenity=shelter` / `emergency=assembly_point` checked by a person. Expect `not_confirmed` for most ECs at first.
5. **Hazards**: flood, landslide and storm surge come from UP NOAH's ODbL downloads as per-province PMTiles hazard packs (HAZARDS.md).
   HazardHunterPH (earthquake, volcano, tsunami) is all rights reserved with no API: keep `hazards.json` as the hand-read home-zone summary
   plus an "Open HazardHunterPH" button until PHIVOLCS agrees in writing.

## Still to check by hand (browser, about 30 minutes)

1. PSA PSGC page: download the latest masterlist, record its release date and terms, diff it against the psgc.cloud snapshot.
2. NHFR: read the FAQ/terms pages; export Region VII and Region XII lists (needs the owner's OK to download).
3. NDRRMC, OCD, PNP, BFP, PCG pages that returned 403: directory pages, terms, robots.txt.
4. PAGASA: a licence or terms statement for the CAP feed.
5. HDX COD-AB PHL licence; Protomaps build licence page.
