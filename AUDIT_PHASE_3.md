# 第 3 阶段审计报告：个人中心与扩展功能

- 审计日期：2026-11-21
- 审计基线：`main` 分支 HEAD `70e8040`（第 2 阶段 FIX-2 PR #759 已合并）
- 修复基线：同上；修复分支 `fix/audit-phase3-code`（独立 worktree，避开主聊并行线）
- 生产 Supabase 项目：`ldypnxxxgscibopgiaso`（`class-youth-archive2`）；旧项目 `wnddwkdfndrkxivvrxcy` 已 INACTIVE，未用。
- 审计方式：三条只读代码审计线 + 生产库只读核对（仅 `SELECT`，未读任何用户行数据）；未登录任何账号，未向真实用户发任何消息，未发测试邮件，未删真实用户数据，未清理生产 Storage。

## 0. 计数

| 状态 | 数量 |
|---|---|
| PASS | 0 |
| PARTIAL | 24 |
| FAIL | 0 |
| BLOCKED | 152 |
| NOT_IMPLEMENTED | 1 |
| NOT_TESTED | 0 |
| 合计 | 177 |

分线计数：A 线个人中心本体 52 项（PARTIAL 13、BLOCKED 39）；B 线内容扩展页 44 项（BLOCKED 43、NOT_IMPLEMENTED 1）；C 线趣味/活动页 81 项（PARTIAL 11、BLOCKED 70）。三线底稿计数均已用脚本逐行核对，与逐项表行数一致。

PASS 为 0 是如实结果：本阶段全部功能都挂在登录后的 App Shell 内，访客走 `GuestBrowse`、路由根本不渲染；代码完整也不算 PASS。152 项 BLOCKED 均为无可登录测试账号，待登录态回归实测。

## 1. 分线结论

### A 线：个人中心本体（§25–§29、§31）

底稿：`audit-phase3-work/me-profile-audit.md`（52 项）

- 个人中心 /me、我的内容管理（/me/content、/me/posts、/me/favorites、/me/greetings、/me/feedback、/me/growth）、通知、编辑资料剩余项、设置中心、游客拦截，代码层面基本齐全。
- 本线核对的 18 张表与 5 个函数在仓库迁移里均有对应定义，**未发现第 2 阶段那类仓库–生产漂移**。
- 13 项 PARTIAL 均为代码已确认的缺口，重点：字体大小设置刷新后失效（S1，已修 FIX-3-1）；“卡片进原页”只是跳列表 + 搜索预填（S2）；表白 pending 文案与先发后审矛盾（S3，已修 FIX-3-2）；“我的评论”没有列表（S4）；收藏的同学档案失效静默丢弃（S5）；`/me/notifications` 只是 5 行重定向、无独立通知页（S6）；两类通知在设置里关不掉（S7）；通知与“我的发布/我的动态”上限 50 条无分页（S8/S10）；Dock 未读红点不按类型偏好过滤（S9）；编辑页通知栏跳转绕过 router（S11，已修 FIX-3-8）。

### B 线：内容扩展页（§5、§7、§8、§10、§13、§14）

底稿：`audit-phase3-work/content-pages-audit.md`（44 项）

- 相册、公告、发现、歌声墙、成员主页、回忆时间线，代码层面基本齐全，无 FAIL。
- 唯一 NOT_IMPLEMENTED：公告详情页（B14）——清单称含“详情”，但全仓无 `/board/:id` 路由、无点击展开；正文全文 inline 展示，不影响阅读。
- 最大结构性发现仍是仓库与生产漂移（S1，高）：`board_messages` / `board_reads` 在仓库 124 个迁移里无建表、无 RLS，`albums.deleted_at` 列无任何迁移，`song-audio` 桶的 `song_audio_delete_own_submission` 策略仓库里也没有——生产库只读核对证实四者全部存在且策略齐全。已由 FIX-3-11 收敛。
- 一个差点误判为 FAIL 的点已纠正：按仓库 `027` 的 `song_audio_delete_own_pending` 策略，已发布歌声的音频不允许作者删除，`SongWall.deleteSong()` 先删文件再删行必然失败；但生产库实测多出一条仓库没有的 `song_audio_delete_own_submission` 策略，生产上删除链路是通的。B25 因此记 BLOCKED 而非 FAIL。
- 发现页音乐入口接线完整：`/music` 路由本身是空锚点，但全局 `MusicIsland` 在 `isMusicPage` 时把音乐站 iframe 前台挂载，点音乐卡即全屏音乐站，不是空白页；播放质量本身属第 5 阶段。

