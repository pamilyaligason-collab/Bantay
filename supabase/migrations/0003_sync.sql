-- Family Bantay sync tables (lane A2). Written only; never applied from this lane.
-- Needs 0001_health.sql (is_self, is_carer_of, is_writer_of) and 0002_auth.sql (public.is_admin(), lane A1).
-- Every synced table has client_id: the client generates it once per outbox row, so a retried POST is a no-op
-- (upsert on_conflict=client_id with Prefer: resolution=ignore-duplicates). created_at is the pull cursor.

-- readings and consults come from 0001 (already reviewed, not edited): add the columns here.
-- A volatile default is evaluated per row, so existing rows each get their own client_id.
alter table public.readings add column client_id uuid not null default gen_random_uuid();
alter table public.readings add column created_at timestamptz not null default now();
alter table public.consults add column client_id uuid not null default gen_random_uuid();
alter table public.consults add column created_at timestamptz not null default now();
create unique index readings_client_id on public.readings (client_id);
create unique index consults_client_id on public.consults (client_id);
create index readings_created_at on public.readings (created_at);
create index consults_created_at on public.consults (created_at);

create table public.meds_taken (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  name text not null,
  taken_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index meds_taken_client_id on public.meds_taken (client_id);
create index meds_taken_person_time on public.meds_taken (person_id, taken_at desc);
create index meds_taken_created_at on public.meds_taken (created_at);

-- minutes and steps are null when unknown, never 0.
create table public.activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  kind text not null,
  minutes numeric check (minutes is null or minutes >= 0),
  steps numeric check (steps is null or steps >= 0),
  started_at timestamptz not null,
  source text not null check (source in ('manual', 'health-connect', 'healthkit')),
  created_at timestamptz not null default now()
);
create unique index activity_client_id on public.activity (client_id);
create index activity_person_time on public.activity (person_id, started_at desc);
create index activity_created_at on public.activity (created_at);

-- Owned by the login, not by a person: a device's Web Push subscription.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text,
  auth text,
  expiration_time timestamptz,
  created_at timestamptz not null default now()
);
create unique index push_subscriptions_client_id on public.push_subscriptions (client_id);
create unique index push_subscriptions_endpoint on public.push_subscriptions (endpoint);
create index push_subscriptions_user on public.push_subscriptions (user_id);

-- Safety data edited by an admin (hotlines, places). Everyone signed in reads; only an admin writes.
create table public.safety_overrides (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default gen_random_uuid(),
  kind text not null check (kind in ('hotline', 'place')),
  key text not null,
  data jsonb,
  removed boolean not null default false,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, key)
);
create unique index safety_overrides_client_id on public.safety_overrides (client_id);

alter table public.meds_taken enable row level security;
alter table public.activity enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.safety_overrides enable row level security;

revoke all on public.meds_taken, public.activity, public.push_subscriptions, public.safety_overrides from anon;
grant select, insert, update, delete on public.meds_taken, public.activity, public.push_subscriptions, public.safety_overrides to authenticated;
-- a writer cannot move a row to another person: column-level update grants
revoke update on public.meds_taken, public.activity from authenticated;
grant update (name, taken_at) on public.meds_taken to authenticated;
grant update (kind, minutes, steps, started_at, source) on public.activity to authenticated;

create policy meds_taken_read on public.meds_taken for select to authenticated
  using (public.is_self(person_id) or public.is_carer_of(person_id));
create policy meds_taken_insert on public.meds_taken for insert to authenticated
  with check (public.is_self(person_id) or public.is_writer_of(person_id));
create policy meds_taken_update on public.meds_taken for update to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id))
  with check (public.is_self(person_id) or public.is_writer_of(person_id));
create policy meds_taken_delete on public.meds_taken for delete to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id));

create policy activity_read on public.activity for select to authenticated
  using (public.is_self(person_id) or public.is_carer_of(person_id));
create policy activity_insert on public.activity for insert to authenticated
  with check (public.is_self(person_id) or public.is_writer_of(person_id));
create policy activity_update on public.activity for update to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id))
  with check (public.is_self(person_id) or public.is_writer_of(person_id));
create policy activity_delete on public.activity for delete to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id));

create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy safety_overrides_read on public.safety_overrides for select to authenticated using (true);
create policy safety_overrides_insert on public.safety_overrides for insert to authenticated with check (public.is_admin());
create policy safety_overrides_update on public.safety_overrides for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy safety_overrides_delete on public.safety_overrides for delete to authenticated using (public.is_admin());
