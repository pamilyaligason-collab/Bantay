-- Family Bantay: medications become the one live schedule (session 6, D1 and D5; docs/session-6/PART-3.md section 1).
-- Needs 0001, 0003 (meds_taken), 0008 (records tables, records_stamp), 0010 (people.medicines), 0013 (confirmed_source).
-- Written only; Lloyd applies it with the CLI block. Safe to run twice. Undo: 0014_medications_live.down.sql.
--
-- Rules
-- * Every prescription item that is not rejected becomes one medication per person per drug (D1 auto-convert).
--   The drug key is normalise_drug(name): lower case, strength and form words removed. The newest prescription wins
--   (a null rx_date ranks oldest); every contributing item is linked in medication_sources.
-- * Times come from the frequency text only (no item has a clock time). Unknown frequency -> no time and
--   needs_time; it is never guessed (B-5). As needed -> as_needed, no times. A course whose end has passed -> stopped;
--   a fixed-length course with no prescription date -> paused (no reminder) until someone answers.
-- * Converted rows are confirmed by the system actor (confirmed_source 'auto', confidence 1, D1), so read-only carers
--   see them. Active ones carry review = true and review_since: "Still taking it?" (D5: reminders stay on, pause
--   3 days after review_since if unanswered; that timing lives in the app).
-- * A row a person edited (edited_at set) or deleted (deleted_at set, a tombstone) is never overwritten or recreated.
--   Edits are logged in medication_changes (who, when, which field). No names or values in any log line (B-7).
-- * Who may edit and read: unchanged 0008 policies (records_editor / records_reader).

-- ---------- columns ----------
alter table public.medications
  add column if not exists origin text not null default 'manual' check (origin in ('rx', 'profile', 'manual')),
  add column if not exists deleted_at timestamptz,
  add column if not exists edited_at timestamptz;
alter table public.medications alter column schedule set default '{"v": 1, "times": []}';

alter table public.meds_taken
  add column if not exists medication_id uuid references public.medications (id) on delete set null,
  add column if not exists slot text check (slot is null or slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add column if not exists skipped boolean not null default false;
revoke update on public.meds_taken from authenticated;
grant update (name, taken_at, medication_id, slot, skipped) on public.meds_taken to authenticated;
create index if not exists meds_taken_medication on public.meds_taken (medication_id, taken_at desc);

-- ---------- pure helpers ----------
create or replace function public.normalise_drug(x text) returns text
  language sql immutable parallel safe set search_path = '' as
  $$ select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(x, '')),
       '[0-9]+([.,][0-9]+)?\s*(mg|mcg|ug|g|ml|iu|units?|%)', ' ', 'g'),
       '\m(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syrup|susp|suspension|drop|drops|cream|ointment|oint|sachet|inhaler|neb|nebule|amp|ampule|vial)\M', ' ', 'g'),
       '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')), '') $$;

create or replace function public.rx_prn(f text) returns boolean
  language sql immutable parallel safe set search_path = '' as
  $$ select coalesce(lower(f) ~ '\m(prn|as needed|if needed|when needed|as required)\M', false) $$;

-- Clock times for a frequency text; NULL when not understood (never guessed); '{}' for as needed only.
-- A fixed pattern wins over "as needed" ("3x a day then as needed" is three times a day). Meal words move a
-- once-a-day dose: after lunch 12:00, after dinner or supper 19:00.
create or replace function public.rx_times(f text) returns text[]
  language sql immutable parallel safe set search_path = '' as
  $$ select case
       when f is null or btrim(f) = '' then null
       when lower(f) ~ '\m(qid|q6h?|4x|four times|4 times)\M' or lower(f) ~ 'every\s*6\s*(h|hr|hrs|hour|hours)\M' then '{08:00,12:00,16:00,20:00}'::text[]
       when lower(f) ~ '\m(tid|q8h?|3x|thrice|three times|3 times)\M' or lower(f) ~ 'every\s*8\s*(h|hr|hrs|hour|hours)\M' then '{08:00,14:00,20:00}'::text[]
       when lower(f) ~ '\m(bid|q12h?|2x|twice|two times|2 times)\M' or lower(f) ~ 'every\s*12\s*(h|hr|hrs|hour|hours)\M' then '{08:00,20:00}'::text[]
       when lower(f) ~ '\m(hs|bedtime|at night|nightly|night)\M' then '{21:00}'::text[]
       when lower(f) ~ '\m(od|qd|once|daily|1x|morning|om|qam|q24h?|every day)\M' or lower(f) ~ 'every\s*24\s*(h|hr|hrs|hour|hours)\M' then
         case when lower(f) ~ '\mlunch\M' then '{12:00}'::text[]
              when lower(f) ~ '\m(dinner|supper)\M' then '{19:00}'::text[]
              else '{08:00}'::text[] end
       when public.rx_prn(f) then '{}'::text[]
       else null end $$;

