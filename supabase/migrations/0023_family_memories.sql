-- Family Memories (session 8, opt-in): photos the family chooses to add. Written only; Lloyd applies it with the CLI block.
-- Needs 0002 (app_roles, is_admin). Follows the 0008 'records' bucket and policy pattern.
--
-- Rules
-- * Family uploads only, no social media sync. The app strips EXIF and GPS and re-encodes to JPEG (max 1600 px) before upload;
--   the bucket accepts image/jpeg only and 3 MB per object as a second fence.
-- * Any active family member (an app_roles row that is not disabled) reads. The uploader, or an admin, soft-deletes. Nobody reads as anon.
-- * Objects are never public; the app reads them through short-lived signed links. Path: <uploader auth uid>/<uuid>.jpg.
-- * No captions, names or paths in any log (B-7). Unknown stays null (B-5): caption and taken_on are null when not given.
-- Safe to run twice.

create or replace function public.is_family_member() returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.app_roles where user_id = auth.uid() and not disabled) $$;
revoke execute on function public.is_family_member() from public, anon;
grant execute on function public.is_family_member() to authenticated;

create table if not exists public.family_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,                 -- upload retry is idempotent
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  caption text check (caption is null or char_length(caption) <= 140),
  taken_on date,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists family_photos_recent on public.family_photos (created_at desc) where deleted_at is null;

alter table public.family_photos enable row level security;
revoke all on public.family_photos from anon, authenticated;
grant select, insert on public.family_photos to authenticated;
grant update (caption, deleted_at) on public.family_photos to authenticated; -- nothing else can change after upload; no hard delete over REST

drop policy if exists family_photos_read on public.family_photos;
create policy family_photos_read on public.family_photos for select to authenticated
  using (public.is_family_member() and (deleted_at is null or uploaded_by = auth.uid() or public.is_admin()));
drop policy if exists family_photos_insert on public.family_photos;
create policy family_photos_insert on public.family_photos for insert to authenticated
  with check (public.is_family_member() and uploaded_by = auth.uid() and deleted_at is null and storage_path like auth.uid()::text || '/%');
drop policy if exists family_photos_update on public.family_photos;
create policy family_photos_update on public.family_photos for update to authenticated
  using (public.is_family_member() and (uploaded_by = auth.uid() or public.is_admin()))
  with check (public.is_family_member() and (uploaded_by = auth.uid() or public.is_admin()));

-- ---------- private bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memories', 'memories', false, 3145728, array['image/jpeg'])
on conflict (id) do nothing;

create or replace function public.memories_object_owner(object_name text) returns boolean
  language plpgsql stable security definer set search_path = '' as
  $$ declare uid uuid; begin
       begin uid := split_part(object_name, '/', 1)::uuid; exception when others then return false; end;
       return uid = auth.uid() or public.is_admin();
     end $$;
revoke execute on function public.memories_object_owner(text) from public, anon;
grant execute on function public.memories_object_owner(text) to authenticated;

drop policy if exists memories_objects_read on storage.objects;
create policy memories_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'memories' and public.is_family_member());
drop policy if exists memories_objects_insert on storage.objects;
create policy memories_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'memories' and public.is_family_member() and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists memories_objects_delete on storage.objects;
create policy memories_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'memories' and public.memories_object_owner(name));
-- no update policy: an object is replaced by deleting and uploading again
