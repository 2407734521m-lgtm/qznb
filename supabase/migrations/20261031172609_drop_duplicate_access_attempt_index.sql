-- Keep the original maintenance access-attempt index; remove the duplicate added by the audit index migration.
drop index if exists maintenance_private.access_attempts_ip_time_idx;
