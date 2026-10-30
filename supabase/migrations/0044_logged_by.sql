-- Family Bantay session 16, lane L6 (D-99, D-102 Q2): who logged a reading or an activity row, so "an admin logged this FOR Mama" is visible in the admin desk.
-- Needs 0001 (readings), 0003 (activity). Written only; applied ONLY when Lloyd types "apply 0044". The app never requires it (reads tolerate a missing column). Safe to run twice. Undo: 0044_logged_by.down.sql.
--
-- * logged_by is stamped by a BEFORE INSERT trigger from auth.uid(); a value the client sends is overwritten by the caller's own id, only a caller with no
--   auth.uid() (the service role, imports) keeps what it sends. On UPDATE it is pinned to its old value, so nobody can rewrite who logged a row (readings keeps its
--   table-wide update grant, so a column grant cannot do this; the trigger does).
-- * RLS is unchanged: no policy reads logged_by. The trigger function is security definer with an empty search_path and no caller may execute it directly (ML-21).

alter table public.readings add column if not exists logged_by uuid references auth.users (id) on delete set null;
alter table public.activity add column if not exists logged_by uuid references auth.users (id) on delete set null;

create or replace function public.stamp_logged_by() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       if tg_op = 'INSERT' then new.logged_by := coalesce(auth.uid(), new.logged_by);
       else new.logged_by := old.logged_by; end if;
       return new;
     end $$;
revoke execute on function public.stamp_logged_by() from public, anon, authenticated, service_role;

drop trigger if exists readings_logged_by on public.readings;
create trigger readings_logged_by before insert or update on public.readings for each row execute function public.stamp_logged_by();
drop trigger if exists activity_logged_by on public.activity;
create trigger activity_logged_by before insert or update on public.activity for each row execute function public.stamp_logged_by();
