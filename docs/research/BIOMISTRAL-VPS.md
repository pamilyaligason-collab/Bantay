# BioMistral-7B on "the VPS": feasibility study

Date: 2026-10-22. Read-only study: no SSH, no installs, no code changes.
Tags: **[V]** checked against a source today. **[E]** my estimate from first principles. **[U]** unverified, check before relying on it.

## Verdict (read this first)

**Do not run BioMistral-7B for "Talk to Jack" / Ask.** It fails both of Lloyd's goals:

- **Accuracy:** about 50% on MedQA. Current hosted models score 80 to 96%.
- **Speed:** on CPU it would take about 30 to 90 s before the first word, then 2 to 8 words a second.
- **Fit:** it also cannot fit Bantay's current Ask request. Its context is 2,048 tokens and it has no tool calling. Ask relies on tools such as `log_reading`, `explain_term` and `open_screen`.
- **Recommendation:** take option (d). Keep OpenRouter with ZDR and move Ask to a medical-capable model tier. Ground answers in vetted sources (MedlinePlus first). Add a deterministic emergency gate in front of the model. Serve it from a Supabase edge function, which also takes Bantay's Ask off the shared Alfred VPS.

## 0. How Ask works today (repo `main`)

- **Client:** `src/features/assistant/client.ts` POSTs to `VITE_ASSISTANT_URL` with the Supabase access token as `Bearer`. It maps 401, 429 and other errors to messages shown to the user. **[V]**
- **Server:** an n8n workflow (`ops/n8n/assistant.json`) runs on the Hetzner VPS. `scripts/first-deploy.ps1` step 12 says "on the VPS, B-9: Bantay credentials only". **[V]**
  - Nodes, in order: Webhook (`/bantay-assistant`, allowed origin `https://bantay.pages.dev`) → Verify Supabase JWT → Take daily slot (RPC) → Build request → OpenRouter chat (30 s timeout) → Normalize reply → 200 / 401 / 429 / 503. **[V]**
- **What the request contains:**
  - Models `["google/gemini-3.5-flash-lite", "anthropic/claude-haiku-5.5"]`.
  - `provider: { zdr: true, data_collection: 'deny', require_parameters: true }` and `max_tokens: 600`.
  - Up to 10 history messages of at most 1,000 characters each.
  - A system prompt with rules: no diagnosis, no dose changes, emergency means call 911, no emdashes.
  - Six function tools. **[V]**
- `records-extract` (a Supabase edge function) uses the same OpenRouter key pattern and the same default and fallback models. **[V]**
- **Implication:** BioMistral would replace a tool-calling chat endpoint. It is not a free-text bot.

## 1. BioMistral-7B facts

| Item | Fact | Source |
|---|---|---|
| Base | Mistral-7B-Instruct-v0.1, further pre-trained on PubMed Central Open Access | model card **[V]** |
| Licence | Apache-2.0 | model card **[V]** |
| Release | Paper arXiv 2402.10373, 15 Feb 2024; ACL 2024 main conference (long papers) | arXiv **[V]** |
| Intended use | "strictly as a research tool"; advises against production or professional health use | model card **[V]** |
| Clinical warnings | Not tailored to convey medical knowledge "effectively, safely, or suitably"; "not been evaluated in real-world clinical settings"; asks for RCT-level testing before medical use; no mechanisms for harmful, biased or toxic content | model card, paper ethics statement **[V]** |
| Context | 2,048 tokens (one 2026 preprint says 4K) | model card **[V]**; Med-HEAL arXiv 2606.01301 |
| Chat / instruct | Inherits the Instruct v0.1 chat template. No medical instruction or RLHF safety tuning. Published scores are after task-specific SFT. **No tool or function calling.** | model card **[V]**; tool calling **[E]** (Mistral v0.1 has none) |
| Quantisations | AWQ 4-bit about 4.68 GB VRAM; BnB 4-bit about 5.03 GB, 8-bit about 8.04 GB; FP16 about 15 GB | model card **[V]** |
| GGUF (official `BioMistral/BioMistral-7B-GGUF`) | Q4_K_M 4.37 GB, Q5_K_M 5.13 GB, Q6_K 5.94 GB, Q8_0 7.7 GB (75 community GGUF repos on HF) | HF files **[V]** |
| Variants | DARE, TIES and SLERP merges with Mistral-Instruct; DARE has the best average at 59.4 | model card **[V]** |

