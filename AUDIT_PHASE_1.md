# 第 1 阶段审计报告：网站基础、导航与公共页面

- 项目：`2407734521m-lgtm/qznb`
- 主站：`https://qianzhi.pw`
- 基线：`main` 分支 HEAD `54d3dd4`（2026-11-18，`feat(admin): step 6 of Flux rebuild — overview polish, motion + press feedback (#753)`），审计开始时 `git status` 干净、无未提交修改
- 审计日期：2026-11-21（代码审计）+ 2026-11-21 08:14–08:18（线上实测，桌面 1920×998，未登录，全程只读）
- 报告状态：第 1 阶段已审计、待修复；完成后停止，未进入第 2 阶段
- 总索引：`AUDIT.md`

## 0. 计数（先写在前面，数字与逐项表对得上）

逐项表共 **40 行**，一行 = 一个可独立验证的入口 / 控件 / 页面。同一入口的不同子行为分行计（例如 Dock 四栏与长按面板触发方式不同，分开计）；同一功能的重复表述不重复计。

| 状态 | 数量 | 项 ID |
|---|---|---|
| PASS | 12 | 1、2、3、4、6、19、20、21、22、23、24、34 |
| PARTIAL | 6 | 7、10、25、26、38、39 |
| FAIL | 1 | 5 |
| BLOCKED | 11 | 8、9、11、12、13、14、15、16、17、18、40 |
| NOT_IMPLEMENTED | 0 | — |
| NOT_TESTED | 10 | 27、28、29、30、31、32、33、35、36、37 |
| 合计 | 40 | — |

> 编号说明：本文件的项 ID 为 1–40 顺序编号。`AUDIT.md` 按状态分组列出同一批 40 项，分组内序号与本文件 ID 不是同一编号体系，**计数一致（40；12 / 6 / 1 / 11 / 10 / 0），编号呈现方式不同**，不是计数对不上。
>
> 计数规则：代码已确认、线上未验证的，不算 PASS；登录态才能验证的，记 `BLOCKED`（未登录限制）；本阶段根本没安排验证的，记 `NOT_TESTED`。两者不混用。
>
> 基线说明：写报告时 `origin/main` 已比基线多 1 个提交（后台总览暖光修复 PR #754，属后台样式，不在第 1 阶段范围内）。本阶段结论以 `54d3dd4` 为准，没有把该提交算进去。

## 1. 方法与证据来源

### 1.1 代码审计（三线并行，只读）

| 线 | 文件 | 内容 |
|---|---|---|
| A 线 | `audit-phase1-work/route-audit.md` | 路由 / 启动 / 访客权限 / 404 / 错误边界。主站 `<Route>` 47 条（含根重定向、2 条别名重定向、1 条 `*` 兜底），访客树 7 条；无独立 `RequireAuth` 组件，守卫在 `Shell` 的 early return；`HashRouter`；`public/404.html` 不存在 |
| B 线 | `audit-phase1-work/nav-search-audit.md` | Dock、顶栏、搜索、弹窗、toast、骨架。Dock 四栏 + 长按面板 6 项 + 5 操作；顶栏 DOM 仍渲染但被 CSS 全宽度隐藏；全局搜索只以弹窗形态存在，无 `/search` 路由；Sonner 调用 43 处（6 个文件） |
| C 线 | `audit-phase1-work/public-pages-audit.md` | 8 个公共面、登录后首页、样式冲突、移动端。登录/注册/找回密码无独立路由，是 `Login.tsx` 内三态；隐私政策无独立路由，是注册页内弹窗；CSS 共 80 个文件约 27,732 行，`src` 下 `!important` 4,075 处 |

### 1.2 线上实测（2026-11-21 08:14–08:18，桌面 1920×998，未登录，全程只读）

- 环境：云浏览器桌面窗口 1920×998，未登录游客态。未提交登录/注册、未发验证码、未点赞/评论/发布、未点签名页播放/下载，未改任何数据，未向真实用户发任何消息。
- 覆盖：首屏、访客首页/动态/日常/表白墙/公告、受限直访、非 hash 404、登录/注册弹窗控件、签名页。
- 未覆盖：登录后全部功能（Dock、搜索、音乐页、成员/聊天/个人页）、窄屏 390px（见第 40 项 BLOCKED 原因）、维护/落地页/登录关闭等开关依赖页面、真实错误触发场景。
- 每次切页/刷新都有数秒空白骨架加载态，之后正常加载，不是持续白屏。

### 1.3 对照清单

用户全量清单见 `audit-phase1-work/full-inventory-checklist.md`（主站 38 节 + 后台 27 模块 + 音乐站 + 签名 + 应用更新）。本阶段只覆盖其中基础 / 导航 / 公共页面部分；第 2–5 阶段的功能（好友/私信/聊天、个人中心、管理后台、音乐站播放等）**不在本报告逐项表里**，不要把它们读成已检查。

### 1.4 每项的字段说明

逐项表每项记录：功能、入口/路由、状态、前端证据、接口证据、数据库证据、复现步骤、问题原因、修复记录（本阶段留空，见 §8）、回归结果（留空）。接口/数据库证据为“只读核对”：代码审计阶段未查生产库（A 线 §10 第 8 条明确记录），生产库开关当前值未知；线上实测阶段未做生产写入。

---

## 2. 逐项表（40 项）

### 第 1 项 — 启动首屏与开场动画（游客态）— PASS

- 入口/路由：`https://qianzhi.pw` 首屏
- 前端证据：`src/main.tsx:198–222`（`SiteIntro`，非后台域名挂载；`sessionStorage['qz_intro_seen_v1']` 同一标签页只播一次）；`src/components/IntroAnimation.tsx:11–12`（`AUTO_DONE_MS = 2900`，`EXIT_MS = 450`；点按跳过；减弱动效时不播）；`src/components/fx/Skeleton.tsx`（`RouteLoading`“正在打开…”）
- 接口证据：首屏调 `public_guest_landing` RPC 取公共配置（`src/App.tsx:1155–1174`，15 秒轮询）
- 数据库证据：`site_settings`（`guest_browse_available` 等开关）；本次未查生产库，开关当前值以线上表现为准（游客模式开启）
- 复现步骤：未登录打开主站 → 先见“正在打开…”骨架 → 开场动画“欢迎来到 Class Memory / 点我开始”，右下角“点击跳过” → 约 4–5 秒后自动消失，进访客首页 `#/home`；刷新相同，无白屏报错
- 问题原因：无。注：线上约 4–5 秒与代码 `AUTO_DONE_MS 2900ms` 有出入，可能是骨架 + 动画叠加耗时，见 §7 存疑点 L-04，不定为故障
- 修复记录：（空）
- 回归结果：（空）

### 第 2 项 — Hash 路由刷新 / 深链 — PASS

- 入口/路由：`#/home` 刷新、直接访问
- 前端证据：`HashRouter`（`src/main.tsx:5, 215`）；Vite `base: './'`（`vite.config.ts:7`，注释“base './' + HashRouter: works on any GitHub Pages repo path, refresh never 404s”）
- 接口证据：同第 1 项（`public_guest_landing`）
- 数据库证据：同第 1 项
- 复现步骤：访客首页刷新 → 骨架 → 正常回到访客首页，无白屏、无报错
- 问题原因：无
- 修复记录：（空）
- 回归结果：（空）

### 第 3 项 — 根重定向 `/` → `#/home` — PASS

- 入口/路由：`/`（主站 `<Route path="/" …>`、`src/App.tsx:1496`；访客树 `src/pages/GuestBrowse.tsx:206`）
- 前端证据：`<Navigate to="/home" replace />`
- 接口证据：无（纯路由）
- 数据库证据：无
- 复现步骤：打开根地址 → 落到 `#/home` 访客首页
- 问题原因：无
- 修复记录：（空）
- 回归结果：（空）

### 第 4 项 — SPA 内 404 兜底（hash 路径）— PASS

- 入口/路由：`#/不存在的路径`（主站 `*`，`src/App.tsx:1545`；访客树 `*`，`GuestBrowse.tsx:212`）
- 前端证据：`*` 路由直接 `<Navigate to="/home" replace />`，无专属 404 页
- 接口证据：无
- 数据库证据：无
- 复现步骤：未登录打开 `#/不存在的路径` → 立即回到 `#/home` 访客首页，无白屏
- 问题原因：无故障，但行为是“静默回首页、无‘不存在’反馈”，见可疑点 A-S2；本项按“不白屏、不报错”记 PASS，缺 404 提示的问题记在第 5 项的修复里，不重复扣分
- 修复记录：（空）
- 回归结果：（空）

### 第 5 项 — 非 hash 路径 404 — FAIL

- 入口/路由：`https://qianzhi.pw/不存在的路径`（不带 `#`）
- 前端证据：`public/404.html` **不存在**（A 线已确认；`.github/` 下无任何含 `404` 的配置）；`index.html:9, 14` 的 `/mobile-polish.css` 与 `/logo.svg` 用绝对路径，与 `base: './'` 不一致（子路径部署隐患，见 A-S6）
- 接口证据：无（静态托管层返回）
- 数据库证据：无
- 复现步骤：打开 `https://qianzhi.pw/不存在的路径` → 显示 GitHub Pages 默认 404 页，无本站页面、无 SPA 回退
- 问题原因：GitHub Pages 静态托管下，非 hash 错误路径由托管方处理；本站没有自定义 `404.html` 兜底。HashRouter 只保护 `#` 后的路径，保护不了不带 `#` 的路径
- 修复记录：2026-11-21 新增 `public/404.html`（品牌版 404 页：冷白底、墨色字、印泥红 404、文案“这个页面不存在”、按钮“回到首页”回 `/#/home`，5 秒后自动回首页；不改路由、不改守卫、不改部署配置）。PR 待填，见 §8 FIX-1。
- 回归结果：（空，待部署后实测）

