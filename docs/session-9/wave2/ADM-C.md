# ADM-C fix round
Branch worktree-wf_ac368f43-134-7 commit baaf403 worktree D:\Claude\Bantay\.claude\worktrees\wf_ac368f43-134-7
Build status: partial
Builder exit claim: Lane ADM-C code and Playwright are done and green, but the lane is partial. The full vitest suite did not finish, and Records, Duplicates and recordsApi unit tests were not re-run after my last edits. All 16 existing and new e2e tests passed, tsc is clean, and 12 screenshots are committed.

## Review issues (pass_with_issues)
1. [major] 390px Queue: the Actions column (Fix button) is not visible at all. docs/session-9/shots/adm-c/queue-390-light.png shows headers Include/Item/Value/Check and no Actions header. Cause is this lane's new colgroup in src/features/admin/desk/records.css (.rc-qt table-layout: fixed; .rc-c1 76px + 30% + 30% + 20%): at ~342px content width the fixed columns use 350px, leaving the fifth column zero width while .dk-table is width:100%, so there is nothing for .dk-scrollx to scroll. The builder lists this under Q10 (out of lane), but the fixed-width colgroup is a lane change and Fix is a required admin action on phone. Not a blocker: the brief excluded Q10 card layout and all e2e targets/axe at 390 still pass.
2. [minor] Full `npx vitest run` exit 1: 3 failed / 2021 passed, all outside the lane (src/screens/SignIn.test.tsx 'five failures show the locked screen', src/features/family/family-ui.test.tsx 'lists the family with the latest I'm OK', src/features/nutrition/PlateSheet.test.tsx 'your own food saves with every number blank'). Rerun alone: 3 files, 51 tests passed, exit 0 - load flakes, not lane regressions.
3. [minor] labTag (src/features/admin/desk/recordsApi.ts) has unit coverage only for the High path (Queue.test.tsx: value 95, ref 0-90, no flag). The Low path, the unknown-value path (null, never Normal) and the no-range path are untested. The e2e fixture row l1 (e2e/admin-desk-records.auth.spec.ts:24) carries flag 'H' with value 95 inside range 0-100, so the e2e 'High' assertion exercises the flag shortcut, not the computed verdict.
4. [minor] Queue source-paper aside (recordsUi.tsx Preview) uses 60 s signed links; the aside is now always on screen while an admin works through a paper, so the image breaks after a minute with no refresh. Pre-existing in the Records panel, more exposed here.
5. [minor] Builder claim 'Records, Duplicates and recordsApi unit tests were not re-run' is now resolved: Queue/Records/Duplicates/recordsApi/ui test files ran together, 66 passed, exit 0.

## Builder needs
- Run the full `npx vitest run` and at minimum Records.test.tsx, Duplicates.test.tsx and recordsApi.test.ts (including the new error-state tests) on a quieter machine.
- Orchestrator: this worktree was cut from main a2f4e52, not claude/cache-ttl-cost-39e7cd. I fast-forwarded it to that branch (git merge --ff-only) before starting. The branch now carries wave 1 as intended.
- The Fix button on the 390px Queue is still cut off (audit Q10 card layout was not in this lane's list and was not done); the table scrolls sideways inside .dk-scrollx.

## Builder risks
- The edit panel labels for 'value_num' and similar columns changed from raw names to plain words (Value, Unit, Test...). Any other lane's tests that use getByLabel('value num') will break. I updated the Queue, Records and e2e specs only.
- FIELD_LABELS lives locally in recordsUi.tsx (Lane E may later move it to logsApi.ts and dedupe).
- labTag shows the printed flag first, then falls back to value against range via the shared position() and verdictFor('lab'). The synthetic e2e row (value 95, range 0 to 100, flag H) shows High because the flag wins. Unknown values or ranges give no tag, never Normal.
- Queue: the 'Confirm N checked' button moved into the sticky BulkBar and shows only while something is ticked (Confirm 0 checked no longer renders). Clicking a paper or focusing a row sets which paper's source pages show.
- A load error now keeps any list already on screen and shows an alert with Retry. After a load error the people-name hook can still show 'Unknown' until reloaded (existing behaviour).
- Source previews use 60 s signed links. Screenshots show a broken image only because the e2e mock has no real file.