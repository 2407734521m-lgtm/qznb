-- 音乐下载版 1.2 种子不是真实版本：固定地址 APK 文件 md5 与 v1.1 成品逐字节一致，
-- 静态 public/app/musicdl-version.json 也是 1.1/code 2；库里 1.2/code 3 的那一行
-- （musicdl_app_releases id=1，2026-11-14 04:37 UTC）与 site_settings 的 6 个
-- musicdl_app_* 键是同日误标的种子——其更新说明写的内容（软件内更新提示、
-- 白色液态玻璃星环图标）实际是 v1.1（PR #461）就已上线的东西。
-- 本次把库里两处对齐到真实版本 1.1/code 2（只改版本号与说明里的版本号，
-- 不改 apk 地址、不改 force/min、不删历史行，保留审计链）。
-- 用户 2026-11-21 授权「音乐版本号你来解决」，定为对齐到 1.1。
-- 回滚：把两处改回 1.2/code 3 即可（不推荐，1.2 从未真正打包过）。
update public.musicdl_app_releases
set version_name = '1.1',
    version_code = 2,
    update_notes = replace(update_notes, '新版本 1.2 来了', '新版本 1.1 来了')
where id = 1 and version_name = '1.2' and version_code = 3;

update public.site_settings
set value = '1.1'
where key = 'musicdl_app_version_name' and value = '1.2';

update public.site_settings
set value = '2'
where key = 'musicdl_app_version_code' and value = '3';

update public.site_settings
set value = replace(value, '新版本 1.2 来了', '新版本 1.1 来了')
where key = 'musicdl_app_update_notes' and value like '%新版本 1.2 来了%';