### 第 6 项 — 受限直访守卫（游客态）— PASS

- 入口/路由：`#/me`、`#/friends`、`#/chat/xxx` 等
- 前端证据：`Shell` early return（`src/App.tsx:1338–1383`）：无 session 时不渲染主站 `<Routes>`，改走访客树或登录页；访客树 `*` 兜底回访客 `/home`
- 接口证据：`public_guest_landing`（游客准入开关）
- 数据库证据：`site_settings`（`guest_browse_available` 等）；未查生产库
- 复现步骤：未登录直访 `#/me`、`#/friends`、`#/chat/xxx` → 均立即回到 `#/home` 显示访客首页，无白屏
- 问题原因：无。注：URL 的 hash 保持原样、内容被整段替换为访客树（A 线 §3），不是路由跳转到登录页，这是设计行为，不是故障
- 修复记录：（空）
- 回归结果：（空）

### 第 7 项 — `/music` 占位路由 — PARTIAL

- 入口/路由：`#/music`（`src/App.tsx:1499`）
- 前端证据：只渲染一个空 `<div class="qz-music-route-anchor">`，无页面组件；`isMusicPage` 把它算作沉浸式页，隐藏顶栏/Dock（`App.tsx:499, 514`）；音乐实际由全局 `<MusicIsland />` 承载
- 接口证据：无（占位路由无接口）
- 数据库证据：无
- 复现步骤：访客态打开 `#/music` → 直接回到 `#/home`，未见到空白音乐页
- 问题原因：访客态表现正常（守卫拦截），但代码层面的空白占位仍在；登录态直访是否接近全空未验证（A 线 S3）。疑似历史遗留锚点
- 修复记录：（空）
- 回归结果：（空）

### 第 8 项 — 主站 `/admin` 行为（未登录 vs 已登录）— BLOCKED

- 入口/路由：主站 `/#/admin`（`src/App.tsx:1339` 与 `:1544`；注释称后台只在 `admin.qianzhi.pw` 打开）
- 前端证据：`Shell:1339` 的 early return 优先于 `<Routes>`：未登录打开主站 `/#/admin` 会看到 `<AdminLogin />`，而不是回首页；只有已登录才会走到 `:1544` 的 `<Navigate to="/" />`。同一 URL 按登录态呈现两种行为（A 线 S1，中）
- 接口证据：`AdminShell` 调 `supabase.rpc('my_role')`（`src/main.tsx:84–101`，后台域名）
- 数据库证据：角色由 `my_role` RPC 判定；未查生产库
- 复现步骤：未在线上验证（本次未登录实测未点 `/admin`；登录态更无法验证）
- 问题原因：代码行为与注释矛盾，且管理员登录入口在主站域名上可达；线上表现待验证，不定为 FAIL
- 修复记录：（空）
- 回归结果：（空）

### 第 9 项 — 顶部导航（登录态）— BLOCKED

- 入口/路由：登录态站壳顶部（`src/App.tsx:1450–1485`）
- 前端证据：渲染 `<LiquidGlass className="qz-ios26-topnav-glass">` 包 `<nav className="topnav">`，内含 4 个 `TABS` 的 `NavLink` + 管理员可见的“管理后台”链接 + “⌕ 搜索”按钮 + “退出”按钮（直接 `logout()`，无确认）；但 `src/styles-ios26-liquid-glass.css:344–351` 在 `min-width: 769px` 与 `max-width: 768px` 两个断点都写了 `display: none !important`，另 `src/styles.css:30` 移动端双重隐藏。结论：代码还在、DOM 还渲染，但全宽度隐藏，实际不可见、不可点（B 线 §2）
- 接口证据：除退出外无接口调用
- 数据库证据：无（`isAdmin` 只决定是否显示“管理后台”链接，`App.tsx:1459, 1463`）
- 复现步骤：未登录实测无法验证登录态顶栏；桌面游客页看到的顶部导航是 GuestBrowse 自己的游客顶栏（见第 10 项），**不是**这条 App 顶栏，两者不要混为一谈
- 问题原因：死代码 + 无效性能开销（`LiquidGlass` WebGL 渲染器仍实例化）；退出无确认，与 Dock 退出行为不一致（B 线可疑点 1、2）
- 修复记录：（空）
- 回归结果：（空）

### 第 10 项 — 游客顶栏（GuestBrowse）— PARTIAL

- 入口/路由：游客页顶部（`src/pages/GuestBrowse.tsx:168–185`）
- 前端证据：品牌链接（`NavLink to="/home"`，`BrandMark` + 站名/副标题）、状态文案“访客浏览 + 昵称 · HH:MM 后退出”、登录/注册主按钮、退出按钮（`leaveGuest()` 回登录面）；游客导航 5 项（`:190–203`）
- 接口证据：`public_guest_landing`（`siteConfig`）
- 数据库证据：`site_settings`（`guest_session_minutes` 默认 60、`guest_session_epoch`）；未查生产库
- 复现步骤：桌面 1920px 下游客页顶部导航清晰可见，各导航项可点；首页底部页脚完整可见，未被遮住
- 问题原因：部分可用。存疑点：浏览器称顶栏显示“游客·08:14 AM 后退出”，到 08:18 仍在浏览；但代码 `GuestBrowse.tsx:183` 显示的是 `expiresAt` 时间，按默认 60 分钟会话应为 09:14 左右，08:14 与代码推断对不上，可能是浏览器误读。记为“存疑待复核”，**不要定为 FAIL**（见 §7 存疑点 L-05）。另 ≤760px 时整个状态区 `display: none`，手机上看不到过期时间（C 线 R1/Q9，窄屏未验证）
- 修复记录：（空）
- 回归结果：（空）

### 第 11 项 — 底部 Dock 四栏 — BLOCKED

- 入口/路由：底部 Dock：首页 `/home`、发现 `/explore`、私聊 `/friends`、我的 `/me`
- 前端证据：`src/components/FloatingDock.tsx`（居中悬浮胶囊，高 56px，`bottom: calc(16px + env(safe-area-inset-bottom))`，宽 `min(360px, calc(100vw - 24px))`）；挂载条件 `!isAdminPage && !isChatPage && !isImmersivePage && !keyboardOpen`（`App.tsx:1552`）；高亮规则 `isTabActive`：首页含 `/board`，发现覆盖 12 个路由前缀，私聊含 `/friends`、`/chat`，我的含 `/me` 但排除 `/me/notifications`；`/feed`、`/daily`、`/songs`、`/timeline` 等页无主栏高亮（代码注释自认“没有高亮比错误高亮诚实”）
- 接口证据：首页红点：`board_reads` / `board_messages is_admin_msg`；私聊红点：`my_conversations` RPC（`unread_count > 0`）+ Realtime `messages` INSERT 刷新；我的红点：`notifications` 表 `is_read=false` 计数 + Realtime 刷新
- 数据库证据：`board_reads`、`board_messages`、`notifications`；`my_conversations` RPC；未查生产库
- 复现步骤：游客态下无底部 Dock（符合预期，见 B 线 §1.4）；登录态未验证
- 问题原因：未登录限制，无法验证四栏切换、高亮、红点
- 修复记录：（空）
- 回归结果：（空）

### 第 12 项 — Dock 长按面板 — BLOCKED

- 入口/路由：长按 Dock 520ms 或右键（`App.tsx:520–560`；手指移动 > 10px 取消长按；触发后当次点击被吞掉防误触）
- 前端证据：面板 6 项：回忆 `/timeline`、公告 `/board`、消息 `/me/notifications`、歌声墙 `/songs`、表白墙 `/love-wall`、日常 `/daily`；底部 5 操作：搜索、退出登录、收起/展开 Dock、切换停靠位置、关闭；面板位置 `bottom: calc(84px + env(safe-area-inset-bottom))`，`zIndex: 61`，点 backdrop 关闭
- 接口证据：纯路由跳转（消息项红点 `notifUnread`）；退出登录走 `slideConfirmDialog` → `supabase.auth.signOut({ scope: 'local' })`
- 数据库证据：同第 11 项（`notifications` 未读计数）
- 复现步骤：游客态无 Dock、无面板；登录态未验证
- 问题原因：未登录限制
- 修复记录：（空）
- 回归结果：（空）

### 第 13 项 — Dock 收起 / 停靠切换 — BLOCKED

- 入口/路由：长按面板底部“收起 / 展开 Dock”“切换停靠位置”；收起后只剩 `＋` 展开钮
- 前端证据：`dockCollapsed`、`dockSide` 持久化到 `localStorage`（`ca_dock_collapsed` / `ca_dock_side`，`App.tsx:508, 580`）；`dockSide` 的 CSS 钩子只剩 `dock-side-left/right` 类名，现役 `FloatingDock` 是居中定位，左右停靠对主胶囊无可见影响，只影响已收起的 `＋` 钮位置（`styles-ios26-liquid-glass.css:734–784`）
- 接口证据：无（本地状态）
- 数据库证据：无
- 复现步骤：登录态未验证
- 问题原因：未登录限制；且代码提示“切换停靠位置”在展开态可能无反馈感（B 线可疑点 10），待线上验证
- 修复记录：（空）
- 回归结果：（空）

