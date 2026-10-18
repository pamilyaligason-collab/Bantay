-- Family Bantay records database (P4, D-36, D-37, D-45, D-47). Written only; Lloyd applies it with the CLI block.
-- Needs 0001 (people, carers, is_self, is_carer_of, is_writer_of, readings), 0002 (is_admin), 0003 (client_id on readings).
--
-- Rules
-- * Every health row has status draft | confirmed | rejected. Imports land as draft (the confirm queue).
--   Nothing counts in trends or alerts until a person confirms it (D-36): only a confirmed lab result with a
--   test code and a number is copied into public.readings, which is what Health and Records already chart.
-- * Who may edit a person's records (records_editor): the person, a writer carer (D-14, D-42), or an admin
--   (D-34 admins see all members' health; D-37 the admin records manager fixes extracted values).
-- * Who may read: editors see everything; a read-only carer (D-22) sees confirmed rows only; strangers and anon nothing.
-- * confirmed_by / confirmed_at are stamped by a trigger from auth.uid(), so nobody can confirm as someone else.
--   created_by can never change after insert. Server-side loads (postgres role, no auth.uid()) may only insert drafts.
-- * No names, values or ids in any log or notification (B-7). Unknown stays null (B-5).

-- ---------- access helpers ----------
create function public.records_editor(pid uuid) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select public.is_self(pid) or public.is_writer_of(pid) or public.is_admin() $$;
create function public.records_reader(pid uuid, st text) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select public.records_editor(pid) or (st = 'confirmed' and public.is_carer_of(pid)) $$;
revoke execute on function public.records_editor(uuid), public.records_reader(uuid, text) from public, anon;
grant execute on function public.records_editor(uuid), public.records_reader(uuid, text) to authenticated;

-- ---------- reference data (no health values) ----------
create table public.test_catalog (
  code text primary key check (code ~ '^[a-z0-9_]{1,40}$'), -- same keys as src/data/guide-ranges.json where one exists
  name text not null,
  loinc text,                       -- null when not verified (B-5)
  unit text not null,               -- canonical unit for trends
  aliases text[] not null default '{}', -- lower-case names as printed by labs
  conversions jsonb not null default '{}' -- {"mmol/L": 18.016} : canonical = value * factor
);
insert into public.test_catalog (code, name, loinc, unit, aliases, conversions) values
  ('fasting_glucose', 'Fasting glucose', '1558-6', 'mg/dL', '{fbs,"fasting blood sugar","fasting glucose","glucose fasting"}', '{"mmol/L": 18.016}'),
  ('random_glucose', 'Random glucose', '2345-7', 'mg/dL', '{rbs,"random blood sugar","glucose random"}', '{"mmol/L": 18.016}'),
  ('hba1c', 'HbA1c', '4548-4', '%', '{hba1c,"hba1c ngsp","glycated hemoglobin","glycosylated hemoglobin"}', '{}'),
  ('total_cholesterol', 'Total cholesterol', '2093-3', 'mg/dL', '{cholesterol,"total cholesterol"}', '{"mmol/L": 38.67}'),
  ('ldl', 'LDL cholesterol', '13457-7', 'mg/dL', '{ldl,"ldl cholesterol","ldl-c"}', '{"mmol/L": 38.67}'),
  ('hdl', 'HDL cholesterol', '2085-9', 'mg/dL', '{hdl,"hdl cholesterol","hdl-c"}', '{"mmol/L": 38.67}'),
  ('triglycerides', 'Triglycerides', '2571-8', 'mg/dL', '{triglycerides,trigly,tg}', '{"mmol/L": 88.57}'),
  ('creatinine', 'Creatinine', '2160-0', 'mg/dL', '{creatinine,crea,createnine}', '{"umol/L": 0.011312}'),
  ('egfr', 'eGFR', null, 'mL/min/1.73 m2', '{egfr}', '{}'),
  ('bun', 'Blood urea nitrogen', '3094-0', 'mg/dL', '{bun,"blood urea nitrogen"}', '{"mmol/L": 2.801}'),
  ('uric_acid', 'Uric acid', '3084-1', 'mg/dL', '{"uric acid",bua}', '{"umol/L": 0.016811}'),
  ('alt', 'ALT (SGPT)', '1742-6', 'U/L', '{alt,sgpt,"alt/sgpt"}', '{"IU/L": 1}'),
  ('ast', 'AST (SGOT)', '1920-8', 'U/L', '{ast,sgot,"ast/sgot"}', '{"IU/L": 1}'),
  ('hemoglobin', 'Hemoglobin', '718-7', 'g/L', '{hemoglobin,hgb,hb}', '{"g/dL": 10}'),
  ('hematocrit', 'Hematocrit', '4544-3', 'L/L', '{hematocrit,hct}', '{"%": 0.01}'),
  ('rbc', 'Red blood cells', '789-8', 'x10^12/L', '{rbc,"red blood cells"}', '{}'),
  ('wbc', 'White blood cells', '6690-2', 'x10^9/L', '{wbc,"white blood cells"}', '{}'),
  ('platelets', 'Platelets', '777-3', 'x10^9/L', '{platelets,plt,"platelet count"}', '{}'),
  ('tsh', 'TSH', '3016-3', 'mIU/L', '{tsh}', '{"uIU/mL": 1}');
-- ponytail: LOINC codes above are the common serum/blood codes; a wrong mapping only affects the "learn more" link,
-- never a value. Differential counts, urinalysis and the rest stay as name_raw until an admin adds a code.

-- ---------- source files (one row per Drive file that is health-related; IDs, land, funds never enter) ----------
create table public.source_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid references public.people (id) on delete cascade, -- null until the alias map assigns it (admin only)
  drive_file_id text not null unique,
  drive_modified_at timestamptz,     -- incremental re-sync: re-read only when this changes
  name text not null,
  mime text not null,
  size_bytes bigint,
  md5 text,                          -- from Drive metadata
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  duplicate_of uuid references public.source_files (id) on delete set null,
  document_id uuid,                  -- FK added below (documents is created later)
  ingest_status text not null default 'new'
    check (ingest_status in ('new', 'extracted', 'queued', 'done', 'skipped', 'failed')),
  skip_reason text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index source_files_sha256 on public.source_files (sha256);

-- ---------- shared shape for every health row ----------
-- id, client_id (outbox idempotency), person_id, status, confidence, confirmed_by/at, created_by/at, updated_at.
create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  occurred_on date,                  -- null when the folder had no full date
  kind text not null check (kind in ('consult', 'lab', 'imaging', 'vaccination', 'admission', 'other')),
  facility text,
  provider text,
  reason text,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  encounter_id uuid references public.encounters (id) on delete set null,
  kind text not null check (kind in ('lab', 'prescription', 'lab_request', 'imaging', 'vaccination', 'insurance', 'certificate', 'other')),
  doc_date date,
  collected_at timestamptz,
  released_at timestamptz,
  facility text,
  title text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.source_files add constraint source_files_document_fk
  foreign key (document_id) references public.documents (id) on delete set null;

create table public.lab_panels (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  panel_id uuid references public.lab_panels (id) on delete set null,
  test_code text references public.test_catalog (code) on update cascade, -- null until mapped; unmapped never trends
  name_raw text not null,            -- as printed
  value_num numeric,
  value_text text,                   -- "negative", "1+", "trace" ...
  unit_raw text,
  value_canonical numeric,           -- in test_catalog.unit (unit normaliser); null when no safe conversion
  flag text check (flag in ('H', 'L', 'N', 'A')),
  ref_low numeric,                   -- the lab's own range, as printed, in unit_raw (D-9)
  ref_high numeric,
  ref_text text,
  collected_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (value_num is not null or value_text is not null)
);
create index lab_results_person_test on public.lab_results (person_id, test_code, collected_at desc);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  encounter_id uuid references public.encounters (id) on delete set null,
  rx_date date,
  prescriber text,
  follow_up_on date,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- D-47: each line is a draft until a person checks it against the photo crop.
create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  prescription_id uuid not null references public.prescriptions (id) on delete cascade,
  line_no int not null check (line_no > 0),
  drug_raw text,                     -- as read
  generic_name text,                 -- RA 6675 generic
  brand text,
  strength text,
  form text,
  dose text,
  frequency text,
  duration text,
  quantity text,
  instructions text,
  crop jsonb,                        -- {"page":1,"x":..,"y":..,"w":..,"h":..} on the source image, 0..1
  unclear boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prescription_id, line_no)
);

