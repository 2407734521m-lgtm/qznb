# 全站功能与前后端可用性审计 — 总索引

- 项目：`2407734521m-lgtm/qznb`
- 主站：`https://qianzhi.pw`（纯文字网址，下同）
- 后台：`https://admin.qianzhi.pw`
- 音乐站：`https://music.qianzhi.pw`
- 审计基线：第 1 阶段为 `main` 分支 HEAD `54d3dd4`（2026-11-18，`feat(admin): step 6 of Flux rebuild — overview polish, motion + press feedback (#753)`）
- 审计日期：第 1 阶段 2026-11-21
- 生产 Supabase 项目（任务书指定）：`ldypnxxxgscibopgiaso`（`class-youth-archive2`）；不要用旧项目 `class-youth-archive` 做测试。
- 状态定义（任务书）：`PASS` / `PARTIAL` / `FAIL` / `BLOCKED` / `NOT_IMPLEMENTED` / `NOT_TESTED`，每个功能只能用其中之一。

## 阶段进度

| 阶段 | 范围 | 状态 | 报告 |
|---|---|---|---|
| 第 1 阶段 | 网站基础、导航与公共页面 | 已完成（FIX-1 已回归通过） | `AUDIT_PHASE_1.md` |
| 第 2 阶段 | 用户账号与社交功能 | 已完成（FIX-2 12 项已修复，登录态 106 项待验证） | `AUDIT_PHASE_2.md` |
| 第 3 阶段 | 个人中心与扩展功能 | 已完成（FIX-3 11 项已修复，登录态 152 项待验证） | `AUDIT_PHASE_3.md` |
| 第 4 阶段 | 管理员后台 | 已完成（FIX-4 7 项已修复，登录态 175 项待验证） | `AUDIT_PHASE_4.md` |
| 第 5 阶段 | 独立服务、移动应用与部署链路 | NOT_TESTED（尚未开始） | — |

> 注意：2026-11-21 写报告时，`origin/main` 已比基线多 1 个提交（后台总览暖光修复 PR #754，属后台样式，不在第 1 阶段范围内）。本阶段结论以基线 `54d3dd4` 为准，没有把该提交算进去；后续阶段开始前应先确认新基线。

## 第 1 阶段计数（逐项表共 40 行，数字与 `AUDIT_PHASE_1.md` 逐项表对得上）

| 状态 | 数量 |
|---|---|
| PASS | 13 |
| PARTIAL | 6 |
| FAIL | 0 |
| BLOCKED | 11 |
| NOT_IMPLEMENTED | 0 |
| NOT_TESTED | 10 |
| 合计 | 40 |

计数口径（写在前面，避免误读）：

- 一行 = 一个可独立验证的入口 / 控件 / 页面。同一入口的不同子行为分行计（例如 Dock 四栏与长按面板是不同触发方式，分开计）；同一功能的重复表述不重复计。
- 代码已确认、线上未验证的，不算 PASS。登录态才能验证的，记 `BLOCKED`（未登录限制）；本阶段根本没安排验证的，记 `NOT_TESTED`。两者不混用。
- 第 2–5 阶段的功能（注册提交、登录后 Dock/搜索、好友/私信、个人中心、管理后台、音乐站等）不在这 40 行里，不要把它们读成已检查。

## 第 1 阶段状态总表（只列第 1 阶段的 40 项）

### PASS（13）

| # | 功能 | 入口/路由 |
|---|---|---|
| 1 | 启动首屏与开场动画（游客态） | `https://qianzhi.pw` 首屏 |
| 2 | Hash 路由刷新 / 深链 | `#/home` 刷新 |
| 3 | 根重定向 | `/` → `#/home` |
| 4 | SPA 内 404 兜底（hash） | `#/不存在的路径` → `#/home` |
| 5 | 受限直访守卫（游客态） | `#/me`、`#/friends`、`#/chat/xxx` → `#/home` |
| 6 | 游客首页 | `#/home`（GuestHome） |
| 7 | 游客动态 | `#/feed` |
| 8 | 游客日常 | `#/daily` |
| 9 | 游客表白墙 | `#/love-wall` |
| 10 | 游客公告 | `#/board` |
| 11 | 游客点赞 / 评论 / 发布引导登录 | 游客动态/表白墙卡片、认识成员（带锁） |
| 12 | 动态签名页（未点播放/下载） | `https://qianzhi.pw/signature/` |
| 13 | 非 hash 路径 404（FIX-1 回归通过，原 FAIL） | `https://qianzhi.pw/不存在的路径` → 本站 404 页，5 秒自动回 `#/home` |

