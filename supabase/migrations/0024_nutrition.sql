-- Family Bantay: food, water and salt goals (session 8, W3 nutrition). Written only; Lloyd applies it. Safe to run twice. Undo: 0024_nutrition.down.sql.
-- Needs 0001 (people, is_self, is_carer_of, is_writer_of) and 0002 (is_admin). Fresh, so it does not depend on 0022 or 0023.
--
-- Rules (same shape as public.activity, 0003)
-- * The person and their carers read. The person, a writer carer and an admin write. An admin also reads, like readings (0008).
-- * anon gets nothing.
-- * A food row is a snapshot: the nutrients are already multiplied by the portion on the phone, so a later change to the food list never rewrites history.
-- * Unknown is null, never 0 (kcal, sodium, potassium, protein). A phone logs a food it has numbers for, but a row may have none.
-- * No hard delete over REST for the two entry tables: a delete is deleted_at (soft), so the other phones learn it is gone. Tombstones stay readable for the same reason.
-- * person_id, client_id and created_at never change after insert (trigger), so a writer cannot move a row to another person.
-- * Archived people (0022): these tables behave exactly like activity. The people row stays, so rows stay; phones simply stop listing the person.
begin;

create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  eaten_at timestamptz not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  food_key text check (food_key is null or char_length(food_key) between 1 and 60),
  name text not null check (char_length(name) between 1 and 120),
  portion numeric not null default 1 check (portion > 0 and portion <= 10),
  serving_label text check (serving_label is null or char_length(serving_label) <= 80),
  kcal numeric check (kcal is null or kcal >= 0),
  sodium_mg numeric check (sodium_mg is null or sodium_mg >= 0),
  potassium_mg numeric check (potassium_mg is null or potassium_mg >= 0),
  protein_g numeric check (protein_g is null or protein_g >= 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists food_entries_person_time on public.food_entries (person_id, eaten_at desc);
create index if not exists food_entries_updated on public.food_entries (updated_at);

create table if not exists public.water_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid unique not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  drunk_at timestamptz not null,
  ml integer not null check (ml > 0 and ml <= 5000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists water_entries_person_time on public.water_entries (person_id, drunk_at desc);
create index if not exists water_entries_updated on public.water_entries (updated_at);

-- One row per person. 2000 mg is the WHO ceiling for adults (https://www.who.int/news-room/fact-sheets/detail/salt-reduction); 1500 mg is the lower option the app offers. A doctor's number wins.
create table if not exists public.nutrition_goals (
  person_id uuid primary key references public.people (id) on delete cascade,
  sodium_mg integer not null default 2000 check (sodium_mg between 500 and 5000),
  water_ml integer not null default 1500 check (water_ml between 250 and 6000),
  updated_at timestamptz not null default now()
);
create index if not exists nutrition_goals_updated on public.nutrition_goals (updated_at);

create or replace function public.nutrition_touch() returns trigger
  language plpgsql set search_path = '' as $$
  begin
    new.updated_at := clock_timestamp(); -- not now(): two edits in one transaction must still order
    if new.person_id is distinct from old.person_id then raise exception 'person_id cannot change'; end if;
    if tg_table_name <> 'nutrition_goals' then
      new.created_at := old.created_at;
      if new.client_id is distinct from old.client_id then raise exception 'client_id cannot change'; end if;
    end if;
    return new;
  end $$;

do $$ declare t text; begin
  foreach t in array array['food_entries', 'water_entries', 'nutrition_goals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_self(person_id) or public.is_carer_of(person_id) or public.is_admin())', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_self(person_id) or public.is_writer_of(person_id) or public.is_admin())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_self(person_id) or public.is_writer_of(person_id) or public.is_admin()) with check (public.is_self(person_id) or public.is_writer_of(person_id) or public.is_admin())', t || '_update', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.nutrition_touch()', t || '_touch', t);
  end loop;
end $$;

commit;
