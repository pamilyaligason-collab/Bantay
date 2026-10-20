# Family Bantay - session 6 lanes T + M1: usage events carry the phone time (0015) and the medication converter
# tombstones instead of deleting (0016). Apply BEFORE any web push that
# includes lane T, because the app then sends client_at and an older database would refuse the column.
# Lloyd runs it from a worktree of the branch, dry run first:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-t.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File scripts\golive-t.ps1
# Rehearsed: supabase\tests\admin_rehearsal.sql (0015 block). Undo: 0015_usage_client_at.down.sql. Stops at the first failure.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-t.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.121.0'
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  $ErrorActionPreference = 'Continue'; & $exe @a 2>&1 | ForEach-Object { "  $_" }
}
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Query([string]$sql) { $ErrorActionPreference = 'Continue'; (& npx -y $Sb db query --linked $sql 2>&1 | Out-String) }

Step 1 'checks: linked project, clean tree, 0014 recorded'
if (-not (Test-Path 'supabase\.temp\project-ref')) { throw 'step 1 failed: supabase\.temp link missing (copy it from D:\Claude\Bantay\supabase\.temp)' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }
if (-not $DryRun -and -not ((Query "select count(*) as n0014 from supabase_migrations.schema_migrations where version='0014';") -match 'n0014\W+1')) { throw 'step 1 failed: 0014 is not recorded on the live database' }

Step 2 'apply 0015_usage_client_at (safe to run twice) and record it'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', 'supabase\migrations\0015_usage_client_at.sql'); Check 2
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "insert into supabase_migrations.schema_migrations (version, name) values ('0015','usage_client_at') on conflict do nothing;"); Check 2

Step 2 'apply 0016_medications_softdelete (safe to run twice) and record it'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', 'supabase\migrations\0016_medications_softdelete.sql'); Check 2
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "insert into supabase_migrations.schema_migrations (version, name) values ('0016','medications_softdelete') on conflict do nothing;"); Check 2

Step 3 'verify (expect client_at_column 1, recorded 2, live_medications 24)'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select (select count(*) from information_schema.columns where table_schema='public' and table_name='usage_events' and column_name='client_at') as client_at_column, (select count(*) from supabase_migrations.schema_migrations where version in ('0015','0016')) as recorded, (select count(*) from public.medications where deleted_at is null) as live_medications;"); Check 3

Write-Host "`nDone. Paste the step 3 numbers back to Claude." -ForegroundColor Green
