# pagasa-warnings deploy note (S26 lane W4P, D-163)

Written only. The orchestrator / owner applies each step; nothing here has been deployed, applied or scheduled.

PAGASA stays the authority: the function keeps the latest warnings so the app can show a pointer card that links to the original page (`source_url`). Server only; no app code in this lane.

## 1. Sources, robots.txt, terms (checked 9 Nov 2026)
- `https://www.pagasa.dost.gov.ph/robots.txt` answers 404, so no crawl rules are published. No terms-of-use page was found (only `/privacy-notice`): reuse terms are unknown, so the function reads three pages per run, sends `User-Agent: BantayFamilyApp/1.0`, stores short text and always links back.
- `https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin` (200): one tab `tcwb-N` per active cyclone; name in `<h3>`, "Issued at 11:00 am, 09 November 2026", "Location of Eye/center", a "Wind Signal" block.
- `https://www.pagasa.dost.gov.ph/weather/weather-advisory` (200): `weekly-content-adv` holds either "As of today, there is no Weather Advisory issued." or the advisory text.
- `https://www.pagasa.dost.gov.ph/` (200, about 1.9 MB, gzip on the wire): the "Active Warnings" block (`<h6 class="active-type">` labels). This is the only place a rainfall / thunderstorm label showed up; no dedicated heavy-rainfall page exists (`/weather/heavy-rainfall-warning` and `/weather/rainfall-warning` are 404), and the tropical-cyclone-advisory path is 404. The block gives a label only, no areas or time, so those rows carry `issued_at = null`, `areas = ''` and link to the home page.

## 2. Order
1. Apply `supabase/migrations/0059_pagasa_warnings.sql` (only on "apply 0059"). Undo: `0059_pagasa_warnings.down.sql`. Then add `"0059"` to `src/data/migrations.json` (the orchestrator does that).
2. Set the function secret, then deploy.
3. Store the cron secret in Vault, run the cron SQL below.
4. Test call.

## 3. Secrets (names only)
- `PAGASA_CRON_SECRET` (function secret, 32+ characters; the function answers 500 `not_configured` without it).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: provided by the platform.
- Vault secret `pagasa_cron_secret`: the same value, for the cron caller. A new `PAGASA_CRON_SECRET` value needs a redeploy of `pagasa-warnings` (the only function that reads it) and a new Vault value.

```
supabase secrets set PAGASA_CRON_SECRET=<value, set in your shell only>
supabase functions deploy pagasa-warnings --no-verify-jwt
```

`pagasa-warnings` bundles `_shared/heartbeat.ts` (unchanged by this lane, so no other function needs a redeploy).

## 4. Cron (every 30 minutes)
Run in the SQL editor after the secret is stored: `select vault.create_secret('<same value as PAGASA_CRON_SECRET>', 'pagasa_cron_secret');`

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'pagasa_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''pagasa_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule first.
select cron.unschedule(jobid) from cron.job where jobname = 'pagasa-warnings';

select cron.schedule(
  'pagasa-warnings',
  '*/30 * * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/pagasa-warnings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pagasa-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pagasa_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
```

## 5. Test call
```
curl -i -X POST https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/pagasa-warnings -H "x-pagasa-secret: $PAGASA_CRON_SECRET"
```
Expected: `200 {"ok":true,"rows":N,"failed":[]}`. N is 0 on a quiet day (no cyclone, no advisory, no home label) and that is a good answer; on 9 Nov 2026 it would have been 1 (Typhoon "Samuel", bulletin #1, no wind signal). Without the header: `401`. `GET`: `405`.
A `502` with `"failed":["bulletin"]` (or `advisory`, `home`) means that page could not be fetched or its markup was not recognised: nothing was stored for it, the other pages were still stored, `job_runs` row `pagasa-warnings` carries `ok=false` plus `bulletin_failed` / `advisory_failed` / `home_failed` flags, and an in-app system alert goes to the admins (once per 6 hours).

## 6. Behaviour to know (for the reader card)
- Current = `fetched_at` within the last 2 hours (four missed runs). Every run refreshes the rows it still sees; a cyclone that left the page, or a source that broke, simply ages out. Rows are kept 14 days, then deleted by the function after a run that read at least one page.
- Always show the link to PAGASA (`source_url`) and the plain line that PAGASA is the authority. If no row is current, say nothing about "safe": the function can fail silently for a source (admins get the alert).
- `signals` on a `tropical_cyclone` row: `[]` means the bulletin says "No Tropical Cyclone Wind Signal"; otherwise `[{level 1..5, areas}]`, highest first, `areas` is PAGASA's own text for that level. A bulletin whose wind-signal block cannot be read is dropped, never stored as "no signal".
- `areas` on a cyclone row is the "Location of Eye/center" sentence; on an advisory row it is the advisory text cut to 1500 characters.
- Order rows by `issued_at desc nulls last`; a newer bulletin of the same cyclone has a different title (`... Bulletin #2`) and so is a separate row, both kept until they age out.
- Not seen live: a bulletin with a wind signal in effect, the "no active cyclone" page wording, an active weather advisory and extra home labels. Their fixtures are marked SYNTHETIC; read the first real ones (`select * from pagasa_warnings`) and compare.
