# Sign-in setup (lane A1)

Two ways in: Google (invited emails only) and handle + 6-digit PIN (made by an admin). No values are stored in this repo.
Everything below is done by Lloyd in the Supabase and Google consoles. About 25 minutes.
Official safety alerts ingestion (cron + Edge Function) is applied separately: see `docs/ALERTS.md`.

## 1. Apply the SQL

Run `supabase/migrations/0002_auth.sql` after `0001_health.sql` (SQL editor or `supabase db push`).
It adds `app_roles`, `invites`, `pin_attempts`, `is_admin()`, `ensure_self_person()`, `pin_try()` (service role only) and
`hook_before_user_created()`. Rehearsal of 0001 + 0002 on a throwaway Postgres: `powershell scripts/rehearse-auth.ps1` (54 checks).

## 2. Google OAuth client

1. Google Cloud console: APIs and Services, OAuth consent screen (External, app name Family Bantay, your email as support contact).
   Add the consent screen test users while it is in Testing, or publish it.
   Supabase, Authentication, Providers, Email: turn OFF "Enable sign ups" for the Email provider, keep Confirm email on and leave
   "Allow unverified email sign-ins" off. Otherwise someone could register an invited address by email first and later get the
   member's Google identity linked to that account. (The hook also refuses invited emails that do not come from Google.)
2. Credentials, Create credentials, OAuth client ID, type Web application.
3. Authorized redirect URI: the Supabase callback shown on the Supabase Google provider page
   (`https://<project-ref>.supabase.co/auth/v1/callback`).
4. Copy the client ID and client secret into Supabase, Authentication, Providers, Google, then enable it.
5. Supabase, Authentication, URL Configuration: set Site URL to the app origin and add the app origin (with a trailing `/**`)
   to Redirect URLs. The app asks for `origin + pathname` as the return address.

## 3. Before User Created hook

Supabase, Authentication, Hooks, Before User Created: choose Postgres function, schema `public`, function `hook_before_user_created`, enable.
This refuses every sign-up whose email is not in `public.invites`, except members the admin function creates
(synthetic `m-<uuid>@members.bantay.invalid` with `app_metadata.created_by_admin = true`, which only the service role can set).
The hook gates self sign-ups only. Members the admin function creates are not gated by invites: `admin-members` (admin check) is the gate.
Until you invite yourself the first time (step 6) Google sign-up is closed to everyone.

## 4. Edge Function secrets

Supabase, Edge Functions, Secrets (or `supabase secrets set NAME=...`):

| Name | What |
| --- | --- |
| `PIN_PEPPER` | A long random string, at least 32 characters. Generate it yourself, keep it in your password manager. If it is lost every PIN member needs a PIN reset. Never commit it. |
| `VAPID_PUBLIC_KEY` | Web push public key (also the build value `VITE_VAPID_PUBLIC_KEY`). |
| `VAPID_PRIVATE_KEY` | Web push private key. Never in the app, never committed. |
| `VAPID_SUBJECT` | `mailto:` address push services can contact. |
| `ALLOWED_ORIGIN` | The app origin only, for example `https://your-app-host` (no trailing slash). CORS allows nothing else. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions by Supabase. The service role key is never in the app.

## 5. Deploy the functions

```
supabase functions deploy pin-login --no-verify-jwt
supabase functions deploy admin-members --no-verify-jwt
supabase functions deploy broadcast
```

