-- Undo 0045_local_safety.sql. Safe to run twice. Pack files in the bucket are removed first (a bucket with objects cannot be dropped).
-- Newer Supabase storage may refuse direct deletes on storage.objects; then empty the bucket in the dashboard first. Rehearse once on a branch.
delete from storage.objects where bucket_id = 'region-packs';
delete from storage.buckets where id = 'region-packs';
drop table if exists public.safety_reports;
drop table if exists public.region_packs;
drop table if exists public.safety_places;
drop table if exists public.coverage;
