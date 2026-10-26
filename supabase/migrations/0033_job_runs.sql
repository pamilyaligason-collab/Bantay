-- Family Bantay: monitoring (session 10 lane S8, D-78: no third-party SDK). Needs 0002 (is_admin), 0003 (meds_taken), 0004 (usage_events), 0001 (readings).
-- Written only; Lloyd applies it. Safe to run twice. Undo: 0033_job_runs.down.sql.
--   job_runs      one row per scheduled-job run, written by the edge functions' heartbeat() with the service role; admin reads; 30 days.
--   client_errors one row per (user, place, hashed message, day), written only by log_client_error(); admin reads; 30 days; no stack, no URL, no values.
--   admin_pending_migrations(p_known) and admin_weekly_kpis(): admin-only aggregates (counts, never a person's rows or a health value).
-- carer_alerts (0030) is read only through to_regclass + dynamic SQL, so this file also runs where 0030 is not applied yet.
begin;

-- ---------- job_runs ----------
create table if not exists public.job_runs (
  id bigint generated always as identity primary key,
  job text not null check (length(job) between 1 and 64),
  ran_at timestamptz not null default now(),
  ok boolean not null,
  summary jsonb not null default '{}'::jsonb -- counts only (B-7)
);
create index if not exists job_runs_job_ran on public.job_runs (job, ran_at desc);
create index if not exists job_runs_ran on public.job_runs (ran_at);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;
grant select on public.job_runs to authenticated;
grant select, insert, delete on public.job_runs to service_role; -- heartbeat() inserts; the prune trigger deletes
drop policy if exists job_runs_admin_read on public.job_runs;
create policy job_runs_admin_read on public.job_runs for select to authenticated using (public.is_admin());

-- Keep 30 days (ML-06): every insert trims the expired rows (index on ran_at, so it is cheap).
create or replace function public.job_runs_trim() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin delete from public.job_runs where ran_at < now() - interval '30 days'; return null; end $$;
revoke execute on function public.job_runs_trim() from public, anon, authenticated, service_role;
drop trigger if exists job_runs_trim on public.job_runs;
create trigger job_runs_trim after insert on public.job_runs for each statement execute function public.job_runs_trim();

-- ---------- client_errors ----------
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  app_version text,
  where_ text not null check (length(where_) between 1 and 64),
  message_hash text not null check (length(message_hash) between 1 and 64),
  count int not null default 1,
  day date not null,
  unique (user_id, where_, message_hash, day)
);
create index if not exists client_errors_day on public.client_errors (day);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant select on public.client_errors to authenticated;
drop policy if exists client_errors_admin_read on public.client_errors;
create policy client_errors_admin_read on public.client_errors for select to authenticated using (public.is_admin());

-- One signed-in caller records one hashed error. user_id comes from auth.uid() only. At most 50 rows per user per Manila day:
-- past that the call does nothing (not even a count bump), so a runaway page cannot flood the table. Expired rows are trimmed here (30 days).
create or replace function public.log_client_error(p_where text, p_hash text, p_app_version text) returns void
  language plpgsql security definer set search_path = '' as
  $$
  declare
    v_uid uuid := auth.uid();
    v_day date := (now() at time zone 'Asia/Manila')::date;
    v_ver text := nullif(left(coalesce(p_app_version, ''), 20), '');
  begin
    if v_uid is null then raise exception 'not_signed_in'; end if;
    if length(coalesce(p_where, '')) > 64 or length(coalesce(p_hash, '')) > 64 then raise exception 'too_long'; end if;
    if p_where is null or p_where !~ '^[a-z0-9_.:/-]{1,64}$' then raise exception 'bad_where'; end if;
    if p_hash is null or p_hash !~ '^[0-9a-f]{1,64}$' then raise exception 'bad_hash'; end if;
    perform pg_advisory_xact_lock(hashtextextended('log_client_error:' || v_uid::text, 0)); -- two parallel calls cannot both pass the cap
    delete from public.client_errors where day < v_day - 30;
    if (select count(*) from public.client_errors where user_id = v_uid and day = v_day) >= 50 then return; end if;
    insert into public.client_errors (user_id, app_version, where_, message_hash, count, day)
      values (v_uid, v_ver, p_where, p_hash, 1, v_day)
      on conflict (user_id, where_, message_hash, day) do update set count = least(public.client_errors.count + 1, 1000); -- ceiling: a repeated key cannot inflate the count
  end $$;
