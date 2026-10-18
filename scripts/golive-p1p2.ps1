# Family Bantay - go live for P1/P2. Lloyd runs this once from the repo root. Windows PowerShell 5.1.
#   powershell -ExecutionPolicy Bypass -File scripts\golive-p1p2.ps1            (real run)
#   powershell -ExecutionPolicy Bypass -File scripts\golive-p1p2.ps1 -DryRun    (prints every native/network command, runs none)
# Stops at the first failure. No secrets in this file; the CLI uses your existing login and linked project.
# Needs: supabase CLI login + project linked (see scripts\alerts-deploy.ps1), git remote 'origin', Android SDK at D:\Android\Sdk.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-p1p2.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.121.0'
$Branch = 'claude/bantay-session-4-audit-build-0a39a2'
$Mig = '0009_pin_reset_requests'
$env:ANDROID_HOME = 'D:\Android\Sdk'; $env:ANDROID_SDK_ROOT = 'D:\Android\Sdk'

function Step($n, $t) { Write-Host "== step ${n}: $t" -ForegroundColor Cyan }
# Runs a native command (or only echoes it with -DryRun). Check $LASTEXITCODE after.
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  & $exe @a
}
# Same, but returns the output lines (dry-run returns nothing).
function RunOut([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return @() }
  & $exe @a 2>&1 | ForEach-Object { "$_" }
}

Step 1 'migration list (state of the linked project)'
$list = RunOut 'npx' @('-y', $Sb, 'migration', 'list', '--linked')
if ($LASTEXITCODE -ne 0) { throw 'step 1 failed' }
$list | ForEach-Object { Write-Host "  $_" }
if (-not $DryRun) {
  # Rows look like "   0007 | 0007 | ..." (local | remote). 0009 must be local-only; 0001-0007 must be on both sides.
  $r9 = @($list | Where-Object { $_ -match '^\s*0009\s*\|' })
  if ($r9.Count -ne 1) { throw "step 1 failed: $Mig not listed locally" }
  if ($r9[0] -match '^\s*0009\s*\|\s*0009') { throw "step 1 failed: $Mig is already applied; skip steps 2-3 by hand" }
  foreach ($v in '0001','0002','0003','0004','0005','0006','0007') {
    $m = @($list | Where-Object { $_ -match "^\s*$v\s*\|" })
    if ($m.Count -ne 1 -or $m[0] -notmatch "^\s*$v\s*\|\s*$v") { throw "step 1 failed: $v is not applied on the project; stop and ask" }
  }
  # 0008 (records) is not on this branch. If the project already has it, push would refuse (remote version missing locally).
  if (@($list | Where-Object { $_ -match '^\s*\|\s*0008' }).Count -gt 0) { throw 'step 1 failed: the project has 0008 but this branch does not. Merge the records branch first, then re-run.' }
}

Step 2 "apply ONLY $Mig (dry run must list exactly that one)"
$dry = RunOut 'npx' @('-y', $Sb, 'db', 'push', '--dry-run', '--linked')
if ($LASTEXITCODE -ne 0) { throw 'step 2 failed' }
$dry | ForEach-Object { Write-Host "  $_" }
if (-not $DryRun) {
  $names = @($dry | Where-Object { $_ -match '\d{4}_\S+\.sql' })
  if ($names.Count -ne 1 -or $names[0] -notmatch $Mig) { throw "step 2 failed: push would apply something other than $Mig" }
}
Run 'npx' @('-y', $Sb, 'db', 'push', '--linked')
if ($LASTEXITCODE -ne 0) { throw 'step 2 failed' }

Step 3 'verify admin_requests and request_pin_reset exist'
$sql = "select (to_regclass('public.admin_requests') is not null) as table_ok, (to_regprocedure('public.request_pin_reset(text)') is not null) as fn_ok;"
$v = RunOut 'npx' @('-y', $Sb, 'db', 'query', '--linked', $sql)
if ($LASTEXITCODE -ne 0) { throw 'step 3 failed' }
$v | ForEach-Object { Write-Host "  $_" }
if (-not $DryRun -and (($v -join ' ') -notmatch 'true[^f]*true')) { throw 'step 3 failed: table or function missing' }

