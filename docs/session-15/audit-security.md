# Family Bantay security/privacy audit (main 6f32f97, live wuakimpssycbtnmoexuc, 2026-10-30)

Read-only. Nothing was written to the repo or the database.

## Findings

### SEC-1 (major): any family member can reset another PIN member's PIN and take over the account
- Evidence:
  - `supabase/functions/_shared/login.ts` `resetStart`: anyone (no auth) can POST `pin-login {action:'reset_start', method:'family', handle:<victim>}`. The reply hands `{id, secret, code}` to the caller.
  - `supabase/functions/pin-login/index.ts` `notifyApprovers`: inserts a `pin_approve` carer_alert for **every active member except the victim**. That includes the attacker.
  - Live `approve_pin_reset(p_id, p_code)` body: it refuses only `r.user_id = me`, and it requires the caller to hold that request's `pin_approve` alert. The attacker holds one and already knows the code.
  - The attacker then calls `reset_complete {id, secret, new_pin}`. The victim's PIN is set, and the attacker signs in as the victim (`attemptLogin`).
- Preconditions: the attacker is an active, signed-in family member. Victim handles are public through `family-names`. Live: 5 active members, 3 PIN members, 0 reset requests so far.
- Impact: an insider can take over another member's account. That gives them the member's private records, which defeats D-82/D-84 ("records private until the member shares"). The victim gets a `pin_changed` alert and loses their sessions, but only after the takeover.
- Fix: in `approve_pin_reset`, refuse approval unless the request was started from a device that is not the approver's. Simplest working version: store the starter's `auth.uid()` (or an "anonymous" marker) on the request and refuse when `approved_by` = starter. Stronger version: only the victim's existing carers or an admin may approve, or have the approver confirm the victim's identity out of band. As a minimum, never return `code` to an authenticated caller who is not the handle owner.
- Files: `supabase/functions/_shared/login.ts`, `supabase/functions/pin-login/index.ts`, a new migration redefining `approve_pin_reset` (+ `pin_reset_requests.started_by` column), tests in `_shared/login.test.ts` and `supabase/tests/pin_reset_erasure_rehearsal.sql`.
- Needs a migration and a deploy (pin-login): yes, so Lloyd's approval is required. If the design accepts "every family member is trusted", record that as an accepted risk in 02-DECISIONS instead. No decision currently covers it.

### SEC-2 (minor, latent): a person's creator keeps read access to the `people` row after the member claims it and removes them
- Evidence: the live `people_read` policy is `auth_user_id = auth.uid() OR ((created_by = auth.uid() OR is_carer_of(id)) AND archived_at IS NULL)`. The `created_by` clause does not depend on the share list. `people` holds phone, address, birthdate, blood_type, allergies, conditions and medicines.
- Live check: 3 claimed people with creator not equal to owner. In all 3 the creator is an admin, who can read anyway through `people_admin_read`. So nothing is exposed today (0 rows with a non-admin creator).
- Impact: if a non-admin member creates a dependent who later gets their own login, that creator can still read the demographics after the member removes them from "Who can see my records". That would be a D-82 gap.
- Fix: change the clause to `created_by = auth.uid() AND auth_user_id IS NULL`.
- Files: new migration (policy `people_read`). Needs a migration: yes.

### SEC-3 (minor, hardening): `authenticated` (and `anon` on one table) holds TRUNCATE on 28 public tables
- Evidence: live `has_table_privilege(...,'TRUNCATE')` is true for authenticated on people, carers, readings, medications, lab_results and 23 others. anon has it on `assistant_usage`. TRUNCATE bypasses RLS.
- Exploitability: not reachable today. PostgREST and supabase-js expose no TRUNCATE, these roles cannot log in directly, and they cannot create functions (no CREATE on public). Defence in depth only.
- Fix: `revoke truncate, references, trigger on all tables in schema public from anon, authenticated;`
- Files: new migration. Needs a migration: yes.

### SEC-4 (minor): `public.records_auto_threshold()` has a mutable search_path (advisor WARN)
- Evidence: `get_advisors` lint `function_search_path_mutable`. It is SECURITY INVOKER and EXECUTE is granted to PUBLIC/anon. Low risk because it is not definer.
- Fix: `alter function public.records_auto_threshold() set search_path = '';`. Qualify any names in the body.
- Needs a migration: yes.

