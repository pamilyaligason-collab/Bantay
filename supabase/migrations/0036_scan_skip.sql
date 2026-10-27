-- Family Bantay: a scan with any page the owner chose not to share (ingest_status 'skipped', privacy.ai off) is never read, as a whole
-- (session 10, S6c fix round 3). 0020 flipped every page of a document to 'reading', skipped ones included, so a document with page 1
-- 'new' and pages 2-3 'skipped' was read in full. Now records_scan_due and records_scan_claim leave such a document alone, and the
-- claim never touches a 'skipped' row. Needs 0020. Safe to run twice. Undo: 0036_scan_skip.down.sql (restores the 0020 bodies).
-- records-extract needs no redeploy: it only calls records_scan_claim.

begin;

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
       if exists (select 1 from public.source_files where document_id = p_document and ingest_status = 'skipped') then return 0; end if;
       if s.have = 0 or s.busy > 0 or s.todo = 0 or (d.page_count is not null and s.have < d.page_count) then return 0; end if;
       if s.tries >= p_max_tries then
         update public.source_files set ingest_status = 'failed', ingest_error = 'too_many_tries', ingest_tries = 0
          where document_id = p_document and storage_path is not null and ingest_status <> 'skipped';
         return 0;
       end if;
       update public.source_files set ingest_status = 'reading', ingest_error = null, ingest_tries = ingest_tries + 1
        where document_id = p_document and storage_path is not null and ingest_status <> 'skipped';
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
        and not exists (select 1 from public.source_files sk where sk.document_id = sf.document_id and sk.ingest_status = 'skipped')
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
