-- Read-only visitor feed remains a narrow public API and does not relax base-table RLS.
-- Test against a disposable local Supabase database; all changes roll back.
begin;

do $test$
begin
  assert has_function_privilege('anon', 'public.guest_public_posts(text,integer,integer)', 'EXECUTE'),
    'anonymous visitors can call the public feed RPC';
  assert has_function_privilege('authenticated', 'public.guest_public_posts(text,integer,integer)', 'EXECUTE'),
    'signed-in members can call the same public feed RPC';

  assert not (
    select prosecdef
    from pg_proc
    where oid = 'public.guest_public_posts(text,integer,integer)'::regprocedure
  ), 'public wrapper runs as invoker';

  assert (
    select prosecdef
    from pg_proc
    where oid = 'guest_api_private.guest_public_posts(text,integer,integer)'::regprocedure
  ), 'narrow internal feed reader runs as definer';

  assert has_function_privilege('anon', 'guest_api_private.guest_post_image_public_readable(text)', 'EXECUTE'),
    'storage policy can check exact public-post image paths';

  assert not has_table_privilege('anon', 'public.profile_privacy', 'SELECT'),
    'anonymous clients cannot read privacy settings directly';
  assert not has_table_privilege('anon', 'public.profiles', 'SELECT'),
    'anonymous clients cannot read profiles directly';
end;
$test$;

rollback;
