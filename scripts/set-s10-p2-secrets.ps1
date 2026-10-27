# Family Bantay - session 10 Phase 2 secrets. Lloyd runs it once from this worktree, BEFORE scripts\golive-s10-p2.ps1:
#   powershell -ExecutionPolicy Bypass -File scripts\set-s10-p2-secrets.ps1
# Makes ERASE_CRON_SECRET (48 chars) and FAMILY_INVITE_TOKEN (32 chars) from the OS random generator, sets them as function secrets,
# stores the erase secret in Vault as erase_cron_secret (the erasure cron reads it there), and writes the invite link to a file
# in your profile. No value is printed or put on a command line; the temp files are deleted at the end.
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\set-s10-p2-secrets.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.121.0'
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
function Run([string[]]$a) { $ErrorActionPreference = 'Continue'; & npx -y $Sb @a 2>&1 | ForEach-Object { "  $_" } }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Token([int]$n) {
  $abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; $b = New-Object byte[] $n
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  -join ($b | ForEach-Object { $abc[$_ % $abc.Length] })
}

Step 1 'checks: Supabase link, secrets not set yet'
if (-not (Test-Path 'supabase\.temp\project-ref')) {
  $main = (git rev-parse --path-format=absolute --git-common-dir) -replace '[\\/]\.git$', ''
  if (-not (Test-Path "$main\supabase\.temp\project-ref")) { throw 'step 1 failed: no supabase\.temp link here or in the main checkout' }
  Copy-Item "$main\supabase\.temp" 'supabase\.temp' -Recurse
}
$ErrorActionPreference = 'Continue'; $names = (& npx -y $Sb secrets list 2>&1) -join "`n"; $ErrorActionPreference = 'Stop'; Check 1
$todo = @('ERASE_CRON_SECRET', 'FAMILY_INVITE_TOKEN') | Where-Object { $names -notmatch "\b$_\b" }
if (-not $todo) { Write-Host '  both are set already; nothing to do. Run scripts\golive-s10-p2.ps1.' -ForegroundColor Green; return }

$env_ = Join-Path $env:TEMP "bantay-s10p2-$([guid]::NewGuid()).env"
$sql = Join-Path $env:TEMP "bantay-s10p2-$([guid]::NewGuid()).sql"
try {
  $erase = Token 48; $invite = Token 32; $lines = @()
  if ($todo -contains 'ERASE_CRON_SECRET') { $lines += "ERASE_CRON_SECRET=$erase" }
  if ($todo -contains 'FAMILY_INVITE_TOKEN') { $lines += "FAMILY_INVITE_TOKEN=$invite" }
  [IO.File]::WriteAllLines($env_, $lines)

  Step 2 "set function secrets: $($todo -join ', ')"
  Run @('secrets', 'set', '--env-file', $env_); Check 2

  if ($todo -contains 'ERASE_CRON_SECRET') {
    Step 3 'store the same erase secret in Vault as erase_cron_secret'
    [IO.File]::WriteAllText($sql, "select vault.create_secret('$erase', 'erase_cron_secret') where not exists (select 1 from vault.secrets where name = 'erase_cron_secret');")
    Run @('db', 'query', '--linked', '-f', $sql); Check 3
  }

  if ($todo -contains 'FAMILY_INVITE_TOKEN') {
    Step 4 'write the family invite link to your profile (share it only with family)'
    $out = Join-Path $env:USERPROFILE 'bantay-invite-link.txt'
    [IO.File]::WriteAllText($out, "https://bantay.pages.dev/#join/$invite`r`n")
    Write-Host "  saved: $out" -ForegroundColor Green
  }
} finally {
  Remove-Item $env_, $sql -Force -ErrorAction SilentlyContinue
}
Write-Host "`nDone. Now run: powershell -ExecutionPolicy Bypass -File scripts\golive-s10-p2.ps1" -ForegroundColor Green
