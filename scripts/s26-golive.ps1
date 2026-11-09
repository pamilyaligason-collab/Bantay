# Family Bantay - S26 go-live (PR 57: migrations 0056-0058, da-prices, lotto-pcso). The owner runs this once, AFTER merging PR 57. Windows PowerShell 5.1.
# Run from the repo folder on main:  powershell -ExecutionPolicy Bypass -File scripts\s26-golive.ps1
# Stops at the first failure. The cron secret is generated here and never printed or written to the repo.
# This project applies migrations with db query -f and records them by hand, never db push.
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\s26-golive.ps1' }
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.122.0'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Pause-For($msg) { Read-Host "$msg  (press Enter when done)" | Out-Null }
function Clear-Clip { Set-Clipboard -Value ' '; try { [Windows.ApplicationModel.DataTransfer.Clipboard, Windows.ApplicationModel.DataTransfer, ContentType = WindowsRuntime]::ClearHistory() | Out-Null } catch {} }
function Q($n, [string[]]$a) { $ErrorActionPreference = 'Continue'; $o = & npx -y $Sb db query --linked @a 2>&1 | Out-String; $code = $LASTEXITCODE; $ErrorActionPreference = 'Stop'; Write-Host ($o.Trim() -replace '(?m)^', '  '); return @{ out = $o; code = $code } }
function Apply($n, $ver, $name) {
  $r = Q $n @('-f', "supabase\migrations\${ver}_$name.sql"); if ($r.code -ne 0) { throw "step $n failed: $ver did not apply" }
  $r = Q $n @("insert into supabase_migrations.schema_migrations (version, name) values ('$ver','$name') on conflict do nothing;"); if ($r.code -ne 0) { throw "step $n failed: $ver not recorded" }
}

Step 1 'Checks: on main, clean, same as GitHub, PR 57 merged'
git fetch -q origin; Check 1
if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { throw 'step 1 failed: not on main' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes (stash them with a tag first)' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'step 1 failed: run git pull first' }
foreach ($f in 'supabase\migrations\0056_usage_allowlist.sql', 'supabase\migrations\0057_da_prices.sql', 'supabase\migrations\0058_lotto_jackpot.sql', 'ops\sql\usage_allowlist_check.sql', 'ops\sql\da_prices_cron.sql') { if (-not (Test-Path $f)) { throw "step 1 failed: $f missing (is PR 57 merged?)" } }

Step 2 'Supabase CLI: link the project if it is not linked yet'
if (-not (Test-Path 'supabase\.temp\project-ref')) { npx -y $Sb link --project-ref $Ref; Check 2 }

Step 3 'Live migrations must end at 0055 (nothing of S26 applied yet)'
$r = Q 3 @("select 'last=' || max(version) as v from supabase_migrations.schema_migrations;")
if ($r.out -notmatch 'last=0055') { throw 'step 3 failed: expected the last recorded migration to be 0055' }

Step 4 'Migration 0056 (usage allowlist), then a check that writes nothing'
Apply 4 '0056' 'usage_allowlist'
$r = Q 4 @('-f', 'ops\sql\usage_allowlist_check.sql')
if ($r.out -notmatch 'ALLOWLIST_OK') {
  Write-Host '  Check failed: undoing 0056.' -ForegroundColor Yellow
  Q 4 @('-f', 'supabase\migrations\0056_usage_allowlist.down.sql') | Out-Null
  Q 4 @("delete from supabase_migrations.schema_migrations where version='0056';") | Out-Null
  throw 'step 4 failed: 0056 did not behave (undone). Send the output above to Claude.'
}

Step 5 'Migration 0057 (DA prices table)'
Apply 5 '0057' 'da_prices'

Step 6 'Migration 0058 (lotto next jackpot)'
Apply 6 '0058' 'lotto_jackpot'

Step 7 'Function secret DA_CRON_SECRET, then deploy da-prices'
$bytes = New-Object byte[] 36
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$Secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')  # 48 chars, no quotes
$envFile = Join-Path $env:TEMP ('bantay-da-' + [guid]::NewGuid() + '.env')
try {
  "DA_CRON_SECRET=$Secret" | Set-Content -Path $envFile -Encoding ascii
  npx -y $Sb secrets set --env-file $envFile --project-ref $Ref; Check 7
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
npx -y $Sb functions deploy da-prices --no-verify-jwt --use-api --project-ref $Ref; Check 7

Step 8 'Store the same secret in Vault (SQL editor)'
Set-Clipboard -Value "select vault.create_secret('$Secret', 'da_cron_secret');"
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one uuid back. Then delete that query tab so the secret is not kept as a snippet.'
Pause-For 'The Vault line is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 9 'One test call (expects ok and about 200-250 rows)'
try {
  $r = Invoke-RestMethod -Method Post -Uri "https://$Ref.supabase.co/functions/v1/da-prices" -Headers @{ 'x-da-secret' = $Secret } -ContentType 'application/json' -Body '{}' -TimeoutSec 120
  Write-Host ("  ok={0} rows={1}" -f $r.ok, $r.rows)
  if (-not $r.ok -or $r.rows -lt 100) { throw 'too few price rows read' }
} catch { throw "step 9 failed: $($_.Exception.Message)" }

Step 10 'Schedule da-prices daily at 10:00 Manila (SQL editor)'
Set-Clipboard -Value (Get-Content ops\sql\da_prices_cron.sql -Raw)
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one row with a job id.'
Pause-For 'ops/sql/da_prices_cron.sql is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 11 'Deploy lotto-pcso (reads the jackpot; its cron already runs)'
npx -y $Sb functions deploy lotto-pcso --no-verify-jwt --use-api --project-ref $Ref; Check 11

Step 12 'Verify'
$r = Q 12 @("select (select string_agg(version, ',' order by version) from supabase_migrations.schema_migrations where version in ('0056','0057','0058')) as recorded, (select count(*) from public.da_prices) as prices, (select count(*) from cron.job where jobname = 'da-prices') as da_job, (select count(*) from public.lotto_next_jackpot) as next_jackpots;")
$Secret = $null; $bytes = $null
Pause-For 'Press Win+V and confirm the clipboard history is empty.'
Write-Host "`nDone. Expect recorded 0056,0057,0058; prices above 100; da_job 1. next_jackpots fills on the next lotto run." -ForegroundColor Green