### C 线：趣味/活动页（§15–§24、§8、§37）

底稿：`audit-phase3-work/fun-pages-audit.md`（81 项）

- 记忆日历、时光胶囊、愿望、活动、留言祝福墙、热门特效、话题、命运笔记、指尖生花、空中书写、发现页、灵动岛残留，代码层面基本齐全，无 FAIL。
- 11 项 PARTIAL 均为代码已确认的“有但不完全”：日历点记录只进列表页不定位单条（C3）、活动无独立详情页（C21）、话题内预览只给 4 条（C40）、话题有话题时无发布入口（C41）、指尖生花“全屏/横屏”名不副实（C46、C53，已修 FIX-3-10）、发现页下拉刷新是空操作（C78）、灵动岛三件残留（C79–C81）。
- **最严重的隐私发现（S1，高）**：生产 `time_capsules` 的 `tc_sel` 策略只认 `is_public / 本人 / 管理员`，没有 `open_at` 门控——未开启的公开胶囊，任何成员经直连 API 都能读到完整标题与内容；“未到期绝不露”只靠前端隐藏。**本次未改**：简单加 `open_at` 门控会把未开启胶囊整行藏掉、锁信封 UI 直接消失，正确修法是 RPC 只返元数据（未开启时只给 id/作者/open_at，不给标题内容）+ RLS 门控，需另立方案等用户定夺。`tc_sel` 在 FIX-3-11 里按生产现状原样收敛，未改表达式。
- **灵动岛全套仍在线（S3，高）**：14 个组件 + `src/lib/island/` + App 约 20 处接线 + 设置入口 + 任务抽屉，全部是正在跑的功能，与用户彻底删除要求冲突。**本次未删**，需用户定夺保留还是删除。
- 漂移延续（S2，高）：`events` / `event_regs` / `wishes` / `greetings` / `time_capsules` / `hot_snippets` 六张表在仓库 124 个迁移里无 `CREATE TABLE`，`tc_*` 策略与 `bump_hot_snippet_view` 函数定义亦无；生产库齐全。已由 FIX-3-11 收敛。
- “堯”品牌残留（S4，已修 FIX-3-4）；热门特效“每小时自动上新/每 5 小时清理”在仓库内无任何实现（S7，无 edge function/workflow/定时任务，insert 代码零命中）；空中书写/指尖生花强依赖外部 CDN，无离线兜底（S12）。

## 2. 生产库只读核对（本阶段）

- A 线：18 张表全部存在；9 张表 RLS 开启且策略数已核；`my_account_status`、`get_my_growth_summary`、`set_my_profile_title`、`my_anonymous_question_inbox`、`my_review_estimates` 五个函数均存在；`comments`/`post_likes` 对 `posts` 是 `ON DELETE CASCADE`；`greetings` 删除策略是作者本人或管理员。
- B 线：7 张表存在性、5 张表列清单、6 张表 RLS 策略、4 个桶配置、歌声相关 Storage 策略、已加入成员计数（6 人）。`song-audio` 桶 20MB、私有，MIME 含 `audio/flac`；`media` 50MB；`avatars` 2MB；`videos` 200MB。
- C 线：9 张表全部存在（events 7 列、event_regs 3、wishes 5、greetings 6、time_capsules 8、capsule_reads 3、hot_snippets 10、timelines 7、board_messages 12）；8 张表 33 条策略齐全；`bump_hot_snippet_view(p_id bigint)` 函数存在；关键策略表达式已实测回读（`g_del`、`tc_del`、`w_del`、`hot_snippets_sel`）。

