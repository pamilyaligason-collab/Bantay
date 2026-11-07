# Records import runbook

Everything real lives under the git-ignored `import/` folder. Scripts print counts only. Steps 1-6 below are the original draft-only flow; since D-68 the loader auto-confirms high-confidence rows (last section) and `--drafts-only` restores the draft-only behaviour.

## Env vars (names only)

| Name | What |
|---|---|
| `DRIVE_ACCESS_TOKEN` | OAuth Playground token, scope `https://www.googleapis.com/auth/drive.readonly` (expires in about an hour) |
| `DRIVE_ROOT_ID` | Drive id of the medical folder (records-import.ps1 reads it from git-ignored `import/drive-root.txt`; never commit it). Its sub-folders are the person folders |
| `OPENROUTER_API_KEY` | paid account |
| `OPENROUTER_MODEL` | paid vision model (`:free` is refused) |
| `OPENROUTER_FALLBACK_MODEL` | paid fallback |

Requests always carry `provider: {zdr: true, data_collection: 'deny'}`.

## Steps

1. `node scripts/import/sync.mjs` walks Drive, writes `import/manifest.json`, downloads to `import/files/<drive_file_id>`. Re-running only downloads new or changed files. Identical files get `duplicate_of` (oldest kept). IDs, passports, visas, land/home lot, funds, birth/baptismal, authorization, HMO and insurance folders are never listed or downloaded, only counted. 0-byte, `.ini`, `.picasaoriginals` and non-Doc Google types are skipped. Google Docs are exported as PDF.
2. `node scripts/import/extract.mjs --i-am-owner [--limit N] [--delay MS]` writes `import/drafts/<drive_file_id>.json` for each file without a draft. PDFs with a real text layer send the text only (pdf.js, local); scans and images go as vision. 429/5xx are retried with backoff; a failing file is counted and the batch goes on. Re-run to retry failures.
3. Create `import/people-map.json` mapping person folder or printed name (lower-case) to `people.id`:
   `{"<person folder>": "<uuid>", "<name as printed>": "<uuid>"}`.
   Unknown names, or a folder and printed name that disagree, give `person_id` null: the file sits in the unassigned admin queue and gets no health rows. Re-run step 4 after adding map entries.
4. `node scripts/import/load.mjs` writes `import/load.sql` and `import/load-summary.json` (counts by person-folder index `p1..`, kind and status; no names). Ids are uuid v5 from the drive file id, so re-running is safe (`on conflict (id) do nothing`; `source_files` updates modified time and status, and fills person/document once known; `done` never goes backwards).
5. Apply (verified with `npx -y supabase@2.122.0 db query --help`):
   `npx -y supabase@2.122.0 db query --linked -f import/load.sql`
   (`--file`/`-f` is the SQL file flag; `--linked` targets the linked project; `--local` and `--db-url` also exist.) The file is one `begin; ... commit;`, so a failure changes nothing.
6. Open the confirm queue in the app and confirm or reject each row.

## Changing the people map later (`remap_needed`)

`load.mjs` remembers the person it wrote per file in `import/load-state.json`. If a later map would give a file a different person, the loader keeps the old person on `source_files`, writes no document or health rows for that file, and counts it as `remap_needed` in `load-summary.json` (0008 refuses a document whose person differs from its source file). An admin fixes `source_files.person_id` first (and removes the old draft rows), then delete that file's entry in `load-state.json` and re-run step 4. A duplicate that sits in another person's folder than its keeper is loaded unassigned for the same reason. Corrupt draft files are only counted (`corrupt_drafts`); the parser message is never printed.

Zone-less timestamps in drafts are read as Manila time (+08:00). The extract run summary also reports `text_layer_errors` (PDFs whose text layer could not be read and went as vision).

## Not done by the loader

- `encounters` and `insurance_policies` are not created (no source for them in the extraction).
- `generic_name`, `brand` and appointments from `follow_up` are left for the confirm step.
- Lab values with no safe unit conversion keep `value_canonical` null and do not trend.

## D-68: the whole family folder, auto-confirm, full profiles

Run `scripts\records-import.ps1` (add `-DryRun` first: it only lists and classifies). Apply migration `0013_records_autoconfirm.sql` before the real run.

