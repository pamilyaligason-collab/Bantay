# Session 10 contracts: Phase 2 (safety wave within D-78)

Fixed before launch; changes go through the orchestrator (ML-02). Source: `docs/session-10/PLAN.md` rev 4 sections 3.1, 3.2a, 3.3, 3.4, 3.5; owner rules D-78 (in-app alerts only; SOS through the phone's own call and SMS apps; no Firebase, no SMS gateway, no native SMS sender, no Sentry) and D-79 (all 35 open questions take the PLAN section 6 default; Q32 = auto-dial).

Base sha: the commit "s10 p2 base" on top of `45113eb` (Phase 1 tip), branch `worktree-wf_3c06c5a3-ea5-1`; the orchestrator names the final sha in each lane brief. Lane builders start with `git reset --hard <that sha>` (ML-01).
Phase 1 part: the wave-2 fix-round contracts are not in this file at `45113eb`; the orchestrator adds them when the Phase 1 integration branch is merged. Nothing in the Phase 2 part depends on them.
Phase 3 contracts (migrations 0036+) are a separate later part.

## Pre-committed by the orchestrator (already in the base; lanes never edit these)

| File | What is there |
|---|---|
| `src/features/sync/tables.ts` | outbox specs `phone_health`, `sos_events`, `sos_events_update`, `sos_acks` (field lists below) |
| `src/features/sync/sync.ts` | `WAIT_FOR_TABLE` also holds `sos_events`, `sos_events_update`, `sos_acks`, `phone_health`, so a push before 0031 or 0032 is applied stays queued (soft) instead of dead-lettering an SOS; `sendRow` stamps `sentAt` (ISO, phone clock) on every send of a `sos_events` row; not saved to the outbox row, so a retry carries its own send time; `late` is never sent (the server decides) |
| `src/features/sync/sos-outbox.test.ts` | tests for the stamp, the PATCH spec and the snake_case mapping |
| `android/app/src/main/AndroidManifest.xml` | `<uses-permission android:name="android.permission.CALL_PHONE" />` (Q32 auto-dial) |
| `capacitor.config.ts` | `server.url = process.env.CAP_SERVER_URL ?? 'https://bantay.pages.dev'` |
| `supabase/functions/_shared/heartbeat.ts` | stub `heartbeat(sb, job, ok, summary?)`, a no-op; S8 replaces the body and keeps the signature; the client param is the structural type `HeartbeatClient` because `_shared` is type-checked by the app tsconfig |
| `package.json`, `package-lock.json` | no new dependency in Phase 2; lanes never touch them |

Outbox payload shapes (camelCase in, snake_case column out; unknown stays null, never 0, ML-05):

| Outbox table | REST target | Payload fields (all others are dropped) | Conflict / mode |
|---|---|---|---|
| `phone_health` | `phone_health` | `userId, platform, appVersion, alarmsOk, notifOk, exactOk, batteryOk, callOk, oem, lastOpenAt, alarmsCheckedAt, alarmsSet, alarmsRearmed, updatedAt` | upsert `on_conflict=user_id`, merge, no `client_id` |
| `sos_events` | `sos_events` | `id, personId, at, sentAt (stamped by sendRow), lat, lon, gps, callTo, smsOpened` | `on_conflict=id`, ignore-duplicates, no `client_id`; `user_id` default `auth.uid()`; `late`, `cancelled_at`, `created_at` are server/PATCH only |
| `sos_events_update` | PATCH `sos_events?id=eq.<id>` | `id` (selector only, not sent in the body), `smsOpened, callTo, cancelledAt` | a PATCH that RLS filters out is dead-lettered as `0rows` (existing behaviour) |
| `sos_acks` | `sos_acks` | `eventId, seenAt` | `on_conflict=event_id,user_id`, ignore-duplicates, no `client_id`; `user_id` default `auth.uid()` |

`phone_health.call_ok` is added by 0032 (S3); the `callOk` field is in the spec now so a lane never edits `tables.ts`. Family-side reads of `sos_events` and `sos_acks` go through Realtime and a poll in the owning lane (S2 / S4), not through sync pull.

## Lanes

| Lane | Owns (files / prefix) | Migration no. | Port | Reviewer |
|---|---|---|---|---|
| S1 ALERTS-INAPP (critical) | `supabase/migrations/0030_carer_alerts.sql` (+down, rehearsal), `src/native/shell.ts`, `src/features/notify/*`, `supabase/functions/_shared/templates.ts` (+ equality test), `_shared/http.ts`, `src/features/inbox/*`, `src/features/shell/TabBar.tsx` (badge only), `src/App.tsx` (hook lines only), `supabase/functions/dose-watch/index.ts` + new `dose-watch/index.test.ts`, `broadcast/index.ts` + `logic.ts`, `ops/sql/dose_watch_cron.sql`, `docs/ALERTS-INAPP.md` | 0030 | - | Opus 5.5 |
| S2 SOS (critical) | `supabase/migrations/0031_sos.sql` (+down, rehearsal), `src/features/sos/*` (incl. `Call911.tsx`, `SosHold.tsx`, `call.ts`, `sms.ts`, `SosButton.tsx`), `android/.../CallPlugin.java`, `android/.../MainActivity.java` (registration line) | 0031 | - | Opus 5.5 |
| S3 ALARMS (critical) | `src/features/health/reminders.ts`, `health/reminderActions.ts` (+tests), `src/features/phonecheck/*`, `supabase/migrations/0032_phone_health.sql` (+down, rehearsal), `android/.../SettingsOpenerPlugin.java`, `src/features/safety/settingsOpener.ts` (+test), `scripts/release-apk.ps1`, `docs/NATIVE.md` | 0032 | - | Opus 5.5 |
| S4 REVIEW + FAMILY-CARER (critical) | `src/features/health/meds.ts` (+test), `health/MedReview.tsx`, `health/Medicines.tsx`, `supabase/functions/dose-watch/logic.ts`, `dose-watch/dose-watch.test.ts`, `src/features/family/People.tsx`, `family/CarerCards.tsx`, `family/IncomingSos.tsx`, `family/FamilyPhones.tsx`, `family/FamilyAnswer.tsx`, `family/family.css` | - | - | Opus 5.5 |
| S5 ALERTS-AUTO (critical) | `supabase/functions/alerts-ingest/*`, `ops/sql/alerts_cron.sql`, `src/features/safety/*` except `settingsOpener.ts` and `settingsOpener.test.ts`, `src/screens/Safety.tsx`, `docs/ALERTS.md` | - | - | Opus 5.5 |
| S6a ONBOARD (critical) | `src/screens/Onboarding.tsx`, `src/features/setup/*`, `src/screens/SignIn.tsx`, `src/features/auth/pinLogin.ts`, `auth/pinReset.ts`, `auth/family.ts`, `auth/signin.css`, `src/features/shell/icons/*` | - | - | Opus 5.5 |
| S6b AUTH-SERVER (critical) | `supabase/migrations/0034_pin_reset_erasure.sql` (+down, rehearsal), `supabase/functions/pin-login/*`, `family-names/*`, `erase/*`, `_shared/pin.ts`, `pin.test.ts`, `handle.ts`, `login.ts`, `login.test.ts`, `ops/sql/erasure_cron.sql`, `docs/AUTH.md` | 0034 | - | Opus 5.5 |
| S6c LOCK + ME + PRIVACY (critical for privacy copy) | `src/features/auth/FingerGate.tsx` (+test), `auth/biometric.ts`, `src/screens/Me.tsx` (+test), `src/features/privacy/*`, `public/privacypolicy.html`, `public/breach-plan.html`, `src/features/medid/*`, `src/features/update/*` | - | - | Opus 5.5 |
| S7 TODAY | `src/screens/Today.tsx`, `Today.simple.test.tsx`, `src/features/today/*` except `weather.ts` and `WeatherCard.tsx`, `today.css` | - | - | Opus 5.5 |
| S7w WEATHER | `src/features/weather/*`, `src/features/today/WeatherCard.tsx`, `src/features/today/weather.ts`, `src/features/location/place.ts` | - | - | Opus 5.5 |
| S8 MONITOR | `supabase/functions/_shared/heartbeat.ts` (+test; replaces the stub), `supabase/migrations/0033_job_runs.sql` (+down, rehearsal), `src/features/monitor/errors.ts` (+test), `src/main.tsx`, `src/admin-main.tsx` (one hook line each), `src/features/admin/desk/System.tsx`, `desk/systemApi.ts`, `desk/types.ts`, `desk/WebShell.tsx`, `desk/Home.tsx`, `desk/homeApi.ts`, `src/features/admin/broadcast.ts`, `admin/AdminScreen.tsx`, `src/data/migrations.json`, `supabase/functions/records-extract/index.ts` (heartbeat line only), `docs/MONITORING.md` | 0033 | - | Opus 5.5 |
| S9 BP-GUIDED + VERDICT (critical) | `src/features/health/bpcheck/*`, `health/verdict.ts` (+test), `health/readingPreview.ts` (+test), `health/vitals.ts`, `health/ranges.ts`, `health/AddReadingSheet.tsx`, `health/MetricScreen.tsx`, `src/features/sensors/health.ts`, `supabase/migrations/0035_reading_alerts.sql` (+down, rehearsal), `docs/session-8/CLINICAL-REVIEW.md` ("Session 10 safety") | 0035 | - | Opus 5.5 |
| S10 JACK-CLIENT | `src/features/assistant/*` (incl. `gateClient.ts`), `scripts/jack-redteam.mjs`, `supabase/functions/ask/gate.ts` | - | - | Opus 5.5 |
| S11 RECORDS-NAME (critical, hazard K1) | `supabase/functions/records-extract/logic.ts` (+test), `src/features/records/*`, `src/features/scan/ScanFlow.tsx` | - | - | Opus 5.5 |

R1, R2, R3 are Haiku read-only research lanes (PAGASA feeds, OEM settings intents, RainViewer coverage) and own no files. One owner per file; test files are named, never globbed; nobody edits `src/db.ts`. Only S1, S2, S3, S8, S6b and S9 ship SQL; no lane writes a migration number it does not own.

## Migrations (apply order and numbers; none is applied by a lane)

`0030` (S1) -> `0031` (S2) -> `0032` (S3) -> `0033` (S8) -> `0034` (S6b) -> `0035` (S9). Rehearsed on WSL in that order; downs run strictly in reverse (0035 -> 0030). 0031 and 0035 call `notify_family` late-bound, so 0030 is applied first and dropped last. Every migration that adds or replaces a function restates its full grants: revoke from public, anon, authenticated (and service_role unless needed), then grant what it needs (ML-21). Every new table is added to the guarded Realtime block only where this file says so. `0028` is intentionally absent (the pending-migrations check skips it).

## Shared data (tables, columns, policies)

| Name | Owner lane | Shape | Who reads / writes | RLS rule |
|---|---|---|---|---|
| `public.carer_alerts` | S1 (0030) | `id uuid pk default gen_random_uuid()`, `person_id uuid references people(id) on delete cascade` (null only for kind `system`), `carer_user_id uuid not null references auth.users(id) on delete cascade`, `kind text not null check (kind in ('dose_missed','review_open','phone_health','reading_high','mood_unwell','hazard','sos','sos_cancel','digest','pin_approve','pin_changed','system'))`, `template text not null` (a `templates.ts` id, no values, B-7), `ref text` (dedupe key), `created_at timestamptz not null default now()`, `pushed_at timestamptz`, `seen_at timestamptz`, `expires_at timestamptz not null default now() + interval '7 days'`; check `carer_alerts_person (person_id is not null or kind = 'system')`; unique index `carer_alerts_ref on (kind, ref, carer_user_id) where ref is not null`; also `alter table public.documents add column if not exists printed_name text` (S11, hazard K1; the 0030 down KEEPS this column) | written only by `notify_family`, the 0031/0035 triggers, `pin-login` and the service role; read and `seen_at`-updated by the owner | select where `carer_user_id = auth.uid()`; `grant select` and `grant update (seen_at)` to authenticated; update policy `carer_user_id = auth.uid()`; no insert/delete grant to anon or authenticated; the bell hides rows past `expires_at`; `dose_watch_prune` deletes rows older than 30 days (ML-06); Realtime publication added only when `supabase_realtime` exists (guarded `do $$` block; the down removes it) |
| `public.phone_health` | S3 (0032) | `user_id uuid primary key`, `platform text check (platform in ('android','web'))`, `app_version text`, `alarms_ok bool`, `notif_ok bool`, `exact_ok bool`, `battery_ok bool`, `call_ok bool`, `oem text`, `last_open_at timestamptz`, `alarms_checked_at timestamptz`, `alarms_set int`, `alarms_rearmed int`, `updated_at timestamptz`; `alarms_ok` is null ("old app") on shells below 2.3.0 and on web | writer: the owner through the outbox spec `phone_health`; readers: carers, admin | own-row insert/update/select; carers select through `people.auth_user_id = phone_health.user_id` joined to `carers.carer_id = auth.uid()`; `is_admin()` select all |
| `public.sos_events` | S2 (0031) | `id uuid primary key` (client-supplied), `person_id uuid not null references people(id)`, `user_id uuid not null default auth.uid()`, `at timestamptz not null` (end of the hold, phone clock), `sent_at timestamptz` (outbox send time, same clock), `lat double precision`, `lon double precision`, `gps bool`, `late bool not null default false`, `call_to text check (call_to in ('family','911','none'))`, `sms_opened bool not null default false`, `cancelled_at timestamptz`, `created_at timestamptz not null default now()` | writer: the elder (or a writer carer of that person) through the outbox; readers: active family; Realtime + poll in S2/S4 | insert `with check (user_id = auth.uid() and (person is self or auth.uid() is a writer carer of person))` and NO count (an SOS is never refused; the throttle lives in the trigger); select for active family (`is_family_member()` from 0023); `grant select, insert` and `grant update (sms_opened, call_to, cancelled_at)`; update policy `user_id = auth.uid()`; Realtime guarded block adds it; retention 90 days (ML-06): 0031 (S2) defines `public.sos_events_prune()` (deletes `sos_events` rows older than 90 days, acks cascade; revoke from public, anon, authenticated) and schedules it daily in a guarded `cron.schedule` block (only when `cron` exists; the down unschedules it) |
| `public.sos_acks` | S2 (0031) | `event_id uuid references sos_events(id) on delete cascade`, `user_id uuid not null default auth.uid()`, `seen_at timestamptz not null default now()`, pk `(event_id, user_id)` | writer: the viewing family member through the outbox; reader: any one who can see the event | insert and select own user; select all acks of events one can see; `grant select, insert`; Realtime guarded block adds it |
| `public.job_runs` | S8 (0033) | `id bigint identity`, `job text`, `ran_at timestamptz`, `ok bool`, `summary jsonb` | writer: edge functions via `heartbeat()` (service role); reader: admin | `is_admin()` select only; keep 30 days |
| `public.client_errors` | S8 (0033) | `id bigint identity`, `user_id uuid`, `app_version text`, `where_ text`, `message_hash text`, `count int`, `day date`, `unique (user_id, where_, message_hash, day)` | writer: `log_client_error` only; reader: admin | admin select; keep 30 days; no stack, no URL, no values |
| `public.pin_reset_requests` | S6b (0034) | `id uuid pk default gen_random_uuid()`, `user_id uuid not null`, `method text not null check (method in ('google','family'))`, `code char(4) not null` (4 digits), `attempts int not null default 0` (wrong-code tries, ML-08), `secret_hash text not null`, `approved_by uuid`, `approved_at timestamptz`, `used_at timestamptz`, `created_at timestamptz not null default now()`, `expires_at timestamptz not null default now() + interval '15 minutes'` | writer: `pin-login` (service role), `approve_pin_reset` RPC | no direct grant to anon or authenticated |
| `public.erasure_requests` | S6b (0034) | `user_id uuid primary key`, `requested_at timestamptz not null default now()`, `cancel_until timestamptz not null default now() + interval '7 days'`, `done_at timestamptz` | writer: `request_erasure()` / `cancel_erasure()` / `erase` function | own user only through the SECURITY DEFINER functions |
| `public.people` (columns) | S6b (0034) | `consent_at timestamptz`, `consent_version text`, `consent_by uuid` added with `add column if not exists`; S6a writes `consent_version = '2026-10'`; `erased_at` is added by 0034 for the erase function | S6a (consent), S6b (erase) | existing `people` policies; S6b's 0034 states any new grant |
| `public.readings` trigger `readings_alert` | S9 (0035) | `after insert`, see RPC table | the trigger | n/a |
| kv `sos.contacts` | S2 (reads), S6a (writes in setup) | the existing `SosContact[]` from `src/features/sos/contacts.ts` (`{name, phone, personId?}`), max 2 (`MAX_SOS`) | S2, S6a, S6c | local only |
| kv `sos.active` | S2 | `{ id: string, step: 'recorded'\|'calling'\|'texting'\|'status', at: string (ISO, hold end), contactIndex: 0\|1 }`; removed when the SOS is cancelled or after the status screen is closed; lets a WebView killed during a long call resume on the status screen | S2 only | local only |
| kv `alerts.inapp.ok` | S1 | boolean; set true by `AlertsBanner` after the phone check passes for the app; re-enables the switch-to-app banner (Q1) | S1 | local only |
| kv `phone.check` | S3 | `{ at, notif_ok, exact_ok, battery_ok, alarms_ok, call_ok, oem }` last probe result (S5's Safety hub reads the "Phone alerts" count from it; S6a reads it for `start-done-fix`) | S3 writes; S5, S6a read | local only |
| Dexie store `notify/store.ts` | S1 | feature-local database for alert rows, the `family/store.ts` pattern; table `alerts` keyed by server `id`, fields = the `carer_alerts` columns in camelCase (`id, personId, kind, template, ref, createdAt, pushedAt, seenAt, expiresAt`) | S1 | local only; nobody edits `src/db.ts`; rows pruned locally at 30 days and 200 count (ML-06) |

Alert kinds are the single enum in the `carer_alerts.kind` check. Whitelists of that enum that must stay equal (ML-28): the 0030 CHECK, `NotifyKind` in `src/features/notify/alertsLive.ts`, the `template` to `kind` map in `supabase/functions/_shared/templates.ts`, the S8 System health "unseen alerts by kind" list. A lane that adds a kind updates all four in the same change and reports it in `needs`.

## Functions / RPCs / edge functions crossing lanes

| Signature | Owner | Callers | Returns (all values, incl. error values) | Rate limit |
|---|---|---|---|---|
| `public.notify_family(p_person uuid, p_kind text, p_template text, p_ref text, p_scope text) returns int` (plpgsql, SECURITY DEFINER, `set search_path = ''`) | S1 (0030) | the 0031 and 0035 triggers, SECURITY DEFINER wrappers, service role | rows inserted (int); `p_scope`: `'carers'` = writer carers of `p_person`, `'family'` = every active member except the person, `'self'` = the person's own user only (hazard rows); `insert ... on conflict (kind, ref, carer_user_id) where ref is not null do nothing`, so a duplicate `ref` inserts 0 | the dedupe `ref`; `revoke execute ... from public, anon, authenticated` (service_role and the definer owner only) |
| `public.raise_mood_alert(p_person uuid) returns int` (SECURITY DEFINER, `set search_path = ''`) | S1 (0030) | S7 `today-log` `unwell` tap | count inserted; raises an error `42501` (insufficient privilege) when `auth.uid()` is neither the person (`people.auth_user_id`) nor a writer carer of `p_person`; otherwise `notify_family(p_person, 'mood_unwell', 'mood_unwell', p_person \|\| ':' \|\| <Manila day>, 'carers')`; the ONLY alert an app caller may raise | one per person per Manila day (the `ref`); `revoke execute from public, anon; grant execute to authenticated` |
| `public.sos_events_late()` BEFORE INSERT trigger fn (SECURITY DEFINER, `search_path = ''`) | S2 (0031) | trigger `sos_events_late` | `new.late := coalesce(new.sent_at, new.at) - new.at > interval '30 minutes'`; an `at` in the future or a null `sent_at` counts as live (fail open); overrides any client value | n/a |
| `public.sos_events_alert()` AFTER INSERT trigger fn | S2 (0031) | trigger `sos_events_alert` | when more than 3 `sos_events` rows of `new.user_id` were created in the last 10 minutes it returns with no fan-out (throttle the fan-out, never the write); else `notify_family(person, 'sos', case when new.late then 'sos_late' else 'family_sos' end, new.id::text, 'family')`; then, only if `to_regproc('net.http_post') is not null`, pg_net POST to dose-watch `{"mode":"flush"}` with header `x-dose-watch-secret` read from Vault secret `dose_watch_cron_secret` | the 10-minute count |
| `public.sos_events_cancel()` AFTER UPDATE OF cancelled_at trigger fn | S2 (0031) | trigger `sos_events_cancel` | when `old.cancelled_at is null and new.cancelled_at is not null`: `notify_family(person, 'sos_cancel', 'sos_cancel', new.id::text \|\| ':cancel', 'family')` (once, by the `ref`) | n/a |
| Every body of the three SOS trigger fns | S2 | - | wrapped as `begin ... exception when others then raise warning 'sos trigger: %', sqlerrm; end; return new;` so an alert failure NEVER blocks the SOS write | n/a |
| `public.readings_alert()` trigger fn, trigger `readings_alert` AFTER INSERT ON `public.readings` | S9 (0035, needs 0030) | trigger | fires only when `new.source_file_id is null` and `new.taken_at > now() - interval '2 hours'`; each row on its own: `bp_systolic >= 180`, `bp_diastolic >= 120`, `glucose` or `fasting_glucose` `< 70 or > 300` mg/dL (mmol/L x 18 first), `spo2 < 90`; `notify_family(person, 'reading_high', 'reading_high', person \|\| ':' \|\| bucket \|\| ':' \|\| floor(epoch/21600), 'carers')` (one per person per bucket per 6 h); then the same guarded pg_net flush as 0031; whole body in `begin ... exception when others then raise warning 'readings_alert: %', sqlerrm; end; return new;` so a failure never blocks a reading insert; thresholds cite `docs/session-8/CLINICAL-REVIEW.md` and need the Task 17 sign-off | the `ref` bucket |
| `public.log_client_error(p_where text, p_hash text, p_app_version text) returns void` (SECURITY DEFINER) | S8 (0033) | `src/features/monitor/errors.ts` | upserts one row per (user, where_, hash, day), `count + 1`; `user_id` from `auth.uid()` only; raises on `length(p_where) > 64` or `length(p_hash) > 64`; silently does nothing when the user already has 50 rows for the day | 50 rows per user per day; `revoke from public, anon; grant to authenticated` |
| `public.admin_pending_migrations()` and `public.admin_weekly_kpis()` (SECURITY DEFINER, admin only via `is_admin()`) | S8 (0033) | `desk/System.tsx` | pending: set of versions in `src/data/migrations.json` not in `supabase_migrations.schema_migrations` (guards with `to_regclass`, empty set on WSL, skips 0028); KPIs: weekly jsonb | admin only |
| `public.approve_pin_reset(p_id uuid, p_code text) returns bool` (SECURITY DEFINER) | S6b (0034) | S6a `start-approve-req` sheet | true on first approval. The caller must be an active family member of the requester AND hold the `pin_approve` `carer_alerts` row for this request (`ref = p_id::text`, `carer_user_id = auth.uid()`); any other caller gets false and no attempt is counted against the request. Returns false for a wrong code (adds 1 to `attempts`; at 5 wrong codes the request is burned: `used_at` is set and every later call is false), an expired or used request, the requester themself, or an already-approved request (first approval wins). The code is 4 digits | `revoke from public, anon; grant to authenticated`; max 5 code attempts per request |
| `public.export_my_data() returns jsonb`, `public.request_erasure() returns timestamptz`, `public.cancel_erasure() returns void` (all SECURITY DEFINER, scoped to `auth.uid()`'s person) | S6b (0034) | S6c `start-privacy` | export jsonb of the caller's own rows; erasure returns `cancel_until`; cancel only before `cancel_until` | one open erasure per user (pk); `revoke from public, anon; grant to authenticated` |
| `public.request_pin_reset(text)` | S6b (0034) | retired (D-76): `revoke execute ... from anon, authenticated`; `admin_requests` kept for history | - | - |
| edge `dose-watch` port gains `carerRow(kind, personId, carerUserIds: string[], template, ref): Promise<void>` and `flushWebPush(now: Date): Promise<{ pushed: number }>` | S1 (`index.ts`); S4 owns `logic.ts` | S4 `logic.ts`, S5 and the 0031/0035 triggers via `mode:'flush'` | `carerRow` inserts `carer_alerts` with the service role and a conflicting `ref` is ignored; `flushWebPush` sends Web Push `{t, n?}` to the carer's `push_subscriptions` (browser and PWA users only) for rows with `pushed_at is null` and sets `pushed_at` either way ("offered"; the in-app row is the record) | cron `*/15` plus `mode:'flush'` |
| edge `dose-watch` body `{mode:'flush'}` with header `x-dose-watch-secret` (the cron secret) | S1 | the 0031 and 0035 triggers (pg_net), S5 `alerts-ingest` | runs only `flushWebPush`; wrong or missing secret: 401 and no work | constant-time secret compare |
| edge `dose-watch` env `DOSE_WATCH_AFTER_MIN` | S1 | - | default 30 (CANON 9:30); `WATCH_MAX_LATE_MIN` stays 360; restoring the old window = set 120 | - |
| edge `dose-watch` `dose_due` push (hazard M4) | S1 | - | at each slot, Web Push `{t:'dose_due'}` to the person's own subscriptions when `phone_health.platform` is `'web'` or missing | per slot |
| edge `dose-watch` phone-health sweep | S1 (`index.ts`) | - | `phone_health` with `alarms_ok = false`, or `last_open_at` older than 48 h, gets a `carer_alerts` kind `phone_health` row, `ref = user_id \|\| ':' \|\| <Manila day>` | once per phone per day |
| `heartbeat(sb: HeartbeatClient, job: string, ok: boolean, summary?: Record<string, unknown>): Promise<void>` (`supabase/functions/_shared/heartbeat.ts`) | S8 (stub pre-committed) | dose-watch, alerts-ingest, records-extract (the only hook points, see the hook table) | inserts a `job_runs` row; `ok = false` also writes `carer_alerts` kind `system` for every admin user (`person_id` null, `ref = job \|\| ':' \|\| floor(epoch/21600)`); never throws into the caller | one row per run |
| edge `pin-login` action `reset_start {handle, method: 'google'\|'family'}` | S6b | S6a `pinReset.ts` | `{id, secret}` (128 random bits, shown once, stored hashed) and the 4-digit `code` shown on the requester's screen; the SAME reply shape for every case (unknown handle included); method `family` inserts one `carer_alerts` `pin_approve` row per active member except the requester (`person_id` = the requester's person, `ref` = request id) | 3 per hour per handle and 10 per hour per IP (0009 pattern) |
| edge `pin-login` action `reset_complete {id, secret, new_pin}` | S6b | S6a | ok; verifies the secret against `secret_hash`, `approved_at` set, not used, not expired; hashes the PIN server-side with `_shared/pin.ts`; sets `used_at`; `audit_log` action `pin_reset`; inserts a `pin_changed` row for the owner; error codes distinct for expired, used, not-approved, bad-secret | its OWN per-IP bucket of 120 per hour (S6a fix round 1; it does not share the 10 per hour `reset_start` bucket). S6a polls it every 10 s backing off to 30 s and stops after 30 minutes (66 polls); a 429 from a poll is not a failure, the client keeps waiting and polls at 30 s. The per-request attempt cap (10 per hour per request id) must be at least 66 as well |
| edge `family-names` | S6b | S6a `start-who` | no-token mode unchanged (D-65); `?invite=<token>` mode returns the invite's names (M6); invite link form `https://bantay.pages.dev/#join/<token>` | existing |
| edge `erase` | S6b | cron `ops/sql/erasure_cron.sql` with secret `ERASE_CRON_SECRET` | after `cancel_until`: deletes readings, medications, meds_taken, activity, documents + storage objects, push rows, messages by that user, `carer_alerts`, sos rows; keeps `audit_log`; sets `people.erased_at` | cron |
| edge `alerts-ingest` (existing) after upsert | S5 | - | each NEW tier-1 `safety_alerts` row inside a member's home zone -> `notify_family(member person, 'hazard', template, safety_alerts.id::text, 'self')` with the service role and one `{mode:'flush'}` call; a rerun inserts none | existing |
| `broadcast` (existing) | S1 | S8 `admin/broadcast.ts` | also writes `carer_alerts` kind `hazard` rows so APK users see admin broadcasts in the app | existing |

### Exported TypeScript names and shapes (client)

Every entry is exported from the named file; signatures are exact.

```ts
// src/native/shell.ts (S1)
export function shellVersion(): string | null                 // App.getInfo().version, read once at start; null on the web
export function shellAtLeast(v: string): boolean              // semver compare; false on the web and when unknown
export function hasPlugin(name: 'Call' | 'SettingsOpener' | 'TextToSpeech' | string): boolean   // Capacitor.isPluginAvailable(name)

// src/features/sos/call.ts (S2)
export type CallPermission = 'granted' | 'denied' | 'unavailable'
export function callPermission(): Promise<CallPermission>     // 'unavailable' on the web, an old shell, or no Call plugin; never prompts
export function requestCallPermission(): Promise<CallPermission>   // the ONLY place that prompts; called from setup (S6a SOS-contacts card) and the Me row (S6c), NEVER from the SOS flow
export function callFirstContact(contacts: SosContact[], opts?: { emergency?: boolean }): Promise<{ placed: boolean; via: 'native' | 'tel' | 'none' }>
//   native CallPlugin first; 'tel' = ACTION_DIAL fallback (permission missing, PWA, old shell, no plugin, native refusal); 'none' = no contact
//   911 is never auto-dialled: opts.emergency = true always uses the 'tel:911' dial screen

// src/features/sos/sms.ts (S2): sosBody keeps the existing no-GPS branch; smsUri is replaced by one URI per contact
export function sosBody(o: { name: string; lat: number | null; lon: number | null; time: string; gps: boolean }): string
//   with a fix: `<Name> needs help. <time>. Location: <maps link> (<lat>, <lon>). Sent from Bantay.`
export function smsUris(contacts: SosContact[], body: string): { name: string; uri: string }[]   // one composer per contact (Q38); no two-recipient sms: URI

// kv + shapes (S2)
export interface SosActive { id: string; step: 'recorded' | 'calling' | 'texting' | 'status'; at: string; contactIndex: 0 | 1 }
export const SOS_ACTIVE_KEY = 'sos.active'
export const SOS_CONTACTS_KEY = 'sos.contacts'

// TemplateId is `keyof typeof TEMPLATES` exported by src/features/notify/templates.ts (S1; the id list is under Template ids below)
// src/features/notify/store.ts (S1): feature-local Dexie database (the family/store.ts pattern)
export interface AlertRow { id: string; personId: string | null; kind: NotifyKind; template: TemplateId; ref: string | null; createdAt: string; pushedAt: string | null; seenAt: string | null; expiresAt: string }
export const adb: Dexie & { alerts: Table<AlertRow, string> }
export function visibleAlerts(now?: Date): Promise<AlertRow[]>      // unexpired, newest first
export function unseenCount(now?: Date): Promise<number>            // unexpired and seenAt null; drives the TabBar badge and the bell
export function markSeen(id: string): Promise<void>                 // local first; the server update of seen_at goes through supabase-js (RLS: own rows, column grant)

// src/features/notify/alertsLive.ts (S1)
export type NotifyKind = 'dose_missed' | 'review_open' | 'phone_health' | 'reading_high' | 'mood_unwell' | 'hazard' | 'sos' | 'sos_cancel' | 'digest' | 'pin_approve' | 'pin_changed' | 'system'
export function startAlertsLive(userId: string): () => void         // subscribe to postgres_changes on carer_alerts filtered carer_user_id=eq.<uid>; unsubscribe on appStateChange inactive; resubscribe AND poll once on active; 30 s poll safety net; DELETE events ignored; returns the stop function
export function pollAlerts(): Promise<number>                       // one fetch of unexpired rows into the store; returns the number of new rows

// src/features/family/IncomingSos.tsx (S4): the red SOS banner at the top of Today and Family
export function IncomingSos(props: { placement: 'today' | 'family' }): JSX.Element | null   // renders only when an unseen kind 'sos' row with template 'family_sos' exists (and no later sos_cancel for the same event); a late row (template 'sos_late') gets the quiet "used SOS earlier" row in the alert list, never the red banner; banner actions follow the approved mockup lock-sos note: Call Mama, Open map, Call 911 (no "On my way"); opening writes a sos_acks row through enqueue('sos_acks','insert',{eventId, seenAt})

// src/features/notify/AlertCardToday.tsx (S1): newest unseen urgent row; priority SOS > reading > missed dose > hazard
export function AlertCardToday(): JSX.Element | null
// src/features/phonecheck/probe.ts (S3)
export interface ProbeResult { notif_ok: boolean | null; exact_ok: boolean | null; battery_ok: boolean | null; alarms_ok: boolean | null; call_ok: boolean | null; oem: string | null }
export function probe(): Promise<ProbeResult>                        // null = unknown (never false); call_ok from callPermission()
// src/features/phonecheck/AlarmHealthRow.tsx (S3) -> Me.tsx (S6c);  AlarmFixedToast.tsx (S3) -> Today.tsx (S7);  PhoneCheckCard.tsx (S3) = start-done-fix
// src/features/safety/StormCard.tsx (S5 owns and exports it, S7 imports and mounts it); src/features/health/bpcheck/BpCheckButton.tsx (S9 -> S7 QuickLog.tsx)
// src/features/today/WeatherCard.tsx exports WeatherStrip and RainMap through src/features/location/place.ts (S7w)
// src/features/monitor/errors.ts (S8): export function installErrorLogging(): () => void   // window.onerror + unhandledrejection; hashed message, once per error per day, no stack, no URL, no values
// src/features/health/verdict.ts (S9): the one BP table; hand-computed cases 134/84 above, 133/83 above, 138/86 high, 129/79 raised, 119/79 in, 88/58 low
```

Android plugin `CallPlugin` (S2, `android/.../CallPlugin.java`, registered in `MainActivity.java`; Capacitor plugin name `Call`): method `call({ number: string }) -> { placed: boolean }`. It checks `ContextCompat.checkSelfPermission(CALL_PHONE)` first, catches `SecurityException` and `ActivityNotFoundException`, refuses emergency numbers natively (`PhoneNumberUtils.isEmergencyNumber` plus 911, 112, 117), and returns `{ placed: false }` in EVERY refused case. Methods `checkPermission() -> { state: 'granted'|'denied' }` and `requestPermission() -> { state: 'granted'|'denied' }` back `callPermission()` and `requestCallPermission()`. `SettingsOpenerPlugin` (S3) gains OEM autostart and battery intents from R2; `src/features/safety/settingsOpener.ts` is the JS side.

## Events and kinds

| Kind | Owner | Meta fields (no PII) | Retention | Who may read |
|---|---|---|---|---|
| `carer_alerts.kind` values (above) | S1 | `kind`, `template` id, `ref` (an id or `<id>:<day>`, never a value, name or reading) | in-app hidden at `expires_at` (7 days); deleted at 30 days by `dose_watch_prune` | the row's `carer_user_id` only; admin gets aggregates (counts by kind and unseen) through S8, never other users' rows (ML-07) |
| `sos`, `sos_cancel`, `pin_approve`, `pin_changed`, `system` | never raised by an app caller | as above | as above | as above |
| `usage_events` names added in Phase 2 | each lane | name only, no values: `sos_hold`, `sos_cancel`, `alert_open`, `bp_check`, `phone_check_pass`, `phone_check_fail` | existing usage-events trim | existing |
| `job_runs` | S8 | `job`, `ok`, `summary` (counts only) | 30 days | admin |
| `client_errors` | S8 | `where_`, `message_hash`, `app_version`, `count`, `day` | 30 days | admin |
| Web Push payload | S1 | `{t: <template id>, n?: <count>}` only (B-7: no values) | n/a | the subscriber |

### Template ids (owner S1, `src/features/notify/templates.ts`, with `supabase/functions/_shared/templates.ts` a byte-identical copy kept equal by a test)

Existing ids keep their entries unchanged: `storm_warning`, `flood_watch`, `heat_alert`, `family_sos`, `dose_due`, `dose_missed`, `bp_check`. The record shape gains `tone`: `{ cls: Cls; title: string; body: string; tab: Tab; tone: 'urgent' | 'normal' }` (the existing entries get `tone` added in the same change). New ids and fixed copy (all fixed strings, no values; tone in brackets):

| id | cls | title | tab | tone |
|---|---|---|---|---|
| `sos_cancel` | safety | "The SOS was cancelled" (body "<name> said they are fine; open Bantay to see.") | family | normal |
| `review_open` | carer | "A medicine needs an answer" | health | normal |
| `phone_health` | carer | "A phone may miss alarms" | family | normal |
| `reading_high` | carer | "Please check on <name>" | health | urgent |
| `mood_unwell` | carer | "<name> is not feeling well" | family | urgent |
| `digest` | carer | "Today's family summary is ready" | family | normal |
| `pin_approve` | carer | "Someone asks you to approve a PIN reset" | family | urgent |
| `pin_changed` | safety | "Your PIN was changed" | today | urgent |
| `sos_late` | safety | "<name> used SOS at HH:MM; it reached Bantay later" | family | normal |
| `system` | carer | "Bantay needs your attention (admin)" | today | urgent |

`family_sos` stays urgent; `dose_missed`, `storm_warning`, `flood_watch`, `heat_alert` are urgent; `dose_due`, `bp_check` are normal. `<name>` is substituted by the in-app renderer from the local people table; the stored `template` and the Web Push payload carry only the id. In-app rows carry the same id.

## Copy rules (D-78, every lane)

- Never promise a push or a lock-screen alert on the Android app. Wherever the app says another person "will be told", it says **"will see it in Bantay"**, and adds **"and get a notification in the browser app"** only for PWA users (browser app with notifications on). APK card copy: "Family alerts show here when you open Bantay."
- SOS copy: "Your family will see this in Bantay." The phone's own apps do the instant part: the call and the text. Bantay never sends the text by itself; the elder taps Send. Cancel reads "Cancel, I don't need help" and marks a false alarm in the family's app.
- Dose repeat copy: the +20 text says "Third reminder; your family will see this in Bantay at :30" (Q34 window, `DOSE_WATCH_AFTER_MIN` 30). Reminder copy says "rings loudly", never "even on silent".
- Mood copy: the unwell tap says the family "will see it in Bantay".
- Privacy processors list (S6c): Supabase, Open-Meteo and RainViewer (coordinates rounded to 1 km), OpenRouter with zero-data-retention, Google Drive (family-owned folder), Cloudflare Pages (hosting). No Firebase, Sentry or SMS gateway is named or used in this build.
- Admin broadcast copy (S8): "In the app for everyone; browser users also get a notification".
- Weather and storm copy (S5): "From GDACS and Open-Meteo, checked every 10 minutes; PAGASA bulletin: open" unless R1 finds a PAGASA machine feed with terms.
- The mockup's D-78 notes are approved text in `D:/ObsidianVault/20-projects/family-bantay/mockups/bantay-complete-mockup.html` (template class="note" of each screen, quoted below verbatim as of the vault file at D-78), used by builders as written, never rewritten. Phase 2 screens: `start-banner`, `start-inbox`, `start-done-fix`, `simple-hold`, `lock-missed`, `lock-sos`, `lock-storm`, `safety-sos-hold`, `safety-sos-sent`; the eighth D-78 note (on `nudge-reminder`, Phase 3) keeps local reminders. `lock-storm` is the phone's own NDRRMC emergency alert and has no Bantay screen. Where an older PLAN line disagrees with a quoted note, the note wins (for example the SOS banner actions, below).

**`start-banner`**
> - D-78: there is no server push in this build. Family alerts live in the app (alert list and Today/Family cards), seen when the carer opens Bantay, so moving carers to the app does not cut instant alerts that never existed on a phone's lock screen.
> - The banner still appears only after the phone check passes for the app (alarms ring on time, Bantay can open the phone and text apps).
> - Later keeps it quiet for a day.
> - Shown on Android, only on a phone that passed the check. Browser users keep the existing browser web push (Browser app: notifications on).
> - What changed: nothing on this screen. The tab bar now reads Today, Health, Discover, Family, Safety.

**`start-inbox`**
> - Every family alert (missed dose, unanswered question, SOS, high reading, phone health, storm), newest first, with unread dots. The bell on Today and Family shows the count. Tap one to open what it is about.
> - D-78: alerts are in-app only, seen when the carer opens Bantay. Browser users can also get the existing browser web push (Browser app: notifications on).
> - What changed: the check-in entry now reads as a mood log, because I'm OK is folded into the mood log.

**`start-done-fix`**
> - What changed: new. Only appears when the background check finds a problem, here Papa's Xiaomi battery saver. The fix card sits on top with 3 plain steps. No full setup step.
> - Remind me later keeps a small card on Today until it is fixed, so the alarm problem is never silently dropped.
> - Passing the check is also what lets the Switch to the app banner appear.
> - Before: a whole step "Can this phone warn you?" for everyone. Now it only interrupts the person who needs it.

**`simple-hold`**
> - A 3-second hold ring fills while a finger stays down; letting go cancels and nothing is sent.
> - At 3 seconds (D-78): 1) the SOS is saved so the family sees it in the app; 2) the phone app dials Ate Joy (first family contact; Call 911 stays one tap away); 3) the text app opens with a pre-written message to the family (name, time, map link) and Mama taps Send. Calling and texting need no data, so it works offline.

