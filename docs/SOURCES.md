# Safety sources and credits

Read 2026-10-17 unless a row says otherwise. Every bundled entry in `src/data/safety/*.json` also carries its own source and date.

## Credits and licences

- Wikipedia text, if any is added later, must be credited "Wikipedia, CC BY-SA 4.0". None is used yet.
- Ready.gov content is US public domain. Bantay's cards are written in our own words and cite it as a source.
- Posters are original SVG cards drawn for Bantay (`Poster` in `src/features/safety/Practice.tsx`). No third-party poster is used.
- No worldmonitor (AGPL) code is used. worldmonitor.app is only a link card.

## Embeds and links

| Item | URL | Framing test (curl -I, 2026-10-17) |
| --- | --- | --- |
| Ventusky | https://embed.ventusky.com/ | frameable |
| Windy | https://embed.windy.com/ | frameable |
| HazardHunterPH | https://hazardhunter.georisk.gov.ph/ | frameable |
| PAGASA Panahon | https://www.panahon.gov.ph/ | frameable |
| Project NOAH | https://noah.up.edu.ph/ | not frameable, link card |
| worldmonitor ("World view") | https://worldmonitor.app/ | not frameable, link card |
| JMA typhoon map | https://www.jma.go.jp/bosai/map.html | link out only |

Only a location rounded to 2 decimals (about 1 km) is put in map URLs.

## Dampas hazards (HazardHunterPH, pin 9.645705, 123.877951)

Storm surge Safe. Rain-induced landslide Low. Flood not listed (UNKNOWN). Ground shaking Prone, Intensity VIII. Liquefaction, tsunami, ground rupture Safe. Nearest active fault about 12.4 km (Maribojoc). Severe wind 88 to 117 kph (20-year), 117 to 220 kph (500-year). Ashfall Prone. Nearest government health facility Dampas Barangay Health Station 728 m. Private: Bohol Cooperative Hospital 756 m. https://hazardhunter.georisk.gov.ph/

## Places and hotlines

| Entry | Value | Source | Date | Status |
| --- | --- | --- | --- | --- |
| National emergency 911 | 911 | DILG, https://calabarzon.dilg.gov.ph/ | 2026-10-17 | CONFIRMED |
| Red Cross 143, DOH 1555, NCMH 1553 | national lines | prototype v5 list | 2026-10-17 | LISTED, re-check |
| Dao evacuation centre | name only | PTV News / PNA, 2018-12-18, https://ptvnews.ph/dpwh-7-turns-over-evacuation-center-to-tagbilaran-city/ | 2018-12-18 | UNKNOWN (no coordinates, Dampas coverage unverified) |
| Dampas Barangay Health Station, Bohol Cooperative Hospital | distance only | HazardHunterPH | 2026-10-17 | UNKNOWN coordinates |
| Gov. Celestino Gallares Memorial Medical Center | name only | https://ldr.senate.gov.ph/subject/governor-celestino-gallares-multi-specialty-medical-complex | 2026-10-17 | UNKNOWN |
| BFP Tagbilaran | 2015 address only | https://ppdo.bohol.gov.ph/ (Dec 2015 table, outdated) | 2015-12 | UNKNOWN |
| Tagbilaran 911 unit | no number | https://mb.com.ph/2026/03/17/mayor-tagbilaran-remains-safe-peaceful | 2026-03-17 | UNKNOWN |
| Bohol Light Company | no number | https://newsinfo.inquirer.net/1646053/ (2022 NGCP advisory) | 2022 | UNKNOWN |
| Water provider | no number | https://newsinfo.inquirer.net/912341/ (2017) | 2017 | UNKNOWN |

The family fills the UNKNOWN rows in the app (tap "Not confirmed yet, tap to add"). Edits are stored on the phone only and marked "Added by the family".

## Safety cards

Written in plain words, not copied. Sources named on each card: NDRRMC/OCD, PAGASA, PHIVOLCS, DOH, Philippine Red Cross, WHO, BFP, Ready.gov. The text was written from general knowledge of that guidance, not copied from fetched pages, so the family should check it against the linked pages.

## News feed (ops/n8n/news-feed.json)

Feeds checked with curl on 2026-10-17:

- https://www.phivolcs.dost.gov.ph/feed/ : 200, RSS
- https://bohol.gov.ph/feed/ : 200, RSS
- https://pia.gov.ph/feed/ and https://doh.gov.ph/feed/ : 403 Cloudflare challenge to curl, included but unverified
- PAGASA: no RSS found (feed URLs return 404)
- Tagbilaran City site: no feed (returns an HTML app)
- YouTube channel feeds: channel ids not known, node left disabled with a placeholder
