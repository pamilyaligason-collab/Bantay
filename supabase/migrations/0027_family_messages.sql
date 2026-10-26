-- Family messages (session 9, W2-FAMILY): one private family group thread with text, voice notes, photos and files. Written only; Lloyd applies it.
-- Needs 0002 (app_roles, is_admin) and 0023 (is_family_member). Follows the 0023 Memories table and bucket pattern.
--
-- Rules
-- * One thread for the whole family (not one per pair): roles are "any active family member", so there is no pair mapping to keep right.
-- * Any active family member (an app_roles row that is not disabled) reads. The sender stamps their own uid; the sender or an admin soft-deletes. Anon: nothing.
-- * Photos are re-encoded to JPEG with location and camera details removed in the app; the bucket takes 10 MB per object and a short list of types as a second fence.
-- * Objects are never public; the app reads them through short-lived signed links. Path: <sender auth uid>/<uuid>.<ext>.
-- * No message text, file names or paths in any log (B-7). Unknown stays null (B-5): body, attachment and duration are null when not given.
-- Safe to run twice.
begin;

create table if not exists public.family_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,                                   -- send retry is idempotent
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sender_person_id uuid references public.people (id) on delete set null, -- stamped by trigger, never by the client
  kind text not null check (kind in ('text', 'voice', 'photo', 'file')),
  body text check (body is null or char_length(body) <= 2000),
  attachment_path text unique check (attachment_path is null or attachment_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|webm|m4a|mp4|ogg|aac|pdf|txt|doc|docx)$'),
  attachment_name text check (attachment_name is null or char_length(attachment_name) <= 80),
  duration_s integer check (duration_s is null or duration_s between 1 and 60),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'text' and body is not null and attachment_path is null) or (kind <> 'text' and attachment_path is not null))
);
create index if not exists family_messages_recent on public.family_messages (created_at desc) where deleted_at is null;

create or replace function public.family_messages_stamp() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       select id into new.sender_person_id from public.people where auth_user_id = auth.uid();
       return new;
     end $$;
revoke execute on function public.family_messages_stamp() from public, anon, authenticated;
drop trigger if exists family_messages_stamp on public.family_messages;
create trigger family_messages_stamp before insert on public.family_messages for each row execute function public.family_messages_stamp();

alter table public.family_messages enable row level security;
revoke all on public.family_messages from anon, authenticated;
grant select, insert on public.family_messages to authenticated;
grant update (deleted_at) on public.family_messages to authenticated; -- nothing else changes after sending; no hard delete over REST

drop policy if exists family_messages_read on public.family_messages;
create policy family_messages_read on public.family_messages for select to authenticated
  using (public.is_family_member() and (deleted_at is null or sender_id = auth.uid() or public.is_admin()));
drop policy if exists family_messages_insert on public.family_messages;
create policy family_messages_insert on public.family_messages for insert to authenticated
  with check (public.is_family_member() and sender_id = auth.uid() and deleted_at is null
              and (attachment_path is null or attachment_path like auth.uid()::text || '/%'));
drop policy if exists family_messages_update on public.family_messages;
create policy family_messages_update on public.family_messages for update to authenticated
  using (public.is_family_member() and (sender_id = auth.uid() or public.is_admin()))
  with check (public.is_family_member() and (sender_id = auth.uid() or public.is_admin()));

-- ---------- private bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-messages', 'family-messages', false, 10485760,
  array['image/jpeg', 'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac', 'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create or replace function public.family_messages_object_owner(object_name text) returns boolean
  language plpgsql stable security definer set search_path = '' as
  $$ declare uid uuid; begin
       begin uid := split_part(object_name, '/', 1)::uuid; exception when others then return false; end;
       return uid = auth.uid() or public.is_admin();
     end $$;
revoke execute on function public.family_messages_object_owner(text) from public, anon;
grant execute on function public.family_messages_object_owner(text) to authenticated;

drop policy if exists family_messages_objects_read on storage.objects;
create policy family_messages_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'family-messages' and public.is_family_member());
drop policy if exists family_messages_objects_insert on storage.objects;
create policy family_messages_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'family-messages' and public.is_family_member() and split_part(name, '/', 1) = auth.uid()::text);
drop policy if exists family_messages_objects_delete on storage.objects;
create policy family_messages_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'family-messages' and public.family_messages_object_owner(name));
-- no update policy: an object is replaced by deleting and uploading again

commit;
