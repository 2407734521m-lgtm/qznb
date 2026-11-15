-- Expose only the signed-in member's current account status.
-- The privileged lookup lives in the non-exposed admin_private schema; the
-- public RPC is SECURITY INVOKER and only forwards the caller's own result.
begin;

create or replace function admin_private.my_account_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'joined', p.joined,
    'banned_until',
      case
        when u.banned_until > pg_catalog.now() then u.banned_until
        else null
      end,
    'restrictions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'action_type', a.action_type,
          'reason', a.reason,
          'created_at', a.created_at,
          'expires_at', a.expires_at
        )
        order by a.created_at desc
      )
      from admin_private.member_moderation_actions a
      where a.target_user_id = p.id
        and a.action_type <> 'warning'
        and a.revoked_at is null
        and (a.expires_at is null or a.expires_at > pg_catalog.now())
    ), '[]'::jsonb)
  )
  from public.profiles p
  left join auth.users u on u.id = p.id
  where auth.uid() is not null
    and p.id = auth.uid();
$$;

revoke all on function admin_private.my_account_status() from public, anon;
grant usage on schema admin_private to authenticated;
grant execute on function admin_private.my_account_status() to authenticated;

create or replace function public.my_account_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select admin_private.my_account_status();
$$;

revoke all on function public.my_account_status() from public, anon;
grant execute on function public.my_account_status() to authenticated;

commit;
