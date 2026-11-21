-- Secure-by-default privileges for future app objects created by postgres
-- in the exposed public schema.
--
-- Existing tables, sequences, functions, grants, and RLS policies are unchanged.
-- New public-schema objects must receive explicit client grants in their own
-- migrations. This prevents a forgotten GRANT/RLS clause from silently exposing
-- a newly-created table or SECURITY DEFINER RPC through the Data API.
--
-- service_role and the object owner retain their defaults.
-- Intended anonymous RPCs must explicitly GRANT EXECUTE TO anon.
-- Tables exposed to authenticated users must explicitly GRANT the minimum
-- required privileges and enable RLS before deployment.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, public;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, public;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, public;
