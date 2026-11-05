-- Undo 0046_who_sees_whom.sql: share_set returns to the 0037 offer model, the owner, people.kind and activity.updated_at go. Links already made stay in carers. The owner's phone keeps the doses, readings and activity it already pulled; the owner read policies go, so nothing new reaches it.
-- The two apply-time marks (the owner, the shared account) disappear with their columns; run the lines again after an up.
begin;

drop policy if exists meds_taken_owner_read on public.meds_taken;
drop policy if exists activity_owner_read on public.activity;
drop policy if exists consults_owner_read on public.consults;

drop function if exists public.share_candidates(uuid);
drop function if exists public.person_viewers(uuid);

-- 0037 share_set
create or replace function public.share_set(p_person uuid, p_carer uuid, p_can_write boolean, p_on boolean) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  owner uuid;
  adm boolean;
  nologin boolean;
  guarded boolean;
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
  guarded := nologin and public.is_person_creator(p_person, p_carer); -- the writer link that keeps a dependent from being orphaned
  adm := public.is_admin();
  if not (adm or owner = me or (nologin and public.is_writer_of(p_person))) then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_on and cw and not (adm and nologin) then raise exception 'not allowed' using errcode = '42501'; end if;

  if p_on then
    if p_carer = me or p_carer is not distinct from owner
       or not exists (select 1 from public.app_roles r where r.user_id = p_carer and not r.disabled) then raise exception 'bad target' using errcode = '22023'; end if;
    select * into cur from public.carers c where c.person_id = p_person and c.carer_id = p_carer;
    if found then
      if adm and cur.can_write is distinct from cw then  -- an accepted link stays accepted; only an admin changes edit access
        if guarded and not cw then raise exception 'not allowed' using errcode = '42501'; end if; -- never leave a no-login person without a writer
        update public.carers c set can_write = cw where c.person_id = p_person and c.carer_id = p_carer;
        insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_add', array['can_write']);
        return 'updated';
      end if;
      return 'unchanged';
    end if;
    select * into ofr from public.share_offers o where o.person_id = p_person and o.carer_id = p_carer;
    if found then
      if adm and ofr.can_write is distinct from cw then
        update public.share_offers o set can_write = cw where o.person_id = p_person and o.carer_id = p_carer;
        insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_add', array['can_write']);
        return 'updated';
      end if;
      return 'unchanged';
    end if;
    insert into public.share_offers (person_id, carer_id, can_write, added_by) values (p_person, p_carer, cw, me);
    insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'carers', p_person, 'share_add', array['can_write']);
    insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
      values (p_person, p_carer, 'share', 'share_offer', p_person::text || ':' || p_carer::text || ':' || floor(extract(epoch from now()) / 3600)::bigint::text)
      on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
    if owner is not null and owner <> me then  -- an admin offered a viewer on a member's records: tell the member now, not only after the carer accepts (no names, B-7)
      insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
        values (p_person, owner, 'share', 'share_admin', p_person::text || ':' || p_carer::text || ':admin:' || floor(extract(epoch from now()) / 3600)::bigint::text)
        on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
    end if;
    return 'pending';
  end if;

  -- Only the no-login creator link is protected. The person themself and an admin may remove any other viewer, a claimed record's creator link included.
  if guarded or (p_carer = me and not adm and owner is distinct from me) then raise exception 'not allowed' using errcode = '42501'; end if;
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

-- 0034 request_erasure
create or replace function public.request_erasure() returns timestamptz
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c timestamptz;
begin
  if me is null or not exists (select 1 from public.people where auth_user_id = me) then raise exception 'not allowed' using errcode = '42501'; end if;
  -- one open request per user (pk); a finished one may be started again
  insert into public.erasure_requests (user_id) values (me)
    on conflict (user_id) do update set requested_at = now(), cancel_until = now() + interval '7 days', done_at = null
    where public.erasure_requests.done_at is not null;
  select cancel_until into c from public.erasure_requests where user_id = me;
  return c;
end $$;
revoke execute on function public.request_erasure() from public, anon, authenticated, service_role;
grant execute on function public.request_erasure() to authenticated;

drop trigger if exists app_roles_owner_guard on public.app_roles;
drop function if exists public.app_roles_owner_guard();
drop function if exists public.is_owner();
drop index if exists public.app_roles_one_owner;
alter table public.app_roles drop column if exists is_owner;

-- 0022 people_insert, then the column
drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert to authenticated
  with check (created_by = auth.uid() and (auth_user_id = auth.uid() or auth_user_id is null) and archived_at is null and archived_by is null);
alter table public.people drop column if exists kind;

drop trigger if exists activity_updated_at on public.activity;
drop function if exists public.activity_stamp_updated_at();
drop index if exists public.activity_updated_at;
alter table public.activity drop column if exists updated_at;

commit;
