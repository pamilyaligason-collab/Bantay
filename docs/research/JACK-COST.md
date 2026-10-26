# Jack (Ask) cost: where the money goes, and how to make it cheaper

Date: 2026-10-22. This is a read-only study: no code changes, no installs, no SSH, no production queries. The code was read from `origin/main`.
Tags: **[V]** checked against a source today. **[E]** my estimate from first principles. **[U]** not verified; check before relying on it.
Prices are per 1M tokens, taken from OpenRouter's live catalog (`/api/v1/models`, `/api/v1/models/<id>/endpoints`, `/api/v1/endpoints/zdr`) on 2026-10-22.

## Verdict (read this first)

1. **Lloyd's belief is wrong on both counts. Image processing does not dominate.**
   - **Inside one scan:** the image is about 10% of the cost. About 90% is the JSON the model writes back, billed at the output price (thinking tokens are billed as output too). A Gemini 3 image costs a flat 1,120 input tokens, about $0.00034 per page. The output for a lab page is about $0.0035.
   - **Across the app:** at family volume, Talk to Jack (chat) costs more per month than scanning.
2. **The whole thing costs about $1 a month today [E].** Near the daily caps the worst case is about $12. Nothing logs tokens or cost anywhere, so these numbers are estimates until Phase 0 measures them.
3. **The biggest saving needs no new system: make Haiku 5.5 the primary model.** On OpenRouter `anthropic/claude-haiku-5.5` costs **$0.10 in / $0.50 out**. The current primary, `google/gemini-3.5-flash-lite`, costs **$0.30 in / $2.50 out**, so the fallback is 3 to 5 times cheaper than the primary. Two conditions:
   - Run an accuracy check on real papers first (Phase 0).
   - Set `reasoning: {effort: 'minimal'}` and a `max_tokens` cap on extraction.
   - **Expected result:** about $0.25 a month realistic and about $3 worst case, a drop of about 75%.
4. **On-device OCR (ML Kit text recognition) is free and works, but saves almost nothing by itself.**
   - **Why:** OCR text for a lab page is about as many input tokens as the image, and output tokens are the cost.
   - **When it pays:** only when paired with a text-only model such as `deepseek/deepseek-v4-flash` (ZDR at about $0.09 / $0.18). That saves about $0.30 a month at most.
   - **Recommendation:** park it. Build it only if Lloyd wants offline capture or an instant on-device preview, not to save money.
5. **"Zero" with health data is not available on hosted free tiers.**
   - The Gemini API free tier trains on inputs and says not to send personal data.
   - OpenRouter `:free` models are refused in code for that reason.
   - **The only truly free routes:**
     - Self-hosting (slow on the shared CPU VPS, and real work).
     - Cloudflare Workers AI's 10k-neuron daily allocation (it does not train on content, but the models are weaker).
   - At about $1 a month, neither is worth what it costs to build.

## 1. Cost map (what calls a model)

| # | Surface | Code | Model chain | Input | Output cap | Retries |
|---|---|---|---|---|---|---|
| 1 | Talk to Jack (chat) | `ops/n8n/assistant.json`, node "Build request" | `models: [gemini-3.5-flash-lite, claude-haiku-5.5]`, `provider {zdr:true, data_collection:'deny', require_parameters:true}` | Text only: a system prompt of 1,590 chars, 6 tools as 2,359 chars of JSON, the screen name, and the last 10 messages of at most 1,000 chars each. **[V]** | `max_tokens: 600` **[V]** | None in n8n (30 s timeout). OpenRouter falls back to the second model on error. A daily slot is used even when the call fails. **[V]** |
| 2 | Scan a paper / Upload (phone) | `supabase/functions/records-extract/{index,logic}.ts` | Default `gemini-3.5-flash-lite`, fallback `claude-haiku-5.5` (secrets `OPENROUTER_MODEL` / `OPENROUTER_FALLBACK_MODEL`). `:free` is refused. **[V]** | **Images** (JPEG from the ML Kit document scanner, or the web crop at a 2,000 px long edge and quality 0.82: `src/features/scan/crop.ts`), or one **PDF sent as a file**. All pages go in one request, up to 10 pages and 20 MB. Prompt is about 1,050 chars. **[V]** | **None set.** No `max_tokens`, no `reasoning` setting. **[V]** | `withRetry`: 3 tries on 429 / 5xx with backoff 2 s, 4 s. The cron sweep re-reads a scan up to 3 runs (`too_many_tries`). **[V]** |
| 3 | Laptop import | `scripts/records-import.ps1` -> `scripts/import/extract.mjs` + `lib.mjs` | Same two models, set in the ps1 **[V]** | A PDF with a real text layer (120 or more letters/digits, read by pdf.js) goes as **text**. Anything else goes as an image or PDF file (vision). **[V]** | None set **[V]** | 5 tries on 429 / 5xx **[V]** |

