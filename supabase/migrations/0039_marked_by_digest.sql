-- Family Bantay session 12, lane C (D-83): who marked a dose, and the 8 PM summary opt-out.
-- Needs 0003 (meds_taken), 0014 (meds_taken update grant), 0030 (carer_alerts). Written only; Lloyd applies it with the go-live script.
-- Safe to run twice. Undo: 0039_marked_by_digest.down.sql.
--
-- * meds_taken.marked_by is stamped by a BEFORE INSERT trigger from auth.uid(). A value the client sends is always overwritten by the caller's
--   own id; only a caller with no auth.uid() (the service role) keeps what it sends. It is never updatable (column grant below).
-- * meds_taken.marked_by_name is the marker's FIRST name, stamped by the same trigger, and only when the marker is not the person the dose is
--   for. It exists because the owner cannot read another member's people row (people_read), so the app could not turn the id into a name.
--   Whoever can read the dose already sees who the family is; no surname and no id are copied.
-- * carer_prefs: one row per user, digest_on false = no 8 PM summary. dose-watch reads it with the service role and drops ONLY kind 'digest'
--   rows for that user; missed-dose, Unwell, SOS and review alerts are never affected.

alter table public.meds_taken add column if not exists marked_by uuid references auth.users (id) on delete set null;
alter table public.meds_taken add column if not exists marked_by_name text;

-- First given name of "Lloyd Roco" or "Roco, Lloyd Jr" (ML-35: a comma means surname first, so the given name is read after it). null when unsure.
create or replace function public.meds_taken_marked_by() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ declare n text;
     begin
       new.marked_by := coalesce(auth.uid(), new.marked_by);
       new.marked_by_name := null; -- never taken from the client
       if new.marked_by is not null then
         select trim(p.display_name) into n from public.people p where p.auth_user_id = new.marked_by and p.id <> new.person_id limit 1;
         if n is not null then
           if position(',' in n) > 0 then n := trim(substr(n, position(',' in n) + 1)); end if;
           new.marked_by_name := left(nullif(split_part(n, ' ', 1), ''), 30);
         end if;
       end if;
       return new;
     end $$;
drop trigger if exists meds_taken_marked_by on public.meds_taken;
create trigger meds_taken_marked_by before insert on public.meds_taken for each row execute function public.meds_taken_marked_by();
revoke execute on function public.meds_taken_marked_by() from public, anon, authenticated, service_role;

-- 0014:30-31 list restated; marked_by and marked_by_name are deliberately not in it.
revoke update on public.meds_taken from authenticated;
grant update (name, taken_at, medication_id, slot, skipped) on public.meds_taken to authenticated;

create table if not exists public.carer_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  digest_on boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.carer_prefs enable row level security;
drop policy if exists carer_prefs_select on public.carer_prefs;
drop policy if exists carer_prefs_insert on public.carer_prefs;
drop policy if exists carer_prefs_update on public.carer_prefs;
create policy carer_prefs_select on public.carer_prefs for select to authenticated using (user_id = auth.uid());
create policy carer_prefs_insert on public.carer_prefs for insert to authenticated with check (user_id = auth.uid());
create policy carer_prefs_update on public.carer_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.carer_prefs from public, anon, authenticated, service_role;
grant select, insert on public.carer_prefs to authenticated;
grant update (digest_on, updated_at) on public.carer_prefs to authenticated;
grant select on public.carer_prefs to service_role;
