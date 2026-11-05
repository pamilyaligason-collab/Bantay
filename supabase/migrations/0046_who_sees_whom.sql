-- Family Bantay D-109: who sees whom (lane S). Needs 0001 (carers, people, is_self, is_writer_of), 0002 (app_roles, is_admin, pin_try), 0003 (activity), 0004 (is_person_creator),
-- 0021 (audit_log), 0022 (people.archived_at, people_insert), 0030 (carer_alerts), 0034 (request_erasure) and 0037 (share_set, share_offers, my_viewers).
-- Written only; the owner applies it, and runs the two apply-time lines (the owner and people.kind) in the same session. Neither line is in this file, so no id or name enters the repo.
-- Safe to run twice. Undo: 0046_who_sees_whom.down.sql. Release order: deploy dose-watch and broadcast first (new templates), then this file, then the two lines.
--
-- Rules
-- * One family owner (app_roles.is_owner, set by one SQL line at apply time). Unset means nobody can set other people's links: fails closed.
-- * A link starts at once. share_set writes carers directly (no offer, no acceptance); share_offers and share_accept stay dormant. The person is told afterwards (share_added)
--   and can Stop it; the viewer is told (share_given). Alert refs carry the link's added_at, so add, stop, add tells them again.
-- * Who may set links: the owner for anyone; a person on their own record; a writer carer of a no-login person (adds and removes read-only viewers only; a link with edit access is removed
--   only by the owner or the person). Other admins may not. The shared family account (people.kind 'shared') never gets a link, and the owner is never offered as a viewer.
-- * ML-08, stated exception: person_viewers and share_candidates are read-only, gated (owner, own record, writer carer) and have no cooldown. share_set keeps its 30 an hour limit.
-- * The owner row is guarded: it cannot be disabled, demoted, un-owned or deleted by any writer, the service role included. A handle change still works.
-- * The owner reads meds_taken, activity and consults of everyone (readings, records, nutrition and phone health already open to an admin), so the owner's switch shows real data.
-- * Part 2 of the plan (narrowing the other admins' server reads) is NOT built (the owner chose option A).
begin;

-- ---------- the owner ----------
alter table public.app_roles add column if not exists is_owner boolean not null default false;
create unique index if not exists app_roles_one_owner on public.app_roles (is_owner) where is_owner;

create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.app_roles where user_id = auth.uid() and is_owner and not disabled) $$;
revoke execute on function public.is_owner() from public, anon, authenticated, service_role;
grant execute on function public.is_owner() to authenticated;

-- An owner row can only change its handle. Fires for every writer (service role and the table owner too); the unique index above keeps a second owner out,
-- and nobody can make a disabled or non-admin row the owner.
-- Runbook, handing the owner over (as postgres, in one transaction): alter table public.app_roles disable trigger app_roles_owner_guard; update the current owner row set is_owner = false;
-- update the new owner's row (an enabled admin) set is_owner = true; alter table public.app_roles enable trigger app_roles_owner_guard; commit. Check that exactly one row has is_owner before the commit.
create or replace function public.app_roles_owner_guard() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_owner then raise exception 'the family owner cannot be removed' using errcode = '42501'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.is_owner and (new.is_owner is not true or new.disabled or new.role is distinct from old.role or new.user_id is distinct from old.user_id) then
      raise exception 'the family owner cannot be disabled, demoted or changed' using errcode = '42501';
    end if;
  end if;
  if new.is_owner and (new.disabled or new.role is distinct from 'admin') then
    raise exception 'the family owner must be an enabled admin' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.app_roles_owner_guard() from public, anon, authenticated, service_role;
drop trigger if exists app_roles_owner_guard on public.app_roles;
create trigger app_roles_owner_guard before insert or update or delete on public.app_roles for each row execute function public.app_roles_owner_guard();

