-- 可重复执行。在 Supabase 控制台 SQL Editor 中整段运行。
create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  role text not null default 'member' check (role in ('super_admin','admin','member')),
  joined boolean not null default false,
  display_name text check (char_length(display_name) <= 30),
  age int check (age between 5 and 120),
  personality text check (char_length(personality) <= 60),
  signature text check (char_length(signature) <= 80),
  bio text check (char_length(bio) <= 1000),
  hobbies text check (char_length(hobbies) <= 200),
  avatar_path text,
  theme jsonb not null default '{"theme":"aurora","layout":"left"}',
  created_at timestamptz not null default now()
);
create table if not exists public.profile_privacy (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  show_name bool not null default true, show_age bool not null default true,
  show_personality bool not null default true, show_signature bool not null default true,
  show_bio bool not null default true, show_hobbies bool not null default true,
  show_avatar bool not null default true,
  show_contact bool not null default false, show_social bool not null default false
);
create table if not exists public.profile_contacts (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  contact text check (char_length(contact) <= 100),
  social text check (char_length(social) <= 100)
);
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1), invite_code text
);
create table if not exists public.admin_audit_logs (
  id bigserial primary key, actor uuid, action text not null, target uuid,
  detail jsonb, created_at timestamptz not null default now()
);
