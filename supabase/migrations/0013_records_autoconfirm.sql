-- Family Bantay records auto-confirm and full family profiles (B7, D-68). Written only; Lloyd applies it with the CLI block.
-- Needs 0001, 0002, 0008 (records, records_stamp), 0010 (people profile). Safe to run twice.
--
-- Rules
-- * D-68 amends the draft-only import rule: the server-side loader (no auth.uid(), e.g. the postgres role) may insert or
--   update a row as 'confirmed' only when it also sets confirmed_source = 'auto' and the row's confidence is a number at or
--   above public.records_auto_threshold() (0.9). The loader decides who the row belongs to; the database only enforces the
--   confidence floor and that nobody can vouch as a person they are not.
-- * An auto-confirmed row has confirmed_at stamped, confirmed_by NULL (there is no user) and confirmed_source 'auto': that is
--   the system actor. When a signed-in person writes the row (edits it, re-confirms it) the trigger re-stamps it as theirs:
--   confirmed_by = auth.uid(), confirmed_source = 'user'. A signed-in person can never write 'auto'.
-- * Draft and rejected keep their meaning: both clear confirmed_by, confirmed_at and confirmed_source. RLS is unchanged:
--   editors write, read-only carers see confirmed rows only (and never id_card / insurance_card documents).
-- * Existing confirmed rows keep confirmed_source NULL (= confirmed by a person before this migration).
-- * people gets the rest of the profile (aliases, sex, address), editable by the same editors as 0010.
-- * person_identifiers holds ID and insurance numbers. D-63 said Bantay never stores them; D-68 stores them here only, behind
--   records_editor (the person, a writer carer, or an admin). Read-only carers and strangers get nothing, even once confirmed.

create or replace function public.records_auto_threshold() returns numeric
  language sql immutable as $$ select 0.9::numeric $$;

-- ---------- people: rest of the profile ----------
alter table public.people
  add column if not exists aliases text[] not null default '{}',
  add column if not exists sex text,
  add column if not exists address text;
do $$ begin
  alter table public.people add constraint people_sex_check check (sex is null or sex in ('female', 'male'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.people add constraint people_profile2_size_check
    check (cardinality(aliases) <= 20 and char_length(address) <= 300);
exception when duplicate_object then null; end $$;
grant update (aliases, sex, address) on public.people to authenticated; -- people_update (0010) still limits it to records_editor

-- ---------- person_identifiers ----------
create table if not exists public.person_identifiers (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  id_type text not null check (id_type in ('philsys', 'senior', 'pwd', 'drivers', 'passport', 'umid', 'voters', 'postal',
                                           'philhealth', 'hmo', 'tin', 'sss', 'other')),
  id_number text not null check (char_length(id_number) between 3 and 60),
  issued_on date,
  expires_on date,
  source_file_id uuid references public.source_files (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'rejected')),
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, id_type, id_number)
);

-- ---------- confirmed_source on every records table ----------
do $$ declare t text; begin
  foreach t in array array['encounters','documents','lab_panels','lab_results','prescriptions','prescription_items','medications',
                           'vaccinations','imaging_reports','appointments','conditions','allergies','insurance_policies','person_identifiers'] loop
    execute format('alter table public.%I add column if not exists confirmed_source text', t);
    begin
      execute format('alter table public.%I add constraint %I check (confirmed_source is null or confirmed_source in (''user'', ''auto''))', t, t || '_confirmed_source_check');
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ---------- the stamp trigger, with auto-confirm ----------
create or replace function public.records_stamp() returns trigger
  language plpgsql set search_path = '' as
  $$ begin
       if tg_op = 'UPDATE' and auth.uid() is null then
         -- FK actions (a deleted auth user -> set null) and maintenance run without a user. They never confirm a row
         -- by themselves: only the auto path below (confirmed_source = 'auto' and confidence at the floor).
         if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
           if new.confirmed_source is distinct from 'auto' or new.confidence is null or new.confidence < public.records_auto_threshold() then
             raise exception 'confirm_needs_user' using errcode = '42501';
           end if;
           new.confirmed_by := null; new.confirmed_at := now();
         elsif new.status is distinct from 'confirmed' then
           new.confirmed_by := null; new.confirmed_at := null; new.confirmed_source := null;
         end if;
         new.updated_at := now(); return new;
       end if;
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
         if auth.uid() is null then
           if new.confirmed_source is distinct from 'auto' or new.confidence is null or new.confidence < public.records_auto_threshold() then
             raise exception 'confirm_needs_user' using errcode = '42501';
           end if;
           new.confirmed_by := null; new.confirmed_at := now(); -- system actor: confirmed_source = 'auto'
         else
           new.confirmed_by := auth.uid(); new.confirmed_at := now(); new.confirmed_source := 'user'; -- any write to a confirmed row re-stamps it: the last editor vouches for the value
         end if;
       else
         new.confirmed_by := null; new.confirmed_at := null; new.confirmed_source := null;
       end if;
       return new;
     end $$;

drop trigger if exists person_identifiers_stamp on public.person_identifiers;
create trigger person_identifiers_stamp before insert or update on public.person_identifiers
  for each row execute function public.records_stamp();

-- ---------- RLS for person_identifiers: editors only ----------
alter table public.person_identifiers enable row level security;
revoke all on public.person_identifiers from anon;
grant select, insert, update, delete on public.person_identifiers to authenticated;
create unique index if not exists person_identifiers_client_id on public.person_identifiers (client_id);
create index if not exists person_identifiers_person_status on public.person_identifiers (person_id, status);
drop policy if exists person_identifiers_read on public.person_identifiers;
create policy person_identifiers_read on public.person_identifiers for select to authenticated using (public.records_editor(person_id));
drop policy if exists person_identifiers_insert on public.person_identifiers;
create policy person_identifiers_insert on public.person_identifiers for insert to authenticated with check (public.records_editor(person_id));
drop policy if exists person_identifiers_update on public.person_identifiers;
create policy person_identifiers_update on public.person_identifiers for update to authenticated
  using (public.records_editor(person_id)) with check (public.records_editor(person_id));
drop policy if exists person_identifiers_delete on public.person_identifiers;
create policy person_identifiers_delete on public.person_identifiers for delete to authenticated using (public.records_editor(person_id));