**`lock-missed`**
> - CHANGED (D-78): was a lock-screen push to the carer. There is no server push in this build. The family sees the missed Losartan at the top of the alert list (bell with count) when they open Bantay; Today and Family show the same card.
> - Mama's own phone alarm (local, no data) still rings at 9:00, 9:10 and 9:20. After 3 tries the dose is marked missed and appears here.
> - Call Mama and Mark taken for her are one tap. Browser users (Kuya Ben) can still get the existing browser web push: Browser app: notifications on.

**`lock-sos`**
> - CHANGED (D-78): was a full-screen push on the carer's lock screen. Now a red SOS banner at the top of Today and Family the next time a carer opens Bantay.
> - The instant part is Mama's phone: it dials Ate Joy and opens a pre-written text to the family (name, time, map link). Those reach the family at once; this banner is the saved record.
> - Call Mama, Open map and Call 911 sit in the banner.

**`lock-storm`**
> - This is the phone's own government emergency alert (Android Wireless Emergency Alerts, NDRRMC cell broadcast). It sounds even on silent and needs no Bantay setup beyond the Phone warnings guide.
> - Bantay does not send it. When the family opens Bantay, Today shows the storm card with the Act early panel (see the storm Today screen), and the alert list shows the storm.

**`safety-sos-hold`**
> - Full red screen while the finger is held; the ring fills over 3 seconds.
> - Letting go cancels. A Use a button instead choice exists for people who cannot hold.
> - At the full ring (D-78): the SOS is saved for the family, the phone app dials Ate Joy, then the text app opens with a message ready.

