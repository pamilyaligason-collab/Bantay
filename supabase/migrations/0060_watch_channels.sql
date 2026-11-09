-- S28 lane D (D-180): which channels the family watches. Written only; never applied from this lane.
-- 1. The usage-event allowlist (0056) gains one action name per Discover channel: watch_ch_<key> (letters and underscores, at most 40 characters).
--    The list must equal EVENT_NAMES in src/features/admin/events.ts (a vitest compares them).
-- 2. family_watch_counts(): for a signed-in family member, how many times each watch_ch_* name was recorded in the last 30 days by anyone in the family.
--    Names and totals only, never a person, a video or a time (B-7, ML-07). 30 reads an hour per person (ML-08). Discover ranks Top stories with it.
--    A channel is listed only when at least 3 DIFFERENT family members tapped it in the window (privacy floor): with 2 viewers a member subtracts their own taps and reads the
--    other's, with 1 viewer the total is that person's own count. The client treats an empty answer as "nothing known" and falls back to this phone's counts.
-- Down: 0060_watch_channels.down.sql puts the 0056 list back and drops the function.

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
    'phone_check_fail_notif','phone_check_fail_exact','phone_check_fail_battery','phone_check_fail_alarms','phone_check_fail_call',
    'watch_ch_philippine_red_cross','watch_ch_american_red_cross','watch_ch_fema','watch_ch_swedish_civil_defence_and_resil','watch_ch_phivolcs','watch_ch_pagasa',
    'watch_ch_this_old_house','watch_ch_ask_this_old_house','watch_ch_the_home_depot','watch_ch_city_prepping','watch_ch_knowledge_channel','watch_ch_gma_news',
    'watch_ch_agribusiness_how_it_works','watch_ch_abs_cbn_news','watch_ch_pinoy_prepper_central','watch_ch_agree_sa_agri','watch_ch_agri_nihan',
    'watch_ch_don_bustamante_rooftop_gardenin','watch_ch_the_agrillenial','watch_ch_raffy_s_green_thumb','watch_ch_bilyonaryo','watch_ch_gma_public_affairs'])
  when 'error' then n = any (array['sync_failed','import_failed','push_failed','assistant_failed'])
  else false end $$;
revoke all on function public.usage_event_allowed(text, text) from public, anon, authenticated, service_role;

-- Totals per channel name for the whole family (an active app_roles row), last 30 days, only for channels with at least 3 distinct viewers. 42501 not a member; 53400 more than 30 reads an hour.
create or replace function public.family_watch_counts() returns table (name text, n bigint)
  language plpgsql security definer set search_path = '' as
$$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_family_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  if public.pin_try(md5('watch:' || me::text)::uuid, 30, interval '1 hour') > 30 then raise exception 'too many reads' using errcode = '53400'; end if;
  return query
    select e.name, count(*)::bigint from public.usage_events e
    where e.kind = 'action' and e.name like 'watch\_ch\_%' and e.at >= now() - interval '30 days'
      and exists (select 1 from public.app_roles r where r.user_id = e.user_id and not r.disabled)
    group by e.name having count(distinct e.user_id) >= 3 order by count(*) desc, e.name;
end $$;
revoke all on function public.family_watch_counts() from public, anon, authenticated, service_role;
grant execute on function public.family_watch_counts() to authenticated;
