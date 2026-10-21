# Admin dashboard plan (2026-10-21)

Status: **APPROVED 2026-10-21** (Lloyd: carers read-only, history field names only, IDs masked + logged Show, all F1-F8 in one wave). 0021 applied live 2026-10-21 by Lloyd (recorded in schema_migrations; 12 audit triggers), admin-members redeployed (E1). Web merge to main waits for Lloyd's "merge".
Counts only; no names or health values in this file (public repo).

## 1. Where it lives
Inside the existing React app at `#admin/*`, the same sign-in, RLS and bantay.pages.dev deploy (the APK picks it up on deploy).
- `#admin` already exists (routes.ts `VIEWS`, App.tsx guard: non-admins fall back to Today). The server re-checks `is_admin()` on every admin write.
- A separate app would need its own auth, CORS origin (`ALLOWED_ORIGIN` is one value), Pages project and session handling. That buys nothing here.
- The app is a 520 px column today (`app.css .bt`). Only `#admin/*` gets a wide layout. Every other screen is unchanged.

## 2. What already works (reuse, do not rebuild)
- Admin is inside `records_editor()` (0008). Under RLS, admin can already read and write every person's records, `source_files` and `person_identifiers`, and read `records_dedupe_log`. **Most dashboard features need no server change.**
- `admin-members` Edge Function: list, create, update profile, set_pin, unlock, set_role, disable, invite/uninvite.
- Records client: `setStatus` (bulk confirm/reject by id list, unclear Rx lines excluded), `updateRow` (EDITABLE columns), `settleDocument`, `signedUrl` (60 s).
- Existing phone Admin page (members, PIN requests, usage, safety data, broadcast, import counts, system) stays as the Overview.

## 3. Functions (wave 1)
| # | Page | What Lloyd can do | Data path |
|---|---|---|---|
| F1 | Members | Table: name, handle, role, sign-in (PIN / Google / no phone), locked until + wrong tries, disabled, last sign-in, last seen, events 30 d. Actions: add member, add dependent, reset PIN, unlock, role, disable, invite. | `admin-members list` (+ `lockedUntil`, `fails`: small Edge change), `admin_usage_summary` |
| F2 | Person profile | Edit birthdate, sex, blood type, address, phone, aliases, allergies, conditions, photo. Carers panel: who cares for this person, writer or read-only, add/remove. | `people` update (column grants exist for all these), `carers` |
| F3 | Records | Per person, tabs: Papers, Labs, Medicines, Prescriptions, Imaging, Vaccinations, Allergies/Conditions, Visits. Status filter (draft / confirmed / rejected), date range, text search. Row: view the source page, edit (EDITABLE columns), confirm, reject. No hard delete. | direct selects under RLS, `updateRow`, `setStatus`, `signedUrl` |
| F4 | Confirm queue | All people at once (86 draft lab rows today). Group by paper, checkbox per row, "confirm all checked", "reject paper", keyboard j/k/x/c. Low confidence and unclear lines start unchecked (same rule as the phone `defaultChecked`). | `listDrafts`, `setStatus`, `settleDocument` |
| F5 | Duplicates | The 7 remaining same-file pairs side by side: row counts per kind, confirmed rows, Rx line differences. "Keep this one" rejects the other copy. | selects on `documents`/`source_files` by sha256; status update |
| F6 | Files and scans | Every source file: person, kind, pages, `ingest_status`, `ingest_error`, tries, created. Filter failed / reading / new. Open the file. Retry a failed scan (resets status to `new`). | `source_files` (admin RLS); retry = update `ingest_status` |
| F7 | IDs and insurance | Per person: ID type, number **masked** (last 4 shown), issued/expiry, source page. "Show" reveals one number for 30 s and logs that it was shown. Edit / confirm / reject. | `person_identifiers`, `insurance_policies`; reveal logged in the audit table (F8) |
| F8 | History | Who changed what, when: table, row, person, action (insert / update / confirm / reject / reveal), changed field names. Filter by person and table. Also the 0019 dedupe log. | new `audit_log` (M1), `records_dedupe_log` |