**Token or cost logging: none.**
- `records-extract` logs document id, status, page count and row counts (B-7).
- n8n has execution saving turned off.
- `assistant_usage` (0005) counts calls per user per day, not tokens.
- `usage_events` (0015) holds UI events.
- OpenRouter now returns `usage` with `cost` in every response by default, but the code throws it away (`sendToOpenRouter` keeps only `choices[0].message.content`). **[V]** https://openrouter.ai/docs/use-cases/usage-accounting
- The only place spend is visible today is the OpenRouter Activity page for the key. All three surfaces share one key (README "the same paid key as the laptop import"), so it cannot be split by surface.

### Prices that matter (OpenRouter, 2026-10-22) [V]

| Model | In / out per 1M | ZDR endpoints (from `/endpoints/zdr`) | Images |
|---|---|---|---|
| `google/gemini-3.5-flash-lite` (current primary) | $0.30 / $2.50, reasoning billed at $2.50 | Vertex only: global $0.30/$2.50, **global/flex $0.15/$1.25**, eu/us $0.33/$2.75. AI Studio is **not** ZDR. | yes |
| `anthropic/claude-haiku-5.5` (current fallback) | **$0.10 / $0.50**, cache read $0.01 | Vertex and Bedrock (Anthropic-direct is not on the ZDR list) | yes |
| `google/gemini-3.1-flash-lite` | $0.25 / $1.50 | Vertex (flex $0.125/$0.75) | yes |
| `google/gemini-2.5-flash-lite` | $0.10 / $0.40 | **no ZDR endpoint**: `zdr:true` would make it unroutable | yes |
| `deepseek/deepseek-v4-flash` | from $0.09 / $0.18 (DeepInfra ZDR) | DeepInfra, Parasail, SiliconFlow, Venice, Azure and others | **text only** |
| `openai/gpt-5-nano` | $0.05 / $0.40, reasoning model | Azure | yes |
| `mistralai/mistral-small-2603` | $0.15 / $0.60 | `mistral/zdr` | yes |
| `google/gemma-4-26b-a4b-it` | about $0.07 / $0.30 | several | yes |

**How images are counted:**
- **Gemini 3 family:** 1,120 tokens per image and 560 per PDF page when `media_resolution` is unset. Google says OCR quality "typically saturates at medium" (560). **[V]** https://ai.google.dev/gemini-api/docs/media-resolution
- **`gemini-3.5-flash-lite` thinking:** on by default at "minimal". Thinking tokens are billed as output. **[V]** https://ai.google.dev/gemini-api/docs/thinking
- **OpenRouter reasoning settings:** OpenRouter accepts `reasoning: {effort: 'minimal' | 'none' | ...}`, maps it to Gemini `thinking_level`, and bills reasoning as output. **[V]** https://openrouter.ai/docs/use-cases/reasoning-tokens
- **Claude:** about (width × height) / 750 tokens, and a page is resized to about 1.15 MP, so about 1,500 tokens per page. **[U]** for Haiku 5.5 specifically.

### Per-call estimates [E]

Assumptions:
- About 4 characters per token.
- A lab page has about 20 rows, and each test object is about 60 tokens of JSON. That gives about **1,400 output tokens**, plus about 100 minimal-thinking tokens.
- A prescription page is about 500 output tokens.
- A chat turn has a fixed prefix of about 1,100 tokens plus about 500 of history, about 1,600 input in all, and about 150 reply plus about 100 thinking, so about 250 output.

| Call | Gemini 3.5 flash-lite (today) | Haiku 5.5 | OCR text -> DeepSeek v4 flash |
|---|---|---|---|
| Lab page | in 1,450 × $0.30 = $0.00044; out 1,500 × $2.50 = **$0.00375**; **total ≈ $0.0042** (image ≈ 8%) | in ≈ 1,850 × $0.10 = $0.00019; out 1,400 × $0.50 = $0.0007; **≈ $0.0009** | in ≈ 1,500 × $0.09 + out 1,400 × $0.18 ≈ **$0.0004** |
| Prescription page | ≈ $0.0017 | ≈ $0.0004 | ≈ $0.0002 |
| Chat turn | 1,600 × $0.30 + 250 × $2.50 ≈ **$0.0011** | 1,600 × $0.10 + 250 × $0.50 ≈ **$0.0003** | n/a (tools needed) |