## 2. Accuracy

**BioMistral-7B on its own model card** (3-shot after SFT, mean of 3 seeds) **[V]**:

| Benchmark | Score |
|---|---|
| MedQA 4-opt | 50.6 |
| MedQA 5-opt | 42.8 |
| MedMCQA | 48.1 |
| PubMedQA | 77.5 |
| MMLU-style clinical knowledge | 59.9 |
| Medical genetics | 64.0 |
| Anatomy | 56.5 |
| Professional medicine | 60.4 |
| College biology | 59.0 |
| College medicine | 54.7 |
| **Average** | **57.3** |

On the same card, GPT-3.5-Turbo with no SFT averages 66.0.

**Hosted models on MedQA** (Vals AI leaderboard, snapshot 16 Apr 2026, now archived as "saturated") **[V]**:

| Model | MedQA |
|---|---|
| GPT-5.1 | 96.4 |
| Gemini 3.1 Pro | 96.4 |
| GPT-5 mini | 96.1 |
| Gemini 3 Flash | 95.8 |
| Claude Opus 4.5 (thinking) | 95.9 |
| Claude Sonnet 4.6 | 92.1 |
| Gemini 2.5 Flash-Lite (thinking) | 88.9 |
| Gemini 2.5 Flash-Lite (non-thinking) | 80.3 |
| Claude Haiku 4.5 (thinking) | 79.6 |
| GPT-3.5 | 58.5 |

Vals has no row for Bantay's current models (Gemini 3.5 Flash-Lite, Claude Haiku 5.5) or for any Sonnet 5.5. Their scores are **[U]**, but likely at or above their predecessors.

**MedGemma** (Google, open weights, Health AI Developer Foundations terms) **[V]**:

- **27B text-it:** MedQA 87.7 zero-shot, 89.8 with best-of-5 (model card as mirrored; the official card was gated in search).
- **MedGemma 1.5 4B (Jan 2026):** multimodal, aimed at imaging. Its MedQA figure is **[U]**.
- **OpenRouter:** no MedGemma listing found today **[V]**.

**Is BioMistral "accurate" enough for seniors? No.**

1. It answers about 1 in 2 exam questions correctly. That is below GPT-3.5 and below every model Bantay already pays for. Its score is also an after-fine-tuning number, and zero-shot chat will be worse.
2. It has no safety tuning, no calibration or hallucination metrics, and no patient-facing evaluation. A 2026 preprint found it the weakest of five models on clinical summarisation, at 48.1% (Med-HEAL, arXiv 2606.01301) **[V]**.
3. It was evaluated in English only, plus machine-translated benchmarks. Tagalog and Taglish answers were not tested **[V]** (paper scope).
4. MedQA is a doctor-exam multiple-choice test, not a measure of safe plain-language advice. For patient-facing use, judge models on HealthBench-style rubrics and on Bantay's own red-team set **[E]**.

## 3. Speed

**Bantay's real prompt size** **[E]**:

- System prompt about 450 tokens, plus 6 tool schemas about 700 tokens, plus up to 10 history messages of up to 1,000 characters each (up to about 2,500 tokens).
- That is roughly 1,200 to 3,600 tokens. **It already overflows BioMistral's 2,048-token context** unless history and tools are cut.

**CPU-only, Q4_K_M (4.37 GB), llama.cpp or Ollama.** Decoding is bound by memory bandwidth: tokens/s ≈ effective GB/s ÷ 4.4 GB. Prompt processing is bound by compute. Measured references:

- i7-8550U, 8 threads, 7B Q4_0: about 16 t/s prompt and 6.4 t/s generation.
- Unnamed CPU in the llama-bench README: about 16 t/s generation at 8 to 32 threads.
- An EPYC 7763 is reported at about 15 t/s generation. **[V-weak]**

No Hetzner-specific benchmark exists. Run `llama-bench -m <gguf> -p 512 -n 128 -t <vCPU>` to get one.

| Hetzner plan (EU, excl. VAT, today) | vCPU / RAM | €/mo | Prompt t/s **[E]** | Gen t/s **[E]** | Time to first token, 1,500-token prompt **[E]** | 250-token answer total **[E]** |
|---|---|---|---|---|---|---|
| CPX32 (shared) | 4 / 8 GB | 35.99 | 15–30 | 2–5 | 50–100 s | 1.5–3 min |
| CPX42 (shared) | 8 / 16 GB | 69.99 | 25–50 | 3–7 | 30–60 s | 1–2 min |
| CCX23 (dedicated) | 4 / 16 GB | 86.49 | 20–40 | 4–7 | 40–75 s | 1–2 min |
| CCX33 (dedicated) | 8 / 32 GB | 138.99 | 40–80 | 6–10 | 20–40 s | 45–80 s |

