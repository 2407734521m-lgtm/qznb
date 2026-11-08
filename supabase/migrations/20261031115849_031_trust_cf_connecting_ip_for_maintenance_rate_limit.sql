-- 031: Use Cloudflare's edge-provided client IP for maintenance-code throttling.
-- X-Forwarded-For can contain client-supplied values and must not be trusted
-- as the primary rate-limit identity.

create or replace function maintenance_private.maintenance_redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, maintenance_private, extensions
as $fn$
declare
  v_headers jsonb;
  v_ip inet;
  v_ip_text text;
  v_code maintenance_private.access_codes%rowtype;
  v_token text;
begin
  v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);

  -- Cloudflare overwrites CF-Connecting-IP at its edge. The qznb-api Worker
  -- forwards the original header to Supabase. Never fall back to X-Forwarded-For.
  v_ip_text := nullif(btrim(v_headers->>'cf-connecting-ip'), '');
  if v_ip_text is null then
    return jsonb_build_object('ok', false, 'message', '无法验证请求来源，请通过官方网站重试');
  end if;
  begin
    v_ip := v_ip_text::inet;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'message', '无法验证请求来源，请通过官方网站重试');
  end;

  delete from maintenance_private.access_attempts where attempted_at < now() - interval '1 day';
  perform pg_advisory_xact_lock(hashtext(v_ip::text));
  if (select count(*) from maintenance_private.access_attempts
      where client_ip = v_ip and attempted_at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'message', '尝试次数过多，请 15 分钟后再试');
  end if;

  if p_code is null or p_code !~ '^[0-9]{6}$' then
    insert into maintenance_private.access_attempts(client_ip) values (v_ip);
    return jsonb_build_object('ok', false, 'message', '验证码无效、已过期或已撤销');
  end if;

  select * into v_code
  from maintenance_private.access_codes
  where code_hash = encode(extensions.digest(convert_to(p_code, 'UTF8'), 'sha256'), 'hex')
    and revoked_at is null and expires_at > now() and used_count < max_uses
  for update;

  if not found then
    insert into maintenance_private.access_attempts(client_ip) values (v_ip);
    return jsonb_build_object('ok', false, 'message', '验证码无效、已过期或已撤销');
  end if;

  update maintenance_private.access_codes set used_count = used_count + 1 where id = v_code.id;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into maintenance_private.access_sessions(code_id, token_hash, expires_at)
  values (v_code.id, encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'), v_code.expires_at);

  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_code.expires_at);
end;
$fn$;