### PARTIAL（6）

| # | 功能 | 入口/路由 | 缺口 |
|---|---|---|---|
| 14 | `/music` 占位路由 | `#/music` | 游客态回 `#/home`；登录态是否空白未验证（代码称只渲染空 div） |
| 15 | 游客顶栏 | GuestBrowse 顶栏 | 桌面可见、导航可用；过期时间显示存疑待复核（见报告 §7 存疑点） |
| 16 | 登录页（只看控件，未提交） | 登录弹窗 | 控件齐全；未提交、未发验证码；未见“游客登录”按钮（已是游客态，合理） |
| 17 | 注册页（只看控件，未提交） | 注册页 | 控件齐全；未提交、未发验证码；同意协议默认已勾选，待确认 |
| 18 | 加载骨架 / 加载态 | 全站切页、刷新 | 数秒骨架后正常加载；失败重载未验证 |
| 19 | 全站通用弹窗基础设施 | DialogHost 等 | 代码完整 + 游客登录弹窗已打开；其他弹窗类型未逐个验证 |

### FAIL（0）

无。原 FAIL 项（非 hash 路径 404）已由 FIX-1 修复并回归通过，改记 PASS，见上表第 13 行。

### BLOCKED（11）

| # | 功能 | 阻塞原因 |
|---|---|---|
| 20 | 主站 `/admin` 行为（未登录 vs 已登录） | 未登录限制 + 线上未验证；代码已见矛盾（A-S1） |
| 21 | 顶部导航（登录态） | 未登录限制；代码称全宽度 CSS 隐藏，登录态未实测 |
| 22 | 底部 Dock 四栏 | 未登录限制；游客态不挂载 |
| 23 | Dock 长按面板 | 未登录限制 |
| 24 | Dock 收起 / 停靠切换 | 未登录限制 |
| 25 | Dock 未读红点 | 未登录限制 |
| 26 | Dock 桌面底部遮挡 | 未登录限制；代码称桌面 `.wrap` 留白 40px < Dock 占用约 72px |
| 27 | 全局搜索入口 | 未登录限制；游客态不挂载 |
| 28 | 全局搜索实际检索 | 未登录限制 |
| 29 | 搜索盲区 / 部分失败静默 | 未登录限制；代码级结论，线上未验证 |
| 30 | 移动端 390px 布局 | 环境限制：云浏览器窗口固定 1920×998、无视口调整；本地 headless Chrome 代理鉴权失败，连不上网 |

### NOT_TESTED（10）

| # | 功能 | 备注 |
|---|---|---|
| 31 | 找回密码页 | 代码存在，未在线打开 |
| 32 | 邮箱验证态 | 代码存在，未触发 |
| 33 | 隐私政策与用户协议弹窗 | 代码存在，未在线打开 |
| 34 | 公开落地页 PublicLanding | 依赖 `skip_login_screen` 开关，未触发 |
| 35 | 登录关闭页 LoginClosedScreen | 依赖 `close_login_entry` 开关，未触发 |
| 36 | 维护页 MaintenanceScreen | 依赖维护开关，未触发 |
| 37 | 邮件回跳重置密码页 ResetPassword | 依赖邮件链接，未触发 |
| 38 | 真实世界视觉识别页 | 静态页 `https://qianzhi.pw/realworld/`，代码存在，未在线打开 |
| 39 | 错误边界（ErrorBoundary）实际触发 | 代码存在，未触发真实错误 |
| 40 | 全局 Toast（Sonner）实际弹出 | 代码存在，本阶段无触发场景 |

## 第 1 阶段修复清单（只列已确认的 1 项，已修复并回归通过）