-- erase_user_data sets app_roles.disabled and would fail on every cron run for the owner, so the owner cannot start an erasure: hand over ownership first.
-- 0034 body plus the owner check; grants restated (ML-21).
create or replace function public.request_erasure() returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c timestamptz;
begin
  if me is null or not exists (select 1 from public.people where auth_user_id = me) then raise exception 'not allowed' using errcode = '42501'; end if;
  if public.is_owner() then raise exception 'hand over ownership first' using errcode = '42501'; end if;
  -- one open request per user (pk); a finished one may be started again
  insert into public.erasure_requests (user_id) values (me)
    on conflict (user_id) do update set requested_at = now(), cancel_until = now() + interval '7 days', done_at = null
    where public.erasure_requests.done_at is not null;
  select cancel_until into c from public.erasure_requests where user_id = me;
  return c;
end $$;
revoke execute on function public.request_erasure() from public, anon, authenticated, service_role;
grant execute on function public.request_erasure() to authenticated;

-- ---------- what the owner can read ----------
-- Admins already read readings (0008), the records tables (records_editor), nutrition (0024) and phone health (0032). These three are the tables a link gives that an admin could not read.
drop policy if exists meds_taken_owner_read on public.meds_taken;
create policy meds_taken_owner_read on public.meds_taken for select to authenticated using (public.is_owner());
drop policy if exists activity_owner_read on public.activity;
create policy activity_owner_read on public.activity for select to authenticated using (public.is_owner());
drop policy if exists consults_owner_read on public.consults;
create policy consults_owner_read on public.consults for select to authenticated using (public.is_owner());

-- ---------- people.kind: 'shared' marks the shared family account ----------
-- No client writes it: update is a column grant (0010, 0013, 0034) that does not name kind, and the insert grant is table wide, so the insert policy (0022 body) now also needs kind null.
-- The account is marked by one SQL line at apply time.
alter table public.people add column if not exists kind text;
drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert to authenticated
  with check (created_by = auth.uid() and (auth_user_id = auth.uid() or auth_user_id is null) and archived_at is null and archived_by is null and kind is null);

-- ---------- activity.updated_at: a late step total reaches every phone ----------
-- The first run adds the column and sets each old row to its own created_at (never one shared time: the phone pulls 1000 rows a page by updated_at, and one timestamp on every
-- row would stall that cursor). Only a row with no created_at gets now(). This runs before the stamping trigger exists. A second run finds the column and skips all of it.
-- The trigger then stamps every insert and update itself, so a client cannot set it (the insert grant is table wide) and a cursor on it never skips a row.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'activity' and column_name = 'updated_at') then
    alter table public.activity add column updated_at timestamptz;
    update public.activity set updated_at = coalesce(created_at, now());
    alter table public.activity alter column updated_at set default now();
    alter table public.activity alter column updated_at set not null;
  end if;
end $$;
create index if not exists activity_updated_at on public.activity (updated_at);
create or replace function public.activity_stamp_updated_at() returns trigger
  language plpgsql set search_path = '' as
  $$ begin new.updated_at := clock_timestamp(); return new; end $$;
revoke execute on function public.activity_stamp_updated_at() from public, anon, authenticated, service_role;
drop trigger if exists activity_updated_at on public.activity;
create trigger activity_updated_at before insert or update on public.activity for each row execute function public.activity_stamp_updated_at();

-- ---------- share_set: a link starts at once ----------
-- Returns 'added' (new link), 'updated' (can_write of an existing link changed), 'removed' or 'unchanged'; never 'pending'.
-- Who may call: the owner for anyone; the person on their own record; a writer carer of a person with no login (adds and removes read-only viewers, never writers).
-- 42501 not allowed; 22023 bad target; 53400 more than 30 changes in an hour. can_write is set only by the owner, and only on a person with no login.
-- The creator link of a no-login person is never lowered or removed (0004 guard). Old bundles read 'added' as 'unchanged'.
create or replace function public.share_set(p_person uuid, p_carer uuid, p_can_write boolean, p_on boolean) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  login uuid;
  own boolean;
  nologin boolean;
  guarded boolean;
  cw boolean := coalesce(p_can_write, false);
  cur public.carers;
  added timestamptz;
  n int; m int;
