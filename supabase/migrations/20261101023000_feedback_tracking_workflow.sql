-- Feedback lifecycle, user-visible progress notes, and private owner reads.

begin;

alter table public.feedbacks
  add column if not exists admin_note text,
  add column if not exists handled_by uuid references auth.users(id) on delete set null,
  add column if not exists handled_at timestamptz;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.feedbacks'::regclass
      and conname = 'feedbacks_admin_note_length_check'
  ) then
    alter table public.feedbacks
      add constraint feedbacks_admin_note_length_check
      check (admin_note is null or char_length(admin_note) <= 500);
  end if;
end;
$block$;

drop policy if exists fb_sel_own on public.feedbacks;
create policy fb_sel_own
  on public.feedbacks
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Prevent direct status/note writes that would bypass the notification RPC.
drop policy if exists fb_upd on public.feedbacks;
revoke update on table public.feedbacks from public, anon, authenticated;

create or replace function public.admin_update_feedback(
  p_feedback_id bigint,
  p_status text,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_feedback public.feedbacks%rowtype;
  v_note text := nullif(pg_catalog.btrim(p_admin_note), '');
  v_status_label text;
  v_body text;
begin
  if v_actor is null or coalesce(public.my_role(), '') not in ('admin', 'super_admin') then
    raise exception 'administrator required' using errcode = '42501';
  end if;

  if p_feedback_id is null
     or p_status is null
     or p_status not in ('open', 'in_progress', 'done')
     or (v_note is not null and pg_catalog.char_length(v_note) > 500) then
    raise exception 'invalid feedback update';
  end if;

  select * into v_feedback
    from public.feedbacks
   where id = p_feedback_id
   for update;

  if not found then
    raise exception 'feedback not found';
  end if;

  if v_feedback.status is not distinct from p_status
     and v_feedback.admin_note is not distinct from v_note then
    return;
  end if;

  update public.feedbacks
     set status = p_status,
         admin_note = v_note,
         handled_by = case when p_status = 'done' then v_actor else null end,
         handled_at = case when p_status = 'done' then pg_catalog.now() else null end
   where id = p_feedback_id;

  v_status_label := case p_status
    when 'in_progress' then '处理中'
    when 'done' then '已处理'
    else '待处理'
  end;
  v_body := '当前状态：' || v_status_label
    || case when v_note is null then '' else E'\n处理说明：' || v_note end;

  if v_feedback.user_id is not null then
    insert into public.notifications(profile_id, type, title, body, link)
    values (
      v_feedback.user_id,
      'feedback',
      '你的反馈有新进展',
      v_body,
      '/me/feedback'
    );
  end if;

  insert into public.admin_audit_logs(actor, action, target, detail)
  values (
    v_actor,
    'feedback_status_updated',
    v_feedback.user_id,
    pg_catalog.jsonb_build_object(
      'feedback_id', p_feedback_id,
      'status', p_status,
      'has_user_visible_note', v_note is not null
    )
  );
end;
$function$;

revoke all on function public.admin_update_feedback(bigint, text, text) from public, anon;
grant execute on function public.admin_update_feedback(bigint, text, text) to authenticated;

commit;
