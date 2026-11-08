-- 注册表单改版配套：profiles 新增手机号列（选填），注册触发器从
-- signUp 元数据里把 phone 写入。纯新增：新列默认 NULL，不影响存量账号；
-- 回滚：恢复旧版 handle_new_user 函数体（见迁移前定义）并 drop 列。

alter table public.profiles add column if not exists phone text;

alter table public.profiles drop constraint if exists profiles_phone_format;
alter table public.profiles add constraint profiles_phone_format
  check (phone is null or phone ~ '^1[0-9]{10}$');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, username, real_name, phone)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1)),
      nullif(trim(new.raw_user_meta_data->>'real_name'), ''),
      case when coalesce(new.raw_user_meta_data->>'phone', '') ~ '^1[0-9]{10}$'
           then new.raw_user_meta_data->>'phone' else null end
    );
  insert into public.profile_emails (profile_id, email)
    values (new.id, new.email)
    on conflict (profile_id) do update set email = excluded.email;
  insert into public.profile_privacy (profile_id) values (new.id)
    on conflict (profile_id) do nothing;
  insert into public.profile_contacts (profile_id) values (new.id)
    on conflict (profile_id) do nothing;
  return new;
end $function$;
