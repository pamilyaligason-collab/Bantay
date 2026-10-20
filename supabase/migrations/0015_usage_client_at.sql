-- Family Bantay: usage events carry the phone's own time (session 6 lane T; docs/session-6/PART-2.md section 4).
-- `at` stays the arrival time; `client_at` is when the tap happened, so an offline phone's queued events land on the
-- right day for the habit targets. Names only, never values (B-7). Written only; Lloyd applies it. Safe to run twice.
-- Undo: 0015_usage_client_at.down.sql.
alter table public.usage_events add column if not exists client_at timestamptz;
do $$ begin
  alter table public.usage_events add constraint usage_events_client_at_sane
    check (client_at is null or client_at between timestamptz '2026-01-01' and at + interval '1 day');
exception when duplicate_object then null; end $$;
grant insert (client_at) on public.usage_events to authenticated;
create index if not exists usage_events_user_client_at on public.usage_events (user_id, client_at desc);
