# Family Bantay - apply migration 0008 (records database, D-53, D-63). Lloyd runs this once. Windows PowerShell 5.1.
# Run from the repo folder on main after the records branch is merged:
#   powershell -ExecutionPolicy Bypass -File scripts\records-apply.ps1
# Stops at the first failure. Prints table counts only, never values.
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\records-apply.ps1' }
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.121.0'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }

Step 1 'Checks: on main, clean, same as GitHub, 0008 present'
git fetch -q origin; Check 1
if ((git rev-parse --abbrev-ref HEAD) -ne 'main') { throw 'step 1 failed: not on main' }
if (git status --porcelain) { throw 'step 1 failed: working tree not clean' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { throw 'step 1 failed: run git pull first' }
if (-not (Test-Path supabase\migrations\0008_records.sql)) { throw 'step 1 failed: 0008 missing' }

Step 2 'Supabase CLI: link the project (asks for the database password if not linked)'
npx -y $Sb link --project-ref $Ref; Check 2

Step 3 'Apply migration 0008 (dry run first)'
$dry = npx -y $Sb db push --dry-run 2>&1 | Out-String; Check 3
Write-Host $dry
$listed = [regex]::Matches($dry, '\d{4}_[a-z_]+\.sql') | ForEach-Object { $_.Value } | Sort-Object -Unique
if (($listed -join ',') -ne '0008_records.sql') { throw "step 3 failed: dry run must list only 0008_records.sql (saw: $($listed -join ', '))" }
npx -y $Sb db push; Check 3

Step 4 'Check: tables, bucket and policies exist (counts only)'
$q = "select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('source_files','documents','lab_results','prescriptions','prescription_items','medications','test_catalog')) as tables_7, (select count(*) from public.test_catalog) as catalog_19, (select count(*) from storage.buckets where id='records' and not public) as private_bucket_1, (select count(*) from pg_policies where tablename='objects' and policyname like 'records_objects_%') as storage_policies_4;"
npx -y $Sb db query --linked $q; Check 4

Write-Host "`nDone. Expect tables_7=7, catalog_19=19, private_bucket_1=1, storage_policies_4=4." -ForegroundColor Green
