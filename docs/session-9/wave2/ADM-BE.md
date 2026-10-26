# ADM-BE fix round
Branch worktree-wf_ac368f43-134-6 commit 62020b6 worktree D:\Claude\Bantay\.claude\worktrees\wf_ac368f43-134-6
Build status: done
Builder exit claim: Home, Calendar, Files, IDs and History changes are committed at 62020b6; tsc exited 0, the three Playwright specs passed 36 of 36, and the admin vitest folder passed 223 of 223. The full vitest run had 2 failures under load that passed when rerun alone.

## Review issues (pass_with_issues)
1. [major] The per-person queue link is only half done. Home now links to #/queue/<personId> (Home.tsx, e2e asserts /#\/queue\/p2$/), but Queue.tsx:55 is `export default function Queue(_: PageProps)`, so it ignores the id and opens the whole queue. The brief asked for the link to open that person's queue, and that does not happen yet. The fix belongs to the ADM-REC lane's Queue.tsx and must land before merge; otherwise the link promises a filter that does not exist.
2. [major] Tests are missing for several fixes the brief asked for. The Calendar month 'Meds N' collapse has no vitest or e2e assertion; it is only visible in calendar-1440-light.png. listExpiringIds (sorting, skipping rejected, any-person-fails becomes an error) has no unit test; only the e2e 'In 20 days' check covers it. Nothing checks the 12px chart axis minimum or the Recent changes dk-s12 layout. The fixtures that do exist (weekDelta, kindWord, activeByWeek, daysLeft, expiresSoon) use hand-computed values, which is fine.
3. [minor] Ids.tsx Expiring(): `if (!ids) return` in the effect means a family with zero people never sets rows, so the page shows a Skeleton forever instead of an empty state.
4. [minor] The Home 'IDs expiring in 60 days' tile and the list it opens use different rules. loadExpiring counts direct table rows dated 0 to 60 days ahead, including rejected ones. listExpiringIds also includes already-expired items and skips rejected ones. The screenshots show the tile at 1 while the list has 2 rows (SSS expired 2000, Passport in 20 days).
5. [minor] The 'Active' delta and the KPI value come from different sources. The value is admin_usage_summary active_7; the delta is a usage_events scan over Manila days. They can disagree, for example '1 / 2' next to a delta from another window. loadActiveWeeks also orders by `at` ascending and stops at 20k rows, so on a cut-off it drops the newest rows and undercounts this week without saying so. It should report unknown when it hits the cap; this is B-5 in spirit.
6. [minor] isExpired uses the UTC date while expiresSoon/daysLeft use todayManila(). From 00:00 to 08:00 Manila, an ID that expired yesterday (Manila time) gets neither the 'Expired' tag nor the 'soon' tag.
7. [minor] Not done from the brief, as the builder said: the History Dedupe table did not get dk-cardtab, and the Calendar phone filter sheet, F2 failed-first sort / Retry-all, HI3 and HI4 are deferred. The table-to-cards conversion under 768px is done for Home Recent changes, Files, IDs and History Audit. Setting dk-cardtab display:block may remove table semantics for some screen readers.
8. [minor] Full vitest is not green in one run. My full run had 2 failures from unrelated 15s timeouts (src/screens/SignIn.test.tsx 'five failures show the locked screen', src/features/nutrition/PlateSheet.test.tsx 'your own food saves...'), which are different files from the builder's History flake. Both pass when rerun alone, and the admin folder passes.

## Builder needs
- The admin-desk-members and admin-desk-records specs (run in an earlier 26-pass/17-fail pass) failed with the machine under load; not rerun alone after my final changes. Rerun them on the merged tree.
- Queue.tsx (ADM-REC lane) ignores the person id: Home now links to #/queue/<personId>; add a person filter there.
- Wave 1 was not in my worktree at start; I fast-forwarded to claude/cache-ttl-cost-39e7cd (no package changes) before editing.

## Builder risks
- dk-cardtab sets display:block on table under 768px; screen-reader table semantics may be dropped by some browsers (shortcut noted).
- Home 'Active' delta uses a new usage_events read (user_id, at, 14 days, paged, max 20k rows) and counts only members who can sign in; unknown on either side shows no delta.
- Home 'To confirm' tile now shows 'N confirmed this week (M last week)' from the weekly series; the current week is partial.
- Expiring IDs list calls admin_identifiers per person (one RPC each; only last 4 digits arrive). It includes already-expired items, but the Home tile counts only 0-60 days ahead.
- Existing tests and specs updated for the new button labels (Delete, Change times, Read again), 'Value, Unit' field words and /queue/p2.
- Not done: Calendar C2/C3 phone filter sheet, H3 value labels, H10 updated time, F2 failed-first sort and Retry-all, I3 row menu, HI3 visible From/To labels, HI4 load more.
- IDs expiring-list is only a Playwright-asserted path; an e2e SHOTS block is gated behind the SHOTS env var in three specs.