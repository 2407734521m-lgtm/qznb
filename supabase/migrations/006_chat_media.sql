-- 006_chat_media.sql
-- 私聊图片和语音使用私有 bucket；对象路径格式：<conversation_id>/<sender_id>/<filename>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 15728640, array['image/jpeg','image/png','image/webp','image/gif','image/heic','audio/webm','audio/mp4','audio/ogg','audio/aac','audio/mpeg','audio/x-m4a'])
on conflict (id) do update
set public = false, file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/heic'];

drop policy if exists chat_media_insert on storage.objects;
drop policy if exists chat_media_select on storage.objects;
drop policy if exists chat_media_delete on storage.objects;

create policy chat_media_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = split_part(name, '/', 1)::bigint
      and cm.profile_id = auth.uid()
  )
);

create policy chat_media_select on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-media'
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = split_part(name, '/', 1)::bigint
      and cm.profile_id = auth.uid()
  )
);

create policy chat_media_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = split_part(name, '/', 1)::bigint
      and cm.profile_id = auth.uid()
  )
);