### SEC-5 (minor): `assistant_take` is SECURITY DEFINER with `search_path=public` (not empty)
- Evidence: live proconfig `{search_path=public}`. It is safe today because anon and authenticated have no CREATE on public (checked). It does break the house rule that every other definer function follows (`search_path=""`).
- Fix: set `search_path = ''` and qualify `public.assistant_usage`.
- Needs a migration: yes.

### SEC-6 (minor/info): `FAMILY_INVITE_TOKEN` secret may still be set, but no deployed code reads it
- Evidence: `git grep` shows no `Deno.env.get('FAMILY_INVITE_TOKEN')` in any function. The deployed `family-names` v14 source (fetched live) uses only per-member `invite_tokens` through `join_claim_peek`. The only references are docs/scripts (`docs/AUTH.md:130`, `scripts/golive-s12.ps1:83` "secrets unset FAMILY_INVITE_TOKEN"). I could not check whether the secret is still set, because the MCP cannot list function secrets.
- Risk while set: none at runtime. If someone rolls `family-names` back to a pre-session-12 tag (`docs/session-12/PLAN.md:254`), the old family-wide link works again. Anyone holding it could then read the full PIN member name and handle list, and the static link never expires.
- Fix: `npx -y supabase@2.122.0 secrets unset FAMILY_INVITE_TOKEN`. That is a config change on the live project and needs Lloyd's OK.

### Advisor notes that are not findings
- `rls_auto_enable()` is executable by anon/authenticated (advisor WARN). It returns `event_trigger`, so PostgREST cannot call it ("trigger functions can only be called as triggers"). Not exploitable. Optional cleanup: revoke execute.
- 43 "authenticated can execute SECURITY DEFINER" WARNs: each one I read checks `auth.uid()` / `is_admin()` / ownership inside, and all have `search_path=""` (except SEC-5). Admin RPCs (`admin_create_invite`, `share_set`, etc.) gate on `is_admin()` internally.
- "RLS enabled, no policy" on assistant_usage, dose_watch_sent, erasure_requests, invite_tokens, pin_attempts, pin_reset_requests: intended (service-role only).
- `pg_net` installed in the public schema: platform default, low risk.
- Leaked password protection is off. PIN logins use 256-bit HMAC-derived passwords and Google users have none, so impact is negligible.

## Verified OK
1. RLS: all 61 public tables have RLS on. Health tables use `records_reader` (self/writer/admin, or a carer only for confirmed rows) and `records_editor`. `people` is readable only by self, creator (SEC-2), carers and admin. `carers` and `share_offers` are written only through `share_set`/`share_accept` (rate-limited, audited, carer must accept). Column grants on `people` exclude auth_user_id, created_by, archived_at and erased_at from UPDATE, and the consent_by trigger guards that column. All 4 storage buckets are private with per-person policies. D-82/D-84 default holds.
2. Edge functions: admin-members and broadcast use `getUser` + `is_admin()` via the caller client. ask and records-extract use `getUser`, records-extract also checks document visibility under the caller's RLS. dose-watch, erase, alerts-ingest and the records-extract sweep check a 32+ character secret with constant-time compare. pin-login and family-names are anonymous by design, rate-limited (login 5 per handle and 30 per IP per 15 min; reset 3 per handle and 10 per IP per hour; join 10 per IP per hour; names and invite peek 20 per IP per 15 min) and give generic errors. ask has a per-user daily cap (`assistant_take`), and its emergency gate runs before the cap. CORS echoes only `ALLOWED_ORIGIN`.
3. Android updater: https-only allowlist (github.com limited to this repo's `/releases/download/`, plus 2 GitHub asset hosts), checked again on every redirect (max 5). Downloads over the declared size are aborted. Exact size and SHA-256 must match before resolve. `install` accepts only the canonical cache file. The receiver is NOT_EXPORTED. The JS `parseLatest` re-checks the URL regex and sha format. Android's same-signature rule for self-updates is a second guard. Residual: URL and sha both come from same-origin `/latest.json` (Cloudflare Pages), so the trust root is Pages plus the GitHub repo, backed by the signing key.
4. Secrets and PII: no service-role key, OpenRouter key, VAPID private key, PATs or PEM private keys in tracked files or git history. The one PEM hit is a test helper that builds a key at runtime. The client reads only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_VAPID_PUBLIC_KEY` and non-secret flags. No Sentry or analytics SDK. Function logs print counts, ids and status only. The 3 client `console.warn`s carry error codes, not PII. Not verified: the contents of `.env.production` / `.env.example` (file read denied by permissions) and the deployed JS bundle.
