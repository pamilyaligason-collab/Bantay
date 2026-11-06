-- Family Bantay D-127, D-134: the family feed. Needs 0001 (people, readings, is_self, is_writer_of), 0002 (pin_try), 0003 (activity), 0008 (lab_results), 0021 (audit_log),
-- 0022 (people.archived_at), 0023 (family_photos, is_family_member), 0037 (audit_log action list) and 0046 (is_owner, people.kind).
-- Written and rehearsed only; the owner applies it. Safe to run twice. Undo: 0050_family_feed.down.sql. No edge function, no notification: nothing here sends.
--
-- Rules (D-134)
-- * No post table. A post is a row that already exists (a reading pair, a confirmed lab, a family photo, a check-in); family_feed() reads it only for a person whose category switch is on.
-- * One switch per person and category (bp, lab, photo, status), off by default, stored in feed_shares.
-- * Who may switch ON: the person, when they have a login; the owner, when the person has no login. Who may switch OFF: the same, and the owner for anyone. A writer carer of a
--   no-login person may do neither. The consent line is recorded on the row (agreed_at, agreed_text 'feed-2026-11') each time a switch goes from off to on.
-- * The owner sees in the feed only what the family sees: family_feed() has no owner or admin branch. Raw table policies do not change: a switch opens posts, not the records.
-- * Archived people and the shared family account (people.kind 'shared') cannot be switched and are never listed; a disabled or erased sharer's posts leave at once (ML-33).
-- * ML-08, stated exception: family_feed() is read-only, gated (family member, not disabled) and has no cooldown. feed_share_set keeps 30 changes an hour.
-- * The audit row holds the column name 'enabled' only, never the category or a health value (B-7). No health value reaches any notification: none is written here.
begin;

create table if not exists public.feed_shares (
  person_id uuid not null references public.people (id) on delete cascade,
  category text not null check (category in ('bp', 'lab', 'photo', 'status')),
  enabled boolean not null default false,
  agreed_at timestamptz,
  agreed_text text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (person_id, category)
);
alter table public.feed_shares enable row level security;
revoke all on public.feed_shares from anon, authenticated;
grant select on public.feed_shares to authenticated; -- no direct write: feed_share_set is the only way
drop policy if exists feed_shares_read on public.feed_shares;
create policy feed_shares_read on public.feed_shares for select to authenticated
  using (public.is_self(person_id) or public.is_owner() or public.is_writer_of(person_id));

-- Whitelist (ML-28): audit_log.action gains feed_share. Earlier list is 0037's.
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view', 'pin_reset', 'share_add', 'share_remove', 'share_accept', 'invite', 'join', 'feed_share'));

-- Switch one category for one person. 42501 not allowed; 22023 bad target (no such person, archived, shared account, bad category); 53400 more than 30 changes an hour.
create or replace function public.feed_share_set(p_person uuid, p_category text, p_on boolean) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  login uuid;
begin
  if me is null or not public.is_family_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_person is null or p_on is null or p_category is null or p_category not in ('bp', 'lab', 'photo', 'status') then raise exception 'bad target' using errcode = '22023'; end if;
  if public.pin_try(md5('feed:' || me::text)::uuid, 30, interval '1 hour') > 30 then raise exception 'too many changes' using errcode = '53400'; end if;
  select pe.auth_user_id into login from public.people pe where pe.id = p_person and pe.archived_at is null and pe.kind is null;
  if not found then raise exception 'bad target' using errcode = '22023'; end if;
  if login is not null then
    if not (login = me or (not p_on and public.is_owner())) then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif not public.is_owner() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.feed_shares as f (person_id, category, enabled, agreed_at, agreed_text, updated_at, updated_by)
    values (p_person, p_category, p_on, case when p_on then now() end, case when p_on then 'feed-2026-11' end, now(), me)
  on conflict (person_id, category) do update set
    enabled = excluded.enabled,
    agreed_at = case when excluded.enabled and not f.enabled then excluded.agreed_at else f.agreed_at end,
    agreed_text = case when excluded.enabled and not f.enabled then excluded.agreed_text else f.agreed_text end,
    updated_at = now(), updated_by = me;
  insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'feed_shares', p_person, 'feed_share', array['enabled']);
end $$;
revoke execute on function public.feed_share_set(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.feed_share_set(uuid, text, boolean) to authenticated;

-- The feed: newest first, at most 500 rows, nothing older than 30 days. Empty for a caller who is not an enabled family member.
-- bp: a systolic and a diastolic taken at the same time (a lone one makes no post); lab: confirmed only, shown from the day it was confirmed; photo: attributed to the
-- uploader's person row; status: activity kind 'check-in'. title_key names the post type for the phone's copy; the phone computes the BP level chip.
create or replace function public.family_feed(p_since timestamptz) returns table(kind text, person_id uuid, at timestamptz, title_key text, value_text text, chip text, photo_path text, row_id text)
  language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  since timestamptz := greatest(coalesce(p_since, '-infinity'::timestamptz), now() - interval '30 days');
begin
  if auth.uid() is null or not public.is_family_member() then return; end if;
  return query
  with ok as (
    select fs.person_id as pid, fs.category as cat
    from public.feed_shares fs
    join public.people pe on pe.id = fs.person_id
    where fs.enabled and pe.archived_at is null and pe.kind is null
      and (pe.auth_user_id is null or exists (select 1 from public.app_roles r where r.user_id = pe.auth_user_id and not r.disabled))
  )
  select u.kind, u.person_id, u.at, u.title_key, u.value_text, u.chip, u.photo_path, u.row_id
  from (
    select 'bp'::text as kind, s.person_id, s.taken_at as at, 'feed_bp'::text as title_key,
           trim_scale(s.value)::text || '/' || trim_scale(d.value)::text || ' mmHg' as value_text,
           null::text as chip, null::text as photo_path, s.id::text as row_id
    from public.readings s
    join ok on ok.pid = s.person_id and ok.cat = 'bp'
    join lateral (select d1.value from public.readings d1
                  where d1.person_id = s.person_id and d1.test = 'bp_diastolic' and d1.taken_at = s.taken_at and d1.deleted_at is null
                  order by d1.id limit 1) d on true
    where s.test = 'bp_systolic' and s.deleted_at is null and s.taken_at >= since
    union all
    select 'lab'::text, l.person_id, coalesce(l.confirmed_at, l.created_at), 'feed_lab'::text,
           l.name_raw || ' ' || coalesce(trim_scale(l.value_num)::text, l.value_text) || coalesce(' ' || l.unit_raw, ''),
           case when l.flag in ('H', 'L', 'A') then l.flag end, null::text, l.id::text
    from public.lab_results l
    join ok on ok.pid = l.person_id and ok.cat = 'lab'
    where l.status = 'confirmed' and coalesce(l.confirmed_at, l.created_at) >= since
    union all
    select 'photo'::text, pe.id, fp.created_at, 'feed_photo'::text, fp.caption, null::text, fp.storage_path, fp.id::text
    from public.family_photos fp
    join public.people pe on pe.auth_user_id = fp.uploaded_by
    join ok on ok.pid = pe.id and ok.cat = 'photo'
    where fp.deleted_at is null and fp.created_at >= since
    union all
    select 'status'::text, a.person_id, a.started_at, 'feed_status'::text, null::text, null::text, null::text, a.id::text
    from public.activity a
    join ok on ok.pid = a.person_id and ok.cat = 'status'
    where a.kind = 'check-in' and a.started_at >= since
  ) u
  order by u.at desc, u.row_id desc
  limit 500;
end $$;
revoke execute on function public.family_feed(timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.family_feed(timestamptz) to authenticated;

commit;
