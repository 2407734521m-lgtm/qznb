-- 015_secure_admin_rpc_permissions.sql
-- Harden admin-only SECURITY DEFINER RPCs against anonymous calls and NULL-role bypass.
begin;

-- Remove implicit PUBLIC/anon execution from admin-only RPCs; keep signed-in app
-- calls working, and retain service_role for trusted backend administration.
revoke execute on function public.admin_update_profile(uuid,text,text,text,text,text,text,integer,text) from public, anon;
grant execute on function public.admin_update_profile(uuid,text,text,text,text,text,text,integer,text) to authenticated, service_role;
revoke execute on function public.create_invite_code(text,text) from public, anon;
grant execute on function public.create_invite_code(text,text) to authenticated, service_role;
revoke execute on function public.delete_invite_code(bigint) from public, anon;
grant execute on function public.delete_invite_code(bigint) to authenticated, service_role;
revoke execute on function public.delete_member(uuid) from public, anon;
grant execute on function public.delete_member(uuid) to authenticated, service_role;
revoke execute on function public.log_admin_action(text,text) from public, anon;
grant execute on function public.log_admin_action(text,text) to authenticated, service_role;
revoke execute on function public.review_game_profile(uuid,boolean) from public, anon;
grant execute on function public.review_game_profile(uuid,boolean) to authenticated, service_role;
revoke execute on function public.set_invite_code(text) from public, anon;
grant execute on function public.set_invite_code(text) to authenticated, service_role;
revoke execute on function public.set_invite_code_active(bigint,boolean) from public, anon;
grant execute on function public.set_invite_code_active(bigint,boolean) to authenticated, service_role;
revoke execute on function public.set_invite_settings(text,text) from public, anon;
grant execute on function public.set_invite_settings(text,text) to authenticated, service_role;
revoke execute on function public.set_joined(uuid,boolean) from public, anon;
grant execute on function public.set_joined(uuid,boolean) to authenticated, service_role;
revoke execute on function public.set_role(uuid,text) from public, anon;
grant execute on function public.set_role(uuid,text) to authenticated, service_role;

-- Explicitly reject missing identities/roles. In PL/pgSQL, IF NULL is not TRUE,
-- so a bare "my_role() <> 'super_admin'" is not a sufficient authorization check.
create or replace function public.create_invite_code(new_code text, nick text)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  if new_code is null or pg_catalog.btrim(new_code) = '' then
    raise exception 'code required';
  end if;
  insert into public.invite_codes (code, nickname, active, created_by)
  values (pg_catalog.btrim(new_code), nullif(pg_catalog.btrim(coalesce(nick, '')), ''), true, auth.uid());
  insert into public.admin_audit_logs(actor, action, detail)
  values (auth.uid(), 'create_invite_code',
          pg_catalog.jsonb_build_object('code', pg_catalog.btrim(new_code), 'nickname', nick));
end;
$function$;

create or replace function public.delete_invite_code(cid bigint)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  delete from public.invite_codes where id = cid;
  if not found then raise exception 'not found'; end if;
  insert into public.admin_audit_logs(actor, action, detail)
  values (auth.uid(), 'delete_invite_code', pg_catalog.jsonb_build_object('id', cid));
end;
$function$;

