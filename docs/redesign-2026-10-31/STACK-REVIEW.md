# Bantay data and map stack: is it the best available? (2026-10-31)

Question from the owner: "verify and make sure that the current implementation is the best out there including resources and open repos."
Method: read the app code (src/features), fetched the live feeds and official terms pages on 2026-10-31. UNVERIFIED marks a claim not confirmed from a fetched page.

## Verdict per area

| Area | Today in the app | Best available (verified) | Verdict |
|---|---|---|---|
| PH official warnings | PAGASA public CAP feed via `alerts-ingest` | Same feed: publicalert.pagasa.dost.gov.ph/feeds/ (Atom + CAP XML, CC BY 4.0). Live check: 51 entries, newest GFA #3 (Final) Davao Region, 31 Oct 17:02; Typhoon Rosal warnings ended 24 Oct | **Keep. Already best.** Add: show the newest CAP entries on Warnings and World with source and time. |
| Earthquakes | USGS GeoJSON | USGS is the only structured feed. PHIVOLCS has bulletin pages but no RSS/JSON/API (checked its home page) | **Keep USGS; add a PHIVOLCS page reader** (own parser, label latency unverified). |
| Volcanoes | none | PHIVOLCS bulletins (wovodat bulletin list), no feed | **Gap: add a bulletin reader** for alert levels (Kanlaon, Mayon, Taal). |
| Global disasters | GDACS RSS | GDACS API (free, attribution required, automated alerts not reviewed); NASA EONET v3 (GeoJSON, no key) | **Keep GDACS; add EONET** for wildfires, volcanoes, storms worldwide. |
| Weather forecast | Open-Meteo point forecast, 10 days | Open-Meteo is the best free global API, but its free tier is **non-commercial** (open-meteo.com/en/terms). No PH-native model; 15-minute steps outside Europe/US are interpolated | **Keep, but confirm the licence** (paid plan if Bantay is ever monetised). Label 15-minute nowcast as estimated. |
| Rain radar | none (Windy embed on tap) | RainViewer: "personal and educational use only". Windy free embed widget exists; embed terms UNVERIFIED | **Windy embed for the live layer; ask Windy/RainViewer in writing before launch.** |
| Maps | Leaflet + tile.openstreetmap.org (online only) | OSM tile policy: "Offline use is not permitted on tile.openstreetmap.org". Protomaps PMTiles (BSD tools, ODbL data) can be extracted per region and self-hosted | **Change: self-host a Protomaps extract** (Bohol first, then PH). Real sizes still to measure. |
| Evacuation centres | 6 hand entries, no coordinates | No current national list. DSWD DROMIC master list (2016, licence UNVERIFIED), OSM (thin; PhilAWARE tags UNVERIFIED) | **Gap: OSM extract + DSWD list (after licence check) + barangay confirmations**, status and source shown per centre. |
| World / OSINT | none | koala73/worldmonitor (AGPL-3.0, ~90k stars): good ideas, code cannot go into a closed app. GDELT (free, 15-min updates) for news signals | **Build our own on Supabase ingest; borrow ideas only.** |
| Push alerts | local reminders; web push planned | FCM via `@capacitor-firebase/messaging` for the APK; carrier cell broadcast is separate | **Add FCM for instant tiers; daily digest via scheduled function.** |
| First-aid video offline | YouTube (privacy mode, online) | YouTube terms forbid offline copies (III.E.1). WHO terms need permission for app reuse | **Own animations (in production) or Philippine Red Cross licence.** |
| Anatomy art | SVG figure | Z-Anatomy, CC BY-SA 4.0 (repo pushed 2026-10-30) | **Use Z-Anatomy renders (D-106).** |

## Before release (must check in writing)
1. Open-Meteo commercial terms (if any income).
2. Windy embed terms and RainViewer commercial use.
3. DSWD evacuation list licence.
4. NCMH crisis numbers on the official DOH page.
5. Real Protomaps extract sizes (Bohol, PH).

Sources: publicalert.pagasa.dost.gov.ph/feeds/ · phivolcs.dost.gov.ph · open-meteo.com/en/terms · rainviewer.com/api.html · operations.osmfoundation.org/policies/tiles · docs.protomaps.com · gdacs.org (Terms of use Mar 2025) · eonet.gsfc.nasa.gov/docs/v3 · gdeltproject.org/data.html · github.com/koala73/worldmonitor · developers.google.com/youtube/terms/developer-policies · github.com/Z-Anatomy/Models-of-human-anatomy
