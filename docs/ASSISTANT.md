# Ask Bantay (assistant chat)

Floating button (bottom right, above the tab bar) opens a sheet. The app posts the last 10 messages and the screen name to an n8n webhook, which checks the Supabase login, enforces a daily cap, and asks OpenRouter. Replies can carry tool calls. The app turns them into cards. Nothing is saved until the user taps Confirm.

## App

- Env: `VITE_ASSISTANT_URL` (n8n production webhook URL, set at build), optional `VITE_ASSISTANT_DAILY_CAP` (default 30), optional `VITE_KIWIX_URL`.
- Sends `Authorization: Bearer <Supabase access token>` when a `sb-*-auth-token` session is in localStorage.
- Client cap: 30 per Asia/Manila day, kept in Dexie kv `assistant.cap`. A reached cap never calls the server.
- Tools: `log_reading`, `log_med_taken`, `log_activity` (draft cards, Confirm / Edit / Discard, only Confirm calls `src/features/log/store.ts`), `open_screen`, `explain_term` (source link built in the app), `whats_the_weather` (Open-Meteo in the browser, no key).
- Nothing is logged to the console. No health values appear in any notification.

## Server (ops/n8n/assistant.json, inactive until reviewed)

Webhook -> verify JWT (`GET {SUPABASE_URL}/auth/v1/user`, 401 if invalid) -> daily cap via RPC (429 if over) -> OpenRouter -> normalize -> respond.

- Credential (HTTP Header Auth, name exactly `Bantay OpenRouter ZDR`): header `Authorization`, value `Bearer <OpenRouter key>`. Created in n8n only.
- Credential (HTTP Header Auth, name exactly `Bantay Supabase publishable`): header `apikey`, value the Supabase publishable key. Used by the JWT check and the cap RPC. The Supabase URL (`https://wuakimpssycbtnmoexuc.supabase.co`) is written in the two HTTP nodes. No n8n env vars are read.
- Replace `https://REPLACE-WITH-APP-ORIGIN` in the Webhook node (Allowed Origins) with the app origin.
- A daily slot is used even if the model call fails. If the cap RPC gives no answer (misconfigured), the webhook returns 503 `{error:'unavailable'}` and the app shows the generic failure message.
- Models: `google/gemini-3.5-flash-lite`, fallback `anthropic/claude-haiku-5.5` (checked on OpenRouter 2026-10-17). Provider `{zdr:true, data_collection:'deny'}`. No `:free` model ever.
- Execution data: success, error and manual saving are all off, so prompts never sit in n8n. The workflow does not log bodies.
- OpenRouter: in the OpenRouter UI set a hard monthly spend limit on this key (Lloyd), and turn on the account-wide ZDR-only setting.

### Supabase (run once, reviewed by Lloyd)

```sql
create table public.assistant_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;  -- no policies: only the function below touches it

create or replace function public.assistant_take(p_limit int)
returns table (allowed boolean, used int)
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'Asia/Manila')::date; n int;
begin
  if auth.uid() is null then return query select false, 0; return; end if;
  insert into assistant_usage (user_id, day, count) values (auth.uid(), d, 0) on conflict do nothing;
  update assistant_usage set count = count + 1 where user_id = auth.uid() and day = d and count < p_limit returning count into n;
  if n is null then return query select false, p_limit; else return query select true, n; end if;
end $$;
revoke all on function public.assistant_take(int) from public, anon;
grant execute on function public.assistant_take(int) to authenticated;
```

## Safety rules (system prompt)

No diagnosis, no dosing beyond what the family logged, urgent means 911 or the doctor, never claims earthquake or local tsunami warnings (B-1, B-6).