Step 4 'deploy functions family-names and admin-members'
Run 'npx' @('-y', $Sb, 'functions', 'deploy', 'family-names', '--no-verify-jwt', '--use-api', '--project-ref', $Ref)
if ($LASTEXITCODE -ne 0) { throw 'step 4 failed (family-names)' }
Run 'npx' @('-y', $Sb, 'functions', 'deploy', 'admin-members', '--use-api', '--project-ref', $Ref)
if ($LASTEXITCODE -ne 0) { throw 'step 4 failed (admin-members)' }

Step 5 'smoke: family-names with Origin https://bantay.pages.dev (count only)'
if ($DryRun) { Write-Host "  [dry-run] GET https://$Ref.supabase.co/functions/v1/family-names  Origin: https://bantay.pages.dev" -ForegroundColor DarkGray }
else {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "https://$Ref.supabase.co/functions/v1/family-names" -Headers @{ Origin = 'https://bantay.pages.dev' } -TimeoutSec 60
    if ($r.StatusCode -ne 200) { throw "HTTP $($r.StatusCode)" }
    if ($r.Content.TrimStart()[0] -ne '[') { throw 'not a JSON array' }
    $j = @($r.Content | ConvertFrom-Json)
    Write-Host "  200 OK, $($j.Count) names"
  } catch { throw "step 5 failed: $($_.Exception.Message)" }
}

Step 6 'MANUAL'
Write-Host '  MANUAL: Supabase Dashboard > Authentication > URL Configuration > Redirect URLs > add  ph.bantay.family://auth-callback  (then Save). Continuing.' -ForegroundColor Yellow

Step 7 "push $Branch to main (fast-forward only; Cloudflare Pages deploys main)"
Run 'git' @('fetch', 'origin')
if ($LASTEXITCODE -ne 0) { throw 'step 7 failed (fetch)' }
Run 'git' @('merge-base', '--is-ancestor', 'origin/main', 'HEAD')
if ($LASTEXITCODE -ne 0) { throw 'step 7 failed: origin/main is not an ancestor of HEAD (not a fast-forward)' }
if (-not $DryRun -and (git status --porcelain --untracked-files=no)) { throw 'step 7 failed: uncommitted changes' }
Run 'git' @('push', 'origin', "${Branch}:main")
if ($LASTEXITCODE -ne 0) { throw 'step 7 failed (push)' }

Step 8 'debug APK for the phone test'
Run 'npm' @('run', 'build')
if ($LASTEXITCODE -ne 0) { throw 'step 8 failed (build)' }
Run 'npx' @('cap', 'sync', 'android')
if ($LASTEXITCODE -ne 0) { throw 'step 8 failed (cap sync)' }
if ($DryRun) { Write-Host '  [dry-run] android\gradlew.bat assembleDebug (in android\)' -ForegroundColor DarkGray }
else { Push-Location android; try { & .\gradlew.bat assembleDebug } finally { Pop-Location }; if ($LASTEXITCODE -ne 0) { throw 'step 8 failed (gradle)' } }
$stamp = Get-Date -Format 'yyyyMMdd'
$dest = "D:\Claude\Bantay-APK\Bantay-debug-$stamp-p1p2.apk"
if ($DryRun) { Write-Host "  [dry-run] copy android\app\build\outputs\apk\debug\app-debug.apk -> $dest" -ForegroundColor DarkGray }
else { New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null; Copy-Item android\app\build\outputs\apk\debug\app-debug.apk $dest -Force; Write-Host "  $dest" }

Step 9 'next steps'
Write-Host "  1. Install $dest on the phone and try sign-in, Forgot PIN, Me > SOS, the update row."
Write-Host '  2. One-time keystore step, then:  .\scripts\release-apk.ps1 -Version 2.0.0 -Notes "First v2"   (see docs\RELEASE.md; this script does not run it)'
Write-Host 'Done.' -ForegroundColor Green