**`safety-sos-sent`**
> - Sequence (D-78): SOS saved for the family, so they see it in the app; Calling Ate Joy...; Text to family ready, tap Send. Calling and texting use the phone's own apps, so this works with no internet.
> - Big buttons: Call 911, Call another person, Open text again. The elder taps Send in the text app; Bantay never sends it by itself.
> - Cancel marks the SOS as a false alarm in the family's app.

**`nudge-reminder`**
> - Mechanic: a two-way reminder. The reminder is a local notification on Mama's own phone, set on the phone itself (D-78 keeps local alarms and reminders). Tapping it opens the Bantay chat with Jack, where Mama types her reading; Jack confirms it and fills the morning ring.

- Copy gate before the release review: `grep -rniE "will be (told|notified)|lock screen|notification" src/features/{notify,sos,family,today,health/bpcheck}`; every hit is PWA-only copy or a local alarm (ML-12).

## Mockup screens each lane must match (`data-s`)

Every lane ships 390x844 light + dark shots at `docs/session-10/shots/<lane>/<data-s>-{light,dark}.png` (admin: 1440x900 + 390x844), compared by the auditor against the mockup section with the same `data-s` (D-66, D-67).

| Lane | Screens |
|---|---|
| S1 | `start-inbox`, `lock-missed` (alert list with count), `start-banner`, `today-full` (alert card variant, shared with S7) |
| S2 | `safety-sos-hold`, `safety-sos-sent`, `simple-hold` |
| S3 | `start-done-fix`, `today-alarmfix`, `lock-alarm` (notification content page) |
| S4 | `family-home`, `family-answer`, `family-phones`, `health-meds`, `health-med-stop`, `lock-sos` (red banner on Today and Family) |
| S5 | `safety-storm`, `safety-warnings`, `safety-hub`, `safety-phonewarn` |
| S6a | `start-get`, `start-iphone`, `start-invite`, `start-who`, `start-pin`, `start-done`, `start-pinpad`, `start-wrong`, `start-forgot`, `start-approve-wait`, `start-approve-req`, `start-dependent` |
| S6b | none (server only) |
| S6c | `start-finger`, `start-me`, `start-privacy`, `start-update`, `safety-medid` |
| S7 | `today-full`, `today-storm`, `today-offline`, `today-log`, `simple-today`, `simple-mood`, `simple-taken` |
| S7w | `today-weather`, `today-storm-track` |
| S8 | `admin-system`, `admin-home`, `admin-broadcast` |
| S9 | `health-bp`, `health-bpresult`, `health-vitals` |
| S10 | `ask-emergency`, `ask-offline` |
| S11 | `health-papers`, `health-record` |

