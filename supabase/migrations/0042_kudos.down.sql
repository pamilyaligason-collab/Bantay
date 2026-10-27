-- Undo 0042_kudos.sql. Deletes kudos and recap rows (they cannot exist under the old constraints), then restores the 0027 shape. Safe to run twice.
begin;
drop trigger if exists family_messages_kudos_alert on public.family_messages;
drop function if exists public.family_messages_kudos_alert();
delete from public.family_messages where kind in ('kudos', 'recap');
alter table public.family_messages drop constraint if exists family_messages_about_check;
alter table public.family_messages drop constraint if exists family_messages_body_attachment_check;
alter table public.family_messages drop constraint if exists family_messages_kind_check;
alter table public.family_messages drop column if exists about_person;
alter table public.family_messages add constraint family_messages_kind_check check (kind in ('text', 'voice', 'photo', 'file'));
alter table public.family_messages drop constraint if exists family_messages_check;
alter table public.family_messages add constraint family_messages_check check ((kind = 'text' and body is not null and attachment_path is null) or (kind <> 'text' and attachment_path is not null));
commit;
