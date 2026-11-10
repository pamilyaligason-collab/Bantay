-- S30 L4: archive every old family notification at once. Written only; Lloyd applies it (Supabase SQL editor).
-- "Archive" = set carer_alerts.seen_at = now() on rows nobody has seen. Nothing is deleted (dose_watch_prune still trims at 30 days).
-- Safe to run twice: the second run finds no row with seen_at null and changes 0 rows.
-- Includes live SOS rows on purpose: run this when no SOS is open, or add `and kind <> 'sos'` to the update.

select count(*) filter (where seen_at is null) as unseen_before, count(*) as total_before from public.carer_alerts;

with archived as (
  update public.carer_alerts set seen_at = now()
  where seen_at is null and created_at < now()
  returning 1
)
select count(*) as archived_now from archived;

select count(*) filter (where seen_at is null) as unseen_after, count(*) as total_after from public.carer_alerts; -- total unchanged, unseen_after 0