Prices are from hetzner.com/cloud today **[V]**. Hetzner raised cloud prices in April and June 2026, and CPX and CCX roughly doubled **[V]**. The CX cost-optimised line shows "currently not available" **[V]**.

- **RAM:** weights 4.4 GB, plus KV cache about 0.13 MB per token (about 0.27 GB at 2K), plus runtime. Plan on **about 6 GB resident**, and more for parallel slots **[E]**.
- **Concurrency:** parallel slots share the same memory bandwidth, so two users at once each get about half the speed. Queueing is the realistic mode **[E]**.
- **Shared-VPS impact:** generation pins every vCPU for 30 to 180 s per question. On the Alfred box this starves n8n, Caddy and Alfred's finance flows, and pushes against Supabase/n8n timeouts (the n8n node timeout is 30 s **[V]**). That is a B-9 problem in spirit: Bantay load degrading Alfred **[E]**.

**GPU options** (7B Q4 or AWQ on a 16 to 24 GB GPU: about 60 to 150 t/s generation, time to first token under 1 s warm **[E]**):

| Option | Price | Monthly | Notes |
|---|---|---|---|
| Hetzner **GEX45** (RTX PRO 4000 Blackwell, 24 GB) | €214/mo + €209 setup **[V]** | about €214 | Dedicated; GEX44 is no longer listed. Fits MedGemma 27B at Q4 (about 16 GB) **[E]** |
| RunPod serverless 16 GB (A4000 class) | $0.58/h of active compute **[V]** | about $2–15 at Bantay volume **[E]** | Cold starts of tens of seconds when scaled to zero **[U]**; US/EU data centres |
| RunPod serverless 24 GB (L4 class) | $0.69/h **[V]** | similar | |
| HF Inference Endpoints L4 x1 | $0.70–0.80/h **[V]** | about $510–584 always on | Scale-to-zero has cold starts |

## 4. Options ranked

