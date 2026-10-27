# Family Bantay - import the whole family folder (Medical, IDs, Insurance, Visa + Home Lot) into the records tables (docs/IMPORT.md, D-68). Lloyd runs it.
# Run from the repo worktree:  powershell -ExecutionPolicy Bypass -File scripts\records-import.ps1 [-DryRun]
# Needs: import\aliases.json (git-ignored, names only; shape in scripts\import\aliases.example.json), OPENROUTER_API_KEY in the environment
#        (paid, ZDR; ID and insurance papers go through it too), migration 0013 applied.
# -DryRun: sync (list + classify only), then stop. Nothing is downloaded, sent or written to the database.
# Prints counts only. High-confidence rows matched to the right person load as confirmed (confirmed_source 'auto'); the rest wait as drafts.
param([switch]$DryRun, [string]$LocalRoot = 'G:\My Drive\2.2 Family Files')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)  # PS 5.1 shows CLI box tables as mojibake otherwise
if (-not $PSScriptRoot) { throw 'run as: powershell -ExecutionPolicy Bypass -File scripts\records-import.ps1' }
Set-Location (Split-Path $PSScriptRoot -Parent)
$Sb = 'supabase@2.122.0'
$Ref = 'wuakimpssycbtnmoexuc'
function Step($n, $t) { Write-Host "`n== Step $n. $t" -ForegroundColor Cyan }
function Check($n) { if ($LASTEXITCODE -ne 0) { throw "step $n failed (exit $LASTEXITCODE)" } }
$Db = @('-y', $Sb, 'db', 'query', '--linked', '--project-ref', $Ref)

Step 1 'Checks'
if (-not (Test-Path import\aliases.json)) { throw 'step 1 failed: import\aliases.json missing (copy scripts\import\aliases.example.json and fill in the family names)' }
if (-not (Test-Path $LocalRoot)) { throw "step 1 failed: $LocalRoot not found (Google Drive for desktop)" }
if ($env:OPENROUTER_API_KEY) { $env:OPENROUTER_API_KEY = $env:OPENROUTER_API_KEY.Trim() }  # a pasted key often carries a space or line break
if (-not $DryRun -and -not $env:OPENROUTER_API_KEY) { throw 'step 1 failed: OPENROUTER_API_KEY is not set' }
if (-not (Test-Path node_modules)) { npm ci --no-audit --no-fund; Check 1 }
if (-not $DryRun) {
  $have = npx @Db --output-format json "select count(*) as ok from information_schema.columns where table_schema='public' and table_name='person_identifiers';" | Out-String
  if ($LASTEXITCODE -ne 0) { throw 'step 1 failed: cannot reach the database' }
  if ($have -notmatch '"ok"\s*:\s*"?[1-9]') { throw 'step 1 failed: migration 0013 is not applied yet' }
}

$env:LOCAL_ROOT = $LocalRoot
$env:LOCAL_PATH_IDS = '1'   # family files have no Drive id from a copy log: a hash of the relative path is the stable id
if ($DryRun) {
  Step 2 'Dry run: list and classify only (counts per lane, skip reason, person index)'
  node scripts/import/sync.mjs --dry-run; Check 2
  Write-Host "`nDry run done. Nothing downloaded, sent or written." -ForegroundColor Green
  return
}

Step 2 'Add missing family members as dependents, then build import\people-map.json from the database'
node scripts/import/family.mjs dependents; Check 2
npx @Db -f .scratch/add-dependents.sql | Out-Null; Check 2
$peopleJson = Join-Path (Get-Location) '.scratch\people.json'
$out = npx @Db --output-format json "select id, display_name from public.people order by display_name;"; Check 2
[IO.File]::WriteAllText($peopleJson, ($out -join "`n"), [Text.UTF8Encoding]::new($false))   # no BOM: node's JSON.parse refuses one
node scripts/import/family.mjs people-map --from $peopleJson; Check 2
Remove-Item $peopleJson

$env:OPENROUTER_MODEL = 'google/gemini-3.5-flash-lite'
$env:OPENROUTER_FALLBACK_MODEL = 'anthropic/claude-haiku-5.5'
try {
  Step 3 'Known files: ids already in the database (same content keeps its id, so nothing is loaded twice)'
  $out = npx @Db --output-format json "select drive_file_id, sha256 from public.source_files where sha256 is not null;"; Check 3
  [IO.File]::WriteAllText((Join-Path (Get-Location) '.scratch\known.json'), ($out -join "`n"), [Text.UTF8Encoding]::new($false))

  Step 3 'Sync: list, classify, download, hash, dedupe (incremental; visa / land files are listed, never downloaded)'
  node scripts/import/sync.mjs; Check 3

  Step 4 'Extract (PDF text first, else vision; OpenRouter zdr, no data collection). Health and identity prompts by folder; visa / land never sent'
  node scripts/import/extract.mjs --i-am-lloyd; Check 4
} finally {
  Remove-Item Env:LOCAL_ROOT, Env:LOCAL_PATH_IDS -ErrorAction SilentlyContinue
}

Step 5 'Dry-run the load: counts per person / lane / status, SQL to .scratch (git-ignored). Stop here with Ctrl+C if the counts look wrong'
node scripts/import/load.mjs --dry-run; Check 5

Step 6 'Build import\load.sql (auto-confirm >= 0.9 with a trusted person match, rest drafts, idempotent)'
node scripts/import/load.mjs; Check 6

Step 7 'Apply load.sql to Supabase (one transaction)'
npx @Db -f import/load.sql | Out-Null; Check 7

Step 8 'Counts (no values)'
npx @Db "select 'lab_results' as t, status, coalesce(confirmed_source,'-') as src, count(*) from public.lab_results group by 2,3 union all select 'documents', status, coalesce(confirmed_source,'-'), count(*) from public.documents group by 2,3 order by 1,2,3;"; Check 8
npx @Db "select ingest_status, count(*) from public.source_files group by ingest_status order by 1;"; Check 8

Write-Host "`nDone. Auto-confirmed rows are already in Health trends; open Family > Records > To check for the drafts." -ForegroundColor Green
