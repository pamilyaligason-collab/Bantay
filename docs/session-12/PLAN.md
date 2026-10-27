# Session 12 build plan: Phase 3 production release (D-80..D-85), APK 2.4.0

**Status:** rev 2 (rev 1 by Fable + Opus plan review GO_WITH_FIXES applied below), for Lloyd's approval (D-85: no code before approval). Nothing here is built, applied, deployed or pushed. Section 5 becomes `docs/session-12/contracts.md`.

## Rev 2 - Opus review fixes (THIS SECTION WINS where it differs from sections 1-7)

**Blockers fixed**
- **R1 (privacy) pending carers live in a separate table.** New `public.share_offers (person_id, carer_id, can_write, added_by, added_at, pk (person_id, carer_id))`, RLS: carer or member or admin reads; no client writes. `share_set(p_on=true)` inserts an offer (not a `carers` row); `share_accept(true)` moves it into `carers` and deletes the offer; `share_accept(false)` deletes the offer. Every `carers` row therefore stays a live, accepted link, so `notify_family` (0030:60), `raise_mood_alert` (0030:80), `phone_health_carer` (0032:42), dose-watch `port.carers` (index.ts:94) and the client lists (useCanMark.ts:17, reportData.ts:21, docs/api.ts:209, CarerCards, viewAsData.ts:18) need no change. **Dropped from rev 1:** `carers.accepted_at`, the back-fill, and re-creating `is_carer_of`/`is_writer_of`. `my_viewers()` returns accepted rows from `carers` plus pending rows from `share_offers` (`pending boolean`). Rehearsal: a pending carer gets 0 `carer_alerts` from `notify_family('carers')`, `raise_mood_alert` -> 42501, `phone_health` 0 rows, readings 0 rows; after accept, n.
- **R2 decision 2.1.2 reworded.** Admins already read readings (0008:578), records via `records_editor` (0008:18) and nutrition (0024:75); not meds_taken (0003:86) or consults. Keep today's policies, which match D-82's literal "visible to the member and admins". Copy everywhere: "Only you, the family admins, and the people you share with can see your records." The admin grid says "admins can see records to help".
- **R3 0004 admin carers policies.** 0037 drops `carers_admin_insert/update/delete` (0004:45-51) with the 0001 ones (down restores both). `share_set(p_on=false)` refuses to remove a link where `is_person_creator(person_id, carer_id)` (a no-login dependent never loses its creator).

**Majors fixed**
- **R4** `family-names?invite=<token>` returns an array `[{first_name, initial, handle}]` (pinLogin.ts:57 requires an array). It uses a non-counting `join_claim_peek(hash)`; only the pin-login `join_claim` action counts attempts (5). `invite_tokens` is excluded from `export_my_data`.
- **R5 push token lifecycle (lane E).** Lane E owns one hook line in `src/features/auth/session.ts:38-44`: delete the own `push_tokens` row BEFORE `supabase.auth.signOut`. New SECURITY DEFINER `push_token_claim(p_token text, p_app_version text)`: deletes other users' rows for that token, upserts the caller's (shared phone). Broadcast FCM skips disabled users.
- **R6 Android realities (lane E).** (a) A force-stopped app gets no FCM: live check 6.4.1 tests "swiped from recents" and "after reboot", not force-stop; Me and docs/FIREBASE.md add an OEM auto-start line (Oppo, Vivo, Xiaomi). (b) `PushNotifications.createChannel({id:'carer_alerts', importance:5})` before `register()`, with a test. (c) `requestPermissions()` for POST_NOTIFICATIONS (manifest :66); Me shows "Alerts are off on this phone" with an Open settings button when denied. (d) Quiet hours: tone `normal` alerts sent between 22:00 and 06:00 Manila use a low-importance `carer_quiet` channel; SOS, Unwell and dose_missed always use `carer_alerts` (decision 2.1.13). (e) `release-apk.ps1` fails hard without `google-services.json`, like the workflow. (f) Test: FCM title/body equal `renderTemplate(id, {})`, never contain `<name>` or any display_name substring.
- **R7 whitelists (pre-commit).** Also edit `src/features/inbox/build.ts:26` KIND_LABEL and `notify/AlertCardToday.tsx:10` PRIORITY (rollcall next to sos); the System kind list is `desk/systemApi.ts:127-130`.
- **R8 tsc stays green at the base.** The pre-commit adds a stub `discover` entry to `App.tsx:33` SCREENS and `sharing` to the isTabView list (:67); F1 also owns `assistant/tools.ts:7` (Jack TABS list).
- **Packages pinned:** `@capacitor/push-notifications` 8.1.3, `@capacitor-community/text-to-speech` 8.0.2 (both peer `@capacitor/core >=8`); F4's fallback is removed.

**Minors fixed**
- **R9 ownership.** `scripts/golive-s12.ps1` is the orchestrator's only (B sends its line via contract). AcceptCard is mounted by J (People.tsx hook). Roll call writes by direct REST upsert (not the outbox), so no `tables.ts` spec.
- **R10 migrations.** Only 0040 re-creates `dose_watch_prune` (with the invite_tokens and push_tokens lines); 0038 does not touch it. `rollcall.user_id` forced to `auth.uid()` by trigger. SQL uses `extensions.gen_random_bytes` and qualified `sha256`. `audit_carers` (0021:63-64) already logs carers writes, so rehearsals count only `share%` actions.
- **R11** chain_rehearsal: the new `\ir 0007..0036` lines go after the existing 0006-state asserts; the pre-commit is budgeted 4 h.
- **R12 effort.** Merge queue 16 h. F2 medicine cards ship behind a flag (`learn.medcards`) until the clinician signs, so the review cannot block E or D.
- Line refs corrected: `approve_pin_reset` is 0034:70-88.

**New lane K CORE LOOP (critical, safety, batch 1, ~6 h build + 2 h audit).** Owns `src/features/today/actions.ts`, `today/useDueMeds.ts`, `today/NextUp.tsx`, `today/nextPick.ts` (moved from J), `src/screens/Today.tsx`, `today/SimpleToday.tsx`, `family/MemberPage.tsx`, `family/Report.tsx` (+ tests, e2e `s12-core.spec.ts`).
1. Unwell offline is replayed: kv `mood.unsent`, retry `raise_mood_alert` on reconnect and on Today mount (the server dedupes per day, 0030:82); toast "We will tell them when you are online". Test: offline then online = exactly 1 RPC.
2. Next up "Taken" with 2+ due medicines shows a per-medicine checklist (all ticked by default). Test: 2 due, untick 1 -> 1 row. Reminder Taken tests re-run (ML-13).
3. Tap a person's bubble -> member page with today's doses, last mood and last BP (accepted carers only; R1 makes that automatic). J adds the People.tsx tap hook.
4. SOS hold on Today in normal mode (mounts the existing `SosHold`); F1's Jack button must clear it (overlap e2e at 360 and 390 px).
5. Simple mode: keep a Medicines entry when nothing is due, add a BP tile, match `simple-today`.
**Never-cut list now:** E, D, K1, K4, A's privacy part (R1-R3), C's marked_by trigger, J-S3 padding.
**Batch 1 becomes 8 lanes (F1, A, B, C, D, E, J, K); merge order F1 -> E -> K -> A -> C -> B -> D -> J -> I -> G -> F2 -> F3 -> F4. Total ~111 h build + ~36 h audit + 16 h merge queue.**
**Base:** main `1b73781` (migrations 0001-0036 live, 9 functions live). Next migration number 0037.
**UI contract:** v7 mockup `D:/ObsidianVault/20-projects/family-bantay/mockups/bantay-complete-mockup.html` (ids are `data-s`, not `data-id`; `grep -o 'data-s="[^"]*"'`). Screens with no mockup section (Who can see my records, admin who-sees-whom grid, dose marked-by, 8 PM toggle, invite states, alert freshness) follow the Phase 3 before/after canvas named in 04-HANDOFF line 17 (artifact MqovChEM76M1wMo61aKfs9); every lane ships 390x844 light + dark shots (ML-37).
**Format:** copies `docs/session-10/PLAN.md` rev 4 and `contracts.md`; every lane follows `30-knowledge/patterns/multi-lane/CHECKLIST.md` ML-01..ML-37 and the PLAYBOOK (Sonnet builds every lane, Opus 5.5 audits every lane, fix rounds as new runs, merge one lane at a time with tier-0 smoke).

