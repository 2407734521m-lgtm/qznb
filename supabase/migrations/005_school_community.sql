-- 005: school-wide community, class membership and scoped forum posts.
-- TEST BRANCH ONLY. Review and test against a disposable Supabase project before applying.
-- This migration intentionally does not run automatically from the website.
begin;

create extension if not exists pgcrypto with schema extensions;

-- Fix the registration trigger after the earlier 004_v2 migration overwrote
-- the duplicate-display-name fix. Keep username unique internally; the form name
-- belongs in display_name. Preserve the email mapping used by existing login flows.
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists real_name text;

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

insert into public.profile_emails(profile_id, email)
select u.id, u.email from auth.users u
where u.email is not null
on conflict (profile_id) do update set email = excluded.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  visible_name text;
  real_name_value text;
  internal_name text;
begin
  visible_name := nullif(trim(new.raw_user_meta_data->>'username'), '');
  real_name_value := nullif(trim(new.raw_user_meta_data->>'real_name'), '');
  if visible_name is null then
    raise exception 'display name is required';
  end if;
  if char_length(visible_name) > 30 then
    raise exception 'display name must be 30 characters or fewer';
  end if;

  internal_name := 'member_' || substring(replace(new.id::text, '-', '') from 1 for 22);
  insert into public.profiles(id, username, display_name, real_name)
  values (new.id, internal_name, visible_name, real_name_value);
  insert into public.profile_emails(profile_id, email)
  values (new.id, new.email)
  on conflict (profile_id) do update set email = excluded.email;
  insert into public.profile_privacy(profile_id) values (new.id)
  on conflict (profile_id) do nothing;
  insert into public.profile_contacts(profile_id) values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

-- Organization hierarchy.
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.school_memberships (
  school_id uuid not null references public.schools(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','school_admin','member')),
  status text not null default 'pending' check (status in ('pending','active','rejected','suspended')),
  created_at timestamptz not null default now(),
  primary key (school_id, profile_id)
);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id)
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  grade_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 60),
  description text check (description is null or char_length(description) <= 500),
  created_by uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id),
  foreign key (grade_id, school_id) references public.grades(id, school_id) on delete restrict
);

create table if not exists public.class_memberships (
  class_id uuid not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('class_admin','member')),
  status text not null default 'active' check (status in ('pending','active','rejected','suspended')),
  created_at timestamptz not null default now(),
  primary key (class_id, profile_id)
);

