# In-app family alerts (D-78, session 10 lane S1)

There is no server push on the Android app. A family alert is a row in `public.carer_alerts` (migration `0030`). The carer sees it when they open Bantay: the bell with a count, the alert list, a Today card, a badge on the Family tab. Browser and PWA users also get a web push for the same row.

## Flow

1. A writer inserts a row: `notify_family(person, kind, template, ref, scope)` (SECURITY DEFINER; callable only by triggers, wrappers and the service role), the dose-watch function (`carerRow`), `broadcast` (hazard rows), `pin-login`, S8 `heartbeat`. The one app-callable path is `raise_mood_alert(person)` (`mood_unwell`, once per person per Manila day).
2. `(kind, ref, carer)` is unique where `ref` is not null: a duplicate is ignored, never an error.
3. dose-watch `mode:'flush'` (cron secret in `x-dose-watch-secret`) sends Web Push `{t}` only (contracts B-7: a lock screen is public, so no name, not even for a missed dose) to the carer's `push_subscriptions` for rows with `pushed_at` null, then sets `pushed_at` either way ("offered"). Rows older than 12 h are not pushed.
4. The app (`src/features/notify/alertsLive.ts`) subscribes to Realtime `postgres_changes` on `carer_alerts` for its own user while open, polls every 30 s, polls once on resume, ignores DELETE events, and keeps rows in the feature-local Dexie store (`notify/store.ts`, 30 days / 200 rows). Sign-out, or another person signing in on the phone, clears it.

## Copy

APK: "Family alerts show here when you open Bantay." Never promise a push or lock-screen alert on Android. "Will see it in Bantay"; add "and get a notification in the browser app" only for PWA users.

## Server pieces

| Piece | File |
|---|---|
| table, RLS, `notify_family`, `raise_mood_alert`, prune, guarded Realtime block | `supabase/migrations/0030_carer_alerts.sql` (+ `.down.sql`, rehearsal `supabase/tests/carer_alerts_rehearsal.sql`) |
| templates (ids, copy, tone, kind map) | `src/features/notify/templates.ts`, byte-identical copy `supabase/functions/_shared/templates.ts` (a test keeps them equal) |
| delivery, phone-health sweep, `dose_due`, heartbeat | `supabase/functions/dose-watch/index.ts` |
| admin broadcast also writes `hazard` rows | `supabase/functions/broadcast/index.ts` |
| `ALLOWED_ORIGIN` comma list (APK test window) | `supabase/functions/_shared/http.ts` |

Functions to deploy before the web merge, after the migrations (contracts.md deploy order: database, functions, web) (ML-22): `dose-watch`, `broadcast` (bundle `_shared/templates.ts`); every function that bundles `_shared/http.ts`: `admin-members`, `ask`, `family-names`, `pin-login`, `records-extract`. Set `ALLOWED_ORIGIN` to a comma list only during an APK test window.

## Not done here (named so nobody assumes)

- `DOSE_WATCH_AFTER_MIN` is read in `index.ts` and passed to `runDoseWatch` as a third argument `{afterMin}`; S4's `logic.ts` must accept it (its `WATCH_AFTER_MIN` is a constant today).
- S4's `logic.ts` must call `port.carerRow('dose_missed', personId, carerIds, 'dose_missed', ref)` instead of pushing; the ref should end in `:<Manila day>:<HH:MM>` so the bell's "Mark taken" can find the slot.
- The Privacy route in `App.tsx` waits for S6c's screen.
- (Session 10, now done in session 12 lane C, migration 0039) `marked_by` on a dose taken for someone else: see "Marked by and the 8 PM summary" below.

## Deviations and notes (fix round 2)
- Deviation, accepted by the orchestrator: kv `alerts.inapp.ok` is set by `pollAlerts` on the first successful `carer_alerts` read (contracts.md assigns it to `AlertsBanner` after the phone check). Before 0030 is applied the read errors, so it is never set.
- `broadcast` marks its hazard rows offered only after the `push_subscriptions` read succeeds; a failed mark does not stop the safety push, and the reply carries `marked:false` (a repeat push replaces itself by tag).
## Marked by and the 8 PM summary (session 12 lane C, D-83, migration 0039)
- `meds_taken.marked_by` is stamped by a BEFORE INSERT trigger from `auth.uid()`; a value the phone sends is always overwritten, and no one can update it. A caller with no `auth.uid()` (the service role) keeps what it sends. `marked_by_name` is the marker's first name, stamped by the same trigger, empty when the person marked their own dose. Medicines shows "Taken 8:12 AM" or "Taken 8:12 AM · marked by Joy". Sync pulls both columns and never sends them.
- `carer_prefs (user_id, digest_on, updated_at)`: own row only, read-only for the app: the switch writes through the `set_digest(p_on)` RPC (0039, auth.uid() only, 30 changes an hour); dose-watch reads it with the service role through `Port.digestOff(userIds)` (lane E implements it in `index.ts`: `select user_id from carer_prefs where digest_on = false and user_id in (...)`, with the service role). The 8 PM switch in Me (`notify/DigestToggle.tsx`) shows only for someone who cares for another person.
- The opt-out drops kind `digest` rows ONLY. Missed-dose, Unwell, SOS, review and every other alert ignore it (tested: carers J and B, B opted out gives 1 digest row and 2 missed-dose rows). If the opt-out read fails, that run skips the digest and counts a failure; the next run in the 30-minute window tries again. Copy in Me: "Turning this off never stops missed-medicine or Unwell alerts."
- Vaccines: the prescription import turns a vaccine line into a `medications` row, which would raise "Still taking it?" and a missed dose. `isVaccine(med)` (`dose-watch/logic.ts`, whole words: vaccine, vaccination, bakuna, toxoid, pneumococcal, meningococcal, common brands; never "Vaccinium", the cranberry and bilberry plant) keeps them out of `dose_missed`, `review_open` and the 8 PM open-dose check. Go-live may also mark the imported vaccine rows stopped (PLAN 2.1.10).
- Functions to deploy: `dose-watch` (bundles `logic.ts`).

## Deviations and notes (fix round 3)
- A carer's missed-dose push is the carer-class template `dose_watch`, from the flush loop: `runDoseWatch` writes a `carer_alerts` row of kind `dose_missed` (S4) and the flush pushes `{t:'dose_watch'}`; `runDoseWatch` itself no longer pushes. The phone treats it as `cls: carer`: the carer cap (6 a day) and carer quiet hours, one tag `dose_watch` so alerts collapse. It reads "A medicine was missed by someone you look after." (no name).
- The payload is `{t:'dose_watch'}` or `{t:'dose_watch', n}` where `n` is a COUNT of missed doses (integer 1 to 99, B-7); a name, a medicine or any other key makes `buildNotification` return null. `firstName` and `doseWatchText` are gone. `dose_missed` stays the user's own health nudge (2 a day, no quiet hours), untouched.
- ML-24: the flush loop stops at the run budget; `runDoseWatch` stops claiming slots once `port.overBudget()` is true and leaves the rest unclaimed for the next run.
- Functions to deploy: `dose-watch` and `broadcast` (both bundle `_shared/templates.ts`).
