-- Family Bantay: phone scans of health papers are read on the server (session 7, lane L6). Needs 0008 (records, source_files,
-- documents) and 0013 (records_stamp with auto-confirm). Written only; Lloyd applies it. Safe to run twice. Undo: 0020_scan_extract.down.sql.
--
-- Rules
-- * The app uploads a scan (N JPEG pages, or one PDF) to the private 'records' bucket as <person_id>/<document_id>/p<NN>.jpg or
--   <person_id>/<document_id>/doc.pdf, writes ONE documents row (status 'draft', kind lab | prescription | other) and one
--   source_files row per page (page_no 1..N, ingest_status 'new'). The records-extract Edge Function (service role) reads the pages
--   and writes draft rows exactly like the laptop import (scripts/import/load.mjs). Nothing from a phone scan is ever confirmed by
--   the server: the function only writes 'draft' and the 0013 trigger already refuses a confirm without a user unless the row says
--   confirmed_source 'auto', which the function never sends.
-- * ID and insurance cards (kind id_card / insurance_card) keep today's behaviour: confirmed by the phone, never read.
-- * Member RLS is unchanged. A member who may edit the person (records_editor) can already insert a draft document and its
--   source_files rows (0008 documents_insert / source_files_insert) and upload under <person_id>/ (records_objects_insert); the
--   extra folder level <document_id>/ is fine because records_object_editor only reads the first path segment.
-- * ingest_status for a scan: new -> reading (claimed by the function) -> queued (drafts are in the confirm queue) | failed.
--   ingest_error holds a short code only (never document text or values, B-7). The app retries a failed scan by setting its
--   pages back to 'new'.

-- Pre-check (must return 0 rows, else the unique index below fails):
--   select document_id, count(*) from public.source_files where side is null and document_id is not null group by 1 having count(*) > 1;

begin;

-- ---------- source_files: page order, claim state, short error code ----------
alter table public.source_files
  add column if not exists page_no int not null default 1,
  add column if not exists ingest_error text,
  add column if not exists ingest_tries int not null default 0;
do $$ begin
  alter table public.source_files add constraint source_files_page_no_check check (page_no between 1 and 10);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.source_files add constraint source_files_ingest_error_check check (ingest_error is null or ingest_error ~ '^[a-z0-9_]{1,40}$');
exception when duplicate_object then null; end $$;
-- 'reading' is new: the function holds the pages while it reads them (a crashed run is taken back after 10 minutes).
alter table public.source_files drop constraint if exists source_files_ingest_status_check;
alter table public.source_files add constraint source_files_ingest_status_check
  check (ingest_status in ('new', 'reading', 'extracted', 'queued', 'done', 'skipped', 'failed'));
-- One file per page of a document. Cards keep front/back on page 1 (side is set), so they are left out of the rule.
create unique index if not exists source_files_document_page on public.source_files (document_id, page_no)
  where document_id is not null and side is null;
create index if not exists source_files_ingest_new on public.source_files (ingest_status, created_at)
  where storage_path is not null and ingest_status in ('new', 'reading');

-- ---------- documents: how many pages the phone will send ----------
-- Set by the app on the draft scan document. The function waits until that many pages are in source_files (a scan whose last
-- page is still on a phone with no signal is never read half). Null: read whatever pages are there (2 minutes after the last one).
alter table public.documents add column if not exists page_count int;
do $$ begin
  alter table public.documents add constraint documents_page_count_check check (page_count is null or page_count between 1 and 10);
exception when duplicate_object then null; end $$;

-- ---------- the claim: one run reads a document at a time ----------
-- Returns the number of pages claimed (0 = nothing to do: not a draft scan, pages missing, already being read, or done).
-- A run that died leaves 'reading' behind; after p_stale it may be claimed again, at most p_max_tries times, then the
-- pages are marked failed ('too_many_tries'). A finished run resets ingest_tries to 0, so an app retry starts fresh.
create or replace function public.records_scan_claim(p_document uuid, p_stale interval default interval '10 minutes', p_max_tries int default 3)
  returns integer
  language plpgsql security definer set search_path = '' as
  $$ declare d record; s record; n int; begin
       select id, kind, status, page_count into d from public.documents where id = p_document for update;
       if not found or d.status <> 'draft' or d.kind in ('id_card', 'insurance_card') then return 0; end if;
       select count(*) as have,
              count(*) filter (where ingest_status = 'reading' and updated_at >= now() - p_stale) as busy,
              count(*) filter (where ingest_status = 'new' or (ingest_status = 'reading' and updated_at < now() - p_stale)) as todo,
              coalesce(max(ingest_tries), 0) as tries
         into s from public.source_files where document_id = p_document and storage_path is not null;
       if s.have = 0 or s.busy > 0 or s.todo = 0 or (d.page_count is not null and s.have < d.page_count) then return 0; end if;
       if s.tries >= p_max_tries then
         update public.source_files set ingest_status = 'failed', ingest_error = 'too_many_tries', ingest_tries = 0
          where document_id = p_document and storage_path is not null;
         return 0;
       end if;
       update public.source_files set ingest_status = 'reading', ingest_error = null, ingest_tries = ingest_tries + 1
        where document_id = p_document and storage_path is not null;
       get diagnostics n = row_count;
       return n;
     end $$;

-- Sweep: draft scans with a page waiting (or a stale claim) whose newest page is older than p_age, oldest first.
create or replace function public.records_scan_due(p_limit int default 3, p_age interval default interval '2 minutes', p_stale interval default interval '10 minutes')
  returns setof uuid
  language sql stable security definer set search_path = '' as
  $$ select sf.document_id
       from public.source_files sf join public.documents d on d.id = sf.document_id
      where sf.storage_path is not null and d.status = 'draft' and d.kind not in ('id_card', 'insurance_card')
      group by sf.document_id, d.page_count
     having bool_or(sf.ingest_status = 'new' or (sf.ingest_status = 'reading' and sf.updated_at < now() - p_stale))
        and not bool_or(sf.ingest_status = 'reading' and sf.updated_at >= now() - p_stale)
        and max(sf.created_at) < now() - p_age
        and (d.page_count is null or count(*) >= d.page_count)
      order by min(sf.created_at)
      limit least(greatest(coalesce(p_limit, 3), 1), 20) $$;

revoke execute on function public.records_scan_claim(uuid, interval, int), public.records_scan_due(int, interval, interval) from public, anon, authenticated;
grant execute on function public.records_scan_claim(uuid, interval, int), public.records_scan_due(int, interval, interval) to service_role;

commit;