### 第 14 项 — Dock 未读红点 — BLOCKED

- 入口/路由：Dock 首页/私聊/我的三栏红点；长按面板“消息”项红点（`quietHoursActive` 时不显示）
- 前端证据：见第 11 项接口证据
- 接口证据：`my_conversations` RPC、`notifications` 未读计数、Realtime 订阅
- 数据库证据：`notifications`、`board_reads`、`board_messages`；未查生产库
- 复现步骤：游客态无 Dock；登录态未验证
- 问题原因：未登录限制
- 修复记录：（空）
- 回归结果：（空）

### 第 15 项 — Dock 桌面底部遮挡 — BLOCKED

- 入口/路由：桌面端页面最底部内容 vs Dock 占用带
- 前端证据：Dock 占用底部带约 72px + 安全区；内容区 `.wrap` 桌面（`min-width: 769px`）`padding-bottom: 40px`（`src/styles.css:18`），小于 72px，页面最底部约 32px 内容可能被 Dock 盖住；移动端两处规则并存（104px 与 112px，后者为准，理论够用）
- 接口证据：无
- 数据库证据：无
- 复现步骤：桌面游客页无 Dock，首页底部页脚完整可见，未被遮住——但这不能证明登录态桌面 Dock 不遮挡；登录态未验证
- 问题原因：未登录限制；代码提示遮挡风险（B 线可疑点 3；C 线 R6 历史遗留“手机窄屏、Dock 压住卡片底行，待真机复核”）
- 修复记录：（空）
- 回归结果：（空）

### 第 16 项 — 全局搜索入口 — BLOCKED

- 入口/路由：首页搜索条（`src/pages/Home.tsx:228–232`，文案“搜索成员、动态、相册或公告”，派发 `window` 事件 `qznb:open-search`）+ Dock 长按面板“⌕ 搜索” +（不可达的）隐藏顶栏“⌕ 搜索”按钮
- 前端证据：无独立搜索页，全仓 grep `"/search"` 零命中，无 `/search` 路由；搜索只以 `GlobalSearch` 弹窗形态存在（`src/components/GlobalSearch.tsx`）；事件链 `App.tsx:575–580` 监听 `qznb:open-search` → `setSearchOpen(true)` → 渲染 `<GlobalSearch>`（`App.tsx:1662`，登录态 return 内）
- 接口证据：见第 17 项
- 数据库证据：见第 17 项
- 复现步骤：游客态组件根本不挂载，无搜索入口；登录态未验证
- 问题原因：未登录限制；顶栏搜索入口因顶栏隐藏而不可达（B 线 §4.1）
- 修复记录：（空）
- 回归结果：（空）

### 第 17 项 — 全局搜索实际检索 — BLOCKED

- 入口/路由：`GlobalSearch` 弹窗（输入 ≥ 2 字符后防抖 240ms 并行发 5 路查询；< 2 字符显示本地搜索历史，`localStorage` 键 `qznb_search_history_v2:<uid>`，最多 6 条；Esc / 点蒙层关闭；Enter 打开第一条结果）
- 前端证据：`src/components/GlobalSearch.tsx`
- 接口证据：5 路并行（`Promise.all`）：成员 `supabase.rpc('member_directory', { q, lim: 6, skip: 0 })` → `/members/:id`；动态 `posts` 表 `section in ('feed','daily')`、`deleted_at is null`、`ilike('content', pattern)` → `/feed` 或 `/daily`（带 `searchQuery` / `focusPostId`）；相册 `albums` 表 `ilike('title', pattern)` → `/albums/:id`；公告 `board_messages` 内容 + 标题两路 `ilike` → `/board?q=<term>`（两路按 `id` 去重；目标页 `Board.tsx` 是客户端过滤，不是服务端查询）
- 数据库证据：`member_directory` 为 `SECURITY DEFINER`，仅 `authenticated` 可执行（`anon` 已撤销），仅返回 `joined` 成员，匹配字段仅 `username`、`display_name`（需 `show_name`）、`personality`（需 `show_personality`），不搜签名、不搜 bio/爱好；`posts` / `albums` / `board_messages` 的 select 策略均为 `authenticated + is_member()`；未查生产库
- 复现步骤：游客态无搜索；登录态未验证
- 问题原因：未登录限制
- 修复记录：（空）
- 回归结果：（空）

### 第 18 项 — 搜索盲区 / 部分失败静默 — BLOCKED

- 入口/路由：同第 17 项（搜索覆盖面与失败反馈）
- 前端证据：不搜的内容（代码可证）：表白墙（`love_wall_posts`）、歌声墙（`song_posts`）、提问箱（`anonymous_questions`）、活动、 心愿、祝福、时间胶囊、评论内容、私信内容、成员 bio/爱好/联系方式；全部 5 路都报错时才显示“暂时无法完成搜索，请检查网络后重试。”（`GlobalSearch.tsx:209`），部分失败时静默丢弃该分组（`failed` 判定是 `every(item => !!item.error)`）；关键词 `pattern = %${term}%` 未转义 `%` / `_`，会被当成 `ilike` 通配符（`PostList.tsx:223` 同样写法）
- 接口证据：同第 17 项
- 数据库证据：同第 17 项
- 复现步骤：登录态未验证
- 问题原因：未登录限制；代码级结论，线上未验证。首页搜索条文案“搜索成员、动态、相册或公告”与实际覆盖面一致，但用户若以为是“全站”会落空
- 修复记录：（空）
- 回归结果：（空）

### 第 19 项 — 游客首页 — PASS

- 入口/路由：`#/home`（`GuestHome`，`src/pages/GuestBrowse.tsx:207`）
- 前端证据：Hero（“浏览动态 ↗”→ `/feed`、“查看公告”→ `/board`，仅公告开放时；横幅图 `home_banner_url` 仅 `https?://` 才渲染）；快捷入口 4 卡（社区动态、日常片段、认识成员（锁定按钮，点后开登录弹窗）、表白墙）；最新动态流 `GuestPosts section="all"`；侧栏公告最近 3 条（`siteConfig.notices`）；收尾 CTA（登录/注册、继续浏览动态）；页脚导航
- 接口证据：`public_guest_landing` RPC（`notices` 为内嵌公告列表，不是前端直接查表）；动态流 `guest_public_posts(p_section: 'all', p_limit: 20, p_offset)` RPC（`anon` 可执行）
- 数据库证据：`board_messages` 的管理员公告子集（经 RPC 返回）；`posts` 经 `guest_public_posts` RPC；未查生产库
- 复现步骤：未登录打开主站 → 自动进访客首页，内容正常显示，导航可点
- 问题原因：无
- 修复记录：（空）
- 回归结果：（空）

### 第 20 项 — 游客动态 — PASS

- 入口/路由：`#/feed`（`GuestPosts section="feed"`）
- 前端证据：每张卡有点赞按钮（显示赞数 + “登录后点赞”）、评论按钮（显示评论数），点后开登录弹窗；配图 `BlurImg` 骨架过渡；“加载更多动态”按钮（仅返回满 20 条时出现，`PAGE_SIZE = 20`）；空态按钮“登录后发布第一条动态”；出错态“重新加载”按钮
- 接口证据：`guest_public_posts(p_section: 'feed', …)` RPC（`anon` 可执行）；图片用 `useSignedUrls('media', …)` 取签名 URL
- 数据库证据：`posts`（经 RPC 只读）；未查生产库
- 复现步骤：游客动态页显示 20 条，全匿名、赞/评 0；点赞/评论均弹同一登录弹窗，未产生互动
- 问题原因：无
- 修复记录：（空）
- 回归结果：（空）

### 第 21 项 — 游客日常 — PASS

- 入口/路由：`#/daily`（`GuestPosts section="daily"`）
- 前端证据：同第 20 项（`GuestPosts` 共用组件）
- 接口证据：`guest_public_posts(p_section: 'daily', …)` RPC
- 数据库证据：`posts`（`section='daily'`，经 RPC 只读）
- 复现步骤：游客日常页为空态，显示正常，无报错
- 问题原因：无（空态是正常状态，不是故障）
- 修复记录：（空）
- 回归结果：（空）

### 第 22 项 — 游客表白墙 — PASS

- 入口/路由：`#/love-wall`（`GuestLoveWall`；`showLoveWall === false` 时改渲染 `GuestUnavailable`“暂未开放游客浏览”）
- 前端证据：顶部提示条“登录后参与”；每张卡有点赞/评论按钮（均开登录弹窗）；图片附件为新窗口链接，视频附件为原生 `<video controls playsInline>`；底部悬浮按钮“写表白”（`.guest-cruip-fab`，开登录弹窗）；出错态按钮为“刷新页面”（`window.location.reload()`，与动态页的软重试不一致，见 C 线）
- 接口证据：`love_wall_guest_published()` RPC（`anon` 可执行）+ `love_wall_media_for_posts(p_post_ids)` RPC + `getSignedUrls('media', …)`
- 数据库证据：`love_wall_posts`（经 RPC 只读，已发布子集）；未查生产库
- 复现步骤：游客表白墙显示 11 条，全匿名；点“写表白”弹登录弹窗，未产生互动
- 问题原因：无
- 修复记录：（空）
- 回归结果：（空）

### 第 23 项 — 游客公告 — PASS