Not in wave 1 (say if wanted): deleting a person or an account, merging two people, editing the test catalog, bulk export, n8n/usage dashboards beyond what the Overview has.

## 4. UI layout (v6 cream/green tokens from `src/styles/tokens.css`, no new colours)
- **Desktop >= 1024 px:** left nav rail 232 px (Overview, Members, People, Confirm queue (count), Records, Files and scans (failed count), IDs and insurance, Duplicates (count), History). Main area: page title in Fraunces, a filter bar, then a table on `--card` with `--line` row rules. Selecting a row opens a right detail panel (400 px) with the source page preview and the edit form; the list keeps its scroll.
- **Tablet 768-1023 px:** the rail collapses to 64 px icons with labels on focus/hover; the detail panel opens as a side sheet over the table.
- **Phone 390 px:** the nav becomes a horizontal chip row; tables become card lists; detail opens full screen with a back header. The current phone Admin page stays the entry (`#admin`), with a "Open dashboard" link.
- Patterns from the mockup: pills (44 px min), chips, `tag ok/warn` for status, the existing confirm dialog for every destructive action, toast with Undo after confirm/reject (undo = set the previous status back).
- Icons through the existing `<Icon>` (Tabler). Masked ID numbers in tabular numerals.

## 5. Server changes (each: migration + `.down.sql` + begin/rollback rehearsal on live; apply only on Lloyd's "apply")
- **M1 `0021_admin_audit.sql`:** table `audit_log(id bigint identity, at, actor uuid, tbl text, row_id uuid, person_id uuid, action text, fields text[])`. RLS on; select `is_admin()` only; no client insert/update/delete. AFTER insert/update trigger (SECURITY DEFINER, `search_path=''`) on `people`, `carers`, `person_identifiers`, `insurance_policies`, `documents`, `lab_results`, `prescription_items`, `medications`, `vaccinations`, `imaging_reports`, `conditions`, `allergies`. Stores **column names only, never values** (no health values, no ID numbers copied). Also `people_admin_read` (select on `people` using `is_admin()`): today `people_read` has no admin clause, so the admin cannot list dependents or other members' profile rows. Profile edits go straight to `people` under the existing grants so the audit row carries the admin as actor (the Edge Function's service-role writes would log no actor). RPC `admin_reveal_identifier(p_id uuid) returns text`: checks `is_admin()`, writes an action `reveal` row, returns the number. Down drops the triggers, RPC and table.
- **M2 dropped** (Q1: keep admin carer links read-only).
- **E1 `admin-members` list:** add `lockedUntil` and `fails` from `pin_attempts` (service role, already inside the function). Deploy is a gate (Lloyd).
- Found while reading: the client calls `admin_assistant_usage` but no migration defines it. Not part of this work; listed as a follow-up.

## 6. Lanes (Sonnet 5.5 builds, own worktree each, commits; no two lanes touch the same file)
| Lane | Files | Review |
|---|---|---|
| L0 Orchestrator contract (first, small) | `shell/routes.ts` (`admin/<page>/<id>` parse), `App.tsx` (wide layout class on `#admin/*` only), `admin/desk/types.ts`, `admin/desk/Shell.tsx` (rail + outlet stubs) | Opus |
| LA Members + People | `admin/desk/Members.tsx`, `admin/desk/Person.tsx`, `admin/desk/Carers.tsx`, `admin/desk/members.css`, `supabase/functions/admin-members/index.ts` + `_shared/members.ts` (E1) | Opus; Fable for the carers part |
| LB Records + Confirm queue + Duplicates | `admin/desk/Records.tsx`, `admin/desk/Queue.tsx`, `admin/desk/Duplicates.tsx`, `admin/desk/recordsApi.ts` (new; calls `records/api.ts` exports, does not edit it), `admin/desk/records.css` | Opus |
| LC Files + IDs + History | `admin/desk/Files.tsx`, `admin/desk/Ids.tsx`, `admin/desk/History.tsx`, `admin/desk/logsApi.ts` | Fable (ID numbers) |
| LD SQL | `supabase/migrations/0021_admin_audit.sql` + down, `supabase/tests/admin_audit_rehearsal.sql` | Fable |

