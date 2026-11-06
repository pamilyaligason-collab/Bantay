-- Undo 0050_family_feed.sql: the feed function, the switch function and the switch table go; audit_log.action returns to the 0037 list.
-- Switch settings are lost (a later up starts with every category off). Audit rows of feed switch changes are deleted first, as 0029's down does for 'view', so the old list can be restored.
-- Safe to run twice.
begin;

drop function if exists public.family_feed(timestamptz);
drop function if exists public.feed_share_set(uuid, text, boolean);
drop table if exists public.feed_shares; -- its policy goes with it

delete from public.audit_log where action = 'feed_share';
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal', 'view', 'pin_reset', 'share_add', 'share_remove', 'share_accept', 'invite', 'join'));

commit;
