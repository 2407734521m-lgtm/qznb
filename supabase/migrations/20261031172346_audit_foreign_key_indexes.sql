-- Historical migration made replay-safe: dependent admin/feedback tables are
-- created by later migrations. Indexes are added again after dependencies exist.
begin;

do $migration$
begin
  if to_regclass('maintenance_private.access_attempts') is not null then
    if not exists (
      select 1 from information_schema.columns
      where table_schema='maintenance_private' and table_name='access_attempts' and column_name='id'
    ) then
      execute 'alter table maintenance_private.access_attempts add column id bigint generated always as identity';
    end if;
    if not exists (
      select 1 from pg_constraint
      where conrelid='maintenance_private.access_attempts'::regclass and contype='p'
    ) then
      execute 'alter table maintenance_private.access_attempts add constraint access_attempts_pkey primary key (id)';
    end if;
    execute 'create index if not exists access_attempts_ip_time_idx on maintenance_private.access_attempts(client_ip, attempted_at desc)';
  end if;
end;
$migration$;

commit;