**Monthly cost for about 10 people [E]:**

| | Chat | Scans | Total |
|---|---|---|---|
| Realistic: 5 active members, 5 turns a day (750 turns); 50 scanned pages | $0.83 | $0.21 | **≈ $1.05** |
| Worst case: all 10 at the 30-a-day cap (9,000 turns); 300 pages | $9.90 | $1.26 | **≈ $11** |
| One-off laptop backlog of 1,000 vision pages | | ≈ $4.20 once | |

**Conclusion:**
- Output tokens dominate every call.
- The chat volume cap (`assistant_take(30)`) is the real cost ceiling.
- The scan image is a rounding error.
- Prompt caching does not help: the fixed chat prefix is about 1,100 tokens, which is below the minimum cacheable length (about 2,048 or more for Haiku models, and Gemini implicit caching needs 1,024 or more) **[U]**. Family traffic is also too sparse to keep a cache warm.

## 2. The image part: free or near-free options, ranked

The criteria for health data: no training on our data, a GPL-3.0-compatible licence or use as a service, and good handling of printed PH lab results, prescriptions and IDs.

| Rank | Option | Licence | Runs where | Privacy | Fit for PH papers | Speed | Cost |
|---|---|---|---|---|---|---|---|
| 1 | **Keep vision, switch the model to Haiku 5.5** (or Gemini on Vertex `flex`) | service | OpenRouter ZDR | ZDR, deny collection | Same contract and same tests. Accuracy on handwriting needs checking. | same as today | ≈ $0.0009 / page |
| 2 | **ML Kit Text Recognition v2** via `@capacitor-mlkit/text-recognition` 8.2.1 | Apache-2.0 (plugin) **[V]**, ML Kit is a Google SDK binary | on the phone, offline | nothing leaves the phone | Latin script; **Filipino `fil`/`tl` is supported** **[V]**. Printed text is strong; it returns blocks/lines/words with boxes. **No confidence field exposed by this plugin** **[V]**. Handwriting is not supported (not mentioned in the docs) **[U]**. Tables come back as loose lines, so rows must be rebuilt from the boxes. | about 0.2–1 s / page **[E]** | $0 + a few MB of APK |
| 3 | Apple Vision (iOS) | OS API | on the phone | on-device | good printed text, some handwriting **[U]** | fast | $0. The iOS app is not the target today |
| 4 | PaddleOCR PP-OCRv5 / PP-StructureV3 (tables), PaddleOCR-VL | Apache-2.0 **[V]** | a self-hosted box | on our box | strong on printed text and tables **[U]** | about 1–3 s / page on CPU for OCR; VL is much slower **[E]** | VPS CPU |
| 5 | docTR | Apache-2.0 **[V]** | a self-hosted box | on our box | good printed text, no tables | about 1–5 s / page CPU **[E]** | VPS CPU |
| 6 | Granite-Docling-258M / SmolDocling | Apache-2.0 **[V]** | a self-hosted box | on our box | page to structured markup including tables | about 10–60 s / page CPU **[E/U]** | VPS CPU |
| 7 | Tesseract.js 7 in the WebView | Apache-2.0 **[V]**, has `tgl` traineddata | on the phone | on-device | weak on phone photos, tables and handwriting | about 2–8 s / page **[E]** | $0. Worse than ML Kit on Android: do not use |
| 8 | Qwen3-VL-2B (Apache-2.0 **[V]**) / Qwen2.5-VL-3B (Qwen research licence, non-commercial **[U]**) | | self-hosted CPU | on our box | decent | about 30–120 s / page on a shared CPU **[E]** | too slow for the shared VPS |
| 9 | Surya / Marker | Surya code Apache-2.0, weights "modified OpenRAIL-M", free under $5M **[V]**; Marker code GPL-3.0 **[U]** | self-hosted | on our box | good layout and tables | slow on CPU | licence fine for a family app; heavy |
| 10 | olmOCR | Apache-2.0 **[V]**, but a 7B VLM | needs a GPU | | very good | GPU only | not for the VPS |

