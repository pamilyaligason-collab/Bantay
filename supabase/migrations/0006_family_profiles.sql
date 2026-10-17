-- Quick login (D-24): the family picker list for a trusted device. Callable only by a signed-in, non-disabled member.
-- Returns display name, handle (PIN members only) and sign-in kind for non-disabled members. No emails, no auth user ids.
-- The public sign-in page never calls this (anon is refused), so names are only ever shown on a device that signed in before.
create function public.family_profiles()
  returns table (person_id uuid, display_name text, handle text, provider text)
  language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name,
         case when u.email like 'm-%@members.bantay.invalid' then r.handle end,
         case when u.email like 'm-%@members.bantay.invalid' then 'pin' else 'google' end
  from public.people p
  join public.app_roles r on r.user_id = p.auth_user_id and not r.disabled
  join auth.users u on u.id = p.auth_user_id
  where exists (select 1 from public.app_roles me where me.user_id = auth.uid() and not me.disabled)
  order by p.display_name
$$;

revoke execute on function public.family_profiles() from public, anon;
grant execute on function public.family_profiles() to authenticated;
