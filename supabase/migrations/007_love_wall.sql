-- Love wall: anonymous public display, identifiable to administrators only.
create table if not exists public.love_wall_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  recipient_name text,
  category text not null default '暗恋心事' check (category in ('暗恋心事','认真表白','感谢与祝福','毕业寄语')),
  content text not null check (char_length(content) between 2 and 500),
  is_anonymous boolean not null default true,
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists love_wall_posts_status_created_idx on public.love_wall_posts(status, created_at desc);
create index if not exists love_wall_posts_author_created_idx on public.love_wall_posts(author_id, created_at desc);
alter table public.love_wall_posts enable row level security;
drop policy if exists love_wall_read on public.love_wall_posts;
create policy love_wall_read on public.love_wall_posts for select to authenticated
using (status = 'published' or author_id = auth.uid() or public.my_role() in ('admin','super_admin'));
drop policy if exists love_wall_insert on public.love_wall_posts;
create policy love_wall_insert on public.love_wall_posts for insert to authenticated
with check (author_id = auth.uid() and status = 'pending');
drop policy if exists love_wall_admin_update on public.love_wall_posts;
create policy love_wall_admin_update on public.love_wall_posts for update to authenticated
using (public.my_role() in ('admin','super_admin'))
with check (public.my_role() in ('admin','super_admin'));
grant select, insert on public.love_wall_posts to authenticated;
grant update on public.love_wall_posts to authenticated;
