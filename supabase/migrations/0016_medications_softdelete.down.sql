-- Undo 0016_medications_softdelete.sql: put back the 0014 converter (hard delete). Tombstones the 0016 converter made
-- stay as they are (they are already gone from phones). Safe to run twice.
create or replace function public.rx_to_medications(p_person uuid default null) returns void
  language plpgsql security definer set search_path = '' as
  $$ declare k record; w record; cur record; t text[]; prn boolean; days int; st text; stop date; sched jsonb; nm text; begin
       perform set_config('bantay.converter', 'on', true);
       -- links whose item now names another drug (or was rejected) no longer hold the medication
       delete from public.medication_sources s using public.prescription_items i
         where i.id = s.item_id and (p_person is null or i.person_id = p_person)
           and (i.status = 'rejected' or public.normalise_drug(coalesce(i.drug_raw, i.generic_name)) is distinct from s.drug_key);
       for k in
         select i.person_id, public.normalise_drug(coalesce(i.drug_raw, i.generic_name)) as drug
         from public.prescription_items i
         where i.status <> 'rejected' and (p_person is null or i.person_id = p_person)
           and public.normalise_drug(coalesce(i.drug_raw, i.generic_name)) is not null
         group by 1, 2
       loop
         select i.*, r.rx_date into w
           from public.prescription_items i join public.prescriptions r on r.id = i.prescription_id
           where i.person_id = k.person_id and i.status <> 'rejected'
             and public.normalise_drug(coalesce(i.drug_raw, i.generic_name)) = k.drug
           order by r.rx_date desc nulls last, i.created_at desc, i.line_no
           limit 1;
         t := public.rx_times(w.frequency);
         prn := t is not null and cardinality(t) = 0;
         days := public.rx_days(w.duration);
         stop := case when days is not null and w.rx_date is not null then w.rx_date + days end;
         -- a fixed-length course with no prescription date has almost surely ended: paused (no reminder) until answered
         st := case when stop is not null and stop < current_date then 'stopped'
                    when days is not null and w.rx_date is null then 'paused'
                    else 'active' end;
         nm := btrim(coalesce(w.drug_raw, w.generic_name));

         cur := null;
         select m.* into cur from public.medications m join public.medication_sources s on s.medication_id = m.id
           where m.person_id = k.person_id and s.drug_key = k.drug
           order by m.deleted_at nulls first, m.created_at limit 1;
         if cur.id is null then
           select * into cur from public.medications
             where person_id = k.person_id and public.normalise_drug(name) = k.drug
             order by deleted_at nulls first, created_at limit 1;
         end if;

         sched := jsonb_strip_nulls(jsonb_build_object(
           'v', 1,
           'times', to_jsonb(coalesce(t, '{}'::text[])),
           'needs_time', case when t is null then true end,
           'needs_check', case when w.unclear then true end,
           'review', case when st <> 'stopped' then true end,
           'review_since', case when st <> 'stopped' then coalesce((cur.schedule ->> 'review_since')::date, current_date) end));

         if cur.id is null then
           insert into public.medications (person_id, name, generic_name, strength, form, dose, schedule, as_needed, per_day,
                                           stock_qty, med_status, started_on, stopped_on, source_item_id,
                                           status, confidence, confirmed_source, origin)
           values (k.person_id, nm, w.generic_name, w.strength, w.form, w.dose, sched, prn,
                   case when t is not null and cardinality(t) > 0 then cardinality(t) end,
                   case when w.quantity ~ '^\s*[0-9]+([.][0-9]+)?\s*$' then btrim(w.quantity)::numeric end,
                   st, w.rx_date, case when st = 'stopped' then stop end, w.id,
                   'confirmed', 1, 'auto', 'rx')
           returning * into cur;
         elsif cur.deleted_at is null and cur.edited_at is null and cur.origin = 'rx'
               and (cur.name, cur.generic_name, cur.strength, cur.form, cur.dose, cur.schedule, cur.as_needed, cur.per_day,
                    cur.med_status, cur.started_on, cur.stopped_on, cur.source_item_id)
                   is distinct from
                   (nm, w.generic_name, w.strength, w.form, w.dose, sched, prn,
                    case when t is not null and cardinality(t) > 0 then cardinality(t) end::numeric,
                    st, w.rx_date, case when st = 'stopped' then stop end, w.id) then
           update public.medications set
             name = nm, generic_name = w.generic_name, strength = w.strength, form = w.form, dose = w.dose,
             schedule = sched, as_needed = prn,
             per_day = case when t is not null and cardinality(t) > 0 then cardinality(t) end,
             med_status = st, started_on = w.rx_date, stopped_on = case when st = 'stopped' then stop end, source_item_id = w.id
           where id = cur.id;
         end if;
         insert into public.medication_sources (medication_id, item_id, drug_key)
           select cur.id, i.id, k.drug from public.prescription_items i
           where i.person_id = k.person_id and i.status <> 'rejected'
             and public.normalise_drug(coalesce(i.drug_raw, i.generic_name)) = k.drug
           on conflict do nothing;
       end loop;

       -- an unedited converted medication with no live source left (all rejected, renamed or gone) is removed
       delete from public.medications m
         where m.origin = 'rx' and m.edited_at is null and m.deleted_at is null
           and (p_person is null or m.person_id = p_person)
           and not exists (select 1 from public.medication_sources s where s.medication_id = m.id);
       perform set_config('bantay.converter', 'off', true);
     end $$;
revoke execute on function public.rx_to_medications(uuid) from public, anon, authenticated;
