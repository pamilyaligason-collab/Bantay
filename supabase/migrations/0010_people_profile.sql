-- Family Bantay member profile (W1-A, D-67). Written only; Lloyd applies it with the CLI block.
-- Needs 0001 (people, is_self, is_writer_of), 0002 (is_admin, app_roles), 0008 (records_editor).
--
-- Rules
-- * A person's profile (name, photo, phone, birthday, blood type, allergies, conditions, medicines) is edited by
--   the person, a writer carer of that person, or an admin (records_editor, the same rule as health records, D-37).
-- * Reading people stays as 0001 has it (people_read). Admins edit through the admin-members function (service role),
--   which also sees every member; the policy lets an admin write too, but RLS only shows an admin their own and carer rows.
-- * Identity columns (auth_user_id, created_by) and updated_at are never writable by a user (column grants).
-- * Photos: private 'avatars' bucket, one object per person named <person_id>.jpg. Any signed-in, non-disabled member
--   reads them (the family sees each other); the editors above write them. anon gets nothing.
-- * Unknown is null or an empty list, never a made-up value (B-5).

alter table public.people
  add column if not exists photo_path text,
  add column if not exists phone text,
  add column if not exists birthdate date,
  add column if not exists blood_type text,
  add column if not exists allergies text[] not null default '{}',
  add column if not exists conditions text[] not null default '{}',
  add column if not exists medicines text[] not null default '{}',
  add column if not exists updated_at timestamptz default now();

do $$ begin
  alter table public.people add constraint people_blood_type_check
    check (blood_type is null or blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.people add constraint people_profile_size_check
    check (char_length(phone) <= 30 and char_length(photo_path) <= 60
           and cardinality(allergies) <= 30 and cardinality(conditions) <= 30 and cardinality(medicines) <= 30);
exception when duplicate_object then null; end $$;

create or replace function public.people_touch() returns trigger
  language plpgsql set search_path = '' as
  $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people
  for each row execute function public.people_touch();

-- column grants: display_name stays (0001) and the profile columns join it
revoke update on public.people from authenticated;
grant update (display_name, photo_path, phone, birthdate, blood_type, allergies, conditions, medicines) on public.people to authenticated;

drop policy if exists people_update on public.people;
create policy people_update on public.people for update to authenticated
  using (public.records_editor(id))
  with check (public.records_editor(id));

-- ---------- avatars bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create or replace function public.avatar_editor(object_name text) returns boolean
  language plpgsql stable security definer set search_path = '' as
  $$ declare pid uuid; begin
       if object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return false; end if;
       begin pid := left(object_name, 36)::uuid; exception when others then return false; end;
       return public.records_editor(pid);
     end $$;
revoke execute on function public.avatar_editor(text) from public, anon;
grant execute on function public.avatar_editor(text) to authenticated;

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and exists (select 1 from public.app_roles r where r.user_id = auth.uid() and not r.disabled));
drop policy if exists avatars_insert on storage.objects;
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and public.avatar_editor(name));
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and public.avatar_editor(name)) with check (bucket_id = 'avatars' and public.avatar_editor(name));
drop policy if exists avatars_delete on storage.objects;
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.avatar_editor(name));