51 unique `data-s` ids in all. Screens this phase does NOT change (D-67 disclosure): `today-week`, `health-labs`, `health-labs-empty`, `health-labdetail`, `health-meddetail`, `health-medsheet`, `health-refill`, `health-visits`, `health-move`, `health-movedetail`, `health-food`, `health-plate`, `health-med-pause`, `health-body`, `ask-answer`, `ask-scan-paper`, `safety-hotlines`, `safety-gobag`, `safety-ids`, `family-plan`, `family-add`, `family-member`, `family-report`, `family-memories`, `admin-calendar`, `admin-members`, `admin-dups`, `admin-files`.

## App hook points (shared files)

One-line hooks only, added by the file's owner; the other lane ships a component in its own file and names it here.

| File | Anchor (existing line/method) | Lane | One-line hook |
|---|---|---|---|
| `src/App.tsx` | the signed-in effect that starts sync | S1 | `startAlertsLive(userId)` start and its stop in the cleanup; the Privacy route for S6c's `src/features/privacy` screen |
| `src/features/shell/TabBar.tsx` | Family tab and bell | S1 | badge from `unseenCount()` only |
| `src/screens/Today.tsx` | body of the signed-in Today | S7 (owner) | mounts S3 `AlarmFixedToast`, S5 `StormCard`, S1 `AlertCardToday` (newest unseen row as a Today card), S4 `IncomingSos placement="today"` |
| `src/features/family/People.tsx` | top of the Family screen | S4 (owner) | mounts S4's own `IncomingSos placement="family"` |
| `src/screens/Today.tsx` / `SimpleToday.tsx` | quick log and Simple mode | S7 (owner) | `QuickLog.tsx` mounts S9 `BpCheckButton`; `SimpleToday.tsx` mounts S2 `SosHold` and `Call911` |
| `src/screens/Me.tsx` | settings rows | S6c (owner) | mounts S3 `AlarmHealthRow` and an S2 `requestCallPermission` row ("Hold for help can call for you") |
| `src/features/setup/*` | SOS-contacts card and background probe | S6a (owner) | calls S2 `requestCallPermission()` on the SOS-contacts card and S3 `probe()` in the background |
| `supabase/functions/dose-watch/index.ts` | end of each run | S1 (owner) | S8's `heartbeat(sb, 'dose-watch', ok, summary)` line (S8 merges first) |
| `supabase/functions/records-extract/index.ts` | end of each run | S8 | one `heartbeat(...)` line only |
| `src/main.tsx`, `src/admin-main.tsx` | app start | S8 | `installErrorLogging()` one line each |
| `src/features/health/reminders.ts` | - | S3 | none from other lanes |
| `supabase/functions/dose-watch/logic.ts` | watch rules | S4 (owner) | calls S1's `carerRow` port method (a typed port parameter, not an import) |

