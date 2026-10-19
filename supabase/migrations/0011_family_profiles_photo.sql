-- Sign-in list pictures: family_profiles() (0006) also returns photo_path. Needs 0006 and 0010 (people.photo_path).
-- Same rules as 0006: security definer, signed-in non-disabled members only, no emails, no auth user ids.
-- The return type changes, so the function is dropped and recreated. Safe to run twice.
drop function if exists public.family_profiles();
create function public.family_profiles()
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
  order by p.display_name
$$;

revoke execute on function public.family_profiles() from public, anon;
grant execute on function public.family_profiles() to authenticated;