---

## 1. Reframe and risks

The family has not used the core loop (meds_taken 3 rows for 24 medicines) and carers on the APK cannot be reached when the app is closed (inventory M1). This release's two safety items are therefore **E (FCM push to the APK)** and **D (honest alert freshness and Safety copy)**; everything that makes records sharing real (A, B, C) is privacy and must ship with its RLS proven in rehearsal, not only in the UI (ML-07). The rest (F Discover, G motivation, I roll call, J polish) is reach and delight.

What could hurt people:
- **Elders:** a push with a name or a reading on a lock screen (B-7); a share accidentally made wide (A); a Jack button that covers the SOS/Taken buttons on a 5-inch phone (F); a cook-mode or game that drains data on a prepaid SIM (F must be offline-first, link-out only for video).
- **Carers:** a push that arrives for the wrong person after a phone swap (ML-07: tokens deleted on sign-out); a digest opt-out that silently also drops missed-dose alerts (C: the opt-out applies to kind `digest` only, tested); an "as of" time that lies (D).
- **Lloyd:** 6 new migrations in one apply; FCM depends on a one-time Firebase setup that only he can do; a per-member invite link replaces the one static family link (B), so the link in `%USERPROFILE%/bantay-invite-link.txt` dies at apply time.

Cut order if time runs short (never cut: **E, D, A's RLS part, C's marked_by trigger, J-S3 bottom padding**): first F4 (wave 2 listen/watch/live TV/sleep stories), then G's year-in-pixels and voice kudos (keep hearts + pillbox + recap counts), then F3 news/fun facts (keep the three games), then I's shared checklist (keep the roll call), then F2 recipes (keep the medicine wiki). B can ship as "admin generates per-member links" without the member-facing polish.

---

## 2. Owner decisions still needed (recommended answer in bold) and Lloyd's manual steps

### 2.1 Decisions (recorded as D-86+ before launch; defaults apply if unanswered)
1. **D-80 open detail, carer must accept?** **Yes, for both the member path and the admin path** (one rule, one RPC, one "waiting for X" state). Existing `carers` rows are back-filled as accepted (they were admin-made before this rule).
2. **D-82 says "visible to the member and admins only"; today admins do NOT read health rows** (0010 comment: "RLS only shows an admin their own and carer rows"; `readings_read` 0001:113 is `is_self or is_carer_of`). **Keep the narrower code behaviour** (ML-07): the admin gets the who-sees-whom grid and aggregates, not records. The copy says "only you, and the family members you share with" and the admin grid says "admins can set sharing, not read records". If Lloyd wants admins to read records, that is a policy change in 0037 and a new privacy line.
3. **D-81 join_claim meaning.** The code has no live join port (`JoinFlow.tsx:11-15`): members already exist (admin-created PIN logins, `admin-members`), and joining = claiming your name and setting the first PIN. **join_claim is therefore a `pin-login` action backed by a service-role SQL function**, because only the edge function can hash and set a PIN (`_shared/pin.ts`); a pure SQL RPC cannot. Tokens are **per member, single use, 7 days**, generated by an admin from /admin; the static `FAMILY_INVITE_TOKEN` secret and the `?invite=` mode of `family-names` (index.ts:41-45) are retired (ML-13 disclosure: the old link stops working at apply time; Lloyd re-sends per-member links).
4. **S9 "pamilya" in People.** The shared admin login has a people row; the client cannot tell admins apart (`app_roles_read` lets a member read only their own row). **Recommend no code: Lloyd archives that person row** (`select public.admin_set_archived('<pamilya person id>', true)` as another admin, or the one-line SQL in the go-live script); `family_profiles()` (0022) already skips archived rows and `people_admin_read` keeps it on the desk. If pamilya is the only admin login, `admin_set_archived` refuses `self`, so the go-live script's SQL line is the path.
5. **Discover sources (F).** All bundled text is public domain or Bantay-written; nothing is scraped. **NASA APOD is dropped** (needs a key and a daily fetch; not offline). **Watch playlists and live TV are a curated JSON file in the repo** (Lloyd supplies 12 official YouTube playlist ids + the official live channels: PTV, GMA News, ABS-CBN News, Net25, PAGASA, PHIVOLCS; the admin table from the session-10 plan is deferred). No new paid API: cost line = 0.
6. **Recap share (G, D-84).** The Sunday recap numbers (7-day BP average) stay on the member's phone and the carer's own view (RLS). "Share with family" posts **counts only** ("7 of 7 morning checks, 5 of 7 medicine days") to the family chat, never a reading value. Hearts and voice kudos come from anyone in the family (D-85).
7. **Roll call (I) is safety, not health.** Storm check-ins are a separate `rollcall` table visible to the whole family (`is_family_member()`), with values `ok | need_help` only; the mood log stays private. The "Do now" checklist becomes 4 `family_tasks` rows per storm (already family-visible, 0012), created once per storm ref.
8. **Push text (E, B-7).** FCM notifications carry only the template title/body ("A medicine was missed by someone you look after"), `data.t`, and no name, reading or location; the in-app row shows the name.
9. **Digest opt-out scope (C).** The 8 PM toggle hides only kind `digest`; missed-dose, Unwell, SOS and review alerts are never affected (tested with hand-computed recipients).
10. **Vaccines in "Still taking it?" (J-S8/C).** Rows whose medication is a vaccine (imported `medications` rows named like a vaccine; lane C greps how 0008 `vaccinations` and the import create them) are excluded from `runDoseWatch` and `medsToReview` by a `form`/name rule with a test; if the import wrote vaccines into `medications`, the go-live script also marks them `med_status = 'stopped'` (Lloyd confirms the list).
11. **APK 2.4.0 `min_shell`** stays 2000000 (no breaking native change; old shells degrade: no push, no TTS).
12. **Memory match / word search / trivia** are built in-house with Bantay word lists (English + Tagalog); copy says "fun mental exercise", never a memory or dementia claim.

