# Family Bantay - go-live for session 5 (weather timing, header inset, Safety hub, rescue map, storm card, Plan,
# body explorer, records 0013). Lloyd runs it from this worktree, dry run first:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-s5.ps1 -DryRun
#   powershell -ExecutionPolicy Bypass -File scripts\golive-s5.ps1
# Order: 0013 before the web push (the records import reads person_identifiers / people.aliases). Stops at the first failure.
# Records import (records-import.ps1) is a separate run after this, -DryRun first.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-s5.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.121.0'
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  $ErrorActionPreference = 'Continue'; & $exe @a 2>&1 | ForEach-Object { "  $_" }
}
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }

Step 1 'checks: linked project, clean tree, 0012 recorded'
if (-not (Test-Path 'supabase\.temp\project-ref')) { throw 'step 1 failed: supabase\.temp link missing in this worktree' }
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select string_agg(version, ',' order by version) as recorded from supabase_migrations.schema_migrations where version in ('0012','0013');"); Check 1
if (-not $DryRun -and -not ((& { $ErrorActionPreference = 'Continue'; npx -y $Sb db query --linked "select count(*) as n0012 from supabase_migrations.schema_migrations where version='0012';" 2>&1 } | Out-String) -match 'n0012\W+1')) { throw 'step 1 failed: 0012 is not recorded on the live database' }

Step 2 'apply 0013_records_autoconfirm (idempotent) and record it'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', 'supabase\migrations\0013_records_autoconfirm.sql'); Check 2
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "insert into supabase_migrations.schema_migrations (version, name) values ('0013','records_autoconfirm') on conflict do nothing;"); Check 2

Step 3 'verify (expect ident_table=1, ident_rls=true, recorded=1)'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "select count(*) as ident_table, bool_and(rowsecurity) as ident_rls, (select count(*) from supabase_migrations.schema_migrations where version='0013') as recorded from pg_tables where schemaname='public' and tablename='person_identifiers';"); Check 3

Step 4 'clean old PHIVOLCS bid rows from news_items'
Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', "delete from public.news_items where title ~ '\(\d{9,}-' or (url ~* 'phivolcs' and title ~* '(invitation to bid|bid bulletin|notice of award|supply and delivery|procurement)');"); Check 4

Step 5 'push to main (fast-forward only; Cloudflare Pages deploys it)'
Run 'git' @('fetch', 'origin'); Check 5
Run 'git' @('merge-base', '--is-ancestor', 'origin/main', 'HEAD'); if ($LASTEXITCODE -ne 0) { throw 'step 5 failed: not a fast-forward' }
$id = if (Test-Path 'import\drive-root.txt') { (Get-Content 'import\drive-root.txt' -Raw).Trim() } else { '' }
if ($id -and (git log -p origin/main..HEAD | Select-String -SimpleMatch $id)) { throw 'step 5 failed: private Drive folder id in commits' }
Run 'git' @('push', 'origin', 'HEAD:main'); Check 5

Write-Host "`nDone. Pages redeploys in about 2 minutes. Swipe Family Bantay away and reopen it. Then run: powershell -ExecutionPolicy Bypass -File scripts\records-import.ps1 -DryRun" -ForegroundColor Green
