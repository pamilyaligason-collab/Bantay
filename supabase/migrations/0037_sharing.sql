-- Family Bantay: server-side sharing (session 12, lane A, D-80/D-82/D-84). Needs 0001 (carers, is_self, is_writer_of), 0002 (is_admin, pin_try, app_roles),
-- 0004 (is_person_creator), 0021 (audit_log), 0022 (people.archived_at), 0030 (carer_alerts) and 0034 (audit_log action list).
-- Written only; Lloyd applies it. Safe to run twice. Undo: 0037_sharing.down.sql.
--
-- Rules
-- * Records are private until shared. A share is an OFFER (share_offers) until the carer accepts; only then does a carers row exist. So every carers row is a
--   live, accepted link and every existing policy and function that reads carers (is_carer_of, is_writer_of, notify_family, raise_mood_alert, phone_health_carer,
--   dose-watch) needs no change: a pending carer reads 0 rows and gets 0 alerts.
-- * Nobody writes carers or share_offers over REST any more. share_set / share_accept (security definer, 30 changes an hour each) are the only app writers.
--   link_creator() (0001) still links the creator of a no-login person, and the service role still can.
-- * A member shares their own records (read only). Only an admin makes a carer who can edit (can_write), and only for a person with no login.
--   Admins can add and remove viewers for anyone (the carer still has to accept, and the person is told when access starts).
-- * The creator of a no-login person is never unlinked, so a dependent is never orphaned.
-- * Rows carry names nowhere new: alert rows hold a template id and a dedupe ref only (B-7).
begin;

-- Who added a link and when (kept when an offer is accepted). Old rows stay null: they were made before this rule.
alter table public.carers add column if not exists added_by uuid references auth.users (id) on delete set null;
alter table public.carers add column if not exists added_at timestamptz;
alter table public.carers alter column added_at set default now();

-- A pending offer. One per (person, carer), so the table cannot grow without bound; the carer accepts or declines, the person or an admin cancels.
create table if not exists public.share_offers (
  person_id uuid not null references public.people (id) on delete cascade,
  carer_id uuid not null references auth.users (id) on delete cascade,
  can_write boolean not null default false,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (person_id, carer_id)
);
create index if not exists share_offers_carer on public.share_offers (carer_id);
alter table public.share_offers enable row level security;
revoke all on public.share_offers from anon, authenticated;
grant select on public.share_offers to authenticated;
grant select, insert, update, delete on public.share_offers to service_role;
drop policy if exists share_offers_read on public.share_offers;
create policy share_offers_read on public.share_offers for select to authenticated
  using (carer_id = auth.uid() or public.is_self(person_id) or public.is_admin());

-- No client writes to carers (0001 carers_*, 0004 carers_admin_*). carers_read and carers_admin_read stay.
drop policy if exists carers_insert on public.carers;
drop policy if exists carers_update on public.carers;
drop policy if exists carers_delete on public.carers;
drop policy if exists carers_admin_insert on public.carers;
drop policy if exists carers_admin_update on public.carers;
drop policy if exists carers_admin_delete on public.carers;
revoke insert, update, delete on public.carers from authenticated;

-- Whitelists (ML-28): carer_alerts.kind gains share, rollcall, kudos; audit_log.action gains the sharing and invite actions.
alter table public.carer_alerts drop constraint if exists carer_alerts_kind_check;
alter table public.carer_alerts add constraint carer_alerts_kind_check
  check (kind in ('dose_missed', 'review_open', 'phone_health', 'reading_high', 'mood_unwell', 'hazard', 'sos', 'sos_cancel', 'digest', 'pin_approve', 'pin_changed', 'system', 'share', 'rollcall', 'kudos'));
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view', 'pin_reset', 'share_add', 'share_remove', 'share_accept', 'invite', 'join'));

