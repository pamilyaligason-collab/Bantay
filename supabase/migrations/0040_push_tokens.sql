-- Family Bantay: FCM push tokens for the Android app (session 12, lane E, D-85). Needs 0002 (app_roles, pin_try) and 0003 (RLS pattern).
-- One row per phone token. The app registers through push_token_claim(); dose-watch and broadcast (service role) read the tokens and send
-- a template-only FCM message (B-7: never a name, reading or place). web push (push_subscriptions) is untouched.
-- This is the ONLY migration of the release that re-creates dose_watch_prune() (adds the invite_tokens and push_tokens lines to the 0030 body).
-- Written only; Lloyd applies it. Safe to run twice. Undo: 0040_push_tokens.down.sql.

create table if not exists public.push_tokens (
  token text primary key check (length(token) between 20 and 4096),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'android' check (platform in ('android')),
  app_version text check (app_version is null or length(app_version) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_ok_at timestamptz,                  -- the last FCM send Google accepted
  failed int not null default 0            -- sends that failed for a reason other than "unregistered"; 5 = pruned
);
create index if not exists push_tokens_user on public.push_tokens (user_id);

-- RLS: a user sees, adds, changes (app_version, updated_at only) and removes only their own rows. service_role does the sending.
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
grant select, insert, delete on public.push_tokens to authenticated;
grant update (app_version, updated_at) on public.push_tokens to authenticated;
grant select, insert, update, delete on public.push_tokens to service_role;
drop policy if exists push_tokens_select on public.push_tokens;
drop policy if exists push_tokens_insert on public.push_tokens;
drop policy if exists push_tokens_update on public.push_tokens;
drop policy if exists push_tokens_delete on public.push_tokens;
create policy push_tokens_select on public.push_tokens for select to authenticated using (user_id = auth.uid());
create policy push_tokens_insert on public.push_tokens for insert to authenticated with check (user_id = auth.uid());
create policy push_tokens_update on public.push_tokens for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_tokens_delete on public.push_tokens for delete to authenticated using (user_id = auth.uid());

-- Retention (ML-06): a user keeps their 3 newest tokens (a new phone, a reinstall); older ones go on every insert.
create or replace function public.push_tokens_cap() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       delete from public.push_tokens t
        where t.user_id = new.user_id
          and t.token in (select o.token from public.push_tokens o where o.user_id = new.user_id
                           order by o.updated_at desc, o.created_at desc, o.token desc offset 3);
       return null;
     end $$;
revoke execute on function public.push_tokens_cap() from public, anon, authenticated, service_role;
drop trigger if exists push_tokens_cap on public.push_tokens;
create trigger push_tokens_cap after insert on public.push_tokens for each row execute function public.push_tokens_cap();

-- The app registers here (one phone, one owner). A token another account left on a shared phone is removed first, so the
-- last person to sign in is the only one who gets that phone's pushes (ML-07). A disabled account cannot register (ML-33).
create or replace function public.push_token_claim(p_token text, p_app_version text) returns void
  language plpgsql security definer set search_path = '' as
  $$ declare me uuid := auth.uid();
     begin
       if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
       if exists (select 1 from public.app_roles r where r.user_id = me and r.disabled) then
         raise exception 'account is off' using errcode = '42501';
       end if;
       if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then
         raise exception 'bad token' using errcode = '22023';
       end if;
       if public.pin_try(md5('push:' || me::text)::uuid, 60, interval '1 hour') > 60 then
         raise exception 'too many tries' using errcode = '53400';
       end if;
       delete from public.push_tokens where token = p_token and user_id <> me;
       insert into public.push_tokens as t (token, user_id, platform, app_version)
         values (p_token, me, 'android', left(p_app_version, 32))
         on conflict (token) do update set user_id = me, app_version = left(p_app_version, 32), updated_at = now(), failed = 0;
     end $$;
revoke execute on function public.push_token_claim(text, text) from public, anon, service_role;
grant execute on function public.push_token_claim(text, text) to authenticated;

-- Housekeeping the dose-watch function calls each run (final body of the release, ML-06). 0030 body, plus:
--   invite_tokens older than 30 days (table is 0038; read through to_regclass so this runs before and after it)
--   push_tokens not refreshed for 60 days, or failed 5 times.
create or replace function public.dose_watch_prune() returns integer
  language plpgsql security definer set search_path = '' as
  $$ declare n int; begin
       delete from public.dose_watch_sent where sent_at < now() - interval '7 days';
       get diagnostics n = row_count;
       delete from public.carer_alerts where created_at < now() - interval '30 days';
       if to_regclass('public.invite_tokens') is not null then
         execute 'delete from public.invite_tokens where created_at < now() - interval ''30 days''';
       end if;
       delete from public.push_tokens where updated_at < now() - interval '60 days' or failed >= 5;
       return n;
     end $$;
revoke execute on function public.dose_watch_prune() from public, anon, authenticated;
grant execute on function public.dose_watch_prune() to service_role;
