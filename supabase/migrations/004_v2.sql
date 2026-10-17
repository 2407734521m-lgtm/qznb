-- 004_v2: 灵活登录 + 青春时间线 + 班级相册 + 班级动态
-- 在 Supabase SQL 编辑器中运行（postgres 身份）

-- ============ 1. 登录邮箱映射表（独立表，避免 member_detail 泄露邮箱） ============
create table if not exists public.profile_emails (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null
);
alter table public.profile_emails enable row level security;
revoke all on public.profile_emails from anon, authenticated;
grant select on public.profile_emails to authenticated;
drop policy if exists pe_sel on public.profile_emails;
create policy pe_sel on public.profile_emails for select to authenticated
  using (profile_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));

-- ============ 2. handle_new_user：同时写入邮箱映射 ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, real_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1)),
    nullif(trim(new.raw_user_meta_data->>'real_name'), '')
  );
  insert into public.profile_emails (profile_id, email)
  values (new.id, new.email)
  on conflict (profile_id) do update set email = excluded.email;
  insert into public.profile_privacy (profile_id) values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end $$;

-- 已有用户回填邮箱映射（直接读 auth.users，SQL 编辑器是 postgres 身份）
insert into public.profile_emails (profile_id, email)
select u.id, u.email from auth.users u
left join public.profile_emails e on e.profile_id = u.id
where e.profile_id is null and u.email is not null
on conflict (profile_id) do nothing;

-- ============ 3. 登录解析：用户名 / 真实姓名 / 邮箱 -> 邮箱 ============
create or replace function public.resolve_login_email(ident text)
returns text language sql stable security definer set search_path = public as $$
  select e.email
  from public.profiles p
  join public.profile_emails e on e.profile_id = p.id
  where p.username = ident or p.real_name = ident
  order by case when p.username = ident then 0 else 1 end, p.created_at desc
  limit 1
$$;
revoke all on function public.resolve_login_email(text) from public, anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- ============ 4. 青春时间线 ============
create table if not exists public.timelines (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  happened_on date not null,
  title text not null check (char_length(title) between 1 and 80),
  content text check (content is null or char_length(content) <= 2000),
  media_url text,
  created_at timestamptz not null default now()
);
alter table public.timelines enable row level security;
revoke all on public.timelines from anon, authenticated;
grant select, insert, update, delete on public.timelines to authenticated;
drop policy if exists t_sel on public.timelines;
drop policy if exists t_ins on public.timelines;
drop policy if exists t_mod on public.timelines;
create policy t_sel on public.timelines for select to authenticated
  using (profile_id = auth.uid()
     or (public.is_member() and exists
           (select 1 from public.profiles p where p.id = timelines.profile_id and p.joined)));
create policy t_ins on public.timelines for insert to authenticated
  with check (profile_id = auth.uid());
create policy t_mod on public.timelines for update to authenticated
  using (profile_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));
drop policy if exists t_del on public.timelines;
create policy t_del on public.timelines for delete to authenticated
  using (profile_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));

-- ============ 5. 班级相册 ============
create table if not exists public.albums (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 60),
  category text not null default '班级日常' check (char_length(category) between 1 and 20),
  cover_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.album_photos (
  id bigint generated always as identity primary key,
  album_id bigint not null references public.albums(id) on delete cascade,
  photo_url text not null,
  caption text check (caption is null or char_length(caption) <= 200),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.albums enable row level security;
alter table public.album_photos enable row level security;
revoke all on public.albums from anon, authenticated;
revoke all on public.album_photos from anon, authenticated;
grant select, insert, update, delete on public.albums to authenticated;
grant select, insert, update, delete on public.album_photos to authenticated;
drop policy if exists ab_sel on public.albums;
drop policy if exists ab_ins on public.albums;
drop policy if exists ab_mod on public.albums;
create policy ab_sel on public.albums for select to authenticated using (public.is_member());
create policy ab_ins on public.albums for insert to authenticated
  with check (public.is_member() and created_by = auth.uid());
create policy ab_mod on public.albums for update to authenticated
  using (created_by = auth.uid() or public.my_role() in ('admin', 'super_admin'));
drop policy if exists ab_del on public.albums;
create policy ab_del on public.albums for delete to authenticated
  using (created_by = auth.uid() or public.my_role() in ('admin', 'super_admin'));
drop policy if exists ap_sel on public.album_photos;
drop policy if exists ap_ins on public.album_photos;
drop policy if exists ap_del on public.album_photos;
create policy ap_sel on public.album_photos for select to authenticated using (public.is_member());
create policy ap_ins on public.album_photos for insert to authenticated
  with check (public.is_member() and uploaded_by = auth.uid());
create policy ap_del on public.album_photos for delete to authenticated
  using (uploaded_by = auth.uid() or public.my_role() in ('admin', 'super_admin'));

-- ============ 6. 班级动态 ============
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  image_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);
create table if not exists public.post_likes (
  post_id bigint not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
revoke all on public.posts from anon, authenticated;
revoke all on public.comments from anon, authenticated;
revoke all on public.post_likes from anon, authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
drop policy if exists p_sel on public.posts;
drop policy if exists p_ins on public.posts;
drop policy if exists p_mod on public.posts;
create policy p_sel on public.posts for select to authenticated using (public.is_member());
create policy p_ins on public.posts for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());
create policy p_mod on public.posts for update to authenticated using (author_id = auth.uid());
drop policy if exists p_del on public.posts;
create policy p_del on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));
drop policy if exists c_sel on public.comments;
drop policy if exists c_ins on public.comments;
drop policy if exists c_del on public.comments;
create policy c_sel on public.comments for select to authenticated using (public.is_member());
create policy c_ins on public.comments for insert to authenticated
  with check (public.is_member() and author_id = auth.uid());
create policy c_del on public.comments for delete to authenticated
  using (author_id = auth.uid() or public.my_role() in ('admin', 'super_admin'));
drop policy if exists l_sel on public.post_likes;
drop policy if exists l_ins on public.post_likes;
drop policy if exists l_del on public.post_likes;
create policy l_sel on public.post_likes for select to authenticated using (public.is_member());
create policy l_ins on public.post_likes for insert to authenticated
  with check (public.is_member() and profile_id = auth.uid());
create policy l_del on public.post_likes for delete to authenticated
  using (profile_id = auth.uid());

-- ============ 7. media 存储桶（相册/动态/时间线媒体） ============
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 10485760)
on conflict (id) do update set file_size_limit = 10485760;
drop policy if exists media_ins on storage.objects;
drop policy if exists media_sel on storage.objects;
drop policy if exists media_del on storage.objects;
create policy media_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_sel on storage.objects for select to authenticated
  using (bucket_id = 'media'
    and (public.is_member() or (storage.foldername(name))[1] = auth.uid()::text));
create policy media_del on storage.objects for delete to authenticated
  using (bucket_id = 'media'
    and ((storage.foldername(name))[1] = auth.uid()::text
      or public.my_role() in ('admin', 'super_admin')));
