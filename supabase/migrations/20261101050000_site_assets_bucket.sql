-- 站点公开素材桶：供后台直接上传首页横幅等公开图片。
-- 纯新增，不动任何现有表/数据；回滚：删掉三条策略并删除该桶（先清空文件）。
-- 公开桶的文件经 /storage/v1/object/public/site-assets/... 公开可读；
-- 写入/更新/删除仅管理员（my_role() in admin/super_admin）。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-assets',
  'site-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do nothing;

create policy site_assets_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-assets'
    and coalesce(my_role(), '') in ('admin', 'super_admin')
  );

create policy site_assets_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'site-assets'
    and coalesce(my_role(), '') in ('admin', 'super_admin')
  )
  with check (
    bucket_id = 'site-assets'
    and coalesce(my_role(), '') in ('admin', 'super_admin')
  );

create policy site_assets_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'site-assets'
    and coalesce(my_role(), '') in ('admin', 'super_admin')
  );
