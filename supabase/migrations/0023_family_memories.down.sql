-- Undo 0023_family_memories.sql. Safe to run twice. Deletes every Memories photo row and object: export first if the family wants them.
drop policy if exists memories_objects_delete on storage.objects;
drop policy if exists memories_objects_insert on storage.objects;
drop policy if exists memories_objects_read on storage.objects;
delete from storage.objects where bucket_id = 'memories';
delete from storage.buckets where id = 'memories';
drop function if exists public.memories_object_owner(text);
drop table if exists public.family_photos;
drop function if exists public.is_family_member();