## 3. 逐项状态总表（177 项，证据见各线底稿）

| 编号 | 功能 | 状态 |
|---|---|---|
| A1 | 资料卡：头像进主页、昵称、用户名、称号、游戏称号、账号状态 | BLOCKED |
| A2 | 数据统计可点：我的动态/我的评论/收到点赞/分享照片数 | PARTIAL |
| A3 | 快捷入口 8 个 | BLOCKED |
| A4 | 我的发布：筛选 全部/动态/表白/回答 + 各类计数 | BLOCKED |
| A5 | 我的发布：卡片进原页 | PARTIAL |
| A6 | 我的发布：加载更多（先出 10 条） | BLOCKED |
| A7 | 底部设置入口 | BLOCKED |
| A8 | 账号状态提示：封禁/未入班/受限原因与期限 | BLOCKED |
| A9 | 表白卡片状态文案 | PARTIAL |
| A10 | `/me/content` 内容总览：11 类计数 + 分区入口 | BLOCKED |
| A11 | `/me/content` 我的评论分区 | PARTIAL |
| A12 | `/me/content` 最近已归档相册恢复（最多 30 条） | BLOCKED |
| A13 | `/me/posts` 看/编辑/删除自己动态、跳原页 | PARTIAL |
| A14 | `/me/posts` 左滑删除 + 5 秒撤销 | BLOCKED |
| A15 | `/me/favorites` 切换分类：同学档案 / 帖子（动态/日常） | BLOCKED |
| A16 | `/me/favorites` 取消收藏 / 移除失效收藏 | PARTIAL |
| A17 | `/me/greetings` 看收到留言 / 删自己留言 / 进祝福墙 | PARTIAL |
| A18 | `/me/feedback` 看自己反馈、处理状态、重载 | BLOCKED |
| A19 | `/me/growth` 成长档案：贡献、活动参与、最近 40 条贡献 | BLOCKED |
| A20 | `/me/growth` 称号设置 / 取消称号 / 称号公开设置 | BLOCKED |
| A21 | 通知中心入口 `/me/notifications` | PARTIAL |
| A22 | 通知列表：私信/好友申请/评论回复/点赞/留言/公告/反馈进度/表白墙/管理员私信/纪律/系统消息 | BLOCKED |
| A23 | 全部 / 未读筛选 | BLOCKED |
| A24 | 通知搜索 | BLOCKED |
| A25 | 点进详情：标记已读 + 跳转 | BLOCKED |
| A26 | 全部标为已读 | BLOCKED |
| A27 | 通知重载 / 实时更新 / 失败重载 | BLOCKED |
| A28 | 通知类型开关过滤（通知中心 + 灵动岛） | PARTIAL |
| A29 | 未读角标与免打扰 | BLOCKED |
| A30 | 基本资料自动保存（展示名/用户名/介绍/兴趣/游戏/社交/隐私） | BLOCKED |
| A31 | 主页外观：主题 6 种 / 照片位置 3 种 | BLOCKED |
| A32 | 换壁纸 | BLOCKED |
| A33 | 通行密钥栏（与 `/me/settings/passkey` 重复实现） | BLOCKED |
| A34 | 站内通知栏（最新 30 条，不标记已读） | PARTIAL |
| A35 | 后台入口（仅管理员可见） | BLOCKED |
| A36 | 意见反馈入口 | BLOCKED |
| A37 | 退出登录（编辑资料页） | BLOCKED |
| A38 | 设置页分组与站内搜索过滤 | BLOCKED |
| A39 | 账号分组：账号与安全 / 通行密钥 / 登录设备管理 / 我的主页 / 编辑资料 | BLOCKED |
| A40 | 隐私与安全行 | BLOCKED |
| A41 | 通用设置：页面动效三档（跟随设备/减少动画/完整动画） | BLOCKED |
| A42 | 灵动岛面板：位置/尺寸/触感反馈/拖动对准/恢复默认 | BLOCKED |
| A43 | 通知设置：10 项开关 | BLOCKED |
| A44 | 免打扰时段：开关 + 起止时间（每 30 分钟一档） | BLOCKED |
| A45 | 私聊已读回执：是否发送 / 是否显示对方已读 | BLOCKED |
| A46 | 字体大小：小 / 标准 / 大 / 特大 | PARTIAL |
| A47 | 最近搜索记录：查看 / 清空 | BLOCKED |
| A48 | 帮助与支持：问题反馈 | BLOCKED |
| A49 | 帮助与支持：我的反馈进度 | BLOCKED |
| A50 | 帮助与支持：赞助网站 | BLOCKED |
| A51 | 游客点个人中心入口的拦截（底部“我的”/直访 /me*） | PARTIAL |
| A52 | 游客登录弹窗（输入昵称、取消、进入） | PARTIAL |
| B1 | 相册列表加载、骨架屏、空态、失败重载 | BLOCKED |
| B2 | 新建相册（名称、分类、自定义分类、创建） | BLOCKED |
| B3 | 按分类筛选 | BLOCKED |
| B4 | 相册详情：信息、返回、照片墙 | BLOCKED |
| B5 | 编辑相册：改名/改分类、保存 | BLOCKED |
| B6 | 删除相册 | BLOCKED |
| B7 | 添加照片：多选、上传进度、说明文字 | BLOCKED |
| B8 | 删除照片（本人或管理员；封面保护） | BLOCKED |
| B9 | 放大预览、上下张切换、键盘操作 | BLOCKED |
| B10 | 公告列表加载、置顶排序、受众与过期过滤 | BLOCKED |
| B11 | 阅读标记（打开即视为看过） | BLOCKED |
| B12 | 搜索公告、清除搜索 | BLOCKED |
| B13 | 发布时间显示 | BLOCKED |
| B14 | 公告详情页 | NOT_IMPLEMENTED |
| B15 | 成员发留言（公告板 composer） | BLOCKED |
| B16 | 删除留言（本人硬删 / 管理员软删进回收站） | BLOCKED |
| B17 | 互动体验三卡：指尖生花、空中书写、热门特效 | BLOCKED |
| B18 | 创作空间两卡：动态签名、音乐 | BLOCKED |
| B19 | 匿名提问精选卡 | BLOCKED |
| B20 | 发布一段歌声（歌名、介绍、音频文件、上传、匿名） | BLOCKED |
| B21 | 音频上限 20MB 与格式校验 | BLOCKED |
| B22 | 切换：大家的歌声 / 我的投稿 / 返回 | BLOCKED |
| B23 | 播放音频 | BLOCKED |
| B24 | 投稿状态显示与审核预计 | BLOCKED |
| B25 | 删除自己投稿（记录 + 音频文件） | BLOCKED |
| B26 | 先发后审：点发布即直接公开 | BLOCKED |
| B27 | 返回、头像、展示名、资料、个性签名、称号 | BLOCKED |
| B28 | 游戏资料展开 | BLOCKED |
| B29 | 社交展开 | BLOCKED |
| B30 | 自我介绍视频 | BLOCKED |
| B31 | 加好友 / 撤回申请 / 去处理 / 发消息 | BLOCKED |
| B32 | 解除好友 | BLOCKED |
| B33 | 拉黑 / 解除拉黑 | BLOCKED |
| B34 | 举报此成员 | BLOCKED |
| B35 | 好友申请可选邮件提醒 | BLOCKED |
| B36 | 匿名提问 / 时间线快捷入口 | BLOCKED |
| B37 | 自己主页上传头像（裁剪） | BLOCKED |
| B38 | 添加时刻（日期、标题、文字、照片/视频、保存） | BLOCKED |
| B39 | 列表按年分组、骨架屏、空态 | BLOCKED |
| B40 | 编辑时刻：改日期/标题/正文、换照片视频、移除媒体、保存/取消 | BLOCKED |
| B41 | 删除时刻（记录 + 媒体文件清理） | BLOCKED |
| B42 | 看其他成员时间线 | BLOCKED |
| B43 | 媒体查看（图片 / 视频） | BLOCKED |
| B44 | 媒体文件 10MB 上限 | BLOCKED |
| C1 | 上/下月切换 | BLOCKED |
| C2 | 点日期、看当日数量/记录 | BLOCKED |
| C3 | 点记录进对应页 | PARTIAL |
| C4 | 四源整合：活动/时间线/动态/日常/公告 | BLOCKED |
| C5 | 加载失败提示 | BLOCKED |
| C6 | 创建胶囊：标题/内容/开启日期/是否公开/保存 | BLOCKED |
| C7 | 分类：全部/收到的/发出的/未读/未开启/回收站 | BLOCKED |
| C8 | 阅读：点开/上下页/关闭 | BLOCKED |
| C9 | 自动轮播（自动滚动） | BLOCKED |
| C10 | 调顺序：点下面一封翻到最上面 | BLOCKED |
| C11 | 未到期绝不露标题与内容 | PARTIAL |
| C12 | 回收站：删除（碎纸机）/恢复/彻底删除/确认 | BLOCKED |
| C13 | 已读同步（跨设备） | BLOCKED |
| C14 | 倒计时显示 | BLOCKED |
| C15 | 许愿（发布） | BLOCKED |
| C16 | 查看愿望列表（瀑布流 + 作者名） | BLOCKED |
| C17 | 编辑自己愿望 | BLOCKED |
| C18 | 保存/取消编辑 | BLOCKED |
| C19 | 删除自己愿望 | BLOCKED |
| C20 | 活动列表 | BLOCKED |
| C21 | 活动详情（时间地点/描述/报名人数） | PARTIAL |
| C22 | 报名参加 | BLOCKED |
| C23 | 取消参与 | BLOCKED |
| C24 | 参与状态显示 | BLOCKED |
| C25 | 输入祝福、选对象（全班/某成员） | BLOCKED |
| C26 | 送出祝福 + 通知收件人 | BLOCKED |
| C27 | 查看留言列表 | BLOCKED |
| C28 | 删自己留言 | BLOCKED |
| C29 | 举报他人留言 | BLOCKED |
| C30 | 浏览特效列表（最多 10 条） | BLOCKED |
| C31 | 切换状态：打开/收起 | BLOCKED |
| C32 | 站内打开玩（iframe 沙箱渲染） | BLOCKED |
| C33 | 关闭/退出特效 | BLOCKED |
| C34 | "去原站看看"外链 | BLOCKED |
| C35 | 打开算一次使用（浏览计数） | BLOCKED |
| C36 | 每小时自动上新 1 个、最多保留 10 个、每 5 小时删最少人看的 1 个 | BLOCKED |
| C37 | 话题列表（从动态 #标签自动汇总） | BLOCKED |
| C38 | 搜索话题、清搜索 | BLOCKED |
| C39 | 选择/取消话题 | BLOCKED |
| C40 | 看指定话题全部动态 | PARTIAL |
| C41 | 从话题进发布页 | PARTIAL |
| C42 | 重载（加载失败"重新加载"） | BLOCKED |
| C43 | 翻开判词（输名 + 确认勾选） | BLOCKED |
| C44 | 看结果 | BLOCKED |
| C45 | 再抽一次 | BLOCKED |
| C46 | 全屏互动（"沉浸式开始 · 进入全屏互动"） | PARTIAL |
| C47 | 粒子预览（"先看粒子预览"演示模式） | BLOCKED |
| C48 | 自动演示完整花期 | BLOCKED |
| C49 | 手势/触控创作 | BLOCKED |
| C50 | 切换模式（花朵 / 书写两种工具） | BLOCKED |
| C51 | 专注模式 | BLOCKED |
| C52 | 画质（预设 + 刷新上限） | BLOCKED |
| C53 | 竖/横屏切换（"画面构图"） | PARTIAL |
| C54 | 退出（返回发现） | BLOCKED |
| C55 | 重写（重新书写） | BLOCKED |
| C56 | 撤销 | BLOCKED |
| C57 | 清空 | BLOCKED |
| C58 | 保存作品/图片（PNG 下载） | BLOCKED |
| C59 | 收藏作品（本机作品集） | BLOCKED |
| C60 | 分享 | BLOCKED |
| C61 | 删除（作品集内删除） | BLOCKED |
| C62 | 开启（说明卡 + 摄像头授权） | BLOCKED |
| C63 | 选字（候选字选择） | BLOCKED |
| C64 | 换一批（候选字分页） | BLOCKED |
| C65 | 确认（确认这个字） | BLOCKED |
| C66 | 开始书写（捏合落笔） | BLOCKED |
| C67 | 重写（重新书写） | BLOCKED |
| C68 | 撤销上一笔（按钮 + 手势） | BLOCKED |
| C69 | 清空（按钮 + 手势） | BLOCKED |
| C70 | 保存 PNG | BLOCKED |
| C71 | 退出 | BLOCKED |
| C72 | 指尖生花入口卡 | BLOCKED |
| C73 | 空中书写入口卡 | BLOCKED |
| C74 | 热门特效入口卡 | BLOCKED |
| C75 | 匿名提问入口卡 | BLOCKED |
| C76 | 动态签名入口卡（独立页外链） | BLOCKED |
| C77 | 音乐入口卡（独立音乐站） | BLOCKED |
| C78 | 下拉刷新 | PARTIAL |
| C79 | 灵动岛组件与挂载（音乐/通话/上传/下载/语音录制/导航/提醒活动） | PARTIAL |
| C80 | 设置入口：灵动岛位置/尺寸调整 | PARTIAL |
| C81 | 任务抽屉（活动进度展示） | PARTIAL |

