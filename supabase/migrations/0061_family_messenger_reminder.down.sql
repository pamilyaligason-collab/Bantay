-- Undo 0061_family_messenger_reminder.sql. Safe to run twice. Drops both columns (the Messenger names and task reminder times saved in them are lost).
revoke update (messenger) on public.people from authenticated;
alter table public.people drop constraint if exists people_messenger_check;
alter table public.people drop column if exists messenger;
alter table public.family_tasks drop constraint if exists family_tasks_remind_at_check;
alter table public.family_tasks drop column if exists remind_at;