Order: L0 first (about 20 min), then LA-LD in parallel. Session-7 files are not touched except the two L0 lines in `routes.ts` and `App.tsx`.

## 7. Tests and verification
- vitest per page with the mocked client (pattern: `AdminScreen.test.tsx`): masking shows last 4 only; reveal calls the RPC; bulk confirm excludes unclear and low-confidence rows; Undo restores the previous status; duplicates "keep" rejects only the other copy; non-admin gets nothing.
- SQL rehearsal (WSL Postgres + live begin/rollback): audit rows written with field names only (assert no value text in `fields`), non-admin select returns 0 rows, reveal by non-admin raises, up-down-up clean.
- Playwright (auth project, mocked REST, admin session): every page at **1280 px and 390 px**, plus 820 px for the tablet rail; no sideways scroll; axe `wcag2a`+`wcag2aa` **0 violations**; targets >= 44 px.
- Gates: `tsc` 0, full vitest, full Playwright, build. Then on live data after deploy: the queue count, the 7 duplicate pairs and the failed-scan count match a SQL count.
- Screenshots stay local (git-ignored); none committed.

## 8. Questions for Lloyd (answered 2026-10-21: 1 read-only, 2 field names only, 3 masked + logged Show, 4 all in one wave)
1. Writer carer links: may the admin create links that can **edit** someone's records (needs M2), or keep admin links read-only as now?
2. History: store changed **field names only** (recommended, no health values copied), or old and new values too?
3. ID numbers: masked with a logged 30-second "Show" (recommended), or always masked in the dashboard?
4. Scope: all of F1-F8 in one wave of 4 lanes (recommended, about 2-3 h), or Members + Profiles + Confirm queue first?

## 9. Web UI redesign (2026-10-21, Lloyd: "make the admin dashboard a web UI and not a mobile app")
Answers: v6 green in a web-admin layout (reference: classic admin template); own page `/admin`; desktop first, phone usable; Dashboard home with KPI tiles, charts, work panels and recent history; plus a proper Members area to see, update and edit each member.
Mockup: `docs/admin-dashboard/mockup-web.html` (made-up numbers, no real names).

- **Own page:** `admin.html` as a second Vite entry -> `bantay.pages.dev/admin`. No phone shell (no tab bar, sky, Ask bubble, offline bar). Same Supabase session (same origin). Not signed in -> link to sign in at `/`; not admin -> "Admins only". The service worker must not serve the phone app for `/admin` (navigateFallbackDenylist). `#admin/<page>` in the app redirects to `/admin#/<page>`; the phone Admin page gets an "Open web admin" link.
- **Layout:** dark green top bar (brand, search, PIN-request and alert bells, admin menu with sign out); cream sidebar grouped Overview / People / Records / Private / System with count badges; content area with page header and breadcrumb; flat 8 px panels, compact tables (44 px rows), footer. Sidebar collapses to a menu button under 1024 px.
- **Dashboard home (new):** 4 KPI tiles (active this week of members, drafts to confirm, failed scans, IDs expiring in 60 days), chart of screens opened per day for 30 days with records confirmed per week, "Confirm queue by person", "Needs you" (PIN requests, duplicates, failed scans, locked members), "Recent changes" (last 10 audit rows). Counts only; no new migration (head-count queries).
- **Members (merged with People):** one table of everyone incl. dependents: sign-in, role, state (active / locked / disabled / cared for), carers, last seen, drafts to confirm; actions Add member, Add dependent, Invite. **Member page** `/admin#/members/<personId>`: summary card + tabs Profile (edit), Account (PIN, unlock, role, disable), Carers, Records, IDs, History (that person only).
- Existing pages (Confirm queue, Records, Duplicates, Files and scans, IDs, History) move into the new shell unchanged in function; Safety data/broadcast and Usage reuse the phone admin sections.

Lanes: W0 orchestrator (entry, shell, theme, redirect, SW); W1 Dashboard home (Sonnet, Opus review); W2 Members area + member page (Sonnet, Fable review). Gates as section 7 (1280 / 820 / 390 px, axe 0).
