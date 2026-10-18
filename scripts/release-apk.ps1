# Release the Android app: build the signed APK, write latest.json, create the GitHub release.
#   .\scripts\release-apk.ps1 -Version 2.0.1 -Notes "Faster sign-in." [-MinShell 2000000] [-DryRun]
# -DryRun builds and prints latest.json, writes scripts/fixtures/latest.sample.json, and skips the commit and gh release.
# A real run also writes public/latest.json (what /get reads) and commits it as "release: latest.json <version>"; push it yourself.
# Needs android/keystore.properties for a signed APK (see docs/RELEASE.md). Windows PowerShell 5.1.
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
  [Parameter(Mandatory = $true)][string]$Notes,
  [int]$MinShell = 2000000,
  [switch]$DryRun,
  [string]$ApkPath  # test hook: use this file instead of building (needs -DryRun; checks only the latest.json part)
)
$ErrorActionPreference = 'Stop'
$repo = 'pamilyaligason-collab/Bantay'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$p = $Version.Split('.') | ForEach-Object { [int]$_ }
if ($p[1] -ge 1000 -or $p[2] -ge 1000) { throw 'minor and patch must be below 1000 (versionCode would collide)' }
$versionCode = $p[0] * 1000000 + $p[1] * 1000 + $p[2]
$out = Join-Path $root 'release-out'

if ($ApkPath -and -not $DryRun) { throw '-ApkPath is only for -DryRun' }
if (-not $ApkPath) {
Write-Host "[1/8] npm ci"
npm ci
if ($LASTEXITCODE -ne 0) { throw "step 1 failed" }
Write-Host "[2/8] tsc"
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "step 2 failed" }
Write-Host "[3/8] tests"
npm test
if ($LASTEXITCODE -ne 0) { throw "step 3 failed" }
Write-Host "[4/8] build web + cap sync"
npm run build
if ($LASTEXITCODE -ne 0) { throw "step 4 failed" }
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "step 4 (cap sync) failed" }
Write-Host "[5/8] assembleRelease $Version ($versionCode)"
Push-Location (Join-Path $root 'android')
try {
  .\gradlew.bat testDebugUnitTest --rerun-tasks "-PversionCode=$versionCode" "-PversionName=$Version"
  if ($LASTEXITCODE -ne 0) { throw "step 5 (unit tests) failed" }
  .\gradlew.bat assembleRelease "-PversionCode=$versionCode" "-PversionName=$Version"
  if ($LASTEXITCODE -ne 0) { throw "step 5 failed" }
} finally { Pop-Location }

}
Write-Host "[6/8] copy APK"
$dir = Join-Path $root 'android\app\build\outputs\apk\release'
$apk = if ($ApkPath) { $ApkPath } else { Join-Path $dir 'app-release.apk' }
if (-not (Test-Path $apk)) { throw "step 6 failed: no signed app-release.apk (is android/keystore.properties set?)" }
New-Item -ItemType Directory -Force $out | Out-Null
$versioned = Join-Path $out "bantay-$Version.apk"
$stable = Join-Path $out 'bantay.apk'
Copy-Item $apk $versioned -Force
Copy-Item $apk $stable -Force

Write-Host "[7/8] latest.json"
$sha = (Get-FileHash -Algorithm SHA256 $versioned).Hash.ToLower()
$latest = [ordered]@{
  versionCode = $versionCode
  versionName = $Version
  url         = "https://github.com/$repo/releases/download/v$Version/bantay-$Version.apk"
  sha256      = $sha
  size        = (Get-Item $versioned).Length
  minShell    = $MinShell
  notes       = $Notes
}
$json = $latest | ConvertTo-Json
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $out 'latest.json'), $json, $utf8)
Write-Host $json

if ($DryRun) {
  New-Item -ItemType Directory -Force (Join-Path $root 'scripts\fixtures') | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $root 'scripts\fixtures\latest.sample.json'), $json, $utf8)
  Write-Host "[8/8] DryRun: wrote scripts/fixtures/latest.sample.json, skipped latest.json commit and gh release create"
  return
}

Write-Host "[8/8] public/latest.json + commit, gh release create v$Version"
# Same-origin copy for /get (GitHub release assets send no CORS headers). The orchestrator pushes; Pages serves it.
[System.IO.File]::WriteAllText((Join-Path $root 'public\latest.json'), $json, $utf8)
git add public/latest.json
if ($LASTEXITCODE -ne 0) { throw "step 8 (git add) failed" }
git commit -m "release: latest.json $Version"
if ($LASTEXITCODE -ne 0) { throw "step 8 (git commit) failed" }
gh release create "v$Version" $versioned $stable (Join-Path $out 'latest.json') --repo $repo --title "Bantay $Version" --notes $Notes
if ($LASTEXITCODE -ne 0) { throw "step 8 failed" }
Write-Host "Released v$Version. /get and the in-app check pick it up."
