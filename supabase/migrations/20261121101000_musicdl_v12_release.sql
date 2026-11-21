-- 千栀音乐下载 v1.2 真实发布（本地 NCM 转换）。
-- APK 已用原版 musicdl-release.keystore 签名（versionCode 3，签名指纹与 v1.1 一致，
-- 可直接覆盖安装）；固定地址文件 public/app/qianzhi-musicdl.apk 与静态
-- public/app/musicdl-version.json 已随本次发布更新到 1.2/code 3。
-- 库里原先那行假 1.2 种子已在 20261121100000 对齐回 1.1，本次按
-- admin_publish_musicdl_app_release 的语义新增一行发布记录（保留审计链，不改旧行），
-- 并把 site_settings 的 musicdl_app_version_name / version_code / update_notes
-- 三个键同步到 1.2/code 3。apk_url、force_update、min_code 不变。
-- 幂等：重复执行不会重复插行、不会重复改值。
-- 回滚：删掉本次新增的 releases 行，并把 site_settings 三个键改回 1.1/code 2。
insert into public.musicdl_app_releases
  (version_name, version_code, apk_url, update_notes, force_update, min_code, published_by, published_at)
select '1.2', 3, 'https://qianzhi.pw/app/qianzhi-musicdl.apk',
  '新版本 1.2 来了：\n· 新增 NCM 音乐转换：在软件里扫描手机文件夹，把 .ncm 转成 MP3 / FLAC，保留原文件\n· 转换全在手机本地完成，不用上传\n点「更新」下载安装，覆盖旧版，登录和数据都不会丢。',
  false, 0, null, now()
where not exists (select 1 from public.musicdl_app_releases where version_code = 3);

update public.site_settings
set value = '1.2'
where key = 'musicdl_app_version_name' and value = '1.1';

update public.site_settings
set value = '3'
where key = 'musicdl_app_version_code' and value = '2';

update public.site_settings
set value = '新版本 1.2 来了：\n· 新增 NCM 音乐转换：在软件里扫描手机文件夹，把 .ncm 转成 MP3 / FLAC，保留原文件\n· 转换全在手机本地完成，不用上传\n点「更新」下载安装，覆盖旧版，登录和数据都不会丢。'
where key = 'musicdl_app_update_notes' and value like '%新版本 1.1 来了%';