create table if not exists public.class_invites (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.class_join_requests (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  invite_id uuid references public.class_invites(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  message text check (message is null or char_length(message) <= 300),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists class_join_requests_one_pending
  on public.class_join_requests(class_id, profile_id) where status = 'pending';

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 50),
  slug text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  description text check (description is null or char_length(description) <= 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, slug)
);

alter table public.posts add column if not exists school_id uuid references public.schools(id) on delete cascade;
alter table public.posts add column if not exists class_id uuid references public.classes(id) on delete cascade;
alter table public.posts add column if not exists topic_id uuid references public.topics(id) on delete set null;
alter table public.posts add constraint posts_class_requires_school
  check (class_id is null or school_id is not null) not valid;
create index if not exists posts_school_created_idx on public.posts(school_id, created_at desc);
create index if not exists posts_class_created_idx on public.posts(class_id, created_at desc);
create index if not exists class_memberships_profile_status_idx on public.class_memberships(profile_id, status);
create index if not exists school_memberships_profile_status_idx on public.school_memberships(profile_id, status);
create index if not exists class_join_requests_admin_idx on public.class_join_requests(class_id, status, created_at);

-- Security-definer helpers avoid recursive RLS checks on membership tables.
create or replace function public.is_school_member(target_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_memberships sm
    where sm.school_id = target_school and sm.profile_id = auth.uid() and sm.status = 'active'
  )
$$;

create or replace function public.is_class_member(target_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_memberships cm
    join public.classes c on c.id = cm.class_id
    join public.school_memberships sm on sm.school_id = c.school_id and sm.profile_id = cm.profile_id
    where cm.class_id = target_class and cm.profile_id = auth.uid()
      and cm.status = 'active' and sm.status = 'active'
  )
$$;

create or replace function public.can_manage_school(target_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin','super_admin') or exists (
    select 1 from public.school_memberships sm
    where sm.school_id = target_school and sm.profile_id = auth.uid()
      and sm.status = 'active' and sm.role in ('owner','school_admin')
  )
$$;

create or replace function public.can_manage_class(target_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role() in ('admin','super_admin') or exists (
    select 1 from public.class_memberships cm
    where cm.class_id = target_class and cm.profile_id = auth.uid()
      and cm.status = 'active' and cm.role = 'class_admin'
  ) or exists (
    select 1 from public.classes c
    join public.school_memberships sm on sm.school_id = c.school_id
    where c.id = target_class and sm.profile_id = auth.uid()
      and sm.status = 'active' and sm.role in ('owner','school_admin')
  )
$$;

-- School and class creation are server-validated; client roles cannot self-assign admin rights.
create or replace function public.create_school(p_name text, p_slug text, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $
declare school_id_value uuid;
begin
  if auth.uid() is null or public.my_role() not in ('admin','super_admin') then
    raise exception 'forbidden';
  end if;
  insert into public.schools(name, slug, description, created_by)
  values (trim(p_name), lower(trim(p_slug)), nullif(trim(p_description), ''), auth.uid())
  returning id into school_id_value;
  insert into public.school_memberships(school_id, profile_id, role, status)
  values (school_id_value, auth.uid(), 'owner', 'active')
  on conflict (school_id, profile_id) do update set role = 'owner', status = 'active';
  return school_id_value;
end;
$;

create or replace function public.create_class(
  p_school_id uuid, p_name text, p_grade_id uuid default null, p_description text default null
) returns uuid language plpgsql security definer set search_path = public as $
declare class_id_value uuid;
begin
  if auth.uid() is null or not public.can_manage_school(p_school_id) then
    raise exception 'forbidden';
  end if;
  if p_grade_id is not null and not exists (
    select 1 from public.grades g where g.id = p_grade_id and g.school_id = p_school_id
  ) then raise exception 'grade does not belong to this school'; end if;
  insert into public.classes(school_id, grade_id, name, description, created_by)
  values (p_school_id, p_grade_id, trim(p_name), nullif(trim(p_description), ''), auth.uid())
  returning id into class_id_value;
  return class_id_value;
end;
$;

-- Invitations are created through a manager-only RPC; raw codes are never stored.
create or replace function public.create_class_invite(
  p_class_id uuid, p_code text, p_expires_at timestamptz default null, p_max_uses integer default null
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if auth.uid() is null or not public.can_manage_class(p_class_id) then raise exception 'forbidden'; end if;
  if p_code is null or char_length(trim(p_code)) < 6 or char_length(trim(p_code)) > 80 then
    raise exception 'invalid invite code';
  end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'invalid max uses'; end if;
  insert into public.class_invites(class_id, code_hash, created_by, expires_at, max_uses)
  values (p_class_id, encode(digest(trim(p_code), 'sha256'), 'hex'), auth.uid(), p_expires_at, p_max_uses)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.request_class_join(p_code text, p_message text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare invite_row public.class_invites%rowtype; request_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_member() then raise exception 'site membership required'; end if;
  if p_code is null or char_length(trim(p_code)) < 6 then return null; end if;
  select * into invite_row from public.class_invites
  where code_hash = encode(digest(trim(p_code), 'sha256'), 'hex')
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses)
  for update;
  if not found then return null; end if;
  if exists (select 1 from public.class_memberships where class_id = invite_row.class_id
      and profile_id = auth.uid() and status = 'active') then
    raise exception 'already a class member';
  end if;
  insert into public.class_join_requests(class_id, profile_id, invite_id, message)
  values (invite_row.class_id, auth.uid(), invite_row.id, nullif(trim(p_message), ''))
  returning id into request_id;
  update public.class_invites set use_count = use_count + 1 where id = invite_row.id;
  return request_id;
exception when unique_violation then
  raise exception 'a pending request already exists';
end;
$$;

create or replace function public.review_class_join(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare req public.class_join_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into req from public.class_join_requests where id = p_request_id for update;
  if not found or not public.can_manage_class(req.class_id) then raise exception 'forbidden'; end if;
  if req.status <> 'pending' then raise exception 'request is no longer pending'; end if;
  update public.class_join_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_request_id;
  if p_approve then
    insert into public.class_memberships(class_id, profile_id, role, status)
    values (req.class_id, req.profile_id, 'member', 'active')
    on conflict (class_id, profile_id) do update set status = 'active';
    insert into public.school_memberships(school_id, profile_id, role, status)
    select c.school_id, req.profile_id, 'member', 'active'
    from public.classes c where c.id = req.class_id
    on conflict (school_id, profile_id) do update
      set status = 'active', role = case when public.school_memberships.role in ('owner','school_admin')
                                         then public.school_memberships.role else 'member' end;
  end if;
end;
$$;

create or replace function public.set_school_admin(p_school_id uuid, p_profile_id uuid, p_make_admin boolean)
returns void language plpgsql security definer set search_path = public as $
begin
  if auth.uid() is null or public.my_role() <> 'super_admin' then raise exception 'forbidden'; end if;
  if not exists (select 1 from public.school_memberships
      where school_id = p_school_id and profile_id = p_profile_id and status = 'active') then
    raise exception 'target must be an active school member';
  end if;
  update public.school_memberships
  set role = case when p_make_admin then 'school_admin' else 'member' end
  where school_id = p_school_id and profile_id = p_profile_id and role <> 'owner';
  if not found then raise exception 'owner role cannot be changed here'; end if;
end;
$;

create or replace function public.set_class_admin(p_class_id uuid, p_profile_id uuid, p_make_admin boolean)
returns void language plpgsql security definer set search_path = public as $
declare school_id_value uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select school_id into school_id_value from public.classes where id = p_class_id;
  if school_id_value is null or not public.can_manage_school(school_id_value) then raise exception 'forbidden'; end if;
  update public.class_memberships
  set role = case when p_make_admin then 'class_admin' else 'member' end
  where class_id = p_class_id and profile_id = p_profile_id and status = 'active';
  if not found then raise exception 'target must be an active class member'; end if;
end;
$;

-- Enable RLS and grant only the operations that are checked by the policies.
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.grades enable row level security;
alter table public.classes enable row level security;
alter table public.class_memberships enable row level security;
alter table public.class_invites enable row level security;
alter table public.class_join_requests enable row level security;
alter table public.topics enable row level security;

revoke all on public.schools, public.school_memberships, public.grades, public.classes,
  public.class_memberships, public.class_invites, public.class_join_requests, public.topics from anon, authenticated;
grant select on public.schools, public.grades, public.classes, public.class_memberships, public.class_join_requests, public.topics to authenticated;
grant select on public.school_memberships to authenticated;
grant update, delete on public.schools to authenticated;
grant insert, update, delete on public.grades, public.classes, public.topics to authenticated;
grant select, insert, update, delete on public.posts to authenticated;

drop policy if exists schools_sel on public.schools;
create policy schools_sel on public.schools for select to authenticated
  using (created_by = auth.uid() or public.is_school_member(id) or public.my_role() in ('admin','super_admin'));
drop policy if exists schools_manage on public.schools;
create policy schools_manage on public.schools for all to authenticated
  using (public.can_manage_school(id))
  with check (public.can_manage_school(id));

drop policy if exists school_memberships_sel on public.school_memberships;
create policy school_memberships_sel on public.school_memberships for select to authenticated
  using (profile_id = auth.uid() or public.can_manage_school(school_id));
drop policy if exists grades_sel on public.grades;
create policy grades_sel on public.grades for select to authenticated
  using (public.is_school_member(school_id) or public.can_manage_school(school_id));
drop policy if exists grades_manage on public.grades;
create policy grades_manage on public.grades for all to authenticated
  using (public.can_manage_school(school_id)) with check (public.can_manage_school(school_id));

drop policy if exists classes_sel on public.classes;
create policy classes_sel on public.classes for select to authenticated
  using (public.is_school_member(school_id) or public.can_manage_school(school_id));
drop policy if exists classes_manage on public.classes;
create policy classes_manage on public.classes for all to authenticated
  using (public.can_manage_school(school_id)) with check (public.can_manage_school(school_id));

drop policy if exists class_memberships_sel on public.class_memberships;
create policy class_memberships_sel on public.class_memberships for select to authenticated
  using (profile_id = auth.uid() or public.is_class_member(class_id) or public.can_manage_class(class_id));
drop policy if exists class_invites_sel on public.class_invites;
create policy class_invites_sel on public.class_invites for select to authenticated
  using (public.can_manage_class(class_id));
drop policy if exists class_join_requests_sel on public.class_join_requests;
create policy class_join_requests_sel on public.class_join_requests for select to authenticated
  using (profile_id = auth.uid() or public.can_manage_class(class_id));
drop policy if exists topics_sel on public.topics;
create policy topics_sel on public.topics for select to authenticated
  using (public.is_school_member(school_id) or public.can_manage_school(school_id));
drop policy if exists topics_manage on public.topics;
create policy topics_manage on public.topics for all to authenticated
  using (public.can_manage_school(school_id)) with check (public.can_manage_school(school_id));

-- Preserve access to legacy posts (scope columns are NULL), but require explicit
-- school/class membership for newly scoped posts.
drop policy if exists p_sel on public.posts;
create policy p_sel on public.posts for select to authenticated using (
  public.is_member() and (
    (school_id is null and class_id is null)
    or (school_id is not null and class_id is null and public.is_school_member(school_id))
    or (school_id is not null and class_id is not null
        and exists (select 1 from public.classes c where c.id = posts.class_id and c.school_id = posts.school_id)
        and public.is_school_member(school_id) and public.is_class_member(class_id))
  )
);
drop policy if exists p_ins on public.posts;
create policy p_ins on public.posts for insert to authenticated with check (
  public.is_member() and author_id = auth.uid() and (
    (school_id is null and class_id is null)
    or (school_id is not null and class_id is null and public.is_school_member(school_id))
    or (school_id is not null and class_id is not null
        and exists (select 1 from public.classes c where c.id = posts.class_id and c.school_id = posts.school_id)
        and public.is_school_member(school_id) and public.is_class_member(class_id))
  )
);
drop policy if exists p_mod on public.posts;
create policy p_mod on public.posts for update to authenticated
  using (author_id = auth.uid() or public.my_role() in ('admin','super_admin'))
  with check (
    (author_id = auth.uid() or public.my_role() in ('admin','super_admin')) and (
      (school_id is null and class_id is null)
      or (school_id is not null and class_id is null and public.is_school_member(school_id))
      or (school_id is not null and class_id is not null
          and exists (select 1 from public.classes c where c.id = posts.class_id and c.school_id = posts.school_id)
          and public.is_school_member(school_id) and public.is_class_member(class_id))
    )
  );
drop policy if exists p_del on public.posts;
create policy p_del on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.my_role() in ('admin','super_admin'));

revoke all on function public.is_school_member(uuid), public.is_class_member(uuid),
  public.can_manage_school(uuid), public.can_manage_class(uuid),
  public.create_school(text,text,text), public.create_class(uuid,text,uuid,text),
  public.create_class_invite(uuid,text,timestamptz,integer),
  public.request_class_join(text,text), public.review_class_join(uuid,boolean),
  public.set_school_admin(uuid,uuid,boolean), public.set_class_admin(uuid,uuid,boolean)
  from public, anon;
grant execute on function public.is_school_member(uuid), public.is_class_member(uuid),
  public.can_manage_school(uuid), public.can_manage_class(uuid),
  public.create_school(text,text,text), public.create_class(uuid,text,uuid,text),
  public.create_class_invite(uuid,text,timestamptz,integer),
  public.request_class_join(text,text), public.review_class_join(uuid,boolean),
  public.set_school_admin(uuid,uuid,boolean), public.set_class_admin(uuid,uuid,boolean)
  to authenticated;

commit;