`--no-verify-jwt` is intended: pin-login is called while signed out, and admin-members verifies the caller itself
(`auth.getUser`, then `is_admin()` with the caller's own client) before it uses the service role.

## 6. First admin (once)

1. Insert your own invite, so the hook lets you in: `insert into public.invites (email) values ('<your google email, lowercase>');`
2. Open the app, Continue with Google. This creates your user, your people row and a member role.
3. Make yourself admin: `update public.app_roles set role = 'admin' where user_id = (select id from auth.users where email = '<your google email>');`

After that, add family from the admin screen (create PIN members, invite Google emails, reset PINs, disable).

## 4b. Session lifetime

Supabase, Authentication, Sessions / JWT settings: set the JWT expiry to 10 to 15 minutes (600 to 900 seconds).
A PIN reset or disable deletes the member's sessions (`public.revoke_sessions`), but an access token already issued keeps
working until it expires, so a short expiry is what closes that window.

## How it behaves

- PIN login: wrong PIN, unknown handle, disabled member and lockout all return the same text, "Handle or PIN is not right".
  5 wrong tries lock that handle for 15 minutes (unknown handles lock the same way). 30 tries per IP per 15 minutes in total.
  Attempts are counted before the PIN is checked, so parallel guesses cannot beat the limit.
- Admins sign in with Google only. A PIN member cannot be created as, or promoted to, admin.
- PIN rules: exactly 6 digits, not all the same digit, not 123456.
- Disable bans the account in Supabase Auth too, so a disabled member cannot refresh a session.
- Dev and tests: with `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY` unset, AuthGate renders the app with no sign-in.
  A production build without both fails at build time (`vite.config.ts`), and a bundle built without them shows "Sign-in is not configured.". `BANTAY_ALLOW_NO_AUTH=1` exists only for the e2e test build.
- Unknown handles cost one dummy sign-in call so timing is similar; a decoy real user was not built, so a very careful timing
  attacker may still tell a known handle from an unknown one. The lockout and the generic text limit what that is worth.
- The client IP for the per-IP limit comes from cf-connecting-ip, then x-real-ip, then the LAST x-forwarded-for hop.
- Never log PINs, derived passwords or tokens. The functions log nothing from request bodies.

## 7. Quick login on a family phone (D-24, lane Q1)

Run `supabase/migrations/0006_family_profiles.sql` after 0005 (adds `family_profiles()`; rehearsed in `supabase/tests/chain_rehearsal.sql`).

How it behaves:
- The public sign-in page never lists names. After any sign-in the app asks `family_profiles()` (signed-in, non-disabled members only; names, handle for PIN members, kind; no emails) and keeps the list in this phone's localStorage (`bantay.family`). Only a phone that has signed in before shows the picker.
- Trusted phone: a "Who are you?" dropdown plus Continue, then the PIN pad. After a successful sign-in the phone remembers who (`bantay.lastPerson`, cleared by Switch person and Forget this phone); the next visit shows only the mascot and that person's name, with "Not you? Switch person". The mascot is `src/assets/mascot.svg`: drop Jack Jack's art over that one file. Old picker: tap a face, then the 6-digit PIN pad (PIN members) or Continue with Google. "Not in the list?" opens the typed name + PIN and Google options.
- Sessions on this project never expire, so after the first sign-in the phone stays signed in; the picker matters after Switch person or a sign-out.
- Family > This phone: Turn on fingerprint or face sign-in, Not you? Switch person (signs out, keeps the picker), Forget this phone (clears the picker list and passkey flags, signs out). Only a local flag `bantay.passkey.<personId>` is stored, never key material.
- Google errors that come back in the URL (`?error=` or `#error=`) are shown on the sign-in screen and removed from the address bar. "Signups not allowed" or a hook refusal reads "This Google account is not invited yet. Ask your family admin."

### Passkeys (beta) dashboard step, Lloyd does this once
1. Supabase, Authentication, Passkeys (beta): enable it.
2. Relying party ID: `bantay.pages.dev`. Allowed origin: `https://bantay.pages.dev`.
3. Nothing to change in the app: supabase-js 2.118 has passkeys on by default (the old `experimental.passkey` flag is ignored, so it is not set).
Until step 1 is done the "Turn on fingerprint or face sign-in" button reports "Not available on this phone yet" and nothing breaks. Passkeys work only on the real origin (HTTPS, matching RP ID), not on localhost or a preview URL.
Known limit: the passkey sign-in is the browser's own picker, so it signs in whoever owns the passkey the person chooses, which may differ from the face tapped. Removing a passkey on the server is not exposed in the app yet; "Forget this phone" only forgets it locally.

## Session 10 phase 2 (S6b): PIN reset by family approval, invite names, erasure

Apply `supabase/migrations/0034_pin_reset_erasure.sql` after 0033 (needs 0009, 0021, 0029, 0030). Undo: the `.down.sql`. Rehearsal: `supabase/tests/pin_reset_erasure_rehearsal.sql` (ALL PASS).
The admin reset (`request_pin_reset`, 0009) is retired: its execute is revoked from everyone. `admin_requests` stays for history. The app must call `pin-login` instead (see below) before 0034 is applied.

**Reset protocol (`pin-login`, anonymous, same CORS and `--no-verify-jwt` as sign-in).**
1. `{action:'reset_start', handle, method:'family'|'google', google_token?}` returns `{ok, id, secret, code}`. The reply has the same shape for a known, unknown, disabled, malformed or Google-only handle (unknown ones store nothing). Limits: 3 per hour per handle (unknown handles counted too) and 10 per hour per address (`reset_complete` has its own bucket of 120 per hour per address plus 80 tries per request per hour, enough for a 30-minute poll every 10 to 30 seconds (up to 66 calls); start attempts never starve completions); both trips return the same 429 `rate_limited`. `secret` is 128 random bits, shown once, stored only as an HMAC (`PIN_PEPPER`). `code` is 4 digits, shown on the requester's own screen.
2. `family`: one `carer_alerts` row of kind `pin_approve` per active admin except the requester (`ref` = request id; SEC-1, 0043, supersedes D-76). An admin who opens Bantay sees the approve sheet and types the code the requester reads out: `approve_pin_reset(id, code)`. Only an active admin holding that request's `pin_approve` row can approve; a non-admin gets false and costs the request nothing. First approval wins. 5 wrong codes burn the request. Web push for PWA members goes out now if the function has `DOSE_WATCH_CRON_SECRET`; otherwise the next 15-minute dose-watch run sends it.
   `google`: approved at once only when `google_token` (a Supabase access token) belongs to the same auth user and carries a Google identity; otherwise the request stays unapproved until it expires.
3. `{action:'reset_complete', id, secret, new_pin}`: checks the secret, then used, expired, approved (distinct errors `bad_secret`, `used`, `expired`, `not_approved`, `weak_pin`), claims the request atomically, sets the derived password, ends the user's sessions, clears the PIN lock, writes `audit_log` action `pin_reset` and a `pin_changed` alert for the owner. One open request per user: a new `reset_start` burns older ones.
The fingerprint route is not built (Q33).

**Invite names.** Retired in session 12 (D-81): the family-wide `FAMILY_INVITE_TOKEN` link is gone, see "Session 12 lane B" below. Link form is unchanged: `https://bantay.pages.dev/#join/<token>`.

**Consent, export, erasure.** `people.consent_at`, `consent_version`, `consent_by` (always the caller). `export_my_data()` (5 per hour) returns the caller's own rows as JSON. `request_erasure()` starts a 7-day undo window and returns `cancel_until`; `cancel_erasure()` works only before it. The `erase` function (cron `ops/sql/erasure_cron.sql`, daily 03:10 Manila, header `x-erase-secret`) removes the person's storage objects (records, avatars, family-messages) and then, in one transaction, every row with their `person_id`, their messages, push subscriptions, phone health, SOS acks and alerts. `audit_log` is kept. The people row stays, blanked (`display_name` = "Former member", `erased_at` set). Drive copies are the family folder owner's to remove (D-46). One discovery, `erasure_targets()`, drives both the export and the erase: every public table with a `person_id` column (matched to the member's own people row) and every table with a column holding the member's user id (`user_id`, `uploaded_by`, `sender_id`, `carer_id`, `carer_user_id`). That covers usage_events, assistant_usage, client_errors, admin_requests, phone_health, carers, push subscriptions, messages, SOS rows and acks as well as the health tables. `family_photos.uploaded_by` is set null on erase (the photo stays with the family) but is exported. Kept on purpose: `audit_log`, `app_roles` (disabled, not deleted) and the erasure marker. The export leaves out reset codes and PIN lock rows and strips push keys. The rehearsal pins the covered set against a hand-written list of 43 table.column entries and seeds one row in each, so a new table fails the test until it is classified.
The erase also blanks every personal `people` column, deletes `carers` rows both ways, removes the member's reset requests, PIN lock row and invite row, and sets `app_roles.disabled = true`; `is_self()` (redefined in 0034) refuses a disabled member, so a token that outlives the ban writes nothing.
**Closing the login (by any method).** Right after `erase_user_data` the `erase` function, with its service-role client: (1) calls `public.revoke_sessions`, (2) bans the user in Supabase Auth (`ban_duration`, as `admin-members` does for a disable), (3) runs `public.erasure_scrub_identities` (drops the Google identity rows and empties `auth.users.raw_user_meta_data` with SQL, because the Auth API merges user metadata key by key and cannot clear it), (4) sets the email to `erased-<user id>@members.bantay.invalid`. Any failing step marks that user failed: the run counts it, the heartbeat goes red, and `erasure_due()` keeps listing the user (`erased = true`) until the email is the erased value, so the next run retries the auth steps only. `erasure_due()` stamps `attempts`/`last_try_at` on each row it returns and serves the longest-untried first, so a user whose step keeps failing cannot starve the others. The `auth.users` row itself is kept; deleting it by hand (`supabase auth admin delete-user`) fails for most members because `people.created_by` references it without a delete rule.
Left as is: `created_by` / `confirmed_by` columns on other people's records, `family_notes`, `family_tasks` and `invites.invited_by` hold only a user id, which is no longer personal once the login is gone. Deleting the member's `carers` rows also removes the creator link they held to no-login persons they created; an admin can re-attach those.

