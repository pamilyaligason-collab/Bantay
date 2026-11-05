# D-109: Who can see whose readings (plan, 2026-11-01)

**Status: the owner approved the build, 2026-11-02. Not started: it waits for the v13 squash merge (section 11).** Base: main after that merge, not 0fa856e. Migration: `0046`, agreed with the v13 orchestrator; weather blend moves to `0047` when it rebases.
Numbering: this entry stays D-109. The fast test loop entry that shared the number is now D-111.

## 1. What the code and live database show

Live findings (general words): the family has admins and members; most people have no login; every carer link is a writer link on a no-login person, held by one admin; no offer is waiting.

| # | Finding | Evidence | Effect on this plan |
|---|---|---|---|
| F1 | The count on the admin's Family includes an archived person | `people_admin_read` (0021) has no archived filter; `pullPeople` (sync.ts:253) takes every row | Pull active people only |
| F2 | The admin's cards for unlinked people can say **Missed** falsely, and "No check-in" | Admins read `medications` (`records_editor`, 0008:18) but not `meds_taken` or `activity` (0003:86,96). Doses with no takes are judged missed. Code reading, not seen on a phone | The owner needs those two tables, or the switch shows wrong data |
| F3 | A new link does not bring old records to the viewer's phone | `pull` reads from a saved cursor (sync.ts:206-209); nothing resets it | "At once" would show only new rows. Must fix |
| F4 | Removing a link already wipes that person from the phone | `pullPeople` (sync.ts:263-275, ML-07) | Reuse. But an admin keeps seeing every people row, so a non-owner admin is never purged (see 3.3) |
| F5 | Any admin can disable or demote any other admin, the owner included | `admin-members` uses the service role | The owner row needs a guard |
| F6 | Members see all family names, with a false "No check-in" for anyone unlinked | `useFamilyPeople` merges the sign-in list; `activity` is unreadable without a link | Family lists only self and linked people |
| F7 | The owner's account holds the carer links, so the owner is the only person relying on the at-a-glance carer view today | Live query, per-admin aggregates | Keeping the glance is low cost |
| F8 | The second admin's person row is the archived one, with no links and no recent use | Live query, per-admin aggregates | Looks unused, so demoting it may settle decision 4 (question 1) |

## 2. Answers to the open points

