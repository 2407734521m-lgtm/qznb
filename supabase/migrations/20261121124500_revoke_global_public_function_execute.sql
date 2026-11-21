-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
-- A schema-scoped REVOKE cannot remove a privilege inherited from the global
-- default ACL, so remove the built-in global grant for functions created by
-- postgres. The public-schema default ACL migration separately preserves only
-- explicit owner/service_role grants and requires deliberate client grants.
--
-- Existing function ACLs are unchanged.

alter default privileges for role postgres
  revoke execute on functions from public;
