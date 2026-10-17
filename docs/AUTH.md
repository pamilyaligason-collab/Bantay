# Sign-in setup (lane A1)

Two ways in: Google (invited emails only) and handle + 6-digit PIN (made by an admin). No values are stored in this repo.
Everything below is done by Lloyd in the Supabase and Google consoles. About 25 minutes.

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
- Picker: tap a face, then the 6-digit PIN pad (PIN members) or Continue with Google. "Not in the list?" opens the typed name + PIN and Google options.
- Sessions on this project never expire, so after the first sign-in the phone stays signed in; the picker matters after Switch person or a sign-out.
- Family > This phone: Turn on fingerprint or face sign-in, Not you? Switch person (signs out, keeps the picker), Forget this phone (clears the picker list and passkey flags, signs out). Only a local flag `bantay.passkey.<personId>` is stored, never key material.
- Google errors that come back in the URL (`?error=` or `#error=`) are shown on the sign-in screen and removed from the address bar. "Signups not allowed" or a hook refusal reads "This Google account is not invited yet. Ask your family admin."

### Passkeys (beta) dashboard step, Lloyd does this once
1. Supabase, Authentication, Passkeys (beta): enable it.
2. Relying party ID: `bantay.pages.dev`. Allowed origin: `https://bantay.pages.dev`.
3. Nothing to change in the app: supabase-js 2.118 has passkeys on by default (the old `experimental.passkey` flag is ignored, so it is not set).
Until step 1 is done the "Turn on fingerprint or face sign-in" button reports "Not available on this phone yet" and nothing breaks. Passkeys work only on the real origin (HTTPS, matching RP ID), not on localhost or a preview URL.
Known limit: the passkey sign-in is the browser's own picker, so it signs in whoever owns the passkey the person chooses, which may differ from the face tapped. Removing a passkey on the server is not exposed in the app yet; "Forget this phone" only forgets it locally.
