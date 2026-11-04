-- Undo 0048_alert_tiers.sql. Safe to run twice.
-- The kind check goes back to the 0007 list. NOT VALID: any 'eonet' rows already stored are kept (nothing here deletes alert rows) and simply fail the old list
-- until they expire; new 'eonet' rows are refused, which is what the old ingest expects. Stop the alerts-ingest EONET source (or redeploy the old function) first.
-- Live EONET rows are expired first (an update, no delete), so the apps stop showing them and the old check has nothing live left to disagree with.
update public.safety_alerts set expires_at = now() where kind = 'eonet' and (expires_at is null or expires_at > now());
drop table if exists public.safety_digests;
alter table public.safety_alerts drop constraint if exists safety_alerts_kind_check;
alter table public.safety_alerts add constraint safety_alerts_kind_check
  check (kind in ('tcws', 'rainfall', 'thunderstorm', 'heat', 'quake', 'tsunami', 'utility', 'local', 'gdacs', 'volcano', 'air')) not valid;
