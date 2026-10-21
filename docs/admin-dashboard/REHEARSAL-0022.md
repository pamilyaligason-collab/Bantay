# Migration 0022 rehearsal (lane A1, archive people)

Counts only. Synthetic rows ('Test Child'); nothing from the live project.

| Item | Result |
|---|---|
| Target | throwaway local Postgres 18 (WSL Ubuntu), chain 0001, 0002, 0003, 0006, 0008, 0010, 0011, 0013, 0021, then 0022 twice |
| Script | `supabase/tests/people_archive_rehearsal.sql` |
| Exit code | 0 |
| PASS notices | 43 (plus `ALL PASS`) |
| Up twice | clean |
| Up, down, up | clean; down restores the 0021 people policies, the 0011 `family_profiles` body and grants, and the people columns (compared by hash against a snapshot taken before 0022) |
| Live-check script run on the throwaway db | ends in the raised `RESULT`, nothing kept (0 'Test Child' rows after) |
| Live project | not touched; 0022 not applied |

Live-check script: `supabase/tests/people_archive_live_check.sql` applies 0022 inside one transaction, creates one synthetic person, archives and reactivates it as the real admin, and aborts with `RESULT ...`. It never archives a real person. Local run of it: `cols=2 archived_real=0 member_sees_child_before=1 member_sees_child_after=0 member_call=not_admin member_direct_update=permission denied for table people admin_null_call=bad_input audit_rows=1 reactivated=1`.

## What the rehearsal proves
| Check | Result |
|---|---|
| Writer carer sees the archived child and dependent | 3 people before, 1 after (own row only) |
| Admin sees all after archiving | 4 of 4 |
| Dependent with own login after archiving | still sees its own row, `is_self` true, reads its own record, edits its display name |
| `lab_results` after archive and after reactivate | byte-identical (hash and count) |
| `admin_set_archived` | non-admin `not_admin`; anon refused; own person `self`; unknown id `not_found`; null flag `bad_input`; twice keeps the first date |
| Reactivate | both columns null, carer sees the row again, back in the sign-in list |
| `family_profiles()` | 3 logins before, 2 after archiving the dependent, 3 after reactivating |
| Client writes | update of `archived_at` or `archived_by` by a member, by the person, and by an admin session: `permission denied for table people`; insert with `archived_at` set: refused by `people_insert`; a normal insert still works |
| Audit | each archive and reactivate logs one `people` update with fields `{archived_at,archived_by}` and the admin as actor, no values |

## Other readers of `public.people` (why each is or is not affected)
| Object | Affected? | Why |
|---|---|---|
| `people_read` policy | changed | the point of 0022: own login row always, creator or carer rows only when not archived |
| `people_admin_read` (0021) | no | `is_admin()` only, so the admin still lists everyone |
| `people_insert` policy | changed | also demands `archived_at` and `archived_by` null, because `insert` is a table-wide grant (a client could otherwise create an archived row) |
| `people_update` policy (0010) and column grants | no | the update grant is column-by-column (0010, 0013) and never lists `archived_*`; an archived person is not selectable by carers, so a carer's update hits 0 rows; the person's own login can still edit its own row |
| `family_profiles()` | changed | 0011 body copied exactly, one added `archived_at is null` filter |
| `is_self(pid)` | no | no archived filter, so an archived person with a login keeps their own access |
| `is_carer_of`, `is_writer_of` | no | read `carers` only; carer links stay |
| `is_person_creator` (0004) | no | admin carer-link guard; archived or not, the creator link is protected |
| `link_creator` trigger | no | runs on insert; new rows are never archived |
| `ensure_self_person` (0002) | no | looks up by `auth_user_id`, security definer; an archived person who signs in gets their own row back and nothing is created |
| `records_editor`, `records_reader`, `avatar_editor` (0008, 0010) | no | built from `is_self`, `is_writer_of`, `is_carer_of`, `is_admin`; none read `people.archived_at` |
| `admin_import_counts` (0004) | no | admin only, lists everyone on purpose |
| `admin_identifiers`, `admin_reveal_identifier`, `audit_row` (0021) | no | `audit_row` already logs any changed column by name, so `archived_*` appear with no change |
| Storage `avatars_read` | no | any signed-in, non-disabled member, as before |

## Known limit (decision for the orchestrator)
Hiding is done at `people` (and the sign-in list). Record tables keep their own RLS, which goes through `is_carer_of` / `is_writer_of`, not through `people`. The rehearsal asserts this: a writer carer can still read an archived child's lab row if they query the table directly with the person id. Phones list people from `people`, so the app (lanes A3/A4) must also drop archived people from local Dexie data and sync filters. Hiding rows at the database too would need a change to `records_editor` / `records_reader` / `is_writer_of`, which would also hide them from the person's own offline-edit sync; it is not in the contract, so it is not in 0022.

## Orchestrator re-run (2026-10-21, fresh WSL Postgres db)
`people_archive_rehearsal.sql`: exit 0, 44 PASS lines (44 assertion calls; ON_ERROR_STOP, any failed assertion raises).
`people_archive_live_check.sql` on the same throwaway db (ends in a raised RESULT, nothing kept):
`RESULT cols=2 archived_real=0 people_total=2 member_sees_child_before=1 member_sees_child_after=0 admin_sees_all_after=3 member_call=not_admin member_direct_update=permission denied for table people admin_null_call=bad_input audit_rows=1 signin_before=2 signin_after=2 reactivated=1`
