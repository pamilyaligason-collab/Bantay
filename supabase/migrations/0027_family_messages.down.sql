-- Undo 0027_family_messages.sql. Safe to run twice. Deletes every family message and attachment: export first if the family wants them.
-- is_family_member() belongs to 0023 and stays.
drop policy if exists family_messages_objects_delete on storage.objects;
drop policy if exists family_messages_objects_insert on storage.objects;
drop policy if exists family_messages_objects_read on storage.objects;
delete from storage.objects where bucket_id = 'family-messages';
delete from storage.buckets where id = 'family-messages';
drop function if exists public.family_messages_object_owner(text);
drop table if exists public.family_messages;
drop function if exists public.family_messages_stamp();
