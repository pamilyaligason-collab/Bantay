# Family Bantay - regional news videos setup (S25, D-155/D-159). The owner runs this once. Windows PowerShell 5.1.
# Run from the repo folder on main:  powershell -ExecutionPolicy Bypass -File scripts\yt-feed-deploy.ps1
# Stops at the first failure. The cron secret is generated here and never printed or written to the repo.
# Steps: migration 0055, YT_FEED_CRON_SECRET, deploy yt-feed, Vault copy, one test call, rows check, schedule (ops/sql/yt_feed_cron.sql).
# No YouTube key is needed: the function reads the public channel RSS feeds. An optional YT_API_KEY secret is only a fallback if every feed fails (set it yourself with: npx supabase secrets set YT_API_KEY=...).
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\yt-feed-deploy.ps1' }
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
if (-not (Test-Path supabase\migrations\0055_news_videos.sql)) { throw 'step 1 failed: 0055 missing' }

Step 2 'Supabase CLI: link the project if it is not linked yet'
if (-not (Test-Path 'supabase\.temp\project-ref')) { npx -y $Sb link --project-ref $Ref; Check 2 }

Step 3 'Apply migration 0055 and record it (this project applies migrations with db query -f, never db push)'
$ErrorActionPreference = 'Continue'; & npx -y $Sb db query --linked -f supabase\migrations\0055_news_videos.sql 2>&1 | ForEach-Object { "  $_" }; $ErrorActionPreference = 'Stop'; Check 3
$ErrorActionPreference = 'Continue'; & npx -y $Sb db query --linked "insert into supabase_migrations.schema_migrations (version, name) values ('0055','news_videos') on conflict do nothing;" 2>&1 | ForEach-Object { "  $_" }; $ErrorActionPreference = 'Stop'; Check 3

Step 4 'Function secret YT_FEED_CRON_SECRET, then deploy yt-feed'
$bytes = New-Object byte[] 36
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$Secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')  # 48 chars, no quotes
$envFile = Join-Path $env:TEMP ('bantay-ytfeed-' + [guid]::NewGuid() + '.env')
try {
  "YT_FEED_CRON_SECRET=$Secret" | Set-Content -Path $envFile -Encoding ascii
  npx -y $Sb secrets set --env-file $envFile --project-ref $Ref; Check 4
} finally { Remove-Item $envFile -Force -ErrorAction SilentlyContinue }
npx -y $Sb functions deploy yt-feed --no-verify-jwt --use-api --project-ref $Ref; Check 4

Step 5 'Store the same secret in Vault (SQL editor)'
Set-Clipboard -Value "select vault.create_secret('$Secret', 'yt_feed_cron_secret');"
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one uuid back. Then delete that query tab so the secret is not kept as a snippet.'
Pause-For 'The Vault line is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 6 'One test call (expects ok and rows above 0)'
try {
  $r = Invoke-RestMethod -Method Post -Uri "https://$Ref.supabase.co/functions/v1/yt-feed" -Headers @{ 'x-yt-secret' = $Secret } -ContentType 'application/json' -Body '{}' -TimeoutSec 90
  Write-Host ("  ok={0} rows={1} source={2}" -f $r.ok, $r.rows, $r.source)
  if (-not $r.ok -or $r.rows -lt 1) { throw 'no video read' }
} catch { throw "step 6 failed: $($_.Exception.Message)" }

Step 7 'Check the rows are there (must be above 0)'
$ErrorActionPreference = 'Continue'; $n = & npx -y $Sb db query --linked "select 'rows=' || count(*) as r from public.news_videos;" 2>&1 | Out-String; $ErrorActionPreference = 'Stop'; Check 7
Write-Host "  $n"
if ($n -notmatch 'rows=[1-9]') { throw 'step 7 failed: news_videos is empty' }

Step 8 'Schedule every 30 minutes (SQL editor)'
Set-Clipboard -Value (Get-Content ops\sql\yt_feed_cron.sql -Raw)
Write-Host 'Supabase > SQL Editor > New query. Paste (Ctrl+V) and Run. Expect one row with a job id.'
Pause-For 'ops/sql/yt_feed_cron.sql is on your clipboard. Paste it, Run it.'
Clear-Clip

Step 9 'Verify'
$ErrorActionPreference = 'Continue'; & npx -y $Sb db query --linked "select (select count(*) from supabase_migrations.schema_migrations where version='0055') as recorded, (select count(*) from public.news_videos) as videos, (select count(*) from cron.job where jobname like 'yt-feed%') as jobs;" 2>&1 | ForEach-Object { "  $_" }; $ErrorActionPreference = 'Stop'
$Secret = $null; $bytes = $null
Pause-For 'Press Win+V and confirm the clipboard history is empty.'
Write-Host "`nDone. Expect recorded 1, videos above 0, jobs 1." -ForegroundColor Green