**Hosted free tiers:**

| Service | Free allowance | Trains on our data? | Use for health data? |
|---|---|---|---|
| Gemini API free tier | rate-limited | **Yes**: "uses the content ... to improve"; "Do not submit sensitive, confidential, or personal information to the Unpaid Services". Paid tier: no training, logs kept "for a limited period". **[V]** https://ai.google.dev/gemini-api/terms | **No** |
| OpenRouter `:free` | rate-limited | Routed to providers with their own logging; OpenRouter keeps "separate settings for paid and free models" **[V]**. `buildRequest` refuses `:free` because there is no guarantee of ZDR / no training (`logic.ts` comment "Health data: zero data retention ... never a free tier") **[V]** | **No** |
| Cloudflare Workers AI | 10,000 neurons/day, then $0.011 / 1k **[V]** | "does not use Customer Content ... to train", no retention by default **[V]** https://developers.cloudflare.com/workers-ai/platform/data-usage/ | Possible. `llama-3.2-11b-vision` is about 90 neurons per page, so about 100 pages a day free **[E]**. It is weaker on handwriting **[E]**. |
| Groq | free tier exists **[U]** | no retention by default; ZDR toggle for "all customers" **[V]** https://console.groq.com/docs/your-data | Possible, not needed |
| Google Cloud Vision OCR | 1,000 units/month free, then $1.50 / 1k **[V]** https://cloud.google.com/vision/pricing | Cloud terms (no training) **[U]** | Possible, but it is only OCR, and a model is still needed to structure the output |
| Mistral OCR 4 | none; about $4 / 1k pages, $2 batch (secondary reports) **[U]** | | more expensive than Haiku vision per page |

**Recommended scan pipeline (only if Phase 0 shows scans matter):**

