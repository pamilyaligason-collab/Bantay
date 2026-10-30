# Family Bantay inventory (read-only)

Repo: `D:\Claude\Bantay\.claude\worktrees\family-bantay-review-check-ac44fa` (HEAD 6f32f97). Live DB: Supabase `wuakimpssycbtnmoexuc`, read via SELECT only. DB clock at check: 2026-10-29 19:17 UTC.

## 1. Routes and screens

Router: hash routing. `parseHash` in `src/features/shell/routes.ts:8-23`. Shell in `src/App.tsx:40-115`. Tabs are `TABS` at `routes.ts:2`.

**Tabs** (`src/App.tsx:40-46`, `SCREENS`)

| Tab | Hash | Component | Source |
|---|---|---|---|
| Today | `#today` (default) | `screens/Today.tsx` | App.tsx:41, routes.ts:22 |
| Health | `#health`, `#health/*` | `screens/Health.tsx` | App.tsx:42, routes.ts:19 |
| Discover | `#discover/<sub>` | `screens/Discover.tsx` | App.tsx:43, routes.ts:18 |
| Family | `#family`, `#family/plan`, `#family/people`, `#family/people/<id>`, `#family/messages`, `#plan`, `#people` | `screens/Family.tsx` | App.tsx:44, routes.ts:10-11, Family.tsx:21 |
| Safety | `#safety`, `#safety/<page>`, `#medid`, `#gobag`, `#docs` | `screens/Safety.tsx` | App.tsx:45, routes.ts:13-17, Safety.tsx:31 |

**Sub-routes inside tabs**

| Hash | Component | Source |
|---|---|---|
| `#health/papers` (old `#records`, `#family/records` redirect here) | `Papers` inside Health.tsx | Health.tsx:58, :167; routes.ts:6; App.tsx:66 |
| `#health/metric/<code>` | Health tab (no own view) | routes.ts:19 |
| `#discover/learn`, `listen`, `play`, `watch`, `news` | `features/discover/{learn,listen,play,watch,news}/Screen.tsx` via `subScreen` | routes.ts:18; discover/index.ts:13 |
| `#family/people/<id>/report` | `features/family/Report` | Family.tsx:18, :26 |
| `#family/people/<id>` | `features/family/MemberPage` | Family.tsx:26 |
| `#family/messages` | `features/family/FamilyMessages` | Family.tsx:1, :21 |
| `#family/plan`, `#plan` | `features/family/Plan` | Family.tsx:4 |
| `#safety/<page>` | `SafetyRoute` (drawn by Safety) | Safety.tsx:16, :34 |
| `#medid`, `#medid/<personId>` | `features/medid/MedicalId` | Safety.tsx:6, :31 |
| `#gobag` | `features/gobag/GoBag` | Safety.tsx:5, :31 |
| `#docs`, `#docs/*` | `features/docs/DocsScreen` (view `docs`, tab safety) | routes.ts:13; App.tsx:115 |

**Non-tab views** (`VIEWS` set, routes.ts:3; rendered at App.tsx:115)

| Hash | Component | Source |
|---|---|---|
| `#me` | `screens/Me.tsx` | routes.ts:3; App.tsx:115 |
| `#notif` | `features/inbox/Inbox` | App.tsx:115 |
| `#scan` | `features/scan/ScanFlow` (lazy) | App.tsx:36, :115 |
| `#privacy` | `features/privacy/PrivacyScreen` | App.tsx:17, :115 |
| `#sharing` | `features/sharing/SharingScreen` (lazy) | App.tsx:38, :115 |
| `#weather`, `#weather?from=...` | `features/weather/WeatherScreen` (view weather, tab today) | routes.ts:12; App.tsx:115 |

**Admin** (`src/App.tsx:75`, `:115`; `routes.ts:20`)