-- Offer, change or stop a share. Returns 'pending' (new offer), 'removed', or 'unchanged'.
-- Who may call: the person, an admin, or a writer carer of a person with no login (that last one adds viewers, never writers).
-- 42501 not allowed; 22023 bad target; 53400 more than 30 changes in an hour.
create or replace function public.share_set(p_person uuid, p_carer uuid, p_can_write boolean, p_on boolean) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  owner uuid;
  adm boolean;
  nologin boolean;
  cw boolean := coalesce(p_can_write, false);
  cur public.carers;
  ofr public.share_offers;
  n int; m int;
begin
  if me is null or exists (select 1 from public.app_roles where user_id = me and disabled) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_person is null or p_carer is null or p_on is null then raise exception 'bad target' using errcode = '22023'; end if;
  if public.pin_try(md5('share:' || me::text)::uuid, 30, interval '1 hour') > 30 then raise exception 'too many changes' using errcode = '53400'; end if;
  select pe.auth_user_id into owner from public.people pe where pe.id = p_person and pe.archived_at is null;
  if not found then raise exception 'bad target' using errcode = '22023'; end if;
  nologin := owner is null;
  adm := public.is_admin();
  if not (adm or owner = me or (nologin and public.is_writer_of(p_person))) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_on and cw and not (adm and nologin) then raise exception 'not allowed' using errcode = '42501'; end if;

  if p_on then
    if p_carer = me or p_carer is not distinct from owner
       or not exists (select 1 from public.app_roles r where r.user_id = p_carer and not r.disabled) then raise exception 'bad target' using errcode = '22023'; end if;
    select * into cur from public.carers c where c.person_id = p_person and c.carer_id = p_carer;
    if found then
      if adm and cur.can_write is distinct from cw then  -- an accepted link stays accepted; only an admin changes edit access
        update public.carers c set can_write = cw where c.person_id = p_person and c.carer_id = p_carer;
        insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_add', array['can_write']);
      end if;
      return 'unchanged';
    end if;
    select * into ofr from public.share_offers o where o.person_id = p_person and o.carer_id = p_carer;
    if found then
      if adm and ofr.can_write is distinct from cw then
        update public.share_offers o set can_write = cw where o.person_id = p_person and o.carer_id = p_carer;
        insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_add', array['can_write']);
      end if;
      return 'unchanged';
    end if;
    insert into public.share_offers (person_id, carer_id, can_write, added_by) values (p_person, p_carer, cw, me);
    insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_add', array['can_write']);
    insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
      values (p_person, p_carer, 'share', 'share_offer', p_person::text || ':' || p_carer::text || ':' || floor(extract(epoch from now()) / 3600)::bigint::text)
      on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
    return 'pending';
  end if;

  if p_carer = me or public.is_person_creator(p_person, p_carer) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.carers c where c.person_id = p_person and c.carer_id = p_carer;
  get diagnostics n = row_count;
  delete from public.share_offers o where o.person_id = p_person and o.carer_id = p_carer;
  get diagnostics m = row_count;
  if n + m = 0 then return 'unchanged'; end if;
  insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_remove', array['can_write']);
  if n > 0 then
    insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
      values (p_person, p_carer, 'share', 'share_off', p_person::text || ':' || p_carer::text || ':off:' || floor(extract(epoch from now()) / 3600)::bigint::text)
      on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
  end if;
  return 'removed';
