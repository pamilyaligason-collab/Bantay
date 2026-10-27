# Family Bantay - go-live for waves 3-6 (Safety, Health, Family Plan, Ask, inbox). Lloyd runs it from this worktree:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-w36.ps1
# Order matters: 0012 before the web push (family_* sync rows would dead-letter otherwise). Stops at the first failure.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)  # CLI tables are UTF-8; PS 5.1 shows them as mojibake otherwise
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-w36.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.122.0'
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
# PS 5.1 + Stop turns CLI progress on stderr into errors: run natives with a local Continue, judge by exit code.
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  $ErrorActionPreference = 'Continue'; & $exe @a 2>&1 | ForEach-Object { "  $_" }
}
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }

Step 1 'checks: linked project, clean tree, family tables before'
if (-not (Test-Path 'supabase\.temp\project-ref')) { throw 'step 1 failed: supabase\.temp link missing in this worktree' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select count(*) as family_tables from pg_tables where schemaname='public' and tablename in ('family_tasks','family_events','family_notes');"); Check 1

Step 2 'apply 0012_family_plan (idempotent) and record it'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', 'supabase\migrations\0012_family_plan.sql'); Check 2
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "insert into supabase_migrations.schema_migrations (version, name) values ('0012','family_plan') on conflict do nothing;"); Check 2

Step 3 'verify (expect tables=3, rls_on=3, recorded=1)'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select count(*) as tables, count(*) filter (where rowsecurity) as rls_on, (select count(*) from supabase_migrations.schema_migrations where version='0012') as recorded from pg_tables where schemaname='public' and tablename in ('family_tasks','family_events','family_notes');"); Check 3

Step 4 'push to main (fast-forward only; Cloudflare Pages deploys it)'
Run 'git' @('fetch', 'origin'); Check 4
Run 'git' @('merge-base', '--is-ancestor', 'origin/main', 'HEAD'); if ($LASTEXITCODE -ne 0) { throw 'step 4 failed: not a fast-forward' }
$id = if (Test-Path 'import\drive-root.txt') { (Get-Content 'import\drive-root.txt' -Raw).Trim() } else { '' }
if ($id -and (git log -p origin/main..HEAD | Select-String -SimpleMatch $id)) { throw 'step 4 failed: private Drive folder id in commits' }
Run 'git' @('push', 'origin', 'HEAD:main'); Check 4

Write-Host "`nDone. Pages redeploys in about 2 minutes. Swipe Family Bantay away and reopen it twice; from this version on it reloads itself after updates." -ForegroundColor Green
