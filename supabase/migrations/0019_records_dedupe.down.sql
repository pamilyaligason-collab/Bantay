-- Undo 0019_records_dedupe.sql from its log (statuses, confirm stamps and re-pointed file links), then rebuild medicines.
begin;
update public.prescription_items x set status = l.old_status, confirmed_by = l.old_confirmed_by, confirmed_at = l.old_confirmed_at, confirmed_source = l.old_confirmed_source from public.records_dedupe_log l where l.tbl = 'prescription_items' and l.row_id = x.id;
update public.prescriptions x      set status = l.old_status, confirmed_by = l.old_confirmed_by, confirmed_at = l.old_confirmed_at, confirmed_source = l.old_confirmed_source from public.records_dedupe_log l where l.tbl = 'prescriptions' and l.row_id = x.id;
update public.lab_results x        set status = l.old_status, confirmed_by = l.old_confirmed_by, confirmed_at = l.old_confirmed_at, confirmed_source = l.old_confirmed_source from public.records_dedupe_log l where l.tbl = 'lab_results' and l.row_id = x.id;
update public.lab_panels x         set status = l.old_status, confirmed_by = l.old_confirmed_by, confirmed_at = l.old_confirmed_at, confirmed_source = l.old_confirmed_source from public.records_dedupe_log l where l.tbl = 'lab_panels' and l.row_id = x.id;
update public.imaging_reports x    set status = l.old_status, confirmed_by = l.old_confirmed_by, confirmed_at = l.old_confirmed_at, confirmed_source = l.old_confirmed_source from public.records_dedupe_log l where l.tbl = 'imaging_reports' and l.row_id = x.id;
update public.vaccinations x       set status = l.old_status, confirmed_by = l.old_confirmed_by, confirmed_at = l.old_confirmed_at, confirmed_source = l.old_confirmed_source from public.records_dedupe_log l where l.tbl = 'vaccinations' and l.row_id = x.id;
update public.documents x          set status = l.old_status, confirmed_by = l.old_confirmed_by, confirmed_at = l.old_confirmed_at, confirmed_source = l.old_confirmed_source from public.records_dedupe_log l where l.tbl = 'documents' and l.row_id = x.id;
update public.person_identifiers x set source_file_id = l.old_ref from public.records_dedupe_log l where l.tbl = 'person_identifiers' and l.row_id = x.id;
update public.insurance_policies x set source_file_id = l.old_ref from public.records_dedupe_log l where l.tbl = 'insurance_policies' and l.row_id = x.id;
update public.source_files x       set duplicate_of = l.old_ref from public.records_dedupe_log l where l.tbl = 'source_files' and l.row_id = x.id;
select public.rx_to_medications();
drop table public.records_dedupe_log;
commit;
