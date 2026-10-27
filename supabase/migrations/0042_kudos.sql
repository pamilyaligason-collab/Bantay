-- Kudos and Sunday recap on the family thread (session 12, lane G NUDGE, D-85 3). Written only; the orchestrator applies it.
-- Needs 0027 (family_messages, family_messages_stamp) and 0030/0037 (notify_family, the alert kind 'kudos' that 0037 allows).
--
-- Rules
-- * family_messages.kind gains 'kudos' (a heart, or a voice note up to 15 s, about one person) and 'recap' (the Sunday line, counts only).
-- * about_person is set only on kudos (who the heart is for) and is never the sender's own person.
-- * A recap body is short counts text; a blood pressure pair ("128/82") in it is refused here as well as in the app (a recap shares counts, never a reading).
-- * Kudos raises one 'kudos' alert for that person only (scope 'self'); the alert never carries a name (template text is fixed). At most one per sender per person per 10 minutes.
--   The alert trigger can never make the message insert fail.
-- Safe to run twice.
begin;

alter table public.family_messages add column if not exists about_person uuid references public.people (id) on delete cascade; -- a hug for someone who is gone goes with them

-- the kind list, restated in full (ML-28: 0027 had text, voice, photo, file)
alter table public.family_messages drop constraint if exists family_messages_kind_check;
alter table public.family_messages add constraint family_messages_kind_check check (kind in ('text', 'voice', 'photo', 'file', 'kudos', 'recap'));

-- body / attachment rule, restated in full (0027's unnamed table check)
alter table public.family_messages drop constraint if exists family_messages_check;
alter table public.family_messages drop constraint if exists family_messages_body_attachment_check;
alter table public.family_messages add constraint family_messages_body_attachment_check check (
  (kind = 'text' and body is not null and attachment_path is null)
  or (kind in ('voice', 'photo', 'file') and attachment_path is not null)
  or (kind = 'kudos' and about_person is not null
      and ((body = 'heart' and attachment_path is null and duration_s is null)
        or (body is null and attachment_path is not null and duration_s is not null and duration_s between 1 and 15)))
  or (kind = 'recap' and body is not null and char_length(body) <= 200 and attachment_path is null and body !~ '[0-9]{2,3}\s*/\s*[0-9]{2,3}')
);
alter table public.family_messages drop constraint if exists family_messages_about_check;
alter table public.family_messages add constraint family_messages_about_check check (
  (kind = 'kudos') = (about_person is not null) and (kind <> 'kudos' or about_person is distinct from sender_person_id)
);

create or replace function public.family_messages_kudos_alert() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       if new.kind = 'kudos' and new.about_person is not null
          and not exists (select 1 from public.family_messages m
                          where m.sender_id = new.sender_id and m.about_person = new.about_person and m.kind = 'kudos'
                            and m.id <> new.id and m.created_at > now() - interval '10 minutes') then
         perform public.notify_family(new.about_person, 'kudos', 'kudos', new.id::text, 'self');
       end if;
       return null;
     exception when others then
       return null; -- a heart is never lost because its alert failed
     end $$;
revoke execute on function public.family_messages_kudos_alert() from public, anon, authenticated;
drop trigger if exists family_messages_kudos_alert on public.family_messages;
create trigger family_messages_kudos_alert after insert on public.family_messages for each row execute function public.family_messages_kudos_alert();

commit;
