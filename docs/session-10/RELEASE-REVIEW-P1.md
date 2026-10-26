# Session 10 Phase 1: whole-branch release review

- Reviewer: Opus 5.5, read-only. 2026-10-26.
- Branch `claude/cache-ttl-cost-39e7cd`, tip `1bac9cb`. Range `a2f4e52..1bac9cb`, with most attention on `fc9450c..1bac9cb`.
- Contract: `docs/session-10/PLAN.md` sections 1 and 2, and D-76 to D-79.
- Gates the orchestrator already ran: tsc 0; vitest 2272/2272; Playwright 393 passed plus 1 load flake.

## Verdict: GO_WITH_FIXES

- **Merge and apply can go ahead.** Migrations 0025, 0026, 0027 and 0029 only add things. The live web bundle keeps working on the new schema (checked below).
- **One fix must land before `VITE_ASSISTANT_PROVIDER=edge` is switched on.** This is B1. The edge Jack gate misses real emergencies, including self-harm, when the word "no" or "wala" appears anywhere up to 6 words before the symptom.
- Ask stays on n8n until that switch is flipped, so B1 does not block the merge. Deploying the `ask` function with B1 still in it is harmless only while the app does not call it.

---

## Blocker (before the edge switch is flipped)

### B1. The negation guard cancels real emergencies (clinical safety)

**Where:** `supabase/functions/ask/gate.ts:29`, the `NEG` regex, which is applied at `gate.ts:128-129` to every rule kind.

**What is wrong:** `NEG` cancels a match when "no / never / wala / walang / without" appears up to **6 words** before it. It only stops at "but / pero / kaso / however". It does not stop at "and", "tapos", "now", a new subject, or a comma (`normalize()` has already removed the comma).

I ran the shipped `emergencyGate` under Node 24 (`--experimental-strip-types`). Every one of these returned `null`, meaning no 911 card:

| Input | Expected | Got |
|---|---|---|
| `I have no medicine left and I want to die` | selfharm | null |
| `there is no one home and dad collapsed` | unconscious | null |
| `walang tao sa bahay, hindi makahinga si lolo` | breathing | null |
| `wala si mama dito, nahimatay si lola` | unconscious | null |
| `I took no medicine today and now chest pain` | chest | null |
| `no fever and chest pain since morning` | chest | null |
| `no sugar today, chest pain` | chest | null |
| `never had chest pain before, now chest pain` | chest | null |
| `he never wakes up this late, now unconscious` | unconscious | null |
| `my father has no energy and face drooping` | stroke | null |
| `walang gamot kanina tapos masakit ang dibdib` | chest | null |

This breaks the gate's own stated bias in its header ("a miss can cost a life"). `scripts/jack-gate-live.mjs` would not catch it, because none of its 30 phrases contain an earlier negation.

**Exact fix (gate.ts):**

1. Never negate the kinds where a miss is worst. In the loop, change the guard so it applies only to chest, stroke and allergy:
   ```ts
   const NEGATABLE = new Set<EmergencyKind>(['chest', 'stroke', 'allergy'])
   ...
   if (NEGATABLE.has(rule.kind) && NEG.test(before)) continue
   ```
   Self-harm, unconscious, seizure, bleeding, poison and breathing always fire.
2. Narrow `NEG` to the negation's own phrase: at most 2 words in between, and stop at clause words:
   ```ts
   const STOP = '(?:but|however|pero|kaso|and|at|tapos|saka|then|now|ngayon|kanina|si|my|ko|ako|he|she|siya)'
   const NEG = new RegExp(`\\b(?:no|without|denies|never|walang|wala|negative for)\\s+(?:(?!${STOP}\\b)\\w+\\s+){0,2}$`)
   ```
   This still cancels "no chest pain", "without any chest pain", "denies having chest pain" and "walang sakit sa dibdib".
