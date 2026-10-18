# Family Bantay - import the Bantay Medical Drive folder into the records confirm queue (docs/IMPORT.md). Lloyd runs it.
# Run from the records worktree:  powershell -ExecutionPolicy Bypass -File scripts\records-import.ps1
# Needs: import\people-map.json (git-ignored), OPENROUTER_API_KEY in the environment (paid, ZDR), a Drive token (asked below).
# Prints counts only. Every row lands as draft; nothing reaches trends until someone confirms it in the app.
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\records-import.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.121.0'
$Ref = 'wuakimpssycbtnmoexuc'
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }

Step 1 'Checks'
if (-not (Test-Path import\people-map.json)) { throw 'step 1 failed: import\people-map.json missing' }
if (-not $env:OPENROUTER_API_KEY) { throw 'step 1 failed: OPENROUTER_API_KEY is not set' }
if (-not (Test-Path node_modules)) { npm ci --no-audit --no-fund; Check 1 }

Step 2 'Drive token (OAuth Playground, scope drive.readonly). Paste it; it is not shown or saved.'
$sec = Read-Host 'Drive access token' -AsSecureString
$env:DRIVE_ACCESS_TOKEN = ([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))).Trim()
if ($env:DRIVE_ACCESS_TOKEN.Length -lt 40 -or -not $env:DRIVE_ACCESS_TOKEN.StartsWith('ya29.')) {
  Remove-Item Env:DRIVE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  throw "step 2 failed: that does not look like an access token (got $($sec.Length) characters; it should start with ya29. and be about 200 long). Paste with a right-click, then Enter."
}
Write-Host "  token received ($($sec.Length) characters)"
$env:DRIVE_ROOT_ID = (Get-Content 'importdrive-root.txt' -Raw).Trim()   # Bantay Medical folder id, kept in git-ignored import/drive-root.txt
$env:OPENROUTER_MODEL = 'google/gemini-3.5-flash-lite'
$env:OPENROUTER_FALLBACK_MODEL = 'anthropic/claude-haiku-5.5'
try {
  Step 3 'Sync: list, download, hash, dedupe (incremental)'
  node scripts/import/sync.mjs; Check 3

  Step 4 'Extract drafts (PDF text first, else vision; OpenRouter zdr, no data collection)'
  node scripts/import/extract.mjs --i-am-lloyd; Check 4
} finally {
  Remove-Item Env:DRIVE_ACCESS_TOKEN -ErrorAction SilentlyContinue; $sec = $null
}

Step 5 'Build load.sql (drafts only, idempotent)'
node scripts/import/load.mjs; Check 5

Step 6 'Apply load.sql to Supabase (one transaction)'
npx -y $Sb db query --linked --project-ref $Ref -f import/load.sql | Out-Null; Check 6

Step 7 'Queue counts (no values)'
npx -y $Sb db query --linked --project-ref $Ref "select kind, sum(drafts) as drafts from public.records_queue group by kind order by kind;"; Check 7
npx -y $Sb db query --linked --project-ref $Ref "select ingest_status, count(*) from public.source_files group by ingest_status order by 1;"; Check 7

Write-Host "`nDone. Open Family > Records > To check in the app to confirm each row." -ForegroundColor Green