- **Folders get a lane** (`scripts/import/folders.mjs`), not a skip: `health` (Medical + labs, the default), `identity` (IDs and Documents, birth and civil papers), `insurance` (Insurance, HMO, PhilHealth), `document_only` (Visa, Home Lot, land, tax, funds, authorization). Priority document_only > insurance > identity > health; folder names decide before the file name. `document_only` files are registered as source files for the person (`ingest_status skipped`, reason `document_only`), never downloaded, read or sent anywhere. Still skipped: `.picasaoriginals`, `*.ini`, zero-byte, non-Doc Google types.
- **Names** live in git-ignored `import/aliases.json` (`scripts/import/aliases.example.json` shows the shape): `name`, `aliases`, `dependent: true` for family without a login. A spelling variant (two folder spellings of one person) is just another alias. No Drive ids anywhere; files without a Drive id (`LOCAL_PATH_IDS=1`) get `local:<hash of the relative path>`.
- `node scripts/import/family.mjs dependents` writes `.scratch/add-dependents.sql` (people without a login, created by the first active admin, who becomes their writer carer; aliases also go to `people.aliases` and `person_aliases`). `family.mjs people-map --from <json>` builds `import/people-map.json` from the database people, so every alias resolves to a `people.id`.
- **Person match** (`family.mjs`): folder name(s) and the name printed on the paper. `both` agree = trusted; folder only and the paper prints no name = trusted for health papers only; unrecognised printed name, no folder match, a conflict or an ambiguous name = never auto-confirmed (conflict gives no person).
- **Auto-confirm** (`load.mjs`, default): a row loads `confirmed` with `confirmed_source = 'auto'` when the document confidence is >= 0.9 (the floor enforced by `records_auto_threshold()` in 0013) and the match is trusted. Handwriting (vision) prescriptions and lines marked unclear are never auto-confirmed (D-47). Everything else is a `draft`. `--drafts-only` restores the old all-draft load. Re-running never changes an existing row (`on conflict do nothing`), so a person's rejection or edit stands.
- **Profiles**: confirmed identity papers fill empty `people` columns only (birthdate, sex, blood type, address) after a conflict check (equal-confidence disagreement = left empty); `aliases`, `allergies`, `conditions` (printed on a confirmed paper) and `medicines` (the same drug on 2+ confirmed text prescriptions) are unioned in. ID and insurance numbers go to `person_identifiers` (editors only: the person, a writer carer, an admin; never read-only carers) and never to `insurance_policies.member_no`, summaries or logs.
- **Dry run**: `node scripts/import/sync.mjs --dry-run` (counts per lane, skip reason, person index) and `node scripts/import/load.mjs --dry-run` (counts per person index x lane x file status and rows per table x status; SQL in `.scratch/records-load-dryrun.sql`, git-ignored). Neither touches the database.
- Identity and insurance papers are sent to OpenRouter (paid, zero data retention, no data collection), the same route as the lab papers.

From migration 0014 (session 6), every prescription item that is not rejected becomes a scheduled medicine at once
(trigger `prescription_items_convert`, function `rx_to_medications`); see `docs/session-6/PART-3.md` section 1.

## D-146 write-back

The other direction: confirmed health papers go from the app back into each person's Drive folder. Run `scripts\records-writeback.ps1` on the PC that has Google Drive for desktop. It is a dry run unless you add `-Write`.

- **What is written.** Per person, in `<person folder>\From Bantay\<year>\`: every stored page of a confirmed document (`documents.status = 'confirmed'`, `source_files.storage_path` not null), named `<doc_date or created day>_<kind>_<first 8 of document id>_p01.<ext>` (`p02` for the next page), plus one lab summary per confirmed lab document, `..._labs.csv` (columns `name_raw,value_num,value_text,unit_raw,ref_text,flag,ref_low,ref_high,collected_at`, confirmed results only). Health papers only: `id_card` and `insurance_card` are never written. A file name never holds a person name. The created-day fallback is the Manila day.
- **Never overwrites, never deletes.** A name already taken (or used twice in one run) gets a `-2`, `-3` suffix and counts as `conflict`. The only delete is `-Undo`, which removes the files listed in `import/writeback-manifest.json` that are unchanged (same sha256) and inside a `From Bantay` folder; edited ones are kept. Undo also forgets entries for files already deleted, so a later write puts them back. A file the owner later moves or deletes is not written again (the manifest entry with the same sha256 gives `skip`).
- **Safety checks.** The downloaded copy's sha256 must equal `source_files.sha256` before it is copied (`sha_mismatch` otherwise). A destination that would leave the mapped person folder is refused (`bad_dest`). A person with no mapped folder is `unmapped`. The copy itself fails rather than replace a file.
- **Map and manifest** (both in git-ignored `import/`). `writeback-map.json` is `{"<people.id>": "<person folder>"}`; the first run builds it by matching each person's display name to a folder under `-LocalRoot` (case-insensitive, whole name). People without a matching folder are `unmapped`; edit the file by hand to fix one. Shape: `docs/writeback-map.example.json` (invented names). `writeback-manifest.json` is `{"<source_files.id>": {dest, sha256, written_at}}`; lab CSVs use the key `labs:<document id>`.
- **Switches.** `-DryRun` (default): queries the database read-only, plans, prints counts, downloads and writes nothing. `-Write`: downloads (`npx supabase storage cp ss:///records/<path> <local> --experimental --linked`, relative local path) and copies. `-Person <people.id>`, `-Limit N` (writes per run), `-Undo` (counts only; add `-Write` to remove).
- **Console and files.** Counts only; errors print an error code, never a name, path or value. The query results, plan and downloads sit in `.scratch/` (git-ignored) and are deleted at the end of the run.
- **Formula cells.** A text cell of the lab CSV (`name_raw`, `value_text`, `unit_raw`, `ref_text`) that starts with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a spreadsheet shows it as text, not a formula.
- **Policy and certificate kinds.** Insurance policy and certificate documents are written back like other papers; only `id_card` and `insurance_card` are excluded.