| 编号 | 问题 | 严重程度 | 修复方案 | 状态 |
|---|---|---|---|---|
| FIX-1 | 非 hash 路径显示 GitHub Pages 默认 404，无本站页面 | 中 | 新增 `public/404.html`：品牌版 404 页，文案说明页面不存在，提供回首页按钮/链接（HashRouter 下回 `#/home`），5 秒自动回首页，样式与主站冷白一致；不改路由、不改守卫。 | 已修复并回归通过（PR #755；回归 2026-11-21 08:28–08:29，4/4 PASS） |

其余可疑点（A 线 S1–S10、B 线 10 项、C 线 Q1–Q10 / S1–S13，共 43 项，含重复交叉引用）全部列在 `AUDIT_PHASE_1.md` §6，多数是代码级结论、线上待验证，本阶段不列为已确认修复项，不擅自改。

## 第 2 阶段计数（逐项表共 130 行，数字与 `AUDIT_PHASE_2.md` 逐项表对得上）

| 状态 | 数量 |
|---|---|
| PASS | 1 |
| PARTIAL | 13 |
| FAIL | 0 |
| BLOCKED | 106 |
| NOT_IMPLEMENTED | 10 |
| NOT_TESTED | 0 |
| 合计 | 130 |

分线：A 线账号 39 项（PASS 1、PARTIAL 11、BLOCKED 26、NOT_IMPLEMENTED 1）；B 线内容互动 39 项（BLOCKED 33、NOT_IMPLEMENTED 6）；C 线好友与私信 52 项（PARTIAL 2、BLOCKED 47、NOT_IMPLEMENTED 3）。本阶段唯一确认的 FAIL（群语音无入口 D-06）已接线，改记 PARTIAL，待登录验证。

## 第 2 阶段修复清单（FIX-2，12 项）

| 编号 | 问题 | 严重程度 | 修复内容 | 状态 |
|---|---|---|---|---|
| FIX-2-1 | 群语音完全无入口（原 FAIL） | 高 | 群聊资料页加“加入群语音”按钮（进行中显示人数、可回到通话中）；打开群聊时 `watchConversation` 订阅状态 | 已修复，登录态待验证 |
| FIX-2-2 | 退出登录作用域不一致 | 中 | 编辑资料页退出改为 `signOut({scope:'local'})`，文案与账号安全页一致 | 已修复，登录态待验证 |
| FIX-2-3 | `nav('/login')` 死路由 | 低 | 账号安全页与设备管理页去掉退出后跳转（Shell 自动渲染登录页），删未用的 `nav` | 已修复 |
| FIX-2-4 | 游戏 ID 无开关 | 中 | 隐私设置页与编辑资料隐私栏各加“游戏 ID”开关 | 已修复，登录态待验证 |
| FIX-2-5 | 第 11 个兴趣标签静默丢弃 | 低 | 满 10 个时显示“已达到上限（10 个），删掉一个才能再加” | 已修复 |
| FIX-2-6 | `doReg` 死代码 | 低 | 删除 `Login.tsx` 的 `doReg`（零调用点） | 已修复；A11 改记 PASS |
| FIX-2-7 | 自我介绍视频注释误导 + 通行密钥文案误导 | 低 | 注释改为“进入审核，通过后他人可见”；两处通行密钥文案改为登录入口上线后可用 | 已修复 |
| FIX-2-8 | 删除通行密钥无确认 | 低 | 删前加 confirmDialog（两处） | 已修复 |
| FIX-2-9 | 表白墙按钮文案与先发后审不符 | 低 | “提交审核”→“发布” | 已修复 |
| FIX-2-10 | 动态加载与点赞静默失败 | 中 | 主查询失败 toast 并 return；点赞/取消失败 toast 并 return | 已修复，登录态待验证 |
| FIX-2-11 | 日常无下拉刷新；动态搜索无清除按钮 | 低 | 日常（非内嵌）包 PullToRefresh；动态搜索横条加“清除搜索”按钮 | 已修复，登录态待验证 |
| FIX-2-12 | 仓库与生产库漂移收敛 | 中 | 新增幂等迁移 `20261121090000_audit_phase2_drift_convergence.sql`：reports 表 + 三策略、comments UPDATE 两策略、profiles.phone 授权、show_game_id / game_id 两列、chat-media 桶 50MB + 33 个 MIME | 已应用到生产并回读核对（生产无变化） |

