# Session 16 IA inventory (G-5), read-only Haiku sweep 2026-10-30, file:line on commit 0cadb58

Router: src/features/shell/routes.ts:8-23 parseHash, :6 canonicalHash (#records and #family/records -> #health/papers); dispatch src/App.tsx:40-46, :66, :115.

## Routes
- #today -> src/screens/Today.tsx (also unknown hashes)
- #health -> src/screens/Health.tsx Overview :71; subs: labs, med/<id>, body (anatomy ExploreScreen), meds, papers (Records), library, library/<key>, videos, move, nutrition, refill, visits, summary, nudge, metric/<code> (:42-68)
- #discover/<learn|listen|play|watch|news> -> src/screens/Discover.tsx; deeper learn/meds, learn/med/<id>, learn/recipes, learn/recipe/<id>, learn/cook/<id>, play/trivia, play/facts
- #family, /plan, /messages, /people/<id>, /people/<id>/report -> src/screens/Family.tsx; also #plan, #people
- #safety/<page>, #medid[/<id>], #gobag, #safety/firstaid/<id> -> src/screens/Safety.tsx
- #docs, #weather[?from=action], #me, #notif, #admin/..., #privacy, #sharing, #scan -> App.tsx:115

## Links into routes that move in the redesign
- #health/library: discover/learn/Screen.tsx:56, health/HealthLinks.tsx:63, library/Article.tsx:33
- #health/videos: HealthLinks.tsx:64
- #health/papers: HealthLinks.tsx:61, Health.tsx:99, LabDetail.tsx:57, LabsList.tsx:77,93, shell/AskSheet.tsx:50, scan/ScanFlow.tsx:218, scan/open.ts:12
- #records: inbox/build.ts:111; Jack open_screen 'records' assistant/tools.ts:7,50 -> Assistant.tsx:186,259
- #discover/*: data/discover/seasons.json:15, discover/today/pick.ts:33,39,40, learn/* self links, play/Screen.tsx:27
- #family/people/<id>: Me.tsx:136, CarerCards.tsx:133, People.tsx:102,123, inbox/MissedDoseActions.tsx:39, MemberPage.tsx:142, medid/MedicalId.tsx:20
- #family/messages: CarerCards.tsx:151, MissedDoseActions.tsx:43; #family/plan: today/nextPick.ts:78, PlanToday.tsx:37,58
- #me: shell/TopBar.tsx:64, MedDetail.tsx:147, MedicalId.tsx:8,45, PrivacyScreen.tsx:67
- Jack OfflinePanel: assistant/OfflinePanel.tsx:12-13 (safety/firstaid, medid)

## e2e specs touching moving routes
health-overview, subpage-header, media, records, records-db, health-auth, health-a11y, health-v6, ask-sheet, family-plan, s14-l-labs.auth, scan,
onboarding, s12-learn, s13-d-discover, s14-j-jack, s12-shell(.auth), s12-play, s12-f3-shots, tabbar-overlap, no-sideways-scroll, family-messages,
family-report, s12-core.auth, s12-polish, s14-f2-family.auth, s6c-lock.auth, shell, admin, auth, profile-auth, phone-warnings, s12-marked-by.auth,
s12-sharing.auth, sensors, s16-narrow-text.auth.

## Current section order
- Today: AlarmFixedToast, IncomingSos, AlertBand, StormCard, WeatherCard, AlertCardToday, NextUp, QuickLog, SOS, SelfCare, PlanToday, SeeWeek, More (AlertsBanner, UpdateCard, PwaBanner, NearbyList, WeekLine)
- Health Overview: PersonChips, headline, NudgeCard, Kpis, empty state, BodyMap, NudgeEntry, MedicinesSummary, LatestList, LabsRow, HealthLinks (Papers, Library, Videos)
- Discover: PickCard, SeasonCard, sub-nav Learn/Listen/Play/Watch/News
- Family: segments Home/Messages/Plan; Home = AcceptCard, IncomingSos, StormRollCall, CarerCards, Today's check-in, roll-call bubbles
- Me: identity, Simple mode, carer-of rows, sharing, SOS contacts, Medical ID, Alerts, digest, push, Privacy, call, alarm health, quiet hours/text size/theme/language, setup checklist, SensorSettings, update/admin, passkey/switch/forget

Not swept: Safety and Discover sub-screen internals, People/Plan internals.