-- D-45: the one home for medicines (Health > Medicines). Stock reminder at 25% of one month (D-40.2).
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  name text not null,
  generic_name text,
  strength text,
  form text,
  dose text,
  schedule jsonb not null default '[]', -- ["08:00","20:00"]; empty = as needed
  as_needed boolean not null default false,
  per_day numeric check (per_day >= 0), -- units used per day, for stock days-left
  stock_qty numeric check (stock_qty >= 0),
  stock_unit text,
  stock_set_at timestamptz,
  med_status text not null default 'active' check (med_status in ('active', 'paused', 'stopped')),
  started_on date,
  stopped_on date,
  source_item_id uuid references public.prescription_items (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vaccinations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  vaccine text not null,
  dose_no int check (dose_no > 0),
  given_on date,
  facility text,
  lot text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.imaging_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  modality text check (modality in ('ultrasound', 'xray', 'ct', 'mri', 'ecg', 'echo', 'other')),
  body_region text,
  findings text,
  impression text,
  measurements jsonb,
  reported_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  starts_at timestamptz,
  due_on date,                       -- "follow up in 2 weeks" when no exact time
  provider text,
  facility text,
  purpose text,
  appt_status text not null default 'planned' check (appt_status in ('planned', 'done', 'missed', 'cancelled')),
  source_prescription_id uuid references public.prescriptions (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at is not null or due_on is not null)
);