| Route | Component | Source |
|---|---|---|
| `#admin/<page>/<id>` | `AdminScreen` in-app, shown only when `isAdmin` (App.tsx:75) | App.tsx:13, :115 |
| `/admin#/...` (separate page) | `features/admin/desk/types.ts:37` `webAdminUrl` redirects to the web admin, served from `admin.html` / `src/admin-main.tsx` | types.ts:37 |

Other: onboarding `#welcome` (`screens/Onboarding.tsx:26`), join `#join/<token>` (`features/setup/JoinFlow.tsx`, `features/setup/*`, `features/auth/pinLogin.ts:41-56`), `#sos` modal inside Safety (`Safety.tsx:49`).

## 2. Feature flags and env vars

**Feature flags**

| Flag | Mechanism | Source | Default |
|---|---|---|---|
| `learn.medcards` | `useKv` key (device-local KV, not env, not server). Gates Medicine and supplement cards and read-aloud. | `features/discover/learn/Screen.tsx:14, :26, :31-36`; `listen/Screen.tsx:7, :12`; `learn/pick.ts:28-31` | `false` |
| `bantay.onboarded` | localStorage / kv `onboarded` | `screens/Onboarding.tsx:7, :26` | off |
| `bantay.passkey.<personId>` | localStorage passkey flag, not a feature flag | `features/auth/family.ts:12, :80-82` | n/a |
| `FLAGS` (records lab flags) | Lab-value flag map, not a feature flag | `features/admin/desk/recordsApi.ts:349` | n/a |

No central `FLAGS` registry or `isEnabled()` helper found. The only grep hits for `isEnabled` / `FLAGS` are the lab-value flags above. The `learn.medcards` source (where it is switched on) is not in the repo: only read sites exist.

**Client env vars** (`import.meta.env`, Vite; `VITE_*`)

| Var | Used in | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | auth, sync, ask, news | `features/auth/client.ts:5`; `features/sync/sync.ts:65`; `features/safety/news.ts:61`; `features/discover/news/Screen.tsx:40` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | auth, sync, news | `features/auth/client.ts:6`; `sync.ts:66`; `news.ts:64` |
| `VITE_ASSISTANT_PROVIDER` (`edge` = Supabase `ask`, else n8n) | Assistant | `features/assistant/client.ts:9-12` |
| `VITE_ASSISTANT_URL` (n8n webhook) | Assistant | `features/assistant/client.ts:12` |
| `VITE_ASSISTANT_DAILY_CAP` | Assistant daily cap | `features/assistant/Assistant.tsx:28` |
| `VITE_KIWIX_URL` | source links | `features/assistant/tools.ts:69` |
| `VITE_VAPID_PUBLIC_KEY` | web push | `features/notify/subscribe.ts:10` |
| `VITE_APP_VERSION`, `VITE_BUILD_DATE` | update / version display | `features/admin/events.ts:24`; `features/phonecheck/report.ts:10`; `features/update/UpdateRow.tsx:13-14, :39` |
| `VITE_JOIN_STUB` (`1` = test build stub) | JoinFlow | `features/setup/JoinFlow.tsx:15` |

Build-time global: `__ALLOW_NO_AUTH__` (dev bypass when Supabase env is unset; `AuthGate.tsx:15, :65`).

**Server env vars** (`Deno.env.get`, edge functions)

