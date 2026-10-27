# Family Bantay - session 12 Phase 3 batch 1 'apply' (D-80..D-88). Lloyd runs it from this worktree BEFORE merging the PR:
#   powershell -ExecutionPolicy Bypass -File scripts\golive-s12.ps1          (add -DryRun to print the steps only)
# Never paste these lines into a shell: pasted, a failed step does not stop the next one. Run the file; it refuses any other branch.
# Order (release review): checks -> tag pre-s12 -> 0037..0042 (each recorded) -> verify -> deploy 5 functions -> archive the shared admin person row -> post-checks.
# Then merge the PR right away (old web bundles' direct carers writes get 42501 after 0037). Stops at the first failure.
param([switch]$DryRun)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)  # CLI tables are UTF-8; PS 5.1 shows them as mojibake otherwise
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\golive-s12.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.122.0'
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
function Deploy($n, $fn, [switch]$Jwt) {
  $a = @('-y', $Sb, 'functions', 'deploy', $fn); if (-not $Jwt) { $a += '--no-verify-jwt' }
  Run 'npx' $a; Check $n
}

Step 1 'checks: release branch, migration files, Supabase link, clean tree, google-services.json present'
$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne 'claude/family-bantay-phase2-audit-9375db') { throw "step 1 failed: on branch '$branch', not the release branch claude/family-bantay-phase2-audit-9375db" }
$noFile = @('0037_sharing', '0038_join_claim', '0039_marked_by_digest', '0040_push_tokens', '0041_rollcall', '0042_kudos') | Where-Object { -not (Test-Path "supabase\migrations\$_.sql") }
if ($noFile) { throw "step 1 failed: missing migration files: $($noFile -join ', ')" }
if (-not (Test-Path 'supabase\.temp\project-ref')) {
  $main = (git rev-parse --path-format=absolute --git-common-dir) -replace '[\\/]\.git$', ''
  if (-not (Test-Path "$main\supabase\.temp\project-ref")) { throw 'step 1 failed: no supabase\.temp link here or in the main checkout' }
  # copy the contents: copying the folder onto an existing supabase\.temp nests it as .temp\.temp
  New-Item -ItemType Directory -Force 'supabase\.temp' | Out-Null
  Copy-Item "$main\supabase\.temp\*" 'supabase\.temp' -Recurse -Force
}
if (git status --porcelain --untracked-files=no) { throw 'step 1 failed: uncommitted changes' }
if (-not (Test-Path 'android\app\google-services.json')) { throw 'step 1 failed: run scripts\set-s12-firebase-secrets.ps1 first' }

Step 2 'function secrets present (names only, values are never printed)'
if (-not $DryRun) {
  $ErrorActionPreference = 'Continue'; $names = (& npx -y $Sb secrets list 2>&1) -join "`n"; $ErrorActionPreference = 'Stop'
  if ($LASTEXITCODE -ne 0) { throw 'step 2 failed: supabase secrets list' }
  $missing = @('DOSE_WATCH_CRON_SECRET', 'FIREBASE_SERVICE_ACCOUNT_B64', 'ALERTS_CRON_SECRET') | Where-Object { $names -notmatch "\b$_\b" }
  if ($missing) { throw "step 2 failed: missing secrets: $($missing -join ', ') (FIREBASE_SERVICE_ACCOUNT_B64: scripts\set-s12-firebase-secrets.ps1)" }
}

Step 3 'preflight (expect has_0036=1, done_0037_0042=0)'
Q "select (select count(*) from supabase_migrations.schema_migrations where version='0036') as has_0036, (select count(*) from supabase_migrations.schema_migrations where version between '0037' and '0042') as done_0037_0042;"; Check 3

Step 4 'tag the live main as pre-s12 (rollback point for functions and web)'
Run 'git' @('fetch', 'origin', 'main'); Check 4
Run 'git' @('tag', '-f', 'pre-s12', 'origin/main'); Check 4
Run 'git' @('push', '-f', 'origin', 'refs/tags/pre-s12'); Check 4

