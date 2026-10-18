# Records import runbook

Everything real lives under the git-ignored `import/` folder. Scripts print counts only. Nothing is ever loaded as confirmed: every row lands as `draft` and waits in the confirm queue.

## Env vars (names only)

| Name | What |
|---|---|
| `DRIVE_ACCESS_TOKEN` | OAuth Playground token, scope `https://www.googleapis.com/auth/drive.readonly` (expires in about an hour) |
| `DRIVE_ROOT_ID` | Drive id of the medical folder. Its sub-folders are the person folders |
| `OPENROUTER_API_KEY` | paid account |
| `OPENROUTER_MODEL` | paid vision model (`:free` is refused) |
| `OPENROUTER_FALLBACK_MODEL` | paid fallback |

Requests always carry `provider: {zdr: true, data_collection: 'deny'}`.

## Steps

1. `node scripts/import/sync.mjs` walks Drive, writes `import/manifest.json`, downloads to `import/files/<drive_file_id>`. Re-running only downloads new or changed files. Identical files get `duplicate_of` (oldest kept). IDs, passports, visas, land/home lot, funds, birth/baptismal, authorization, HMO and insurance folders are never listed or downloaded, only counted. 0-byte, `.ini`, `.picasaoriginals` and non-Doc Google types are skipped. Google Docs are exported as PDF.
2. `node scripts/import/extract.mjs --i-am-lloyd [--limit N] [--delay MS]` writes `import/drafts/<drive_file_id>.json` for each file without a draft. PDFs with a real text layer send the text only (pdf.js, local); scans and images go as vision. 429/5xx are retried with backoff; a failing file is counted and the batch goes on. Re-run to retry failures.
3. Create `import/people-map.json` mapping person folder or printed name (lower-case) to `people.id`:
   `{"<person folder>": "<uuid>", "<name as printed>": "<uuid>"}`.
   Unknown names, or a folder and printed name that disagree, give `person_id` null: the file sits in the unassigned admin queue and gets no health rows. Re-run step 4 after adding map entries.
4. `node scripts/import/load.mjs` writes `import/load.sql` and `import/load-summary.json` (counts by person-folder index `p1..`, kind and status; no names). Ids are uuid v5 from the drive file id, so re-running is safe (`on conflict (id) do nothing`; `source_files` updates modified time and status, and fills person/document once known; `done` never goes backwards).
5. Apply (verified with `npx -y supabase@2.121.0 db query --help`):
   `npx -y supabase@2.121.0 db query --linked -f import/load.sql`
   (`--file`/`-f` is the SQL file flag; `--linked` targets the linked project; `--local` and `--db-url` also exist.) The file is one `begin; ... commit;`, so a failure changes nothing.
6. Open the confirm queue in the app and confirm or reject each row.

## Not done by the loader

- `encounters` and `insurance_policies` are not created (no source for them in the extraction).
- `generic_name`, `brand` and appointments from `follow_up` are left for the confirm step.
- Lab values with no safe unit conversion keep `value_canonical` null and do not trend.
