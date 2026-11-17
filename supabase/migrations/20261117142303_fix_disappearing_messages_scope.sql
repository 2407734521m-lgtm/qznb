-- 只让规则生效后新发送的消息自动消失。
-- 历史消息保留原状；已开始倒计时的消息继续按照各自 expires_at 到期。
begin;

alter table public.conversations
  add column if not exists disappearing_started_at timestamptz;

-- 已经开启该功能的会话从迁移时刻开始采用新规则，
-- 不把新的规则边界追溯到它们的旧消息上。
update public.conversations
   set disappearing_started_at = now()
 where disappearing_mode <> 'off'
   and disappearing_started_at is null;

comment on column public.conversations.disappearing_started_at is
  '当前自动消失规则的生效起点；只对该时刻之后创建的消息应用新规则。';

-- 定时模式：只给生效起点之后新插入的消息设置过期时间。
create or replace function public.messages_disappearing_insert()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_seconds integer;
  v_started_at timestamptz;
  v_created_at timestamptz;
begin
  v_created_at := coalesce(new.created_at, now());

  select c.disappearing_seconds, c.disappearing_started_at
    into v_seconds, v_started_at
    from public.conversations c
   where c.id = new.conversation_id
     and c.disappearing_mode = 'timed';

  if v_seconds is not null
     and v_started_at is not null
     and v_created_at >= v_started_at then
    new.expires_at := v_created_at + make_interval(secs => v_seconds);
  end if;

  return new;
end;
$function$;

-- 切换设置只建立新的生效边界，不再重算或清除历史消息的 expires_at。
create or replace function public.set_disappearing_mode(
  p_conversation_id bigint,
  p_mode text,
  p_seconds integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_mode is null or p_mode not in ('off', 'after_read', 'timed') then
    raise exception 'unknown disappearing mode: %', p_mode;
  end if;

  if p_mode = 'timed'
     and (p_seconds is null or p_seconds < 30 or p_seconds > 2592000) then
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
         disappearing_seconds = case when p_mode = 'timed' then p_seconds else null end,
         disappearing_started_at = case when p_mode = 'off' then null else now() end
   where id = p_conversation_id;

  return p_mode;
end;
$function$;

revoke all on function public.set_disappearing_mode(bigint, text, integer) from public, anon;
grant execute on function public.set_disappearing_mode(bigint, text, integer) to authenticated;

-- 已读模式：只处理生效起点之后发送的消息。
-- 群聊仍需等所有其他收件人读过；一对一仍在对方读完时开始 30 秒倒计时。
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

  update public.messages m
     set expires_at = now() + interval '30 seconds'
    from public.conversations c
   where m.conversation_id = p_conversation_id
     and m.sender_id <> auth.uid()
     and m.deleted_at is null
     and m.expires_at is null
     and c.id = p_conversation_id
     and c.disappearing_mode = 'after_read'
     and c.disappearing_started_at is not null
     and m.created_at >= c.disappearing_started_at
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

commit;