create table public.conditions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  name text not null,
  onset_on date,
  cond_status text not null default 'active' check (cond_status in ('active', 'resolved', 'unknown')),
  notes text,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "None recorded" is the absence of rows (D-48); a confirmed "no known allergies" is substance = 'none'.
create table public.allergies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  substance text not null,
  reaction text,
  severity text check (severity in ('mild', 'moderate', 'severe', 'unknown')),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  carrier text,
  plan text,
  member_no text,
  valid_from date,
  valid_to date,
  source_file_id uuid references public.source_files (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Name spellings seen on documents -> person. Admin only (it is the import alias map).
create table public.person_aliases (
  alias text primary key check (alias = lower(btrim(alias))),
  person_id uuid not null references public.people (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Confirmed lab results feed the existing trend table. One reading per lab result.
alter table public.readings add column lab_result_id uuid unique references public.lab_results (id) on delete cascade;
-- Phones pull by updated_at and drop rows with deleted_at, so a fixed or rejected result reaches every device.
alter table public.readings add column updated_at timestamptz not null default now(), add column deleted_at timestamptz;
create index readings_updated_at on public.readings (updated_at);

-- ---------- triggers ----------
-- Stamp confirm fields from the caller, freeze created_by/person ownership stamps, keep updated_at.
create function public.records_stamp() returns trigger
  language plpgsql set search_path = '' as
  $$ begin
       -- FK actions (a deleted auth user -> set null) and maintenance run without a user: let them through.
       if tg_op = 'UPDATE' and auth.uid() is null then new.updated_at := now(); return new; end if;
       if tg_op = 'INSERT' then
         if auth.uid() is not null then new.created_by := auth.uid(); end if;
       else
         if new.person_id is distinct from old.person_id then raise exception 'person_frozen' using errcode = '23514'; end if;
         new.created_by := old.created_by;
         new.created_at := old.created_at;
         new.client_id := old.client_id;
       end if;
       new.updated_at := now();
       if new.status = 'confirmed' then
         if auth.uid() is null then raise exception 'confirm_needs_user' using errcode = '42501'; end if;
         new.confirmed_by := auth.uid(); new.confirmed_at := now(); -- any write to a confirmed row re-stamps it: the last editor vouches for the value
       else
         new.confirmed_by := null; new.confirmed_at := null;
       end if;
       return new;
     end $$;

-- source_files has no status; it only keeps created_by and updated_at honest.
create function public.source_files_stamp() returns trigger
  language plpgsql set search_path = '' as
  $$ begin
       if tg_op = 'UPDATE' and auth.uid() is null then new.updated_at := now(); return new; end if;
       if tg_op = 'INSERT' then
         if auth.uid() is not null then new.created_by := auth.uid(); end if;
       else
         -- a file may be assigned once (null -> person), never moved between people by a user
         if old.person_id is not null and new.person_id is distinct from old.person_id then raise exception 'person_frozen' using errcode = '23514'; end if;
         new.created_by := old.created_by; new.created_at := old.created_at; new.client_id := old.client_id;
       end if;
       new.updated_at := now();
       return new;
     end $$;
create trigger source_files_stamp before insert or update on public.source_files
  for each row execute function public.source_files_stamp();

do $$ declare t text; begin
  foreach t in array array['encounters','documents','lab_panels','lab_results','prescriptions','prescription_items','medications',
                           'vaccinations','imaging_reports','appointments','conditions','allergies','insurance_policies'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.records_stamp()', t || '_stamp', t);
  end loop;
end $$;

-- A child row must belong to the same person as its parent (stops attaching a result to someone else's document).
create function public.records_same_person() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ declare parent uuid; begin
       if tg_table_name = 'lab_results' then
         if new.document_id is not null then select person_id into parent from public.documents where id = new.document_id;
           if parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
         if new.panel_id is not null then select person_id into parent from public.lab_panels where id = new.panel_id;
           if parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
       elsif tg_table_name = 'prescription_items' then
         select person_id into parent from public.prescriptions where id = new.prescription_id;
         if parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if;
       elsif tg_table_name = 'medications' then
         if new.source_item_id is not null then select person_id into parent from public.prescription_items where id = new.source_item_id;
           if parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
       elsif tg_table_name = 'appointments' then
         if new.source_prescription_id is not null then select person_id into parent from public.prescriptions where id = new.source_prescription_id;
           if parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
       elsif tg_table_name = 'documents' then
         if new.encounter_id is not null then select person_id into parent from public.encounters where id = new.encounter_id;
           if parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
       elsif tg_table_name = 'source_files' then
         if new.document_id is not null then select person_id into parent from public.documents where id = new.document_id;
           if new.person_id is distinct from parent then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
         if new.duplicate_of is not null then select person_id into parent from public.source_files where id = new.duplicate_of;
           if parent is not null and new.person_id is not null and parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
       elsif tg_table_name = 'insurance_policies' then
         if new.source_file_id is not null then select person_id into parent from public.source_files where id = new.source_file_id;
           if parent is not null and parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
       else -- lab_panels, prescriptions, vaccinations, imaging_reports: document_id
         if new.document_id is not null then select person_id into parent from public.documents where id = new.document_id;
           if parent is distinct from new.person_id then raise exception 'person_mismatch' using errcode = '23514'; end if; end if;
       end if;
       return new;
     end $$;
do $$ declare t text; begin
  foreach t in array array['source_files','documents','lab_panels','lab_results','prescriptions','prescription_items','medications',
                           'vaccinations','imaging_reports','appointments','insurance_policies'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.records_same_person()', t || '_same_person', t);
  end loop;
end $$;

-- Confirmed + mapped + numeric lab result -> one readings row (the trend). Leaving confirmed removes it.
create function public.lab_result_to_reading() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ declare v numeric; u text; begin
       select unit into u from public.test_catalog where code = new.test_code;
       -- trends only in the canonical unit: a value that could not be converted stays out (no 88 umol/L beside 0.99 mg/dL)
       if not (new.status = 'confirmed' and new.test_code is not null
               and (new.value_canonical is not null or (new.value_num is not null and new.unit_raw is not distinct from u))) then
         update public.readings set deleted_at = now(), updated_at = now() where lab_result_id = new.id and deleted_at is null;
         return null;
       end if;
         v := coalesce(new.value_canonical, new.value_num);
         insert into public.readings (person_id, taken_at, test, value, unit, lab_low, lab_high, source_file_id,
                                      confidence, confirmed_by, confirmed_at, lab_result_id)
         values (new.person_id,
                 coalesce(new.collected_at, (select coalesce(d.collected_at, (d.doc_date + time '08:00') at time zone 'Asia/Manila') from public.documents d where d.id = new.document_id), new.created_at),
                 new.test_code, v,
                 u,
                 -- the lab range is in unit_raw; only carry it when that is the canonical unit
                 case when new.unit_raw is not distinct from u then new.ref_low end,
                 case when new.unit_raw is not distinct from u then new.ref_high end,
                 (select sf.drive_file_id from public.source_files sf where sf.document_id = new.document_id order by sf.name limit 1),
                 new.confidence, new.confirmed_by, new.confirmed_at, new.id)
         -- update in place so the reading keeps its id and client_id (the phone matches on them)
         on conflict (lab_result_id) do update set
           person_id = excluded.person_id, taken_at = excluded.taken_at, test = excluded.test, value = excluded.value,
           unit = excluded.unit, lab_low = excluded.lab_low, lab_high = excluded.lab_high, source_file_id = excluded.source_file_id,
           confidence = excluded.confidence, confirmed_by = excluded.confirmed_by, confirmed_at = excluded.confirmed_at,
           deleted_at = null, updated_at = now();
       return null;
     end $$;
create trigger lab_results_to_reading after insert or update on public.lab_results
  for each row execute function public.lab_result_to_reading();

revoke execute on function public.records_stamp(), public.source_files_stamp(), public.records_same_person(),
  public.lab_result_to_reading() from public, anon, authenticated;

-- ---------- RLS ----------
alter table public.test_catalog enable row level security;
alter table public.person_aliases enable row level security;
alter table public.source_files enable row level security;
revoke all on public.test_catalog, public.person_aliases, public.source_files from anon;
grant select, insert, update, delete on public.test_catalog, public.person_aliases, public.source_files to authenticated;

create policy test_catalog_read on public.test_catalog for select to authenticated using (true);
create policy test_catalog_write on public.test_catalog for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy person_aliases_admin on public.person_aliases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- An unassigned file (person_id null) is admin only.
create policy source_files_read on public.source_files for select to authenticated
  using (public.is_admin() or (person_id is not null and public.records_editor(person_id)));
create policy source_files_insert on public.source_files for insert to authenticated
  with check (public.is_admin() or (person_id is not null and public.records_editor(person_id)));
create policy source_files_update on public.source_files for update to authenticated
  using (public.is_admin() or (person_id is not null and public.records_editor(person_id)))
  with check (public.is_admin() or (person_id is not null and public.records_editor(person_id)));
create policy source_files_delete on public.source_files for delete to authenticated using (public.is_admin());

do $$ declare t text; begin
  foreach t in array array['encounters','documents','lab_panels','lab_results','prescriptions','prescription_items','medications',
                           'vaccinations','imaging_reports','appointments','conditions','allergies','insurance_policies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create unique index %I on public.%I (client_id)', t || '_client_id', t);
    execute format('create index %I on public.%I (person_id, status)', t || '_person_status', t);
    execute format('create index %I on public.%I (updated_at)', t || '_updated_at', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.records_reader(person_id, status))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.records_editor(person_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.records_editor(person_id)) with check (public.records_editor(person_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.records_editor(person_id))', t || '_delete', t);
  end loop;
end $$;

create index source_files_person on public.source_files (person_id);
create index source_files_document on public.source_files (document_id);
create index lab_results_document on public.lab_results (document_id);
create index lab_results_panel on public.lab_results (panel_id);
create index lab_panels_document on public.lab_panels (document_id);
create index documents_encounter on public.documents (encounter_id);
create index prescriptions_document on public.prescriptions (document_id);
create index person_aliases_person on public.person_aliases (person_id);

-- Admins read readings too (D-34), so the records manager can see what a confirm produced. Writes stay with 0001 rules.
create policy readings_admin_read on public.readings for select to authenticated using (public.is_admin());

-- Confirm queue counts per person, no values (admin home and the Records badge).
create view public.records_queue with (security_invoker = true) as
  select person_id, 'lab_results'::text as kind, count(*) as drafts from public.lab_results where status = 'draft' group by person_id
  union all select person_id, 'prescription_items', count(*) from public.prescription_items where status = 'draft' group by person_id
  union all select person_id, 'documents', count(*) from public.documents where status = 'draft' group by person_id
  union all select person_id, 'imaging_reports', count(*) from public.imaging_reports where status = 'draft' group by person_id
  union all select person_id, 'vaccinations', count(*) from public.vaccinations where status = 'draft' group by person_id;
revoke all on public.records_queue from anon;
grant select on public.records_queue to authenticated;
