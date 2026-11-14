-- 网易云登录跨设备同步（绑定到本站 Supabase 账号）
-- 文件名：supabase/migrations/20261114120000_netease_account_link.sql
-- 幂等、可重跑。
-- 设计要点：
--   * 每本站账号最多绑定 1 个网易云账号：site_user_id 既是主键又是 FK。
--   * 只存 AES-GCM 密文（base64）+ IV（base64），绝不存明文 cookie；
--     密钥放 Cloudflare Worker secret NETEASE_SYNC_KEY，不进仓库、不进 SQL。
--   * 直连 Supabase 的 anon/authenticated 一律无权读写本表；
--     只有 Worker 用 service_role 经 PostgREST 读写（service_role 天然绕过 RLS），
--     且 Worker 每次先走 /auth/v1/user 验本站 token，再按 token 里的 id 读写。

create table if not exists public.netease_account_links (
  site_user_id uuid primary key references auth.users (id) on delete cascade,
  netease_user_id text not null check (netease_user_id <> ''),
  nickname text not null default '',
  avatar_url text not null default '',
  cookie_ciphertext text not null check (cookie_ciphertext <> ''),
  cookie_iv text not null check (cookie_iv <> ''),
  key_version smallint not null default 1 check (key_version >= 1),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.netease_account_links enable row level security;

-- 拒绝一切直连访问：不建任何 permissive policy；service_role 绕过 RLS，
-- anon/authenticated 即使拿到表名也读不到、写不了（PostgREST 会回 0 行 / 42501）。
-- 注意：不要给本表补“authenticated 可读自己行”的策略，否则任何登了本站的
-- 浏览器都能直接调 PostgREST 读走自己的密文行（虽仍加密，但扩大了面）。
revoke all on table public.netease_account_links from anon, authenticated;
grant all on table public.netease_account_links to service_role;

-- updated_at 自动维护（沿用 20261101121500 的 touch_* 写法，函数名加表前缀防撞）。
create or replace function public.touch_netease_account_links_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.touch_netease_account_links_updated_at() from public, anon, authenticated;

drop trigger if exists netease_account_links_touch_updated_at
  on public.netease_account_links;
create trigger netease_account_links_touch_updated_at
  before update on public.netease_account_links
  for each row execute function public.touch_netease_account_links_updated_at();