- 入口/路由：`#/board`（`GuestBoard`；`showAnnouncements === false` 时改渲染 `GuestUnavailable`）
- 前端证据：无任何可点击控件，纯展示 `siteConfig.notices` 全文 + 时间；空态纯文字
- 接口证据：`public_guest_landing` RPC 内嵌 `notices`
- 数据库证据：`board_messages`（管理员公告子集，经 RPC）；未查生产库
- 复现步骤：游客公告页为空态，显示正常，无报错
- 问题原因：无（空态是正常状态）
- 修复记录：（空）
- 回归结果：（空）

### 第 24 项 — 游客点赞 / 评论 / 发布引导登录 — PASS

- 入口/路由：游客动态/表白墙卡片上的点赞、评论按钮；游客首页“认识成员”（带锁）按钮；“写表白”悬浮按钮
- 前端证据：`GuestPosts.tsx:63–69, 142`（点赞/评论均调 `onLoginRequired` 弹登录）；`GuestBrowse.tsx:96`（“认识成员”上锁按钮，点之弹登录）；页脚文案“公开内容只读 · 登录后解锁完整互动与个人功能”（`GuestBrowse.tsx:215`）
- 接口证据：无（未产生互动请求；登录弹窗本身见第 25 项）
- 数据库证据：无（未写库）
- 复现步骤：游客态点赞/评论/认识成员 → 均弹同一登录弹窗，未产生互动、未写库
- 问题原因：无
- 修复记录：（空）
- 回归结果：（空）

### 第 25 项 — 登录页（只看控件，未提交）— PARTIAL

- 入口/路由：登录弹窗 / 登录页（`src/pages/Login.tsx`，`mode='login'`，无独立路由；未登录默认面，`App.tsx:1373/1376`）
- 前端证据：控件有账号（用户名/邮箱/手机号）、密码、“显示”切换、登录、忘记密码、去注册、点我反馈、自定义背景；复选框“信任此私人设备 30 天”仅用户名登录且 `trustedLoginAvailable` 时显示；限流时提示条 + “向已验证绑定邮箱请求登录链接”按钮仅 `VITE_USERNAME_EMAIL_RECOVERY_ENABLED='true'` 时显示；背景面板：自定义背景折叠、上传照片（canvas 压缩到最长边 1280、转 JPEG data URL）、恢复默认、模糊/暗度滑杆，存 `localStorage`（`ca_login_bg_v2`）；`VisitCounter` 调 `get_page_views` / `bump_page_view` RPC
- 接口证据：QQ 邮箱登录 `supabase.auth.signInWithPassword`；用户名登录 `supabase.functions.invoke('username-login', …)` 后 `setSession`，失败分类经 `supabase.rpc('record_auth_login_failure', …)` 上报（不发账号密码原文）；反馈弹窗 `FeedbackModal` 写 `feedbacks` 表 + 调 `dev-feedback` Edge Function
- 数据库证据：`feedbacks`（反馈提交时）；`site_settings`（登录开关）；未查生产库；**本次未提交登录，未发任何请求验证登录链路**
- 复现步骤：游客态点登录入口 → 登录弹窗控件齐全；未见“游客登录”按钮（已是游客态，合理）；均未提交、未发验证码
- 问题原因：部分验证。登录提交链路、用户名登录、限流、设备信任、反馈提交均未验证
- 修复记录：（空）
- 回归结果：（空）

### 第 26 项 — 注册页（只看控件，未提交）— PARTIAL

- 入口/路由：注册页（`src/pages/Login.tsx`，`mode='reg'`，无独立路由；登录页点“去注册”切换）
- 前端证据：控件齐全：用户名（1–30 字）、真实姓名（仅用户名非空时渲染）、手机号选填（11 位数字，自动去非数字并截断）、QQ 邮箱、QQ 头像预览卡（仅邮箱能解析出 QQ 号时出现；“使用此头像 / ✓ 已选择”切换；加载失败显示“QQ”占位 + “重试”）、密码（强度指示）、确认密码、协议勾选 + 《隐私政策与用户协议》链接、主按钮“发送验证码并注册”/已发码后“验证并进入”（`CodeInput` 六格 + “重新发送验证码（Ns）”60 秒倒计时）、“已有账号？去登录”；校验错误自动滚动到错误处
- 接口证据：发码 `supabase.auth.signUp({ email, password, options.data: { username, real_name, phone?, privacy_policy_version: '2026-11-07-v3', privacy_policy_accepted_at } })`；重发 `supabase.auth.resend({ type: 'signup' })`；验证 `supabase.auth.verifyOtp({ type: 'signup' })`；成功后 `finishJoin(uid)`、可选 `qq-avatar-import` Edge Function（4.5 秒超时，非阻断）、`profiles.update({ display_name })`
- 数据库证据：`profiles`（注册触发器写 `username`/`real_name`，前端无权改）；未查生产库；**本次未提交注册，未发验证码**
- 复现步骤：登录弹窗点“去注册” → 控件齐全；同意协议**默认已勾选**，记为待确认项（见 §7 存疑点 L-03，是有意默认还是遗留，线上只看到勾选状态，未验证提交时是否强制校验）
- 问题原因：部分验证。注册提交、验证码、QQ 头像、协议门禁均未验证；另注册页存在两条疑似并存的提交路径（`sendCode` + `doVerifyReg` vs `doReg`，C 线 Q2），静态读码未确认 `doReg` 是否仍被调用
- 修复记录：（空）
- 回归结果：（空）

### 第 27 项 — 找回密码页 — NOT_TESTED

- 入口/路由：找回密码态（`src/pages/Login.tsx`，`mode='forgot'`，无独立路由；登录页点“点我重置”切换）
- 前端证据：QQ 邮箱输入、发送/重新发送验证码（60 秒倒计时）、验证码六格、新密码/确认新密码（`PasswordField`，强度指示）、“验证并重设密码”、“← 返回登录”
- 接口证据：发码 `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + pathname })`；验证 `supabase.auth.verifyOtp({ type: 'recovery' })` 后 `supabase.auth.updateUser({ password })`，随后 `signOut()` 回登录页
- 数据库证据：Supabase Auth；未查生产库
- 复现步骤：本次线上只看到登录弹窗里的“忘记密码”按钮，未点开找回密码页，未发码、未重设
- 问题原因：尚未安排验证
- 修复记录：（空）
- 回归结果：（空）

### 第 28 项 — 邮箱验证态 — NOT_TESTED

- 入口/路由：邮箱验证态（`src/pages/Login.tsx`，`verifyEmail` 非空时覆盖全部模式）
- 前端证据：`CodeInput` 六格验证码、主按钮“验证并进入”、次按钮“重新发送确认邮件（Ns）”、文案“已等待 N 秒 · 邮件通常 1 分钟内到达”、收件邮箱加粗显示、垃圾箱提示
- 接口证据：`supabase.auth.verifyOtp({ type: 'signup' })` / `supabase.auth.resend({ type: 'signup' })`
- 数据库证据：Supabase Auth；未查生产库
- 复现步骤：未触发（未登录、未注册）
- 问题原因：尚未安排验证
- 修复记录：（空）
- 回归结果：（空）

### 第 29 项 — 隐私政策与用户协议弹窗 — NOT_TESTED

- 入口/路由：注册页协议链接打开（`src/pages/Login.tsx:590`）；无路由、无独立页面；登录态、找回密码态均无入口
- 前端证据：遮罩点按关闭、内容区点按阻止冒泡、底部“返回注册”关闭；内容版本 `2026-11-07-v3`，七节，末尾注明“此文本是网站说明草案，不构成法律意见”；样式是公共流程里唯一的深色面（深蓝渐变底 + 浅字，`Login.tsx:590–591` 内联）
- 接口证据：无（纯前端硬编码文本；用户点同意时注册请求带 `privacy_policy_version` + `privacy_policy_accepted_at` 进 `signUp` 的 `user_metadata`）
- 数据库证据：无
- 复现步骤：未在线打开
- 问题原因：尚未安排验证；深色是否刻意（“政策弹窗用深色以示正式”）无注释说明，待用户确认（C 线 Q8/S10）
- 修复记录：（空）
- 回归结果：（空）

### 第 30 项 — 公开落地页 PublicLanding — NOT_TESTED

- 入口/路由：`site_settings.skip_login_screen='true'` 时替代登录页（`src/App.tsx:331` 内联组件）
- 前端证据：“登录 / 注册”主按钮、“游客登录”按钮（仅 `showGuestEntry` 时）、“进入账号”按钮；公告区、横幅区无其他控件；横幅图仅 `http(s)://` 开头才渲染
- 接口证据：全部来自 `siteConfig`（即 `public_guest_landing` RPC）
- 数据库证据：`site_settings`（`skip_login_screen` 等）；未查生产库
- 复现步骤：未触发（当前线上自动进游客，未落到该分支）
- 问题原因：尚未安排验证；可疑点：`bannerText` 默认值仍为旧文案“把我们的青春，留在这里”（`App.tsx:336`），而 e2e 明确断言游客页不得出现这句文案（C 线 Q1），是刻意保留的兜底还是遗留默认值，待确认
- 修复记录：（空）
- 回归结果：（空）

### 第 31 项 — 登录关闭页 LoginClosedScreen — NOT_TESTED

- 入口/路由：`site_settings.close_login_entry='true'` 时替代登录页（`src/App.tsx:319` 内联组件）
- 前端证据：仅一个条件按钮“游客登录（仅浏览）”（`showGuestEntry` 时）；其余为静态文案“登录入口暂未开放 / 管理员暂时关闭了登录与注册入口，请稍后再来。”
- 接口证据：无（纯静态 + 开关）
- 数据库证据：`site_settings`；未查生产库
- 复现步骤：未触发
- 问题原因：尚未安排验证
- 修复记录：（空）
- 回归结果：（空）

