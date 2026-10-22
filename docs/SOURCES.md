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

## Food and salt (session 8, W3 nutrition)

- Nutrient values (energy, sodium, potassium, protein per 100 g) come from USDA FoodData Central (FDC), CC0 public domain: https://fdc.nal.usda.gov/ . Credit is shown anyway on Health > Food and salt ("USDA FoodData Central").
- Single foods use their FDC entry. Filipino dishes (adobo, sinigang, tinola, pancit, lugaw, arroz caldo, champorado, longganisa, tocino, tuyo, daing, instant noodles, sinangag and the rest) are RECIPES: grams of FDC ingredients per serving, written in scripts/nutrition/recipes.json. `node scripts/nutrition/build-foods.mjs` turns that file into src/features/nutrition/foods.json (a vitest checks the two always match). Recipe grams are Bantay's own estimate of a typical home serving.
- STATUS: when this was written the FDC API answered 429 (DEMO_KEY limit), so every ingredient value was entered by hand and is marked `verified: false`; every food built from them is marked `estimate: true`. Many ingredient FDC ids are still null (the FDC description to search for is in `fdcName`), and the few ids filled in were recalled, not looked up. To finish: set FDC_API_KEY (free, https://fdc.nal.usda.gov/api-key-signup) and run `node scripts/nutrition/build-foods.mjs --verify`, fix any DIFF it reports in recipes.json, set verified:true, rebuild. Cached FDC responses go under .scratch/fdc/ (ignored by version control).
- Bagoong has no plain FDC entry (only branded products), and instant noodles, canned sardines and galunggong are brand or species dependent: those values are estimates to check against a pack or jar label.
- NOT used: Philippine Food Composition Tables (FNRI PhilFCT) values. SparkyFitness is non-commercial and source-available: no code or data was copied from it.
- Salt limit: WHO, Salt reduction fact sheet, adults under 2000 mg sodium (5 g salt) a day: https://www.who.int/news-room/fact-sheets/detail/salt-reduction . Linked only (WHO content is CC BY-NC-SA, none of its text is bundled). Salt (g) = sodium (mg) x 2.5 / 1000.

## Jack's health knowledge base (session 9, lane JACK-C)

Migration 0025_knowledge.sql holds 44 short topic summaries (`knowledge_topics`) and the words people type, including Tagalog and Taglish (`knowledge_synonyms`). The reviewed file is scripts/knowledge/topics.json; `node scripts/knowledge/build.mjs` writes the seed into the migration and `--check` proves they match. Every summary is written in Bantay's own plain words (nothing copied or machine-translated from a source) and carries the public page it points to. Pages were reached (HTTP 200) on 2026-10-22. No runtime model call is involved.

| Source | What we do | Licence (checked 2026-10-22) |
| --- | --- | --- |
| MedlinePlus (NLM), medlineplus.gov | Own-words summary plus a link. | Site says MedlinePlus pages are public domain ("not copyrighted") unless marked; some content (the drug pages come from ASHP) is copyrighted and licensed for MedlinePlus only. We copy none of it, only link. https://medlineplus.gov/about/using/usingcontent/ |
| NHS website, www.nhs.uk | Own-words summary plus a link. | Open Government Licence v3.0 except where a page says otherwise (https://www.nhs.uk/our-policies/terms-and-conditions/). We copy no text; the licence would allow it with the OGL credit. |
| WHO, www.who.int | Own-words summary plus a link. Two numbers (under 2,000 mg sodium, under 5 g salt, 1 g salt = 400 mg sodium) restated from the fact sheet. | CC BY-NC-SA 3.0 IGO, non-commercial. Only the facts are restated, no text or images are bundled. |
| DILG (Philippines), calabarzon.dilg.gov.ph | 911 as the national emergency number (already CONFIRMED above). | Government page, linked only. |

- Numbers in the summaries: blood pressure 140/90 clinic and 135/85 home (NHS, "High blood pressure", checked 2026-10-22), WHO sodium limit as above, adults 150 minutes a week (NHS older adults activity page, from the NHS physical activity guidelines), 7 to 9 hours of sleep (general adult guidance on the NHS sleep page; re-check wording), slow breathing about 4 in and 6 out (a common relaxation pattern; the NHS stress page recommends breathing exercises, not these counts). The other summaries are qualitative.
- Not verified word for word: the FAST wording on the NHS stroke page did not load as plain text for the link check (FAST is the NHS and Stroke Association standard), and the NCMH line 1553 in `low-mood` is the same "LISTED, re-check" entry as in the hotline table above. A clinician should review the whole file before it goes live; `reviewed_at` is the date the links were checked, not a medical sign-off.
- Tagalog titles and synonyms were written by the build agent and need a native-speaker read.
- Brand names appear only as search words (Norvasc, Lipitor, Glucophage, Lasix and similar) so a family can find the generic card.