Secrets: `ERASE_CRON_SECRET` (32+ chars; also in Vault as `erase_cron_secret`), optional `DOSE_WATCH_CRON_SECRET` on `pin-login`. Redeploy `pin-login`, `family-names` and `erase` when any of them changes. (`FAMILY_INVITE_TOKEN` is retired, see below.)

## Session 12 lane B: personal invite links (D-81, migration 0038)

**What changed.** One link per member, single use, 7 days. The static `FAMILY_INVITE_TOKEN` secret and its `family-names` check are removed. **The old family link stops working when `family-names` is redeployed**, so send each member their own link from /admin (Members, "Invite link"), then run `npx -y supabase@2.122.0 secrets unset FAMILY_INVITE_TOKEN`.

**Who gets a link.** An active PIN member (handle set, `m-...@members.bantay.invalid` login) who has never signed in, because that is the only "no PIN of their own yet" state the data can show (an admin-made PIN is a temporary one). `admin_create_invite(p_user)` (admin only, 20 an hour) returns the plain 43 character token once and stores only `sha256` hex in `public.invite_tokens`; an older open link of that member is burned (`used_at`), and a unique index keeps one open link per member. `22023` = the member has signed in before, is disabled, is a Google member or is unknown. The admin audit gets one `invite` row (no token).

**Claiming.** `pin-login` action `join_claim {token, pin}`: per-IP 10 an hour (429), weak PIN refused before the link is counted, `join_claim_check` (counts one try, 5 per link), a member who has signed in before gets `taken`, `join_claim_use` (single use, in SQL), then the first PIN is set through the Auth admin API with `_shared/pin.ts`; `join` is audited and any lock cleared. If the PIN write fails the link is given back. Every unknown, ended, used, burned, exhausted or malformed link gets the same `{ok:false, why:'bad_invite'}`.

**Names.** `family-names?invite=<token>` returns `[{first_name, initial, handle}]` with the one member, or 404. It uses `join_claim_peek`, which counts nothing; the 404 body says `why` (used, ended, tries, bad) so the app can tell the person what to do. Safe because the token is 256 random bits. Reads are limited to 20 per address per 15 minutes.

**Data rules.** `invite_tokens` has RLS on and no client grant (service role only); it is left out of `export_my_data`; erasing a member deletes their rows; `dose_watch_prune` (0040) deletes rows older than 30 days. `family-names` now bundles `pin-login/join.ts`: redeploy both functions together.
