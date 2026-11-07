# Family Bantay - D-146 write-back: copy each person's confirmed health papers (and a lab summary CSV) from the app back into their
# Drive folder, in a "From Bantay\<year>\" subfolder (docs/IMPORT.md, "D-146 write-back"). The owner runs it.
# Run from the repo worktree:  powershell -ExecutionPolicy Bypass -File scripts\records-writeback.ps1 [-DryRun | -Write] [-Person <people.id>] [-Limit N] [-Undo]
# Needs: the Drive folder present (Google Drive for desktop), a logged-in Supabase CLI. import\writeback-map.json is built from the database on the first run.
# -DryRun (the default): queries and plans, prints counts, downloads and writes nothing. -Write: downloads, verifies sha256, copies; never overwrites (a taken name gets -2).
# -Undo: removes the listed files that are unchanged (sha256) and inside a From Bantay folder; edited ones are kept. List: import\writeback-manifest.json (counts only unless -Write is also given).
# Health papers only (no id_card, insurance_card), confirmed documents only. File names never hold a person name. Prints counts only.
param([switch]$DryRun, [switch]$Write, [string]$Person, [int]$Limit, [switch]$Undo, [string]$LocalRoot = 'G:\My Drive\2.2 Family Files')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\records-writeback.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.122.0'
$Ref = 'wuakimpssycbtnmoexuc'
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
function SaveJson($path, $lines) { [IO.File]::WriteAllText((Join-Path (Get-Location) $path), (($lines | Out-String).Trim()), [Text.UTF8Encoding]::new($false)) }  # no BOM: node's JSON.parse refuses one
$Db = @('-y', $Sb, 'db', 'query', '--linked', '--project-ref', $Ref)
$Kinds = "('id_card','insurance_card')"

Step 1 'Checks'
if ($DryRun -and $Write) { throw 'step 1 failed: use -DryRun or -Write, not both' }
if ($Person -and $Person -notmatch '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') { throw 'step 1 failed: -Person is a people.id (uuid)' }
if (-not (Test-Path $LocalRoot)) { throw "step 1 failed: $LocalRoot not found (Google Drive for desktop)" }
if (-not (Test-Path node_modules)) { npm ci --no-audit --no-fund; Check 1 }
New-Item -ItemType Directory -Force .scratch, import | Out-Null
$mode = if ($Write) { @('--write') } else { @() }
$modeName = if ($Write) { 'WRITE' } else { 'dry run' }
Write-Host "Mode: $modeName"

if ($Undo) {
  Step 2 'Undo: remove exactly the manifest entries'
  node scripts/import/writeback.mjs undo @mode; Check 2
  return
}

try {
Step 2 'Person-folder map (import\writeback-map.json, git-ignored; built from the database on the first run)'
if (-not (Test-Path import\writeback-map.json)) {
  $out = npx @Db --output-format json "select id, display_name from public.people order by display_name;"; Check 2
  SaveJson '.scratch\writeback-people.json' $out
  node scripts/import/writeback.mjs map --from .scratch/writeback-people.json --root $LocalRoot; Check 2
  Remove-Item .scratch\writeback-people.json
} else { Write-Host 'map file present' }

Step 3 'Query confirmed papers (one row per stored file) and confirmed lab results'
$out = npx @Db --output-format json "select sf.id as sf_id, sf.storage_path, sf.sha256, d.id as doc_id, d.person_id, d.kind, d.doc_date, d.created_at from public.source_files sf join public.documents d on d.id = sf.document_id where d.status = 'confirmed' and sf.storage_path is not null and sf.sha256 is not null and d.kind not in $Kinds order by d.id, sf.page_no nulls last, sf.created_at, sf.id;"; Check 3
SaveJson '.scratch\writeback-rows.json' $out
$out = npx @Db --output-format json "select lr.document_id as doc_id, d.person_id, d.kind, d.doc_date, d.created_at, lr.name_raw, lr.value_num, lr.value_text, lr.unit_raw, lr.ref_text, lr.flag, lr.ref_low, lr.ref_high, lr.collected_at from public.lab_results lr join public.documents d on d.id = lr.document_id where d.status = 'confirmed' and lr.status = 'confirmed' and d.kind not in $Kinds and exists (select 1 from public.source_files sf where sf.document_id = d.id and sf.storage_path is not null) order by lr.document_id, lr.collected_at nulls last, lr.name_raw, lr.id;"; Check 3
SaveJson '.scratch\writeback-labs.json' $out

Step 4 'Plan (write | skip | conflict | unmapped | bad_dest); touches nothing'
$planArgs = @('--rows', '.scratch/writeback-rows.json', '--labs', '.scratch/writeback-labs.json', '--root', $LocalRoot)
if ($Person) { $planArgs += @('--person', $Person) }
if ($Limit -gt 0) { $planArgs += @('--limit', $Limit) }
node scripts/import/writeback.mjs plan @planArgs; Check 4

if ($Write) {
  Step 5 'Download the planned papers from the private records bucket (lab CSVs are built locally)'
  $plan = Get-Content .scratch\writeback-plan.json -Raw | ConvertFrom-Json
  New-Item -ItemType Directory -Force .scratch\wb | Out-Null
  $n = 0
  foreach ($p in @($plan | Where-Object { $_.type -eq 'file' -and ($_.action -eq 'write' -or $_.action -eq 'conflict') })) {
    $local = '.scratch/wb/' + ($p.key -replace '[:/*?"<>|]', '_')   # relative path: a C:/ source or target fails in storage cp
    npx -y $Sb storage cp "ss:///records/$($p.storage_path)" $local --experimental --linked --project-ref $Ref | Out-Null; Check 5
    $n++
  }
  Write-Host "downloaded $n"
}

Step 6 'Apply: verify sha256 against source_files.sha256, copy (never overwrite), record in import\writeback-manifest.json'
node scripts/import/writeback.mjs apply @mode; Check 6

} finally {
  Remove-Item .scratch\wb -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item .scratch\writeback-people.json, .scratch\writeback-rows.json,.scratch\writeback-labs.json, .scratch\writeback-plan.json -ErrorAction SilentlyContinue
}
Write-Host "`nDone ($modeName). Undo with -Undo (add -Write to really remove)." -ForegroundColor Green
