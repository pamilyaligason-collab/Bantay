# Family Bantay - one-time Android SDK setup for the APK build (docs/NATIVE.md). Windows PowerShell 5.1.
# Lloyd reads and accepts Google's Android SDK licences (type y), then the SDK parts install. Stops at the first failure.
$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot'
$env:ANDROID_HOME = 'D:\Android\Sdk'   # outside AppData: the Claude desktop app's writes under AppData are redirected
$sdk = Join-Path $env:ANDROID_HOME 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdk)) { throw "sdkmanager not found at $sdk" }
Write-Host '== Step 1. Read and accept the Android SDK licences (type y at each)' -ForegroundColor Cyan
& $sdk --licenses; if ($LASTEXITCODE -ne 0) { throw 'step 1 licences failed' }
Write-Host '== Step 2. Install platform-tools, Android 36 platform, build-tools 35' -ForegroundColor Cyan
& $sdk 'platform-tools' 'platforms;android-36' 'build-tools;35.0.0'; if ($LASTEXITCODE -ne 0) { throw 'step 2 install failed' }
Write-Host '== Done. Tell Claude: sdk ready' -ForegroundColor Green
