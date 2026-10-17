# Contract: sign-in, sync and admin (D-16 to D-19, 2026-10-17)

Three lanes build against these fixed names. Change them only through the orchestrator.

## Sign-in (lane A1)
- Two ways in, both Supabase Auth:
  1. **Google** (Supabase OAuth). Only emails an admin has invited may sign up: a Before User Created auth hook
     checks `public.invites(email)`. Anyone else is refused.
  2. **Handle + 6-digit PIN** for members without Google (elderly, kids). The admin creates the member and sets the PIN.
     Supabase user email is synthetic `m-<uuid>@members.bantay.invalid`; password = base64url(HMAC-SHA256(PIN_PEPPER, user_id + ':' + pin)),
     derived only inside Edge Functions. PIN_PEPPER is an Edge Function secret (Lloyd sets it). Lockout: 5 wrong PINs -> 15 minutes.
- Edge Functions (Deno, `supabase/functions/`): `pin-login` (handle+pin -> session), `admin-members` (admin only: create member,
  set/reset PIN, set handle, disable/enable, link Google email = add invite, set role). Never log PINs or derived passwords.
- Biometrics later (D-18): WebAuthn passkey to unlock on a device after a first sign-in. Not built now.
- First admin: Lloyd signs in with Google once, then runs one SQL line (in his deploy block) to make his user admin.

## Shared SQL (migration `0002_auth.sql`, lane A1)
- `public.app_roles(user_id uuid pk references auth.users on delete cascade, role text not null check (role in ('admin','member')),
   handle text unique, disabled boolean not null default false, created_at timestamptz default now())`
- `public.invites(email text pk, invited_by uuid references auth.users, created_at timestamptz default now())`
- `public.pin_attempts(user_id uuid pk, fails int, locked_until timestamptz)` (Edge Function only; RLS on, no policies)
- `public.is_admin() returns boolean` security definer, search_path '' : exists app_roles where user_id = auth.uid() and role = 'admin' and not disabled.
- On a member's first sign-in a `people` row with `auth_user_id = auth.uid()` exists (admin-members creates it for PIN members; a trigger or
  first-sign-in RPC `ensure_self_person()` creates it for Google members).

## Client session (lane A1 owns `src/features/auth/`)
`src/features/auth/session.ts` exports (stub on main, A1 implements):
- `getAccessToken(): Promise<string | null>`
- `getMember(): Promise<{ userId: string; personId: string | null; role: 'admin' | 'member'; handle: string | null } | null>`
- `onAuthChange(cb: () => void): () => void`
- `signOut(): Promise<void>`
Uses `@supabase/supabase-js` with VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY. `<AuthGate>` wraps `<OnboardingGate>` in main.tsx.

## Sync (lane A2 owns `src/features/sync/` and `0003_sync.sql`)
- Drains the L0 outbox (`src/db.ts` drain) to Supabase REST with the session token; pulls the member's own rows down.
- Table allowlist (outbox `table` -> Supabase table): `readings`, `consults`, `meds_taken`, `activity`, `push_subscriptions`,
  `usage_events`, `safety_overrides`. Anything else stays in the outbox and is reported, never sent.
- `0003_sync.sql` creates `meds_taken`, `activity`, `push_subscriptions`, `safety_overrides` with RLS in the same style as 0001
  (person-owned, carer read, writer write; push_subscriptions owned by user_id; safety_overrides: everyone signed in reads, admin writes).
- camelCase client fields map to snake_case columns in one place (`src/features/sync/tables.ts`).

## Admin (lane A3 owns `src/features/admin/` and `0004_admin.sql`)
- `usage_events(id bigint identity, user_id uuid default auth.uid(), at timestamptz default now(), kind text, name text, app_version text)`
  insert own only; select admin only. **No health values ever**: `kind` in ('screen','action','error'), `name` from a fixed allowlist
  in `src/features/admin/events.ts` (`track(kind, name)` validates and enqueues `usage_events`).
- Members are told on onboarding: "Your admin can see which screens you use, never your health values."
- `<AdminScreen/>` exported from `src/features/admin/`, shown at `#admin` only when `getMember().role === 'admin'` (orchestrator wires the route).
- Admin features, first cut: members (add, handle, PIN reset, role, disable, Google invite, carer links with can_write), usage insights
  (active 7/30 days, last seen, top screens, alerts on/off, sensors on, assistant messages vs cap, outbox backlog per device),
  safety data editing (hotlines, places -> safety_overrides), safety broadcast (push template only, via n8n webhook, B-7),
  import status per person (counts only), system health (news feed last fetch, assistant 5xx count).
