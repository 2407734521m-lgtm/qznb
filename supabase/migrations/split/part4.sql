
-- 他人资料只能通过下面的函数读取，服务端按隐私开关裁剪字段。
create or replace function public.member_directory(q text default '', lim int default 12, skip int default 0)
returns table(id uuid, username text, display_name text, personality text, signature text, avatar_path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text,
    case when pr.show_name then p.display_name end,
    case when pr.show_personality then p.personality end,
    case when pr.show_signature then p.signature end,
    case when pr.show_avatar then p.avatar_path end
  from profiles p join profile_privacy pr on pr.profile_id = p.id
  where public.is_member() and p.joined
    and (q = '' or p.username ilike '%' || q || '%'
      or (pr.show_name and p.display_name ilike '%' || q || '%')
      or (pr.show_personality and p.personality ilike '%' || q || '%'))
  order by p.created_at limit least(lim, 50) offset greatest(skip, 0)
$$;

create or replace function public.member_detail(uid uuid)
returns table(id uuid, username text, display_name text, age int, personality text, signature text,
  bio text, hobbies text, avatar_path text, theme jsonb, contact text, social text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text,
    case when pr.show_name then p.display_name end, case when pr.show_age then p.age end,
    case when pr.show_personality then p.personality end, case when pr.show_signature then p.signature end,
    case when pr.show_bio then p.bio end, case when pr.show_hobbies then p.hobbies end,
    case when pr.show_avatar then p.avatar_path end, p.theme,
    case when pr.show_contact then c.contact end, case when pr.show_social then c.social end
  from profiles p join profile_privacy pr on pr.profile_id = p.id join profile_contacts c on c.profile_id = p.id
  where p.id = uid and public.is_member() and p.joined
$$;

create or replace function public.username_available(u text) returns boolean language sql stable
security definer set search_path = public as $$ select not exists (select 1 from profiles where username = u) $$;

create or replace function public.join_class(code text) returns boolean language plpgsql
security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from app_settings where invite_code is not null and invite_code = code) then
    update profiles set joined = true where id = auth.uid();
    return true;
  end if;
  return false;
end $$;

create or replace function public.set_role(target uuid, new_role text) returns void language plpgsql
security definer set search_path = public as $$
declare old text;
begin
  if public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if new_role not in ('admin','member') then raise exception 'invalid role'; end if;
  if target = auth.uid() then raise exception 'cannot change own role'; end if;
  select role into old from profiles where id = target;
  if old is null or old = 'super_admin' then raise exception 'invalid target'; end if;
  update profiles set role = new_role where id = target;
  insert into admin_audit_logs(actor, action, target, detail)
    values (auth.uid(), 'set_role', target, jsonb_build_object('from', old, 'to', new_role));
end $$;
