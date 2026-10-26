# W2-JACK fix round
Branch worktree-wf_ac368f43-134-5 commit d9ad15c worktree D:\Claude\Bantay\.claude\worktrees\wf_ac368f43-134-5
Build status: done
Builder exit claim: The ask edge function (gate, cap, context, OpenRouter with fallback, post-check) and the VITE_ASSISTANT_PROVIDER switch are written and committed as d9ad15c; tsc passes and 162 targeted tests pass. The full vitest run had 2 unrelated failures that passed on rerun alone. Nothing was deployed, and nothing was run against live OpenRouter, Supabase or MedlinePlus.

## Review issues (pass_with_issues)
1. [major] supabase/functions/ask/index.ts:27 meds reader filters status='confirmed' and med_status='active' but not deleted_at is null. Medication delete in the app is a soft tombstone (src/features/health/medActions.ts:9 sets deleted_at only; migration 0014 keeps tombstones). A deleted medicine is therefore listed as 'Medicines now' in the prompt sent to OpenRouter, its dose numbers are whitelisted in the post-check, and its name can trigger a MedlinePlus lookup. dose-watch/index.ts:48 shows the house convention (.is('deleted_at', null)). Fix: add .is('deleted_at', null) to the ask meds query. No test covers this because the Reader is mocked.
2. [minor] Builder's full-suite claim (2 failures, exit 1, rerun exit read through a pipe) is not reproducible: bare `npx vitest run` in the worktree exited 0 with 198 files / 2119 tests passed. Treat the earlier failures as flaky; nothing to fix.
3. [minor] Gate lets a bare '300' sugar line through only with symptoms, and the brief's thresholds are hand-computed in tests (e.g. 'my sugar is 55' -> null, 'bp 150/125 dizzy' -> bp): fixtures assert expected clinical outcomes, not code echo. However the BP regex `\bsa\b` alternation inside a group (`(?:\/|over|\bsa\b|\bby\b)`) accepts 'presyon 180 sa 120' as intended but also any '120 sa 80' phrase that is not a BP; harmless (symptom word still required) but unreviewed.
4. [minor] docs/ASSISTANT.md claims 'Tests: Deno tests' parity in spirit but the brief asked for Deno tests; vitest is used (repo pattern, consistent with _shared/*.test.ts). Documented by builder; acceptable, orchestrator should accept or ask for a deno test shim.
5. [minor] README.md env table not updated for VITE_ASSISTANT_PROVIDER (builder flagged it as outside lane files). Orchestrator should add one row when merging.
6. [minor] Secret scan: no key material in the lane's files (grep for sk-or-, eyJhbGci and OPENROUTER_API_KEY in supabase/functions/ask hit only the doc comment naming the variable). No live system was touched: diff is confined to the 9 listed files, no migration added, nothing deployed.

## Builder needs
- Worktree started at main a2f4e52; I fast-forwarded it to claude/cache-ttl-cost-39e7cd so migration 0025 and the research docs are present. The orchestrator should merge from that base.
- Lloyd secrets for deploy: OPENROUTER_CHAT_KEY (separate key with spend limit), ALLOWED_ORIGIN; optional OPENROUTER_CHAT_MODEL / OPENROUTER_CHAT_FALLBACK. Deploy with --no-verify-jwt. Needs migration 0025 applied (without it the knowledge read returns empty and answers still work).
- Build env to flip: VITE_ASSISTANT_PROVIDER=edge (default n8n).
- Clinician and native Tagalog/Bisaya review of the gate phrases, thresholds, cards and post-check word list (added to docs/session-8/CLINICAL-REVIEW.md).
- Live check that OpenRouter accepts reasoning {effort:'none'} on both default models; fall back to {enabled:false} if not.
- Optional app follow-up (JACK-D): render reply.emergency (one-tap call 911/1553) and reply.sources chips; the current app ignores both.

## Builder risks
- Emergency gate runs BEFORE the daily cap (deliberate deviation from the brief order) so a capped user still gets the 911 card and no slot is used.
- Gate is heuristic and phrase-based; Cebuano and Taglish coverage is unreviewed and the 300 mg/dL sugar line is an app rule with no public source. Bare 'stroke' / 'heart attack' in a plain 'what is' question goes to the model, not the card.
- Tests are vitest (repo's pattern for functions), not deno test; no live OpenRouter, Supabase or MedlinePlus call was made, so RLS reads, search_knowledge via rpc and the Connect response shape are untested live.
- MedlinePlus meds lookup uses the medicine name (RxNorm name search) because the medications table has no RxNorm code; labs use LOINC from test_catalog. Cache is per-isolate memory, so no 0028 migration was written.
- No Playwright run or screenshots: no UI changed and e2e/assistant.spec.ts only runs with the n8n build flags. README env table was not edited (outside lane files).