-- S26 L4 (D-160): the usage-event allowlist lives in one SQL function; a BEFORE INSERT trigger drops any (kind, name) not on it.
-- Returning NULL skips a well-formed row that is not on the list without an error, so an old app build that sends a name this list lacks never gets a sync error.
-- Rows that break the 0004 format rules (kind, name pattern) are passed on so the CHECK constraints still raise.
-- The list must equal EVENT_NAMES in src/features/admin/events.ts (a vitest compares them). Existing RLS and grants on usage_events stay as they are.
-- Written only; never applied from this lane.

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
revoke all on function public.usage_event_allowed(text, text) from public, anon, authenticated;

-- security definer: the trigger runs as the signed-in caller, who has no execute on the list function
create or replace function public.usage_events_filter() returns trigger
  language plpgsql security definer set search_path = '' as
$$ begin
  -- a kind or name that breaks the 0004 format rules goes on to the CHECK constraints, which still raise (a digit-bearing name like a reading must fail loudly)
  if new.kind is null or new.name is null or new.kind not in ('screen', 'action', 'error') or new.name !~ '^[a-z_]{1,40}$' then return new; end if;
  if public.usage_event_allowed(new.kind, new.name) then return new; end if;
  return null; -- well-formed but not on the list: drop silently
end $$;
revoke all on function public.usage_events_filter() from public, anon, authenticated;

drop trigger if exists usage_events_allowlist on public.usage_events;
create trigger usage_events_allowlist before insert on public.usage_events
  for each row execute function public.usage_events_filter();
