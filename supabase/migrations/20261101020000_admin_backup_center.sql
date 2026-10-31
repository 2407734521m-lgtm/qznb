-- Backup inventory and manual backup attestation for super administrators.
-- This does not create a database or Storage backup.

begin;

create or replace function public.admin_backup_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'database_size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'public_table_count', (
      select count(*) from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    ),
    'storage_buckets', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'bucket_id', b.id,
          'is_public', b.public,
          'object_count', coalesce(x.object_count, 0),
          'total_bytes', coalesce(x.total_bytes, 0)
        ) order by b.id
      )
      from storage.buckets b
      left join (
        select
          o.bucket_id,
          count(*)::bigint as object_count,
          coalesce(sum(
            case
              when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint
              else 0
            end
          ), 0)::bigint as total_bytes
        from storage.objects o
        group by o.bucket_id
      ) x on x.bucket_id = b.id
    ), '[]'::jsonb),
    'manual_backup_count', (select count(*) from public.backup_logs),
    'latest_manual_backup_at', (select max(created_at) from public.backup_logs),
    'manual_backup_logs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', l.id,
          'scope', l.scope,
          'status', l.status,
          'note', l.note,
          'created_at', l.created_at,
          'created_by_name', coalesce(nullif(p.display_name, ''), p.username, '超级管理员')
        ) order by l.created_at desc
      )
      from (
        select * from public.backup_logs order by created_at desc limit 20
      ) l
      left join public.profiles p on p.id = l.created_by
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

create or replace function public.admin_record_manual_backup(
  p_scope text,
  p_note text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_id bigint;
begin
  if v_actor is null or public.my_role() <> 'super_admin' then
    raise exception 'super administrator required' using errcode = '42501';
  end if;

  if p_scope is null or p_scope not in ('database', 'storage', 'full')
     or p_note is null
     or pg_catalog.char_length(pg_catalog.btrim(p_note)) < 8
     or pg_catalog.char_length(pg_catalog.btrim(p_note)) > 500 then
    raise exception 'invalid manual backup record';
  end if;

  insert into public.backup_logs(created_by, scope, status, note)
  values (v_actor, p_scope, 'manual_verified', pg_catalog.btrim(p_note))
  returning id into v_id;

  insert into public.admin_audit_logs(actor, action, detail)
  values (
    v_actor,
    'manual_backup_attested',
    pg_catalog.jsonb_build_object('backup_log_id', v_id, 'scope', p_scope)
  );

  return v_id;
end;
$function$;

revoke all on function public.admin_backup_overview() from public, anon;
grant execute on function public.admin_backup_overview() to authenticated;
revoke all on function public.admin_record_manual_backup(text, text) from public, anon;
grant execute on function public.admin_record_manual_backup(text, text) to authenticated;

commit;
