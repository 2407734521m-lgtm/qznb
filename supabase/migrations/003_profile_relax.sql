-- 003: 用户名放开（可重复、格式自由）+ 真实姓名（仅本人和管理员可见）
-- 注意：用户名不再唯一，bootstrap_super_admin 按用户名查找时若有重名会命中多行；
-- 首个注册用户即超管，当时尚无重名，之后请用管理后台改角色。

-- 1. 去掉用户名唯一约束和格式校验，保留非空；长度放宽到 30
alter table public.profiles drop constraint if exists profiles_username_key;
alter table public.profiles drop constraint if exists profiles_username_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_len') then
    alter table public.profiles add constraint profiles_username_len
      check (char_length(username) between 1 and 30);
  end if;
end $$;

-- 2. 真实姓名列：p_sel 策略只允许本人和管理员 select 整行，
--    member_directory / member_detail 函数不返回该列，普通成员不可见
alter table public.profiles add column if not exists real_name text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_real_name_len') then
    alter table public.profiles add constraint profiles_real_name_len
      check (real_name is null or char_length(real_name) <= 30);
  end if;
end $$;

-- 3. 注册触发器同时写入真实姓名（取自 signup metadata.real_name）
create or replace function public.handle_new_user() returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into profiles(id, username, real_name)
  values (new.id, new.raw_user_meta_data->>'username',
          nullif(trim(new.raw_user_meta_data->>'real_name'), ''));
  insert into profile_privacy(profile_id) values (new.id);
  insert into profile_contacts(profile_id) values (new.id);
  return new;
end $$;
