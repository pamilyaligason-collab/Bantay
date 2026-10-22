# records-extract

Reads a phone scan of a health paper (lab result, prescription, other) and puts what it read in the confirm queue as
drafts, the same rows the laptop import writes (`scripts/import/load.mjs`). ConfirmSheet and the existing triggers do the
rest on confirm: a confirmed lab value becomes a reading (`lab_result_to_reading`, 0008), a confirmed prescription becomes
medicines (`rx_to_medications`, 0014). **Nothing from a phone scan is confirmed by the server**, whatever the confidence.

Needs migration `0020_scan_extract.sql` (independent of 0019, the records dedupe from the PC session: either order works; its pre-check query must return 0 rows). Rehearsal: `supabase/tests/scan_extract_rehearsal.sql`.

## Contract with the app (lane L5)

1. **Upload** every page to the private bucket `records`:
   - pictures: `<person_id>/<document_id>/p01.jpg`, `p02.jpg`, ... (two digits, page order), or
   - one PDF from the native scanner: `<person_id>/<document_id>/doc.pdf`.
   The first path segment is the person (the 0008 storage policies check it); `records_object_editor` ignores the rest.
2. **documents**: one row, `id = client_id = <document_id>`, `person_id`, `status: 'draft'`, `kind`: `'lab' | 'prescription' | 'other'`,
   `page_count`: number of pages the phone will send (1 for a PDF). Optional `title`. Do not send `confidence` or any value.
   The app's kind is kept; for `'other'` the function stores the kind the model read (lab, imaging, vaccination, ...).
   ID and insurance cards keep today's flow (`kind 'id_card' | 'insurance_card'`, `status 'confirmed'`): never read.
3. **source_files**: one row per page, `document_id`, `person_id`, `storage_path`, `page_no` (1..N, unique per document),
   `name`, `mime`, `size_bytes`, `sha256`, `side: null`, `ingest_status` left at its default `'new'`.
4. **Then** `supabase.functions.invoke('records-extract', { body: { document_id } })` once the last page is up.
   Answers (JSON, `ok` plus):

   | HTTP | body | meaning |
   |---|---|---|
   | 202 | `{status:'reading', pages}` | claimed, being read in the background |
   | 200 | `{status:'waiting'}` | not all `page_count` pages are in yet, already read, or another run has it. The sweep will pick it up |
   | 401 | `{error:'unauthorized'}` | no valid member session |
   | 404 | `{error:'not_found'}` | the caller cannot see this document (not an editor of the person, or it does not exist) |
   | 409 | `{error:'not_a_scan'}` | a card, or a document that is no longer a draft |
   | 400 / 500 | `bad_input` / `not_configured` / `server_error` | |

   A failed or lost invoke is fine: the cron sweep reads any scan whose newest page is 2 minutes old.
5. **Progress**: follow `source_files.ingest_status` of the document's pages:
   `new` (waiting) -> `reading` -> `queued` (drafts are in the queue: the existing "To check" row and ConfirmFlow) or
   `failed` with `ingest_error` (short code below). **Retry** = set the pages' `ingest_status` back to `'new'` (members may, RLS
   unchanged) and invoke again. Until it is `queued` the document already counts as a draft in `records_queue`: show
   "Reading" for it rather than an empty confirm sheet.

Limits: at most 10 pages, 10 MB per page or PDF, 20 MB per document. Images: any `image/*` the bucket takes (jpeg, png, webp,
heic; jpeg is safest for the model). `ingest_error` codes: `bad_path` (a page outside the person's own folder), `too_many_pages`, `too_large`, `unsupported_mime`, `no_pages`,
`download`, `openrouter_<status>` (402 = no credit, 401 = bad key), `not_json`, `write`, `read`, `not_a_scan`,
`too_many_tries` (three runs died mid-read), `failed`.

RLS: unchanged. An editor of the person (self, writer carer, admin) can already insert a draft document, its source_files and
the storage objects (0008). The function checks the caller with the caller's own token (a read-only carer cannot see drafts,
so gets 404), then works with the service role. 0020 adds `source_files.page_no`, `ingest_error`, `ingest_tries`,
status `reading`, `documents.page_count`, and two service-role-only functions: `records_scan_claim` and `records_scan_due`.

## What it sends where

Same as the laptop import: OpenRouter, paid model only (a `:free` model is refused), `provider: {zdr: true,
data_collection: 'deny'}`, the same prompt and JSON shape (`logic.ts`; `records-extract.test.ts` fails if it drifts from
`scripts/import/lib.mjs`, `extract.mjs`, `normalize.mjs` or `load.mjs`). All pages go in one request, in page order. PDFs
go as a file (no local text layer: scanner PDFs are pictures). Logs hold document ids and counts only (B-7).

## Secrets

| Name | Value |
|---|---|
| `OPENROUTER_API_KEY` | the same paid key as the laptop import |
| `OPENROUTER_MODEL` | optional, default `google/gemini-3.5-flash-lite` (as `scripts/records-import.ps1`) |
| `OPENROUTER_FALLBACK_MODEL` | optional, default `anthropic/claude-haiku-5.5` |
| `RECORDS_EXTRACT_CRON_SECRET` | 32+ random characters, also stored in Vault as `records_extract_cron_secret` |
| `ALLOWED_ORIGIN` | already set for admin-members / broadcast (the app origin) |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` come from the platform.

## Deploy (Lloyd)

```sh
supabase db push                       # or run supabase/migrations/0020_scan_extract.sql in the SQL editor
supabase secrets set OPENROUTER_API_KEY=... RECORDS_EXTRACT_CRON_SECRET=...
supabase functions deploy records-extract --no-verify-jwt
```

Then in the SQL editor: `select vault.create_secret('<same secret>', 'records_extract_cron_secret');` and run
`ops/sql/records_extract_cron.sql` (pg_cron + pg_net, every 10 minutes, like dose-watch).

Undo: `select cron.unschedule('records-extract');`, `supabase functions delete records-extract`, `0020_scan_extract.down.sql`.

## Tests

`npx vitest run supabase/functions/records-extract` (pure logic in `logic.ts`, fake port, no network).

## Device reading mode (Scan & Capture)

The app can send one photo of a BP monitor, glucose meter, scale, thermometer or oximeter: body `{mode:"reading", mime:"image/jpeg|png|webp", image_base64}` (a request over 2 KB is routed here), the member JWT in Authorization. Nothing is stored. Reply `{ok:true, reading:{kind,systolic,diastolic,pulse,value,unit,confidence}}`; any number that is unreadable, out of range, in an unknown unit or read with confidence under 0.5 is null. Same OpenRouter settings as a paper plus `max_tokens: 200` and reasoning off. The log line holds no kind and no values. No new secret, no deploy step beyond redeploying the function.
