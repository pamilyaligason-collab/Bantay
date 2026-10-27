-- Family Bantay: per-member single-use invite link (session 12, lane B, D-81). Needs 0002 (app_roles, pin_try, is_admin), 0021 (audit_log), 0034 (export_my_data),
-- 0037 (audit_log action check carries 'invite' and 'join'; this file does NOT restate it, ML-28). Written only; Lloyd applies it. Safe to run twice.
-- Undo: 0038_join_claim.down.sql.
-- Rules
-- * An admin makes ONE link per member who has never signed in (no PIN of their own yet). The plain token is shown once; only its sha256 hex is stored.
-- * The link works once, for 7 days, and a 6th claim try is refused. A new link burns the older one (used_at = now()), so one token is open per member.
-- * Only the pin-login function (service role) claims a link; it hashes the token, checks it, sets the first PIN, then burns it. SQL enforces single use.
-- * invite_tokens holds secrets, never a member's data: RLS on, no client grant, and it is left out of export_my_data.
-- * dose_watch_prune is NOT touched here: 0040 re-creates it once, with the invite_tokens line (ML-06: rows older than 30 days go there).

create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_at timestamptz,
  attempts int not null default 0
);
create index if not exists invite_tokens_user on public.invite_tokens (user_id, created_at desc);
-- ML-09: one open token per member, held by the database and not only by admin_create_invite
create unique index if not exists invite_tokens_one_open on public.invite_tokens (user_id) where used_at is null;
alter table public.invite_tokens enable row level security;
revoke all on public.invite_tokens from anon, authenticated;
grant select, insert, update, delete on public.invite_tokens to service_role;

-- ---------- admin_create_invite: the plain token, once ----------
-- The member must be an active PIN member (handle set, synthetic login) who has never signed in: that is the "no PIN of their own yet" state.
-- Anyone else (Google admin, disabled, signed in before) gets 22023, the same as an unknown id.
create or replace function public.admin_create_invite(p_user uuid) returns text
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); tok text; tid uuid; pid uuid;
begin
  if me is null or not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if public.pin_try(md5('invite:' || me::text)::uuid, 20, interval '1 hour') > 20 then raise exception 'too many invites' using errcode = '53400'; end if;
  if p_user is null or not exists (
       select 1 from public.app_roles a join auth.users u on u.id = a.user_id
        where a.user_id = p_user and a.handle is not null and not a.disabled
          and u.email like 'm-%@members.bantay.invalid' and u.last_sign_in_at is null) then
    raise exception 'member has a PIN or is not a PIN member' using errcode = '22023';
  end if;
  update public.invite_tokens set used_at = now() where user_id = p_user and used_at is null;   -- burn the older link
  tok := translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.invite_tokens (user_id, token_hash, created_by)
    values (p_user, encode(pg_catalog.sha256(convert_to(tok, 'UTF8')), 'hex'), me) returning id into tid;
  select id into pid from public.people where auth_user_id = p_user;
  insert into public.audit_log (actor, tbl, row_id, person_id, action, fields) values (me, 'invite_tokens', tid, pid, 'invite', null);
  return tok;
end $$;
revoke execute on function public.admin_create_invite(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_invite(uuid) to authenticated;

-- ---------- join_claim_peek: what the link says, no counting (family-names ?invite=) ----------
-- state: open | used (claimed or replaced) | ended (past 7 days) | tries (5 claim tries used). Only an open link carries a name. An unknown hash returns no row.
-- The token is 256 random bits, so telling these states apart lets nobody guess a link.
create or replace function public.join_claim_peek(p_hash text) returns table (state text, user_id uuid, handle text, display_name text)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return; end if;
  return query
    select case when t.used_at is not null then 'used' when t.expires_at <= now() then 'ended' when t.attempts >= 5 then 'tries' else 'open' end,
           case when t.used_at is null and t.expires_at > now() and t.attempts < 5 then t.user_id end,
           case when t.used_at is null and t.expires_at > now() and t.attempts < 5 then a.handle end,
           case when t.used_at is null and t.expires_at > now() and t.attempts < 5 then p.display_name end
      from public.invite_tokens t
      join public.app_roles a on a.user_id = t.user_id and not a.disabled and a.handle is not null
      left join public.people p on p.auth_user_id = t.user_id and p.archived_at is null
     where t.token_hash = p_hash;
end $$;
revoke execute on function public.join_claim_peek(text) from public, anon, authenticated;
grant execute on function public.join_claim_peek(text) to service_role;

-- ---------- join_claim_check: one counted try; no row after 5 tries, or once burned or ended ----------
create or replace function public.join_claim_check(p_hash text) returns table (user_id uuid, handle text, first_name text)
  language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return; end if;
  -- one statement: the count and the test cannot race
  update public.invite_tokens t set attempts = t.attempts + 1
   where t.token_hash = p_hash and t.used_at is null and t.expires_at > now() and t.attempts < 5
  returning t.user_id into uid;
  if uid is null then return; end if;
  return query
    select a.user_id, a.handle, split_part(btrim(coalesce(p.display_name, '')), ' ', 1)
      from public.app_roles a left join public.people p on p.auth_user_id = a.user_id
     where a.user_id = uid and not a.disabled and a.handle is not null;
end $$;
revoke execute on function public.join_claim_check(text) from public, anon, authenticated;
grant execute on function public.join_claim_check(text) to service_role;

-- ---------- join_claim_use: single use, enforced here ----------
create or replace function public.join_claim_use(p_hash text) returns boolean
  language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  update public.invite_tokens set used_at = now() where token_hash = p_hash and used_at is null and expires_at > now();
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke execute on function public.join_claim_use(text) from public, anon, authenticated;
grant execute on function public.join_claim_use(text) to service_role;

-- ---------- export_my_data: same body as 0034, minus invite_tokens (it holds link secrets, not the member's data) ----------
create or replace function public.export_my_data() returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pid uuid; out jsonb := '{}'::jsonb; r record; rows jsonb;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if public.pin_try(md5('export:' || me::text)::uuid, 5, interval '1 hour') > 5 then raise exception 'too many exports' using errcode = '53400'; end if;
  select id into pid from public.people where auth_user_id = me;
  if pid is null then return out; end if;
  out := jsonb_build_object('person', (select to_jsonb(p) from public.people p where p.id = pid));
  for r in select t.tbl, string_agg(format('x.%I = %L::uuid', t.col, case when t.kind = 'person' then pid else me end), ' or ' order by t.col) as cond
             from public.erasure_targets() t where t.tbl not in ('pin_reset_requests', 'pin_attempts', 'invite_tokens') group by t.tbl order by t.tbl loop
    execute format('select coalesce(jsonb_agg(case when %L = ''push_subscriptions'' then to_jsonb(x) - ''p256dh'' - ''auth'' else to_jsonb(x) end), ''[]''::jsonb) from public.%I x where %s', r.tbl, r.tbl, r.cond) into rows;
    out := out || jsonb_build_object(r.tbl, rows);
  end loop;
  return out;
end $$;
revoke execute on function public.export_my_data() from public, anon, authenticated, service_role;
grant execute on function public.export_my_data() to authenticated;
