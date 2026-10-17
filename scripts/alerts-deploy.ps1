# Family Bantay - official alerts setup (D-26). Lloyd runs this once. Windows PowerShell 5.1.
# Run from the repo folder:  powershell -ExecutionPolicy Bypass -File scripts\alerts-deploy.ps1
# Stops at the first failure. The cron secret is generated here and never printed or written to the repo.
# Steps follow docs/ALERTS.md: migration 0007, ALERTS_CRON_SECRET, deploy alerts-ingest, Vault copy, one test call, schedule.
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\alerts-deploy.ps1' }
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.121.0'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Pause-For($msg) { Read-Host "$msg  (press Enter when done)" | Out-Null }
function Clear-Clip { Set-Clipboard -Value ' '; try { [Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime]::ClearHistory() | Out-Null } catch {} }

Step 1 'Checks: on main, clean, same as GitHub'
git fetch -q origin; Check 1
if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { throw 'step 1 failed: not on main' }
if (git status --porcelain) { throw 'step 1 failed: working tree not clean' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'step 1 failed: run git pull first' }
if (-not (Test-Path supabase\migrations\0007_safety_alerts.sql)) { throw 'step 1 failed: 0007 missing' }

Step 2 'Supabase CLI: link the project (asks for the database password if not linked)'
npx -y $Sb link --project-ref $Ref; Check 2

Step 3 'Apply migration 0007 (dry run first)'
npx -y $Sb db push --dry-run; Check 3
Pause-For 'The dry run should list ONLY 0007_safety_alerts.sql. If it lists anything else, press Ctrl+C now.'
npx -y $Sb db push; Check 3

Step 4 'Function secret ALERTS_CRON_SECRET, then deploy alerts-ingest'
$bytes = New-Object byte[] 36
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$Secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')  # 48 chars, no quotes
$envFile = Join-Path $env:TEMP ('bantay-alerts-' + [guid]::NewGuid() + '.env')
try {
  "ALERTS_CRON_SECRET=$Secret" | Set-Content -Path $envFile -Encoding ascii
  npx -y $Sb secrets set --env-file $envFile --project-ref $Ref; Check 4
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
npx -y $Sb functions deploy alerts-ingest --no-verify-jwt --use-api --project-ref $Ref; Check 4

Step 5 'Store the same secret in Vault (SQL editor)'
Set-Clipboard -Value "select vault.create_secret('$Secret', 'alerts_cron_secret');"
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one uuid back. Then delete that query tab so the secret is not kept as a snippet.'
Pause-For 'The Vault line is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 6 'One test call (prints source status only)'
try {
  $r = Invoke-RestMethod -Method Post -Uri "https://$Ref.supabase.co/functions/v1/alerts-ingest" -Headers @{ 'x-alerts-secret' = $Secret } -ContentType 'application/json' -Body '{}' -TimeoutSec 90
  $r.sources.PSObject.Properties | ForEach-Object { Write-Host ("  {0}: ok={1}" -f $_.Name, $_.Value.ok) }
  if (-not $r.ok) { throw 'step 6 failed: every source failed' }
} catch { throw "step 6 failed: $($_.Exception.Message)" }

Step 7 'Schedule every 10 minutes (SQL editor)'
Set-Clipboard -Value (Get-Content ops\sql\alerts_cron.sql -Raw)
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one row with a job id.'
Pause-For 'ops/sql/alerts_cron.sql is on your clipboard. Paste it, Run it.'
Clear-Clip
$Secret = $null; $bytes = $null
Pause-For 'Press Win+V and confirm the clipboard history is empty.'

Write-Host "`nDone. In 10-20 minutes check in the SQL editor:" -ForegroundColor Green
Write-Host "  select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'alerts-ingest') order by start_time desc limit 3;"