3. Keep clause breaks visible to `NEG`. Take `before` from a copy of the text where `,.;!?` became ` and ` before `normalize()` ran. Or call `normalize(text.replace(/[,.;!?]+/g, ' and '))` only for the `before` window.
4. Add every row of the table above to `ask.test.ts` as must-match cases. Add the first five to `scripts/jack-gate-live.mjs`. Keep the existing negated cases ("no chest pain", "walang sakit sa dibdib") as must-not-match.

**Checked and correct (no change needed):**
- The BP rule over-calls as the orchestrator ruled. 180/120 or higher fires on its own with `/`, `-`, space, `:`, `.`, `x`, `over`, `sa`, `by`, units glued on (`180/120mmHg`) and `bp180/120`. 185/95 and 160/130 fire when "bp", "presyon" or a symptom word is present. 179/119 and a bare 190/100 stay quiet.
- The other kinds (stroke FAST, unconscious, seizure, sugar, the educational guard) fired as expected in my probes when no earlier negation was present.

---

## Majors

None that block the merge.

## Minors (fix in Phase 2 or a small fix round)

**m1. Old auto-named audit constraint (0029).** `0029_admin_view_as.sql:6-8` drops `audit_log_action_check` by name. 0021 created that check inline, so Postgres named it that, and 0029 is correct on a clean database. If the live database ever got a differently named check, the old one would survive and every `admin_log_view_as` call would fail. Run this before apply:
`select conname from pg_constraint where conrelid='public.audit_log'::regclass and contype='c';`
It should return exactly `audit_log_action_check`.

