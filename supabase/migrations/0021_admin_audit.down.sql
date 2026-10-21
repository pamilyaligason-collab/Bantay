-- Undo 0021_admin_audit.sql. Safe to run twice. The audit history is dropped with the table.
begin;
drop function if exists public.admin_reveal_identifier(text, uuid);
drop function if exists public.admin_identifiers(uuid);
do $$ declare t text; begin
  foreach t in array array['people','person_identifiers','insurance_policies','documents','lab_results','prescription_items','medications',
                           'vaccinations','imaging_reports','conditions','allergies','carers'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
  end loop;
end $$;
drop function if exists public.audit_row();
drop policy if exists people_admin_read on public.people;
drop table if exists public.audit_log;
commit;