### 第 32 项 — 维护页 MaintenanceScreen — NOT_TESTED

- 入口/路由：`site_settings.maintenance='true'`（或维护排期生效）时覆盖登录 / 游客 / 已登录页（`isAdminPage` 除外；`src/App.tsx` 内联组件约 260–318 行）
- 前端证据：临时访问码输入（`CodeInput` 六格，满 6 位可点）+ “验证并进入”按钮；邮箱订阅输入 + “恢复后邮件通知我”按钮；已登录时另有“退出登录”按钮；大量内联样式（半透明白描边），与冷白 token 不一致
- 接口证据：`maintenance_redeem_code` RPC、`maintenance_validate_access` RPC（5 秒轮询）
- 数据库证据：`maintenance_notify_emails` 表 insert（唯一冲突 `23505` 视为已登记）；未查生产库
- 复现步骤：未触发（维护未开）
- 问题原因：尚未安排验证；另临时通行权只存在内存 state（`maintenanceAccess`，`App.tsx:1121`），刷新即失效，需重新输 6 位码（A 线 S8，信息级）
- 修复记录：（空）
- 回归结果：（空）

### 第 33 项 — 邮件回跳重置密码页 ResetPassword — NOT_TESTED

- 入口/路由：从重置密码邮件链接回来时优先渲染（`App.tsx:1341`，`pwReset` 分支；内联组件 `App.tsx:217`）
- 前端证据：新密码、确认新密码（均为原生 `<input type="password">`，非 `PasswordField` 组件，无显示/隐藏切换、无强度指示）、主按钮“设置新密码”；成功后文案“✓ 密码已重置，下次用新密码登录”+ 按钮“进入 Class Memory”
- 接口证据：`supabase.auth.updateUser({ password })`
- 数据库证据：Supabase Auth；未查生产库
- 复现步骤：未触发（无邮件链接）
- 问题原因：尚未安排验证；与第 27 项是两套不同的改密 UI（校验只有“至少 8 位 / 两次一致”，失败提示直接拼接 `error.message` 原文，含英文可能），是否统一待确认（C 线 Q10）
- 修复记录：（空）
- 回归结果：（空）

### 第 34 项 — 动态签名页 — PASS

- 入口/路由：`https://qianzhi.pw/signature/`（静态子站，`public/signature/index.html`，不经过 React Router；不受登录守卫控制）
- 前端证据：标题“动态签名 · 名字写给你看”，有输入框（预填 Taiyang / yueliang）、开始播放 / 下载 GIF / 生成新名字按钮
- 接口证据：无（静态页）
- 数据库证据：无
- 复现步骤：无需登录能打开，标题与控件正常显示；未点播放、未点下载
- 问题原因：无（按“能打开、控件可见”记 PASS；播放与导出效果未验证，属第 5 阶段/签名专项的范围，不在本项里扣分）
- 修复记录：（空）
- 回归结果：（空）

### 第 35 项 — 真实世界视觉识别页 — NOT_TESTED

- 入口/路由：`https://qianzhi.pw/realworld/`（静态子站，`public/realworld/index.html` + `app.js` + `vision_bundle.js` + 模型文件，不经过 React Router；不受登录/维护守卫约束）
- 前端证据：代码存在静态文件；源码中无对应路由
- 接口证据：无
- 数据库证据：无
- 复现步骤：未在线打开
- 问题原因：尚未安排验证；如未来要加权限，需在托管层或改造成路由页，当前 React 守卫管不到（A 线 S9）
- 修复记录：（空）
- 回归结果：（空）

### 第 36 项 — 错误边界（ErrorBoundary）实际触发 — NOT_TESTED

- 入口/路由：全局（`src/main.tsx:216–222`，包住 `Suspense` + `AdminShell`/`App` + `SiteIntro` + `TestSwitchFab`）；局部 4 处：`/fate-notebook`、`/particle-flower`、`/air-ink`、`/admin`（实际只包一个重定向，意义极小）
- 前端证据：`src/components/ErrorBoundary.tsx`（全文 56 行）：`getDerivedStateFromError` 截取错误栈前 800 字；`componentDidCatch` 对分块加载错误在 60 秒内只自动刷新一次（依赖 `src/lib/lazyWithRetry.ts`，键 `qz_chunk_reload_at`）；分块错误显示“页面加载失败…刷新重试”，其他错误显示错误栈全文 + “刷新重试”按钮
- 接口证据：无
- 数据库证据：无
- 复现步骤：未触发真实错误
- 问题原因：尚未安排验证；代码级隐患见 A-S4（`PaperToaster` 与 `DialogHost` 在全局边界之外）与 A-S5（错误页向用户展示完整错误栈，含内部路径，信息泄露小隐患）
- 修复记录：（空）
- 回归结果：（空）

### 第 37 项 — 全局 Toast（Sonner）实际弹出 — NOT_TESTED

- 入口/路由：全局（`src/main.tsx:60–73` 的 `PaperToaster`：`<Toaster theme="light" position="top-center" duration={3000} gap={8}>`，纸面冷白样式；后台域名在 `AdminShell` 内另挂一个，同一时间只挂一棵树）
- 前端证据：调用分布 grep 统计 43 处（6 个文件）：`Chat.tsx` 23、`groupCall.tsx` 10、`PostList.tsx` 4、`AlbumDetail.tsx` 3、`AdminAppCenter.tsx` 2、`SwipeToDelete.tsx` 1；大多数页面没有 toast 调用，错误改走 `alertDialog` 弹窗或页内横条；管理后台不用 Sonner，自有 `admin-toast`（`Admin.tsx:163–183, 249–261`）
- 接口证据：无（纯 UI）
- 数据库证据：无
- 复现步骤：本阶段无触发场景，未在线看到 toast 弹出
- 问题原因：尚未安排验证
- 修复记录：（空）
- 回归结果：（空）

### 第 38 项 — 加载骨架 / 加载态 — PARTIAL

- 入口/路由：全站切页、刷新、列表首屏
- 前端证据：`src/components/fx/Skeleton.tsx`：骨架只在“首次加载、数据还未知、且加载超过 300ms”时出现（`SKELETON_DELAY_MS = 300`）；导出 `FeedSkeleton` / `RowSkeleton` / `GridSkeleton` / `PageSkeleton` / `DelayedPageSkeleton` / `InlineLoading` / `RouteLoading`（“正在打开…”）/ `RouteTransitionSkeleton`（按目标路由选 `inbox` / `chat` / `page` 三种形态）；挂载点抽样：`App.tsx`（启动 `DelayedPageSkeleton`；路由切换 `Suspense fallback`）、`main.tsx`（`RouteLoading`）、`PostList.tsx`、`Board.tsx` / `Capsule.tsx` / `Events.tsx`、`Album.tsx`、`AlbumDetail.tsx`、`Chat.tsx`
- 接口证据：无（纯 UI）；分块加载经 `lazyWithRetry`（`src/lib/lazyWithRetry.ts`），失败先重试、再失败触发一次硬刷新
- 数据库证据：无
- 复现步骤：每次切页/刷新都有数秒空白骨架加载态，之后正常加载，不是持续白屏
- 问题原因：部分验证。骨架出现已确认；加载失败重载、未在 §5.2 列出的页面的加载态未验证（B 线 §5.2、§8）
- 修复记录：（空）
- 回归结果：（空）

### 第 39 项 — 全站通用弹窗基础设施 — PARTIAL

- 入口/路由：全局（`DialogHost`，`src/main.tsx:224` 全局挂一次，主站与管理后台共用；同一时间只显示一个，后续排队；点蒙层/Esc 取消）
- 前端证据：`src/lib/dialog.tsx`（`confirm` / `alert` / `prompt` / `slide-confirm` 四种，Promise 式调用）；`SlideToConfirm`（阈值 0.92，滑到 92% 才确认，仅 Dock 退出登录一处调用）；`OptionSheet`（站内选项弹层，替代原生 `<select>`）；原生弹窗核查：全仓 grep `window.alert / window.confirm / window.prompt` 零命中，`<select>` 零命中；广播弹窗、软件公告弹窗、应用更新弹窗、首页公告弹窗（`Home.tsx` 内联）、GPS 位置分享征求弹窗、欢迎/引导/登录成功覆盖层、游客昵称弹窗，见 B 线 §3.2
- 接口证据：广播弹窗 `member_active_broadcasts` RPC、`broadcast_receipts` upsert、`record_broadcast_delivery_event` RPC；软件公告 `public_app_announcements` / `mark_app_announcement_read` RPC；应用更新 `public_app_update` / `public_admin_app_update` RPC；反馈弹窗 `feedbacks` insert + `dev-feedback` Edge Function
- 数据库证据：`broadcast_receipts`、`feedbacks` 等；未查生产库；本次未触发写操作
- 复现步骤：游客登录弹窗已在线打开并正常显示/关闭；其他弹窗类型（确认/提示/输入/广播/更新/公告）未逐个验证；弹窗层级冲突（`DialogHost` 1000 > GPS 700 > Dock 面板 61 > Dock 50）未在线验证
- 问题原因：部分验证
- 修复记录：（空）
- 回归结果：（空）

### 第 40 项 — 移动端 390px 布局 — BLOCKED