revoke execute on function public.log_client_error(text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.log_client_error(text, text, text) to authenticated;

-- ---------- admin_pending_migrations ----------
-- p_known is the list in src/data/migrations.json (the app passes it; a no-argument call returns nothing). Returns the versions not yet
-- recorded in supabase_migrations.schema_migrations; 0028 is intentionally absent from the repo and always skipped. Empty set where the
-- Supabase schema does not exist (WSL rehearsal).
create or replace function public.admin_pending_migrations(p_known text[] default '{}') returns setof text
  language plpgsql stable security definer set search_path = '' as
  $$ begin
       if not public.is_admin() then raise exception 'not_admin'; end if;
       if to_regclass('supabase_migrations.schema_migrations') is null then return; end if;
       return query execute
         'select v from unnest($1) as v where v <> ''0028'' and not exists (select 1 from supabase_migrations.schema_migrations m where m.version = v) order by v'
         using p_known;
     end $$;
revoke execute on function public.admin_pending_migrations(text[]) from public, anon, authenticated, service_role;
grant execute on function public.admin_pending_migrations(text[]) to authenticated;

-- ---------- admin_weekly_kpis ----------
-- Counts for the last 7 Manila days (cur) and the 7 before (prev). `alerts` is null where carer_alerts does not exist yet (unknown, never 0, ML-05).
-- alerts: sent / seen over the last 7 days; due_1h = those at least an hour old and seen_1h = those seen within an hour of being raised (a brand-new alert
-- cannot be late yet, so it is left out of the rate); unseen_by_kind (alerts nobody opened); by_day for 14 days over the due ones. No row of any person is returned.
create or replace function public.admin_weekly_kpis() returns jsonb
  language plpgsql stable security definer set search_path = '' as
  $$
  declare
    v_today date := (now() at time zone 'Asia/Manila')::date;
    v_cur timestamptz := (v_today - 6)::timestamp at time zone 'Asia/Manila';
    v_prev timestamptz := (v_today - 13)::timestamp at time zone 'Asia/Manila';
    v_active jsonb; v_screens jsonb; v_doses jsonb; v_readings jsonb; v_errors jsonb; v_alerts jsonb := null;
  begin
    if not public.is_admin() then raise exception 'not_admin'; end if;
    select jsonb_build_object('cur', count(distinct user_id) filter (where at >= v_cur), 'prev', count(distinct user_id) filter (where at < v_cur)),
           jsonb_build_object('cur', count(*) filter (where at >= v_cur), 'prev', count(*) filter (where at < v_cur))
      into v_active, v_screens from public.usage_events where kind = 'screen' and at >= v_prev;
    select jsonb_build_object('cur', count(*) filter (where taken_at >= v_cur), 'prev', count(*) filter (where taken_at < v_cur))
      into v_doses from public.meds_taken where taken_at >= v_prev and taken_at < now();
    select jsonb_build_object('cur', count(*) filter (where taken_at >= v_cur), 'prev', count(*) filter (where taken_at < v_cur))
      into v_readings from public.readings where taken_at >= v_prev and taken_at < now();
    select jsonb_build_object('cur', coalesce(sum(count) filter (where day >= v_today - 6), 0), 'prev', coalesce(sum(count) filter (where day < v_today - 6), 0))
      into v_errors from public.client_errors where day >= v_today - 13;
    if to_regclass('public.carer_alerts') is not null then
      execute $q$
        select jsonb_build_object(
          'sent', count(*) filter (where created_at >= $1),
          'due_1h', count(*) filter (where created_at >= $1 and created_at <= now() - interval '1 hour'),
          'seen', count(*) filter (where created_at >= $1 and seen_at is not null),
          'seen_1h', count(*) filter (where created_at >= $1 and created_at <= now() - interval '1 hour' and seen_at <= created_at + interval '1 hour'),
          'unseen_by_kind', coalesce((select jsonb_object_agg(u.kind, u.n) from (select kind, count(*) as n from public.carer_alerts where created_at >= $1 and seen_at is null group by kind) u), '{}'::jsonb),
          'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', x.d, 'total', x.t, 'seen_1h', x.s) order by x.d)
                              from (select (created_at at time zone 'Asia/Manila')::date as d, count(*) as t, count(*) filter (where seen_at <= created_at + interval '1 hour') as s
                                    from public.carer_alerts where created_at >= $2 and created_at <= now() - interval '1 hour' group by 1) x), '[]'::jsonb))
        from public.carer_alerts where created_at >= $2 $q$
        into v_alerts using v_cur, v_prev;
    end if;
    return jsonb_build_object('today', v_today, 'active_members', v_active, 'screens', v_screens, 'doses_logged', v_doses, 'readings_logged', v_readings,
                              'client_errors', v_errors, 'alerts', v_alerts);
  end $$;
revoke execute on function public.admin_weekly_kpis() from public, anon, authenticated, service_role;
grant execute on function public.admin_weekly_kpis() to authenticated;

commit;