1. ML Kit document scanner crops the page. This already exists.
2. `@capacitor-mlkit/text-recognition` reads the `scannedImages` file path on the phone (the plugin takes a path, which matches the scanner's output).
3. A text-quality gate on the phone (no confidence is exposed, so use simple checks):
   - at least 120 letters/digits (same rule as `hasRealText`);
   - a share of lines that match a catalog alias or unit;
   - document kind is not `prescription` (handwriting).
4. Gate passes: upload `ocr.txt`, lines with y/x boxes, next to the pages. `records-extract` then sends **text only** to a ZDR text model (Haiku 5.5, or DeepSeek v4 flash) with the same prompt and JSON contract (the laptop's text-layer path already does exactly this: `buildRequest({text})` in `lib.mjs`).
5. Gate fails (handwriting, a low character count): send the image as today, with `media_resolution` medium if available **[U]** on OpenRouter.

**What it saves:** from about $0.0042 to $0.0004 per lab page (10x), but in absolute terms only about $0.20 a month at 50 pages. Haiku vision alone gets most of that (about $0.0009 per page) with no new code on the phone.

## 3. Cheap or free upgrades for Talk to Jack

1. **Emergency keyword gate:** deterministic and runs before any model call. English and Tagalog/Taglish lists, for example:
   - "chest pain", "hirap huminga", "di makahinga", "nahimatay", "stroke", "ngiwi ang mukha", "dugo", "seizure / kombulsyon", "magpakamatay";
   - plus sugar words with a number below 70 or above 300.
   - On a match it returns the fixed 911 / nearest-hospital card, costs $0, and is unit-testable. This is the prior study's must-have.
2. **Answers for lab terms with no model call:** `test_catalog` already has a `loinc` column. MedlinePlus Connect is free, keyless and HTTPS, takes LOINC (labs), RxNorm (drugs) and ICD-10 / SNOMED (conditions), and returns JSON (`knowledgeResponseType=application/json`). The limits: 100 requests a minute per IP, with a recommended 12–24 h cache. **[V]** https://medlineplus.gov/medlineplus-connect/web-service/
   - `explain_term` for a catalog test or a medicine on file can answer straight from a cached MedlinePlus summary.
   - The model is then only needed to shorten it, or not at all.
3. **Retrieval over vetted sources: keep it small.**
   - A few hundred curated topic summaries (MedlinePlus, NHS, WHO, DOH) in one Supabase table with Postgres full-text search, plus a small Tagalog-to-English synonym table ("altapresyon" → hypertension, "asukal" → blood sugar).
   - That is $0 and needs no vectors.
   - `Supabase.ai.Session('gte-small')` embeddings are free inside edge functions but **English-only, truncated at 512 tokens** **[V]** https://supabase.com/docs/guides/functions/ai-models, so they are weak for Taglish.
   - If vectors are needed later: Cloudflare `bge-m3` (multilingual) costs $0.012 per 1M tokens **[V]**, which is effectively free.
4. **Answer cache:**
   - Normalise the question (lowercase, synonyms) and skip personal questions (any name, number or "ko/ni").
   - Cache hits come from the KB table. A family asks the same 50 things.
   - **[E]** It would take 20–40% of turns off the model. That is a small saving in dollars, but replies are instant.
5. **The user's own records as context:** the edge function reads, under the caller's RLS:
   - active meds;
   - the latest 5 labs with flags;
   - allergies and conditions (confirmed only).
   - It passes them as a compact block of 300 tokens or less. This adds about $0.00003 per turn on Haiku. Health data goes only to ZDR endpoints, which is the same as scans today. Log counts only (B-7).
6. **Tagalog/Taglish:**
   - Add "Reply in the language the person used (English, Tagalog or Taglish)" to the system prompt.
   - Both Haiku 5.5 and Gemini handle Tagalog **[U: spot-check 20 prompts]**.
   - The keyword gate and synonyms carry the safety-critical part.
7. **Prompt caching: skip.** The prefix is below the minimum cacheable size and traffic is too sparse.
8. **Cheapest model that is still safe:**
   - **Haiku 5.5** at $0.10 / $0.50, ZDR on Vertex/Bedrock, with tool calling.
   - Keep `gemini-3.5-flash-lite` on Vertex `flex`, or `gemini-3.1-flash-lite`, as the fallback.
   - Do **not** use `gemini-2.5-flash-lite`: it has no ZDR endpoint.
   - DeepSeek v4 flash is cheaper, but the risk is untested medical tone and refusal behaviour in tool calling, so test it before considering it.
   - Add `reasoning: {effort:'minimal'}` to every call.

## 4. Phased plan

### Phase 0: measure and switch (Lloyd, about 30 min, no repo code)

1. Create three OpenRouter keys (chat, scan, laptop), each with a monthly limit. The Activity page then splits spend by surface, with no code.
2. Turn on the account-wide ZDR-only setting, if it is not already on.
3. Accuracy check: rerun 20 archived papers through the laptop import with `OPENROUTER_MODEL=anthropic/claude-haiku-5.5`. Compare the drafts with the Gemini ones: 10 printed labs, 5 handwritten prescriptions, 5 others.
4. If Haiku 5.5 is as good or better, swap the secrets and the n8n `models` order. Nothing is rebuilt.

### Phase 1: build lanes (no two lanes share a file)

| Lane | Files | Migration | Tests | What it does |
|---|---|---|---|---|
| **A: extraction cost guard** (Sonnet) | `supabase/functions/records-extract/logic.ts`, `index.ts`, `records-extract.test.ts`, `scripts/import/lib.mjs`, `scripts/import/extract.mjs`, `scripts/records-import.ps1` (the drift test ties these together) | none | the existing drift test + new: request has `max_tokens` (4,096) and `reasoning.effort:'minimal'`; usage counts are parsed; the log line carries `tokens_in`, `tokens_out`, `cost` only | swaps the default model order if Phase 0 says so; keeps `usage` from the response; logs counts and cost (B-7 safe) |
| **B: Ask edge function** (Sonnet, Fable review: safety) | new `supabase/functions/ask/{index.ts,logic.ts,gate.ts,ask.test.ts,README.md}` | none (reuses `assistant_take`) | gate tests (English and Tagalog emergencies return the 911 card without calling the model); cap; JWT; tool whitelist; `reasoning` minimal; usage counts logged | moves the n8n flow into an edge function, the same as the prior study's option (d) |
| **C: knowledge base** (Sonnet) | new `supabase/migrations/00NN_ask_kb.sql` (+ `.down.sql`), `scripts/kb/build.mjs`, `scripts/kb/sources.json`, `supabase/tests/ask_kb_rehearsal.sql` | `ask_kb(topic, lang, body, source_url, fts tsvector)`, `ask_synonyms(term, maps_to)`, RLS read-only for `authenticated` | the rehearsal SQL; a build-script unit test (MedlinePlus Connect fetch mocked) | a curated topic table plus the MedlinePlus Connect cache by LOINC/RxNorm |
| **D: app client** (Sonnet) | `src/features/assistant/client.ts`, `client.test.ts`, `docs/ASSISTANT.md` | none | client tests: calls `functions.invoke('ask')`, same 401/429 mapping | points the app at the new function behind an env flag; n8n stays as the fallback until it is retired |

Lane order:
- B reads C's tables by name only. Agree the contract (the table and column names above) before both start.
- D waits for B to be deployed.
- After merging, read the rendered Ask replies on live data (standing rule from session 68).

### Phase 2 (only if Phase 0 shows scans above about $2 a month, or Lloyd wants offline OCR)

| Lane | Files | Notes |
|---|---|---|
| **E: on-device OCR** | `package.json` (+ `@capacitor-mlkit/text-recognition` 8.2.1, Apache-2.0), `android/` sync, new `src/features/scan/nativeOcr.ts` + test, `src/features/scan/CONTRACT.md` | uploads `ocr.json` next to the pages; the quality gate runs on the phone |
| **F: text path in records-extract** | the Lane A files again, so it runs **after** A merges | reads `ocr.json` when present and passes it to `buildRequest({text})`, otherwise vision |

### Monthly cost, before and after [E]

| | Realistic (750 turns, 50 pages) | Worst case (9,000 turns, 300 pages) |
|---|---|---|
| Today (Gemini 3.5 flash-lite primary, no reasoning setting) | ≈ $1.05 | ≈ $11 |
| After Phase 0 (Haiku 5.5 primary) | ≈ $0.27 | ≈ $3.00 |
| After Phase 1 (gate, KB and cache answer about 30% of turns, minimal reasoning) | ≈ $0.20 | ≈ $2.20 |
| After Phase 2 (OCR text, DeepSeek for printed pages) | ≈ $0.18 | ≈ $2.00 |

The fixed costs are not model costs: the Hetzner VPS is shared and already paid; Supabase is on its current plan. Moving Ask into an edge function (Lane B) removes Bantay's load from the shared VPS, and removes n8n from the chat path once D is live.

## Sources

- OpenRouter catalog and ZDR endpoints (fetched 2026-10-22): https://openrouter.ai/api/v1/models, https://openrouter.ai/api/v1/models/google/gemini-3.5-flash-lite/endpoints, https://openrouter.ai/api/v1/endpoints/zdr
- OpenRouter usage accounting: https://openrouter.ai/docs/use-cases/usage-accounting. Reasoning: https://openrouter.ai/docs/use-cases/reasoning-tokens. Provider logging: https://openrouter.ai/docs/guides/privacy/provider-logging
- Gemini media resolution: https://ai.google.dev/gemini-api/docs/media-resolution. Thinking: https://ai.google.dev/gemini-api/docs/thinking. Terms: https://ai.google.dev/gemini-api/terms
- ML Kit Text Recognition v2: https://developers.google.com/ml-kit/vision/text-recognition/v2 and /languages. Plugin: https://www.npmjs.com/package/@capacitor-mlkit/text-recognition
- Cloudflare Workers AI pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/. Data usage: https://developers.cloudflare.com/workers-ai/platform/data-usage/
- Groq data: https://console.groq.com/docs/your-data. Google Cloud Vision pricing: https://cloud.google.com/vision/pricing
- Mistral OCR 4 pricing (secondary): https://www.edenai.co/post/mistral-ocr-4-vs-top-document-parsing-apis-features-benchmarks-and-integration-guide, https://tech-insider.org/mistral-ocr-4-launch-2026/
- MedlinePlus Connect: https://medlineplus.gov/medlineplus-connect/web-service/. Supabase AI models: https://supabase.com/docs/guides/functions/ai-models
- Licences (GitHub API / Hugging Face): PaddleOCR, docTR, olmOCR Apache-2.0; docling MIT; tesseract.js Apache-2.0; surya code Apache-2.0 + OpenRAIL-M weights; granite-docling-258M, Qwen3-VL-2B, PaddleOCR-VL Apache-2.0.
- Repo (origin/main): `ops/n8n/assistant.json`, `supabase/functions/records-extract/{index.ts,logic.ts,README.md}`, `scripts/import/{lib,extract}.mjs`, `scripts/records-import.ps1`, `src/features/scan/{nativeScan,pipeline,crop}.ts`, `supabase/migrations/0005_news_assistant.sql`, `0015_usage_client_at.sql`, `docs/ASSISTANT.md`.