create or replace function public.delete_member(target uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare uname text;
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  if target = auth.uid() then raise exception 'cannot delete yourself'; end if;
  select username into uname from public.profiles where id = target;
  if not found then raise exception 'not found'; end if;
  delete from auth.users where id = target;
  insert into public.admin_audit_logs(actor, action, detail)
  values (auth.uid(), 'delete_member',
          pg_catalog.jsonb_build_object('target', target, 'username', uname));
end;
$function$;

create or replace function public.log_admin_action(p_action text, p_detail text default null)
returns void language plpgsql security definer set search_path to ''
as $function$
declare d jsonb;
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'not authorized';
  end if;
  begin
    d := coalesce(p_detail::jsonb, '{}'::jsonb);
  exception when others then
    d := pg_catalog.jsonb_build_object('raw', p_detail);
  end;
  d := d || pg_catalog.jsonb_build_object('_by', auth.uid()::text, '_at', now()::text);
  insert into public.admin_audit_logs (action, detail) values (p_action, d);
end;
$function$;

create or replace function public.review_game_profile(pid uuid, approve boolean)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'forbidden';
  end if;
  update public.game_profiles
  set status = case when approve then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(), updated_at = now()
  where profile_id = pid and status = 'pending';
  if not found then raise exception 'not found or not pending'; end if;
end;
$function$;

create or replace function public.set_invite_code(new_code text)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  if new_code is null or pg_catalog.char_length(pg_catalog.btrim(new_code)) < 4 then
    raise exception 'invalid code';
  end if;
  insert into public.app_settings(id, invite_code) values (1, pg_catalog.btrim(new_code))
  on conflict (id) do update set invite_code = excluded.invite_code;
  insert into public.admin_audit_logs(actor, action, detail)
  values (auth.uid(), 'set_invite_code',
          pg_catalog.jsonb_build_object('code', pg_catalog.btrim(new_code)));
end;
$function$;

create or replace function public.set_invite_code_active(cid bigint, active boolean)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  update public.invite_codes set active = set_invite_code_active.active where id = cid;
  if not found then raise exception 'not found'; end if;
end;
$function$;

create or replace function public.set_invite_settings(new_code text, nick text)
returns void language plpgsql security definer set search_path to ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') <> 'super_admin' then
    raise exception 'forbidden';
  end if;
  update public.app_settings
  set invite_code = nullif(pg_catalog.btrim(new_code), ''),
      invite_nickname = nullif(pg_catalog.btrim(nick), '')
  where id = 1;
  insert into public.admin_audit_logs(actor, action, detail)
  values (auth.uid(), 'set_invite_settings', pg_catalog.jsonb_build_object('nickname', nick));
end;
$function$;


-- A submitted intro video must remain pending until an administrator reviews it.
-- The previous implementation set the status to 'approved' on self-submission.
revoke execute on function public.submit_intro_video(text) from public, anon;
grant execute on function public.submit_intro_video(text) to authenticated, service_role;

create or replace function public.submit_intro_video(p_path text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_path is null or pg_catalog.btrim(p_path) = '' then
    raise exception 'video path required';
  end if;
  update public.profiles
  set intro_video_path = p_path, intro_video_status = 'pending'
  where id = auth.uid();
  if not found then raise exception 'profile not found'; end if;
end;
$function$;


-- Keep join-code redemption signed-in only and pin both remaining flagged
-- SECURITY DEFINER functions to an empty search_path.
revoke execute on function public.join_with_code(text) from public, anon;
grant execute on function public.join_with_code(text) to authenticated, service_role;

create or replace function public.join_with_code(code text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare r record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select ic.nickname into r
  from public.invite_codes ic
  where ic.code = join_with_code.code
    and ic.active = true
    and (ic.expires_at is null or ic.expires_at > now())
  limit 1;
  if found then
    update public.profiles set joined = true where id = auth.uid();
    return coalesce(r.nickname, '');
  end if;
  select s.invite_code, s.invite_nickname into r
  from public.app_settings s where s.id = 1;
  if r.invite_code is not null and r.invite_code = join_with_code.code then
    update public.profiles set joined = true where id = auth.uid();
    return coalesce(r.invite_nickname, '');
  end if;
  return null;
end;
$function$;

create or replace function public.member_video(uid uuid)
returns table(path text, status text)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  return query
  select p.intro_video_path, p.intro_video_status
  from public.profiles p
  where p.id = uid
    and p.intro_video_path is not null
    and (p.id = auth.uid() or p.intro_video_status = 'approved');
end;
$function$;

commit;