## Invariants every lane must keep

- An SOS is never refused or dropped by an alert failure: the three SOS triggers and `readings_alert` swallow their own errors (`raise warning`), and an RLS or trigger problem in `carer_alerts` never blocks a write to `sos_events`, `readings` or any health table (the outbox would dead-letter health data).
- `notify_family` is callable only by triggers, SECURITY DEFINER wrappers and the service role; the only alert an app caller may raise is `mood_unwell` through `raise_mood_alert`. `sos`, `sos_cancel`, `pin_approve`, `pin_changed` and `system` rows are never raised by an app caller. Grep every writer of `carer_alerts` before claiming a path closed (ML-11).
- One `carer_alerts` row per (kind, ref, carer): a duplicate `ref` is ignored, never an error. At most one `reading_high` per person per bucket per 6 h; one `phone_health` per phone per Manila day; one `mood_unwell` per person per Manila day; one `sos_cancel` per event.
- The elder's SOS flow NEVER prompts for `CALL_PHONE`. 911 is never auto-dialled (always the prefilled dial screen). Native call refusals fall back to `tel:`. The composer auto-opens only while the active SOS is under 10 minutes old and not cancelled; otherwise it is a "Text <contact>" button. One composer per contact.
- Unknown is null: `phone_health.alarms_ok` is `null` on shells below 2.3.0 and on web; GPS unknown stays `lat/lon null, gps false`; a missing `sent_at` or a future `at` counts as live, never late.
- No user reads another user's rows. Admin gets aggregates (counts by kind, unseen), never per-user alert rows. Notification payloads and `carer_alerts.template` carry template ids only, never health values, names or coordinates (B-7).
- Every per-user log or cache has a trim: `carer_alerts` 30 days and the local alerts store 30 days / 200 rows, `client_errors` and `job_runs` 30 days, `client_errors` 50 rows per user per day (ML-06).
- Every RPC an app caller can hit has a server-side limit (ML-08): `raise_mood_alert` one per person per Manila day, `log_client_error` 50 per user per day, `reset_start` 3 per hour per handle and 10 per IP (`reset_complete` has its own 120 per hour per IP bucket), `approve_pin_reset` first approval wins, caller must hold the request's `pin_approve` row, and 5 wrong 4-digit codes burn the request.
- Feature detection (C2): every native call is gated by `hasPlugin(...)` and `shellAtLeast(...)`; an old shell on the new web degrades to the PWA behaviour with an honest line ("Update the app to use this", D-50), never a crash.
- The alert copy rule above holds in every screen, template and doc a lane writes.
- Realtime blocks are guarded: a `do $$` that adds a table to `supabase_realtime` only when that publication exists and the table is not already in it (WSL has no such publication).
- A shared enum value (a `kind`, a template id) is updated in every whitelist at once (ML-28, list above).
- A secret that rotates per deploy forces a redeploy of every reader (ML-29): `dose_watch_cron_secret` (Vault, must exist before 0031 and 0035 are applied) and `ERASE_CRON_SECRET`.

