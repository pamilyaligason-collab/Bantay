# Family Bantay - session 6 lane M0: medications become the live schedule (migration 0014). Database only:
# no web push, and the current app does not read public.medications yet, so nobody sees a change until lane M1/M2 ship.
# Lloyd runs it from the repo root, dry run first:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-m0.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File scripts\golive-m0.ps1
# Rehearsed on a throwaway Postgres: supabase\tests\medications_rehearsal.sql (61 checks). Undo: 0014_medications_live.down.sql.
# Stops at the first failure.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-m0.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.122.0'
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  $ErrorActionPreference = 'Continue'; & $exe @a 2>&1 | ForEach-Object { "  $_" }
}
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Query([string]$sql) { $ErrorActionPreference = 'Continue'; (& npx -y $Sb db query --linked $sql 2>&1 | Out-String) }

Step 1 'checks: linked project, clean tree, 0013 recorded, 0014 not yet recorded'
if (-not (Test-Path 'supabase\.temp\project-ref')) { throw 'step 1 failed: supabase\.temp link missing (run: npx -y supabase@2.122.0 link)' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }
if (-not $DryRun) {
  if (-not ((Query "select count(*) as n0013 from supabase_migrations.schema_migrations where version='0013';") -match 'n0013\W+1')) { throw 'step 1 failed: 0013 is not recorded on the live database' }
  if ((Query "select count(*) as n0014 from supabase_migrations.schema_migrations where version='0014';") -match 'n0014\W+1') { throw 'step 1 failed: 0014 is already recorded (nothing to do)' }
}

Step 2 'apply 0014_medications_live (safe to run twice) and record it'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', 'supabase\migrations\0014_medications_live.sql'); Check 2
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "insert into supabase_migrations.schema_migrations (version, name) values ('0014','medications_live') on conflict do nothing;"); Check 2

Step 3 'verify (expect medications about 24, rx_origin = medications, confirmed_auto = medications, trigger 1, recorded 1)'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select count(*) as medications, count(*) filter (where origin='rx') as rx_origin, count(*) filter (where status='confirmed' and confirmed_source='auto') as confirmed_auto, count(*) filter (where med_status='active') as active, count(*) filter (where med_status='paused') as paused, count(*) filter (where med_status='stopped') as stopped, count(*) filter (where (schedule->>'needs_time')::boolean) as needs_time, (select count(*) from pg_trigger where tgname='prescription_items_convert') as trigger, (select count(*) from supabase_migrations.schema_migrations where version='0014') as recorded from public.medications;"); Check 3

Write-Host "`nDone. Nothing changes in the app yet. Paste the step 3 numbers back to Claude." -ForegroundColor Green
