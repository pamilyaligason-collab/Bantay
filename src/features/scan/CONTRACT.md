# Scan a paper: what the app sends (contract for lane L6)

The phone code is `src/features/docs/api.ts` (`addScan`, `sendOne`, `flushQueue`). Everything below is what it relies on.

## Storage
- Bucket `records` (private). One object per page: `<person_id>/<document_id>/p<NN>.jpg`, NN = 01, 02, ... (two digits, page order).
  JPEG, long edge at most 2000 px, quality about 0.82, under 15 MB. The first path segment is the person (same object policy as cards).
- A PDF (`<person_id>/<document_id>/doc.pdf`) is allowed by the bucket but the app does not send one today (the native scanner is asked for JPEG pages only).
- Upload is `upsert: false`; an "already exists" answer is treated as success.

## Tables (written by the signed-in user, RLS as today)
1. `documents` upsert `onConflict: client_id`, `ignoreDuplicates: true`, once per document (with the first page):
   `{ id = client_id = <document_id>, client_id, person_id, kind, card_type, title, status, doc_date? }`
   - kind `lab` | `prescription` | `other`: `status: 'draft'`, `card_type: null`, `title: null`, `doc_date` only when the person chose a date (YYYY-MM-DD).
   - ID or insurance chosen in the scan form: unchanged card path: `kind: 'id_card'`, `card_type: 'other'`, `status: 'confirmed'`. These are not read: no `page_no`-based extract call is made for them (the `page_no` column is still sent).
2. `source_files` upsert `onConflict: client_id`, `ignoreDuplicates: true`, one row per page:
   `{ client_id, person_id, storage_path, side, document_id, name: 'page-NN.jpg', mime: 'image/jpeg', size_bytes, sha256, drive_file_id: null, page_no }`
   - `page_no` is 1-based. **This column does not exist yet: L6 must add `source_files.page_no int`.** Until it does, the upsert fails (PostgREST PGRST204) and the card is marked failed after 5 tries.
   - `side` is `null` for lab/prescription/other. `ingest_status` is not sent (default `'new'`).
   - Rows are written after their object is uploaded; pages go in order 1..N. The documents row carries page_count = N so the server sweep waits for every page.
3. Phone uploads of IDs also leave `ingest_status = 'new'` forever. The Papers "Reading N" count therefore only looks at documents that are
   `status = 'draft'` AND `kind in ('lab','prescription','other')` AND a file with `ingest_status = 'new'` and `storage_path is not null`
   (`listReading` in `src/features/records/api.ts`, an embedded select `source_files ... documents!inner(status, kind)`). L6 should move the files off `'new'`
   (`extracted` / `queued` / `done` / `failed`) when the function has read the document, and the app stops showing "Reading".
   A draft document with no child rows and files still `'new'` is shown as Reading, not counted in To check.

## Function call
After the LAST page of a document is uploaded and its `source_files` row is written (no queue rows for that document left), once:

```ts
supabase.functions.invoke('records-extract', { body: { document_id } })
```
`document_id` = `documents.id`. The reply is ignored and errors are swallowed; the call is not retried (L6 also has a sweep). It is not made for cards (IDs/insurance).
The function should be idempotent per document (the app can call again after a retry from a crash between the last page and the call: it does not, but the sweep may).

## Statuses seen by the app
- Phone: queue rows (Uploading), then nothing local once sent.
- Server: `documents.status = 'draft'` with files `'new'` = Reading; once draft child rows exist (`lab_results`, `prescription_items`, ...) = To check (existing flow).