Assumed volume: about 10 active family users × up to 30 asks a day (the app's cap) is at most 9,000 asks a month. Typical use is far lower **[E]**.

| Rank | Option | Accuracy | Latency | Cost / month | Privacy | Ops burden | Guardrails needed |
|---|---|---|---|---|---|---|---|
| **1** | **(d) Hosted model via OpenRouter (ZDR) + medical system prompt + retrieval over vetted sources and the family's own records** | High: 80–96% MedQA class; tool calling works | Time to first token about 0.5–2 s; full answer 2–6 s **[E]** | About $1–15 in tokens (about 3k in + 300 out per ask) **[E]**; no new server | Text leaves PH to the model provider (mostly US) under ZDR and no data collection. Already accepted today | Lowest: one edge function, no GPU, no patching | Emergency gate, refusal rules, citations, no-log rule (section 5) |
| 2 | (e) MedGemma 27B text on a dedicated GPU (GEX45) or serverless | Good: 87.7 MedQA; open weights | Under 1 s warm on GPU **[E]**; minutes on CPU (unusable) | About €214 + €209 setup (GEX45), or usage-billed serverless | No third-party model provider sees text. Still leaves PH (DE/FI or US data centre). You become the processor | High: GPU box, model server, TLS, updates, monitoring, 24/7 uptime | Same as (d), plus self-built moderation. No tool calling out of the box **[U]** |
| 3 | (c) Serverless GPU running BioMistral (RunPod / HF) | Low (about 50% MedQA) | Cold start tens of seconds, then fast | About $2–15 + idle min-replica if kept warm | As (e) | Medium | Everything, and still poor answers |
| 4 | (b) Separate small CPU VPS for Bantay running BioMistral (respects B-9) | Low | 1–3 min per answer | €36–139 | As (e); clean B-9 separation | Medium | Everything |
| 5 | (a) BioMistral on the existing Alfred VPS | Low | 1–3 min, and degrades Alfred | €0 extra, until Alfred breaks or the VPS is upsized | Mixes Bantay health workload onto the Alfred host | Medium; risks Alfred | Everything. **Reject** |

**Privacy note for every option:** health text already leaves the Philippines today (Supabase region **[U]**, the Hetzner location **[U]**, OpenRouter providers). Under RA 10173, health data is *sensitive personal information*; it needs consent and adequate safeguards for transfers. Confirm the privacy notice covers "AI assistant processing abroad" **[U]**; this is not legal advice. Self-hosting does not keep data in PH unless the box is in PH. Hetzner has no PH region; SIN1 is the nearest **[V]**.

## 5. Recommended architecture: option (d) as a Supabase edge function

Ask moves from n8n on the Alfred VPS to `supabase/functions/assistant`. This follows the `records-extract` pattern: same secrets style, same `_shared` helpers. Result: Bantay no longer runs anything on the Alfred VPS for Ask, which is a cleaner B-9 than today.

**Endpoint shape.** The client contract stays the same, so only `VITE_ASSISTANT_URL` changes.

```
POST /functions/v1/assistant
Headers: Authorization: Bearer <supabase access token>, Content-Type: application/json
Body:    { screen: 'today'|'health'|'records'|'family'|'safety', messages: [{ role, content }] }   // ≤10, each ≤1000 chars
200:     OpenRouter-shaped reply (as the n8n "Normalize reply" emits today) + optional sources: [{ title, url }]
401 not signed in · 429 daily cap · 503 model unavailable · 400 bad body
```

**Flow, in order:**

1. **CORS:** `ALLOWED_ORIGIN` only (Pages origin + Capacitor scheme).
2. **Auth:** `supabase.auth.getUser(token)`. Reject when there is no user, or when the `app_roles` entry is disabled.
3. **Cap:** call the existing take-daily-slot RPC as the user (the same RPC n8n calls). 429 when the cap is used up.
4. **Validate:** screen enum; messages trimmed to the last 10 and 1,000 chars each (same rules as `Build request`).
5. **Emergency gate (deterministic, before any model call).** A regex or keyword list over the last user message, in English, Tagalog and Taglish. Examples: chest pain / *sakit sa dibdib*, can't breathe / *hindi makahinga*, stroke signs (face droop, slurred speech, *ngiwi ang mukha*, weak arm), fainting / *nahimatay*, heavy bleeding, BP ≥180/120 with symptoms, sugar <70 or >300 with symptoms, self-harm. On a match, return a fixed card: "Call 911 now or go to the nearest hospital" plus a one-tap call button and the family's emergency contact. **No model call.** Log only the flag `emergency=true`.
6. **Retrieval:**
   - Up to 3 short snippets from vetted sources: MedlinePlus Connect / MedlinePlus Health Topics first (free, public-domain API), then a small hand-curated cache of NHS / WHO / DOH pages stored in a Supabase table and refreshed monthly.
   - Plus the asking user's own data, read **with the user's JWT so RLS applies**: latest BP and sugar readings, the active medicine list, latest flagged labs. Only fetch these when the screen or the question needs them.
   - Each snippet carries `{title, url}`.
7. **Model call:** OpenRouter `models: [primary, fallback]`, `provider: { zdr: true, data_collection: 'deny', require_parameters: true }`, the same tools, `max_tokens: 600`, `temperature: 0.2`.
   - Primary: a stronger tier than today's flash-lite. For example `google/gemini-3.5-flash` or `anthropic/claude-sonnet-5.5` **[U: check availability, ZDR endpoint list and price on OpenRouter]**.
   - Fallback: today's `claude-haiku-5.5`.
   - Model ids come from env (`ASSISTANT_MODEL`, `ASSISTANT_FALLBACK_MODEL`) so a switch needs no deploy.
8. **Timeouts:**
   - Primary: `AbortController` 20 s.
   - On timeout or 5xx, retry once with the fallback model at 15 s.
   - Total stays under 40 s, well inside the edge limit (150 s idle, 400 s wall) **[V]**.
   - If both fail, return 503. The client already says "could not reach the assistant".
9. **Post-check (deterministic):** if the reply mentions a dose number not present in the user's own logged medicines, or contains "you have" plus a condition word, replace that sentence with "Please ask your doctor or pharmacist." Strip emdashes.
10. **Respond:** the reply, the source links (rendered as "From MedlinePlus" chips), and the existing tool-call drafts (the user still confirms each save).

**System prompt additions** (on top of the current rules 1 to 9):

- Answer only from the provided sources and the family's records. If they do not cover the question, say "I am not sure. Please ask your doctor." and do not guess.
- Senior register: at most 4 short sentences, grade-6 English. Reply in Tagalog or Taglish if the user writes that way.
- Always end health answers with who to ask (doctor, pharmacist, health center).
- Never interpret a lab as normal or abnormal beyond the range printed on the paper.

**Logging rules:**

- Log only: request id, user id hash, screen, model used, fallback yes/no, latency in ms, token counts, status, `emergency` flag, and retrieval hit count.
- **Never** log message text, tool arguments, retrieved snippets, record values, or the model output.
- Catch blocks log `err.name` and status only; never the response body. This is the same rule as `scripts/import/lib.mjs`, which never echoes model output.
- OpenRouter: keep the hard monthly spend limit and account-level ZDR enforcement on.

**Step list** (about 2 sessions, plan-before-code gate applies):

1. Lloyd approves this design (option d, model tier, edge function instead of n8n). Record it in `02-DECISIONS`.
2. Write the emergency gate as a pure function with a test table of 40+ phrases (EN, TL, Taglish; positives and near-misses).
3. Write the edge function `assistant`: auth, cap RPC, validate, gate, retrieval, OpenRouter with fallback and timeouts, post-check. Reuse the `records-extract` helpers and their tests' style.
4. Add the `vetted_snippets` table, the RLS read policy and a seed script for MedlinePlus / NHS / WHO / DOH pages.
5. Build a red-team eval set of about 60 senior-style questions (BP, metformin, labs, emergencies, dose-change requests). Run it on 2 or 3 candidate models via OpenRouter and pick the primary by safety first, then accuracy, then latency. Review on Opus or Fable.
6. Deploy the function and set its secrets. Point `VITE_ASSISTANT_URL` at it. Leave the n8n assistant inactive as rollback for 2 weeks, then remove it from the VPS.
7. Smoke test on live data with a real family account; confirm no health text appears in the function logs.

## What to check on the VPS (if Lloyd still wants a self-host trial)

- `nproc`, `free -h`, and `lscpu`: shared or dedicated vCPU, AVX2 / AVX-512 support.
- Current load from n8n and Caddy (`uptime`, `docker stats`).
- Hetzner plan name and location in the Hetzner console.
- For numbers, run `llama-bench -m BioMistral-7B.Q4_K_M.gguf -p 512 -n 128 -t $(nproc)` on a **throwaway** CPX/CCX, not on the Alfred box.

## Sources

- BioMistral-7B model card: https://huggingface.co/BioMistral/BioMistral-7B
- BioMistral GGUF files: https://huggingface.co/BioMistral/BioMistral-7B-GGUF ; community quants: https://huggingface.co/models?search=biomistral-7b%20gguf
- Paper: https://arxiv.org/abs/2402.10373 (ACL 2024)
- Med-HEAL hallucination preprint (BioMistral weakest of 5): https://arxiv.org/pdf/2606.01301
- Vals AI MedQA leaderboard (16 Apr 2026, archived): https://www.vals.ai/benchmarks/medqa
- MedGemma 27B text model card: https://huggingface.co/google/medgemma-27b-text-it ; MedGemma 1.5: https://research.google/blog/next-generation-medical-image-interpretation-with-medgemma-15-and-medical-speech-to-text-with-medasr/
- Hetzner cloud plans: https://www.hetzner.com/cloud/regular-performance/ , https://www.hetzner.com/cloud/general-purpose/ ; GPU: https://www.hetzner.com/dedicated-rootserver/matrix-gpu/
- Hetzner 2026 price rises: https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do
- RunPod pricing: https://www.runpod.io/pricing ; HF Inference Endpoints pricing: https://huggingface.co/docs/inference-endpoints/en/pricing
- llama.cpp CPU reference numbers: https://www.mgroeber.de/benchmarking-llamacpp-on-legacy-hardware-2.html , https://github.com/ggerganov/llama.cpp/blob/b8c1476e44cc1f3a1811613f65251cf779067636/examples/llama-bench
- OpenRouter ZDR: https://openrouter.ai/docs/guides/features/zdr
- Supabase edge function limits: https://supabase.com/docs/guides/functions/limits
- RA 10173 summary (secondary): https://batasnatin.com/laws/commercial-ecom-data-privacy-RA-10173
- Repo: `ops/n8n/assistant.json`, `src/features/assistant/client.ts`, `scripts/first-deploy.ps1` (step 12), `supabase/functions/records-extract/`
