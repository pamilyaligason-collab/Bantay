-- Family Bantay health tables. Written only; never applied from this lane.
-- Rules: a person reads and writes their own rows; a linked carer reads only unless can_write;
-- a person with no login (elderly parent, child) is created by a carer who becomes their writer (D-14); anon has nothing.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null,
  created_by uuid not null default auth.uid() references auth.users (id), -- restrict: a creator account cannot be deleted while their no-login persons exist
  created_at timestamptz not null default now()
);

create table public.carers (
  carer_id uuid not null references auth.users (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  can_write boolean not null default false,
  primary key (carer_id, person_id)
);

create table public.readings (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  taken_at timestamptz not null,
  test text not null,
  value numeric not null,
  unit text,
  lab_low numeric,
  lab_high numeric,
  source_file_id text,
  drive_url text,
  confidence numeric check (confidence between 0 and 1),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz
);
create index readings_person_test_time on public.readings (person_id, test, taken_at desc);

create table public.consults (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  taken_at timestamptz not null,
  doctor text,
  reason text,
  medicines text[] not null default '{}',
  next_visit date,
  source_file_id text,
  drive_url text,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz
);
create index consults_person_time on public.consults (person_id, taken_at desc);

-- Helpers are security definer with an empty search_path, so policies on people/carers cannot recurse into each other.
create function public.is_self(pid uuid) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.people where id = pid and auth_user_id = auth.uid()) $$;

create function public.is_carer_of(pid uuid) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.carers where person_id = pid and carer_id = auth.uid()) $$;

create function public.is_writer_of(pid uuid) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.carers where person_id = pid and carer_id = auth.uid() and can_write) $$;

-- A person with no login is looked after by whoever created them.
create function public.link_creator() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       if new.auth_user_id is null then
         insert into public.carers (carer_id, person_id, can_write) values (new.created_by, new.id, true);
       end if;
       return new;
     end $$;
create trigger people_link_creator after insert on public.people
  for each row execute function public.link_creator();

revoke execute on function public.is_self(uuid), public.is_carer_of(uuid), public.is_writer_of(uuid), public.link_creator() from public, anon;
grant execute on function public.is_self(uuid), public.is_carer_of(uuid), public.is_writer_of(uuid) to authenticated;

alter table public.people enable row level security;
alter table public.carers enable row level security;
alter table public.readings enable row level security;
alter table public.consults enable row level security;

-- No anon access at all.
revoke all on public.people, public.carers, public.readings, public.consults from anon;
grant select, insert, update, delete on public.people, public.carers, public.readings, public.consults to authenticated;
-- identity columns (auth_user_id, created_by) are never updatable by users: column-level grant
revoke update on public.people from authenticated;
grant update (display_name) on public.people to authenticated;

create policy people_read on public.people for select to authenticated
  using (auth_user_id = auth.uid() or created_by = auth.uid() or public.is_carer_of(id));
create policy people_insert on public.people for insert to authenticated
  with check (created_by = auth.uid() and (auth_user_id = auth.uid() or auth_user_id is null));
create policy people_update on public.people for update to authenticated
  using (auth_user_id = auth.uid() or (auth_user_id is null and public.is_writer_of(id)))
  with check (auth_user_id = auth.uid() or auth_user_id is null);

-- The person, or a writer carer of a no-login person, links and unlinks carers.
-- A read-only carer has no insert, update or delete path, and nobody can edit their own row as a carer,
-- so a carer cannot give themselves can_write.
create policy carers_read on public.carers for select to authenticated
  using (carer_id = auth.uid() or public.is_self(person_id) or public.is_writer_of(person_id));
create policy carers_insert on public.carers for insert to authenticated
  with check (public.is_self(person_id) or public.is_writer_of(person_id));
create policy carers_update on public.carers for update to authenticated
  using (public.is_self(person_id) or (public.is_writer_of(person_id) and carer_id <> auth.uid()))
  with check (public.is_self(person_id) or (public.is_writer_of(person_id) and carer_id <> auth.uid()));
create policy carers_delete on public.carers for delete to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id));

create policy readings_read on public.readings for select to authenticated
  using (public.is_self(person_id) or public.is_carer_of(person_id));
create policy readings_insert on public.readings for insert to authenticated
  with check ((public.is_self(person_id) or public.is_writer_of(person_id)) and (confirmed_by is null or confirmed_by = auth.uid()));
create policy readings_update on public.readings for update to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id))
  with check ((public.is_self(person_id) or public.is_writer_of(person_id)) and (confirmed_by is null or confirmed_by = auth.uid()));
create policy readings_delete on public.readings for delete to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id));

create policy consults_read on public.consults for select to authenticated
  using (public.is_self(person_id) or public.is_carer_of(person_id));
create policy consults_insert on public.consults for insert to authenticated
  with check ((public.is_self(person_id) or public.is_writer_of(person_id)) and (confirmed_by is null or confirmed_by = auth.uid()));
create policy consults_update on public.consults for update to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id))
  with check ((public.is_self(person_id) or public.is_writer_of(person_id)) and (confirmed_by is null or confirmed_by = auth.uid()));
create policy consults_delete on public.consults for delete to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id));

-- pgTAP-style checks (run on a scratch database, not here). A has a login (person PA); B is a read-only carer of PA;
-- C is a stranger; D creates a no-login person PD and becomes its writer.
-- begin; select plan(12);
-- set local role anon;                          select throws_ok('select * from public.readings', '42501', null, 'anon has no access');
-- set local role authenticated; set local request.jwt.claim.sub = '<A>';
--   select lives_ok($$insert into readings (person_id, taken_at, test, value) values ('<PA>', now(), 'ldl', 1)$$, 'person writes own');
--   select throws_ok($$insert into readings (person_id, taken_at, test, value, confirmed_by) values ('<PA>', now(), 'ldl', 1, '<B>')$$, '42501', null, 'cannot confirm as someone else');
--   select is((select count(*) from readings), 1::bigint, 'person reads own');
-- set local request.jwt.claim.sub = '<B>';
--   select is((select count(*) from readings), 1::bigint, 'read-only carer reads linked person');
--   select throws_ok($$insert into readings (person_id, taken_at, test, value) values ('<PA>', now(), 'ldl', 2)$$, '42501', null, 'read-only carer cannot write');
--   select is((select count(*) from (update carers set can_write = true where carer_id = '<B>' returning 1) u), 0::bigint, 'carer cannot self-escalate');
-- set local request.jwt.claim.sub = '<C>';
--   select is((select count(*) from readings), 0::bigint, 'stranger sees nothing');
--   select throws_ok($$insert into carers values ('<C>', '<PA>', true)$$, '42501', null, 'stranger cannot link self');
-- set local request.jwt.claim.sub = '<D>';
--   select lives_ok($$insert into people (id, display_name) values ('<PD>', 'Test Person')$$, 'create no-login person');
--   select is((select can_write from carers where person_id = '<PD>' and carer_id = '<D>'), true, 'creator becomes writer');
--   select lives_ok($$insert into readings (person_id, taken_at, test, value) values ('<PD>', now(), 'ldl', 3)$$, 'writer logs a reading');
--   select throws_ok($$insert into people (display_name, created_by) values ('x', '<A>')$$, '42501', null, 'cannot create as someone else');
-- select * from finish(); rollback;
