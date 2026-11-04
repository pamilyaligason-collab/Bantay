# Bantay v13 Implementation Plan (master)

**Goal:** Ship the v13 redesign (28 mockup boards on canvas https://claude.ai/artifact/EkqEj26JKUwpAR3673MjuR) as the live app, tab by tab, plus the data systems it needs (offline maps, local safety database, World monitoring, push alerts).

**Architecture:** Phase 0 lays one shared foundation (tokens, components, shell, P0 bugs, test policy) on one branch. Phase 1 rebuilds each tab in a parallel lane on that foundation (UI only, existing data). Phase 2 adds the new data systems as separate lanes with their own migrations. Phase 3 is assets, licences and release. Each lane gets a detailed TDD plan (`docs/plans/2026-11-xx-<lane>.md`) written at launch, per the writing-plans scope rule.

**Tech Stack:** React + Vite + TypeScript, Dexie (local first), Supabase (Postgres, RLS, edge functions, cron), Capacitor 8.5 APK (loads the live web app, so UI ships without reinstall; native plugin changes need a new APK), Leaflet today, then MapLibre or protomaps-leaflet with self-hosted PMTiles, GSAP (already lazy-loaded) for motion, Vitest + Playwright.

Decisions: D-105 (hybrid Apple look, Today focus, Jack sheet, Me focus, GPS last fix), D-106 (Z-Anatomy layered renders), D-107 (World inside Safety, tiered alerts). Audit: `AUDIT.md`. Stack verdict: `STACK-REVIEW.md`. Architecture map: section 1 below.

---

## 1. What exists (from the code map, 2026-10-31)

- Shell: `src/features/shell/` (`routes.ts` tabs today/health/discover/family/safety, views me/notif/admin/scan/privacy/sharing; `TabBar.tsx`, `JackFab.tsx`, `TopBar.tsx`, `SubHeader.tsx`, `AskSheet.tsx`, `shell.css`).
- Look system: `src/styles/tokens.css` (v6 cream/green, light/dark/system blocks), `app.css`, `glass.css`, `narrow.css`; `src/features/look/` (`HeroCard`, `Tile`, `Row`, `AlertCard`, `Ring`, `Sky`, `Aurora`, `BreathOrb`, `gsap.ts`, `motion.ts`, `useReducedMotion.ts`).
- Screens: `src/screens/{Today,Health,Discover,Family,Safety,Me}.tsx` with children in `src/features/<area>/`.
- Data: Dexie `src/db.ts` (outbox, kv, profiles), sync `src/features/sync/{tables,sync}.ts`, 9 edge functions (alerts-ingest, ask, broadcast, dose-watch, erase, family-names, pin-login, records-extract, admin-members), migrations up to 0044 (0044 not applied).
- Risk: layout tests. Height budgets in `e2e/s16-*.spec.ts` (Today 1150/1400/1500, Family 1650/1500, Health 1250/700, Discover 800, Settings 850/700, motion 1900) via `e2e/s16.ts assertBudget`; stylesheet-text contrast tests (`look/contrast.test.ts`, `today/chipContrast.test.ts`, `viewas/viewas.contrast.test.ts`, `family/family-ui.test.tsx`, `weather/scene.test.ts`). These encode v6/v12 and must be rewritten deliberately, not deleted.
- No per-PR CI; only `release-apk.yml`.

## 2. Phases, lanes and gates

### Phase 0 - Foundation (1 lane, sequential, ~2 days) - blocks everything
| # | Task | Files |
|---|---|---|
| 0.1 | v13 tokens: system font stack, warm grouped background, white cards, green accent, tint families, radii 16/20/24, per-tab theme hooks (weather sky, calm teal) in light + dark | `src/styles/tokens.css`, `app.css`, `glass.css` |
| 0.2 | Shared components: `LargeTitle` header (kicker + 34 px title + right actions), `Section` (header + 44 px link), `GroupedList` + `Row` (icon, title, sub, value, chevron), `PreviewTile`, `Carousel`, `Segmented`, `Sheet` (grabber, swipe and button close), `MapCard` (image or live map, credit, recentre) | `src/features/look/*` |
| 0.3 | Glass tab bar + Jack button that opens the Jack sheet (Help hold 3 s, Scan, Chat); remove Today SOS pill; Safety keeps SOS | `shell/TabBar.tsx`, `shell/JackFab.tsx`, new `shell/JackSheet.tsx`, `screens/Today.tsx`, `sos/*` |
| 0.4 | P0 bugs: Health opens on Me (`records/useHealthData.ts:46` root cause), view-only hero, detail header safe-area top, location last real GPS fix stored (`loc.last` kv) with "last known" label, Dampas only as labelled first-run fallback | `records/useHealthData.ts`, `health/*`, `shell/SubHeader.tsx`, `location/useLocation.ts` |
| 0.5 | Test policy: replace v12 height budgets and stylesheet-text tests with v13 equivalents (measured bounding boxes, computed contrast from tokens), keep a11y and no-sideways-scroll specs | `e2e/s16.ts`, `e2e/s16-*.spec.ts`, contrast tests |
Gate 0: tsc 0, vitest green, Playwright shell + a11y green, 390x844 light/dark shots of shell + Jack sheet match boards, Opus review pass.

### Phase 1 - Tabs (7 parallel lanes after Gate 0, ~2-3 days)
| Lane | Boards | Scope (UI on existing data) |
|---|---|---|
| T Today | Main | Weather/alert hero with motion (reduced-motion safe), My day ring + to-dos, Calm card, Your numbers carousel, setup row |
| W Weather | Weather | Hyperlocal screen: area forecast, next 2 h (estimated), around you, live map card, 48 h, 10 day, details, official row |
| H Health | Health, HealthMember, Readings, Labs, Medicines, Visits, MoveFood, BodyWiki | Summary, Pinned, Family health card, Me switcher sheet, sub-screens restyled (Labs modern range, Medicines empty state) |
| F Family | Family, FamilyFeed (UI shell) | Today person cards, activity graph with BP/Steps/Medicines slicer, Needs you now, map + people, Together list |
| D Discover | Discover | Watch hero, Learn tiles, Listen (TTS), Play, Good news |
| S Safety | Safety, Warnings, StormTracker, Hazards, RescueMap, FirstAid, FirstAidCPR, OfflineMaps (UI), World + AlertSettings (UI) | Near me / World switch, calibrated warnings, live map cards, first-aid grid and CPR player |
| C Calm | Mindful, JackSheet chat entry | Breathing orb hero, mood check, Listen and watch carousel (NEW items behind flags), crisis card |
Gate 1 per lane: tsc 0, vitest green, lane Playwright specs (v13 budgets), shots vs board light/dark at 390 and 360/195 narrow, Opus review pass; merge to integration branch; full suite on integration; the owner OK before merge to main.

### Phase 2 - Data systems (parallel lanes, can start with Phase 1)
| Lane | Scope | Needs the owner OK |
|---|---|---|
| M Maps | Self-hosted Protomaps PMTiles (Bohol first, then PH), MapLibre or protomaps-leaflet, offline download manager (own province first, rest after 24 h on Wi-Fi + charging), Windy live layer card | hosting cost, R2/storage |
| L Local data | Integrate the `local-safety-db` session output: region packs by PSGC province, auto-switch on GPS province change, nearest centres, hotlines; replaces `src/data/safety/*.json` | migration apply |
| A Alerts | PHIVOLCS bulletin reader, NASA EONET, PAGASA CAP display, tiered rules (urgent = tsunami, signal 3+, M6+ PH, red flood, volcano 3+), FCM push via `@capacitor-firebase/messaging`, 7 AM digest | APK 2.8 (plugin), deploy |
| G World | World panels (Manage panels), GDELT digest, EONET map layer | deploy |
| P Family feed | `family_posts` + per-category sharing (labs, BP, photos, status) with RLS; feed aggregation of check-ins, readings, memories | migration apply |
| Q Weather blend + air quality + nowcast | Server-side weather blend in an edge function (key `OPEN_WEATHER_API_KEY` as a Supabase secret, never in the app): OpenWeather (minutely rain, alerts, air pollution) + Open-Meteo + other free sources (research running), cached per ~1 km cell, bias-checked against METAR stations; air quality; "remind before rain" | secret set, deploy |

### Phase 3 - Assets, licences, release
- 3.1 Z-Anatomy layered renders in Blender (install Blender, exclude NC parts, Credits page) (D-106).
- 3.2 First-aid animations (17 topics) or Philippine Red Cross licence; offline storage.
- 3.3 Licences in writing: Open-Meteo commercial terms, Windy embed, RainViewer, DSWD list, NCMH numbers on DOH site.
- 3.4 Release: web via Cloudflare Pages (main), APK 2.8 only for native plugin changes; vault handoff + mockup canvas update.

## 3. Task list (Tasks 0/34)
1. The owner approves the mockup canvas (28 boards) and this plan
2. Write Phase 0 detailed plan (`docs/plans/2026-11-01-v13-foundation.md`)
3. 0.1 tokens v13
4. 0.2 shared components
5. 0.3 tab bar + Jack sheet, SOS move
6. 0.4 P0 bugs (Health Me, view-only hero, safe area, last GPS fix)
7. 0.5 test policy rewrite
8. Gate 0 review + merge to integration
9. Lane T Today
10. Lane W Weather
11. Lane H Health
12. Lane F Family
13. Lane D Discover
14. Lane S Safety
15. Lane C Calm
16. Phase 1 integration: full vitest + Playwright, Opus release review
17. The owner OK, merge to main (web live)
18. Lane M maps: Protomaps extract + hosting decision
19. Lane M: offline download manager
20. Lane L: review local-safety-db output, apply migration (the owner OK)
21. Lane L: region packs in app, nearest centres
22. Lane A: PHIVOLCS + EONET ingest
23. Lane A: tiered alert rules + digest
24. Lane A: FCM push + APK 2.8
25. Lane G: World panels + GDELT digest
26. Lane P: family feed migration (the owner OK) + UI wiring
27. Lane Q: air quality + nowcast
28. Phase 2 integration + Opus review
29. 3.1 anatomy renders
30. 3.2 first-aid animations or licence
31. 3.3 licences confirmed
32. Release APK 2.8 (the owner OK)
33. Update mockup canvas to match live
34. Vault handoff, retro

## 4. Order and speed
- Critical path: 1 -> 2 -> Phase 0 (2 days) -> Phase 1 lanes in parallel (7 Sonnet builders, Opus review each) -> integration.
- Phase 2 lanes M, L, A, G, Q start the same day as Phase 1 (no file overlap with UI lanes except the screens they feed; they expose hooks, the UI lanes consume them behind flags).
- About 8 agents at a time (standing order). Fix rounds go back to the lane builder; re-audit after any fail.

## 5. Self-review
- Spec coverage: every board maps to a lane (Main T; Weather W; Health set H; Family/FamilyFeed F + P; Discover D; Safety set S + M/L/A/G; Mindful/JackSheet C; World/AlertSettings S + G). Owner asks covered: Apple look (0.1-0.3), Today focus (T), Jack sheet (0.3), Health Me (0.4), GPS last fix (0.4), feature visibility (all lanes), live maps (S, M), offline maps (M), local database (L), hyperlocal (W, Q), World OSINT (G), alerts (A), anatomy (3.1), first-aid offline (3.2), calm (C).
- Gaps called out: Family feed needs backend (P); Calm radio/podcasts need licence checks (3.3) and stay behind NEW flags until then.
