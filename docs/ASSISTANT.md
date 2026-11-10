# Ask Bantay (assistant chat)

Floating button (bottom right, above the tab bar) opens a sheet. The app posts the last 10 messages and the screen name to an n8n webhook, which checks the Supabase login, enforces a daily cap, and asks OpenRouter. Replies can carry tool calls. The app turns them into cards. Nothing is saved until the user taps Confirm.

## App

- Env: `VITE_ASSISTANT_URL` (n8n production webhook URL, set at build), optional `VITE_ASSISTANT_DAILY_CAP` (default 30), optional `VITE_KIWIX_URL`.
- Sends `Authorization: Bearer <Supabase access token>` from `getAccessToken()` (`src/features/auth/session.ts`) when signed in.
- Client cap: 30 per Asia/Manila day, kept in Dexie kv `assistant.cap`. A reached cap never calls the server.
- Tools: `log_reading`, `log_med_taken`, `log_activity` (draft cards, Confirm / Edit / Discard, only Confirm calls `src/features/log/store.ts`), `open_screen`, `explain_term` (source link built in the app), `whats_the_weather` (Open-Meteo in the browser, no key).
- Nothing is logged to the console. No health values appear in any notification.

## Server (ops/n8n/assistant.json, inactive until reviewed)

Webhook -> verify JWT (`GET {SUPABASE_URL}/auth/v1/user`, 401 if invalid) -> daily cap via RPC (429 if over) -> OpenRouter -> normalize -> respond.

- Credential (HTTP Header Auth, name exactly `Bantay OpenRouter ZDR`): header `Authorization`, value `Bearer <OpenRouter key>`. Created in n8n only.
- Credential (HTTP Header Auth, name exactly `Bantay Supabase publishable`): header `apikey`, value the Supabase publishable key. Used by the JWT check and the cap RPC. The Supabase URL (`https://wuakimpssycbtnmoexuc.supabase.co`) is written in the two HTTP nodes. No n8n env vars are read.
- Replace `https://REPLACE-WITH-APP-ORIGIN` in the Webhook node (Allowed Origins) with the app origin.
- A daily slot is used even if the model call fails. If the cap RPC gives no answer (misconfigured), the webhook returns 503 `{error:'unavailable'}` and the app shows the generic failure message.
- Models (n8n workflow only; the edge function runs the router below and has them the other way round: fast `anthropic/claude-haiku-5.5`, fallback `google/gemini-3.5-flash-lite`): `google/gemini-3.5-flash-lite`, fallback `anthropic/claude-haiku-5.5` (checked on OpenRouter 2026-10-17). Provider `{zdr:true, data_collection:'deny'}`. No `:free` model ever.
- Execution data: success, error and manual saving are all off, so prompts never sit in n8n. The workflow does not log bodies.
- OpenRouter: in the OpenRouter UI set a hard monthly spend limit on this key (the owner), and turn on the account-wide ZDR-only setting.

### Supabase

The `assistant_usage` table and `assistant_take(int)` function live in `supabase/migrations/0005_news_assistant.sql` (security definer, pinned search_path, Asia/Manila day, execute only for `authenticated`). Applied by the owner after review, not by this repo.

## Safety rules (system prompt)

No diagnosis, no dosing beyond what the family logged, urgent means 911 or the doctor, never claims earthquake or local tsunami warnings (B-1, B-6).

## Ask on a Supabase edge function (`supabase/functions/ask`, not deployed)

Replaces the n8n workflow so Bantay no longer runs anything on the Alfred VPS (B-9). The app request and reply are unchanged: `POST {messages, screen}` -> `{reply, tool_calls}`; 401 `{error:'unauthorized'}`, 429 `{error:'limit'}`, 503 `{error:'unavailable'}`, 400 `{error:'bad_input'}`. New optional reply fields the current app ignores: `sources: [{title,url}]` (for "From MedlinePlus" chips) and `emergency: {kind, call:['911'|'1553']}` (for a one-tap call button).

