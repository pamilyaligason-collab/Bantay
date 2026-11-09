# da-prices deploy note (S26 lane P2D, D-164)

Written only. The orchestrator / owner applies each step; nothing here has been deployed, applied or scheduled.

Source: https://www.da.gov.ph/price-monitoring/ (DA Daily Price Index, National Capital Region, wet-market prices; label it "NCR", not the user's town). Unit rules come from the PDF's note c): eggs per piece, cooking oil per liter, everything else per kilogram.

## 1. Order
1. Apply `supabase/migrations/0057_da_prices.sql` (only on "apply 0057"). Undo: `0057_da_prices.down.sql`. Add `"0057"` to `src/data/migrations.json` after it is applied.
2. Set the function secret, then deploy.
3. Store the cron secret in Vault, run the cron SQL below.
4. Test call.

## 2. Secrets (names only)
- `DA_CRON_SECRET` (function secret, 32+ characters; the function answers 500 `not_configured` without it).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: provided by the platform.
- Vault secret `da_cron_secret`: the same value, for the cron caller. A new `DA_CRON_SECRET` value needs a redeploy of `da-prices` (it is the only function that reads it) and a new Vault value.

```
supabase secrets set DA_CRON_SECRET=<value, set in your shell only>
supabase functions deploy da-prices --no-verify-jwt
```

`da-prices` bundles `_shared/heartbeat.ts` (shared with every scheduled function; unchanged by this lane, so no other function needs a redeploy) and `npm:pdfjs-dist@6.4.299`.

## 3. Cron (daily 10:00 Asia/Manila = 02:00 UTC)
Run in the SQL editor after the secret is stored: `select vault.create_secret('<same value as DA_CRON_SECRET>', 'da_cron_secret');`

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'da_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''da_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule first.
select cron.unschedule(jobid) from cron.job where jobname = 'da-prices';

select cron.schedule(
  'da-prices',
  '0 2 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/da-prices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-da-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'da_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
```

## 4. Test call
```
curl -i -X POST https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/da-prices -H "x-da-secret: $DA_CRON_SECRET"
```
Expected: `200 {"ok":true,"rows":N}` with N about 200-250 (238 on 8 Nov 2026), and `select count(*) from public.da_prices where price_date = '2026-11-08'` equal to N. Without the header: `401`. `GET`: `405`. A `502 {"ok":false,"rows":0}` means the listing page or the PDF layout changed (nothing was written or purged); `job_runs` row `da-prices` carries `ok=false` and an in-app system alert goes to the admins.

## 5. Behaviour to know
- Newest PDF is chosen by the date in the file name; the title line inside the PDF must agree, else nothing is written.
- Rows for the same commodity and specification under two sections (imported and local rice) are stored with the section in the commodity name, e.g. `Glutinous (Imported Commercial Rice)`.
- Wrapped names and specifications (up to 4 lines, e.g. `Honeycomb Tripe (Reticulum)/Tuwalya, Imported`, `Head Mask`) are read in full: every text line goes to the nearest price line of its section, never across a section header. Notes under the last table are ignored. Checked on the 8 Nov 2026 PDF: 238 rows, none starting with `(` or a lowercase fragment. A name or specification longer than 120 / 160 characters is cut at that length, not repaired.
- "n/a" rows (not available in the market) are not stored: unknown stays absent, never 0.
- Keeps 60 days (`price_date` older than today minus 60 days is deleted after each good run). Weekend files exist (8 Nov 2026 was a Sunday), so the daily run is enough.
