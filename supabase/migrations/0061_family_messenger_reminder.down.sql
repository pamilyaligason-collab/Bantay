-- Undo 0061_family_messenger_reminder.sql. Safe to run twice. Drops both columns (the Messenger names and task reminder times saved in them are lost).
-- The column grant goes first: a revoke on a missing column fails, so each step is guarded.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name = 'messenger') then
    revoke update (messenger) on public.people from authenticated;
  end if;
end $$;
alter table public.people drop constraint if exists people_messenger_check;
alter table public.people drop column if exists messenger;
alter table public.family_tasks drop constraint if exists family_tasks_remind_at_check;
alter table public.family_tasks drop column if exists remind_at;