1. **Owner mark:** a new `app_roles.is_owner` flag, one owner only, set by one SQL line at apply time so no email or id enters the repo. Unset means nobody can set others' links (fails closed).
2. **Who may set links:** the owner for anyone; a person for their own records; a writer carer of a no-login person (today's rule, read-only viewers). **Other admins may not**: with no acceptance step, this power now grants access outright.
3. **Is Y told?** Yes, straight away: "Someone new can see your records" (no name in the push, B-7). Y sees who in Me > Family > Who can see my records and can Stop it. The owner can add it again, and Y is told again.
4. **No-login person:** cannot agree or be told. Their writer carers get the alert instead, the audit log keeps the change, and the owner removes links. The creator link stays protected (0037). If they later get a login, the list is already there for them.
5. **The owner on each person's list:** not a link, so Y cannot remove it. A fixed line says: "The family owner can see everyone's records."
6. **Pending offers and acceptance:** No offers are waiting, so nothing to convert. Acceptance goes for every sender, including a member sharing their own records (one path). `AcceptCard` is deleted. `share_offers` and `share_accept` stay dormant and can be dropped in a later release.
7. **What a link gives:** the whole record (medicines, doses, readings, consults, confirmed papers, activity and check-ins, food, water, phone health; never drafts, ID cards or identifiers), because the database has one level. See question 4.

## 3. Functions

### 3.1 Everyone: Family opens on Me
| Part of Family root | Me selected (default) | Someone selected |
|---|---|---|
| Switch (`PersonSwitcher` pill, same as Health) | Hidden if you can see only yourself | Pill shows their first name |
| Today | Your card and I'm OK | Their card; Mark taken only if you are their writer carer (unchanged) |
| Activity | You only | Them only |
| Needs you now | Writer-carer rows, see 3.2 | Same |
| People | You and your linked people: check-in, flag word only for writer links | Same |

- The switch lists: **owner = everyone active; anyone else = self and linked people.**
- It resets to Me on leaving Family and on every open; nothing is stored.
- Removes F1, F2 and F6 from view. "N of M checked in" goes (it was never true for unlinked people).
- Also scoped to self and linked: `FamilyHealthCard` on Health, `Calendar`. Health's own switcher keeps working.
- Scoped to self: Discover's "Medicines on your family's lists" (`discover/learn/Meds.tsx:18` reads every medicine on the phone).
- View as: the acting person is selected; the list stays `useViewedVisibleIds`.

### 3.2 Carers keep the glance
Missed doses for people you are a **writer carer** of stay on the default page, in Needs you now, with **no medicine name and no numbers**: "Ma: missed a medicine · Open". Open switches to that person; the name shows there.
- New rows in `needsRows`: missed doses now always listed (the Today card no longer says them). The question row drops the medicine name.
- Push and in-app alerts are unchanged: dose-watch, the digest and `notify_family` carer scope read `can_write` links only. Family-wide alerts such as SOS keep reaching every active member.
- Read-only viewers and the owner get no flags for people they are not writer carers of, so being able to see everyone adds no alarms.

### 3.3 Other admins (the owner chose A, 2026-11-01: part 2 of section 5 is not built)
Server today lets every admin read readings, records, nutrition and phone health, and sync copies these to their phone. A screen filter alone would not deliver decision 4.
- **A. Demote the second admin (recommended if nobody uses that login as an admin).** No code beyond the sync fix in lane 2. They become a member, and the F4 purge clears their phone on its next sync. Copy is true at once. A future admin would need option B first.
- **B. Keep them as an admin and narrow the server.** Section 5, part 2. They keep Members and System, but lose Records, Queue, Files, IDs and Calendar for anyone they are not linked to, lose PIN resets and attaching logins to people (either one is a way into a person's records), and lose direct edits of a person's page. It is about twice the work of A.

### 3.4 Managing links
- **Phone, Me > Family > "Who sees whom" (owner only):** list of people with "3 can see"; tap to open the existing `SharingScreen` for that person (`#sharing/<personId>`), with Add and Stop. Add reuses `ShareSheet`, words changed to "Allow".
- **Web, admin desk "Who sees whom":** the existing grid. A tap on an empty box allows at once, a tap on a filled box stops after a confirm. The dashed "pending" state goes. Other admins see it read-only.
- **Old `#admin` `CarerLinks`:** deleted, replaced by a link to the grid, so there is no third place.
- **Copy:** "the family admins" becomes "the family owner" in `SharingScreen` (2), `PrivacyScreen`, `MemberPage`, `Report`, desk heading, `docs/SHARING.md`.

## 4. UI (v13 tokens and look components, 390 px)

```
Family (default)                Family (Ma selected)          Me > Family > Who sees whom
                                                              ‹ Family
Family            [Me ⌄] [+]    Family            [Ma ⌄] [+]  Who sees whom
Today                           Today                         You can see everyone. The app
 ┌ You · OK 7:40 AM ───────┐     ┌ Ma · Missed a medicine ┐   opens on your own page.
 │ Nothing waiting.  [Open]│     │ [Medicine] was due 8   │   ┌───────────────────────┐
 └─────────────────────────┘     │ [Mark taken]    [Open] │   │ Ma        2 can see  ›│
Activity  BP|Steps|Medicines     └────────────────────────┘   │ Papa      Nobody     ›│
 You · 7-day chart              Activity  BP|Steps|Medicines  │ Joy       1 can see  ›│
Needs you now  1 thing           Ma · 7-day chart             └───────────────────────┘
 Ma: missed a medicine  [Open]  Needs you now  (same)         Changes apply at once. The
People                          People  (same)                person is told and can stop it.
```
Sheet on pill tap: `Sheet` + `GroupedList` titled "Who to show". Boards: row 12 of the living canvas (artifact MqovChEM76M1wMo61aKfs9), for sign-off before build.

## 5. Migration outline: `0046_who_sees_whom.sql` (+ `.down.sql`)

**Part 1 (always)**
```sql
alter table public.app_roles add column if not exists is_owner boolean not null default false;
create unique index if not exists app_roles_one_owner on public.app_roles (is_owner) where is_owner;
create function public.is_owner() ... -- exists own row with is_owner and not disabled; security definer, search_path '', authenticated only
-- trigger on app_roles: an owner row cannot be disabled, demoted, un-owned or deleted, by any writer including the service role; a second owner fails on the index
create policy meds_taken_owner_read / activity_owner_read / consults_owner_read ... for select using (public.is_owner());
alter table public.carer_alerts ... -- no kind change: templates stay under 'share'
create or replace function public.share_set(...) -- same signature
```
`share_set` changes only: `adm` is replaced by `is_owner()` in the who-may-call, `can_write` and removal checks; the offer insert becomes a `carers` insert with `added_by`, `added_at`; it returns `'added'`; alerts become `share_given` to the carer, `share_added` to the person with a login (not when they added it themself), or to the writer carers of a no-login person. Alert refs carry the link's `added_at` instead of the hour bucket, so add, stop, add within an hour tells Y again. Refusing `p_carer = me` stays: the owner never needs a link.

Two new read functions, gated like `share_set`, so the owner can manage another person's list: `person_viewers(p_person)` and `share_candidates(p_person)`. Today's `my_viewers()` and `share_candidates()` only know the caller's own record. They stay for a stale bundle.

The owner guard covers `disabled`, `role`, `is_owner` and delete only, so a handle change still works. `erase_user_data` sets `disabled` and would fail on every cron run for the owner, so `request_erasure` refuses the owner: hand over ownership first.

Apply-time line, not in the file: `update public.app_roles set is_owner = true where user_id = <the owner's id>;`. Same session as the migration.
Down: restores the 0037 `share_set`, drops policies, trigger, function and column. Links made stay in `carers`.

**Part 2 (not built: the owner chose A. Kept as the checklist for any future admin)**
- `records_editor` (one function, covers 13 record tables and `records_object_editor`): `is_admin()` becomes `is_owner()`.
- `readings_admin_read`, the 3 nutrition policies, `source_files_*`, `phone_health_read`, `admin_identifiers`, `admin_reveal_identifier`: same swap. Re-check 0013, 0014 and 0019 for direct use.
- `people` holds allergies, conditions, medicines and blood type (0010:19-21). `people_admin_read` becomes owner-only, with a names-only definer function for the desk; `admin-members` list strips `profile` for non-owners.
- `admin-members` `create` with `personId` and `set_pin`: owner only.
- `records_editor` also drives `people_update`, `avatar_editor` and consent writes: keep `is_admin` in `avatar_editor`, and route other admin edits through `admin-members`.
- `audit_log`, `admin_share_grid` stay: links and column names, no health values.
- Client: `pullPeople` keeps only self and links for a non-owner admin. `isOwner` here is three-state: on any error (role or carers read) skip the purge, never treat it as "not owner". `canFor` and `canViewReport` use owner, not admin. Desk health pages say "Only the family owner sees this" instead of looking empty.

## 6. Client changes
| Lane (Sonnet, own worktree; Opus review each) | Files |
|---|---|
| **1 Server** | `0046` + down, `tests/d109_rehearsal.sql`, `sharing_rehearsal.sql` updated, `chain_rehearsal.sql` (add 0043, 0044, 0046), both `templates.ts` |
| **2 Sync** | `sync.ts`: active people only on the people pull, always keeping the caller's own row; the purge also runs on a successful empty read (sync.ts:259 returns before it today); split the table loop; a newly seen person clears the pull cursors and runs the tables once more; one-shot cursor reset on the owner's phone at this release (owner's old doses and check-ins) |
| **3 Family** | `session.ts` (`isOwner`, separate query, any error = false, so an unapplied migration cannot turn admins into members), new `family/useFamilyScope.ts`, `screens/Family.tsx`, `PersonSwitcher` (`onPick`), `TodayCarousel`, `ActivityCard`, `useFocuses`, `needsRows`, `PeopleList`, `FamilyHealthCard`, `Calendar`, `discover/learn/Meds.tsx`, e2e `v13-family` |
| **4 Sharing** | `SharingScreen` (person param), `ShareSheet`, `FamilyGroup`, new owner list, `sharing/api.ts` (`'added'`, `person_viewers`, `share_candidates(p)`), delete `AcceptCard`, desk `Sharing.tsx`, desk `Person.tsx`, `AdminScreen` (`CarerLinks` out), copy sweep, `docs/SHARING.md` |

Reused unchanged: `carers` and every policy reading it, `admin_share_grid`, `Sheet`, `GroupedList`, the ML-07 purge. dose-watch logic is unchanged but it must be redeployed for the new templates (section 8).

## 7. Tests
**RLS rehearsal (throwaway WSL Postgres, never live), `d109_rehearsal.sql`:**
1. `is_owner()`: true for the owner; false for another admin, a member, a disabled owner, and anon.
2. Two owners refused; the owner cannot be disabled, demoted or deleted, including as service role.
3. Owner reads B's `meds_taken`, `activity`, `consults`, `readings`. Other admin reads no `meds_taken`, `activity`, `consults`.
4. Owner sets J to see B: a `carers` row exists at once, `'added'`, J reads B's rows immediately, 0 offers written, audit row, `share_given` to J, `share_added` to B. Alerts hold template ids only.
5. Other admin setting J to see B: 42501. Other admin on themself: refused. Member on someone else's record: 42501. Member on own record: allowed, instant.
6. `p_carer = me` still refused for the owner. `can_write` only for owner on a no-login person.
7. No-login E: writer carers alerted, nobody else. Creator link removal still 42501.
8. B stops J: J reads 0 rows at once. Owner adds again: B alerted again.
9. Read-only J gets no `dose_missed` and no `notify_family` carers alert; the owner gets none for people not linked.
10. Grants: `is_owner` authenticated only; no REST write to `app_roles.is_owner`. Migration runs twice safely; down then up passes.
11. Owner erasure request refused; a handle change on the owner row works. Non-owner admin cannot change `can_write`.
12. Add, Stop, Add within one hour alerts again. A member adding their own viewer gets no `share_added`.
13. Read-only link: 0 drafts, 0 identifiers, 0 ID-card documents; `phone_health` readable.
14. `person_viewers` and `share_candidates(p)`: owner on any person, a person on themself; other admin and member refused on others.
15. Part 2 only: other admin reads no `readings`, `medications`, `medication_sources`, nutrition, `phone_health`, identifiers, `records` storage objects or `people` health columns for an unlinked person, and still reads names, `audit_log`, grid. Owner keeps all.

**Vitest (test first):** `useFamilyScope` (owner, admin, member, carer, acting, offline cache); `needsRows` no medicine name; default view renders no other person's data; sync: new person clears cursors and re-pulls without duplicates, removed person purged, archived never pulled, one-shot runs once; `isOwner` false on error; `setShare` `'added'`.
**E2E, 390 px shots:** Family default, selected, owner list, desk grid, against the mockup.
**Gate:** full `npm test`, typecheck, Opus final review.
**After deploy, on live data:** the owner's phone opens on Me, everyone active in the switch (no archived), real doses for an unlinked person; one real link added and removed with the viewer's phone showing old readings then none.

## 8. Release order (each needs the owner's OK)
1. Boards approved on canvas.
2. Build lanes, reviews, rehearsal green.
3. Option A demotion: done on the owner's word, 2026-11-01 (one-row SQL update). Its phone clears when lane 2 ships.
4. Deploy `dose-watch` with the new templates first: the live one marks an unknown template as sent and the push is lost. Check other functions that use `_shared/templates.ts`.
5. Apply `0046`, then the owner line. Old bundle stays safe: an unknown `'added'` reads as `'unchanged'`.
6. Merge to main; Cloudflare deploys. No APK needed (it loads the web app).
7. Live checks above, vault flush.

Rough size: 1 session, about 4 lanes.

## 9. Known limits, not built
- "At once" means the server at once; the other phone changes on its next sync. A phone left offline keeps what it holds until then.
- The owner offline falls back to their cached links (role cannot be read offline), so it fails closed.
- No per-type sharing, no "the owner looked at this" log for switches, no realtime push of a link.
- Consent version is not bumped; the "you will be told, you can stop it" promise stays.
- Follow-up: the I'm OK toast says "The family can see you are OK", but only carers can read it.

## 11. Agreed with the v13 orchestrator, 2026-11-02 (D-110 items 7, 8 and parked gaps)
**Order:** wait for the orchestrator's merge message, cut from the new main, put no D-109 code on its branch. Re-check this plan's file list and line numbers against new main before lanes start.

**Added to lane 1 (`0046`):**
- `people.kind` text, null by default, `'shared'` for the shared family account. Clients cannot write it. The account is marked by one SQL line at apply time, like the owner line, so no name enters the repo.
- `activity.updated_at` with a stamping trigger. The backfill makes every row pull once more, which is harmless because merge keys on `client_id`.

**Added to lane 2 (sync):**
- `kind` joins the people pull and `Person`, so `switcherPeople` (`PersonSwitcher.tsx`) sees it. Check that file on new main.
- Late step totals (D-110 item 7): an `updated_at` cursor for `activity` in `tables.ts`; in `merge`, known rows update only for sensor hours and only when the total rises, so hidden old rows stay untouched. A higher total also reaches the owner's other phone. Touches `sync.ts`, `tables.ts`, `sensors/health.ts`, `log/store.ts`; remove the `shortcut:` comment in `sensors/health.ts`.
- Still needed: the pull's archived filter. An admin's `people_admin_read` has no archived filter, so RLS does not hide archived people from an admin's phone.

**Added to lane 3 (Family):**
- F1: `useFocuses` `noTakes` goes. Family only lists people the viewer can read, so "No data" for a person with no read right can no longer arise. A test proves no unreadable person is listed.

**Added to lane 4 (copy):**
- `MoodCheck.tsx` "Only family linked to you can see this" becomes false once the owner sees everyone: it joins the copy sweep.

**Not changed:** T2's first-name-only row in My day. H8 stays Phase 2.

**Added tests:** rehearsal: `people.kind` not writable by a client, trigger stamps `updated_at` on update. Vitest: a known sensor row rises, a lower total and a hidden old row do not change, no duplicates; `kind` reaches `switcherPeople`.

## 10. Questions for the owner
1. **Answered 2026-11-01: second admin not needed, demote it** (3.3 A).
2. **Answered 2026-11-02: only the owner and the person themself set links, not other admins.**
3. **Answered 2026-11-02: Y is told after the fact and can Stop; the owner can add it back and they are told again.**
4. **Answered 2026-11-02: a link shows the whole record (medicines, doses, readings, papers, check-ins, food, phone health).**
5. **Answered 2026-11-02: the default page keeps "Ma: missed a medicine" for people the owner is a writer carer of, with no medicine name.**
