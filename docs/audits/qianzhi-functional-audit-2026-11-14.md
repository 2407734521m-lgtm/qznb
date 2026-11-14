# Qianzhi 网站功能审计报告（2026-11-14）

仓库：2407734521m-lgtm/qznb  
审计基线：main @ 7814907551cc4e2f6d79e4488f6dca00a34fcd13  
站点：qianzhi.pw / admin.qianzhi.pw / music.qianzhi.pw / radio.qianzhi.pw

> 仅检查源码、公开页面和 CI；未登录用户或管理员账号，未写入生产数据，未执行 SQL/migration，未修改 secrets，未部署、未合并 PR。源码已接线不等于生产环境已验证。

## 执行摘要

- 仓库树 612 条；59 个 TSX 页面/后台页；105 个 SQL migration 文件；8 个 Edge Function 入口；6 个 Actions workflow；22 个 Admin 组件。
- database.types.ts 当前列出 44 张表、130 个函数类型。若干近期 migration 新表/RPC 未进入类型文件，部分调用使用 supabase as any，存在类型同步债务。
- 游客首页、动态、日常、表白墙、公告完成公开只读路由检查；动态/表白墙互动入口提示登录；日常页面可打开但本次没有公开内容。
- 管理后台登录页可打开但无管理员凭据。音乐站 UI 可开，本次浏览会话未连接流媒体服务；电台 UI 可开，但未验证实际音频、摄像头和横屏。
- 主站 Pages run 43564359829、音乐站 Worker run 43564359835、电台 Worker run 43564216447 均成功。电台 workflow 本身没有同等回归测试。
- 没有找到能被证明确实坏掉、且可以在不猜测产品行为的情况下安全修复的代码缺陷；本次没有业务代码修复提交。

## 主站页面与功能

路由定义见 src/App.tsx，HashRouter 入口见 src/main.tsx。主要页面：

