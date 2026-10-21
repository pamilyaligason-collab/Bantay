-- Undo 0020_scan_extract.sql. Safe to run twice. Rows already marked 'reading' go back to 'new' so the old check holds.
drop function if exists public.records_scan_due(int, interval, interval);
drop function if exists public.records_scan_claim(uuid, interval, int);
alter table public.documents drop constraint if exists documents_page_count_check;
alter table public.documents drop column if exists page_count;
drop index if exists public.source_files_ingest_new;
drop index if exists public.source_files_document_page;
update public.source_files set ingest_status = 'new' where ingest_status = 'reading';
alter table public.source_files drop constraint if exists source_files_ingest_status_check;
alter table public.source_files add constraint source_files_ingest_status_check
  check (ingest_status in ('new', 'extracted', 'queued', 'done', 'skipped', 'failed'));
alter table public.source_files drop constraint if exists source_files_ingest_error_check;
alter table public.source_files drop constraint if exists source_files_page_no_check;
alter table public.source_files drop column if exists ingest_tries, drop column if exists ingest_error, drop column if exists page_no;
