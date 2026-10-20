-- Bantay 30-day usage baseline. READ ONLY. Supabase SQL editor, project wuakimpssycbtnmoexuc.
-- Days are Asia/Manila. Counts only, no health values.

-- Q1. Check-ins (I'm OK) per person per day
select p.display_name, count(distinct (a.started_at at time zone 'Asia/Manila')::date) as days_checked_in,
       count(*) as check_ins, round(count(*)::numeric / 30, 2) as per_day
from public.people p left join public.activity a
  on a.person_id = p.id and a.kind = 'check-in' and a.started_at > now() - interval '30 days'
group by p.display_name order by 1;

-- Q2. Doses logged and how late (minutes from the nearest scheduled time that day)
with d as (
  select p.display_name, m.name, (t.taken_at at time zone 'Asia/Manila') as local_at,
         (select min(abs(extract(epoch from ((t.taken_at at time zone 'Asia/Manila')::time - s::time)) / 60))
            from jsonb_array_elements_text(m.schedule) s) as min_off
  from public.meds_taken t
  join public.people p on p.id = t.person_id
  left join public.medications m on m.person_id = t.person_id and lower(m.name) = lower(t.name) and m.med_status = 'active'
  where t.taken_at > now() - interval '30 days')
select display_name, count(*) as doses, count(distinct local_at::date) as days_with_dose,
       count(*) filter (where min_off <= 30)  as within_30m,
       count(*) filter (where min_off > 30 and min_off <= 120) as late_30_120m,
       count(*) filter (where min_off > 120) as late_over_2h,
       count(*) filter (where min_off is null) as no_schedule_match,
       round(percentile_cont(0.5) within group (order by min_off)::numeric, 0) as median_min_off
from d group by display_name order by 1;

-- Q3. Scheduled doses expected vs logged (adherence), per person
select p.display_name,
       sum(jsonb_array_length(m.schedule)) * 30 as expected_30d,
       (select count(*) from public.meds_taken t where t.person_id = p.id and t.taken_at > now() - interval '30 days') as logged_30d
from public.people p join public.medications m on m.person_id = p.id
where m.med_status = 'active' and not m.as_needed
group by p.id, p.display_name order by 2;

-- Q4. Readings per week per person (BP counts once: systolic only)
select p.display_name, date_trunc('week', r.taken_at at time zone 'Asia/Manila')::date as week,
       count(*) filter (where r.test = 'bp_systolic') as bp,
       count(*) filter (where r.test in ('glucose','fasting_glucose')) as sugar,
       count(*) filter (where r.test = 'weight') as weight
from public.readings r join public.people p on p.id = r.person_id
where r.taken_at > now() - interval '30 days' and r.test in ('bp_systolic','glucose','fasting_glucose','weight')
group by 1, 2 order by 1, 2;

-- Q5. Screens and actions per person (usage_events; name = screen or action id)
select coalesce(p.display_name, u.user_id::text) as who, u.kind, u.name, count(*) as n,
       count(distinct (u.at at time zone 'Asia/Manila')::date) as active_days
from public.usage_events u left join public.people p on p.auth_user_id = u.user_id
where u.at > now() - interval '30 days'
group by 1, 2, 3 order by 1, 2, n desc;

-- Q6. Daily active people (any event) for the last 30 days
select (u.at at time zone 'Asia/Manila')::date as day, count(distinct u.user_id) as active_people
from public.usage_events u where u.at > now() - interval '30 days' group by 1 order by 1;