Step 5 'apply 0037_sharing (pending offers, share RPCs, carer_alerts kinds share/rollcall/kudos)'; Apply 5 '0037' 'sharing'
Step 6 'apply 0038_join_claim (per-member invite links)'; Apply 6 '0038' 'join_claim'
Step 7 'apply 0039_marked_by_digest (who marked a dose, 8 PM summary switch)'; Apply 7 '0039' 'marked_by_digest'
Step 8 'apply 0040_push_tokens (FCM tokens, final dose_watch_prune)'; Apply 8 '0040' 'push_tokens'

Step 9 'apply 0041_rollcall (storm roll call)'; Apply 9 '0041' 'rollcall'
Step 10 'apply 0042_kudos (kudos and recap messages)'; Apply 10 '0042' 'kudos'

Step 11 'verify (expect recorded=6, rollcall=1, rollcall_set=1, about_person=1, share_offers=1, invite_tokens=1, carer_prefs=1, push_tokens=1, marked_by=1)'
Q "select (select count(*) from supabase_migrations.schema_migrations where version between '0037' and '0042') as recorded, (select count(*) from pg_tables where schemaname='public' and tablename='rollcall') as rollcall, (select count(*) from pg_proc where proname='rollcall_set') as rollcall_set, (select count(*) from information_schema.columns where table_schema='public' and table_name='family_messages' and column_name='about_person') as about_person, (select count(*) from pg_tables where schemaname='public' and tablename='share_offers') as share_offers, (select count(*) from pg_tables where schemaname='public' and tablename='invite_tokens') as invite_tokens, (select count(*) from pg_tables where schemaname='public' and tablename='carer_prefs') as carer_prefs, (select count(*) from pg_tables where schemaname='public' and tablename='push_tokens') as push_tokens, (select count(*) from information_schema.columns where table_schema='public' and table_name='meds_taken' and column_name='marked_by') as marked_by;"; Check 11

Step 12 'deploy edge functions (dose-watch first: FCM + digest opt-out; alerts-ingest: D-88 radius and quake wording)'
Deploy 12 'dose-watch'; Deploy 12 'broadcast' -Jwt; Deploy 12 'pin-login'; Deploy 12 'family-names'; Deploy 12 'alerts-ingest'

Step 13 'archive the shared admin person row "pamilya ligason" from family lists (D-86; the login keeps working)'
Q "update public.people set archived_at = now() where id = '9f5159e8-1136-4980-9949-61ecaeefe92f' and archived_at is null; select display_name, archived_at is not null as archived from public.people where id = '9f5159e8-1136-4980-9949-61ecaeefe92f';"; Check 13

Step 14 'post-checks (expect alerts-ingest and dose-watch rows within 15 min; carer_alerts kinds now allow share/rollcall/kudos)'
Q "select job, ok, ran_at from public.job_runs order by ran_at desc limit 5; select pg_get_constraintdef(oid) from pg_constraint where conname like 'carer_alerts_kind%';"; Check 14

Write-Host "`nApplied. Next, in order:" -ForegroundColor Green
Write-Host "  1. Merge the PR on GitHub now (Cloudflare Pages deploys main); check bantay.pages.dev shows five tabs and 'Who can see my records'." -ForegroundColor Green
Write-Host "  2. /admin > Members > 'Invite link' for each person still without a PIN; send each their own link. Then:" -ForegroundColor Green
Write-Host "     npx -y $Sb secrets unset FAMILY_INVITE_TOKEN   (the old family-wide link already stopped working when family-names was redeployed)" -ForegroundColor Green
Write-Host "  3. GitHub > Actions > Release Android app > version 2.4.0, notes 'Family alerts now reach your phone; new Discover tab.'" -ForegroundColor Green
Write-Host "  4. Install 2.4.0 on your phone and one carer's; run the live checks in docs/session-12/PLAN.md 6.4 (swiped from recents, after reboot)." -ForegroundColor Green
Write-Host "Rollback: downs 0042 -> 0037 (supabase\migrations\*.down.sql), functions from tag pre-s12, Pages rollback in Cloudflare." -ForegroundColor Green
