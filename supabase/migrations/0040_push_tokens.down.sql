-- Undo 0040_push_tokens.sql: push tokens are device addresses only, so dropping them loses nothing a phone cannot register again.
drop trigger if exists push_tokens_cap on public.push_tokens;
drop function if exists public.push_tokens_cap();
drop function if exists public.push_token_claim(text, text);
drop table if exists public.push_tokens;
-- dose_watch_prune back to its 0030 body
create or replace function public.dose_watch_prune() returns integer
  language plpgsql security definer set search_path = '' as
  $$ declare n int; begin
       delete from public.dose_watch_sent where sent_at < now() - interval '7 days';
       get diagnostics n = row_count;
       delete from public.carer_alerts where created_at < now() - interval '30 days';
       return n;
     end $$;
revoke execute on function public.dose_watch_prune() from public, anon, authenticated;
grant execute on function public.dose_watch_prune() to service_role;