begin
  if me is null or exists (select 1 from public.app_roles where user_id = me and disabled) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_person is null or p_carer is null or p_on is null then raise exception 'bad target' using errcode = '22023'; end if;
  if public.pin_try(md5('share:' || me::text)::uuid, 30, interval '1 hour') > 30 then raise exception 'too many changes' using errcode = '53400'; end if;
  select pe.auth_user_id into login from public.people pe where pe.id = p_person and pe.archived_at is null;
  if not found then raise exception 'bad target' using errcode = '22023'; end if;
  nologin := login is null;
  guarded := nologin and public.is_person_creator(p_person, p_carer); -- the writer link that keeps a dependent from being orphaned
  own := public.is_owner();
  -- coalesce: login = me is null for a no-login person, and a null in this test would let the caller through (0037 had that hole)
  if not (own or coalesce(login = me, false) or (nologin and public.is_writer_of(p_person))) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_on and cw and not (own and nologin) then raise exception 'not allowed' using errcode = '42501'; end if;

  if p_on then
    if p_carer = me or p_carer is not distinct from login
       or not exists (select 1 from public.app_roles r where r.user_id = p_carer and not r.disabled)
       or exists (select 1 from public.people sp where sp.auth_user_id = p_carer and sp.kind = 'shared') -- the shared family account never gets a link
    then raise exception 'bad target' using errcode = '22023'; end if;
    select * into cur from public.carers c where c.person_id = p_person and c.carer_id = p_carer;
    if found then
      if own and cur.can_write is distinct from cw then  -- only the owner changes edit access of a link that exists
        if guarded and not cw then raise exception 'not allowed' using errcode = '42501'; end if; -- never leave a no-login person without a writer
        update public.carers c set can_write = cw where c.person_id = p_person and c.carer_id = p_carer;
        insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_add', array['can_write']);
        return 'updated';
      end if;
      return 'unchanged';
    end if;
    -- the owner reads everyone through is_owner() and never needs a new link (existing owner links above stay as they are)
    if exists (select 1 from public.app_roles r where r.user_id = p_carer and r.is_owner) then raise exception 'bad target' using errcode = '22023'; end if;
    added := clock_timestamp();
    insert into public.carers (carer_id, person_id, can_write, added_by, added_at) values (p_carer, p_person, cw, me, added);
    delete from public.share_offers o where o.person_id = p_person and o.carer_id = p_carer; -- an old pending offer for the same pair is superseded
    insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_add', array['can_write']);
    insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
      values (p_person, p_carer, 'share', 'share_given', p_person::text || ':' || p_carer::text || ':given:' || extract(epoch from added)::text)
      on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
    -- No name (B-7). share_added ("Someone new can see your records") goes to the person with a login; share_added_carer to the writer carers of a no-login person.
    -- Never to the one who added it, never to the new viewer.
    -- expires_at: 30 days, not the 7-day default, so a member who is away a week and gets no push is still told when they open Bantay (dose_watch_prune deletes at 30 days).
    insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref, expires_at)
      select p_person, t.uid, 'share', t.tpl, p_person::text || ':' || p_carer::text || ':added:' || extract(epoch from added)::text, now() + interval '30 days'
        from (select login as uid, 'share_added' as tpl where login is not null
              union all
              select c.carer_id, 'share_added_carer' from public.carers c where nologin and c.person_id = p_person and c.can_write) t
       where t.uid is distinct from me and t.uid is distinct from p_carer
      on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
    return 'added';
  end if;

  -- Only the no-login creator link is protected. The person themself and the owner may remove any other viewer, a claimed record's creator link included.
  if guarded or (p_carer = me and not own and login is distinct from me) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- a writer carer of a no-login person removes read-only viewers only; a link with edit access goes only by the owner or the person
  if not (own or coalesce(login = me, false)) and exists (select 1 from public.carers c where c.person_id = p_person and c.carer_id = p_carer and c.can_write) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.carers c where c.person_id = p_person and c.carer_id = p_carer;
  get diagnostics n = row_count;
  delete from public.share_offers o where o.person_id = p_person and o.carer_id = p_carer;
  get diagnostics m = row_count;
  if n + m = 0 then return 'unchanged'; end if;
  insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_remove', array['can_write']);
  if n > 0 then
    insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
      values (p_person, p_carer, 'share', 'share_off', p_person::text || ':' || p_carer::text || ':off:' || extract(epoch from clock_timestamp())::text)
      on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
  end if;
  return 'removed';
