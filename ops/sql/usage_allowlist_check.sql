-- S26 go-live check for migration 0056 (usage allowlist trigger). Writes nothing: the block always ends with an
-- exception, so every test row is rolled back. Success prints ALLOWLIST_OK; anything else is a failure.
do $$
declare
  u uuid := (select id from auth.users order by created_at limit 1);
  n0 bigint;
  n1 bigint;
begin
  if u is null then raise exception 'FAIL: no user to test with'; end if;
  select count(*) into n0 from public.usage_events;
  insert into public.usage_events (user_id, kind, name) values (u, 'action', 'zz_not_on_list'); -- well-formed, not listed: dropped silently
  insert into public.usage_events (user_id, kind, name) values (u, 'action', 'card_talk');      -- listed: kept
  select count(*) into n1 from public.usage_events;
  if n1 - n0 <> 1 then raise exception 'FAIL: expected 1 new row, got %', n1 - n0; end if;
  begin
    insert into public.usage_events (user_id, kind, name) values (u, 'action', 'bp_150'); -- malformed: the 0004 CHECK must still raise
    raise exception 'FAIL: malformed name was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.usage_events (user_id, kind, name) values (u, 'reading', 'card_talk'); -- unknown kind: CHECK must raise
    raise exception 'FAIL: unknown kind was accepted';
  exception when check_violation then null;
  end;
  raise exception 'ALLOWLIST_OK (test rows rolled back)';
end $$;