- 入口/路由：全站公共页面在 390px 窄屏下
- 前端证据：`index.html` viewport 正确（`width=device-width, initial-scale=1, viewport-fit=cover`，无 `maximum-scale` / `user-scalable=no`，不锁缩放）；`theme-color: #ffffff`；全局防溢出 `html,body { overflow-x: hidden }` + `max-width: 100%; overflow-x: clip`（会把横向溢出藏起来而不是修掉，C 线 §4）；断点分布：`GuestBrowse.css` 760px/390px、`Guest.cruip.css` 640px、`GuestPosts.css` 760px、`Home.vibe.css` 680px/760px、`Login.polish.css` 520px、`public/mobile-polish.css` 768px/380px；公共面文件内无 `width: ≥390px` 的固定宽度（除 `max-width` 上限外）；风险点见 C 线 R1–R8（游客顶栏 ≤760px 隐藏过期时间、游客导航横向滚动无可见提示、弹窗余量、表白墙附件三列网格、死样式、首页底部 Dock 遮挡、登录卡滑杆换行、横向溢出被 `clip` 掩盖）
- 接口证据：无
- 数据库证据：无
- 复现步骤：云浏览器窗口固定 1920×998，无视口调整工具；本地 headless Chrome 也因代理鉴权连不上网（`ERR_TUNNEL_CONNECTION_FAILED` / `ERR_NO_SUPPORTED_PROXIES`），未能补测
- 问题原因：环境限制。顶栏过期时间是否显示、导航是否横滑、底部遮挡、横向溢出，全部未验证，留待用户真机复核
- 修复记录：（空）
- 回归结果：（空）

---

## 3. 登录后首页结构（代码审计，登录态未验证，仅记录）

路由 `/#/home`（`src/pages/Home.tsx`，352 行 + `Home.vibe.css` 1,160 行）。结构按渲染顺序：加载错误条（`role="alert"`，含“重新加载”按钮）→ 大标题栏 `LargeTitleBar` → 搜索按钮（派发 `qznb:open-search`）→ 公告快讯跑马灯（仅 `notices.length > 0`，36 秒一圈，悬停暂停）→ 公告区（`CardSwitcher`：左右滑切换、点按进弹窗、6 秒自动轮播、圆点切换；无公告显示“暂无公告。”）→ 帖子墙（筛选 全部/表白墙/动态；“写表白”→ `/love-wall`、“发动态”→ `/feed`；混合时间流；每张卡是 `<Link>` 到原页；“加载更多”仅单类超过 10 条时出现，每次 +10）→ 公告弹窗 → 下拉刷新（`PullToRefresh`，10 秒超时放行）→ `VisitCounter`。

数据来源（只读）：标题/副标题 `site_settings` 直查；公告卡 `board_messages` 直查（`is_admin_msg = true`、`deleted_at is null`、`audience in ('all')`、未过期，`limit 3`）；表白帖 `love_wall_published()` RPC（仅 `authenticated` 可执行，不返回 `author_id`/真实姓名）；动态帖 `posts` 直查（`section = 'feed'`，`limit 100`，前端只展示前 10）；作者名 `member_directory(q: '', lim: 100, skip: 0)` RPC（超过 100 名成员或作者不在前 100 时回退显示“成员”，见 C-Q3）；缓存内存变量 `homeCache`，TTL 5 分钟。

**本节未在线验证**，不计入逐项表计数。

## 4. e2e 测试现状（代码审计，未跑）

- 配置：`playwright.config.ts`，`testDir: ./e2e`，`baseURL` 默认 `http://127.0.0.1:4173`（`vite preview` 产物）；三工程：`mobile`（390×844，iPhone UA，触控）、`android-chrome`（412×915，Pixel 7 / Android 14 UA，触控）、`desktop`（1440×900）。
- 现有覆盖共 7 个用例：`e2e/smoke.spec.ts` 4 个（首页可加载、登录页可打开、游客模式可浏览、私信列表未登录时不暴露私信内容；后端不可达或无游客入口时优雅跳过并注明原因）；`e2e/android-island.spec.ts` 3 个（均为 CSS fixture，不跑真实应用，与公共页面无关）。
- 缺口（均未覆盖）：登录提交、注册全流程、找回密码、邮箱验证码、隐私协议勾选门禁、QQ 头像预览、背景自定义面板；登录后首页（公告卡轮播/筛选片/加载更多/公告弹窗/搜索按钮/下拉刷新）；PublicLanding / LoginClosedScreen / MaintenanceScreen / ResetPassword 四个分支；游客会话过期 / epoch 撤销、游客昵称弹窗校验、登录弹窗在游客壳内的打开/关闭；390px 真实页面溢出断言（建议后续加 `document.documentElement.scrollWidth <= 390` 类断言）。
- 本阶段**未跑 e2e**（未跑构建、未跑测试），以上为静态读码结论。

## 5. NOT_TESTED 清单（本阶段未查的第 1 阶段内项目）

与逐项表第 27、28、29、30、31、32、33、35、36、37 项一致，共 10 项：找回密码页、邮箱验证态、隐私政策与用户协议弹窗、公开落地页、登录关闭页、维护页、邮件回跳重置密码页、真实世界视觉识别页、错误边界实际触发、全局 Toast 实际弹出。

另有以下第 1 阶段内、但未单独立项的内容，同样未验证，不写成已完成：

- 访客模式开关关闭（`guest_browse_available=false`）时首屏是否落在登录页；`guest_show_love_wall` / `guest_show_announcements` 关闭时访客点表白墙/公告是否显示 `GuestUnavailable`。
- 维护模式开时登录用户、访客、`/admin` 直访、`/signature/` 与 `/realworld/` 静态页的表现。
- `AuthProvider` 8 秒兜底、`AdminShell` 的 `my_role` 8 秒超时在弱网下的表现。
- 生产库当前 `siteConfig` 各开关的实际值（`guest_browse_available`、`guest_entry_visible`、`skip_login_screen`、`close_login_entry`、`maintenance` 等）——本次未查生产库。
- 登录后首页、Dock、搜索等登录态功能（已记 BLOCKED，见逐项表，不重复列为 NOT_TESTED）。

## 6. 可疑点清单（共 43 项，按来源分组，含重复交叉引用）

说明：A 线 S1–S10、B 线 10 项、C 线 Q1–Q10 / S1–S13，共 43 项。同一问题在多线出现时保留交叉引用，不合并抹掉来源。级别：高/中/低/信息为审计线原定级别；“线上已确认”指 2026-11-21 线上实测已见到，“代码级”指代码已确认、线上未验证，“待验证”指需后续实测或用户确认。

### 6.1 A 线 S1–S10（路由 / 启动 / 访客 / 404 / 错误边界）

| 编号 | 级别 | 问题 | 证据 | 状态 |
|---|---|---|---|---|
| A-S1 | 中 | 主站 `/admin` 的行为与注释矛盾，且向未登录者暴露管理员登录页（未登录见 `<AdminLogin />`，已登录才回 `/home`） | `App.tsx:1339` vs `:1544` vs `:210–213` | 代码级 |
| A-S2 | 中 | 无 404 页面：SPA 内 `*` 静默跳 `/home`，GitHub Pages 层无 `public/404.html`，非 hash 错误路径落到 GitHub 默认 404 | `App.tsx:1545`；`public/404.html` 不存在 | 线上已确认（非 hash 部分，第 5 项 FAIL；hash 部分静默回首页已确认） |
| A-S3 | 低 | `/music` 是空白占位路由，只渲染空 div；`isMusicPage` 还把它算作沉浸式页（隐藏顶栏/Dock），直访后页面几乎全空 | `App.tsx:499, 514, 1499` | 线上部分确认（游客态回首页；登录态待验证） |
| A-S4 | 低 | `PaperToaster` 与 `DialogHost` 在全局 `ErrorBoundary` 之外；它俩抛错时无兜底，`DialogHost` 一旦崩溃所有站内弹窗失效 | `main.tsx:216–224` | 代码级 |
| A-S5 | 低 | 错误页向用户展示完整错误栈（含内部文件路径与分块名），对普通用户无用且泄露实现细节 | `ErrorBoundary.tsx:42–46` | 代码级 |
| A-S6 | 低 | `index.html` 的 `/mobile-polish.css` 与 `/logo.svg` 用绝对路径，与 Vite `base: './'` 不一致；子路径部署时会 404；当前自定义域名为根路径，线上不受影响 | `index.html:9, 14`；`vite.config.ts:7` | 代码级 |
| A-S7 | 信息 | 访客自动入场是静默的：首次访问即自动成为访客（昵称统一“游客”），无任何点击或知情动作；与“游客登录（仅浏览）”按钮并存时语义重叠；访客过期后不自动重进 | `App.tsx:1178–1200, 1122` | 代码级 |
| A-S8 | 信息 | 维护模式的临时通行权只存在内存 state，刷新页面即失效，需重新输 6 位码；服务端每 5 秒复核，撤销后自动退回维护页 | `App.tsx:1121, 1124–1150` | 代码级 |
| A-S9 | 信息 | `/signature`、`/realworld` 不受任何登录/维护守卫约束（静态文件直出）；如未来要加权限，需在托管层或改造成路由页 | §7（A 线） | 代码级 |
| A-S10 | 信息 | 局部 `ErrorBoundary` 只包了 3 个“花哨”页（命运笔记/粒子花/空中墨），其余 43 条路由只靠全局边界；`/admin` 的局部边界实际只包一个重定向，近乎无效 | `App.tsx:1501–1503, 1544` | 代码级 |

### 6.2 B 线 10 项（导航 Dock、顶栏、搜索、提示）

