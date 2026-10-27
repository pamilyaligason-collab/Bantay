# Sharing (session 12, lane A, D-80 / D-82 / D-84)

Records are private until the person shares them. The list of who can see them is kept on the server, so it is the same on every phone.
Migration `0037_sharing.sql` (undo: `0037_sharing.down.sql`, rehearsal: `supabase/tests/sharing_rehearsal.sql`).

The one privacy line, used everywhere: **Only you, the family admins, and the people you share with can see your records.**
The admin promise, said the same way in the privacy policy and on the sharing screen: **The family admins can set who sees your records. You will be told, and you can stop it.**
The admin desk says: **Admins can see records to help.** (Admins already read readings, records and nutrition through 0008 and 0024 policies; this release changes none of that.)

## Model

- `carers (carer_id, person_id, can_write, added_by, added_at)`: only live, accepted links. Every policy and function that reads `carers` (`is_carer_of`, `is_writer_of`, `notify_family`, `raise_mood_alert`, `phone_health_carer`, dose-watch) is unchanged, so a carer who has not accepted reads 0 rows and gets 0 alerts.
- `share_offers (person_id, carer_id, can_write, added_by, added_at)`: a pending offer. One per pair. The carer, the person and admins can read it. Nobody writes it over REST.
- No client writes to `carers`: policies `carers_insert/update/delete` (0001) and `carers_admin_insert/update/delete` (0004) are dropped and the table grants revoked. The only writers are `share_set`, `share_accept`, the `link_creator()` trigger (the creator of a no-login person), and the service role.

## RPCs (security definer, empty search_path, grants restated, 30 calls an hour per caller)

| RPC | Who | Result |
|---|---|---|
| `share_set(p_person, p_carer, p_can_write, p_on)` | the person, an admin, or a writer carer of a person with no login | `'pending'` (new offer), `'updated'` (edit access of an existing link or offer changed), `'removed'`, `'unchanged'`. `42501` not allowed, `22023` bad target, `53400` over 30 an hour |
| `share_accept(p_person, p_accept)` | the carer the offer is for | `true` when an offer was answered. Accept moves it into `carers` and tells the person (`share_on`) |
| `my_viewers()` | a member | my viewers, accepted and pending, with names (`pending`, `added_by_admin`, `added_at`) |
| `share_candidates()` | a member | active members I could share with (not me, not already a viewer or offered); the user id is what `share_set` takes |
| `admin_share_grid()` | an admin (`42501` otherwise) | every link and offer on active people, with names |

Rules enforced in `share_set`:
- Only an admin can make a carer who can edit (`can_write`), and only for a person with no login. A member sharing their own records always sends a read-only offer.
- Admins can offer and remove viewers for anyone, members with a login included (owner decision D-80/D-82); the carer must still accept. Because that is the admin's call and not the member's, the member is told at OFFER time (alert `share_admin`, a template id only, no name) as well as when access starts (`share_on`), sees the offer as "An admin offered this. Waiting for X to accept" on Who can see my records, and can cancel it or stop the link there.
- Cannot share with yourself, the person themself, a disabled member, or a non-member. An archived person cannot be shared.
- The creator link of a person with NO login (`is_person_creator` and `people.auth_user_id is null`) is never removed and never changed to read only (42501), so a dependent always keeps a writer. Once the record has a login (an admin attached one), that link is an ordinary one: the person themself and an admin may remove any viewer, the creator link included.
- A carer cannot remove their own link here (an admin or the person can); that is not built.
- Audit rows (`audit_log.action`): `share_add`, `share_remove`, `share_accept` (column names only). `audit_carers` (0021) also logs the raw `carers` insert/delete; count only `share%` actions.
- Alert rows hold a template id and a dedupe ref only (B-7): `share_offer` to the carer, `share_admin` to a member when an admin offers a viewer on their records, `share_on` to the person on accept, `share_off` to the carer on removal.

## App

- `#sharing` (Me > Who can see my records, or Me > Privacy > Who can see my records): `SharingScreen` lists viewers, "Waiting for X to accept" with Cancel, Stop (asks first), "Share with someone" sheet, and the admin line. There is no "Recent changes" list: the database keeps no log a member can read, and a list built from today's viewers could not show removals. The local `share.*` switches in Me are gone (their kv rows are simply ignored).
- `AcceptCard` (mounted by lane J at the top of Family > People): "<name> can share their health records with you", Accept or No, thanks (No, thanks deletes the offer). The words never say who asked, because the offer may come from the person, a carer who keeps their records, or an admin. The name comes from the family list cached at sign-in.
- Admin desk `#/sharing` ("Who sees whom"): people by people grid; a box is shared (check), carer (C), or waiting (dashed). Select a box to offer, set carer (no-login person only), or stop.
- Errors are three plain strings: no signal, "You cannot change that.", "You changed sharing a lot. Try again in an hour." The accept card shows the one that matches the real cause.

## Known limits

- `share_candidates()` returns auth user ids to every active member, because `share_set` takes the carer's auth user id (contract). `family_profiles()` hides them. Moving to people ids needs a contract change, so it is left for a later release.

## Not built

- Choosing what a viewer sees (medicines only, papers only): the database has one level. The sheet says what sharing gives instead of showing switches that would not be enforced.
- A member cannot make their own carer who can edit (see the rule above); the box in the sheet is shown off with the reason.
- A carer cannot leave a link on their own yet (only the person or an admin removes it).

## Apply and undo

Apply `0037` after 0036 (before 0038). Undo with the down file: carers rows stay, pending offers are dropped (they never gave access), the two CHECK lists go back to the 0030 / 0034 lists as `NOT VALID`, and the old carers write policies come back.
