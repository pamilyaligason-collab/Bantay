-- Family Bantay: archive a person (admin web only). Needs 0001, 0002 (is_admin), 0011 (family_profiles), 0021 (audit trigger, people_admin_read).
-- Written only; Lloyd applies it. Safe to run twice. Undo: 0022_people_archive.down.sql.
--
-- Rules
-- * An archived person is hidden from every phone: people_read and family_profiles() skip them. Their records are never deleted or changed.
-- * The admin still sees them (people_admin_read, 0021, is untouched). A person's OWN login still reads its own row (auth_user_id = auth.uid()).
-- * Only admin_set_archived() writes archived_at / archived_by. No column grant for them, and the insert policy refuses them.
-- * Reactivating clears both columns; the people row (and so every record on it) is the same row.
begin;

alter table public.people
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id) on delete set null;
-- update stays column-limited (0010, 0013): archived_* are not in the list, so clients cannot update them.

-- Phones never see an archived person that is not their own login row.
drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (auth_user_id = auth.uid() or ((created_by = auth.uid() or public.is_carer_of(id)) and archived_at is null));

-- insert is a table-wide grant: the policy keeps a client from creating a row that is already archived.
drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert to authenticated
  with check (created_by = auth.uid() and (auth_user_id = auth.uid() or auth_user_id is null) and archived_at is null and archived_by is null);

-- The sign-in list (0011 body) plus the archived filter.
create or replace function public.family_profiles()
  returns table (person_id uuid, display_name text, handle text, provider text, photo_path text)
  language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name,
         case when u.email like 'm-%@members.bantay.invalid' then r.handle end,
         case when u.email like 'm-%@members.bantay.invalid' then 'pin' else 'google' end,
         p.photo_path
  from public.people p
  join public.app_roles r on r.user_id = p.auth_user_id and not r.disabled
  join auth.users u on u.id = p.auth_user_id
  where exists (select 1 from public.app_roles me where me.user_id = auth.uid() and not me.disabled)
    and p.archived_at is null
  order by p.display_name
$$;
revoke execute on function public.family_profiles() from public, anon;
grant execute on function public.family_profiles() to authenticated;

-- Admin archives or reactivates one person. Archiving twice keeps the first date and admin.
create or replace function public.admin_set_archived(p_person uuid, p_archived boolean) returns void
  language plpgsql security definer set search_path = '' as
  $$ declare au uuid; begin
       if not public.is_admin() then raise exception 'not_admin'; end if;
       if p_person is null or p_archived is null then raise exception 'bad_input'; end if;
       select p.auth_user_id into au from public.people p where p.id = p_person;
       if not found then raise exception 'not_found'; end if;
       if p_archived and au is not null and au = auth.uid() then raise exception 'self'; end if;
       update public.people set
         archived_at = case when p_archived then coalesce(archived_at, now()) end,
         archived_by = case when p_archived then coalesce(archived_by, auth.uid()) end
       where id = p_person;
     end $$;
revoke execute on function public.admin_set_archived(uuid, boolean) from public, anon;
grant execute on function public.admin_set_archived(uuid, boolean) to authenticated;

commit;
