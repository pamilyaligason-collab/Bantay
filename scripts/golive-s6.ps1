# Family Bantay - session 6 database + server release (lanes T, M1 fixes, M5, M7b). Windows PowerShell 5.1.
# Run from a worktree of the session 6 branch (the files are not on main until the merge), dry run first:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-s6.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File scripts\golive-s6.ps1
# Order matters: this runs BEFORE the web release (merge to main, Cloudflare Pages), because the new app sends
# usage_events.client_at (0015) and reads news_items.zone (0017).
# Migrations: 0015 usage client time, 0016 converter tombstones, 0017 news zone, 0018 dose-watch log.
# Then the dose-watch function (missed-dose push to carers): secret, deploy, Vault copy, one test call, schedule.
# Each migration is rehearsed in supabase\tests\*_rehearsal.sql (all pass). The cron secret is generated here and never
# printed or written to the repo. Stops at the first failure.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-s6.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.121.0'
$Migs = @(@('0015', 'usage_client_at'), @('0016', 'medications_softdelete'), @('0017', 'news_zone'), @('0018', 'dose_watch'))
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  $ErrorActionPreference = 'Continue'; & $exe @a 2>&1 | ForEach-Object { "  $_" }
}
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Query([string]$sql) { $ErrorActionPreference = 'Continue'; (& npx -y $Sb db query --linked $sql 2>&1 | Out-String) }
function Pause-For($msg) { if ($DryRun) { Write-Host "  [dry-run] pause: $msg" -ForegroundColor DarkGray } else { Read-Host "$msg  (press Enter when done)" | Out-Null } }
function Clear-Clip { Set-Clipboard -Value ' '; try { [Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime]::ClearHistory() | Out-Null } catch {} }

Step 1 'checks: linked project, clean tree, 0014 recorded, 0015-0018 not yet, push keys present'
if (-not (Test-Path 'supabase\.temp\project-ref')) { throw 'step 1 failed: supabase\.temp link missing (copy it from D:\Claude\Bantay\supabase\.temp)' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }
foreach ($m in $Migs) { if (-not (Test-Path "supabase\migrations\$($m[0])_$($m[1]).sql")) { throw "step 1 failed: $($m[0]) file missing (wrong branch?)" } }
if (-not $DryRun) {
  if (-not ((Query "select count(*) as n0014 from supabase_migrations.schema_migrations where version='0014';") -match 'n0014\W+1')) { throw 'step 1 failed: 0014 is not recorded on the live database' }
  $done = Query "select string_agg(version, ',') as v from supabase_migrations.schema_migrations where version in ('0015','0016','0017','0018');"
  if ($done -match '001[5-8]') { Write-Host "  note: already recorded: $done (each migration is safe to run again)" -ForegroundColor Yellow }
  $secrets = (& npx -y $Sb secrets list --project-ref $Ref 2>&1 | Out-String)
  foreach ($k in 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT') { if ($secrets -notmatch $k) { throw "step 1 failed: function secret $k is not set (it is the same one broadcast uses)" } }
}

Step 2 'apply 0015-0018 (each safe to run twice) and record them'
foreach ($m in $Migs) {
  Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', "supabase\migrations\$($m[0])_$($m[1]).sql"); Check 2
  Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "insert into supabase_migrations.schema_migrations (version, name) values ('$($m[0])','$($m[1])') on conflict do nothing;"); Check 2
}

Step 3 'verify (expect recorded 4, client_at 1, news_zone 1, dose_watch_sent 1, live_medications 24)'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select (select count(*) from supabase_migrations.schema_migrations where version in ('0015','0016','0017','0018')) as recorded, (select count(*) from information_schema.columns where table_schema='public' and table_name='usage_events' and column_name='client_at') as client_at, (select count(*) from information_schema.columns where table_schema='public' and table_name='news_items' and column_name='zone') as news_zone, (select count(*) from pg_tables where schemaname='public' and tablename='dose_watch_sent') as dose_watch_sent, (select count(*) from public.medications where deleted_at is null) as live_medications;"); Check 3

Step 4 'dose-watch: function secret DOSE_WATCH_CRON_SECRET, then deploy'
$bytes = New-Object byte[] 36
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$Secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')  # 48 chars, no quotes
if (-not $DryRun) {
  $envFile = Join-Path $env:TEMP ('bantay-dw-' + [guid]::NewGuid() + '.env')
  try {
    "DOSE_WATCH_CRON_SECRET=$Secret" | Set-Content -Path $envFile -Encoding ascii
    npx -y $Sb secrets set --env-file $envFile --project-ref $Ref; Check 4
  } finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
}
Run 'npx' @('-y', $Sb, 'functions', 'deploy', 'dose-watch', '--no-verify-jwt', '--use-api', '--project-ref', $Ref); Check 4

Step 5 'store the same secret in Vault (SQL editor)'
if (-not $DryRun) { Set-Clipboard -Value "select vault.create_secret('$Secret', 'dose_watch_cron_secret');" }
Write-Host '  Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one uuid back. Then close that query tab without saving.'
Pause-For 'The Vault line is on your clipboard. Paste it, Run it.'
if (-not $DryRun) { Clear-Clip }

Step 6 'one test call (prints counts only, never names)'
if (-not $DryRun) {
  try {
    $r = Invoke-RestMethod -Method Post -Uri "https://$Ref.supabase.co/functions/v1/dose-watch" -Headers @{ 'x-dose-watch-secret' = $Secret } -ContentType 'application/json' -Body '{}' -TimeoutSec 90
    Write-Host ("  ok={0} due={1} claimed={2} sent={3} removed={4}" -f $r.ok, $r.due, $r.claimed, $r.sent, $r.removed)
    if (-not $r.ok) { throw 'step 6 failed: function answered not ok' }
  } catch { throw "step 6 failed: $($_.Exception.Message)" }
}

Step 7 'schedule every 15 minutes (SQL editor)'
if (-not $DryRun) { Set-Clipboard -Value (Get-Content ops\sql\dose_watch_cron.sql -Raw) }
Write-Host '  Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one row with a job id.'
Pause-For 'ops/sql/dose_watch_cron.sql is on your clipboard. Paste it, Run it.'
if (-not $DryRun) { Clear-Clip }
$Secret = $null; $bytes = $null
Pause-For 'Press Win+V and confirm the clipboard history is empty.'

Write-Host "`nDone. Paste the step 3 numbers and the step 6 line back to Claude; then the web release (merge to main) can go." -ForegroundColor Green
