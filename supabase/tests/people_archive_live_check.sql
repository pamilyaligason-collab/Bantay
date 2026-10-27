-- Live rehearsal of 0022 (orchestrator). Applies 0022 inside one transaction, builds ONE synthetic person ('Test Child') inside it, runs count-only checks
-- as the real admin and one real member, then the final DO block raises 'RESULT ...', which aborts the transaction: NOTHING is kept.
-- No real person is archived, no values are printed, only counts. Needs 0021 already applied (people_admin_read, audit trigger).
-- Run: npx -y supabase@2.122.0 db query --linked -f supabase/tests/people_archive_live_check.sql   (expect an error whose text starts with RESULT)
begin;

alter table public.people
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id) on delete set null;

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to authenticated
  using (auth_user_id = auth.uid() or ((created_by = auth.uid() or public.is_carer_of(id)) and archived_at is null));

drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert to authenticated
  with check (created_by = auth.uid() and (auth_user_id = auth.uid() or auth_user_id is null) and archived_at is null and archived_by is null);

create or replace function public.family_profiles()
  returns table (person_id uuid, display_name text, handle text, provider text, photo_path text)
  language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name,
         case when u.email like 'm-%@members.bantay.invalid' then r.handle end,
         case when u.email like 'm-%@members.bantay.invalid' then 'pin' else 'google' end,
         p.photo_path
  from public.people p
  join public.app_roles r on r.user_id = p.auth_user_id and not r.disabled
  join auth.users u on u.id = p.auth_user_id
  where exists (select 1 from public.app_roles me where me.user_id = auth.uid() and not me.disabled)
    and p.archived_at is null
  order by p.display_name
$$;
revoke execute on function public.family_profiles() from public, anon;
grant execute on function public.family_profiles() to authenticated;

create or replace function public.admin_set_archived(p_person uuid, p_archived boolean) returns void
  language plpgsql security definer set search_path = '' as
  $$ declare au uuid; begin
       if not public.is_admin() then raise exception 'not_admin'; end if;
       if p_person is null or p_archived is null then raise exception 'bad_input'; end if;
       select p.auth_user_id into au from public.people p where p.id = p_person;
       if not found then raise exception 'not_found'; end if;
       if p_archived and au is not null and au = auth.uid() then raise exception 'self'; end if;
       update public.people set
         archived_at = case when p_archived then coalesce(archived_at, now()) end,
         archived_by = case when p_archived then coalesce(archived_by, auth.uid()) end
       where id = p_person;
     end $$;
revoke execute on function public.admin_set_archived(uuid, boolean) from public, anon;
grant execute on function public.admin_set_archived(uuid, boolean) to authenticated;

do $$
declare a uuid; m uuid; t uuid; n_cols int; n_archived_real int; n_total int;
        mem_before int; mem_after int; adm_after int; adm_self text; mem_call text; mem_direct text; fp_before int; fp_after int; n_audit int; n_react int;
begin
  select count(*) into n_cols from information_schema.columns where table_schema = 'public' and table_name = 'people' and column_name in ('archived_at', 'archived_by');
  select count(*) into n_archived_real from public.people where archived_at is not null;
  select count(*) into n_total from public.people;
  select user_id into a from public.app_roles where role = 'admin' and not disabled limit 1;
  select user_id into m from public.app_roles where role = 'member' and not disabled limit 1;
  -- one synthetic child created by the member (link_creator makes the member its writer)
  insert into public.people (display_name, created_by) values ('Test Child', m) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', m::text, true);
  set local role authenticated;
  select count(*) into mem_before from public.people where id = t;
  select count(*) into fp_before from public.family_profiles();
  begin perform public.admin_set_archived(t, true); mem_call := 'allowed'; exception when others then mem_call := sqlerrm; end;
  begin update public.people set archived_at = now() where id = t; mem_direct := 'allowed'; exception when others then mem_direct := sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  perform public.admin_set_archived(t, true);
  select count(*) into adm_after from public.people;
  begin perform public.admin_set_archived(null, true); adm_self := 'allowed'; exception when others then adm_self := sqlerrm; end;
  reset role;
  select count(*) into n_audit from public.audit_log where tbl = 'people' and row_id = t and fields = array['archived_at', 'archived_by'];
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', m::text, true);
  set local role authenticated;
  select count(*) into mem_after from public.people where id = t;
  select count(*) into fp_after from public.family_profiles();
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', a::text, true);
  set local role authenticated;
  perform public.admin_set_archived(t, false);
  reset role;
  select count(*) into n_react from public.people where id = t and archived_at is null and archived_by is null;
  raise exception 'RESULT cols=% archived_real=% people_total=% member_sees_child_before=% member_sees_child_after=% admin_sees_all_after=% member_call=% member_direct_update=% admin_null_call=% audit_rows=% signin_before=% signin_after=% reactivated=%',
    n_cols, n_archived_real, n_total, mem_before, mem_after, adm_after, mem_call, mem_direct, adm_self, n_audit, fp_before, fp_after, n_react;
end $$;
rollback;