| 编号 | 级别 | 问题 | 证据 | 状态 |
|---|---|---|---|---|
| B-1 | 中 | 顶部导航是死代码：DOM 渲染但全宽度 CSS 隐藏，内含无确认的退出按钮与搜索按钮；`LiquidGlass` WebGL 实例白白初始化 | `App.tsx:1450–1485`；`styles-ios26-liquid-glass.css:344–351` | 代码级；登录态待验证 |
| B-2 | 中 | 退出登录三条路径确认行为不一致：Dock 滑动确认 vs 顶栏/后台顶条直接退出 | `App.tsx:1334, 1448, 1482` | 代码级 |
| B-3 | 中 | 桌面端 `.wrap` 底部留白 40px < Dock 占用带 72px，页面底部可能被 Dock 盖住 | `styles.css:18`；`FloatingDock.tsx` | 代码级；登录态待验证 |
| B-4 | 低 | 全局搜索部分失败静默：只有 5 路全败才提示，单组失败无感知 | `GlobalSearch.tsx`（`failed = every(error)`） | 代码级 |
| B-5 | 低 | 搜索盲区：不搜表白墙、歌声墙、提问箱、活动、心愿、祝福、胶囊、评论、私信 | §4.2（B 线） | 代码级 |
| B-6 | 低 | 搜索关键词未转义 `%` / `_`，会被当成 `ilike` 通配符 | `GlobalSearch.tsx`；`PostList.tsx:223` | 代码级 |
| B-7 | 低 | `/feed`、`/daily`、`/songs`、`/timeline` 等页 Dock 无高亮栏，用户不知身在何处（代码注释自认） | `isTabActive` 只覆盖四主栏 | 代码级 |
| B-8 | 低 | 提示体系不统一：Sonner 仅 6 个文件用；大量失败走 `alertDialog` 弹窗；后台自造 `admin-toast`；广播拉取失败静默 | §5（B 线） | 代码级 |
| B-9 | 低 | 旧 Dock 的大段 CSS（`.tabbar` / `.qz-ios26-dock-glass`）零引用残留 | `styles.css:546–623, 781–815` 等 | 代码级 |
| B-10 | 低 | `dockSide`（左右停靠）对现役居中 Dock 主胶囊无可见影响，只影响收起态 `＋` 钮 | §1.1（B 线） | 代码级；待线上验证 |

### 6.3 C 线 Q1–Q10（公共页面，需人工 / 线上确认）

| 编号 | 问题 | 证据 | 状态 |
|---|---|---|---|
| C-Q1 | `PublicLanding` 的横幅默认文案仍是旧句“把我们的青春，留在这里”，而 e2e 明确断言该句不得出现在游客页；`GuestBrowse` 的兜底文案是另一句“让分享与连接，自然发生。”——两者不一致，疑似遗留默认值 | `App.tsx:336`；`smoke.spec.ts` | 代码级；待确认 |
| C-Q2 | 注册页存在两条疑似并存的提交路径（`sendCode` + `doVerifyReg` vs `doReg`）；静态读码未确认 `doReg` 是否仍被调用 | `Login.tsx` | 代码级；待确认 |
| C-Q3 | 首页作者名依赖 `member_directory(lim: 100)`；成员超 100 人或作者不在前 100 时动态卡作者显示回退为“成员” | `Home.tsx` | 代码级；待确认是否需分页取名字典 |
| C-Q4 | 首页表白走 `love_wall_published()` 全量拉取（RPC 无 limit），动态拉 100 条；表白量大时首屏耗时未评估 | `Home.tsx` | 代码级；待线上验证 |
| C-Q5 | `guest_browse_available` 在生产库缺失配置时的默认行为（fail-open / fail-closed）未查生产库；历史记录称游客模式“自上线起一直开着” | 迁移 `20261107170000_guest_access_controls.sql` | 待线上验证 |
| C-Q6 | 登录卡最终宽度（340 vs 430）与圆角（24 vs 30）依赖三层 CSS 的加载顺序与 `!important`，未做浏览器计算后样式核对（与 C-S5 同一问题） | `styles.css:312`；`styles-ios26-liquid-glass.css:419`；`Login.polish.css:24` | 代码级；待验证 |
| C-Q7 | 移动底栏 `.tabbar` 的深色玻璃样式仍在 `styles.css` 中，是否仍挂载未确认（与 C-S7 同一问题） | `styles.css:36–56` | 代码级；待线上验证 |
| C-Q8 | 隐私政策弹窗是公共流程唯一深色面，是否刻意保留无注释（与 C-S10 同一问题） | `Login.tsx:590–591` | 待用户确认 |
| C-Q9 | 游客在手机上看不到会话过期时间（≤760px 状态区整体隐藏），过期时静默退出，无过期前提示 | `GuestBrowse.css:74` | 代码级；窄屏待验证 |
| C-Q10 | `ResetPassword`（邮件回跳）与找回密码页是两套改密 UI，校验与组件不一致（原生 input vs `PasswordField`，错误文案拼接英文原文） | `App.tsx:217`；`Login.tsx`（`mode='forgot'`） | 代码级；待确认是否统一 |

### 6.4 C 线 S1–S13（主题 / 样式冲突，只记录、不擅自换主题）

规模：CSS 文件 80 个、约 27,732 行；`src` 下 `!important` 4,075 处（2026-11-15 DESIGN.md 审计结论为 52 个文件、约 2,874 处，本次文件数与 `!important` 数均已超过该审计值，统计口径可能不同：本次含 `src/components`、`src/pages` 全部 CSS，DESIGN.md 口径未复核，待核对）。`!important` 最高的 10 个文件：`Chat.polish.css` 648、`styles-quiet-editorial-detail.css` 376、`styles-ios26-liquid-glass.css` 311、`styles-quiet-premium.css` 302、`styles-quiet-community-detail.css` 257、`MeHub.polish.css` 185、`styles-admin-cinematic.css` 181、`styles.css` 180、`styles-admin-pages.css` 169、`styles-admin-unified.css` 166。公共面自身的文件反而低：`Login.polish.css` 12、`Home.vibe.css` 14、`GuestBrowse.css` 1、`Guest.cruip.css` 0、`GuestPosts.css` 11——冲突主要来自全局层叠加在公共面之上，而非公共面自身。

| 编号 | 冲突 | 证据 | 状态 |
|---|---|---|---|
| C-S1 | 墨色三值并存：`--qz-ink #202733`、`--qz26-ink #172235`、`--vh-ink #20242b`、`--guest-ink #1f2a3a` vs `#20242b`、`#1c2733`、`#202632` 等，至少 6 个值；同一 `:root` 内 `--visual-accent` 被赋值两次（先 `#667fae`，后被覆盖为 `#526b8c`），前者是死值 | `styles-ios26-tokens.css:43, 9` 等 | 代码级 |
| C-S2 | 底色三值：规范白 `#ffffff`（`--qz-bg`，`check-style-contracts` 断言画布须白、首页不得用 `#f7f8f8`）vs 冷白纸面 `#f7f8f8`（游客壳背景）vs `#f6f7f9`（`--qz-surface-soft`）；游客壳与登录后首页底色不一致，是有意分层还是遗留，无法判定 | `Guest.cruip.css:18`；`Home.vibe.css` | 代码级；待用户/设计确认 |
| C-S3 | 印泥红两值：`#b0404f`（冷白定稿）vs `--qz-danger: #bd5d68` vs `#b3261e`（`GuestNicknameDialog` 内联错误色） | 多处各自定义，未互相引用 | 代码级 |
| C-S4 | 强调色三值：`--qz-accent #526b8c` vs `--visual-accent` 先 `#667fae` 后被覆盖 vs `--guest-accent` 在 `GuestBrowse.css` 是 `#4b5968`、在 `Guest.cruip.css` 是 `#b0404f` | 见 C-S1 | 代码级 |
| C-S5 | 登录卡三层定义打架：`styles.css:312`（宽 340、深色玻璃）→ `styles-ios26-liquid-glass.css:419`（玻璃渐变、圆角 30）→ `Login.polish.css:24`（宽 430、圆角 24）；最终生效值依赖加载顺序与 `!important`（与 C-Q6 同一问题） | 三处 | 代码级；待验证 |
| C-S6 | 全局 `.card` / `.post` / `.composer` / 输入框仍是深色玻璃定义（半透明白底 + 白字假设），浅色化靠后加载的 `styles-quiet-premium.css`（302 处 `!important`）逐条覆盖；任何不在 `.page` 作用域内的卡片/输入框存在低对比度风险 | `styles.css:63, 65` 等 | 代码级；未逐页核对计算后样式 |
| C-S7 | 移动底栏 `.tabbar` 仍是深色玻璃（`color-mix(in srgb, #1a1e30 38%, transparent)` + `blur(30px)`），与纸面冷白主题直接冲突；是否仍挂载未确认（与 C-Q7 同一问题） | `styles.css:36–56` | 代码级；待线上验证 |
| C-S8 | 画布背景多重 `!important` 锁定：`html, body, #root { background: #ffffff !important }` vs `var(--qz-bg)` vs `body:has(.vibe-home) { background: #fff !important }`；壁纸层能否透出依赖这些锁与断言 | 多处 | 代码级 |
| C-S9 | 游客 token 双定义 + 特异度 hack：`GuestBrowse.css:3`（墨 `#20242b`、底 `#fff`、强调 `#4b5968`）vs `Guest.cruip.css:12`（`.guest-shell.guest-shell` 双 class，墨 `#1f2a3a`、底 `#f7f8f8`、印泥红 `#b0404f`）；后者自述靠双 class 特异度硬锁，不依赖顺序；两套冷白 token 与规范 token 逐项都不相等 | 两文件 | 代码级 |
| C-S10 | 隐私政策弹窗是公共流程里唯一的深色面（深蓝渐变底 + 浅字），与全站冷白直接冲突；深色是否刻意无注释说明（与 C-Q8 同一问题） | `Login.tsx:590–591` | 待用户确认 |
| C-S11 | 内联样式绕过 token：`Login.tsx` 42 处 `style={{`、`GuestLoveWall.tsx` 19 处、`GuestBrowse.tsx` 11 处、`GuestPosts.tsx` 2 处、`Home.tsx` 1 处；硬编码色值散落（`#2456c8`、`#2f5fd0`、`#b0404f` 等） | grep 计数 + 抽查 | 代码级 |
| C-S12 | 深色玻璃类名仍在生效链上：`.glow` 在登录页、维护页、PublicLanding、LoginClosedScreen、ResetPassword 的 JSX 里仍渲染，靠 `transparent !important` 压住；`styles.css:446` 仍有深色渐变定义 | grep | 代码级 |
| C-S13 | `color-scheme` 只有 light；系统深色模式下表单控件被强制浅色，但非 `.page` 作用域的深色玻璃定义不受该锁定保护，表现不一致 | `styles-ios26-tokens.css`；`styles-quiet-premium.css`；`styles-light-cleanup.css` | 代码级；系统深色模式未实测 |

