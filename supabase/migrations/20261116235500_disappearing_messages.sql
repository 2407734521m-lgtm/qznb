-- 私聊「消失的私信」：每会话可选 关闭 / 对方看完后消失 / 按发送时间消失。
-- 按发送时间消失的时长可以自己填（30 秒～30 天），也可以直接选 1 小时 / 24 小时 / 7 天。
-- 规则只由后端定，不靠前端自觉：
--   * 定时模式：发送时触发器写 expires_at = 发送时间 + 自定义时长；
--   * 看完模式：收件人打开会话（mark_conversation_read）时，
--     把发件人发来的、还没定过期时间的消息记成全部收件人看完后 30 秒过期；
--     用不公开的 last_read_message_id 游标判断，不依赖对方是否开启已读回执；
--     群聊里要等每一位收件人都看完才过期，一对一就是对方看完；
--   * 过期消息由 cleanup_expired_messages() 软删（deleted_at，和现有撤回同一机制），
--     前端同时按 expires_at 过滤，没等到清理的消息也不会再显示出来。
-- 切换模式时已有消息按新规则重算；关闭时取消所有未到期的过期时间。
begin;

alter table public.conversations
  add column if not exists disappearing_mode text not null default 'off';

alter table public.conversations
  add column if not exists disappearing_seconds integer;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_disappearing_mode_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_disappearing_mode_check
      check (disappearing_mode in ('off', 'after_read', 'timed'));
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_disappearing_seconds_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_disappearing_seconds_check
      check (
        (disappearing_mode = 'timed'
          and disappearing_seconds is not null
          and disappearing_seconds between 30 and 2592000)
        or (disappearing_mode <> 'timed' and disappearing_seconds is null)
      );
  end if;
end;
$constraint$;

comment on column public.conversations.disappearing_mode is
  '消失的私信：off=关闭，after_read=全部收件人看完 30 秒后消失，timed=发送指定秒数后消失。';
comment on column public.conversations.disappearing_seconds is
  '消失的私信定时模式的时长（秒），30 秒～30 天；只有 timed 模式才有值。';

alter table public.messages
  add column if not exists expires_at timestamptz;

comment on column public.messages.expires_at is
  '消失的私信到期时间；到期后由 cleanup_expired_messages() 软删，前端同时按此过滤。';

create index if not exists messages_expires_at_idx
  on public.messages (expires_at)
  where expires_at is not null and deleted_at is null;

-- 发送时定过期时间（只管定时模式；看完模式等收件人已读时再定）。
create or replace function public.messages_disappearing_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_seconds integer;
begin
  select c.disappearing_seconds
    into v_seconds
    from public.conversations c
   where c.id = new.conversation_id
     and c.disappearing_mode = 'timed';
  if v_seconds is not null then
    new.expires_at := coalesce(new.created_at, now()) + make_interval(secs => v_seconds);
  end if;
  return new;
end;
$function$;

drop trigger if exists messages_disappearing_insert_trigger on public.messages;
create trigger messages_disappearing_insert_trigger
  before insert on public.messages
  for each row execute function public.messages_disappearing_insert();

-- 切换模式：只有会话成员能改；改完后已有消息按新规则重算。
-- p_seconds 只有定时模式需要，30 秒～30 天；其余模式传空。
create or replace function public.set_disappearing_mode(p_conversation_id bigint, p_mode text, p_seconds integer default null)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_mode not in ('off', 'after_read', 'timed') then
    raise exception 'unknown disappearing mode: %', p_mode;
  end if;

  if p_mode = 'timed' and (p_seconds is null or p_seconds < 30 or p_seconds > 2592000) then
    raise exception 'timed disappearing needs 30..2592000 seconds';
  end if;

  if auth.uid() is null
     or not public.is_member()
     or not chat_private.is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  if not public.site_feature_enabled('chat') then
    raise exception 'chat is currently unavailable';
  end if;

  update public.conversations
     set disappearing_mode = p_mode,
         disappearing_seconds = case when p_mode = 'timed' then p_seconds else null end
   where id = p_conversation_id;

  if p_mode = 'off' then
    -- 关闭：还没消失的消息全部取消过期。
    update public.messages
       set expires_at = null
     where conversation_id = p_conversation_id
       and deleted_at is null;
  elsif p_mode = 'timed' then
    -- 定时：已有消息一律按发送时间 + 自定义时长。
    update public.messages
       set expires_at = created_at + make_interval(secs => p_seconds)
     where conversation_id = p_conversation_id
       and deleted_at is null;
  else
    -- 看完：全部收件人已经读过的消息 30 秒后消失，还有人没读过的先不定，等已读时再定。
    update public.messages m
       set expires_at = case
         when not exists (
           select 1
           from public.conversation_members rcpt
           where rcpt.conversation_id = p_conversation_id
             and rcpt.profile_id <> m.sender_id
             and coalesce(rcpt.last_read_message_id, 0) < m.id
         ) then now() + interval '30 seconds'
         else null
       end
     where m.conversation_id = p_conversation_id
       and m.deleted_at is null;
  end if;

  return p_mode;