-- Course length in days from a duration text ("7 days", "2 weeks", "1 month"); NULL when open-ended or unknown.
create or replace function public.rx_days(d text) returns int
  language sql immutable parallel safe set search_path = '' as
  $$ select case
       when lower(d) ~ '([0-9]+)\s*(d|day|days)\M' then (substring(lower(d) from '([0-9]+)\s*(?:d|day|days)\M'))::int
       when lower(d) ~ '([0-9]+)\s*(wk|wks|week|weeks)\M' then (substring(lower(d) from '([0-9]+)\s*(?:wk|wks|week|weeks)\M'))::int * 7
       when lower(d) ~ '([0-9]+)\s*(mo|month|months)\M' then (substring(lower(d) from '([0-9]+)\s*(?:mo|month|months)\M'))::int * 30
       else null end $$;

-- "Vitamin D 8:00 PM" -> {20:00}; 12-hour or 24-hour clock tokens.
create or replace function public.text_times(x text) returns text[]
  language sql immutable parallel safe set search_path = '' as
  $$ select array(
       select distinct lpad(case when m[3] is null then m[1]::int
                                 else (m[1]::int % 12) + case when lower(m[3]) = 'pm' then 12 else 0 end end::text, 2, '0') || ':' || m[2]
       from regexp_matches(coalesce(x, ''), '([0-9]{1,2}):([0-5][0-9])\s*(am|pm|AM|PM)?', 'g') m
       where m[1]::int <= 23
       order by 1) $$;

-- ---------- tables ----------
create table if not exists public.medication_sources (
  medication_id uuid not null references public.medications (id) on delete cascade,
  item_id uuid not null references public.prescription_items (id) on delete cascade,
  primary key (medication_id, item_id)
);
create table if not exists public.medication_changes (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  by uuid references auth.users (id) on delete set null,
  at timestamptz not null default now(),
  field text not null,
  old jsonb,
  new jsonb
);
create index if not exists medication_changes_med on public.medication_changes (medication_id, at desc);
alter table public.medication_sources enable row level security;
alter table public.medication_changes enable row level security;
revoke all on public.medication_sources, public.medication_changes from anon, authenticated;
grant select on public.medication_sources, public.medication_changes to authenticated;
drop policy if exists medication_sources_read on public.medication_sources;
create policy medication_sources_read on public.medication_sources for select to authenticated
  using (exists (select 1 from public.medications m where m.id = medication_id and public.records_reader(m.person_id, m.status)));
drop policy if exists medication_changes_read on public.medication_changes;
create policy medication_changes_read on public.medication_changes for select to authenticated
  using (exists (select 1 from public.medications m where m.id = medication_id and public.records_reader(m.person_id, m.status)));

-- One live medication per person per drug. Tombstones (deleted_at) are kept but do not block a new manual entry.
create unique index if not exists medications_one_per_drug on public.medications (person_id, public.normalise_drug(name))
  where deleted_at is null;

-- ---------- edit tracking ----------
-- A signed-in person's change sets edited_at and is logged; the converter (flag bantay.converter) is not an edit.
create or replace function public.medications_edit_stamp() returns trigger
  language plpgsql set search_path = '' as
  $$ begin
       if auth.uid() is not null and coalesce(current_setting('bantay.converter', true), '') <> 'on'
          and (new.name, new.strength, new.form, new.dose, new.schedule, new.as_needed, new.med_status, new.deleted_at, new.stock_qty)
              is distinct from (old.name, old.strength, old.form, old.dose, old.schedule, old.as_needed, old.med_status, old.deleted_at, old.stock_qty) then
         new.edited_at := now();
       end if;
       return new;
     end $$;
drop trigger if exists medications_edit_stamp on public.medications;
create trigger medications_edit_stamp before update on public.medications for each row execute function public.medications_edit_stamp();

create or replace function public.medications_log_changes() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ declare f text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new); begin
       if auth.uid() is null or coalesce(current_setting('bantay.converter', true), '') = 'on' then return null; end if;
       foreach f in array array['name','strength','form','dose','schedule','as_needed','med_status','deleted_at','stock_qty'] loop
         if o -> f is distinct from n -> f then
           insert into public.medication_changes (medication_id, person_id, by, field, old, new)
             values (new.id, new.person_id, auth.uid(), f, o -> f, n -> f);
         end if;
       end loop;
       return null;
     end $$;
drop trigger if exists medications_log_changes on public.medications;
create trigger medications_log_changes after update on public.medications for each row execute function public.medications_log_changes();

-- A dose can only point at the same person's medicine.
create or replace function public.meds_taken_same_person() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ declare p uuid; begin
       if new.medication_id is not null then
         select person_id into p from public.medications where id = new.medication_id;
         if p is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if;
       end if;
       return new;
     end $$;
drop trigger if exists meds_taken_same_person on public.meds_taken;
create trigger meds_taken_same_person before insert or update on public.meds_taken for each row execute function public.meds_taken_same_person();