### Switch (default stays n8n)
- `VITE_ASSISTANT_PROVIDER` = `n8n` (default) or `edge`. `edge` posts to `${VITE_SUPABASE_URL}/functions/v1/ask`; otherwise `VITE_ASSISTANT_URL` is used as before. The owner flips it at build time. Roll back by unsetting it; keep the n8n workflow inactive for 2 weeks.
- Deploy with `--no-verify-jwt` (the function checks the JWT itself, like records-extract). Secrets: `OPENROUTER_CHAT_KEY` (its own key with a spend limit; NOT `OPENROUTER_API_KEY`, the scan key), `ALLOWED_ORIGIN`; optional `OPENROUTER_FAST_MODEL` (default `anthropic/claude-haiku-5.5`; the old name `OPENROUTER_CHAT_MODEL` still works), `OPENROUTER_STRONG_MODEL` (default `anthropic/claude-sonnet-5.5`), `OPENROUTER_CHAT_FALLBACK` (default `google/gemini-3.5-flash-lite`), `ASSISTANT_MONTHLY_CAP_USD` (default 10). A `:free` model id makes the function answer 503. Router and spend: see "Jack router" below.
- Needs migration 0025 (`search_knowledge`). Without it the knowledge read returns nothing and the answer still works.

### Flow
1. Verify the JWT (`auth.getUser`), else 401.
2. Body checks: last 10 messages, 1000 characters each, last one must be the person's, screen enum (same as n8n "Build request"), else 400.
3. Emergency gate (`gate.ts`): fixed English / Tagalog / Taglish (and a few Cebuano) phrases, plus a BP reading (rule below) and sugar below 70 or above 300 with a symptom. A match returns the 911 card (self-harm: NCMH 1553 and 911) with no model call. **It runs before the daily cap, which differs from the n8n order**: a person at the limit still gets the card, and no slot is used.
4. Daily cap: the existing `assistant_take(30)` RPC as the user. 429 over the cap, 503 if the RPC gives no answer.
5. A language that is not Latin script gets a fixed "English or Tagalog" reply (no model call).
6. Context, in parallel and never fatal: `search_knowledge(q, 3)`; the user's own confirmed active medicines, five newest confirmed labs and confirmed allergies, read with the user's JWT so RLS applies (only the user's own person row, `people.auth_user_id`); MedlinePlus Connect (free, no key) for at most 2 items the question names: a medicine on their list by name (RxNorm name search) or a lab test by LOINC from `test_catalog`. Only a drug name or a LOINC code leaves; cached 12 h in memory. No 0028 cache table was needed.
7. Router (below) picks the model and token limit. OpenRouter: the picked model (20 s fast, 25 s strong), then the fast model, then the fallback (15 s each), else 503. `provider {zdr:true, data_collection:'deny', require_parameters:true}`, `reasoning {effort:'none'}`, `max_tokens` 600 fast / 900 strong / 300 over 90% of the cap, `temperature 0.2`, `usage {include:true}` (so OpenRouter returns the cost), the same 6 tools. The call's cost is then added to this month's spend.
8. Post-check, sentence by sentence: a dose number (mg, mcg, ml, IU, units, tablets, drops, puffs, and number words with tablets) that is not in the person's records, their own messages or the vetted reference text becomes "Please ask your doctor or pharmacist about the dose."; "you have / this is / may diabetes ka" plus a condition word becomes "I cannot say what condition this is. Please ask your doctor."; emdashes removed; "Not medical advice; ask your doctor." added (Tagalog, or both, for Tagalog / Taglish). Card-only replies get no text.

### Jack router (D-177, `router.ts`)
A pure function (`route()`, tested in `router.test.ts`) picks the model per question after the context is read.
- **Fast** (`OPENROUTER_FAST_MODEL`, Haiku 5.5, $0.10 / $0.50 per MTok): greetings, short chat, "open this screen", weather, logging.
- **Strong** (`OPENROUTER_STRONG_MODEL`, Sonnet 5.5, $2 / $10 per MTok on the OpenRouter list read 2026-11-09; Opus 5.5 is $4 / $20 and was not chosen): any question that touched a medicine or lab the person has, any REFERENCE hit, a health question while records are on file, health words with a "why / explain / compare / should I" shape, a question over 280 characters, or a thread of more than 6 messages.
- **Spend** (the `assistant_spend` table, migration 0062; USD per Manila month, written only by the service role from the function, from OpenRouter's `usage.cost`; when that is missing a high per-token estimate is added, never 0). Below 70% of `ASSISTANT_MONTHLY_CAP_USD`: route by task. 70% to 90%: fast model only. Over 90%: fast model and 300 max tokens. Spend unknown (no service key, no table, read error): fast model only. The cap is a steering number only; nothing is blocked. The emergency card runs before all of this and never reads or writes spend.
- **Set the OpenRouter key limit to $10 per month** in the OpenRouter UI (the owner); `ASSISTANT_MONTHLY_CAP_USD` is the same number so the router steps down before the key stops.
- Failure chain: strong, then fast, then the fallback (each once).
- The log line gains `tier` (fast or strong). Still no message text (B-7).

### Prompt (D-177)
Personal family use: the person asking is a family member or carer. Jack answers first, then gives context and practical steps, with no opening refusal or reflexive "I am not a doctor"; general medical explanation is allowed (what a condition, lab or medicine is, common causes, what high or low usually means, usual side effects, what to ask the doctor, home steps). It may use general knowledge beyond the REFERENCE and RECORDS blocks when it says so and invents no numbers. Unchanged on purpose: the emergency gate and the 911 / 1553 cards (code, not prompt), no diagnosis of the person, no medicine start / stop / change, no dose beyond what is logged or printed (also enforced by the post-check below), urgent means 911, tools make drafts only. Scan and Hold-for-help are separate and untouched.

### Tool parity with the n8n workflow
All 6 tools are offered with identical definitions: `log_reading`, `log_med_taken`, `log_activity` (drafts), `open_screen`, `explain_term`, `whats_the_weather`. In n8n none ran on the server either: the model returned `tool_calls` and the app drew the cards and saved only on Confirm. The edge function does the same (unknown tool names and bad JSON arguments are dropped, as in "Normalize reply") and also runs the post-check on `explain_term` answers. The app also understands `add_task` and `records_answer`, which the n8n workflow never offered; they are still not offered.

### Logs (B-7)
One line per request: status, emergency kind, language, model id, fallback yes/no, latency ms, knowledge + MedlinePlus hit count, token counts, cost. Never a message, reply, value, name, tool argument or snippet.

### Tests
`supabase/functions/ask/ask.test.ts` (vitest, node, the repo's pattern for functions): gate (positives in English, Tagalog, Taglish and near-misses), request checks, cap, fallback, context assembly, MedlinePlus cache, post-check, tool whitelist. Run `npx vitest run supabase/functions/ask`.

### Deploy steps for the router (owner; secret names only, never values)
1. Apply migration `0062_assistant_spend.sql` (say "apply 0062"). Undo: `0062_assistant_spend.down.sql`.
2. In OpenRouter set the monthly limit on the chat key to $10 and keep account-wide ZDR-only on.
3. Function secrets (all optional): `OPENROUTER_FAST_MODEL`, `OPENROUTER_STRONG_MODEL`, `OPENROUTER_CHAT_FALLBACK`, `ASSISTANT_MONTHLY_CAP_USD`. `SUPABASE_SERVICE_ROLE_KEY` is provided by the platform; without it the router stays on the fast model.
4. Deploy `ask` with `--no-verify-jwt`, then run `node scripts/jack-gate-live.mjs` (below).
5. The app still posts to the n8n webhook by default. To use this function set `VITE_ASSISTANT_PROVIDER=edge` at build time (needs `VITE_SUPABASE_URL`). Unset it to roll back.

### Not done / for the owner
- Review of the gate phrase list and the Cebuano phrases (docs/session-8/CLINICAL-REVIEW.md, "Ask edge function").
- Live check that OpenRouter accepts `reasoning {effort:'none'}` for both models; if not, use `{enabled:false}`.
- Privacy notice line: the assistant processes data abroad (RA 10173).


### Gate check against the deployed function
Every answer from the ask handler carries `x-bantay-model-called: 0|1` (0 for the emergency card, the language refusal and body errors; 1 once a model was called, including a failed model attempt that returned 503). The preflight, the unconfigured 503 and the outer-catch 503 carry no header. After a deploy run `node scripts/jack-gate-live.mjs <ask-url> <jwt>` with a test user JWT: it posts 30 emergency phrases (10 English, 10 Tagalog, 10 Taglish/Cebuano) and exits 1 unless every reply has `emergency.call` containing `911` and the header `0`. The same phrases are asserted offline in `supabase/functions/ask/ask.test.ts`. BP rule (a false alarm is cheaper than a missed emergency): two numbers shaped like a reading, joined by `/`, `-`, `:`, a space, `over`, `sa`, `by` or `x`. At 180/120 or more (both numbers) that is an emergency on its own ("190 sa 120", "200 by 130", "bp 180-120"). Lower readings (systolic 180 or more, or diastolic 120 or more, not both) need a symptom word or `presyon`, `bp` or `blood pressure` anywhere in the message; so "sugar 190 sa 120 dizzy" shows the card, an accepted false alarm. Numbers below that with no symptom and no label stay quiet: dates (10/26), prices (150 sa 200 pesos), sizes, times, and 179/119 or 180/119 on their own.
