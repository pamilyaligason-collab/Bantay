-- Family Plan (W5, D-42/D-44): shared tasks, calendar events and notes. Written only; Lloyd applies it with the CLI block.
-- Needs 0001 (people) and 0002 (app_roles).
--
-- Rules
-- * Any signed-in, non-disabled family member reads, adds and edits any row (the plan is shared, like the family fridge).
--   anon gets nothing, a disabled member gets nothing.
-- * No hard delete over REST: a delete is deleted_at (soft), so the phones that still hold the row learn it is gone.
--   Tombstones stay readable for the same reason.
-- * created_by, created_at, client_id and updated_at are never changed by an update (trigger).
-- * Unknown is null (no due date, no assignee, no end time), never a made-up value (B-5).

create or replace function public.family_member() returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.app_roles where user_id = auth.uid() and not disabled) $$;
revoke execute on function public.family_member() from public, anon;
grant execute on function public.family_member() to authenticated;

create table if not exists public.family_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,
  title text not null check (char_length(title) between 1 and 200),
  due date,
  assignee_person_id uuid references public.people (id) on delete set null,
  done boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create table if not exists public.family_events (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  person_id uuid references public.people (id) on delete cascade, -- null = the whole family
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.family_notes (
  id uuid primary key default gen_random_uuid(),
  client_id text unique not null,
  body text not null check (char_length(body) between 1 and 4000),
  pinned boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index if not exists family_tasks_due on public.family_tasks (due);
create index if not exists family_tasks_updated on public.family_tasks (updated_at);
create index if not exists family_tasks_assignee on public.family_tasks (assignee_person_id);
create index if not exists family_events_starts on public.family_events (starts_at);
create index if not exists family_events_updated on public.family_events (updated_at);
create index if not exists family_events_person on public.family_events (person_id);
create index if not exists family_notes_updated on public.family_notes (updated_at);

create or replace function public.family_plan_touch() returns trigger
  language plpgsql set search_path = '' as $$
  begin
    new.updated_at := now();
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.client_id is distinct from old.client_id then raise exception 'client_id cannot change'; end if;
    return new;
  end $$;

do $$ declare t text; begin
  foreach t in array array['family_tasks', 'family_events', 'family_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.family_member())', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.family_member() and created_by = auth.uid())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.family_member()) with check (public.family_member())', t || '_update', t);
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.family_plan_touch()', t || '_touch', t);
  end loop;
end $$;
