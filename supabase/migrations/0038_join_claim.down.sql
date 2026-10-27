-- Undo 0038_join_claim.sql. Safe to run twice. Run after the 0039+ downs. Open invite links stop working; audit_log rows are kept.
-- export_my_data goes back to the 0034 body, still without push_tokens (a push key is not the member's data).
create or replace function public.export_my_data() returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pid uuid; out jsonb := '{}'::jsonb; r record; rows jsonb;
begin
  if me is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if public.pin_try(md5('export:' || me::text)::uuid, 5, interval '1 hour') > 5 then raise exception 'too many exports' using errcode = '53400'; end if;
  select id into pid from public.people where auth_user_id = me;
  if pid is null then return out; end if;
  out := jsonb_build_object('person', (select to_jsonb(p) from public.people p where p.id = pid));
  for r in select t.tbl, string_agg(format('x.%I = %L::uuid', t.col, case when t.kind = 'person' then pid else me end), ' or ' order by t.col) as cond
             from public.erasure_targets() t where t.tbl not in ('pin_reset_requests', 'pin_attempts', 'push_tokens') group by t.tbl order by t.tbl loop
    execute format('select coalesce(jsonb_agg(case when %L = ''push_subscriptions'' then to_jsonb(x) - ''p256dh'' - ''auth'' else to_jsonb(x) end), ''[]''::jsonb) from public.%I x where %s', r.tbl, r.tbl, r.cond) into rows;
    out := out || jsonb_build_object(r.tbl, rows);
  end loop;
  return out;
end $$;
revoke execute on function public.export_my_data() from public, anon, authenticated, service_role;
grant execute on function public.export_my_data() to authenticated;
drop function if exists public.join_claim_use(text);
drop function if exists public.join_claim_check(text);
drop function if exists public.join_claim_peek(text);
drop function if exists public.admin_create_invite(uuid);
drop table if exists public.invite_tokens;