end $$;
revoke execute on function public.share_set(uuid, uuid, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.share_set(uuid, uuid, boolean, boolean) to authenticated;

-- ---------- read functions for one person's list, gated like share_set ----------
-- Same gate as share_set: the owner for anyone, a person on their own record, a writer carer of a no-login person. 42501 not allowed; 22023 unknown or archived person.
-- A refusal is an error and not an empty list, so the client can tell "not allowed" from "nobody sees this".
-- person_viewers has the columns of my_viewers(); pending is always false; added_by_admin means "added by the family owner" (the name stays for the client).
-- It leaves out the owner's own rows; a real writer link of the owner stays in carers, untouched.
create or replace function public.person_viewers(p_person uuid)
  returns table (carer_user_id uuid, display_name text, can_write boolean, pending boolean, added_by_admin boolean, added_at timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := auth.uid(); login uuid;
begin
  if me is null or exists (select 1 from public.app_roles d where d.user_id = me and d.disabled) then raise exception 'not allowed' using errcode = '42501'; end if;
  select pe.auth_user_id into login from public.people pe where pe.id = p_person and pe.archived_at is null;
  if not found then raise exception 'bad target' using errcode = '22023'; end if;
  if not (public.is_owner() or coalesce(login = me, false) or (login is null and public.is_writer_of(p_person))) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select c.carer_id, coalesce(cp.display_name, 'Family member'), c.can_write, false,
           c.added_by is not null and c.added_by is distinct from me and exists (select 1 from public.app_roles a where a.user_id = c.added_by and a.is_owner),
           c.added_at
      from public.carers c
      left join public.people cp on cp.auth_user_id = c.carer_id
     where c.person_id = p_person
       and not exists (select 1 from public.app_roles o where o.user_id = c.carer_id and o.is_owner) -- the owner has a fixed line in the app; the link itself stays in carers
     order by cp.display_name;
end $$;
revoke execute on function public.person_viewers(uuid) from public, anon, authenticated, service_role;
grant execute on function public.person_viewers(uuid) to authenticated;

-- Members this person could be shared with: active, with a login, not the person themself, not already a viewer, not the owner (for every caller: the owner never needs a link)
-- and not the shared family account (people.kind 'shared').
create or replace function public.share_candidates(p_person uuid)
  returns table (carer_user_id uuid, person_id uuid, display_name text)
  language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := auth.uid(); login uuid; own boolean;
begin
  if me is null or exists (select 1 from public.app_roles d where d.user_id = me and d.disabled) then raise exception 'not allowed' using errcode = '42501'; end if;
  select pe.auth_user_id into login from public.people pe where pe.id = p_person and pe.archived_at is null;
  if not found then raise exception 'bad target' using errcode = '22023'; end if;
  own := public.is_owner();
  if not (own or coalesce(login = me, false) or (login is null and public.is_writer_of(p_person))) then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.auth_user_id, p.id, p.display_name
      from public.people p
      join public.app_roles r on r.user_id = p.auth_user_id and not r.disabled
     where p.archived_at is null
       and p.auth_user_id is distinct from login
       and not r.is_owner
       and p.kind is distinct from 'shared'
       and not exists (select 1 from public.carers c where c.person_id = p_person and c.carer_id = p.auth_user_id)
     order by p.display_name;
end $$;
revoke execute on function public.share_candidates(uuid) from public, anon, authenticated, service_role;
grant execute on function public.share_candidates(uuid) to authenticated;

commit;
