-- Regression checks for the anonymous-question profile lookup.
-- Run against a disposable local Supabase database after applying migrations.
begin;

do $test$
declare
  function_definition text;
begin
  assert to_regprocedure('public.anonymous_question_profile(uuid)') is not null,
    'anonymous question profile RPC exists';

  assert has_function_privilege('authenticated',
    'public.anonymous_question_profile(uuid)', 'EXECUTE'),
    'authenticated members can call the profile RPC';

  assert not has_function_privilege('anon',
    'public.anonymous_question_profile(uuid)', 'EXECUTE'),
    'anonymous visitors cannot call the profile RPC';

  select pg_get_functiondef(
    'public.anonymous_question_profile(uuid)'::regprocedure
  ) into function_definition;

  assert position('public.is_member()' in function_definition) > 0,
    'profile lookup requires a signed-in member';
  assert position('p.joined = true' in function_definition) > 0,
    'profile lookup only returns joined profiles';
  assert position('privacy.show_name' in function_definition) > 0,
    'display name follows the profile privacy setting';
  assert position('p.phone' in function_definition) = 0
     and position('p.real_name' in function_definition) = 0
     and position('p.bio' in function_definition) = 0,
    'profile RPC does not expose private profile columns';

  assert (
    select relrowsecurity
    from pg_class
    where oid = 'public.profiles'::regclass
  ), 'profiles table RLS stays enabled';
end;
$test$;

rollback;
