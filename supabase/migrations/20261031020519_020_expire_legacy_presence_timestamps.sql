
-- Existing rows were only written once at login by the previous client.
-- Expire those legacy timestamps so they are not misreported as live activity
-- before the new periodic, activity-aware heartbeat is deployed.
update public.member_presence
set updated_at = pg_catalog.now() - interval '31 minutes'
where updated_at > pg_catalog.now() - interval '31 minutes';
