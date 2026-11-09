-- Family Bantay S26 (lane P2D): da_prices, the DA Daily Price Index behind the market-price card on Today (D-164: Metro Manila wet markets, labelled NCR).
-- Needs nothing earlier (job_runs from 0033 is only written by the function's heartbeat). Written only; applied ONLY when the owner says "apply 0057".
-- The app never requires it (a missing table hides the card). Safe to run twice. Undo: 0057_da_prices.down.sql.
--
-- * One row per price date, commodity and specification: a rerun of the da-prices function upserts the same row. Public prices only: no person's data, no location.
-- * Readers: any signed-in user. Writer: the da-prices edge function with the service role. The 60-day trim runs in that function (ML-06); the CHECKs cap field sizes.
-- * No client insert/update/delete policy exists, and the grants below give the client select only.
-- * The cron schedule is applied by the owner after the deploy, not here (docs/s26/da-prices-deploy.md).

create table if not exists public.da_prices (
  price_date date not null,
  commodity text not null check (length(commodity) between 1 and 120),
  specification text not null default '' check (length(specification) <= 160),
  unit text not null check (unit in ('kg', 'piece', 'liter')),
  price_php numeric(10, 2) not null check (price_php >= 1 and price_php <= 5000),
  market_area text not null default 'NCR' check (market_area = 'NCR'),
  source_url text not null check (length(source_url) <= 300 and source_url ~ '^https://www\.da\.gov\.ph/'),
  fetched_at timestamptz not null default now(),
  primary key (price_date, commodity, specification)
);
create index if not exists da_prices_date on public.da_prices (price_date desc);

alter table public.da_prices enable row level security;
revoke all on public.da_prices from anon, authenticated;
grant select on public.da_prices to authenticated;
grant select, insert, update, delete on public.da_prices to service_role;
drop policy if exists da_prices_read on public.da_prices;
create policy da_prices_read on public.da_prices for select to authenticated using (true);
