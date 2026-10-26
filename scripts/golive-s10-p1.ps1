# Family Bantay - session 10 Phase 1 'apply' (wave 2 + fix round). Lloyd runs it from this worktree BEFORE merging the PR:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-s10-p1.ps1
# Order (PLAN 2.4): preflight -> 0025 -> 0026 -> 0027 -> 0029 (each recorded) -> verify -> deploy records-extract, ask. Stops at the first failure.
# The wave 1 outbox sends the 0026 columns, so this must run before the merge. Ask stays on n8n until VITE_ASSISTANT_PROVIDER=edge is set.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)  # CLI tables are UTF-8; PS 5.1 shows them as mojibake otherwise
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-s10-p1.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.121.0'
function Step($n, $t) { Write-Host "`n== step ${n}: $t" -ForegroundColor Cyan }
# PS 5.1 + Stop turns CLI progress on stderr into errors: run natives with a local Continue, judge by exit code.
function Run([string]$exe, [string[]]$a) {
  if ($DryRun) { Write-Host "  [dry-run] $exe $($a -join ' ')" -ForegroundColor DarkGray; $global:LASTEXITCODE = 0; return }
  $ErrorActionPreference = 'Continue'; & $exe @a 2>&1 | ForEach-Object { "  $_" }
}
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Q($sql) { Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', $sql) }
function Apply($n, $ver, $name) {
  Run 'npx' @('-y', $Sb, 'db', 'query', '--linked', '-f', "supabase\migrations\${ver}_$name.sql"); Check $n
  Q "insert into supabase_migrations.schema_migrations (version, name) values ('$ver','$name') on conflict do nothing;"; Check $n
}

Step 1 'checks: Supabase link, clean tree'
if (-not (Test-Path 'supabase\.temp\project-ref')) {
  $main = (git rev-parse --path-format=absolute --git-common-dir) -replace '[\\/]\.git$', ''
  if (-not (Test-Path "$main\supabase\.temp\project-ref")) { throw 'step 1 failed: no supabase\.temp link here or in the main checkout' }
  Copy-Item "$main\supabase\.temp" 'supabase\.temp' -Recurse
}
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }

Step 2 'preflight (expect has_0021=1, has_0023=1, has_0024=1, action_check=1, done_0025_0029=0)'
Q "select (select count(*) from supabase_migrations.schema_migrations where version='0021') as has_0021, (select count(*) from supabase_migrations.schema_migrations where version='0023') as has_0023, (select count(*) from supabase_migrations.schema_migrations where version='0024') as has_0024, (select count(*) from pg_constraint where conname='audit_log_action_check') as action_check, (select count(*) from supabase_migrations.schema_migrations where version in ('0025','0026','0027','0029')) as done_0025_0029;"; Check 2

Step 3 'apply 0025_knowledge'; Apply 3 '0025' 'knowledge'
Step 4 'apply 0026_nutrition_v2 (the app sends these columns)'; Apply 4 '0026' 'nutrition_v2'
Step 5 'apply 0027_family_messages (one transaction)'; Apply 5 '0027' 'family_messages'
Step 6 'apply 0029_admin_view_as (0028 is unused on purpose)'; Apply 6 '0029' 'admin_view_as'

Step 7 'verify (expect recorded=4, food_cols=10, goal_cols=2, msg_bucket_private=1, view_action=1, knowledge=1)'
Q "select (select count(*) from supabase_migrations.schema_migrations where version in ('0025','0026','0027','0029')) as recorded, (select count(*) from information_schema.columns where table_schema='public' and table_name='food_entries' and column_name in ('carbs_g','fat_g','sat_fat_g','fiber_g','sugars_g','calcium_mg','iron_mg','magnesium_mg','vitd_ug','b12_ug')) as food_cols, (select count(*) from information_schema.columns where table_schema='public' and table_name='nutrition_goals' and column_name in ('potassium_mg','sex')) as goal_cols, (select count(*) from storage.buckets where id='family-messages' and not public) as msg_bucket_private, (select count(*) from pg_constraint where conname='audit_log_action_check' and pg_get_constraintdef(oid) like '%view%') as view_action, (select count(*) from pg_proc where proname='search_knowledge') as knowledge;"; Check 7

Step 8 'deploy edge functions records-extract and ask'
Run 'npx' @('-y', $Sb, 'functions', 'deploy', 'records-extract', '--no-verify-jwt'); Check 8
Run 'npx' @('-y', $Sb, 'functions', 'deploy', 'ask', '--no-verify-jwt'); Check 8

Write-Host "`nApplied. Next: merge the PR on GitHub (Cloudflare Pages deploys main), check bantay.pages.dev shows the new bundle, then run" -ForegroundColor Green
Write-Host "  node scripts\jack-gate-live.mjs <ask function url> <your access token>" -ForegroundColor Green
Write-Host "and only when it exits 0 set VITE_ASSISTANT_PROVIDER=edge in Cloudflare Pages and redeploy. Rollback: PLAN.md 2.5." -ForegroundColor Green
