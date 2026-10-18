-- "Forgot PIN? Send a request" (P1 Task 5, D-41). Written only; never applied from this lane.
-- Needs public.is_admin() from 0002_auth.sql and public.pin_try() (service-role only) for the rate limit.
-- Anti-enumeration: request_pin_reset returns void and raises nothing for any handle (known, unknown, malformed, rate limited),
-- so the reply is identical and handles cannot be probed. Only an admin can read the requests.

create table public.admin_requests (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('pin_reset')),
  handle text not null check (handle ~ '^[a-z][a-z0-9_]{2,19}$'),
  user_id uuid references auth.users (id) on delete cascade, -- null when the handle matched nobody; admins see only matched rows
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index admin_requests_open on public.admin_requests (created_at desc) where handled_at is null;

alter table public.admin_requests enable row level security;
revoke all on public.admin_requests from anon, authenticated;
grant select on public.admin_requests to authenticated;
grant update (handled_at) on public.admin_requests to authenticated;
create policy admin_requests_read on public.admin_requests for select to authenticated using (public.is_admin() and user_id is not null);
create policy admin_requests_handle on public.admin_requests for update to authenticated
  using (public.is_admin() and user_id is not null) with check (public.is_admin() and user_id is not null);

-- Callable by anon (the sign-in screen). 5 requests per hour per client address (x-forwarded-for from PostgREST), counted
-- through pin_try with a key that is a hash of the address. Same silent reply every time.
-- ponytail: md5 of the address, not peppered; an attacker who knows an address can only exhaust that address's own budget.
create function public.request_pin_reset(h text) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  hh text := lower(btrim(coalesce(h, '')));
  ip text := coalesce(split_part(coalesce(current_setting('request.headers', true), '{}')::json ->> 'x-forwarded-for', ',', 1), 'none');
  uid uuid;
begin
  if hh !~ '^[a-z][a-z0-9_]{2,19}$' then return; end if;
  if public.pin_try(md5('pin_reset:' || btrim(ip))::uuid, 5, interval '1 hour') > 5 then return; end if;
  select r.user_id into uid from public.app_roles r where r.handle = hh and not r.disabled;
  if uid is null then return; end if;
  if exists (select 1 from public.admin_requests q where q.user_id = uid and q.kind = 'pin_reset' and q.handled_at is null) then return; end if;
  insert into public.admin_requests (kind, handle, user_id) values ('pin_reset', hh, uid);
end $$;

revoke execute on function public.request_pin_reset(text) from public;
grant execute on function public.request_pin_reset(text) to anon, authenticated;
