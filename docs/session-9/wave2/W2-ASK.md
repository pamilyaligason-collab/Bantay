# W2-ASK fix round
Branch worktree-wf_ac368f43-134-4 commit 9c07e92 worktree D:\Claude\Bantay\.claude\worktrees\wf_ac368f43-134-4
Build status: done
Builder exit claim: Ask is now 'Scan & Capture'; after the first photo the person picks Paper or Device reading; device photos go to the new records-extract reading mode and come back as nullable numbers shown big to confirm or edit before saving through logReading. Server request, schema, null handling, client conversion and confirm screen are tested; nothing deployed.

## Review issues (pass_with_issues)
1. [major] Name collision with existing vital code: src/features/scan/reading.ts saves temperature as test 'body_temp', but src/features/health/vitals.ts VITAL_TESTS uses 'temperature' (and 'spo2'). A temperature captured from a thermometer photo therefore lands in LabsList (!isVital) and is left out of LatestList / family report vitals, with no label in model.ts. Rename to 'temperature' (one-line fix in reading.ts + reading.test.ts). 'spo2' matches.
2. [major] Audit incomplete at forced cut-off: `npx tsc --noEmit` re-run in the builder worktree -> exit 0 (confirmed). Full `npx vitest run` was still running; its interim output showed one failure in src/features/family/family-ui.test.tsx ('lists the family with the latest I'm OK ...', not a lane file, likely time-based flake) - orchestrator must rerun that file alone and quote both results before merge. Playwright (PW_PORT=5430, scan + ask-sheet specs) was NOT re-run by the auditor; builder's 24-passed claim is unverified, and the builder admits the auth project never ran.
3. [minor] Brief asked for 'usage logged as counts only'; index.ts reading branch logs only {fn,mode,ok} (no token counts). Consistent with the existing paper path (which logs no usage either) and B-7-safe, but the brief item is unmet.
4. [minor] normalizeReading keeps values when confidence is absent/unparseable (confidence null is treated as 'not low'); only confidence < 0.5 empties fields. Brief says low or missing -> null; a model reply with no confidence field still pre-fills numbers (the person still confirms, and the test documents the choice explicitly).
5. [minor] Plausibility ranges (bp 40-300, glucose 20-800, weight 2-400, pulse 20-250) are duplicated in reading.ts and logic.ts instead of reusing readingPreview.ts SPECS; temp 30-45 C / spo2 50-100 are new bounds with no citation and CLINICAL-REVIEW.md not updated (builder states they are plausibility bounds, not clinical rules).
6. [minor] Confirm screen shows 'For Me' twice (chip row in ScanFlow plus the line in ReadingConfirm); screenshots confirm. Also only 390x844 shots for choose/confirm/empty; crop.png/form.png are paper-flow leftovers in the lane dir.
7. [minor] Reading mode has no per-user rate cap (auth only) and is routed purely by body size > 2048 chars; builder documented both. No secrets found in the diff; no live changes applied (commit 9c07e92 on worktree branch only). Server and client tests use hand-computed expected values (5.6 mmol/L -> 100.9, 137 lb -> 62.1 kg, 98.6 F -> 37 C verified by hand); null/0 handling tested on both sides.

## Builder needs
- Orchestrator: redeploy records-extract (--no-verify-jwt as today) after merge; no new secret, no migration
- Orchestrator: confirm W2-JACK does not touch Assistant.tsx lines 306/309 (chip and camera labels) or AskSheet.tsx

## Builder risks
- Reading mode has no per-user rate cap (auth only); a signed-in member could call it repeatedly, each call costs one small vision request. A cap needs a table or migration (not in my lane)
- Reading mode is routed by body size (>2048 chars); a photo under about 1.5 KB would be rejected as bad_input (never a real photo)
- temp and spo2 save as test codes body_temp and spo2; no GUIDE range exists for them so they show no range (nothing guessed); the clinical review doc has no new rule so was not edited
- Screenshots only at 390x844 light and dark for the choose, confirm and empty states; the shipped confirm screen shows For Me twice (chips plus a line)
- Not run against a live model: the real prompt and reasoning:{enabled:false} param are unverified with OpenRouter
- The full playwright config's second (auth) web server timed out building on this loaded PC, so I ran the chromium project against a hand-started preview; the auth project was not run