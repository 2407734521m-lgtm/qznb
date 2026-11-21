-- 千栀音乐下载 v1.2.2：更新提醒改成站内卡片（替代原生 AlertDialog 灰框），含 1.2.1 的 NCM 扫描修复。
-- APK 已用原版 musicdl-release.keystore 签名（versionCode 5，签名指纹与 v1.1/v1.2/v1.2.1 一致，
-- 可直接覆盖安装）；固定地址文件 public/app/qianzhi-musicdl.apk 与静态
-- public/app/musicdl-version.json 已随本次发布更新到 1.2.2/code 5。
-- 按 admin_publish_musicdl_app_release 的语义新增一行发布记录（保留审计链，不改旧行），
-- 并把 site_settings 的 musicdl_app_version_name / version_code / update_notes
-- 三个键同步到 1.2.2/code 5。apk_url、force_update、min_code 不变。
-- 幂等：重复执行不会重复插行、不会重复改值。
-- 回滚：删掉本次新增的 releases 行，并把 site_settings 三个键改回 1.2.1/code 4。
insert into public.musicdl_app_releases
  (version_name, version_code, apk_url, update_notes, force_update, min_code, published_by, published_at)
select '1.2.2', 5, 'https://qianzhi.pw/app/qianzhi-musicdl.apk',
  '新版本 1.2.2 来了：\n· 更新提醒换成站内样式：以后新版提醒直接在下载页里显示，不再弹系统灰框\n· 包含 1.2.1 的修复：NCM 扫描点不动已修好\n点「更新」下载安装，覆盖旧版，登录和数据都不会丢。',
  false, 0, null, now()
where not exists (select 1 from public.musicdl_app_releases where version_code = 5);

update public.site_settings
set value = '1.2.2'
where key = 'musicdl_app_version_name' and value = '1.2.1';

update public.site_settings
set value = '5'
where key = 'musicdl_app_version_code' and value = '4';

update public.site_settings
set value = '新版本 1.2.2 来了：\n· 更新提醒换成站内样式：以后新版提醒直接在下载页里显示，不再弹系统灰框\n· 包含 1.2.1 的修复：NCM 扫描点不动已修好\n点「更新」下载安装，覆盖旧版，登录和数据都不会丢。'
where key = 'musicdl_app_update_notes' and value like '%新版本 1.2.1 来了%';