-- ---------- the converter ----------
create or replace function public.rx_to_medications(p_person uuid default null) returns void
  language plpgsql security definer set search_path = '' as
  $$ declare k record; w record; cur record; t text[]; prn boolean; days int; st text; stop date; sched jsonb; begin
       perform set_config('bantay.converter', 'on', true);
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
         sched := jsonb_strip_nulls(jsonb_build_object(
           'v', 1,
           'times', to_jsonb(coalesce(t, '{}'::text[])),
           'needs_time', case when t is null then true end,
           'needs_check', case when w.unclear then true end,
           'review', case when st <> 'stopped' then true end,
           'review_since', case when st <> 'stopped' then current_date end));

         select * into cur from public.medications
           where person_id = k.person_id and public.normalise_drug(name) = k.drug
           order by deleted_at nulls first, created_at limit 1;
         if cur.id is null then
           insert into public.medications (person_id, name, generic_name, strength, form, dose, schedule, as_needed, per_day,
                                           stock_qty, med_status, started_on, stopped_on, source_item_id,
                                           status, confidence, confirmed_source, origin)
           values (k.person_id, btrim(coalesce(w.drug_raw, w.generic_name)), w.generic_name, w.strength, w.form, w.dose, sched, prn,
                   case when t is not null and cardinality(t) > 0 then cardinality(t) end,
                   case when w.quantity ~ '^\s*[0-9]+([.][0-9]+)?\s*$' then btrim(w.quantity)::numeric end,
                   st, w.rx_date, case when st = 'stopped' then stop end, w.id,
                   'confirmed', 1, 'auto', 'rx')
           returning * into cur;
         elsif cur.deleted_at is null and cur.edited_at is null and cur.origin = 'rx' and cur.source_item_id is distinct from w.id then
           update public.medications set
             name = btrim(coalesce(w.drug_raw, w.generic_name)), generic_name = w.generic_name, strength = w.strength, form = w.form,
             dose = w.dose, schedule = sched, as_needed = prn,
             per_day = case when t is not null and cardinality(t) > 0 then cardinality(t) end,
             med_status = st, started_on = w.rx_date, stopped_on = case when st = 'stopped' then stop end, source_item_id = w.id
           where id = cur.id;
         end if;
         insert into public.medication_sources (medication_id, item_id)
           select cur.id, i.id from public.prescription_items i
           where i.person_id = k.person_id and public.normalise_drug(coalesce(i.drug_raw, i.generic_name)) = k.drug
           on conflict do nothing;
       end loop;

       -- an unedited converted medication whose every source is now rejected (or gone) is removed
       delete from public.medications m
         where m.origin = 'rx' and m.edited_at is null and m.deleted_at is null
           and (p_person is null or m.person_id = p_person)
           and not exists (select 1 from public.medication_sources s join public.prescription_items i on i.id = s.item_id
                           where s.medication_id = m.id and i.status <> 'rejected');
       perform set_config('bantay.converter', 'off', true);
     end $$;
revoke execute on function public.rx_to_medications(uuid) from public, anon, authenticated;

create or replace function public.prescription_items_convert() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       perform public.rx_to_medications(case when tg_op = 'DELETE' then old.person_id else new.person_id end);
       return null;
     end $$;
drop trigger if exists prescription_items_convert on public.prescription_items;
create trigger prescription_items_convert
  after insert or delete or update of status, drug_raw, generic_name, frequency, duration, quantity, dose, strength, unclear
  on public.prescription_items for each row execute function public.prescription_items_convert();
revoke execute on function public.medications_edit_stamp(), public.medications_log_changes(), public.meds_taken_same_person(),
  public.prescription_items_convert() from public, anon, authenticated;

-- ---------- one-time: profile medicine text -> medications (origin profile) ----------
do $$ declare p record; e text; nm text; t text[]; begin
  perform set_config('bantay.converter', 'on', true);
  for p in select id, medicines from public.people where cardinality(medicines) > 0 loop
    foreach e in array p.medicines loop
      t := public.text_times(e);
      nm := btrim(regexp_replace(e, '[0-9]{1,2}:[0-5][0-9]\s*(am|pm|AM|PM)?', '', 'g'));
      if public.normalise_drug(nm) is not null and not exists (
           select 1 from public.medications where person_id = p.id and public.normalise_drug(name) = public.normalise_drug(nm)) then
        insert into public.medications (person_id, name, schedule, per_day, med_status, status, confidence, confirmed_source, origin)
        values (p.id, nm,
                jsonb_strip_nulls(jsonb_build_object('v', 1, 'times', to_jsonb(t),
                  'needs_time', case when cardinality(t) = 0 then true end, 'review', true, 'review_since', current_date)),
                case when cardinality(t) > 0 then cardinality(t) end, 'active', 'confirmed', 1, 'auto', 'profile');
      end if;
    end loop;
  end loop;
  perform set_config('bantay.converter', 'off', true);
end $$;

-- ---------- one-time: convert everything imported so far ----------
select public.rx_to_medications();
