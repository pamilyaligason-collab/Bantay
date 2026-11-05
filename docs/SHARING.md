# Sharing (session 12 lane A, D-80 / D-82 / D-84; rewritten for D-109, migration 0046)

Records are private until the person (or the family owner) shares them. The list of who can see them is kept on the server, so it is the same on every phone.
History: `0037_sharing.sql` made links an offer the carer accepted. `0046_who_sees_whom.sql` (plan `docs/plans/2026-11-01-d109-who-sees-whom.md`) removes the accept step: a link applies at once.

The one privacy line, used everywhere: **Only you, the family owner, and the people you share with can see your records.**
The owner line, fixed on the sharing screen: **The family owner can see everyone's records.** The owner is not a link, so the person cannot remove it.
The desk says: **Only the family owner can change this page.** Other admins read the grid; they do not change it and (part 2, not built) are not narrowed on the server yet.

## Model

- `app_roles.is_owner`: one owner. Set by one SQL line at apply time, never in a file. `getMember().isOwner` reads it in its own query; any error reads as "not the owner".
- `carers (carer_id, person_id, can_write, added_by, added_at)`: live links, written at once by `share_set`. Every policy and function that reads `carers` is unchanged.
- `share_offers` and `share_accept` stay in the database, dormant. Nothing in the app calls them.
- No client writes to `carers`. The only writers are `share_set`, the `link_creator()` trigger and the service role.

## RPCs (security definer, empty search_path, 30 calls an hour per caller)

| RPC | Who | Result |
|---|---|---|
| `share_set(p_person, p_carer, p_can_write, p_on)` | the family owner for anyone; a person on their own record; a writer carer of a person with no login (read-only viewers only) | `'added'`, `'updated'` (edit access changed), `'removed'`, `'unchanged'`. `42501` not allowed, `22023` bad target, `53400` over 30 an hour |
| `person_viewers(p_person)` | gated like `share_set` | the viewers of one person (`added_by_admin`, `added_at`; `pending` is always false) |
| `share_candidates(p_person)` | gated like `share_set` | active members who could be allowed (not a current viewer, not the person's own login, not the caller when they are the owner) |
| `admin_share_grid()` | an admin | every link on active people, with names; the owner list counts rows per person |
| `my_viewers()`, `share_candidates()` | a member | unchanged, kept for a stale bundle |

Rules enforced in `share_set`:
- Only the family owner can make a carer who can edit (`can_write`), and only for a person with no login.
- Other admins cannot set links. The owner never needs a link and cannot link themself.
- The creator link of a person with NO login is never removed and never changed to read only (42501).
- The person is told when someone new is allowed (`share_added`, no name in the push, B-7); the carer is told too (`share_given`). Not sent to a member who added their own viewer. The alert opens `#sharing`, the list that shows who. A person with no login has no phone, so their writer carers get `share_added_carer` instead, and that alert opens `#sharing/<personId>`. A push tap carries only the template, so it falls back to the tab.

## App

- `#sharing` (Me > Privacy > Who can see my records): `SharingScreen` for my own record. The viewers, Stop (asks first), "Share with someone" sheet, the privacy line and the fixed owner line. No pending or accept state.
- `#sharing/<personId>`: the same screen for another person. Own record, the family owner, or a writer carer of that person (`useCarerIds`); anyone else sees a plain refusal and the server refuses too (offline reads as a refusal: "If that is you, check your signal."). Button "Allow someone". A carer (`can_write`) row has no Stop here unless it is your own page: a carer is changed on the web admin page. A signed-in user with no person row sees "Sharing is for people with their own page in Bantay.".
- `#sharing/all` (Me > Family and sharing > Who sees whom, owner only): `OwnerList`, every person with "N can see" or "Only you" from `admin_share_grid`, leaving out the owner's own rows (`countViewers`), because the owner is the writer carer of several people with no login and still sees them only as "Only you". A tap opens `#sharing/<personId>`.
- Admin desk `#/sharing` ("Who sees whom"): people by people grid; a box is shared (check) or carer (C). The owner taps an empty box to allow at once and a filled box to stop (after a confirm). Other admins see the grid read-only. The Carers tab on a member page follows the same rule.
- `#admin` on the phone no longer has a carer form; it links to the desk grid.
- Errors are three plain strings: no signal, "You cannot change that.", "You changed sharing a lot. Try again in an hour."

## Known limits

- "At once" means the server at once; the other phone changes on its next sync.

## Not built

- Choosing what a viewer sees: the database has one level, so the sheet says what sharing gives.
- Making a carer who can edit is not in the app; the sheet has no carer box. The owner does it on the web admin page.
- A carer cannot leave a link on their own yet.
- D-109 part 2: narrowing what other admins read on the server (kept as a checklist in the plan).
