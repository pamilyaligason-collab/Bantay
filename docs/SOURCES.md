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

## Move (senior exercise, session 8)

Bantay-original move text and rules. The targets come from:

- WHO, Guidelines on physical activity and sedentary behaviour (2020): https://www.who.int/publications/i/item/9789240015128 . Adults 65+: at least 150 minutes of moderate activity a week, muscle strengthening on 2 or more days, and balance work on 3 or more days.
- CDC, Physical Activity Guidelines for Older Adults: https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html . Same weekly targets, plus a start slowly and build up message.

The weekly ring in src/features/exercise/weekly.ts counts 150 minutes and 2 strength or balance days (the stricter 3 balance days in the WHO text are not tracked separately). The full rule list is in docs/session-8/CLINICAL-REVIEW.md, waiting for a clinician.

## Act early first-aid pages (session 8, src/features/safety/firstaid.json)

Steps and "Call 911 when" lists are written in Bantay's own words; no third-party text or images are bundled. Pages link out; videos are official YouTube videos shown click-to-load through youtube-nocookie.com (oEmbed checked 2026-10-21). Source pages opened 2026-10-21 (HTTP 200) unless noted.

| Topic | Video (channel) | Learn-more sources | Licence note |
| --- | --- | --- | --- |
| Choking | 8R3RWC-xx1I (American Red Cross) | video page | Red Cross: all rights reserved, link and embed only |
| CPR | M4ACYp75mjU (American Heart Association); aks4waFy5yU (Philippine Red Cross, link) | https://www.redcross.org/take-a-class/cpr/performing-cpr/cpr-steps | AHA and Red Cross: all rights reserved |
| Bleeding | YJB3fI3T1oo (American Red Cross); caPHddkuT4M (Philippine Red Cross, link) | video pages | all rights reserved |
| Burns | ELrT-y1nsJk (American Red Cross) | https://www.nhs.uk/conditions/burns-and-scalds/ | NHS text OGL |
| Stroke | C8EO3SM0Y_w (AHA) | https://www.nhs.uk/conditions/stroke/symptoms/ ; https://www.who.int/news-room/fact-sheets/detail/stroke | WHO CC BY-NC-SA, link only |
| Heart attack | Z5QJ7tz2OTc (American Red Cross) | https://www.nhs.uk/conditions/heart-attack/ | |
| Heat stroke | 0xubzGiAjEU (Mayo Clinic) | https://www.nhs.uk/conditions/heat-exhaustion-heatstroke/ | Mayo: all rights reserved |
| Seizure | 7MPJauo4DdY (British Red Cross) | https://www.nhs.uk/conditions/epilepsy/ | |
| Fainting | oF6NS7iJyAA (British Red Cross) | https://www.nhs.uk/symptoms/fainting/ | |
| Broken bone | IPlazeozEOU (British Red Cross) | video page | |
| Drowning | nfh5WgCDwMo (American Red Cross) | https://www.who.int/news-room/fact-sheets/detail/drowning | |
| Snake bite | hAgkZfCaIQ4 (WHO) | https://www.who.int/news-room/fact-sheets/detail/snakebite-envenoming | |
| Dog or cat bite | AaL7zL5S7Ww (DOH Philippines); _hchkrLTr98 (WHO, link) | https://www.who.int/news-room/fact-sheets/detail/rabies | |
| Low blood sugar | gDBzUF4E1IU (British Red Cross) | https://www.nhs.uk/conditions/low-blood-sugar-hypoglycaemia/ | |
| Severe allergic reaction | O-8pPTVql5k (American Red Cross) | https://www.nhs.uk/conditions/anaphylaxis/ | |
| Dengue warning signs | none | https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue ; https://www.nhs.uk/conditions/dengue/ | |
| After a fall | none | https://www.nhs.uk/conditions/falls/ | |

The DOH and AHA video pages were verified through YouTube oEmbed only (title and channel), not read as web pages.

## Family report, learning hub and Memories (session 8)

Bantay's own words throughout. Nothing below is copied or bundled; each source is linked or embedded only.

- Member report verdict words and ranges: the same guide file as the rest of Health (src/data/guide-ranges.json, sources named there: AHA, ADA and others). "Things to bring up" are questions written by Bantay, following the MedlinePlus lab-test pages for what each test measures (https://medlineplus.gov/lab-tests/), public domain.
- Learning hub (src/features/family/hub.json):
  - NIMH, "So stressed out" fact sheet: https://www.nimh.nih.gov/health/publications/so-stressed-out-fact-sheet . Linked only. NIMH text is public domain; credited on the card.
  - MedlinePlus, Healthy sleep: https://medlineplus.gov/healthysleep.html . Linked only. Public domain; credited on the card.
  - Department of Health (Philippines) YouTube videos AQimPkd7g5I, HKK-58RZlMA, ExEXOfe81Nc: embedded through the click-to-load player (youtube-nocookie.com), ids checked against YouTube oEmbed on 2026-10-21. Not downloaded or re-hosted.
  - NHS, "How much is five a day?" YouTube video b-uX6N4RZjg: embedded the same way. NHS web text is OGL; the video is only embedded.
  - WHO, Healthy diet fact sheet: https://www.who.int/news-room/fact-sheets/detail/healthy-diet . Link only (WHO content is CC BY-NC-SA, so none of its text or images is bundled).
- Memories: no outside content. Photos are the family's own, kept in a private Supabase bucket (migration 0023). The app removes Exif and GPS by re-encoding through a canvas before upload; no face recognition and no social media import.