未修项（产品决策待定或需真机验证）：信任设备开关与限流登录链接是否开启、通行密钥登录入口、表白墙点赞/动态头像进主页/拉黑隐藏内容是否补、设备清单、改密码验旧密码、两套改密 UI 统一、聊天核心四表建表迁移、`mark_conversation_read` 两版本 diff、无 TURN 跨网通话、撤回图片直链残留、长会话首屏耗时。详见 `AUDIT_PHASE_2.md` §5。

## 第 3 阶段计数（逐项表共 177 行，数字与 `AUDIT_PHASE_3.md` 逐项表对得上）

| 状态 | 数量 |
|---|---|
| PASS | 0 |
| PARTIAL | 24 |
| FAIL | 0 |
| BLOCKED | 152 |
| NOT_IMPLEMENTED | 1 |
| NOT_TESTED | 0 |
| 合计 | 177 |

分线：A 线个人中心本体 52 项（PARTIAL 13、BLOCKED 39）；B 线内容扩展页 44 项（BLOCKED 43、NOT_IMPLEMENTED 1）；C 线趣味/活动页 81 项（PARTIAL 11、BLOCKED 70）。本阶段无 FAIL；唯一 NOT_IMPLEMENTED 是公告详情页（B14，无 `/board/:id` 路由，正文全文 inline 展示，不影响阅读）。

## 第 3 阶段修复清单（FIX-3，11 项）

| 编号 | 问题 | 严重程度 | 修复内容 | 状态 |
|---|---|---|---|---|
| FIX-3-1 | 字体大小设置刷新后失效 | 中 | main.tsx 启动时读一次 `qznb_font_size_v1` 并应用 | 已修复，登录态待验证 |
| FIX-3-2 | 表白 pending 文案与先发后审矛盾 | 低 | MeHub 表白卡 pending 由“审核通过后公开展示”→“待展示” | 已修复 |
| FIX-3-3 | 四处加载失败显示误导性空态 | 中 | Board / Timeline / Wishes / Events 的 load() 改判查询 error，失败显示错误卡片；Events 取消报名判 delete error；Wishes post() 加 busy 锁 | 已修复，登录态待验证 |
| FIX-3-4 | “堯”品牌残留 | 低 | MusicIsland iframe title→“千栀音乐空间”；返回按钮→“返回 Class Memory”；岛 label→“Class Memory 实时活动” | 已修复 |
| FIX-3-5 | 歌声墙前端白名单不含 FLAC | 低 | SongWall 白名单正则 + accept 属性补 flac，与桶一致 | 已修复，登录态待验证 |
| FIX-3-6 | 时间线添加正文无长度校验；他人页标题缺名 | 低 | add() 加正文 2000 字校验 + textarea maxLength；member_detail 失败时标题兜底“这位同学” | 已修复，登录态待验证 |
| FIX-3-7 | 相册批量上传说明只写第一张、无提示 | 低 | 说明输入框下方加提示；上传逻辑未动 | 已修复 |
| FIX-3-8 | 编辑页通知栏跳转绕过 router | 低 | MyProfile 通知栏按钮由直接改 location.hash 改为 nav('/me/notifications') | 已修复 |
| FIX-3-9 | 歌声墙失败提示丢具体原因；删除先文件后行 | 低 | publish() 的 catch 改带 error.message；deleteSong() 改先删行再删文件 | 已修复，登录态待验证 |
| FIX-3-10 | 指尖生花“全屏/横屏”名不副实 | 低 | 进入体验时 try requestFullscreen；切横屏时 try screen.orientation.lock，均 try/catch 兜底 | 已修复，登录态/真机待验证 |
| FIX-3-11 | 仓库与生产库漂移收敛（part 2） | 中 | 新增幂等迁移 `20261121093000_audit_phase3_drift_convergence.sql`：八张表建表 + RLS、albums.deleted_at 列、缺失的 21 条策略、song_audio_delete_own_submission 存储策略、bump_hot_snippet_view 函数定义 | 已应用到生产并回读核对（策略仍 30 条、tc_sel 仍为原表达式，生产无变化） |

