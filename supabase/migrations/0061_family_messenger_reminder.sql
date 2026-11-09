-- S28 lane E (D-168): a Messenger name per person, and an optional reminder time on a family task. Written only; the owner applies it.
-- Needs 0010 (people profile, people_update policy), 0012 (family_tasks).
--
-- Rules
-- * people.messenger is the handle only (m.me/<handle>): letters, digits and dots, 5 to 50 characters, or null. Unknown is null, never ''.
-- * It is edited by the same people and under the same policy as phone (0010: people_update, records_editor); only the column grant is new. Reading follows people_read.
-- * family_tasks.remind_at is a local clock time "HH:MM" (the phone's day, with family_tasks.due). Null = no reminder. The table's grants and policies (0012) already cover a new column.

alter table public.people add column if not exists messenger text;
do $$ begin
  alter table public.people add constraint people_messenger_check
    check (messenger is null or messenger ~ '^[A-Za-z0-9.]{5,50}$');
exception when duplicate_object then null; end $$;
grant update (messenger) on public.people to authenticated;

alter table public.family_tasks add column if not exists remind_at text;
do $$ begin
  alter table public.family_tasks add constraint family_tasks_remind_at_check
    check (remind_at is null or remind_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
exception when duplicate_object then null; end $$;
