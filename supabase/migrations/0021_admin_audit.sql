-- Family Bantay: admin dashboard audit trail + admin-only ID reveal (admin dashboard, lane LD). Needs 0002 (is_admin) and 0008/0013 (records tables,
-- person_identifiers). Written only; Lloyd applies it. Safe to run twice. Undo: 0021_admin_audit.down.sql.
--
-- Rules
-- * audit_log records WHO changed WHAT KIND of row and WHICH COLUMNS changed. It never holds a value (no old/new text, no numbers): column names only.
-- * Only the admin can read it; nobody on the client side can write it. Rows come from the trigger below and from admin_reveal_identifier().
-- * actor is auth.uid(); it is null for the service role (Edge Functions, auto-confirm, laptop import).
-- * Bulk import volume: the trigger is row-level and cheap (one jsonb diff, one insert). The import writes tens of thousands of rows at most, once.
-- * Full ID / member numbers never leave the database except through admin_reveal_identifier(), which logs every call.

begin;

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  tbl text not null,
  row_id uuid,
  person_id uuid,
  action text not null check (action in ('insert', 'update', 'confirm', 'reject', 'delete', 'reveal')),
  fields text[]
);
create index if not exists audit_log_at on public.audit_log (at desc);
create index if not exists audit_log_person_at on public.audit_log (person_id, at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log for select to authenticated using (public.is_admin());

-- Admin sees every people row (the desk lists all members).
drop policy if exists people_admin_read on public.people;
create policy people_admin_read on public.people for select to authenticated using (public.is_admin());

-- ---------- the trigger: names of changed columns, never values ----------
create or replace function public.audit_row() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ declare o jsonb; n jsonb; f text[]; a text; r jsonb; pid uuid; rid uuid; begin
       if tg_op = 'INSERT' then a := 'insert'; r := to_jsonb(new);
       elsif tg_op = 'DELETE' then a := 'delete'; r := to_jsonb(old);
       else
         o := to_jsonb(old); n := to_jsonb(new); r := n;
         select array_agg(k order by k) into f from jsonb_object_keys(n) k
          where k not in ('updated_at', 'edited_at', 'confirmed_at', 'confirmed_by', 'confirmed_source') and (o -> k) is distinct from (n -> k);
         if f is null then return null; end if;  -- only stamp columns moved: nothing to log
         a := case when n ->> 'status' = 'confirmed' and o ->> 'status' is distinct from 'confirmed' then 'confirm'
                   when n ->> 'status' = 'rejected' and o ->> 'status' is distinct from 'rejected' then 'reject'
                   else 'update' end;
       end if;
       pid := case when tg_table_name = 'people' then (r ->> 'id')::uuid else (r ->> 'person_id')::uuid end;
       rid := (r ->> 'id')::uuid;  -- carers has no id column: null
       insert into public.audit_log (actor, tbl, row_id, person_id, action, fields) values (auth.uid(), tg_table_name, rid, pid, a, f);
       return null;
     end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['people','person_identifiers','insurance_policies','documents','lab_results','prescription_items','medications',
                           'vaccinations','imaging_reports','conditions','allergies'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update on public.%1$I for each row execute function public.audit_row()', t);
  end loop;
  drop trigger if exists audit_carers on public.carers;
  create trigger audit_carers after insert or update or delete on public.carers for each row execute function public.audit_row();
end $$;

-- ---------- admin-only identifier list (masked) and reveal (logged) ----------
create or replace function public.admin_identifiers(p_person uuid)
  returns table (id uuid, source text, label text, plan text, last4 text, issued_on date, expires_on date, status text, source_file_id uuid, confidence numeric)
  language plpgsql stable security definer set search_path = '' as
  $$ begin
       if not public.is_admin() then raise exception 'not_admin'; end if;
       return query
         select i.id, 'id'::text, i.id_type, null::text,
                case when length(i.id_number) >= 8 then right(i.id_number, 4) end,
                i.issued_on, i.expires_on, i.status, i.source_file_id, i.confidence
           from public.person_identifiers i where i.person_id = p_person
         union all
         select p.id, 'insurance'::text, p.carrier, p.plan,
                case when length(p.member_no) >= 8 then right(p.member_no, 4) end,
                p.valid_from, p.valid_to, p.status, p.source_file_id, p.confidence
           from public.insurance_policies p where p.person_id = p_person;
     end $$;

create or replace function public.admin_reveal_identifier(p_source text, p_id uuid) returns text
  language plpgsql security definer set search_path = '' as
  $$ declare num text; pid uuid; begin
       if not public.is_admin() then raise exception 'not_admin'; end if;
       if p_source = 'id' then
         select i.id_number, i.person_id into num, pid from public.person_identifiers i where i.id = p_id;
       elsif p_source = 'insurance' then
         select p.member_no, p.person_id into num, pid from public.insurance_policies p where p.id = p_id;
       else raise exception 'not_found'; end if;
       if pid is null then raise exception 'not_found'; end if;
       insert into public.audit_log (actor, tbl, row_id, person_id, action, fields)
         values (auth.uid(), case p_source when 'id' then 'person_identifiers' else 'insurance_policies' end, p_id, pid, 'reveal',
                 case p_source when 'id' then array['id_number'] else array['member_no'] end);
       return num;
     end $$;

revoke execute on function public.admin_identifiers(uuid), public.admin_reveal_identifier(text, uuid) from public, anon;
grant execute on function public.admin_identifiers(uuid), public.admin_reveal_identifier(text, uuid) to authenticated;

commit;