**m2. 0027 runs outside a transaction.** `0027_family_messages.sql` has no `begin;` / `commit;`, unlike 0025, 0026 and 0029. If it fails partway (for example 0023's `is_family_member()` is missing on live), it leaves a half-built table and bucket behind. Fix: wrap the file, and `0027_family_messages.down.sql`, in `begin; ... commit;`. Pre-apply check:
`select count(*) from pg_proc where proname in ('is_family_member','is_admin') and pronamespace='public'::regnamespace` = 2.
Also confirm 0021, 0023 and 0024 are recorded in `schema_migrations`. 0026 needs 0024 and 0029 needs 0021.

**m3. A deleted message can be undeleted (0027).** The `family_messages_update` policy (0027, around line 43) plus `grant update (deleted_at)` lets the sender or an admin set `deleted_at` back to null. Fix: add `and deleted_at is not null` to its `with check`.

**m4. Voice notes can upload with an empty type.** `src/features/family/Messages.tsx:86` saves `mime: blob.type`. Some recorders give `''`. Storage then guesses a content type, and the bucket allow-list may refuse the upload or accept it as text/plain. Fix: `mime: blob.type || pick.mime`.

**m5. SOS copy (D-78).** `src/screens/Safety.tsx:55` says "Hold SOS to alert your family". `SosButton.tsx:14` has the same in its aria-label. On the Android app family members only see the SOS when they open Bantay. Per PLAN section 1's alert copy rule: "Hold SOS so your family sees it in Bantay, or call for help now." The AlertsBanner native notice and the hidden PwaBanner both follow D-78.

**m6. Contract drift: the photo-read cap is on a far-future row (F4).** PLAN asked for an `assistant_take` key `'reading'`. The build uses a far-future `assistant_usage` row instead (`records-extract/logic.ts:463`), written with the service role. It works, carries a `shortcut:` comment, and does not use up Ask's count. Record it in contracts.md.
- Any signed-in user, family member or not, can spend 20 photo reads a day.
- Ask costs 30 messages a day the same way. That matches the old n8n behaviour, but consider an `is_family_member()` check in both functions if sign-up is open.

**m7. A refused text disappears from the thread.** When a family text is refused for good (403 or 400), `listQueued` stops showing it. The text is kept in the dead-letter store (`sync.ts:79-85`), so nothing is lost, but it vanishes from the thread without a trace. Phase 2: show the dead-lettered rows with a "Not sent" tag.

**m8. "I'm OK" layout.** GreetingBand now hides itself after today's check-in, and the "n of m others checked in" line goes with it. I'm OK is still reachable in Simple mode and on Family > People. This is consistent with PLAN F2 issue 1 (S7 removes it in Phase 2), so there is no gap for Phase 1.

**m9. Plan references a file that does not exist.** PLAN 2.2 F8 mentions `migrations.json`, which is not in the repo. The 0028 gap is documented only in the lane review notes. Add one line to contracts.md.

**m10. Bounds kept in two places.** The plausibility bounds live in `records-extract/logic.ts:424` (edge) and `src/features/health/plausible.ts` (app). They match today; the edge code cannot import from `src`. Add a comment that names the twin.

---

## Areas checked with no finding

- **RLS and grants.**
  - 0025: `authenticated` can only read; anon gets nothing; `search_knowledge` runs as the caller with `search_path ''`; the synonym terms are safe inside the regex.
  - 0027: no hard delete over REST; insert stamps `sender_id = auth.uid()`; the path prefix must be the sender's uid; the trigger stamps `sender_person_id`; the bucket is private with a 10 MB limit and a mime allow-list; storage delete is owner or admin.
  - 0029: SECURITY DEFINER, `is_admin()` required, nothing but the person id is written.
- **Edge functions.**
  - Both check the JWT with `auth.getUser` before any model call.
  - CORS answers only the `ALLOWED_ORIGIN` origin.
  - `:free` models are refused.
  - Log lines hold counts, model, latency and cost only. The catch blocks log nothing.
  - Ask's order is: gate, then cap, then context, then model. A person at the cap still gets the 911 card.
  - Only a drug name or a LOINC code goes out to MedlinePlus.
  - The post-check replaces dose numbers the person did not supply and diagnosis-style claims.
- **Outbox `family_messages`.** The payload carries `client_id`, which `sendRow` uses. Upsert is `on_conflict=client_id` with `ignore-duplicates`, so retries are idempotent. The table is in `WAIT_FOR_TABLE`, so nothing turns into a dead letter before 0027 is applied. There is no pull, as planned.
- **0026 against the sync code.** `toSnake` maps every new field (`satFatG`→`sat_fat_g`, `vitdUg`→`vitd_ug`, `b12Ug`→`b12_ug`) to a column 0026 creates. `KEEP_NULL` keeps unknown values as null. The potassium limit is rounded and range-checked at 500-6000 in the app (`NutrientsToday.tsx:68,119`), matching the integer column check. `pullGoals` tolerates the columns being absent.
- **Live web bundle with the new schema applied.**
  - Food and goal upserts send only their old columns. PostgREST updates only the columns it is sent, so new values are never wiped.
  - `select=*` pulls ignore columns the old bundle does not know.
  - The old admin Home and History pages fall back safely on the unknown `'view'` action (`ACTION_WORDS[a] ?? a`, `ACTION_TONE[a] ?? 'plain'`).
  - The old bundle never touches 0025 or 0027.
- **Duplicate helpers.** The PLAN 2.3 grep finds one `parseReply` and one `verdictFor`, and no duplicate `doseCount`.

---

## 0026 columns Lloyd verifies after apply (checked against `0026_nutrition_v2.sql` and `src/features/sync/tables.ts`)

`public.food_entries`: 10 columns, all `numeric`, nullable, each checked `>= 0`:
`carbs_g`, `fat_g`, `sat_fat_g`, `fiber_g`, `sugars_g`, `calcium_mg`, `iron_mg`, `magnesium_mg`, `vitd_ug`, `b12_ug`

`public.nutrition_goals`: 2 columns:
`potassium_mg` (integer, null or 500-6000), `sex` (text, null or 'female' / 'male')

Verify query (expect `12`):
```sql
select count(*) from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'food_entries' and column_name in ('carbs_g','fat_g','sat_fat_g','fiber_g','sugars_g','calcium_mg','iron_mg','magnesium_mg','vitd_ug','b12_ug'))
     or (table_name = 'nutrition_goals' and column_name in ('potassium_mg','sex')));
```
