# Family Bantay - lotto results setup (S24, D-152/D-153). The owner runs this once. Windows PowerShell 5.1.
# Run from the repo folder on main:  powershell -ExecutionPolicy Bypass -File scripts\lotto-deploy.ps1
# Stops at the first failure. The cron secret is generated here and never printed or written to the repo.
# Applied live 2026-11-08 (11 draws, 4 jobs); kept to redo the setup on a fresh project. Steps: migration 0054, LOTTO_CRON_SECRET, deploy lotto-pcso, Vault copy, one test call, schedule (ops/sql/lotto_cron.sql).
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\lotto-deploy.ps1' }
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.122.0'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Pause-For($msg) { Read-Host "$msg  (press Enter when done)" | Out-Null }
function Clear-Clip { Set-Clipboard -Value ' '; try { [Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime]::ClearHistory() | Out-Null } catch {} }

Step 1 'Checks: on main, clean, same as GitHub'
git fetch -q origin; Check 1
if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { throw 'step 1 failed: not on main' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'step 1 failed: run git pull first' }
if (-not (Test-Path supabase\migrations\0054_lotto.sql)) { throw 'step 1 failed: 0054 missing' }

Step 2 'Supabase CLI: link the project if it is not linked yet'
if (-not (Test-Path 'supabase\.temp\project-ref')) { npx -y $Sb link --project-ref $Ref; Check 2 }

Step 3 'Apply migration 0054 and record it (this project applies migrations with db query -f, never db push)'
$ErrorActionPreference = 'Continue'; & npx -y $Sb db query --linked -f supabase\migrations\0054_lotto.sql 2>&1 | ForEach-Object { "  $_" }; $ErrorActionPreference = 'Stop'; Check 3
$ErrorActionPreference = 'Continue'; & npx -y $Sb db query --linked "insert into supabase_migrations.schema_migrations (version, name) values ('0054','lotto') on conflict do nothing;" 2>&1 | ForEach-Object { "  $_" }; $ErrorActionPreference = 'Stop'; Check 3

Step 4 'Function secret LOTTO_CRON_SECRET, then deploy lotto-pcso'
$bytes = New-Object byte[] 36
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$Secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')  # 48 chars, no quotes
$envFile = Join-Path $env:TEMP ('bantay-lotto-' + [guid]::NewGuid() + '.env')
try {
  "LOTTO_CRON_SECRET=$Secret" | Set-Content -Path $envFile -Encoding ascii
  npx -y $Sb secrets set --env-file $envFile --project-ref $Ref; Check 4
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
npx -y $Sb functions deploy lotto-pcso --no-verify-jwt --use-api --project-ref $Ref; Check 4

Step 5 'Store the same secret in Vault (SQL editor)'
Set-Clipboard -Value "select vault.create_secret('$Secret', 'lotto_cron_secret');"
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one uuid back. Then delete that query tab so the secret is not kept as a snippet.'
Pause-For 'The Vault line is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 6 'One test call (expects ok and rows above 0)'
try {
  $r = Invoke-RestMethod -Method Post -Uri "https://$Ref.supabase.co/functions/v1/lotto-pcso" -Headers @{ 'x-lotto-secret' = $Secret } -ContentType 'application/json' -Body '{}' -TimeoutSec 90
  Write-Host ("  ok={0} rows={1}" -f $r.ok, $r.rows)
  if (-not $r.ok -or $r.rows -lt 1) { throw 'step 6 failed: no valid draw read' }
} catch { throw "step 6 failed: $($_.Exception.Message)" }

Step 7 'Schedule 4 runs a day (SQL editor)'
Set-Clipboard -Value (Get-Content ops\sql\lotto_cron.sql -Raw)
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect four rows with job ids.'
Pause-For 'ops/sql/lotto_cron.sql is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 8 'Verify'
$ErrorActionPreference = 'Continue'; & npx -y $Sb db query --linked "select (select count(*) from supabase_migrations.schema_migrations where version='0054') as recorded, (select count(*) from public.lotto_results) as draws, (select count(*) from cron.job where jobname like 'lotto-pcso%') as jobs;" 2>&1 | ForEach-Object { "  $_" }; $ErrorActionPreference = 'Stop'
$Secret = $null; $bytes = $null
Pause-For 'Press Win+V and confirm the clipboard history is empty.'
Write-Host "`nDone. Expect recorded 1, draws above 0, jobs 4." -ForegroundColor Green