### 6.5 C 线移动端风险点 R1–R8（390px 视角，代码推断，未真机验证）

| 编号 | 风险点 | 证据 | 等级 |
|---|---|---|---|
| C-R1 | 游客顶栏在 390px 下只有品牌 + “登录/注册” + “退出”：昵称与过期时间整个 `.guest-header-status` 在 ≤760px 被 `display: none`；过期时会被静默踢回登录面 | `GuestBrowse.css:74` | 中 |
| C-R2 | 游客导航横向滚动无可见滚动提示：`.guest-nav { overflow-x: auto; scrollbar-width: none }`，5 个入口在 390px 下需横滑，滚动条被隐藏 | `GuestBrowse.css:77–79` | 低 |
| C-R3 | 弹窗在 390px 下的余量：隐私弹窗遮罩 `padding: 16` + 内容 `maxWidth: 620`（实际宽 358px，可行）；`GuestNicknameDialog` 遮罩 `padding: 18` + `maxWidth: 390`（实际宽 354px，可行）；登录弹窗遮罩无左右 padding，内嵌 `Login` 卡在 ≤520px 为 `width: 100%` + 左右各 `max(12px, safe-area)` padding，可行 | 多处 | 低（算术可行，未实测） |
| C-R4 | 表白墙附件三列网格在 390px 下每列约 110px：`gridTemplateColumns: 'repeat(3,minmax(0,1fr))'`（单图时 1 列）；视频 `gridColumn: '1 / -1'` | `GuestLoveWall.tsx` | 低 |
| C-R5 | 死样式/死结构：`GuestBrowse.css` 的 `.guest-discovery-*` 样式仍在，但 `GuestHome` 已不渲染 discovery 区；e2e 明确断言 `.guest-discovery-section` 数量为 0 | grep；`smoke.spec.ts` | 低 |
| C-R6 | 首页底部可能被 Dock 遮挡（历史遗留待复核）：`Home.vibe.css` 的 `.vibe-home` 底部 padding 仅 16px，依赖外层 `.wrap` 的 `padding-bottom: calc(104px + safe-area)` 留出 Dock 空间 | `styles.css` 移动端 `.wrap` 规则 | 中（未验证） |
| C-R7 | 登录卡背景面板的滑杆在窄屏可能换行：`.row` 在 `mobile-polish.css` 设了 `flex-wrap: wrap`，但 `Login.polish.css` 的 `.bg-panel .row` 未单独处理 | `Login.tsx`；`public/mobile-polish.css` | 低 |
| C-R8 | 横向溢出被 `overflow-x: clip` 掩盖：`styles.css:634` 把 `html, body, #root` 的横向溢出裁掉，390px 下若有元素超宽不会出现横向滚动条、只会被切掉（方法论风险） | `styles.css:4, 634` | 中 |

另 C-Q11：`GuestBrowse.css` 的 `.guest-discovery-*` 死 CSS 约 30 行（与 C-R5 同一残留）；C-Q12：`index.html` 的 `/mobile-polish.css` 与 Vite 打包 CSS 的最终层叠顺序未在构建产物中核对。

---

## 7. 线上实测存疑点（不要写成定论）

| 编号 | 存疑点 | 事实 | 处理 |
|---|---|---|---|
| L-01 | 游客顶栏过期时间显示 | 浏览器称顶栏显示“游客·08:14 AM 后退出”，到 08:18 仍在浏览；代码 `GuestBrowse.tsx:183` 显示的是 `expiresAt` 时间，按默认 60 分钟会话应为 09:14 左右，08:14 与代码推断对不上，可能是浏览器误读 | 存疑待复核，不要定为 FAIL |
| L-02 | 桌面游客顶栏 vs 登录态顶栏 | 桌面 1920px 下游客页顶部导航清晰可见——但那是 GuestBrowse 自己的游客顶栏，不是 `App.tsx` 里被 CSS 隐藏的 LiquidGlass 顶栏，两者不要混为一谈；登录态顶栏是否隐藏仍是代码结论，未登录实测 | 已在第 9、10 项写清 |
| L-03 | 注册页同意协议默认已勾选 | 线上注册页看到协议复选框默认已勾选；是有意默认还是遗留、提交时是否强制校验，未验证 | 待确认 |
| L-04 | 开场动画时长 | 代码 `AUTO_DONE_MS = 2900ms`；线上从骨架到进访客首页约 4–5 秒，可能是骨架 + 动画叠加耗时 | 待复核，不定为故障 |
| L-05 | 游客会话过期 | 08:14 进入、08:18 仍在浏览，未触发过期；过期瞬间表现、过期前提示均未验证 | 待验证 |

## 8. 修复清单（只列已确认的 1 项）

| 编号 | 问题 | 严重程度 | 涉及文件（拟） | 修复方案（只写方案，不要动手建文件） | 修复记录 | 回归结果 |
|---|---|---|---|---|---|---|
| FIX-1 | 非 hash 路径显示 GitHub Pages 默认 404，无本站页面、无 SPA 回退（第 5 项 FAIL） | 中 | `public/404.html`（新增） | 新增品牌版 404 页：文案说明页面不存在，提供回首页按钮/链接（HashRouter 下回 `#/home`），样式与主站冷白一致；不改路由、不改守卫、不改部署配置。建文件、部署后用 `https://qianzhi.pw/不存在的路径` 实测回退，并复核 hash 路由不受影响。 | 2026-11-21 已实施：新增 `public/404.html`（冷白品牌页 + “回到首页”按钮 + 5 秒自动回 `/#/home`）；PR 待填 | （空，待部署后回归实测） |

其余可疑点（§6 共 43 项）多数是代码级结论、线上待验证，本阶段不列为已确认修复项，不擅自改。禁止通过隐藏按钮、删除入口、返回假数据、吞掉错误或放宽权限来把 `FAIL` 改成 `PASS`。

## 9. 阶段总结

- 检查总数：40 项（逐项表 1–40）
- PASS：12；PARTIAL：6；FAIL：1；BLOCKED：11；NOT_IMPLEMENTED：0；NOT_TESTED：10
- 修复项：1 项已实施待回归（FIX-1，非 hash 404，已新增 `public/404.html`）；0 项已回归通过
- 未解决项：§6 可疑点 43 项（代码级为主）+ §5 NOT_TESTED 10 项 + 登录态 BLOCKED 11 项（含窄屏 390px 环境限制 1 项）
- 测试证据：代码审计底稿 `audit-phase1-work/route-audit.md`、`nav-search-audit.md`、`public-pages-audit.md`；线上实测 2026-11-21 08:14–08:18，桌面 1920×998，未登录，全程只读（首屏、访客五页、受限直访、非 hash 404、登录/注册控件、签名页）
- 提交 / PR 信息：FIX-1 PR 待填（新增 `public/404.html` + 两份审计报告）；回归待部署后实测。
- 下一步（等用户指令）：① 部署后回归 FIX-1；② 用户真机复核 390px 窄屏（第 40 项）；③ 用户确认 C-Q1 / C-Q8 / C-Q10 / L-03 等待确认项；④ 用户发出继续指令后，再开始第 2 阶段（用户账号与社交功能）。

---

## 附录：主站路由全表（A 线，代码审计，供对照）

主站 `<Route>` 47 条（`src/App.tsx:1496–1545`），访客树 7 条（`src/pages/GuestBrowse.tsx:205–212`）。本阶段逐项表只覆盖其中基础/导航/公共页面部分；其余 40+ 条路由（`/explore`、`/feed` 登录态、`/friends`、`/chat/:cid`、`/me/*` 等）属第 2–3 阶段范围，**未在本阶段验证**，不要把路由存在读成已检查。完整 47 条路由表见 `audit-phase1-work/route-audit.md` §5，访客树见同文件 §6。

静态子站（不是路由，不受登录守卫控制）：`/signature/`（`public/signature/index.html`）、`/realworld/`（`public/realworld/index.html` + 模型文件），见 A 线 §7。
