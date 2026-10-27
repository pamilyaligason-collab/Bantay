-- Undo 0033_job_runs.sql. Safe to run twice. Drops the monitoring tables (job history and hashed client errors are lost; nothing else reads them).
begin;
drop function if exists public.admin_weekly_kpis();
drop function if exists public.admin_pending_migrations(text[]);
drop function if exists public.log_client_error(text, text, text);
drop trigger if exists job_runs_trim on public.job_runs;
drop function if exists public.job_runs_trim();
drop table if exists public.client_errors;
drop table if exists public.job_runs;
commit;