## Edge functions: bundles and redeploy list (ML-22)

Deploy: `dose-watch`, `broadcast`, `alerts-ingest`, `records-extract`, `pin-login`, `family-names`, `erase` (new), and `ask` only if S10 changed `gate.ts`. `_shared/templates.ts` is bundled by `dose-watch` and `broadcast`; `_shared/http.ts` by every function that returns CORS; `_shared/heartbeat.ts` by `dose-watch`, `alerts-ingest`, `records-extract`; `_shared/pin.ts`, `handle.ts`, `login.ts` by `pin-login` (and `family-names` for `handle.ts`). A lane that changes a shared file lists every function that bundles it in `functions_to_deploy`. No `sos` and no `system-status` function exists in this build. Cron files Lloyd applies: `ops/sql/alerts_cron.sql`, `ops/sql/erasure_cron.sql`, and `ops/sql/dose_watch_cron.sql` only if its body changed.

## Release order and merge order

- **Merge queue (orchestrator, one lane at a time):** S8, S1, S3, S2, S4, S5, S9, S11, S6b, S6a, S6c, S7w, S7, S10. After each: `npx tsc --noEmit`, tier-0 smoke, duplicate scan, `npx vitest run src/features/notify supabase/functions` when a server lane lands, and the WSL rehearsal when SQL changed. S8 merges first because S1's dose-watch `index.ts` calls `heartbeat`. S1 merges before S2, S4, S5 and S9 (they call `notify_family` and `carerRow`). S3 merges before S2 reads `phone.check`, before S6a (imports `probe`) and before S6c (imports `AlarmHealthRow`). S2 merges before S6a and S6c (`requestCallPermission`). S7w merges before S7 (S7 imports `WeatherStrip`).
- **Then:** copy gate (above), full gates, 51-screen shot compare, Opus 5.5 release review of the whole branch, `git tag pre-s10-p2 origin/main`, PR "Session 10 safety wave (D-78)".
- **Deploy (Lloyd, in this order):** database (0030 to 0035 + cron files) -> edge functions -> web (merge) -> APK 2.3.0 if native (CallPlugin, OEM intents) -> family roll-out -> versionCode floor after roll-out. Old shells keep working on the new web through feature detection. During an APK test window `ALLOWED_ORIGIN` accepts a comma list including the Pages branch preview origin (S1 makes `_shared/http.ts` accept it) and the preview is removed after roll-out; the CI build `2.3.0-rc` uses `CAP_SERVER_URL=<preview>`.
- **Rollback:** Pages rollback to the previous deployment; redeploy functions from tag `pre-s10-p2`; the schema is additive, stop effects with `drop trigger if exists readings_alert on public.readings` and the three `sos_events_*` triggers, `select cron.unschedule('erasure')`, and `DOSE_WATCH_AFTER_MIN=120`; full downs strictly in reverse 0035 -> 0034 -> 0033 -> 0032 -> 0031 -> 0030, the 0030 down keeps `documents.printed_name`.
