# Official safety alerts (D-25)

A scheduled Edge Function (`alerts-ingest`) pulls public alert feeds into `public.safety_alerts`. The app's sync copies the active rows into
the phone (Dexie kv `safety.alerts`), so alerts show offline. Bantay is not a siren: no copy promises advance warning.
Done by Lloyd. About 15 minutes. Nothing here is applied by the build.

## 1. Apply the SQL

Run `supabase/migrations/0007_safety_alerts.sql` after 0006. Signed-in members can read; nobody but the service role can write.
Rehearsal on a throwaway Postgres (11 checks): `supabase/tests/alerts_rehearsal.sql`.

## 2. Secret

| Name | What |
| --- | --- |
| `ALERTS_CRON_SECRET` | A long random string, at least 32 characters. Generate it yourself. Never commit it. The function refuses to run without it. |

`supabase secrets set ALERTS_CRON_SECRET=...` (or the dashboard). Then store the SAME value in Vault, in the SQL editor only:
`select vault.create_secret('<the secret>', 'alerts_cron_secret');`

## 3. Deploy

```
supabase functions deploy alerts-ingest --no-verify-jwt
```

`--no-verify-jwt` is intended: the cron call carries no user session. The `x-alerts-secret` header is the only gate; a wrong or missing secret gets 401.
Test once by hand (secret from your password manager): POST to `https://<ref>.supabase.co/functions/v1/alerts-ingest` with that header.
Expect `{"ok":true,"sources":{"USGS":{"ok":true,...},"GDACS":...,"Open-Meteo":...}}`.

## 4. Schedule

Run `ops/sql/alerts_cron.sql` (pg_cron plus pg_net, every 10 minutes). It stops with a clear error if step 2's Vault secret is missing.

## What it pulls

| Source | Kind in the app | What is kept | Lives for |
| --- | --- | --- | --- |
| USGS all-day quakes | `quake` (tier 1) | M3.5+ within 100 km of Dampas, M4.5+ within 300 km, M6.5+ within 1000 km | 24 h from the quake |
| GDACS RSS | `gdacs` (tropical cyclone, flood), `volcano` (tier 1), `tsunami` (tier 1) | Current events in the Philippines or within 500 km of Dampas. Global context, not a PAGASA or PHIVOLCS warning | 48 h (72 h volcano, 12 h tsunami) from GDACS's last change |
| Open-Meteo air quality | `air` (tier 2) | US AQI 101 and above, on an 11 km model grid. Model estimate, never shown above an official warning | 3 h |

If a source fails (timeout, error, a page that is not the expected feed), its old rows stay and are marked `stale`. The card then says
"Last checked <time>; source unreachable." Nothing is deleted on failure. Expired rows are hidden by the app and can be cleaned later.

## Not ingested (HTML or PDF scrape only)

PHIVOLCS earthquake list and detail pages (Word-export HTML), PHIVOLCS volcano bulletins (no feed found), PAGASA tropical cyclone and weather
bulletins (PDF inside an iframe), BOHECO I interruptions (WordPress category page). NGCP, LWUA and NDRRMC returned 403 to the probe and are
unverified: re-test with a browser user agent. Tagbilaran Water has no resolvable official site. Until a parser exists for these, the Safety
screen's hotlines and the links in each card stay the way to check them. USGS stands in for PHIVOLCS quakes.
