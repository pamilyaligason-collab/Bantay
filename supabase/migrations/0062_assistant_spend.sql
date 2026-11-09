-- Family Bantay S28 lane F (D-177): what Jack (the ask function) spends on OpenRouter each month, so the model router can step down before the key cap.
-- Written only; applied ONLY when the owner says "apply 0062". The ask function treats a missing table or RPC as "spend unknown" and uses the fast model only. Safe to run twice. Undo: 0062_assistant_spend.down.sql.
--
-- * One row per Manila month. Money only (USD from OpenRouter usage.cost): no user id, no message, no health value.
-- * RLS on with no policy and no grant for anon/authenticated: only the service role (the ask function) reads and writes, through the two RPCs below.

create table if not exists public.assistant_spend (
  month date primary key check (month = date_trunc('month', month)::date),
  usd numeric not null default 0 check (usd >= 0)
);

alter table public.assistant_spend enable row level security;
revoke all on public.assistant_spend from public, anon, authenticated;
grant select, insert, update on public.assistant_spend to service_role;

-- This month's total so far (0 when nothing yet).
create or replace function public.assistant_spend_get() returns numeric
  language sql security definer set search_path = '' as $$
  select coalesce((select usd from public.assistant_spend where month = date_trunc('month', now() at time zone 'Asia/Manila')::date), 0)
$$;
revoke all on function public.assistant_spend_get() from public, anon, authenticated, service_role;
grant execute on function public.assistant_spend_get() to service_role;

-- Adds one call's cost to this month and returns the new total. A negative or null amount adds nothing.
create or replace function public.assistant_spend_add(p_usd numeric) returns numeric
  language plpgsql security definer set search_path = '' as $$
declare m date := date_trunc('month', now() at time zone 'Asia/Manila')::date; t numeric;
begin
  insert into public.assistant_spend as s (month, usd) values (m, greatest(coalesce(p_usd, 0), 0))
    on conflict (month) do update set usd = s.usd + greatest(coalesce(p_usd, 0), 0)
    returning s.usd into t;
  return t;
end $$;
revoke all on function public.assistant_spend_add(numeric) from public, anon, authenticated, service_role;
grant execute on function public.assistant_spend_add(numeric) to service_role;
