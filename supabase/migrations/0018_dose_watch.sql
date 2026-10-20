-- Family Bantay: dose-watch (session 6, lane M7b). Needs 0014 (medications.schedule, meds_taken.slot).
-- One row per person, Manila day and slot that a "has not marked a medicine (2 h)" push was claimed for, so the 15-minute
-- cron sends at most ONE push per slot per day even when it runs again or two runs overlap (claim first, then send).
-- Holds no medicine name and no value (B-7): only who, which day, which clock slot. Written only; Lloyd applies it.
-- Safe to run twice. Undo: 0018_dose_watch.down.sql.

create table if not exists public.dose_watch_sent (
  person_id uuid not null references public.people (id) on delete cascade,
  day date not null,                       -- Asia/Manila calendar day of the slot
  slot text not null check (slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  sent_at timestamptz not null default now(),
  primary key (person_id, day, slot)
);
create index if not exists dose_watch_sent_sent_at on public.dose_watch_sent (sent_at);

-- Only the edge function (service role) touches it: RLS on, no policy, no grant for app users.
alter table public.dose_watch_sent enable row level security;
revoke all on public.dose_watch_sent from anon, authenticated;
grant select, insert, delete on public.dose_watch_sent to service_role;

-- true for the caller that got the claim, false when the slot was already claimed. Atomic (insert .. on conflict do nothing).
create or replace function public.dose_watch_claim(p_person uuid, p_day date, p_slot text) returns boolean
  language plpgsql security definer set search_path = '' as
  $$ declare n int; begin
       insert into public.dose_watch_sent (person_id, day, slot) values (p_person, p_day, p_slot) on conflict do nothing;
       get diagnostics n = row_count;
       return n = 1;
     end $$;
revoke execute on function public.dose_watch_claim(uuid, date, text) from public, anon, authenticated;
grant execute on function public.dose_watch_claim(uuid, date, text) to service_role;

-- Housekeeping the function calls each run: forget claims older than 7 days.
create or replace function public.dose_watch_prune() returns integer
  language plpgsql security definer set search_path = '' as
  $$ declare n int; begin
       delete from public.dose_watch_sent where sent_at < now() - interval '7 days';
       get diagnostics n = row_count;
       return n;
     end $$;
revoke execute on function public.dose_watch_prune() from public, anon, authenticated;
grant execute on function public.dose_watch_prune() to service_role;