end $$;
revoke execute on function public.share_set(uuid, uuid, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function public.share_set(uuid, uuid, boolean, boolean) to authenticated;

-- The carer answers an offer made to them. true when an offer was found. Accept moves it into carers and tells the person; decline just deletes it.
create or replace function public.share_accept(p_person uuid, p_accept boolean) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  ofr public.share_offers;
  owner uuid;
begin
  if me is null or exists (select 1 from public.app_roles where user_id = me and disabled) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_person is null or p_accept is null then raise exception 'bad target' using errcode = '22023'; end if;
  if public.pin_try(md5('share_accept:' || me::text)::uuid, 30, interval '1 hour') > 30 then raise exception 'too many changes' using errcode = '53400'; end if;
  delete from public.share_offers o where o.person_id = p_person and o.carer_id = me returning * into ofr;
  if not found then return false; end if;
  if p_accept then
    insert into public.carers (carer_id, person_id, can_write, added_by, added_at) values (me, p_person, ofr.can_write, ofr.added_by, ofr.added_at)
      on conflict (carer_id, person_id) do nothing;
    insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_accept', array['can_write']);
    select pe.auth_user_id into owner from public.people pe where pe.id = p_person;
    if owner is not null then
      insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
        values (p_person, owner, 'share', 'share_on', p_person::text || ':' || me::text || ':on:' || floor(extract(epoch from now()) / 3600)::bigint::text)
        on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
    end if;
  else
    insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_remove', array['can_write']);
  end if;
  return true;
end $$;
revoke execute on function public.share_accept(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.share_accept(uuid, boolean) to authenticated;

-- "Who can see my records": my viewers, accepted and pending, with their names (a security-definer list, so no member reads another member's row).
create or replace function public.my_viewers()
  returns table (carer_user_id uuid, display_name text, can_write boolean, pending boolean, added_by_admin boolean, added_at timestamptz)
  language sql stable security definer set search_path = '' as $$
  select v.carer_id, coalesce(cp.display_name, 'Family member'), v.can_write, v.pending,
         v.added_by is not null and v.added_by is distinct from auth.uid() and exists (select 1 from public.app_roles a where a.user_id = v.added_by and a.role = 'admin'),
         v.added_at
  from (
    select c.carer_id, c.can_write, false as pending, c.added_by, c.added_at, c.person_id from public.carers c
    union all
    select o.carer_id, o.can_write, true, o.added_by, o.added_at, o.person_id from public.share_offers o
  ) v
  join public.people me on me.id = v.person_id and me.auth_user_id = auth.uid() and me.archived_at is null
  left join public.people cp on cp.auth_user_id = v.carer_id
  where not exists (select 1 from public.app_roles d where d.user_id = auth.uid() and d.disabled)
  order by v.pending, cp.display_name
$$;
revoke execute on function public.my_viewers() from public, anon, authenticated, service_role;
grant execute on function public.my_viewers() to authenticated;

-- Family members I could share with (active, not me, not already a viewer or offered). user id is what share_set takes; names only otherwise.
create or replace function public.share_candidates()
  returns table (carer_user_id uuid, person_id uuid, display_name text)
  language sql stable security definer set search_path = '' as $$
  select p.auth_user_id, p.id, p.display_name
  from public.people p
  join public.app_roles r on r.user_id = p.auth_user_id and not r.disabled
  where p.archived_at is null
    and p.auth_user_id is distinct from auth.uid()
    and exists (select 1 from public.app_roles me where me.user_id = auth.uid() and not me.disabled)
    and not exists (select 1 from public.carers c join public.people mine on mine.id = c.person_id and mine.auth_user_id = auth.uid() where c.carer_id = p.auth_user_id)
    and not exists (select 1 from public.share_offers o join public.people mine on mine.id = o.person_id and mine.auth_user_id = auth.uid() where o.carer_id = p.auth_user_id)
  order by p.display_name
$$;
revoke execute on function public.share_candidates() from public, anon, authenticated, service_role;
grant execute on function public.share_candidates() to authenticated;

-- Admin desk: every link and pending offer on active people, with names. Admin only (42501).
create or replace function public.admin_share_grid()
  returns table (person_id uuid, person_name text, carer_user_id uuid, carer_name text, can_write boolean, pending boolean)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  return query
    select p.id, p.display_name, c.carer_id, coalesce(cp.display_name, 'Family member'), c.can_write, false
      from public.carers c join public.people p on p.id = c.person_id left join public.people cp on cp.auth_user_id = c.carer_id
     where p.archived_at is null
    union all
    select p.id, p.display_name, o.carer_id, coalesce(cp.display_name, 'Family member'), o.can_write, true
      from public.share_offers o join public.people p on p.id = o.person_id left join public.people cp on cp.auth_user_id = o.carer_id
     where p.archived_at is null
    order by 2, 1, 4;
end $$;
revoke execute on function public.admin_share_grid() from public, anon, authenticated, service_role;
grant execute on function public.admin_share_grid() to authenticated;

commit;