## 4. 修复清单（FIX-3，11 项）

| 编号 | 问题 | 严重程度 | 修复内容 | 状态 |
|---|---|---|---|---|
| FIX-3-1 | 字体大小设置刷新后失效 | 中 | main.tsx 启动时读一次 `qznb_font_size_v1` 并应用（13/14/16/18 才应用，无效值忽略），不并入云端同步 | 已修复，登录态待验证 |
| FIX-3-2 | 表白 pending 文案与先发后审矛盾 | 低 | MeHub 表白卡 pending 由“审核通过后公开展示”→“待展示” | 已修复 |
| FIX-3-3 | 四处加载失败显示误导性空态 | 中 | Board / Timeline / Wishes / Events 的 load() 改判查询 error，失败显示错误卡片并 return；Events 取消报名判 delete error；Wishes post() 加 busy 锁防重复提交 | 已修复，登录态待验证 |
| FIX-3-4 | “堯”品牌残留 | 低 | MusicIsland iframe title→“千栀音乐空间”；返回按钮→“返回 Class Memory”；岛 label→“Class Memory 实时活动”（测试文件与 CSS 注释里的“堯”有意保留，未动） | 已修复 |
| FIX-3-5 | 歌声墙前端白名单不含 FLAC | 低 | SongWall 白名单正则 + accept 属性补 flac，与 song-audio 桶允许的 audio/flac 一致 | 已修复，登录态待验证 |
| FIX-3-6 | 时间线添加正文无长度校验；他人页标题缺名 | 低 | add() 加正文 2000 字校验（与 saveEdit 同口径）+ textarea maxLength；member_detail 失败/无名时标题兜底“这位同学” | 已修复，登录态待验证 |
| FIX-3-7 | 相册批量上传说明只写第一张、无提示 | 低 | 说明输入框下方加提示“一次选多张照片时，说明只会写到第一张照片上。”；上传逻辑未动 | 已修复 |
| FIX-3-8 | 编辑页通知栏跳转绕过 router | 低 | MyProfile 通知栏按钮由直接改 location.hash 改为 nav('/me/notifications') | 已修复 |
| FIX-3-9 | 歌声墙失败提示丢具体原因；删除先文件后行 | 低 | publish() 的 catch 改带 error.message；deleteSong() 改先删行再删文件，文件清理失败只提示不报错 | 已修复，登录态待验证 |
| FIX-3-10 | 指尖生花“全屏/横屏”名不副实 | 低 | 进入体验时 try requestFullscreen（失败继续沉浸布局）；切横屏时 try screen.orientation.lock('landscape')，切回竖屏时 unlock（均 try/catch 兜底）；按钮文案与退出逻辑未动 | 已修复，登录态/真机待验证 |
| FIX-3-11 | 仓库与生产库漂移收敛（part 2） | 中 | 新增幂等迁移 `20261121093000_audit_phase3_drift_convergence.sql`：board_messages / board_reads / events / event_regs / wishes / greetings / time_capsules / hot_snippets 八张表建表 + RLS、albums.deleted_at 列、缺失的 21 条策略、song_audio_delete_own_submission 存储策略、bump_hot_snippet_view 函数定义 | 已应用到生产并回读核对（策略仍 30 条、tc_sel 仍为原表达式，生产无变化） |

