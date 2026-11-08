-- Anonymous question box with strict identity separation.
create table if not exists public.anonymous_questions (
  id uuid primary key default gen_random_uuid(),
  asker_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 300),
  answer text check (answer is null or char_length(answer) <= 600),
  status text not null default 'pending' check (status in ('pending', 'answered')),
  is_public boolean not null default false,
  moderation_hidden boolean not null default false,
  moderation_note text,
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  asker_deleted_at timestamptz,
  recipient_deleted_at timestamptz,
  constraint anonymous_questions_no_self check (asker_id <> recipient_id),
  constraint anonymous_questions_answer_state check (
    (status = 'pending' and answer is null and answered_at is null and is_public = false)
    or (status = 'answered' and answer is not null and answered_at is not null)
  )
);
create index if not exists anonymous_questions_recipient_created_idx
  on public.anonymous_questions(recipient_id, created_at desc)
  where recipient_deleted_at is null;
create index if not exists anonymous_questions_asker_created_idx
  on public.anonymous_questions(asker_id, created_at desc)
  where asker_deleted_at is null;
create index if not exists anonymous_questions_public_idx
  on public.anonymous_questions(recipient_id, answered_at desc)
  where status = 'answered' and is_public = true and moderation_hidden = false
    and asker_deleted_at is null and recipient_deleted_at is null;

alter table public.anonymous_questions enable row level security;
revoke all on table public.anonymous_questions from public, anon, authenticated;

create or replace function public.submit_anonymous_question(p_recipient_id uuid, p_content text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_question_id uuid;
  v_content text := pg_catalog.btrim(coalesce(p_content, ''));
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_recipient_id is null or p_recipient_id = v_actor
     or pg_catalog.char_length(v_content) < 1 or pg_catalog.char_length(v_content) > 300 then
    raise exception 'invalid recipient or question content' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'member' and p.joined = true
  ) or not exists (
    select 1 from public.profiles p
    where p.id = p_recipient_id and p.role = 'member' and p.joined = true
  ) then
    raise exception 'only joined members can use anonymous questions' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_actor and b.blocked_id = p_recipient_id)
       or (b.blocker_id = p_recipient_id and b.blocked_id = v_actor)
  ) then
    raise exception 'this member is unavailable for anonymous questions' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text, 0));
  if (select count(*) from public.anonymous_questions q
      where q.asker_id = v_actor and q.created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.anonymous_questions q
      where q.asker_id = v_actor and q.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'anonymous question rate limit reached' using errcode = 'P0001';
  end if;

  insert into public.anonymous_questions(asker_id, recipient_id, question)
  values (v_actor, p_recipient_id, v_content)
  returning id into v_question_id;

  insert into public.notifications(profile_id, type, title, body, link, is_read)
  values (p_recipient_id, 'anonymous_question', '收到一条匿名提问',
          '有人给你发送了一条匿名问题，打开提问箱查看。', '/questions', false);
  return v_question_id;
end;
$function$;

create or replace function public.my_anonymous_question_inbox()
returns table (
  id uuid,
  question text,
  answer text,
  status text,
  is_public boolean,
  created_at timestamptz,
  answered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'member' and p.joined = true
  ) then
    raise exception 'joined member required' using errcode = '42501';
  end if;
  return query
  select q.id, q.question, q.answer, q.status, q.is_public, q.created_at, q.answered_at
  from public.anonymous_questions q
  where q.recipient_id = auth.uid()
    and q.recipient_deleted_at is null
    and q.moderation_hidden = false
  order by q.created_at desc
  limit 100;
end;
$function$;

create or replace function public.my_sent_anonymous_questions()
returns table (
  id uuid,
  question text,
  answer text,
  status text,
  created_at timestamptz,
  answered_at timestamptz,
  recipient_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'member' and p.joined = true
  ) then
    raise exception 'joined member required' using errcode = '42501';
  end if;
  return query
  select q.id, q.question, q.answer, q.status, q.created_at, q.answered_at,
         coalesce(nullif(p.display_name, ''), p.username::text)
  from public.anonymous_questions q
  join public.profiles p on p.id = q.recipient_id
  where q.asker_id = auth.uid()
    and q.asker_deleted_at is null
    and q.moderation_hidden = false
  order by q.created_at desc
  limit 100;
end;
$function$;

create or replace function public.public_anonymous_question_answers(p_profile_id uuid)
returns table (
  id uuid,
  question text,
  answer text,
  answered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_profile_id is null or not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.role = 'member' and p.joined = true
  ) then
    return;
  end if;
  return query
  select q.id, q.question, q.answer, q.answered_at
  from public.anonymous_questions q
  where q.recipient_id = p_profile_id
    and q.status = 'answered'
    and q.is_public = true
    and q.moderation_hidden = false
    and q.asker_deleted_at is null
    and q.recipient_deleted_at is null
  order by q.answered_at desc
  limit 100;
end;
$function$;

create or replace function public.answer_anonymous_question(
  p_question_id uuid,
  p_answer text,
  p_publish boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_asker uuid;
  v_notify_asker boolean := false;
  v_answer text := pg_catalog.btrim(coalesce(p_answer, ''));
begin
  if v_actor is null or p_question_id is null
     or not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'member' and p.joined = true
     ) then
    raise exception 'joined member required' using errcode = '42501';
  end if;
  if pg_catalog.char_length(v_answer) < 1 or pg_catalog.char_length(v_answer) > 600 then
    raise exception 'answer must be between 1 and 600 characters' using errcode = '22023';
  end if;
  select q.asker_id, q.asker_deleted_at is null into v_asker, v_notify_asker
  from public.anonymous_questions q
  where q.id = p_question_id
    and q.recipient_id = v_actor
    and q.status = 'pending'
    and q.recipient_deleted_at is null
    and q.moderation_hidden = false
  for update;
  if not found then
    raise exception 'question not found or already answered' using errcode = 'P0002';
  end if;
  update public.anonymous_questions
  set answer = v_answer, status = 'answered', is_public = coalesce(p_publish, false), answered_at = now()
  where id = p_question_id and recipient_id = v_actor;

  if v_notify_asker then
    insert into public.notifications(profile_id, type, title, body, link, is_read)
    values (v_asker, 'anonymous_answer', '你的匿名提问有了回答',
            '对方已回答你的匿名提问，打开“我发出的”查看。', '/questions', false);
  end if;
  return true;
end;
$function$;

create or replace function public.delete_anonymous_question(p_question_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null or p_question_id is null
     or not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'member' and p.joined = true
     ) then
    raise exception 'joined member required' using errcode = '42501';
  end if;
  update public.anonymous_questions
  set recipient_deleted_at = case when recipient_id = v_actor then now() else recipient_deleted_at end,
      asker_deleted_at = case when asker_id = v_actor then now() else asker_deleted_at end
  where id = p_question_id
    and (recipient_id = v_actor or asker_id = v_actor)
    and ((recipient_id = v_actor and recipient_deleted_at is null)
      or (asker_id = v_actor and asker_deleted_at is null));
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$function$;

create or replace function public.report_anonymous_question(p_question_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if v_actor is null or p_question_id is null
     or not exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'member' and p.joined = true
     )
     or pg_catalog.char_length(v_reason) < 1 or pg_catalog.char_length(v_reason) > 200 then
    raise exception 'invalid report' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.anonymous_questions q
    where q.id = p_question_id and (q.asker_id = v_actor or q.recipient_id = v_actor)
  ) then
    raise exception 'question not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.reports r
    where r.reporter_id = v_actor and r.target_type = 'anonymous_question'
      and r.target_id = p_question_id::text and r.status = 'pending'
  ) then
    raise exception 'this question has already been reported' using errcode = 'P0001';
  end if;
  insert into public.reports(reporter_id, target_type, target_id, reason, status)
  values (v_actor, 'anonymous_question', p_question_id::text, v_reason, 'pending');
  return true;
