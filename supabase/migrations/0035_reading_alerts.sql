-- 0035 reading alerts (session 10, lane S9, D-78). WRITTEN ONLY: Lloyd applies it, after 0030 (notify_family, carer_alerts).
-- A dangerous reading logged at home or read from a device puts one in-app row in front of the person's writer carers ("Please check on <name>", template reading_high).
-- It carries no value (B-7); web push for PWA carers goes out at once through the dose-watch {mode:'flush'} call. The Android app shows the row when it is opened (D-78).
-- Lines (each reading on its own, so one bad number is never averaged away) and the copy need the clinician sign-off: docs/session-8/CLINICAL-REVIEW.md "Session 10 safety".
--   blood pressure top >= 180 OR bottom >= 120; sugar (glucose, fasting_glucose) < 70 or > 300 mg/dL (mmol/L x 18 first); oxygen (spo2) < 90.
-- Only home and device rows count (source_file_id is null: a lab import is old news) and only fresh ones (taken in the last 2 hours: a device sync of last week's readings stays quiet).
-- One alert per person per kind of reading per 6 hours (the dedupe ref). The trigger never blocks the reading: a failure raises a warning and the row still commits,
-- and the push call sits in its own block so a push failure never rolls back the alert row.
-- Needs: 0030 applied first (notify_family, carer_alerts); the Vault secret dose_watch_cron_secret (same one the 0031 trigger and the cron use). Idempotent. Undo: 0035_reading_alerts.down.sql.

create or replace function public.readings_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_mg numeric;
  v_n int := 0;
begin
  begin
    if new.source_file_id is not null or new.taken_at is null or new.taken_at <= now() - interval '2 hours' then
      return new;
    end if;
    if new.test = 'bp_systolic' and new.value >= 180 then v_kind := 'bp';
    elsif new.test = 'bp_diastolic' and new.value >= 120 then v_kind := 'bp';
    elsif new.test in ('glucose', 'fasting_glucose') then
      v_mg := case when lower(coalesce(new.unit, '')) like 'mmol%' then new.value * 18 else new.value end;
      if v_mg < 70 or v_mg > 300 then v_kind := 'glucose'; end if;
    elsif new.test = 'spo2' and new.value < 90 then v_kind := 'spo2';
    end if;
    if v_kind is null then
      return new;
    end if;
    v_n := public.notify_family(new.person_id, 'reading_high', 'reading_high',
      new.person_id::text || ':' || v_kind || ':' || floor(extract(epoch from now()) / 21600)::bigint::text, 'carers');
  exception when others then
    raise warning 'readings_alert: %', sqlerrm;
    return new;
  end;

  -- web push for PWA carers at once; the in-app row is already stored whatever happens here
  if v_n > 0 then
    begin
      if to_regproc('net.http_post') is not null and to_regclass('vault.decrypted_secrets') is not null then
        perform net.http_post(
          url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/dose-watch',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-dose-watch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dose_watch_cron_secret')
          ),
          body := '{"mode":"flush"}'::jsonb,
          timeout_milliseconds := 5000
        );
      end if;
    exception when others then
      raise warning 'readings_alert flush: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

-- grants restated in full (ML-21): a trigger function is never called by a client
revoke all on function public.readings_alert() from public, anon, authenticated, service_role;

drop trigger if exists readings_alert on public.readings;
create trigger readings_alert after insert on public.readings
  for each row execute function public.readings_alert();
