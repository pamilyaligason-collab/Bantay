# Family Bantay - session 10 Phase 2 'apply' (safety wave, PR #13). Lloyd runs it from this worktree BEFORE merging the PR:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-s10-p2.ps1          (add -DryRun to print the steps only)
# Order (release review): checks -> 0030 -> deploy dose-watch -> 0031..0036 (each recorded) -> verify -> deploy the other functions -> erasure cron -> post-checks.
# dose-watch goes right after 0030 so the 0031/0035 trigger flushes reach the new name-free function. Stops at the first failure.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)  # CLI tables are UTF-8; PS 5.1 shows them as mojibake otherwise
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-s10-p2.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.122.0'
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
# PS 5.1 + Stop turns CLI progress on stderr into errors: run natives with a local Continue, judge by exit code.
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  $ErrorActionPreference = 'Continue'; & $exe @a 2>&1 | ForEach-Object { "  $_" }
}
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Q($sql) { Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', $sql) }
function Apply($n, $ver, $name) {
  Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', "supabase\migrations\${ver}_$name.sql"); Check $n
  Q "insert into supabase_migrations.schema_migrations (version, name) values ('$ver','$name') on conflict do nothing;"; Check $n
}
function Deploy($n, $fn, [switch]$Jwt) {
  $a = @('-y', $Sb, 'functions', 'deploy', $fn); if (-not $Jwt) { $a += '--no-verify-jwt' }
  Run 'npx' $a; Check $n
}

Step 1 'checks: Supabase link, clean tree'
if (-not (Test-Path 'supabase\.temp\project-ref')) {
  $main = (git rev-parse --path-format=absolute --git-common-dir) -replace '[\\/]\.git$', ''
  if (-not (Test-Path "$main\supabase\.temp\project-ref")) { throw 'step 1 failed: no supabase\.temp link here or in the main checkout' }
  Copy-Item "$main\supabase\.temp" 'supabase\.temp' -Recurse
}
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }

Step 2 'function secrets present (names only, values are never printed)'
if (-not $DryRun) {
  $ErrorActionPreference = 'Continue'; $names = (& npx -y $Sb secrets list 2>&1) -join "`n"; $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw 'step 2 failed: supabase secrets list' }
  $missing = @('ERASE_CRON_SECRET', 'FAMILY_INVITE_TOKEN', 'DOSE_WATCH_CRON_SECRET') | Where-Object { $names -notmatch "\b$_\b" }
  if ($missing) { throw "step 2 failed: set these first with: npx -y $Sb secrets set NAME=<value>   missing: $($missing -join ', ')" }
}

Step 3 'preflight (expect has_0029=1, done_0030_0036=0, vault_dose=1, vault_erase=1)'
Q "select (select count(*) from supabase_migrations.schema_migrations where version='0029') as has_0029, (select count(*) from supabase_migrations.schema_migrations where version between '0030' and '0036') as done_0030_0036, (select count(*) from vault.decrypted_secrets where name='dose_watch_cron_secret') as vault_dose, (select count(*) from vault.decrypted_secrets where name='erase_cron_secret') as vault_erase;"; Check 3
Write-Host '  vault_erase=0? Store it first in the SQL editor: select vault.create_secret(''<same as ERASE_CRON_SECRET>'', ''erase_cron_secret'');' -ForegroundColor Yellow

Step 4 'apply 0030_carer_alerts'; Apply 4 '0030' 'carer_alerts'
Step 5 'deploy dose-watch (before 0031: trigger flushes must reach the name-free function)'; Deploy 5 'dose-watch'
Step 6 'apply 0031_sos'; Apply 6 '0031' 'sos'
Step 7 'apply 0032_phone_health'; Apply 7 '0032' 'phone_health'
Step 8 'apply 0033_job_runs'; Apply 8 '0033' 'job_runs'
Step 9 'apply 0034_pin_reset_erasure (old cached bundles lose Forgot PIN until the merge: keep going)'; Apply 9 '0034' 'pin_reset_erasure'
Step 10 'apply 0035_reading_alerts'; Apply 10 '0035' 'reading_alerts'
Step 11 'apply 0036_scan_skip'; Apply 11 '0036' 'scan_skip'

Step 12 'verify (expect recorded=7, carer_alerts=1, sos_events=1, phone_health=1, job_runs=1, pin_reset=1, net_http_post=1)'
Q "select (select count(*) from supabase_migrations.schema_migrations where version between '0030' and '0036') as recorded, (select count(*) from pg_tables where schemaname='public' and tablename='carer_alerts') as carer_alerts, (select count(*) from pg_tables where schemaname='public' and tablename='sos_events') as sos_events, (select count(*) from pg_tables where schemaname='public' and tablename='phone_health') as phone_health, (select count(*) from pg_tables where schemaname='public' and tablename='job_runs') as job_runs, (select count(*) from pg_tables where schemaname='public' and tablename='pin_reset_requests') as pin_reset, (select count(*) from (select to_regproc('net.http_post') as p) x where p is not null) as net_http_post;"; Check 12

Step 13 'deploy the other edge functions'
Deploy 13 'records-extract'; Deploy 13 'alerts-ingest'; Deploy 13 'broadcast' -Jwt; Deploy 13 'pin-login'; Deploy 13 'family-names'
Deploy 13 'erase'; Deploy 13 'admin-members'; Deploy 13 'ask'

Step 14 'schedule the erasure cron (daily 03:10 Manila)'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', 'ops\sql\erasure_cron.sql'); Check 14

Step 15 'post-checks (expect erasure_job=1; job_runs fill in as the crons run)'
Q "select (select count(*) from cron.job where jobname='erasure') as erasure_job; select job, ok, ran_at from public.job_runs order by ran_at desc limit 5;"; Check 15

Write-Host "`nApplied. Next: merge PR #13 on GitHub (Cloudflare Pages deploys main), check bantay.pages.dev shows the new bundle," -ForegroundColor Green
Write-Host "then build and ship APK 2.3.0 (CALL_PHONE, CallPlugin). Rollback: docs/session-10/contracts.md 'Rollback' (functions from tag pre-s10-p2)." -ForegroundColor Green
