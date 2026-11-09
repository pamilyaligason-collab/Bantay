# Offline barangay packs (D-181)

`node scripts/places/build-barangays.mjs` reads OpenStreetMap through the Overpass API and writes `public/geo/barangays/`.
Node 24 built-ins only. One request at a time, 3 s gap, backoff on 429/5xx, raw answers cached in the OS temp dir (`--cache <dir>` to move it), so a rerun after a failure is cheap. A full build takes about 1.5 hours on the public server, mostly waiting on 502/504 retries. `--only <region>` writes a trial under the cache dir, never over the shipped packs.

## What is read
- Regions: `admin_level=3` relations inside `ISO3166-1=PH` (18). A region that times out is split by province (`admin_level=4`).
- Barangay relations: `boundary=administrative` + `admin_level=10`, `out center`.
- Barangay nodes: OSM has relations for only about 5,000 of the roughly 42,000 barangays; most are nodes tagged `admin_type:PH=barangay` (or `special_barangay`). Puroks and sitios carry `admin_level=10` too, so `admin_type:PH` is the filter. Untagged `place=village` nodes fill gaps. `place=neighbourhood` nodes are left out (puroks and subdivisions, about 3x too many). A node is dropped when a relation of the same name lies within about 2 km.
- Town: admin_level 6 city or municipality only. admin_level 7 relations in PH OSM are city districts ("Sixth District", mostly Metro Manila): each is mapped to the level-6 city that lists it as a member, else the smallest level-6 box that holds its box. The tag `is_in:city` / `is_in:municipality` / `addr:city` / `addr:municipality` wins when present (and is ignored when it names a district); else the level-6 or mapped-district relation that lists the barangay as a member; else the smallest such bounding box holding the point. Empty string when none matches. The build fails if any town matches /district/i and prints the count.
- Rows named `Purok ...` or `Sitio ...` are dropped (not barangays), at the build.

## How the app uses it
`src/features/location/barangayPacks.ts` reads `index.json` once and fetches only tiles listed there (a non-JSON content type or HTTP error is empty for the session). A bare-number name reads "Barangay 670". `nearestPlace.ts` looks up each good GPS fix once (about 110 m key, a miss is asked again after 10 minutes) and `placeWords.ts` shows "<barangay>, <town>" (name only when the town is empty) once it lands, with the zone/area wording until then and when nothing is found. `src/sw.ts` caches `/geo/barangays/*.json` cache-first.

## Output
- `<lat>_<lon>.json`: tile = floor of lat and lon, rows `[lat, lon, name, town]`, 4 decimals (about 11 m).
- `index.json`: tile counts, total, build date, source and licence. `coverage.json`: the table below.
- Data (c) OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright

## Build of 2026-11-09
35,562 points, 91 tiles, 1,415,768 bytes, largest tile 94,847 bytes (`14_120.json`, Metro Manila and Cavite). 6,720 points (19%) have no town.

| Region | Relations (level 10) | Place nodes added |
|---|---|---|
| Metro Manila | 900 | 105 |
| Calabarzon | 1316 | 2234 |
| Ilocos Region | 156 | 2710 |
| Cordillera Administrative Region | 150 | 1064 |
| Cagayan Valley | 92 | 1780 |
| Central Luzon | 911 | 1841 |
| Mimaropa | 120 | 1174 |
| Bicol Region | 63 | 2861 |
| Western Visayas | 165 | 2831 |
| Central Visayas | 188 | 1880 |
| Eastern Visayas | 278 | 3563 |
| Zamboanga Peninsula | 27 | 1458 |
| Bangsamoro | 23 | 1170 |
| Soccsksargen | 72 | 1015 |
| Caraga | 24 | 1213 |
| Northern Mindanao | 42 | 1609 |
| Davao Region | 172 | 1033 |
| Negros Island Region | 339 | 984 |

Known gaps: Metro Manila (about 1,700 barangays, 1,005 here), Bangsamoro (about 2,600, 1,193 here) and Mimaropa, Bicol, Caraga are thin in OSM. Points are centres or map nodes, not boundaries, so near a border the name can be the next barangay. Where nothing lies within the radius the app falls back to the town/zone wording.
Spot checks: Dampas, Tagbilaran City point is 0.74 km from the Dampas home pin; Conel, General Santos 0.00 km.
