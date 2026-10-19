# Family Bantay - go-live for waves 1+2 (members + data, Today). Lloyd runs it from this worktree:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-w1.ps1
# Order matters (Fable review): 0010 -> 0011 -> admin-members -> push web. Stops at the first failure.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-w1.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.121.0'
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
# PS 5.1 + Stop turns CLI progress on stderr into errors: run natives with a local Continue, judge by exit code.
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  $ErrorActionPreference = 'Continue'; & $exe @a 2>&1 | ForEach-Object { "  $_" }
}
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }

Step 1 'checks: linked project, clean tree, 0010 not yet applied'
if (-not (Test-Path 'supabase\.temp\project-ref')) { throw 'step 1 failed: supabase\.temp link missing in this worktree' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select count(*) as has_0010 from information_schema.columns where table_schema='public' and table_name='people' and column_name='photo_path';"); Check 1

Step 2 'apply 0010_people_profile (idempotent) and record it'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', 'supabase\migrations\0010_people_profile.sql'); Check 2
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "insert into supabase_migrations.schema_migrations (version, name) values ('0010','people_profile') on conflict do nothing;"); Check 2

Step 3 'apply 0011_family_profiles_photo and record it'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', 'supabase\migrations\0011_family_profiles_photo.sql'); Check 3
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "insert into supabase_migrations.schema_migrations (version, name) values ('0011','family_profiles_photo') on conflict do nothing;"); Check 3

Step 4 'verify (expect cols8=8, avatars_private=1, recorded=2, fp_photo=true)'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select (select count(*) from information_schema.columns where table_schema='public' and table_name='people' and column_name in ('photo_path','phone','birthdate','blood_type','allergies','conditions','medicines','updated_at')) as cols8, (select count(*) from storage.buckets where id='avatars' and not public) as avatars_private, (select count(*) from supabase_migrations.schema_migrations where version in ('0010','0011')) as recorded, (pg_get_function_result('public.family_profiles()'::regprocedure) like '%photo_path%') as fp_photo;"); Check 4

Step 5 'deploy admin-members (needs 0010 first)'
Run 'npx' @('-y', $Sb, 'functions', 'deploy', 'admin-members', '--no-verify-jwt'); Check 5

Step 6 'push to main (fast-forward only; Cloudflare Pages deploys it)'
Run 'git' @('fetch', 'origin'); Check 6
Run 'git' @('merge-base', '--is-ancestor', 'origin/main', 'HEAD'); if ($LASTEXITCODE -ne 0) { throw 'step 6 failed: not a fast-forward' }
$id = if (Test-Path 'import\drive-root.txt') { (Get-Content 'import\drive-root.txt' -Raw).Trim() } else { '' }
if ($id -and (git log -p origin/main..HEAD | Select-String -SimpleMatch $id)) { throw 'step 6 failed: private Drive folder id in commits' }
Run 'git' @('push', 'origin', 'HEAD:main'); Check 6

Write-Host "`nDone. Pages redeploys in about 2 minutes. Then install Bantay-debug-20261019-v3.apk from G:\My Drive\- Bantay." -ForegroundColor Green
