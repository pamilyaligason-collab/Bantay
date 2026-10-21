-- Undo 0022_people_archive.sql: restores the 0021 state (0001 people_read and people_insert, 0011 family_profiles). Safe to run twice.
-- Archived people become visible on phones again; the archive dates are dropped with the columns.
begin;
drop function if exists public.admin_set_archived(uuid, boolean);

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (auth_user_id = auth.uid() or created_by = auth.uid() or public.is_carer_of(id));
drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert to authenticated
  with check (created_by = auth.uid() and (auth_user_id = auth.uid() or auth_user_id is null));

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
  order by p.display_name
$$;
revoke execute on function public.family_profiles() from public, anon;
grant execute on function public.family_profiles() to authenticated;

alter table public.people drop column if exists archived_by, drop column if exists archived_at;
commit;
