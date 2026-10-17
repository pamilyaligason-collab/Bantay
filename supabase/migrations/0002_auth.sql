-- Family Bantay sign-in (contract D-16..D-19). Written only; never applied from this lane.
-- Roles/handles live here; passwords never do (PIN passwords are derived inside Edge Functions).

create table public.app_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  handle text unique check (handle = lower(handle)),
  disabled boolean not null default false,
  created_at timestamptz default now()
);

create table public.invites (
  email text primary key check (email = lower(email)),
  invited_by uuid references auth.users (id),
  created_at timestamptz default now()
);

-- Edge Function only (service role). RLS on with no policies = no REST access at all.
create table public.pin_attempts (
  user_id uuid primary key, -- a user id, or a keyed hash for unknown handles and IPs (no FK on purpose)
  fails int,
  locked_until timestamptz
);

alter table public.app_roles enable row level security;
alter table public.invites enable row level security;
alter table public.pin_attempts enable row level security;

revoke all on public.app_roles, public.invites, public.pin_attempts from anon, authenticated;
grant select on public.app_roles, public.invites to authenticated;

create function public.is_admin() returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.app_roles where user_id = auth.uid() and role = 'admin' and not disabled) $$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- app_roles: a user reads their own row, an admin reads all. Nobody writes over REST (no write grants, no write policies).
create policy app_roles_read on public.app_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy invites_read on public.invites for select to authenticated
  using (public.is_admin());

-- First sign-in RPC: gives a Google member their own people row and a member role. Idempotent.
create function public.ensure_self_person() returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  pid uuid;
  nm text;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select id into pid from public.people where auth_user_id = uid;
  if pid is null then
    select coalesce(nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''), nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(split_part(u.email, '@', 1), ''), 'Me')
      into nm from auth.users u where u.id = uid;
    insert into public.people (auth_user_id, display_name, created_by) values (uid, coalesce(nm, 'Me'), uid)
      on conflict (auth_user_id) do nothing;
    select id into pid from public.people where auth_user_id = uid;
  end if;
  insert into public.app_roles (user_id, role) values (uid, 'member') on conflict (user_id) do nothing;
  return pid;
end $$;

revoke execute on function public.ensure_self_person() from public, anon;
grant execute on function public.ensure_self_person() to authenticated;

-- Before User Created hook. Accepts: an email present in invites (Google), or a synthetic member made by the service role.
-- Anyone else is refused. app_metadata cannot be set by a self-signup, so created_by_admin cannot be forged by a client.
create function public.hook_before_user_created(event jsonb) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  em text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if em like 'm-%@members.bantay.invalid'
     and coalesce(event -> 'user' -> 'app_metadata' ->> 'created_by_admin', '') = 'true' then
    return '{}'::jsonb;
  end if;
  if em <> '' and exists (select 1 from public.invites where email = em) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Sign up is by invitation only.'));
end $$;

revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

-- Atomic attempt counter for pin-login (service role only). Counts BEFORE the PIN is checked, so parallel guesses cannot
-- slip past the limit. Returns the count inside the current window; the caller refuses when fails > lim.
-- The window restarts when it has lapsed; reaching lim starts the lock (win from then).
create function public.pin_try(k uuid, lim int, win interval) returns int
  language plpgsql security definer set search_path = '' as $$
declare f int;
begin
  insert into public.pin_attempts as p (user_id, fails, locked_until) values (k, 1, now() + win)
  on conflict (user_id) do update set
    fails = case when p.locked_until is null or p.locked_until <= now() then 1 else p.fails + 1 end,
    locked_until = case when p.locked_until is null or p.locked_until <= now() then now() + win
                        when p.fails + 1 = lim then now() + win
                        else p.locked_until end
  returning p.fails into f;
  return f;
end $$;

revoke execute on function public.pin_try(uuid, int, interval) from public, anon, authenticated;
grant execute on function public.pin_try(uuid, int, interval) to service_role;
