-- Family Bantay: one document per file content (session 7). Needs 0008, 0013, 0016.
-- The session 5 Drive-id run (2026-10-18) and the local-path run (2026-10-19) loaded identical files twice, before
-- knownId() matched by sha256. Per (sha256, person) the best copy is kept: confirmed before draft, a person's own confirm
-- before auto, the current local: id before the old Drive id, then the oldest. Another copy is rejected (never deleted)
-- only when nothing is lost: no row a person confirmed, no medicine reading the keeper lacks, no more rows of a kind than
-- the keeper. Everything else stays for Confirm records. ID numbers and policies are re-pointed to the keeper, never
-- rejected (unique per person, so the second run never stored its own copy). Every changed row is logged first;
-- 0019_records_dedupe.down.sql restores it. Known limit: conditions/allergies/profile text are keyed by person and text,
-- not by file, so they already collapsed into one row and are not touched here.
-- Written only; Lloyd applies it. Safe to run twice.

begin;

create table if not exists public.records_dedupe_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  tbl text not null,
  row_id uuid not null,
  old_status text,
  old_confirmed_by uuid,
  old_confirmed_at timestamptz,
  old_confirmed_source text,
  old_ref uuid -- source_file_id / duplicate_of before a re-point
);
alter table public.records_dedupe_log enable row level security;
drop policy if exists records_dedupe_log_admin on public.records_dedupe_log;
create policy records_dedupe_log_admin on public.records_dedupe_log for select to authenticated using (public.is_admin());
revoke all on public.records_dedupe_log from anon;

create temp table dedupe on commit drop as
with g as (
  select sf.sha256, d.person_id from public.source_files sf join public.documents d on d.id = sf.document_id
  where sf.sha256 is not null and d.status <> 'rejected'
  group by 1, 2 having count(distinct sf.document_id) > 1),
r as (
  select sf.id as sf_id, sf.sha256, d.person_id, sf.document_id as doc,
         row_number() over (partition by sf.sha256, d.person_id
           order by (d.status = 'confirmed') desc, (d.confirmed_source = 'user') desc,
                    (sf.drive_file_id like 'local:%') desc, sf.created_at, sf.id) as rn
  from public.source_files sf join public.documents d on d.id = sf.document_id
  join g on g.sha256 = sf.sha256 and g.person_id is not distinct from d.person_id
  where d.status <> 'rejected')
select r.sf_id, r.doc, k.sf_id as keep_sf, k.doc as keep_doc
from r join r k on k.sha256 = r.sha256 and k.person_id is not distinct from r.person_id and k.rn = 1
where r.rn > 1 and r.doc <> k.doc
  and r.doc not in (select doc from r where rn = 1); -- a keeper (front/back share one document) is never rejected

-- 1. a row a person confirmed themselves is never rejected here
delete from dedupe d where
     exists (select 1 from public.lab_results x where x.document_id = d.doc and x.confirmed_source = 'user')
  or exists (select 1 from public.imaging_reports x where x.document_id = d.doc and x.confirmed_source = 'user')
  or exists (select 1 from public.vaccinations x where x.document_id = d.doc and x.confirmed_source = 'user')
  or exists (select 1 from public.prescriptions p join public.prescription_items x on x.prescription_id = p.id
             where p.document_id = d.doc and x.confirmed_source = 'user');

-- 2. every live prescription line must exist on the keeper with the same reading, or the converter would change a medicine
delete from dedupe d where exists (
  select 1 from public.prescriptions p join public.prescription_items i on i.prescription_id = p.id
  where p.document_id = d.doc and i.status <> 'rejected'
    and public.normalise_drug(coalesce(i.drug_raw, i.generic_name)) is not null
    and not exists (
      select 1 from public.prescriptions kp join public.prescription_items ki on ki.prescription_id = kp.id
      where kp.document_id = d.keep_doc and ki.status <> 'rejected' and ki.person_id = i.person_id
        and public.normalise_drug(coalesce(ki.drug_raw, ki.generic_name)) = public.normalise_drug(coalesce(i.drug_raw, i.generic_name))
        and ki.frequency is not distinct from i.frequency and ki.dose is not distinct from i.dose
        and ki.strength is not distinct from i.strength and ki.duration is not distinct from i.duration));