| Var | Function(s) | Source |
|---|---|---|
| `ALLOWED_ORIGIN` | admin-members, ask, broadcast, family-names, pin-login | `admin-members/index.ts:14`; `ask/index.ts:76`; `broadcast/index.ts:14`; `family-names/index.ts:13`; `pin-login/index.ts:15` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | platform, most functions | `alerts-ingest/index.ts:24`; `dose-watch/index.ts:72`; `broadcast/index.ts:21-32`; `erase/index.ts:14` |
| `ALERTS_CRON_SECRET` | alerts-ingest | `alerts-ingest/index.ts:20` |
| `DOSE_WATCH_CRON_SECRET` | alerts-ingest, dose-watch | `alerts-ingest/index.ts:53`; `dose-watch/index.ts:61` |
| `DOSE_WATCH_AFTER_MIN` (default 30) | dose-watch | `dose-watch/index.ts:273` |
| `ERASE_CRON_SECRET` | erase | `erase/index.ts:13` |
| `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | broadcast, dose-watch | `broadcast/index.ts:19`; `dose-watch/index.ts:64` |
| `FIREBASE_SERVICE_ACCOUNT_B64` | FCM push | `broadcast/index.ts:76`; `dose-watch/index.ts:91` |
| ask LLM / secrets via `env()` helper | ask, family-names, pin-login | `ask/index.ts:14`; `family-names/index.ts:10`; `pin-login/index.ts:11` (key names not expanded here) |

Not in code: `FAMILY_INVITE_TOKEN` appears only in a test (`pin-login/join.test.ts:174`).

## 3. Edge functions and migrations

**Edge functions** (`supabase/functions/`, 9 folders plus `_shared`)

| Folder | Files | Note |
|---|---|---|
| `admin-members` | index.ts | |
| `alerts-ingest` | index.ts, ingest.ts, parse.ts, pagasa.ts, fixtures/ | cron `alerts-ingest`; also calls dose-watch |
| `ask` | index.ts, context.ts, gate.ts, logic.ts | Assistant when `VITE_ASSISTANT_PROVIDER=edge` |
| `broadcast` | index.ts, logic.ts, hazard.test.ts | FCM and web push |
| `dose-watch` | index.ts, logic.ts | cron `dose-watch` |
| `erase` | index.ts, logic.ts, port.ts | cron `erasure` (name differs) |
| `family-names` | index.ts | |
| `pin-login` | index.ts, join.ts | invite join |
| `records-extract` | index.ts, logic.ts, README.md | cron `records-extract` |
| `_shared` | fcm, heartbeat, http, login, members, names, pin, templates, handle, shared | shared helpers |

**Migrations** (`supabase/migrations/`): 69 files total = 41 up + 28 down.
- Last up: `0042_kudos.sql` (also the newest in `schema_migrations`, see section 4).
- Last 6 ups: 0037_sharing, 0038_join_claim, 0039_marked_by_digest, 0040_push_tokens, 0041_rollcall, 0042_kudos.
- Gap: no `0028_*` file (0027 jumps to 0029). Worth knowing when reading history.
- Note `0014`-`0042` each have a `.down.sql`; `0001`-`0013` (ups only) do not, per the file list.

## 4. Live Supabase (project wuakimpssycbtnmoexuc, read-only)

**cron.job**

| jobname | schedule | active |
|---|---|---|
| dose-watch | */15 * * * * | true |
| records-extract | */10 * * * * | true |
| sos-events-prune | 20 19 * * * | true |
| erasure | 10 19 * * * | true |
| alerts-ingest | */10 * * * * | true |

**job_runs** (columns: id bigint, job text, ran_at timestamptz, ok bool, summary jsonb)

| job | runs | last_ran (UTC) | last_ok | all_ok |
|---|---|---|---|---|
| alerts-ingest | 350 | 2026-10-29 19:10:09 | true | **false** |
| dose-watch | 241 | 2026-10-29 19:15:04 | true | true |
| erase | 3 | 2026-10-29 19:10:02 | true | true |
| records-extract | 361 | 2026-10-29 19:10:02 | true | true |

Freshness: DB now 2026-10-29 19:17:46 UTC, 17 job_runs rows in the last hour. Jobs are current.

Gaps: `sos-events-prune` and `erasure` never write to `job_runs`. The cron `erasure` maps to job_runs `erase`.

**Row counts**

| Table | Rows | Note |
|---|---|---|
| people | 10 | |
| carers | 5 | table name matches |
| readings | 75 | |
| meds_taken | 3 | |
| carer_alerts | 36 | |
| push_tokens | **0** | |
| invite_tokens | **0** | |
| rollcall | **0** | table name matches (`rollcall`, not `roll_call`) |

**schema_migrations (top 5, by version desc)**

| version | name |
|---|---|
| 0042 | kudos |
| 0041 | rollcall |
| 0040 | push_tokens |
| 0039 | marked_by_digest |
| 0038 | join_claim |

Matches the folder (latest 0042_kudos).

## 5. Jack Jack usage (`<JackArt`)

Pose names are the `JACK_ALT` keys (`src/features/look/JackArt.tsx:6`, type at :28).

| file:line | Pose | Size | Notes |
|---|---|---|---|
| src/features/assistant/Assistant.tsx:350 | thinking | 48 | decorative |
| src/features/discover/learn/Cook.tsx:80 | cooking | 48 | decorative |
| src/features/discover/learn/Recipes.tsx:21 | cooking | 96 | |
| src/features/discover/learn/Screen.tsx:35 | reading | 96 | |
| src/features/discover/listen/Screen.tsx:35 | listening | 96 | |
| src/features/discover/play/Screen.tsx:34 | celebrate (if today.n >= 3) else playing | 96 | conditional |
| src/features/discover/watch/Screen.tsx:13 | watching | 96 | |
| src/features/exercise/MoveScreen.tsx:10 | walking | 96 | |
| src/features/family/People.tsx:93 | well-done | 72 | decorative, shown when okAt && !sos |
| src/features/health/Medicines.tsx:99 | medicine | 88 | |
| src/features/look/EmptyState.tsx:9 | empty-list | 88 | fallback when no icon |
| src/features/setup/ChecklistCard.tsx:31 | get-help | 56 | decorative |
| src/features/setup/JoinFlow.tsx:79 | hello | 112 | |
| src/features/setup/StartDone.tsx:46 | hello | 112 | |
| src/features/shell/JackFab.tsx:57 | head | 48 | decorative |
| src/features/today/NextUp.tsx:93 | well-done | 48 | decorative |
| src/features/today/SimpleToday.tsx:89 | well-done | 96 | decorative |
| src/features/today/SimpleToday.tsx:101 | sleepy | 72 | decorative |
| src/features/today/WeatherCard.tsx:74 | dynamic `{jack}` (value set upstream) | 56 | not a fixed pose |
| src/screens/SignIn.tsx:238 | hello | 150 | |

Poses defined in `JACK_ALT` with no literal `<JackArt name=` use: drink-water, family-hug, ready-for-rain, offline. The `ready-for-rain` pose may be reached through the dynamic `jack` in WeatherCard.tsx:74 (not traced).

## Surprising items (summary)

1. Cron is live: DB now 19:17 UTC, all four logged jobs last ran 19:10-19:15 on 2026-10-29. No stale job.
2. `alerts-ingest` ran 350 times but is not all-OK. Last failure 2026-10-29 01:30 UTC. Last run succeeded.
3. `push_tokens` has 0 rows. No device has registered for push in the live DB, so FCM/web push delivery cannot have been exercised.
4. `invite_tokens` has 0 rows and `rollcall` has 0 rows. Invite and roll-call features are unused in the live DB.
5. `sos-events-prune` and `erasure` run in cron but never write `job_runs`; freshness for them is unverifiable from the table.
6. Cron name `erasure` vs logged job `erase`: the naming mismatch makes job_runs joins fail if assumed.
7. Migration gap: no `0028_*` file. 41 ups vs 28 downs, so 0001-0013 have no down scripts.
8. `learn.medcards` is device-local `useKv` (`Screen.tsx:14, :26`), with no server-side setter in the repo. Medicine cards show only on devices that set it.
9. `carers` 5, `people` 10, `readings` 75, `meds_taken` 3: meds logging is thin against the other tables.
10. `#plan`, `#people`, `#family/records` and `#records` are aliases (routes.ts:6, :10); the old Records screen now lives at `#health/papers`.