| 页面/路由 | 功能 | 前端到后端 |
|---|---|---|
| /home、/ | 首页、搜索、发现、公告、快捷入口 | Home.tsx、App.tsx |
| /feed | 全部/好友筛选、发帖、图片、点赞、评论、举报、编辑/删除、印象投票 | Feed.tsx → posts/comments/post_likes + poll RPC |
| /daily | 日常列表和互动 | Daily.tsx、GuestPosts.tsx → guest_public_posts |
| /love-wall | 表白发布、类别、对象、匿名、媒体、评论 | LoveWall.tsx → love_wall tables/RPC/Storage |
| /questions、/questions/:id | 匿名提问、收件箱/已发送、回答、举报/删除 | QuestionBox.tsx → anonymous question RPC |
| /songs | 音频投稿、匿名发布、我的投稿、删除 | SongWall.tsx → create_song_audio_upload、song_posts、song-audio |
| /albums、/albums/:id | 相册、分类、照片上传、封面、编辑/删除 | Album.tsx、AlbumDetail.tsx → albums/album_photos/media |
| /friends、/messages | 找人、好友申请/处理、拉黑、提醒邮件、通知 | Friends.tsx、Member.tsx → friend RPC + friend-request-email |
| /chat/:cid | 文字/图片/附件/语音、回复、回应、编辑/撤回、背景、已读、输入状态 | Chat.tsx → messages/reactions/conversation_members/Realtime/RPC |
| /members/:id、/timeline | 成员资料、好友、私信、举报/拉黑、时间线 | Member.tsx、Timeline.tsx |
| /me 及子路由 | 资料、头像/视频、内容、收藏、问候、反馈、通知、账号 | MeHub.tsx、MyProfile.tsx、Me* |
| /me/settings/* | Passkey、隐私、位置分享/撤销、设备退出、通知设置 | MePasskey.tsx、MePrivacy.tsx、MeDevices.tsx |
| /board、/topics、/hot、/events、/calendar、/wishes、/capsule | 公告、话题、热门、活动、日历、愿望、时间胶囊 | Board/Topics/HotSnippets/Events/MemoryCalendar/Wishes/Capsule |
| /explore、/fate-notebook、/particle-flower、/air-ink | 探索、娱乐玩法、粒子/沉浸页面 | Explore/FateNotebook/ParticleFlower/AirInk |

游客身份见 src/auth.tsx：存于 sessionStorage，时长限制 15–1440 分钟，过期后退出；不创建 Auth 用户、profiles 或成员在线记录。GuestBrowse.tsx 只开放公开页面；GuestPosts.tsx 对游客点赞/评论只提示登录。

## 管理后台

src/pages/Admin.tsx 注册 27 个模块：总览、数据分析、备份与恢复、版本发布、应用管理、账号管理、邀请码、审核、审核中心、表白墙、通知中心、开盒队列、歌声墙、音乐下载记录、批量邮件、弹窗广播、反馈、段位、公告、活动、日志、安全防护、审批中心、安全与监控、游客管理、设置、测试。数据分析/备份/版本发布/账号/安全/审批/系统/设置/测试限制超管。

后台只在精确域名 admin.qianzhi.pw 加载，并用 my_role 验证 admin/super_admin（src/main.tsx）。后台 Auth storage key 为 qznb-admin-auth-v1，与主站分离（src/lib/supabase.ts）。共用导航与命令搜索见 AdminWorkspace.tsx。后台所有模块需要真实管理员账号验证，本次没有提交表单或执行操作。

## Supabase、RLS 与 Storage

database.types.ts 生成文件列出 44 张表，包括 profiles/profile_privacy、posts/comments/post_likes、friendships/user_blocks、conversations/conversation_members/messages/message_reactions、albums/album_photos、love_wall_posts/love_wall_media、song_posts、notifications、events/event_regs、site_settings、admin_audit_logs、backup_logs 等。

关键迁移证据：
- 001_init.sql：个人资料/隐私/联系人行级策略，头像目录权限。
- 006_chat_media.sql：chat-media 私有桶，上传/删除限制本人路径，读取需会话成员。
- 20261101050000_site_assets_bucket.sql：site-assets 公开读，写入仅管理员。
- 20261108090000_guest_public_posts_readonly.sql：游客只读 feed/daily 窄 RPC，媒体读取限于已公开帖子引用对象。
- 20261107160000_guest_read_only_browse.sql、20261107170000_guest_access_controls.sql：游客公开墙/时段/开关/时长控制。
- 20261108005517_anonymous_question_box.sql：匿名提问表启用 RLS，撤销客户端原始表权限，通过成员验证 RPC。
- 20261108133000_post_impression_polls.sql：投票明细撤销客户端直接访问，通过 RPC 创建/投票/汇总。
- 20261114101500_priority_reliability_privacy_fixes.sql：聊天已读和私有媒体访问加固。
- 20261101004500_admin_dual_approval.sql：高风险账号删除/角色更改需第二名超管批准，发起人不能自批。

Storage 代码引用包括 avatars、media、chat-media、song-audio、site-assets；私有资源签名 URL 缓存见 src/lib/media.ts。生产 migration 状态未确认：migrate.yml 是手动触发，部署成功不代表 migration 已应用。本次没有连接生产数据库，也没有执行 SQL。

近期 migration 新表/RPC（匿名提问、印象投票、管理版发布等）未完整进入生成的 DB 类型文件，部分调用使用 supabase as any。应在确认正确生产 schema 与 migration 版本后重新生成，不能手工臆造 schema。

## Edge Functions

共 8 个入口：admin-bulk-email、dev-feedback、email-dispatch、friend-request-email、location-reverse-geocode、maintenance-notify、qq-avatar-import、username-login。邮件依赖 Resend 域名认证与 Function secrets；本次不读取 secrets。email-dispatch 当前显示名仍为 Class Memory <notice@qianzhi.pw>，品牌策略待确认。

## 音乐站与电台

音乐站 Folia 0.7.27，Node 24、Cloudflare Worker qianzhi-music；Qianzhi Auth 使用独立 qznb-music-auth-v1，不是无缝 SSO。README 记录部分 API、搜索、详情、歌词响应成功，但测试歌曲曾返回 url:null/404，真实可播放音频及登录后播放未验证；本次网页会话显示未连接流媒体服务。

电台 Mineradio 2.2.0 / GPL-3.0-only，Worker 通过音乐站 XEAPI 代理。文档列出网易云搜索、播放地址、歌词、歌单、推荐、专辑/歌手、收藏、扫码登录和 Range 音频代理；QQ/酷狗/Spotify、评论、新建歌单、部分播客及桌面专属能力未开放。移动端有竖屏补丁，横屏布局未改；实际音频/摄像头/横屏未验证。

## 确认缺口与建议

1. 备份中心不执行真实备份：20261101020000_admin_backup_center.sql 文件头明确声明不会创建数据库或 Storage 备份；admin_record_manual_backup 只写 backup_logs 的 manual_verified 登记。自动备份、Storage 导出和恢复演练尚待建设。
2. WebRTC 仅配置 Google STUN，没有 TURN（src/lib/call.tsx）；复杂 NAT/校园/移动网络可能连不上。需先选服务商与预算。
3. deploy-radio.yml 只有部署步骤，没有回归测试。
4. Music 搜索成功不代表音频 URL 可用或真实播放成功。
5. DB 生成类型落后于部分新 migration，需在目标 schema 确认后同步。
6. 表白墙匿名作者的投稿卡片仍可显示对象字段（GuestLoveWall.tsx）；是否公开对象姓名/班级需明确同意规则。

建议优先级：P0 用独立 staging 项目核对 schema/migrations/RLS 并建立 guest/member/admin 测试矩阵；P0 完成数据库+Storage 自动备份和恢复演练；P1 主站/电台 Playwright smoke tests；P1 双账号聊天/通话测试及 TURN 决策；P1 Music 真账号与音频播放验收；P2 生成类型同步；P2 隐私规则和统一错误提示。

## PR、CI 与边界

- 主站 Pages run 43564359829：success。
- 音乐 Worker run 43564359835：success（指定单测、typecheck、build、publish）。
- 电台 Worker run 43564216447：success（deploy；workflow 无回归测试）。
- verify-pr run 43564254805 成功来自 feat/skeleton-coverage，不能证明全部线上功能正常。
- 已知开放 PR #445：https://github.com/2407734521m-lgtm/qznb/pull/445；相对 main 5 commits ahead / 25 behind，compare 为 diverged，不应直接合并。未更改该 PR。
- 没有代码修复 PR：本轮未发现证据充分且不改变产品行为的确定性 bug。
- 没有写 main、merge/deploy、生产 SQL、secrets 或生产数据；没有触碰 rollback Supabase 项目；没有改 Dock、品牌或产品定位。

另有完整详细报告版本随本次会话交付。