-- 3. the two runs may have read a file as different kinds: never drop more rows of a kind than the keeper holds
delete from dedupe d where
     (select count(*) from public.lab_results x where x.document_id = d.doc and x.status <> 'rejected')
   > (select count(*) from public.lab_results x where x.document_id = d.keep_doc and x.status <> 'rejected')
  or (select count(*) from public.imaging_reports x where x.document_id = d.doc and x.status <> 'rejected')
   > (select count(*) from public.imaging_reports x where x.document_id = d.keep_doc and x.status <> 'rejected')
  or (select count(*) from public.vaccinations x where x.document_id = d.doc and x.status <> 'rejected')
   > (select count(*) from public.vaccinations x where x.document_id = d.keep_doc and x.status <> 'rejected');

-- log before changing anything
insert into public.records_dedupe_log (tbl, row_id, old_status, old_confirmed_by, old_confirmed_at, old_confirmed_source)
  select 'prescription_items', i.id, i.status, i.confirmed_by, i.confirmed_at, i.confirmed_source
  from public.prescription_items i join public.prescriptions p on p.id = i.prescription_id
  where i.status <> 'rejected' and p.document_id in (select doc from dedupe)
  union all select 'prescriptions', x.id, x.status, x.confirmed_by, x.confirmed_at, x.confirmed_source from public.prescriptions x where x.status <> 'rejected' and x.document_id in (select doc from dedupe)
  union all select 'lab_results', x.id, x.status, x.confirmed_by, x.confirmed_at, x.confirmed_source from public.lab_results x where x.status <> 'rejected' and x.document_id in (select doc from dedupe)
  union all select 'lab_panels', x.id, x.status, x.confirmed_by, x.confirmed_at, x.confirmed_source from public.lab_panels x where x.status <> 'rejected' and x.document_id in (select doc from dedupe)
  union all select 'imaging_reports', x.id, x.status, x.confirmed_by, x.confirmed_at, x.confirmed_source from public.imaging_reports x where x.status <> 'rejected' and x.document_id in (select doc from dedupe)
  union all select 'vaccinations', x.id, x.status, x.confirmed_by, x.confirmed_at, x.confirmed_source from public.vaccinations x where x.status <> 'rejected' and x.document_id in (select doc from dedupe)
  union all select 'documents', x.id, x.status, x.confirmed_by, x.confirmed_at, x.confirmed_source from public.documents x where x.status <> 'rejected' and x.id in (select doc from dedupe);
insert into public.records_dedupe_log (tbl, row_id, old_ref)
  select 'person_identifiers', x.id, x.source_file_id from public.person_identifiers x where x.source_file_id in (select sf_id from dedupe)
  union all select 'insurance_policies', x.id, x.source_file_id from public.insurance_policies x where x.source_file_id in (select sf_id from dedupe)
  union all select 'source_files', s.id, s.duplicate_of from public.source_files s where s.id in (select sf_id from dedupe);

update public.prescription_items set status = 'rejected'
  where status <> 'rejected' and prescription_id in (select id from public.prescriptions where document_id in (select doc from dedupe));
update public.prescriptions   set status = 'rejected' where status <> 'rejected' and document_id in (select doc from dedupe);
update public.lab_results     set status = 'rejected' where status <> 'rejected' and document_id in (select doc from dedupe);
update public.lab_panels      set status = 'rejected' where status <> 'rejected' and document_id in (select doc from dedupe);
update public.imaging_reports set status = 'rejected' where status <> 'rejected' and document_id in (select doc from dedupe);
update public.vaccinations    set status = 'rejected' where status <> 'rejected' and document_id in (select doc from dedupe);
update public.documents       set status = 'rejected' where status <> 'rejected' and id in (select doc from dedupe);
update public.person_identifiers p set source_file_id = d.keep_sf from dedupe d where p.source_file_id = d.sf_id;
update public.insurance_policies p set source_file_id = d.keep_sf from dedupe d where p.source_file_id = d.sf_id;
update public.source_files s  set duplicate_of = d.keep_sf from dedupe d where s.id = d.sf_id and s.duplicate_of is distinct from d.keep_sf;

select public.rx_to_medications();

commit;