end;
$function$;

create or replace function public.admin_list_anonymous_questions()
returns table (
  id uuid,
  asker_id uuid,
  recipient_id uuid,
  question text,
  answer text,
  status text,
  is_public boolean,
  moderation_hidden boolean,
  created_at timestamptz,
  asker_name text,
  recipient_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  return query
  select q.id, q.asker_id, q.recipient_id, q.question, q.answer, q.status, q.is_public,
         q.moderation_hidden, q.created_at,
         coalesce(nullif(a.display_name, ''), a.username::text),
         coalesce(nullif(r.display_name, ''), r.username::text)
  from public.anonymous_questions q
  left join public.profiles a on a.id = q.asker_id
  left join public.profiles r on r.id = q.recipient_id
  order by q.created_at desc
  limit 200;
end;
$function$;

create or replace function public.admin_set_anonymous_question_hidden(p_question_id uuid, p_hidden boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_count integer;
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;
  if p_question_id is null or p_hidden is null then
    raise exception 'invalid moderation request' using errcode = '22023';
  end if;
  update public.anonymous_questions
  set moderation_hidden = p_hidden,
      moderated_by = v_actor,
      moderated_at = now()
  where id = p_question_id;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$function$;

revoke all on function public.submit_anonymous_question(uuid, text) from public, anon;
grant execute on function public.submit_anonymous_question(uuid, text) to authenticated;
revoke all on function public.my_anonymous_question_inbox() from public, anon;
grant execute on function public.my_anonymous_question_inbox() to authenticated;
revoke all on function public.my_sent_anonymous_questions() from public, anon;
grant execute on function public.my_sent_anonymous_questions() to authenticated;
revoke all on function public.public_anonymous_question_answers(uuid) from public, anon;
grant execute on function public.public_anonymous_question_answers(uuid) to authenticated;
revoke all on function public.answer_anonymous_question(uuid, text, boolean) from public, anon;
grant execute on function public.answer_anonymous_question(uuid, text, boolean) to authenticated;
revoke all on function public.delete_anonymous_question(uuid) from public, anon;
grant execute on function public.delete_anonymous_question(uuid) to authenticated;
revoke all on function public.report_anonymous_question(uuid, text) from public, anon;
grant execute on function public.report_anonymous_question(uuid, text) to authenticated;
revoke all on function public.admin_list_anonymous_questions() from public, anon;
grant execute on function public.admin_list_anonymous_questions() to authenticated;
revoke all on function public.admin_set_anonymous_question_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_anonymous_question_hidden(uuid, boolean) to authenticated;
