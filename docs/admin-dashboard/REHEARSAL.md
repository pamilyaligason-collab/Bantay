# Migration 0021 rehearsal (lane LD)

Counts only. Synthetic rows; nothing from the live project.

| Item | Result |
|---|---|
| Target | throwaway local Postgres 18 (WSL Ubuntu), chain 0001, 0002, 0003, 0008, 0010, 0013, then 0021 twice |
| Script | `supabase/tests/admin_audit_rehearsal.sql` |
| Exit code | 0 |
| PASS notices | 35 (plus `ALL PASS`) |
| Up twice | clean |
| Up, down, up | clean; 12 audit triggers after the second up |
| Live project | not touched; 0021 not applied |

Live run (orchestrator): apply 0021 inside `begin;`, run the section of the script between `=== checks ===` and `rollback;`, then roll back.
Skipped locally: migrations 0004-0007, 0009, 0011, 0012, 0014-0020 (none touch the audited tables' audited columns beyond those in 0008/0013).

## Live check (2026-10-21, Lloyd ran `supabase/tests/admin_audit_live_check.sql` from the linked checkout; one transaction, aborted by design)
| Check | Result |
|---|---|
| Audit triggers created | 12 |
| People rows seen by the admin / total | 10 / 10 |
| `admin_identifiers` rows for one person | 7 |
| Lab edit logged fields | `{confidence}` (column name only) |
| Actions logged for that row | update, reject |
| Logged fields that are not column names | 0 |
| Member reads of audit_log | 0 |
| Member call to `admin_identifiers` | `not_admin` |
| Kept after the run (audit_log, audit triggers, people_admin_read) | 0, 0, 0 |
First attempt aborted on a bug in the check (confidence nudged above 1); nothing was kept.
