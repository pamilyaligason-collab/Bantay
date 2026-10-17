-- News feed (filled by n8n with the service role) and the assistant daily cap. Written only; never applied from a lane.

create table public.news_items (
  id text primary key,
  title text not null,
  url text not null,
  source text not null,
  kind text not null check (kind in ('article', 'video')),
  published_at timestamptz not null
);
alter table public.news_items enable row level security;
revoke all on public.news_items from anon, authenticated;
grant select on public.news_items to anon, authenticated;
create policy news_items_read on public.news_items for select to anon, authenticated using (true);
-- No write grants or policies: n8n writes with the service role.

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
