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

## Move: mobility and exercise videos (session 9, W1-MOVE)

Move steps, cautions and counts are written in Bantay's own words (rules still wait for clinician review, docs/session-8/CLINICAL-REVIEW.md). Videos are only embedded, never downloaded or re-hosted: official channels (National Institute on Aging, NHS inform, Mayo Clinic), shown through the click-to-load player (youtube-nocookie.com) with the still picture from i.ytimg.com before the tap. Every id below returned HTTP 200 from https://www.youtube.com/oembed?url=<watch url>&format=json on 2026-10-22, and the channel and title are the ones oEmbed reported. Ids that did not return 200 were dropped.

| Move id | Channel | Title (as oEmbed reports) | URL |
|---|---|---|---|
| sit-to-stand | NHS inform | Sit to stand | https://www.youtube.com/watch?v=29WFLqHgYZ0 |
| heel-raises | National Institute on Aging | Toe Stand Strength Exercise for Older Adults | https://www.youtube.com/watch?v=04zZLGcrN5Y |
| wall-push-up | National Institute on Aging | Wall Pushups Strength Exercise for Older Adults | https://www.youtube.com/watch?v=751E9kAdkwg |
| side-leg-lift | National Institute on Aging | Side Leg Raise - Strength Training Exercise for Older Adults | https://www.youtube.com/watch?v=045sWtKt5D4 |
| hip-bridge | NHS inform | Bridging | https://www.youtube.com/watch?v=EeTfT5zpt_s |
| one-foot-stand | National Institute on Aging | Stand on One Foot Balance Exercise for Older Adults | https://www.youtube.com/watch?v=QT5d4tTXW6U |
| heel-toe-steps | National Institute on Aging | Heel-to-Toe Walk Balance Exercise for Older Adults | https://www.youtube.com/watch?v=z_GKdFf3qv4 |
| ankle-circles | National Institute on Aging | Ankle Stretch for Older Adults | https://www.youtube.com/watch?v=87BeiyTFZyU |
| hamstring-stretch | National Institute on Aging | Back Of Leg Stretch for Older Adults | https://www.youtube.com/watch?v=guOj99WPZnw |
| calf-stretch | NHS inform | Standing calf stretch | https://www.youtube.com/watch?v=uuVyVuSbXrA |
| neck-side-tilt | Mayo Clinic | Deskercise - Neck and Shoulder Stretches | https://www.youtube.com/watch?v=5lbe9oZbpDs |
| ankle-alphabet | National Institute on Aging | Ankle Stretch for Older Adults | https://www.youtube.com/watch?v=87BeiyTFZyU |
| seated-knee-extension | NHS inform | Seated knee extension stretch | https://www.youtube.com/watch?v=XvueUfN-LVw |
| seated-spine-twist | Mayo Clinic | Deskercise - Lower Back and Torso Stretches | https://www.youtube.com/watch?v=5M-b1c2spPE |
| seated-back-arch | National Institute on Aging | Back Stretch for Older Adults | https://www.youtube.com/watch?v=FpIfMyfpCk0 |
| knee-rolls | NHS inform | Knee rolls | https://www.youtube.com/watch?v=QxsmVexWs_4 |
| pelvic-tilt | NHS inform | Pelvic tilts | https://www.youtube.com/watch?v=xbyk3ebdwRI |
| back-leg-raise | National Institute on Aging | Back Leg Raise Strength Exercise for Older Adults | https://www.youtube.com/watch?v=B54sRn3f8S0 |
| chair-dip | National Institute on Aging | Chair Dip Strength Exercise for Older Adults | https://www.youtube.com/watch?v=LVRcXDEdC5U |
| overhead-press | National Institute on Aging | Overhead Arm Raise Strength Exercise for Older Adults | https://www.youtube.com/watch?v=VPiawRHRpmY |
| thigh-squeeze | NHS inform | Static quad strengthening | https://www.youtube.com/watch?v=shSiZn5x9R8 |
| supported-leg-raise | NHS inform | Supported leg raise | https://www.youtube.com/watch?v=o4ScRYNv7pY |
| sideways-hip-lift | NHS inform | Sideways hip lift | https://www.youtube.com/watch?v=S79T0-2GyKM |
| shoulder-arm-stretch | National Institute on Aging | Shoulder and Arm Stretch for Older Adults | https://www.youtube.com/watch?v=CW0h60-PS4Y |
| knee-hug | NHS inform | Single knee hug | https://www.youtube.com/watch?v=I6sP_tzzb_4 |

Playlist additions on Health > Videos (src/data/videos.json), same check:

| Video id | Channel | Title | URL |
|---|---|---|---|
| G1lwVhnnkoU | National Institute on Aging | 10-minute workout for older adults | https://www.youtube.com/watch?v=G1lwVhnnkoU |
| Ev6yE55kYGw | National Institute on Aging | 15-minute workout for older adults | https://www.youtube.com/watch?v=Ev6yE55kYGw |
| KcdkySvCRCc | National Institute on Aging | 6 flexibility exercises for older adults | https://www.youtube.com/watch?v=KcdkySvCRCc |
| -Ru_cJhrNOA | NHS inform | Falls: level 1 balance and strength exercises | https://www.youtube.com/watch?v=-Ru_cJhrNOA |
| y_blTU65X3U | NHS inform | Falls: level 2 exercises | https://www.youtube.com/watch?v=y_blTU65X3U |
| IYTZwBzjNC0 | NHS inform | Steps for Stress: a breathing exercise | https://www.youtube.com/watch?v=IYTZwBzjNC0 |

Moves not listed above have no video: 31 of the 57 moves, of which 10 are new in session 9 (shoulder-blade-squeeze, seated-hip-opener, side-step, feet-together-stand, clock-reach, seated-hamstring-curl, seated-figure-four, breathing-walk, mindful-walk, pursed-lip-walk). No official embeddable video that matched them was found. Video ids prove the video exists and can be embedded; the match to the move is by title and has not been watched through. tai-chi-sway had a Mayo Clinic news clip and it was removed because it does not demonstrate the move. Playlist lengths (minutes) are not recorded (null).

Osteoporosis twist exclusion: Giangregorio LM et al., Too Fit To Fracture: exercise recommendations for individuals with osteoporosis or osteoporotic vertebral fracture, Osteoporosis International 2014;25:821-835, https://doi.org/10.1007/s00198-013-2523-2 (linked only; cited from memory, not fetched in session 9).
