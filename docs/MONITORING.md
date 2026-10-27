# Monitoring (session 10, lane S8, D-78)

No third-party SDK (Sentry parked, Q36). Everything is a table the admin reads in the web admin, page **System health** (`/admin#/system`, keys `g` then `s`).

## What is recorded

| What | Where | Written by | Kept |
|---|---|---|---|
| Scheduled job runs | `job_runs` (job, ran_at, ok, counts-only summary) | `heartbeat()` in `supabase/functions/_shared/heartbeat.ts`, service role | 30 days (trim trigger on insert) |
| Client errors | `client_errors` (user, version, place, message hash, count, Manila day) | `log_client_error()` RPC from `src/features/monitor/errors.ts` | 30 days; 50 rows per user per day |
| Alert reach | read from `carer_alerts` (0030) through `admin_weekly_kpis()` | nobody writes for this | counts only reach the admin |

Privacy: a client error carries a place name (`window.onerror` or `unhandledrejection`), a 16-hex hash of the message with digits removed, and the app version. No stack, no URL, no message text. A heartbeat summary keeps only numbers and booleans under plain keys.

## Heartbeat hook points

`heartbeat(sb, job, ok, summary)` never throws. Failed run (`ok = false`) also writes one `system` alert per admin (ref `job:<6-hour window>`, so at most one per 6 hours). Hooks: `records-extract` (done in S8), `dose-watch` (S1 adds its line), `alerts-ingest` (owner of that function adds its line). Job names the page knows: `dose-watch`, `alerts-ingest`, `records-extract`; red when the last run failed or is older than 30 minutes, amber when never seen.

## Red / amber rules (`desk/systemApi.ts`, pinned by `systemApi.test.ts`)

- Phone: alarms not ok = red (reason: battery saver, exact alarms, notifications, else re-check); alarms ok but a setting could delay them = amber; old app (`alarms_ok` null) = amber; not opened for more than 48 hours = amber; browser app = amber, listed, not counted. Unknown settings are never a problem.
- Seen in the app: share of alerts at least an hour old that were opened within an hour; 90 and up fine, 70 to 89 amber, under 70 red; no data = "Not available yet", never 0.
- Errors today: amber only when higher than yesterday.
- Database updates: versions in `src/data/migrations.json` that `supabase_migrations.schema_migrations` lacks (`admin_pending_migrations(p_known)`; 0028 is always skipped). Add every new migration number to `migrations.json`; a test fails if a file is missing from it.

## Apply (Lloyd)

`0033_job_runs.sql`, then deploy `records-extract` (plus `dose-watch` and `alerts-ingest` since they bundle `_shared/heartbeat.ts`). Check: `select job, ran_at, ok from job_runs order by ran_at desc limit 5`. Undo: `0033_job_runs.down.sql`.