### 2.2 Lloyd's manual steps, in order
Before launch (one-time, ~40 min):
1. Firebase: console.firebase.google.com > Add project "Family Bantay" (Google Analytics off) > Add app > Android > package `ph.bantay.family`, nickname "Bantay APK" > download `google-services.json`.
2. Put the file at `android/app/google-services.json` on the PC (the pre-commit adds it to `.gitignore`; `android/app/build.gradle` already applies the google-services plugin when the file exists, and `android/build.gradle` already has `classpath 'com.google.gms:google-services:4.4.4'`).
3. GitHub repo > Settings > Secrets and variables > Actions > New secret `GOOGLE_SERVICES_JSON_BASE64` = the file as base64 (`[Convert]::ToBase64String([IO.File]::ReadAllBytes('android\app\google-services.json'))`).
4. Firebase > Project settings > Service accounts > Generate new private key (JSON) > `npx -y supabase@2.122.0 secrets set FIREBASE_SERVICE_ACCOUNT_B64=<base64 of the JSON>`. Keep the JSON offline; never in the repo.
5. Google Cloud console (same project) > APIs > confirm "Firebase Cloud Messaging API (V1)" is enabled (default on new projects).
6. Approve this plan; answer 2.1 (or accept the bold defaults); send the 12 playlist ids and the live channel list; name the clinician for the medicine-card review.
At release (after the Opus whole-branch review; ~30 min + device tests):
7. Run `scripts/golive-s12.ps1` (same pattern as `golive-s10-p2.ps1`): checks secrets (`FIREBASE_SERVICE_ACCOUNT_B64`, `DOSE_WATCH_CRON_SECRET`) > apply 0037..0042 in order, each recorded > verify > deploy `dose-watch`, `broadcast`, `pin-login`, `family-names` > unset `FAMILY_INVITE_TOKEN` > archive pamilya (2.1.4) > post-checks.
8. Merge the PR (web live on bantay.pages.dev within ~60 s).
9. GitHub > Actions > Release Android app > version `2.4.0`, notes "Family alerts now reach your phone; new Discover tab." (the workflow now writes `google-services.json` from the secret before `npx cap sync`).
10. Install 2.4.0 on two phones (his and one carer's); run the live checks in section 6.4; generate per-member invite links from /admin for anyone still without a PIN.

---

## 3. Data model (migrations 0037-0042; each `+ .down.sql + supabase/tests/<name>_rehearsal.sql`; idempotent; grants restated, ML-21; written only, Lloyd applies)

### 0037_sharing.sql (lane A; needs 0001, 0002, 0021, 0030, 0034)
- `public.carers` add `accepted_at timestamptz`, `added_by uuid`, `added_at timestamptz not null default now()`; back-fill `accepted_at = coalesce(accepted_at, now())`, `added_by = null` for existing rows (one-time, in the up only).
- `is_carer_of(uuid)` and `is_writer_of(uuid)` re-created with `and accepted_at is not null` (grants restated: revoke public, anon; grant authenticated). Every policy that calls them (readings, consults, meds_taken, activity, 0008 records tables, 0024/0026 nutrition, 0032 phone_health, people_read 0022) therefore honours the private default with no further edits; the rehearsal asserts a pending carer reads 0 rows and an accepted carer reads them.
- `revoke insert, update, delete on public.carers from authenticated`; drop policies `carers_insert`, `carers_update`, `carers_delete` (0001:105-111); keep/replace `carers_read` = `carer_id = auth.uid() or is_self(person_id) or is_admin()`. Writers of `carers` after this: `link_creator()` trigger (0001:65-70, keeps `accepted_at = now()` for the creator of a no-login person), `share_set`, `share_accept`, service role. ML-11 grep list for lane A: `src/features/admin/api.ts:60-74` (REST upsert/delete -> RPC), `reportData.ts:21` (select stays), `admin-members` function (service role).
- `public.share_set(p_person uuid, p_carer uuid, p_can_write boolean, p_on boolean) returns text` SECURITY DEFINER, `search_path = ''`: caller must be `is_self(p_person)` or `is_admin()` (a writer carer of a no-login dependent may add viewers, not writers; D-42). `p_can_write = true` only by an admin and only for `people.auth_user_id is null`. `p_on = true` upserts `(carer_id, person_id, can_write, added_by = auth.uid(), accepted_at = null)` (an existing accepted row keeps `accepted_at`; a can_write change on an accepted row keeps it accepted). `p_on = false` deletes. Refuses `p_carer = owner`, a disabled or non-member carer, and a self-add. Rate limit `pin_try(md5('share:' || auth.uid()), 30, interval '1 hour') > 30 -> errcode 53400` (ML-08). Writes `audit_log (actor, tbl 'carers', person_id, action 'share_add'|'share_remove', fields array['can_write'])` and `notify_family(p_person, 'share', 'share_offer', p_person||':'||p_carer||':'||floor(epoch/3600), 'self')`-style rows: offer to the carer (direct insert into carer_alerts with `carer_user_id = p_carer`, kind `share`), and `share_off` to the carer on removal; returns `'pending' | 'removed' | 'unchanged'`. Grants: revoke public, anon, service_role; grant authenticated.
- `public.share_accept(p_person uuid, p_accept boolean) returns boolean` SECURITY DEFINER: caller = `carer_id`; `p_accept` sets `accepted_at = now()` (idempotent) and inserts `share_on` for the member (kind `share`, scope self); `false` deletes the row and audit `share_remove`. Grants as above.
- `public.my_viewers() returns table (carer_user_id uuid, display_name text, can_write boolean, accepted_at timestamptz, added_by_admin boolean)` SECURITY DEFINER: rows of `carers` where `is_self(person_id)`; names from `people.display_name` joined on `auth_user_id` (D-82: a security-definer RPC returns only my viewers' names). Grant authenticated.
- `public.admin_share_grid() returns table (person_id uuid, person_name text, carer_user_id uuid, carer_name text, can_write boolean, accepted_at timestamptz)`: `is_admin()` else `42501`; all active people x their carers rows. Grant authenticated.
- `audit_log` CHECK restated (0034 list + `'share_add','share_remove','share_accept','invite','join'`) (ML-28: 0038 relies on this list, so 0037 adds all five).
- `carer_alerts.kind` CHECK restated with the full list + `'share','rollcall','kudos'` (ML-28 whitelists: this CHECK, `NOTIFY_KINDS` + `ALERT_KIND` in both `templates.ts` copies, the System health kind list in `desk/System.tsx`; all four changed in the pre-commit, see 4.0).
- Retention: `carers` is a link table (no cap); `audit_log` is append-only by design (0021) and unchanged.

### 0038_join_claim.sql (lane B; needs 0002, 0009 pattern, 0021, 0037)
- `public.invite_tokens (id uuid pk default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, token_hash text not null unique, created_by uuid not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '7 days', used_at timestamptz, attempts int not null default 0)`; RLS on; no grant to anon/authenticated; service_role all. Index `(user_id, created_at desc)`.
- `public.admin_create_invite(p_user uuid) returns text` SECURITY DEFINER: `is_admin()`; the target must be an `app_roles` PIN member (`handle is not null`, not disabled) with no PIN set yet (`auth.users.encrypted_password is null` or the marker `_shared/login.ts` uses; lane B reads it); burns any open token of that user (`used_at = now()`); generates 32 random bytes (`gen_random_bytes`, base64url), stores `sha256` hex, returns the plain token once; audit `invite`; rate limit `pin_try(md5('invite:'||auth.uid()), 20, '1 hour')`. Max 1 open token per user (invariant asserted in rehearsal, ML-09). Grant authenticated.
- `public.join_claim_check(p_hash text) returns table (user_id uuid, handle text, first_name text)` service_role only: the open, unexpired token with that hash; increments `attempts`; returns 0 rows after 5 attempts or when burned/expired.
- `public.join_claim_use(p_hash text) returns boolean` service_role only: sets `used_at = now()` where open; true if one row changed (single use enforced in SQL, not in the function).
- Retention (ML-06): `invite_tokens` rows older than 30 days deleted inside `dose_watch_prune()` (re-created with the 0030 body + this line; grants restated).
- Edge `pin-login` action `join_claim {token, pin}` (replaces the `handle` input: the token names the member): per-IP bucket 10/hour (existing 0009 pattern), hash the token, `join_claim_check`, set the PIN with `_shared/pin.ts` through the Auth admin API, `join_claim_use`, audit `join`, reply `{ok:true}`; every failure replies the same `{ok:false, why:'bad_invite'}` except `taken` (member already has a PIN). Edge `family-names` mode `?invite=<token>` returns only that one `{handle, first_name, initial}` (no family list to a token holder) and 404s the same for bad/expired/used.

### 0039_marked_by_digest.sql (lane C; needs 0003, 0014, 0030)
- `meds_taken` add `marked_by uuid references auth.users(id) on delete set null`; trigger `meds_taken_marked_by` BEFORE INSERT: `new.marked_by := coalesce(auth.uid(), new.marked_by)` (service role keeps what it sends; a client value is always overwritten). Column grants restated: `revoke update on meds_taken from authenticated; grant update (name, taken_at, medication_id, slot, skipped)` (0014:30-31 list; `marked_by` never updatable). Rehearsal: a client insert with a forged `marked_by` ends with `auth.uid()`.
- `public.carer_prefs (user_id uuid pk references auth.users(id) on delete cascade, digest_on boolean not null default true, updated_at timestamptz not null default now())`; RLS: own row select/insert/update; `grant select, insert, update (digest_on, updated_at)`; service_role select. Export/erasure: picked up by `erasure_targets()` automatically (user_id column, 0034); rehearsal pins the new table in the expected list.
- No new RPC; dose-watch reads `carer_prefs` with the service role (contract `port.digestOff`).

### 0040_push_tokens.sql (lane E; needs 0002, 0003)
- `public.push_tokens (token text primary key, user_id uuid not null references auth.users(id) on delete cascade, platform text not null check (platform in ('android')), app_version text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_ok_at timestamptz, failed int not null default 0)`; index `(user_id)`. RLS: own rows select/insert/update/delete (`user_id = auth.uid()` using + with check); `grant select, insert, update (app_version, updated_at), delete to authenticated`; service_role all.
- Trigger `push_tokens_cap` AFTER INSERT: keep the newest 3 tokens per user (ML-06). `dose_watch_prune()` re-created once more (0039 is before it? no: 0038 re-creates it; 0040 re-creates it again with the 0038 body + `delete from push_tokens where updated_at < now() - interval '60 days' or failed >= 5`; grants restated). The contract fixes the final body so the chain rehearsal ends with one function.
- Same for the web: `push_subscriptions` untouched.

### 0041_rollcall.sql (lane I; needs 0001, 0023, 0030)
- `public.rollcall (id uuid pk default gen_random_uuid(), person_id uuid not null references people(id) on delete cascade, user_id uuid not null default auth.uid(), storm_ref text not null, status text not null check (status in ('ok','need_help')), at timestamptz not null default now())`; unique `(person_id, storm_ref)` with upsert; RLS: insert/update `is_self(person_id) or is_writer_of(person_id)`; select `is_family_member()`; grants `select, insert, update (status, at)`. Realtime guarded block. Retention: rows older than 30 days deleted in `sos_events_prune()` (re-created with 0031 body + this line; grants restated).
- Trigger `rollcall_alert` AFTER INSERT OR UPDATE: when `status = 'need_help'`, `notify_family(person, 'rollcall', 'rollcall_help', id::text, 'family')`, wrapped `begin...exception when others then raise warning` so a check-in is never blocked; then the guarded pg_net flush (same block as 0031).
- `storm_ref` = `safety_alerts.id` of the live PAGASA signal row (the one `liveSignals()` ranks first, `stormMode.ts`).

### 0042_kudos.sql (lane G; needs 0027, 0030)
- `family_messages` kind CHECK restated: `('text','voice','photo','file','kudos','recap')`; add `about_person uuid references people(id) on delete cascade` (null for ordinary messages); the 0027 body/attachment CHECK restated to allow `kudos` with `body = 'heart'` and no attachment, or `kudos` with a voice `attachment_path` (<= 15 s, enforced client-side; server caps size by the existing bucket rule) and `recap` with `body` (counts text) and no attachment. Trigger `family_messages_kudos_alert` AFTER INSERT when `kind = 'kudos'`: `notify_family(about_person, 'kudos', 'kudos', id::text, 'self')` (the member gets "Someone sent you a heart"), guarded like 0041.
- No nudge_settings table: "pause kudos" and reminder times are kv on the phone (`nudge.kudosOff`, `nudge.bpTimes`), local only, per the D-78 local-reminder rule.

### Enum whitelists touched (ML-28)
`carer_alerts.kind` (+share, rollcall, kudos): 0037 CHECK, `src/features/notify/templates.ts` `NOTIFY_KINDS`/`ALERT_KIND`, `supabase/functions/_shared/templates.ts` (byte-identical copy, `templates.test.ts` keeps them equal), `desk/System.tsx` kind list. `audit_log.action` (+5): 0037. `family_messages.kind` (+kudos, recap): 0042 and `src/features/family/messagesApi.ts` kind union (lane G). Templates added (pre-commit): `share_offer`, `share_on`, `share_off`, `rollcall_help`, `rollcall_ask`, `kudos`.

Apply order: 0037 -> 0038 -> 0039 -> 0040 -> 0041 -> 0042; downs strictly 0042 -> 0037. WSL chain rehearsal `supabase/tests/chain_rehearsal.sql` extended to `\ir` 0001..0042 (it stops at 0006 today, line 29-34; the orchestrator extends it in the pre-commit and every lane's rehearsal file is run after it).

---

## 4. Lanes (12 code lanes + orchestrator pre-commit; Sonnet 5.5 builds every lane, Opus 5.5 audits every lane; `critical` marked)

### 4.0 Orchestrator pre-commit (= base sha named in every brief; lanes never edit these)
- `package.json` + lockfile: `@capacitor/push-notifications` pinned to the 8.x line matching `@capacitor/core 8.5.3`; `@capacitor-community/text-to-speech` pinned to its Capacitor-8 release (lane F4 verifies `npx cap sync` at build; if no Capacitor-8 release exists, F4 falls back to Web Speech only and says so in `needs`).
- `src/features/notify/templates.ts` and `supabase/functions/_shared/templates.ts`: the three kinds and six templates above; `desk/System.tsx` kind list.
- `src/features/shell/routes.ts`: `Tab` gains `'discover'`, `TABS` order `today, health, discover, family, safety`, `VIEWS` gains `'sharing'`; `parseHash` maps `#discover/<sub>` to tab discover; `hasOwnHeader` adds `sharing`.
- `.gitignore`: `android/app/google-services.json`.
- `supabase/tests/chain_rehearsal.sql` extended to 0036 (so lanes append their own file).
- `docs/session-12/contracts.md` (section 5).

### 4.1 Lane table (files are exact; one owner per file, ML-03; test files named)

| Lane | Goal | Owns | Exposes / consumes (contract names) | Tests (hand-computed, ML-17) | Shots vs `data-s` | Batch |
|---|---|---|---|---|---|---|
| **A SHARE** (critical, privacy) | D-80/82/84: server share list, "Who can see my records", admin grid, audit rows, kv `share.*` gone | `supabase/migrations/0037_sharing.sql` (+down, `sharing_rehearsal.sql`), `src/features/sharing/{SharingScreen,ShareSheet,AcceptCard,api}.tsx/.ts` (+`api.test.ts`), `src/screens/Me.tsx` (+`Me.test.tsx`, `Me.carers.test.tsx`), `src/features/privacy/PrivacyScreen.tsx` (+test), `public/privacypolicy.html` (sharing paragraph), `src/features/admin/api.ts` (carers calls -> RPC), `src/features/admin/desk/Sharing.tsx`, `desk/types.ts` (`'sharing'` page), `desk/WebShell.tsx` (nav line), `e2e/s12-sharing.auth.spec.ts`, `docs/SHARING.md` | exposes `share_set`, `share_accept`, `my_viewers`, `admin_share_grid`, `AcceptCard` (mounted by F1 in Family > People via contract), kv removed: `share.readings|medicines|records|mood|location`; consumes `DigestToggle` (C), `notify_family` kind `share` | rehearsal: pending carer reads 0 readings/meds_taken/consults; accepted reads n; member cannot grant can_write; admin can for no-login only; 31st `share_set` in an hour -> 53400; audit rows = 2 for add+accept; vitest `api.test.ts` maps RPC errors to 3 copy strings; e2e: toggle a viewer, see "waiting for Joy" | canvas boards "sharing", "carer add", "admin who-sees-whom"; `start-me` (Me without switches); `family-home` (AcceptCard) | 1 |
| **B JOIN** (critical, auth) | D-81 per-member single-use invite, join_claim in pin-login | `0038_join_claim.sql` (+down, rehearsal), `supabase/functions/pin-login/index.ts` + `join.ts` + `join.test.ts`, `supabase/functions/family-names/index.ts` (+test), `src/features/setup/JoinFlow.tsx` (+test), `src/features/auth/pinLogin.ts` (+test; `joinPort`), `src/features/admin/desk/Members.tsx` (Invite link button + copy sheet), `scripts/golive-s12.ps1` (secret unset line only; the orchestrator owns the file, B contributes the line via contract), `docs/AUTH.md` | exposes `admin_create_invite`, pin-login action `join_claim`, `family-names?invite=` single-name reply, link form `https://bantay.pages.dev/#join/<token>` (unchanged, `pinLogin.ts:40`) | rehearsal: second use -> false; expiry -> 0 rows; 6th check -> 0 rows; one open token per user; deno test: same reply for unknown/expired/used token, `taken` for a member with a PIN; per-IP 11th call -> 429 | `start-invite`, `start-who` (one name), `start-pin`, `admin-members` (invite button) | 1 |
| **C MARKED-BY + DIGEST** (critical, safety copy) | D-83 | `0039_marked_by_digest.sql` (+down, rehearsal), `src/features/log/store.ts` (`MedTaken.markedBy`), `src/features/sync/tables.ts` (pull mapping only; push fields unchanged at :33), `src/features/health/Medicines.tsx` (+`m7a-screens.test.tsx`), `src/features/health/medName.ts` NO (J owns), `src/features/notify/DigestToggle.tsx` (+test), `supabase/functions/dose-watch/logic.ts` (+`dose-watch.test.ts`: digest filter, vaccine exclusion), `docs/ALERTS-INAPP.md` | exposes `DigestToggle` (A mounts in Me), `Port.digestOff(userIds): Promise<Set<string>>` (E implements in index.ts), `isVaccine(med)`; consumes `shortMedName` (J) | rehearsal: forged marked_by overwritten; update of marked_by refused (42501); logic test: carers {J,B}, B opted out -> digest rows 1 (J only) but dose_missed rows 2; vaccine row -> 0 review_open; UI test: "Taken 8:12 AM by Joy" when marked_by != owner, "Taken 8:12 AM" when self | canvas boards "dose marked-by", "8 PM toggle"; `health-meds` | 1 |
| **D FRESH + SAFETY COPY** (critical, safety) | alert freshness, honest sources, S4/S10/S11/S12 | `src/features/safety/alerts.ts` (+test: `freshness()`), `safety/AlertCard.tsx`, `safety/SafetyHub.tsx` (+`hub.test.ts`), `safety/hazardCards.ts`, `src/screens/Safety.tsx`, `src/features/today/AlertBand.tsx` (+test), `src/features/admin/desk/System.tsx` + `systemApi.ts` (feed status), `docs/ALERTS.md`, `e2e/s5-alerts.spec.ts` | exposes `freshness(checkedAt, now): {ageMin, tone:'ok'|'amber'|'red'}` (> 60 min amber; null = "never"), `placeLabel(place)` shared with Today via `today/placeName.ts` (J consumes); copy constant `SOURCES_LINE` = "Quakes: PHIVOLCS and USGS. Storms: GDACS and PAGASA bulletins. Weather and air: Open-Meteo. Checked every 10 minutes." | 59 min -> ok, 61 -> amber, null -> "never"; System: `job_runs` alerts-ingest latest > 60 min or ok=false -> red; AlertBand "Affects us?" = `coversHere(place)` and distance rule (hand-computed 89 km quake -> "Far from you; no action") | `safety-hub`, `safety-warnings`, `today-full` (band), canvas board "alert freshness", `admin-system` | 1 |
| **E PUSH** (critical, safety) | D-85(1) FCM to the APK for carer_alerts + broadcast; web push kept | `0040_push_tokens.sql` (+down, rehearsal), `supabase/functions/_shared/fcm.ts` (+`fcm.test.ts`: JWT assertion built with WebCrypto RS256 from the service account, token cached per run, HTTP v1 send, 404/410 UNREGISTERED -> delete), `supabase/functions/dose-watch/index.ts` (+`index.test.ts`), `supabase/functions/broadcast/index.ts` (+test), `src/features/notify/fcm.ts` (+test), `src/features/sync/tables.ts`? NO (C owns; E uses direct REST through `api` with RLS, not the outbox), `android/app/src/main/AndroidManifest.xml` (POST_NOTIFICATIONS already present per S3; E adds nothing unless `cap sync` requires), `.github/workflows/release-apk.yml` (write google-services.json from the secret before `cap sync`; fail if missing), `scripts/release-apk.ps1`, `scripts/check-manifest.mjs`, `docs/NATIVE.md`, `docs/FIREBASE.md` | exposes `watchPushForSession(): () => void` (F1 hooks it in App.tsx beside `watchAlertsForSession`, App.tsx:79), channel id `carer_alerts`, `flushPush(now)` (renamed from `flushWebPush`, sends web push AND FCM, sets `pushed_at` once per row), `port.digestOff` implementation (C's contract), secret `FIREBASE_SERVICE_ACCOUNT_B64`; broadcast sends FCM to every `push_tokens` row | deno: payload for kind dose_missed = `{notification:{title:'A medicine was missed',body:'...someone you look after'},data:{t:'dose_watch'},android:{priority:'high',notification:{channel_id:'carer_alerts',tag:'dose_watch'}}}` and never contains a name; 3 tokens cap trigger (4th insert leaves 3 newest); UNREGISTERED deletes the row; budget: no send after 100 s; client: sign-out deletes own token (ML-07); foreground receive calls `pollAlerts()` | `lock-missed`, `lock-sos` (now real lock-screen shots from the test phone, plus the in-app list), `admin-broadcast` | 1 |
| **F1 SHELL + DISCOVER HOME + PIN APPROVE** | D-85(2) 5 tabs + floating Jack; D-85(4) mount ApprovePinSheet | `src/features/shell/TabBar.tsx` (+test), `shell/shell.css`, `shell/AskSheet.tsx`, `shell/JackFab.tsx` (+test: hidden in Simple mode and on `hasOwnHeader` routes; 56 px; never over the SOS hold or the Taken pill: bottom offset = `--tabbar-clear`), `src/App.tsx` (hooks: `watchPushForSession`, `<ApprovePinSheet/>` mounted once for every signed-in member (ApprovePinSheet.tsx:12-14 asks for a Today hook; mounting in App shows it on any tab), `<SharingScreen/>` for view `sharing`, Discover screen), `src/screens/Discover.tsx` (sub-tab bar Learn, Listen, Play, Watch, News; "Today's picks" chosen on the phone from saved items), `src/features/discover/index.ts` (`DiscoverSub`, `registerSub`), `src/features/assistant/Assistant.tsx` (back arrow), `e2e/s12-shell.spec.ts`, `e2e/tabbar-overlap.spec.ts`, `e2e/no-sideways-scroll.spec.ts` (adds the 5-tab bar) | exposes `DiscoverSub = 'learn'|'listen'|'play'|'watch'|'news'`, `registerSub(sub, Screen)`; consumes `AcceptCard` (A), `watchPushForSession` (E), `SharingScreen` (A), ApprovePinSheet (exists; `approve_pin_reset` 0034:73-91 and the `pin_approve` rows from pin-login/index.ts:68-69 are already live) | TabBar test: pill slot math for 5 tabs; e2e: no horizontal overflow at 360 and 390 px; Jack button absent in Simple mode; ApprovePinSheet appears for a seeded `pin_approve` row and `Not Mama` marks it seen | `learn-home` (shell only), `today-full` (5 tabs + Jack), `start-approve-req`, `simple-today` (no Jack) | 1 (merge first) |
| **J POLISH** | S1, S2, S3, S5, S6, S7, S8 grouping, S9 UI | `src/features/health/medName.ts` (+test: `shortMedName`), `src/features/today/NextUp.tsx` + `nextPick.ts` (+tests), `today/WeatherCard.tsx` (+test; S2 contrast), `today/PlanToday.tsx` (S5: no card when empty), `today/placeName.ts` (+test; consumes `placeLabel` D), `src/styles/app.css` (S3: every scrolling root uses `.scroll` or `--tabbar-clear`; audit each tab root), `src/screens/Health.tsx` (+`health-screen.test.tsx`; S6 one empty state), `health/LabsList.tsx` + `labsLogic.ts` (+tests; S7: 1 decimal, grouped by panel, collapsed), `src/features/family/CarerCards.tsx` (+test; S8 one card per person listing its items), `family/People.tsx` (S9: avatars show last check-in words, not sleep icons) | exposes `shortMedName(name): string` (C's dose rows use it): "Sea Water ( HUMER 050 HYPERTONIC NASAL SPRAY (CHILD) )" -> "Sea water nasal spray" (r3: first words kept, a bracket is never the name); rule: title-case, drop strength/pack/parenthetical, max 28 chars, ML-35-style: never drop the first word | hand-computed: 6 `dose_missed` rows for one person -> 1 card with 6 lines (ML-34: badge count = rows, card count = people); `226.74` -> `226.7`; shortMedName on 8 real imported names | `today-full`, `health-home`, `health-labs`, `family-home`, `family-member` | 1 |
| **F2 LEARN** (critical: clinician gate) | wave 1 medicine wiki + recipes + cook mode | `src/data/learn/meds/*.json` (~15 cards from DailyMed/openFDA labels + NIH ODS, public domain; "Talk to your doctor first" on every card; curated do-not-mix list, never "no interactions"), `src/data/learn/recipes.json` (20 Bantay-written low-sodium Filipino recipes, mg salt per serving), `src/features/discover/learn/{Screen,Meds,MedCard,SuppCard,Recipes,Recipe,Cook}.tsx` (+`learn.test.tsx`), `src/features/discover/learn/pick.ts` (+test: "Mama's medicines" = cards whose RxNorm name matches a live `medications` row via `normaliseDrug`), `scripts/knowledge/learn-licence-check.mjs` (vitest fails on ASHP/A.D.A.M. markers), credits entry in `src/features/docs/*` (one line) | exposes `registerSub('learn', Screen)`, `articleText(id)` for F4's SpeakButton; consumes nothing server-side (all offline) | licence grep = 0 hits; bundle growth <= 3 MB (vitest on `dist` size); `pick()` for 3 meds -> the 2 cards that exist and 1 "no card yet"; cook mode step timer 1-tap, screen-wake on | `learn-meds`, `learn-medcard`, `learn-suppcard`, `learn-recipes`, `learn-recipe`, `learn-cook` | 2 |
| **F3 PLAY + NEWS + FACTS** | wave 1 games, news, fun facts | `src/features/discover/play/{Screen,Memory,WordSearch,Trivia,Facts,score}.tsx/.ts` (+`play.test.ts`), `src/data/play/{words-en,words-fil,trivia,ph-facts}.json`, `src/features/discover/news/Screen.tsx` (+test; reads `news_items` by zone, link-out, cached 7 days, 2 MB cap), `src/features/discover/facts/onThisDay.ts` (+test; Wikipedia "On this day" REST, CC BY-SA credit + link, cached per day, bundled PH facts offline) | exposes `registerSub('play'|'news')`, `playedToday()` count in kv `play.day`; weekly family line counts local games only (no server) | memory match: 6 pairs solved in n flips -> "Nice, Mama" never a score; word search grid 8x8 places 5 words without overlap (hand-made fixture); trivia marks the right answer and never "wrong", "try another"; facts cache: second call same day = 0 fetches | `fun-play`, `fun-memory`, `fun-wordsearch`, `fun-trivia`, `fun-facts`, `fun-news` | 2 |
| **G NUDGE** (critical: reminder parsing) | D-85(3) recap, kudos, pillbox, year in pixels, reply with a reading | `0042_kudos.sql` (+down, rehearsal), `src/features/nudge/{Recap,Pillbox,Pixels,Kudos,replyParse,recapLogic}.tsx/.ts` (+`replyParse.test.ts`, `recapLogic.test.ts`, `pixels.test.ts`), `src/features/family/messagesApi.ts` (+test; kinds kudos/recap, `aboutPerson`), `src/features/health/reminders.ts` + `reminderActions.ts` (+tests; new action type `BP_REPLY` with a text input on the Sunday/morning BP reminder; ML-13: dose actions unchanged, tests re-run), `src/features/health/NudgeCard.tsx` (entry tile on Health; today an orphan), `e2e/s12-nudge.auth.spec.ts` | exposes `parseReading('128/82')` -> `{sys:128,dia:82}`; `'bp 128'` -> `{ask:'over what?'}`; `'128 / 82 pulse 70'` -> with pulse; garbage -> null (never saved); `recap(readings, takes, week)` counts; consumes `verdict.ts` bands for pixel shapes (circle, diamond, square, triangle up/down), `logDose` (pillbox), `logReading` | hand-computed recap for a 7-day fixture: avg 133/83, checks 7/7, med days 5/7; pixel for 134/84 -> "Above target" + square; kudos row inserts a `kudos` alert for the member only; rehearsal: kudos with a reading in body is refused? (no: body is free text; client never puts numbers; recap body = counts, tested) | `nudge-recap`, `nudge-pillbox`, `nudge-pixels`, `nudge-reminder`, `nudge-home` | 2 |
| **I ROLL CALL** | D-85(5) storm roll call + shared do-now | `0041_rollcall.sql` (+down, rehearsal), `src/features/safety/StormCard.tsx` (+`stormcard.test.tsx`), `safety/rollcall.ts` (+test), `safety/stormMode.ts` (`stormRef()`), `src/features/family/StormRollCall.tsx` (list on Family > People during a storm; F1 mounts via contract line in People? No: People.tsx is J's; J adds the one hook line `<StormRollCall/>` per contract), `src/features/family/planApi.ts`? NO (owned by nobody this release; I inserts tasks through the existing `enqueue('family_tasks', ...)` outbox spec with `client_id = uuidv5(stormRef+item)`) | exposes `rollcall` table, `StormRollCall`, `stormRef(alert)`; consumes `family_tasks` outbox spec, `notify_family` kind `rollcall` | rehearsal: member upserts own row twice -> 1 row; stranger cannot write; family reads all; `need_help` -> n family alert rows; client: 4 tasks per storm created once (second mount -> 0 new) | `safety-storm`, `today-storm`, `family-home` (storm state) | 2 |
| **F4 LISTEN + WATCH** (wave 2; cuttable) | article audio (TTS), podcasts, watch playlists, live TV, sleep stories | `src/features/discover/listen/{Screen,tts,SpeakButton,Sleep}.tsx/.ts` (+`tts.test.ts`), `src/data/listen/{podcasts,sleep-stories}.json` (podcasts = official feeds link-out: DOH, WHO, PH Red Cross; stories Bantay-written, 5), `src/features/discover/watch/{Screen,Playlists,LiveTv}.tsx`, `src/data/watch/{playlists,livetv}.json` (Lloyd's 12 ids + official live channels; deep links, never embed), `android/app/src/main/java/.../MainActivity.java` (TTS plugin registration if the community plugin needs it), `docs/SOURCES.md` | exposes `speak(text, lang)`, `stop()`, `available(lang)`, `SpeakButton`; consumes `articleText(id)` (F2), `registerSub('listen'|'watch')`; APK-only TTS behind `hasPlugin('TextToSpeech')`, Web Speech on the PWA, honest line "Update the app to hear this" on old shells | tts: `available('fil')` false -> button says "English voice only"; sleep timer stops at 20 min; playlists json schema test (ids 34 chars, channel in the allowlist); live TV every url host in `youtube.com|ptvnews.ph` allowlist | `learn-listen`, `fun-watch`, `fun-watchlist`, `fun-livetv`, `learn-mind` (sleep stories under Listen) | 3 |

Not touched this release (D-67 disclosure): `learn-library`, `learn-article`, `learn-together`, `learn-studies`, `learn-firstaid`, `nudge-badges`, `nudge-scan`, `nudge-streak`, `nudge-settings`, `nudge-saved-*`, `fun-settings`, M5 quick replies, M7 medicine detail, M8 self-service dependent, M9 admin AI cost.

### 4.2 Batches and merge order
Batch 1 (launch together, 7 lanes): F1, A, B, C, D, E, J. Batch 2 (after batch 1 contracts are frozen; they only consume): F2, F3, G, I. Batch 3: F4. Merge order onto the integration branch: **F1 -> E -> A -> C -> B -> D -> J -> I -> G -> F2 -> F3 -> F4**; tier-0 smoke + duplicate scan after each; chain rehearsal after every SQL lane.

### 4.3 Hook lines (owner adds; other lane ships the component)
`App.tsx` (F1): `watchPushForSession()` (E), `<ApprovePinSheet/>`, `<SharingScreen/>` route, Discover screen. `Me.tsx` (A): `<DigestToggle/>` (C) under Alerts. `People.tsx` (J): `<AcceptCard/>` (A) at top, `<StormRollCall/>` (I) when `useStorm()` is live. `Medicines.tsx` (C): `shortMedName` (J). `dose-watch/index.ts` (E): `digestOff` (C). `Health.tsx` (J): `<NudgeCard/>` entry (G).

---

## 5. contracts.md (every cross-lane name; fixed before launch, changes through the orchestrator, ML-02)

### Tables / columns / policies
| Name | Owner | Shape | Readers / writers | RLS |
|---|---|---|---|---|
| `carers.accepted_at, added_by, added_at` | A (0037) | see 3 | `share_set`, `share_accept`, `link_creator()`, service role; readers: carer, owner, admin | `carers_read` only; no client insert/update/delete |
| `invite_tokens` | B (0038) | see 3 | `admin_create_invite`, pin-login (service role) | none for app roles |
| `meds_taken.marked_by` | C (0039) | uuid, trigger-set | trigger; readers: whoever reads the row | not updatable |
| `carer_prefs` | C (0039) | `user_id pk, digest_on bool default true, updated_at` | owner; dose-watch (service) | own row |
| `push_tokens` | E (0040) | see 3 | owner (REST, RLS); dose-watch/broadcast (service) | own rows; cap 3 |
| `rollcall` | I (0041) | see 3 | member/writer carer; family reads | `is_family_member()` select |
| `family_messages.kind (+kudos, recap), about_person` | G (0042) | see 3 | existing message policies | unchanged |
| `carer_alerts.kind` (+`share`,`rollcall`,`kudos`) | pre-commit + A (0037 CHECK) | enum | notify_family, share_set, triggers | unchanged |
| `audit_log.action` (+`share_add`,`share_remove`,`share_accept`,`invite`,`join`) | A (0037) | enum | share RPCs, B's RPCs | admin read |

### RPCs / functions (all SECURITY DEFINER, `search_path = ''`, grants restated)
| Signature | Owner | Callers | Returns / errors | Rate limit |
|---|---|---|---|---|
| `share_set(p_person uuid, p_carer uuid, p_can_write bool, p_on bool) returns text` | A | A `sharing/api.ts`, `admin/api.ts` | `'pending'|'removed'|'unchanged'`; `42501` not allowed; `22023` bad target; `53400` too many | 30/h per caller |
| `share_accept(p_person uuid, p_accept bool) returns bool` | A | A `AcceptCard` | true when a row changed | `pin_try` 30/h |
| `my_viewers()` | A | A | table (see 3) | - |
| `admin_share_grid()` | A | A `desk/Sharing.tsx` | table; `42501` non-admin | - |
| `admin_create_invite(p_user uuid) returns text` | B | B `desk/Members.tsx` | plain token once; `42501`; `22023` member has a PIN | 20/h per admin |
| `join_claim_check(p_hash text)`, `join_claim_use(p_hash text)` | B | pin-login only | see 3 | 5 checks per token |
| pin-login action `join_claim {token, pin}` | B | B `pinLogin.ts joinPort` | `{ok:true}` or `{ok:false, why:'bad_invite'|'taken'|'no_signal'}` | 10/h per IP |
| `family-names?invite=<token>` | B | B `JoinFlow` | `{names:[one]}` or 404 | existing 20/15 min per IP |
| `Port.digestOff(userIds: string[]): Promise<Set<string>>` | C declares, E implements | `runDoseWatch` digest rows | user ids with `digest_on = false` | - |
| `isVaccine(m: MedRow): boolean` (`dose-watch/logic.ts`) | C | runDoseWatch, medsToReview | name/form rule, tested | - |
| `flushPush(now: Date): Promise<{webPushed: number, fcmPushed: number}>` (dose-watch) | E | cron, `mode:'flush'` | web push + FCM; `pushed_at` set once | FLUSH_MAX 100, budget 100 s |
| `sendFcm(sa: ServiceAccount, token: string, msg: FcmMessage): Promise<number|null>` (`_shared/fcm.ts`) | E | dose-watch, broadcast | HTTP status; 404 UNREGISTERED -> caller deletes | 8 s timeout |
| `rollcall_alert()` trigger | I | trigger | `need_help` -> family rows | - |
| `family_messages_kudos_alert()` trigger | G | trigger | `kudos` -> member row | - |

### Client exports (exact)
```ts
// src/features/sharing/api.ts (A)
export function setShare(personId: string, carerUserId: string, on: boolean, canWrite?: boolean): Promise<'pending'|'removed'|'unchanged'|'offline'|'refused'>
export function acceptShare(personId: string, accept: boolean): Promise<boolean>
export function myViewers(): Promise<Viewer[]>                   // {carerUserId, displayName, canWrite, acceptedAt|null, addedByAdmin}
export { AcceptCard } from './AcceptCard'                       // mounted by J in People.tsx
// src/features/notify/DigestToggle.tsx (C)
export default function DigestToggle(): JSX.Element | null       // null unless carerOf.length > 0
// src/features/health/medName.ts (J)
export function shortMedName(name: string): string
// src/features/notify/fcm.ts (E)
export function watchPushForSession(): () => void
export const CHANNEL_ID = 'carer_alerts'
// src/features/discover/index.ts (F1)
export type DiscoverSub = 'learn'|'listen'|'play'|'watch'|'news'
export function registerSub(sub: DiscoverSub, Screen: ComponentType): void
// src/features/discover/learn/pick.ts (F2)
export function articleText(id: string): string | null
// src/features/discover/listen/tts.ts (F4)
export function speak(text: string, lang: 'en'|'fil'): Promise<void>; export function stop(): Promise<void>; export function available(lang: 'en'|'fil'): Promise<boolean>
// src/features/nudge/replyParse.ts (G)
export function parseReading(text: string): { sys: number; dia: number; pulse?: number } | { ask: string } | null
// src/features/safety/stormMode.ts (I)
export function stormRef(a: Alert): string                       // safety_alerts.id of the live signal
// src/features/today/placeName.ts (J, consumes D)
export const placeNameOf: (place) => string                      // same string on Today, Safety header and AlertBand (S10)
```
kv keys: removed `share.*` (A); new local-only `nudge.kudosOff`, `nudge.bpTimes`, `play.day` (G, F3); `push.token` (E). Templates: `share_offer` (carer: "<name> wants to share their health records with you", tab family), `share_on` (member: "<name> can now see your records", today), `share_off`, `rollcall_help` (safety, "Someone in your family needs help in the storm", family, urgent), `rollcall_ask`, `kudos` (carer cls, "Someone sent you a heart", health). Secrets: `FIREBASE_SERVICE_ACCOUNT_B64` (new, E); `FAMILY_INVITE_TOKEN` (retired, B). GitHub secret `GOOGLE_SERVICES_JSON_BASE64` (E).

---

## 6. Release

### 6.1 Gates (bare, exit codes quoted, ML-20; tree clean after, ML-32)
Per lane: `npx tsc --noEmit` 0; lane vitest 0; lane Playwright 0; shots 390x844 light + dark vs the named `data-s`; checklist returned; Opus audit pass. Merge queue: tier-0 smoke after each merge (every tab opens, Me opens, no page error); duplicate scan; chain rehearsal 0001-0042 on WSL (`createdb bantay_chain; psql -X -v ON_ERROR_STOP=1 -f supabase/tests/chain_rehearsal.sql` then each lane rehearsal) ALL PASS; `deno check` + `deno test` for every function touched (dose-watch, broadcast, pin-login, family-names) and `deno info` lists of functions bundling `_shared/templates.ts` and `_shared/fcm.ts` in `functions_to_deploy` (ML-22). Release: full vitest, full Playwright incl. `no-sideways-scroll.spec.ts` and `tabbar-overlap.spec.ts` at 360 and 390 px, axe on every new screen, Opus whole-branch review, `scripts/check-manifest.mjs` exit 0, APK build dry-run (`release-apk.ps1 -DryRun`) proving `google-services.json` is picked up locally.

### 6.2 Deploy order (Lloyd, `scripts/golive-s12.ps1`, stops at the first failure)
1. Secrets check: `FIREBASE_SERVICE_ACCOUNT_B64`, `DOSE_WATCH_CRON_SECRET`, Vault `dose_watch_cron_secret`.
2. SQL 0037 -> 0038 -> 0039 -> 0040 -> 0041 -> 0042, each recorded in `schema_migrations`.
3. Functions: `dose-watch` (`--no-verify-jwt`), `broadcast`, `pin-login` (`--no-verify-jwt`), `family-names` (`--no-verify-jwt`), in that order (dose-watch first so the 0041 trigger flushes reach the FCM-aware function).
4. `secrets unset FAMILY_INVITE_TOKEN`; archive pamilya (2.1.4); mark imported vaccine rows stopped (2.1.10) if Lloyd confirmed the list.
5. Web: merge the PR; confirm the live bundle contains "Who can see my records" and the five-tab bar.
6. APK: Actions > Release Android app 2.4.0 (writes google-services.json from the secret; fails if absent); install on two phones.

### 6.3 Rollback per step
- SQL: downs 0042 -> 0037 in reverse (each tested in rehearsal); 0037's down restores `is_carer_of`/`is_writer_of` without `accepted_at` and the three carers policies, so sharing returns to the 0001 model (rows stay).
- Functions: `supabase functions deploy <fn>` from tag `pre-s12` (the orchestrator tags main before the merge); the old dose-watch ignores `push_tokens`, so nothing breaks.
- Web: Cloudflare Pages rollback to the previous deployment (old web on a 2.4.0 shell: the push plugin registers a token nobody reads; harmless).
- APK: phones keep 2.3.0 if 2.4.0 is not installed; a 2.4.1 only for a start-up crash. `min_shell` is never raised in this release.
- Invite: if B must roll back, re-set `FAMILY_INVITE_TOKEN` and redeploy `family-names` from the tag.

### 6.4 Live checks (exact production rows that prove each safety path)
1. Push: on phone 2 (carer, signed in on 2.4.0) `select user_id, platform, app_version, updated_at from push_tokens` shows 1 row for that user. On phone 1 tap Unwell (Today) -> `select kind, template, pushed_at, seen_at from carer_alerts where kind='mood_unwell' order by created_at desc limit 1` has `pushed_at` within 60 s and phone 2 shows the lock-screen notification "<nothing but the template title>"; `select summary->>'fcmPushed' from job_runs where job='dose-watch' order by ran_at desc limit 1` >= 1. Repeat with the app force-stopped on phone 2.
2. Broadcast: /admin broadcast `heat_alert` -> reply `{sent, fcmSent >= 1, rows = active members}`.
3. Digest: with phone 2 opted out, at 20:00-20:30 Manila `select count(*) from carer_alerts where kind='digest' and carer_user_id='<phone2 uid>' and created_at > current_date` = 0 while phone 1's other carer gets 1.
4. Marked-by: phone 2 marks phone 1's dose -> `select marked_by from meds_taken order by created_at desc limit 1` = phone 2's uid; phone 1's Medicines row says "Taken ... by <Joy>".
5. Sharing: before phone 1 shares, phone 2 (not yet a carer) opens phone 1's member page -> 0 readings; `share_set` + `share_accept` -> readings visible; `select action, count(*) from audit_log where action like 'share%' group by 1` = add 1, accept 1.
6. Join: `admin_create_invite` for a PIN-less member -> link opens one name; set PIN; second open of the same link -> "not working"; `select used_at is not null from invite_tokens order by created_at desc limit 1` = true.
7. Freshness: `select job, ran_at, ok from job_runs where job='alerts-ingest' order by ran_at desc limit 1` within 10 min; Safety shows "Checked <n> min ago" with no amber; stop the cron for an hour in a test only if Lloyd wants to see the amber (optional).
8. Roll call: with no live storm the card is hidden; the rehearsal is the proof; on the next real signal, `select person_id, status, at from rollcall` shows the family's taps.
9. Tabs: two elders' phones show Today, Health, Discover, Family, Safety with no sideways scroll at their text size.

---

## 7. Effort and critical path

| Lane | Build h | Audit + fix h | Notes |
|---|---|---|---|
| Pre-commit | 2 | - | orchestrator |
| F1 SHELL | 6 | 2 | merge first |
| A SHARE | 10 | 4 | rehearsal heavy |
| B JOIN | 7 | 3 | deno tests |
| C MARKED-BY | 5 | 2 | |
| D FRESH | 4 | 2 | |
| E PUSH | 10 | 4 | + Lloyd's Firebase steps before any live test |
| J POLISH | 6 | 2 | |
| F2 LEARN | 10 | 3 | + clinician review (external, release gate not merge gate) |
| F3 PLAY | 9 | 3 | |
| G NUDGE | 12 | 4 | |
| I ROLL CALL | 6 | 2 | |
| F4 LISTEN/WATCH | 8 | 3 | cuttable |
| Merge queue, rehearsals, gates, whole-branch review, release script | 10 | - | orchestrator |
| **Total** | **~105 h** | **~34 h** | 3 batches, about 4-5 agent sessions; Lloyd ~2.5 h hands-on + device tests (2 phones, ~1 h) |

Critical path: Lloyd's Firebase steps (2.2 1-5) -> pre-commit -> F1 -> E (needs a real token on a real phone to prove the path; nothing else can stand in for it) -> merge queue through A/C (rehearsal chain) -> whole-branch review -> apply + deploy -> merge -> APK 2.4.0 -> live checks 6.4.1 on two phones. Everything in batches 2-3 runs in parallel with that path and merges behind it.

### Critical Files for Implementation
- `D:/Claude/Bantay/.claude/worktrees/family-bantay-phase2-audit-9375db/supabase/migrations/0001_health.sql` (is_carer_of/is_writer_of :57-63, carers policies :100-111; the private default lives here)
- `D:/Claude/Bantay/.claude/worktrees/family-bantay-phase2-audit-9375db/supabase/functions/dose-watch/index.ts` (flushWebPush :116-146 becomes flushPush with FCM; carerRow :88-95; digestOff hook)
- `D:/Claude/Bantay/.claude/worktrees/family-bantay-phase2-audit-9375db/src/features/notify/templates.ts` (NOTIFY_KINDS/ALERT_KIND + templates; byte-identical twin in `supabase/functions/_shared/templates.ts`)
- `D:/Claude/Bantay/.claude/worktrees/family-bantay-phase2-audit-9375db/src/features/shell/routes.ts` and `src/features/shell/TabBar.tsx` (5 tabs, discover routes, sharing view, Jack FAB)
- `D:/Claude/Bantay/.claude/worktrees/family-bantay-phase2-audit-9375db/src/screens/Me.tsx` (SHARE/ShareRow :29-49 replaced by the server share list; DigestToggle hook)

Skipped / not checked: nothing was run (no tsc, SQL, deno, device); I did not open the Phase 3 canvas boards, `admin-members`, the import's vaccine rows, `messagesApi.ts`, or verify a Capacitor-8 release of the TTS plugin and the exact `@capacitor/push-notifications` 8.x version (lanes F4/E confirm at `npm install`). Risk Lloyd must know: 0037 changes `is_carer_of` for every health policy at once; a carer whose row somehow lacks `accepted_at` after the back-fill loses access until accepted, so the rehearsal and live check 6.4.5 are not optional.