end;
$function$;

revoke all on function public.set_disappearing_mode(bigint, text, integer) from public, anon;
grant execute on function public.set_disappearing_mode(bigint, text, integer) to authenticated;

-- 看完模式的已读联动：函数体照抄 20261114101500_priority_reliability_privacy_fixes.sql
-- 的当前实现，只在末尾加一段过期标记；其余一行未动。
create or replace function public.mark_conversation_read(p_conversation_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_last_message_id bigint;
  v_saved_message_id bigint;
  v_send_read_receipts boolean := true;
begin
  if auth.uid() is null
     or not public.is_member()
     or not chat_private.is_conversation_member(p_conversation_id) then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  if not public.site_feature_enabled('chat') then
    raise exception 'chat is currently unavailable';
  end if;

  select coalesce(
    p.preferences #> '{chat,sendReadReceipts}' <> 'false'::jsonb,
    true
  )
    into v_send_read_receipts
    from public.profile_notification_preferences p
   where p.profile_id = auth.uid();
  v_send_read_receipts := coalesce(v_send_read_receipts, true);

  select max(m.id)
    into v_last_message_id
    from public.messages m
   where m.conversation_id = p_conversation_id;

  if v_last_message_id is null then
    select cm.last_read_message_id
      into v_saved_message_id
      from public.conversation_members cm
     where cm.conversation_id = p_conversation_id
       and cm.profile_id = auth.uid();
    return v_saved_message_id;
  end if;

  update public.conversation_members cm
     set last_read_message_id = greatest(coalesce(cm.last_read_message_id, 0), v_last_message_id),
         last_receipt_message_id = case
           when v_send_read_receipts
             then greatest(coalesce(cm.last_receipt_message_id, 0), v_last_message_id)
           else cm.last_receipt_message_id
         end
   where cm.conversation_id = p_conversation_id
     and cm.profile_id = auth.uid()
     and (
       coalesce(cm.last_read_message_id, 0) < v_last_message_id
       or (v_send_read_receipts and coalesce(cm.last_receipt_message_id, 0) < v_last_message_id)
     )
  returning cm.last_read_message_id into v_saved_message_id;

  if v_saved_message_id is null then
    select cm.last_read_message_id
      into v_saved_message_id
      from public.conversation_members cm
     where cm.conversation_id = p_conversation_id
       and cm.profile_id = auth.uid();
  end if;

  -- 消失的私信（看完模式）：别人发来的、还没定过期时间的消息，
  -- 这次已读后 30 秒过期；群聊里还要等其他收件人也都看完。
  update public.messages m
     set expires_at = now() + interval '30 seconds'
    from public.conversations c
   where m.conversation_id = p_conversation_id
     and m.sender_id <> auth.uid()
     and m.deleted_at is null
     and m.expires_at is null
     and c.id = p_conversation_id
     and c.disappearing_mode = 'after_read'
     and not exists (
       select 1
       from public.conversation_members rcpt
       where rcpt.conversation_id = p_conversation_id
         and rcpt.profile_id <> m.sender_id
         and rcpt.profile_id <> auth.uid()
         and coalesce(rcpt.last_read_message_id, 0) < m.id
     );

  return v_saved_message_id;
end;
$function$;

revoke all on function public.mark_conversation_read(bigint) from public, anon;
grant execute on function public.mark_conversation_read(bigint) to authenticated;

-- 清理过期消息：软删（deleted_at，和撤回同一机制），返回清理条数。
-- p_conversation_id 为空时清理调用者参与的全部会话；只动自己是成员的会话。
create or replace function public.cleanup_expired_messages(p_conversation_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count bigint := 0;
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'conversation access denied' using errcode = '42501';
  end if;

  update public.messages m
     set deleted_at = now()
   where m.deleted_at is null
     and m.expires_at is not null
     and m.expires_at <= now()
     and (p_conversation_id is null or m.conversation_id = p_conversation_id)
     and chat_private.is_conversation_member(m.conversation_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.cleanup_expired_messages(bigint) from public, anon;
grant execute on function public.cleanup_expired_messages(bigint) to authenticated;

commit;