未修项（产品决策待定或需真机验证）：时光胶囊 `tc_sel` 隐私缺口（简单加门控会藏掉锁信封 UI，正确修法是 RPC 只返元数据，需另立方案等用户定夺）；灵动岛全套保留还是彻底删除；“卡片进原页”只跳列表、“我的评论”无列表、各列表 50/100 条上限无分页、热门特效自动上新无实现等产品决策类；全新环境重放迁移仍会在更早的迁移处失败（历史迁移引用顺序问题，需改动历史迁移，不在本范围）。详见 `AUDIT_PHASE_3.md` §5。

## 第 4 阶段计数（逐项表共 268 行，数字与 `AUDIT_PHASE_4.md` 逐项表对得上）

| 状态 | 数量 |
|---|---|
| PASS | 0 |
| PARTIAL | 81 |
| FAIL | 7 |
| BLOCKED | 175 |
| NOT_IMPLEMENTED | 5 |
| NOT_TESTED | 0 |
| 合计 | 268 |

分线：A 线运营总览 62 项（PARTIAL 6、FAIL 2、BLOCKED 53、NOT_IMPLEMENTED 1）；B 线成员与内容 118 项（PARTIAL 12、FAIL 4、BLOCKED 98、NOT_IMPLEMENTED 4）；C 线沟通与安全 88 项（PARTIAL 63、FAIL 1、BLOCKED 24）。本阶段 7 项 FAIL 均为代码层面已证明不可用（三个页签无入口、全站通知中心死链、总览药丸与顶栏齿轮对普通管理员空白、匿名提问子栏无渲染分支、段位撤销必失败），已全部由 FIX-4 修复。

## 第 4 阶段修复清单（FIX-4，7 项）

| 编号 | 问题 | 严重程度 | 修复内容 | 状态 |
|---|---|---|---|---|
| FIX-4-1 | 三个已注册页签无入口；「全站通知中心」按钮通向空白页 | 高 | NAV_GROUPS 加 reviewCenter、musicDownloads、communication（+ 图标 + 描述）；Admin.tsx 加 notifications 页签（TABS_ALL + 渲染分支，渲染现成的 AdminNotificationCenter）并进 NAV_GROUPS | 已修复，管理员登录态待验证 |
| FIX-4-2 | 总览药丸与顶栏齿轮对普通管理员是死路 | 高 | Overview 接 isSuper，超管专属药丸与入门指南项对内容管理员隐藏；顶栏设置齿轮只对超管渲染；Admin.tsx switchTab 拦不存在 id 与无权超管页签并 toast 提示；渲染层加兜底提示卡而不是空白 | 已修复，管理员登录态待验证 |
| FIX-4-3 | 内容审核「匿名提问」子栏是死标签 | 高 | Moderate.tsx 补 `sub === 'questions'` 渲染分支，接通已有的 setAnonymousQuestionHidden 做隐藏/恢复；搜索过滤一并接通 | 已修复，管理员登录态待验证 |
| FIX-4-4 | 游戏段位「撤销已审核」必定失败 | 高 | 选了前端修法，没动生产函数：revoke() 改为直接 update game_profiles（status='pending' + updated_at，限 status='approved' 的行，0 行时报错），alog('game_revoke') 保留 | 已修复，管理员登录态待验证 |
| FIX-4-5 | 四处 RPC 旧式 NULL-role 写法 | 中 | 四个函数守卫改成 (my_role() is null or my_role() <> 'super_admin')，与 010 写法一致；每函数只改 1 行、其余逐字保留 | 已应用到生产并回读核对 |
| FIX-4-6 | 五处小修 | 低 | BoardMgr「移除图片」清空后立即保存；下载记录「刷新」改重拉查询；两处报错文案改「请检查管理员数据库权限」；Logs 加失败文案；TestTab 测试账号邮箱加 isQQEmail 校验 | 已修复，管理员登录态待验证 |
| FIX-4-7 | 仓库与生产库漂移收敛（part 3） | 中 | 新增幂等迁移 `20261121094500_audit_phase4_drift_convergence.sql`：site_settings / backup_logs 建表 + RLS + 5 条策略（ss_sel 保持 using (true) 未动）；四个 RPC 定义逐字收录 | 已应用到生产并回读核对（策略仍 5 条，生产无非预期变化） |

