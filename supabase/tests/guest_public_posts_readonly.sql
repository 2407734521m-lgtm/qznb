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

  assert (
    select relrowsecurity
    from pg_class
    where oid = 'public.posts'::regclass
  ), 'posts RLS remains enabled';
  assert (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ), 'profiles RLS remains enabled';
  assert (
    select relrowsecurity
    from pg_class
    where oid = 'public.profile_privacy'::regclass
  ), 'profile privacy RLS remains enabled';
end;
$test$;

set local role anon;
do $test$
begin
  assert (select count(*) = 0 from public.posts), 'anon cannot read the base posts table directly';
  assert (select count(*) = 0 from public.profiles), 'anon cannot read the base profiles table directly';
  assert (select count(*) = 0 from public.profile_privacy), 'anon cannot read privacy settings directly';
  assert (select count(*) = 0 from public.post_likes), 'anon cannot read individual like records';
  assert (select count(*) = 0 from public.comments), 'anon cannot read individual comments';
end;
$test$;
reset role;

rollback;
