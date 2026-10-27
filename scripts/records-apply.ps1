# Family Bantay - apply migration 0008 (records database, D-53, D-63). Lloyd runs this once. Windows PowerShell 5.1.
# Run from a clean checkout that holds the reviewed 0008 (records branch or main):
#   powershell -ExecutionPolicy Bypass -File scripts\records-apply.ps1
# No database password needed: it uses the Supabase CLI sign-in on this PC (Management API).
# 0008 and its schema_migrations row go in ONE transaction, so a failure changes nothing. Prints counts only.
$ErrorActionPreference = 'Stop'
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\records-apply.ps1' }
$Ref = 'wuakimpssycbtnmoexuc'
$Sb = 'supabase@2.122.0'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function Q($sql) { npx -y $Sb db query --linked --project-ref $Ref $sql }

Step 1 'Checks: clean checkout with the reviewed 0008, applied migrations end at 0007'
if (git status --porcelain) { throw 'step 1 failed: working tree not clean' }
if (-not (Test-Path supabase\migrations\0008_records.sql)) { throw 'step 1 failed: 0008 missing' }
$last = (Q "select max(version) as last from supabase_migrations.schema_migrations;" | Out-String); Check 1
# the CLI prints a table in a terminal and JSON elsewhere: look for 0007 as a whole number, and refuse if 0008 is already there
if ($last -notmatch '(^|[^0-9])0007([^0-9]|$)' -or $last -match '(^|[^0-9])0008([^0-9]|$)') { throw "step 1 failed: expected the last applied migration to be 0007. Output: $last" }

Step 2 'Apply 0008 and record it, in one transaction'
$tmp = Join-Path $env:TEMP ('bantay-0008-' + [guid]::NewGuid() + '.sql')
try {
  $body = Get-Content supabase\migrations\0008_records.sql -Raw
  $sql = "begin;`n$body`ninsert into supabase_migrations.schema_migrations (version, name) values ('0008', 'records');`ncommit;`n"
  [IO.File]::WriteAllText($tmp, $sql, (New-Object Text.UTF8Encoding $false))  # no BOM: Postgres must see "begin" first
  npx -y $Sb db query --linked --project-ref $Ref -f $tmp | Out-Null; Check 2
} finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }

Step 3 'Check: tables, catalog, private bucket, storage policies, migration row (counts only)'
Q "select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('source_files','documents','lab_results','prescriptions','prescription_items','medications','test_catalog')) as tables_7, (select count(*) from public.test_catalog) as catalog_19, (select count(*) from storage.buckets where id='records' and not public) as private_bucket_1, (select count(*) from pg_policies where tablename='objects' and policyname like 'records_objects_%') as storage_policies_4, (select max(version) from supabase_migrations.schema_migrations) as last_0008;"; Check 3

Write-Host "`nDone. Expect tables_7=7, catalog_19=19, private_bucket_1=1, storage_policies_4=4, last_0008=0008." -ForegroundColor Green