未修项（产品决策待定或需真机验证）：邀请码权限口径、公告横幅保存口径、admin_update_profile 禁改超管目标、ss_sel=true 收紧、nt_sel 全站通知、定向消息超管门、健康检查探针 key 归属、审核中心「退回待审核/重新打开」与回收站「彻底清理」是否补。详见 `AUDIT_PHASE_4.md` §5。

## 工作底稿（审计过程文件，不计入交付计数）

- `audit-phase1-work/route-audit.md`（A 线：47 条路由、访客、404、错误边界）
- `audit-phase1-work/nav-search-audit.md`（B 线：Dock、顶栏、搜索、弹窗、toast、骨架）
- `audit-phase1-work/public-pages-audit.md`（C 线：8 个公共面、首页、样式冲突、移动端）
- `audit-phase1-work/full-inventory-checklist.md`（用户全量清单，仅作对照；第 2–5 阶段部分未查）

## 规则遵守记录

- 第 1 阶段：只做了第 1 阶段，完成后停止，未进入第 2 阶段；未改任何产品代码，未提交、未合并，未跑生产写入，未删真实用户数据，未向真实用户发测试私信/通知/邮件，未清理生产 Storage，未执行生产数据库迁移；线上实测全程只读、未登录。
- 第 2 阶段：三条代码审计线全程只读，未登录任何账号，未向真实用户发任何消息，未发测试邮件，未删真实用户数据，未清理生产 Storage；唯一生产写入是幂等收敛迁移 FIX-2-12（已回读核对，生产无变化）；代码修复 11 项在独立 worktree 的 `fix/audit-phase2-code` 分支上，`npm run typecheck` / `npm run build` / `npm run check:styles` / `npm run check:admin-styles` 全部通过；登录态 106 项因无可登录测试账号记 BLOCKED，未猜测为可用。
- 第 3 阶段：三条代码审计线全程只读，未登录任何账号，未向真实用户发任何消息，未发测试邮件，未删真实用户数据，未清理生产 Storage；唯一生产写入是幂等收敛迁移 FIX-3-11（已回读核对，策略仍 30 条、`tc_sel` 仍为原表达式，生产无变化）；代码修复 10 项在独立 worktree 的 `fix/audit-phase3-code` 分支上，`npm run typecheck` / `npm run build` / `npm run check:styles` / `npm run check:admin-styles` 全部通过（主代理独立复跑 typecheck + build 通过）；登录态 152 项因无可登录测试账号记 BLOCKED，未猜测为可用；时光胶囊隐私缺口与灵动岛去留未擅自改，等用户定夺。
- 第 4 阶段：三条代码审计线全程只读，未登录任何账号，未向真实用户发任何消息，未发测试邮件，未删真实用户数据，未清理生产 Storage；备份/恢复、版本发布、应用发布、批量邮件、批量通知等生产写操作只核对入口与调用链，未实际执行；唯一生产写入是两处幂等迁移 FIX-4-5（NULL-role 守卫，每函数恰好只改 1 行）与 FIX-4-7（漂移收敛，策略仍 5 条），均已回读核对、生产无非预期变化；代码修复 6 项在独立 worktree 的 `fix/audit-phase4-code` 分支上，`npm run typecheck` / `npm run build` / `npm run check:styles` / `npm run check:admin-styles` 全部通过（主代理独立复跑 typecheck + build 通过）；登录态 175 项因无可登录管理员测试账号记 BLOCKED，未猜测为可用；邀请码/横幅/改资料等权限口径未擅自改，等用户定夺。
- 未把“组件存在 / 接口 200 / 构建通过”当成可用；代码已确认、线上未验证的不算 PASS。
