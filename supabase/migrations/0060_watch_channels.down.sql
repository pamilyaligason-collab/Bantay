-- Undo 0060_watch_channels.sql: the 0056 allowlist comes back and the counts function goes. Safe to run twice.
-- watch_ch_* rows already stored stay (they hold a channel name and a time, no person data).
-- (family_watch_counts() lists only channels with at least 3 distinct family viewers; dropping it removes that rule with it.)
drop function if exists public.family_watch_counts();

create or replace function public.usage_event_allowed(k text, n text) returns boolean
  language sql immutable set search_path = '' as
$$ select case k
  when 'screen' then n = any (array['today','health','records','family','safety','admin','me','notif','docs','ask','discover','sharing','weather','calm'])
  when 'action' then n = any (array['alerts_on','alerts_off','sensors_on','sensors_off','import_started','import_done','reading_added','dose_logged','sos_sent',
    'dose_skipped','med_added','med_edited','med_paused','med_deleted','reminder_opened','checkin_done',
    'card_seen_my_week','weather_opened','weather_opened_action','records_confirmed',
    'meal_logged','water_logged','salt_goal_set',
    'phone_check_pass','phone_check_fail',
    'onboard_skip_reminders','onboard_skip_where','onboard_skip_test','onboard_test_rang',
    'warn_ack','breathe_done',
    'acting_enter','acting_exit',
    'card_talk','card_fx','card_lotto','card_explainer','card_top_story','card_farm_video','card_regional_video','card_learn',
    'phone_check_fail_notif','phone_check_fail_exact','phone_check_fail_battery','phone_check_fail_alarms','phone_check_fail_call'])
  when 'error' then n = any (array['sync_failed','import_failed','push_failed','assistant_failed'])
  else false end $$;
revoke all on function public.usage_event_allowed(text, text) from public, anon, authenticated, service_role;
