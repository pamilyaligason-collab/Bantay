# Session 12 (D-86): put the Firebase files where the build and the push sender read them. Lloyd runs it once.
# Before running, download both files in your own browser (signed in as rocloyd87@gmail.com):
#   1. https://console.firebase.google.com/project/family-bantay-1dd0a/settings/general  > Your apps > Bantay APK > google-services.json
#   2. https://console.firebase.google.com/project/family-bantay-1dd0a/settings/serviceaccounts/adminsdk  > Generate new private key
# Both land in Downloads. The key never enters the repo, chat or vault; this script moves it to D:\Claude\Bantay-keys.
#   powershell -ExecutionPolicy Bypass -File scripts\set-s12-firebase-secrets.ps1
$ErrorActionPreference = 'Stop'
$repo = 'pamilyaligason-collab/Bantay'
$ref = 'wuakimpssycbtnmoexuc'
$dl = Join-Path $env:USERPROFILE 'Downloads'
$keys = 'D:\Claude\Bantay-keys'

Write-Host '[1/5] find the two files in Downloads'
$gs = Get-ChildItem $dl -Filter 'google-services*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sa = Get-ChildItem $dl -Filter 'family-bantay-1dd0a-firebase-adminsdk-*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $gs) { throw 'step 1 failed: google-services.json not in Downloads' }
if (-not $sa) { throw 'step 1 failed: the service account key (family-bantay-1dd0a-firebase-adminsdk-*.json) not in Downloads' }
if ((Get-Content $gs.FullName -Raw) -notmatch '"package_name":\s*"ph\.bantay\.family"') { throw 'step 1 failed: google-services.json is not for ph.bantay.family' }
if ((Get-Content $sa.FullName -Raw) -notmatch '"project_id":\s*"family-bantay-1dd0a"') { throw 'step 1 failed: the key is not for family-bantay-1dd0a' }

Write-Host '[2/5] copy google-services.json into android/app (git-ignored)'
foreach ($root in @('D:\Claude\Bantay', (Split-Path -Parent $PSScriptRoot))) {
  $dest = Join-Path $root 'android\app\google-services.json'
  if (Test-Path (Split-Path $dest)) { Copy-Item $gs.FullName $dest -Force; Write-Host "  $dest" }
}

Write-Host '[3/5] GitHub secret GOOGLE_SERVICES_JSON_BASE64 (the APK workflow writes the file from it)'
[Convert]::ToBase64String([IO.File]::ReadAllBytes($gs.FullName)) | gh secret set GOOGLE_SERVICES_JSON_BASE64 --repo $repo
if ($LASTEXITCODE -ne 0) { throw 'step 3 failed' }

Write-Host '[4/5] Supabase secret FIREBASE_SERVICE_ACCOUNT_B64 (dose-watch and broadcast send FCM with it)'
$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($sa.FullName))
npx -y supabase@2.122.0 secrets set "FIREBASE_SERVICE_ACCOUNT_B64=$b64" --project-ref $ref
if ($LASTEXITCODE -ne 0) { throw 'step 4 failed' }
Remove-Variable b64

Write-Host '[5/5] move the key out of Downloads to the offline keys folder'
New-Item -ItemType Directory -Force $keys | Out-Null
Move-Item $sa.FullName (Join-Path $keys $sa.Name) -Force
Write-Host "Done. Key kept at $keys\$($sa.Name); back it up offline. Nothing was deployed."
