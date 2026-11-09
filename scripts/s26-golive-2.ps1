# Family Bantay - S26 go-live part 2 (PR 2: migration 0059, pagasa-warnings). The owner runs this once, AFTER merging PR 2. Windows PowerShell 5.1.
# Run from the repo folder on main:  powershell -ExecutionPolicy Bypass -File scripts\s26-golive-2.ps1
# Stops at the first failure. The cron secret is generated here and never printed or written to the repo.
# This project applies migrations with db query -f and records them by hand, never db push.
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\s26-golive-2.ps1' }
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.122.0'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Pause-For($msg) { Read-Host "$msg  (press Enter when done)" | Out-Null }
function Clear-Clip { Set-Clipboard -Value ' '; try { [Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime]::ClearHistory() | Out-Null } catch {} }
function Q($n, [string[]]$a) { $ErrorActionPreference = 'Continue'; $o = & npx -y $Sb db query --linked @a 2>&1 | Out-String; $code = $LASTEXITCODE; $ErrorActionPreference = 'Stop'; Write-Host ($o.Trim() -replace '(?m)^', '  '); return @{ out = $o; code = $code } }

Step 1 'Checks: on main, clean, same as GitHub, PR 2 merged'
git fetch -q origin; Check 1
if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { throw 'step 1 failed: not on main' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes (stash them with a tag first)' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'step 1 failed: run git pull first' }
foreach ($f in 'supabase\migrations\0059_pagasa_warnings.sql', 'ops\sql\pagasa_cron.sql') { if (-not (Test-Path $f)) { throw "step 1 failed: $f missing (is PR 2 merged?)" } }

Step 2 'Supabase CLI: link the project if it is not linked yet'
if (-not (Test-Path 'supabase\.temp\project-ref')) { npx -y $Sb link --project-ref $Ref; Check 2 }

Step 3 'Live migrations must end at 0058'
$r = Q 3 @("select 'last=' || max(version) as v from supabase_migrations.schema_migrations;")
if ($r.out -notmatch 'last=0058') { throw 'step 3 failed: expected the last recorded migration to be 0058' }

Step 4 'Migration 0059 (PAGASA warnings table) and record it'
$r = Q 4 @('-f', 'supabase\migrations\0059_pagasa_warnings.sql'); if ($r.code -ne 0) { throw 'step 4 failed: 0059 did not apply' }
$r = Q 4 @("insert into supabase_migrations.schema_migrations (version, name) values ('0059','pagasa_warnings') on conflict do nothing;"); if ($r.code -ne 0) { throw 'step 4 failed: 0059 not recorded' }

Step 5 'Function secret PAGASA_CRON_SECRET, then deploy pagasa-warnings'
$bytes = New-Object byte[] 36
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$Secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')  # 48 chars, no quotes
$envFile = Join-Path $env:TEMP ('bantay-pagasa-' + [guid]::NewGuid() + '.env')
try {
  "PAGASA_CRON_SECRET=$Secret" | Set-Content -Path $envFile -Encoding ascii
  npx -y $Sb secrets set --env-file $envFile --project-ref $Ref; Check 5
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
npx -y $Sb functions deploy pagasa-warnings --no-verify-jwt --use-api --project-ref $Ref; Check 5

Step 6 'Store the same secret in Vault (SQL editor)'
Set-Clipboard -Value "select vault.create_secret('$Secret', 'pagasa_cron_secret');"
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one uuid back. Then delete that query tab so the secret is not kept as a snippet.'
Pause-For 'The Vault line is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 7 'One test call (expects ok; rows can be 0 on a quiet day)'
try {
  $r = Invoke-RestMethod -Method Post -Uri "https://$Ref.supabase.co/functions/v1/pagasa-warnings" -Headers @{ 'x-pagasa-secret' = $Secret } -ContentType 'application/json' -Body '{}' -TimeoutSec 120
  Write-Host ("  ok={0} rows={1} failed={2}" -f $r.ok, $r.rows, ($r.failed -join ','))
  if (-not $r.ok) { throw 'the function reported a failed source' }
} catch { throw "step 7 failed: $($_.Exception.Message)" }

Step 8 'Schedule pagasa-warnings every 30 minutes (SQL editor)'
Set-Clipboard -Value (Get-Content ops\sql\pagasa_cron.sql -Raw)
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one row with a job id.'
Pause-For 'ops/sql/pagasa_cron.sql is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 9 'Verify'
Q 9 @("select (select count(*) from supabase_migrations.schema_migrations where version = '0059') as recorded, (select count(*) from public.pagasa_warnings) as warnings, (select count(*) from cron.job where jobname = 'pagasa-warnings') as job;") | Out-Null
$Secret = $null; $bytes = $null
Pause-For 'Press Win+V and confirm the clipboard history is empty.'
Write-Host "`nDone. Expect recorded 1, job 1; warnings can be 0 on a quiet day." -ForegroundColor Green