验证：worktree 内 `npm run typecheck` / `npm run build` / `npm run check:styles` / `npm run check:admin-styles` 全部通过（另由主代理独立复跑 typecheck + build 通过）。迁移已应用，`schema_migrations` 记入 version `20261121005949`（name `audit_phase3_drift_convergence`）；回读确认 8 张表策略仍 30 条、`tc_sel` 仍为原表达式，生产无变化。

## 5. 未修项（产品决策待定或需真机验证）

- **高，待用户定夺**：时光胶囊 `tc_sel` 隐私缺口（C S1）——正确修法是新增 RPC（未开启时只返 id/作者/open_at，不返标题内容）+ RLS 加 `open_at` 门控，改动涉及前后端契约，本次只写清修法、未动手；灵动岛全套保留还是彻底删除（C S3）——14 个组件 + App 约 20 处接线 + 设置入口 + 任务抽屉全在跑，需用户一句话。
- **产品决策类**：“卡片进原页”只跳列表 + 搜索预填（A S2）、“我的评论”无列表（A S4）、收藏档案失效静默丢弃（A S5）、`/me/notifications` 只是重定向（A S6）、两类通知关不掉（A S7）、各列表 50/100 条上限无分页（A S8/S10、B S11、C S8）、Dock 红点不按类型偏好过滤（A S9）、公告详情页（B14）、发现页下拉刷新空操作（B S5/C S6）、热门特效自动上新无实现（C S7）、“进列表页不定位单条”三处口径（C S11）、话题发布入口只在空态（C S13）。
- **残留**：全新环境按顺序重放迁移仍会在更早的迁移处失败（如 018 的祝福触发器、`20261031160847` 的 `bm_ins`/`g_ins` 在 FIX-3-11 建表之前就引用这些表），要彻底修好需改动历史迁移，不在本迁移范围；生产库不受影响。
- **需真机/登录验证**：152 项 BLOCKED 的登录态行为（清单见各线底稿 §NOT_TESTED）；FIX-3-1/3-3/3-5/3-6/3-9/3-10 的登录态回归；指尖生花全屏 API 在手机 WebView 内的实际表现。

## 6. 工作底稿

- `audit-phase3-work/me-profile-audit.md`（A 线：52 项）
- `audit-phase3-work/content-pages-audit.md`（B 线：44 项）
- `audit-phase3-work/fun-pages-audit.md`（C 线：81 项）

## 7. 其他待办（跨阶段）

- L-03（第 2 阶段遗留）：注册页协议复选框初始状态仍未在线上核对到——云浏览器处于已登录态、且不允许为此退出登录；待用户在手机无痕/隐私标签下自行看一次注册页复选框初始状态后定论。
