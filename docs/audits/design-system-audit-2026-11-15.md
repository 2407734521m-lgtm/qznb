# DESIGN.md 接入与设计审计报告

- 日期：2026-11-15
- 基底：`main` 5731527（`docs: add Qianzhi design system specification`）
- 范围：规范接入 + 全面审计。**本次只审计、不改页面、不执行数据库迁移、不动线上数据。**
- 方法：源码检查（CSS/TSX/脚本）+ GitHub 候选调研。对比度、层叠胜者、真实动效时长等需浏览器/真机验证的项已在文末单列，未凭源码断言。

## 1. 结论总览

- **DESIGN.md 已接入开发规范**：根目录 `DESIGN.md`（v1.0，318 行）已在；本次在 `README.md` 增加「设计规范」一节，并在仓库根目录新建 `AGENTS.md`（仓库此前没有），两处均只引用 `DESIGN.md`，不复制整份规范。AI 编程工具改前端前按 `DESIGN.md` 第 9 节守则行事。
- **产品意图与规范基本一致**：全站无原生弹窗/原生下拉、自定义弹窗体系带 Esc、减弱动效覆盖广、安全区处理完整、后台 CSS 与主站隔离、灵动岛/Dock/音乐确实是独立视觉体系。**主要问题不是缺功能，而是层层叠加的历史样式**：深色玻璃底被后来的 `!important` 白色覆盖层救回来；按钮/卡片/输入框在 3–4 个文件里各有定义；后台 4 套壳子、个人主页 3 套配色叠在一个导入列表里；小于 12px 的文字遍布全站。
- **不需要重做网站**。整改方向是删掉被取代的样式层、每类表面只留一个 token 来源、分模块收敛。

## 2. 规范接入情况

| 位置 | 改动 | 说明 |
|---|---|---|
| `DESIGN.md` | 已存在（5731527，并行线刚并入） | v1.0，白色极简打底 + 各区域独立体系，token 为建议值，非线上实测提取值 |
| `README.md` | 新增「设计规范」一节 | 引用 `DESIGN.md`，说明视觉整改不改功能/不碰数据库与权限 |
| `AGENTS.md`（新建） | 仓库此前无此文件 | 改页面/组件前先读 `DESIGN.md`；复用 token；改动守范围；附检查命令与数据权限红线 |
| `docs/frontend-css-architecture.md` | 未改 | 现有 CSS 架构文档，与 `DESIGN.md` 的 token 命名尚未对齐，整改阶段 0 顺带核对 |

仓库此前没有任何 AI 规则文件（无 `AGENTS.md`、无 `.cursorrules`、无 `CLAUDE.md`），本次新建的 `AGENTS.md` 是第一份。

## 3. DESIGN.md 与现有项目的冲突点

这些是规范本身的建议值与线上现状不一致的地方，整改前需要定下来，不是直接照抄：

1. **印泥红 `#b0404f` 是事实上的主站强调色（CSS 里 57 处），但 `DESIGN.md` 没有给它 token**。规范的主操作色是深灰 `--qz-action #252A31`，现有 token 强调色是石板蓝 `--qz-accent #526b8c`。三者并存。需定：印泥红保留为品牌强调色（补 token），还是收敛到深灰/石板蓝。
2. **Token 值对不上**：现有 `--qz-ink #202733` vs 规范 `#20242A`；`--qz-danger #bd5d68` vs 规范 `#C44747`；次要表面现有 `#f7f8f8` / `--qz-surface-soft #f6f7f9` vs 规范 `--qz-surface-subtle #F6F7F8`。三处是同一类近白色、三种写法。需定：以规范值为准统一，还是以现状值为准改规范。
3. **圆角刻度对不上**：现有 token 是 9/14/18，规范是 8/12/16/20；实际最常用的还有 999px（75 次，远超规范「仅 chips/状态标记用 pill」）、13px、15px 等非 4px 节奏值。需定：采用规范刻度，还是保留 9/14/18。
4. **品牌棕 `#94664f`**：CSS 里已是 0 处，只剩 `BrandMark.tsx` / `IntroAnimation.tsx` / `LoginSuccessOverlay.tsx` 里的 logo 与开场动画。`DESIGN.md` 明确说不把历史棕色当设计前提。结论：棕色只留在 logo 资产里，不再进组件样式；如后续连 logo 都换，再议。
5. **灵动岛**：规范写「深色半透明胶囊或精调玻璃」，实际是全不透明黑胶囊。对比度没问题，是措辞与效果的差距：接受现状并在规范里备注，或改回半透明。建议接受现状。
6. **动效超带**：规范要求按钮 120–180ms、弹窗 180–260ms、岛展开 220–360ms；实际岛收起滑动 420ms、premium 入场 460ms、移动端 Dock 过渡 620/480/350ms。需实测后收进带宽。
7. **规范的 token 是建议值**：`DESIGN.md` 第 2、11 节自述未逐项实测线上样式，数值可能调整。整改阶段 0 先定 token 终值，再扩散。

## 4. 不符合规范的问题清单

按区域列出。必须修复 = 违反规范硬性要求或用户可见的错误；暂缓 = 可接受、可延后。

### 4.1 首页 / 游客页（§4.1）

必须修复：

- 首页 H1 25px、分区 H2 19px，低于规范 H1 30–34 / H2 23–26（`Home.vibe.css:805,837`）。
- 首页帖子预览缺可见性与点赞/评论数（`Home.tsx` 的 `vh-wall-card`；数据在 `PostList.tsx:709-713` 已有）。
- 公告空态无操作（`Home.tsx`「暂无公告。」纯文本）。
- 同一文件三套 Home 样式叠加：暖色层（`Home.vibe.css:4-7`，`--vh-ink:#29251f`、`#fffdf9`）与后来的 token 层打架，另有约 120–530 行死规则（`.vh-hero/.vh-shortcut/.vh-panel` 当前 `Home.tsx` 不渲染）。
- 首条公告的 `<BorderBeam duration={8}/>` 装饰（`Home.tsx:245`）+ 印泥红「最新公告」标签：装饰只给最新一条，不对应任何需要注意的状态。

暂缓：游客壳 `#f7f8f8` 与 `#fff` 二选一；`VisitCounter` 暖棕 `#a08b74` 改 token 色；10–11px 弱灰文字需实测对比度；死规则 `.guest-discovery-card`（带装饰渐变）删除。

### 4.2 动态 / 日常 / 表白墙 / 公告（§4.1、§5）

必须修复：

- 动态页只有标题、无一句简介（`PostList.tsx:559-562`）；日常/表白墙有简介。
- 成员动态不显示可见性标签，游客卡片却显示（`GuestPosts.tsx:51`）。
- 表白墙有评论数无点赞数；游客表白墙「点赞」是无数字的裸标签（`LoveWall.tsx:465`，`GuestLoveWall.tsx:148-149`）。
- 卡片套卡片（§5 禁止）：编辑表单 `<div className="card">` 套在 `article.post` 里（`PostList.tsx:657`）；印象投票是带边框面板里再套带边框选项卡（`PostList.tsx:669`，`styles.css:1216-1222`）。
- 公告板两套配色打架：暖纸（`Board.polish.css`）vs 冷白 `!important` 覆盖（`Board.starterblog.css`，后导入）。
- 三处 H1 低于刻度：公告板继承 24px、表白墙内联 26px、提问箱 `clamp(25px,5vw,32px)`。
- 公告板空态无操作（`Board.tsx:147`；下方固定发帖器未被引用）。

暂缓：第三套青色强调（投票与表白墙选中 chip `#287f8c/#58aeb0`）与主强调色不统一；四类目粉彩色离 palette；窄屏 H1 缩到 22px（≤380px）应保 ≥26px；「本页统计」栏与每帖底部总数重复；提问箱空态纯文本；圆角超 20px 上限（公告板 hero 25px、表白墙 sheet 22px）。

### 4.3 个人主页 / 我的 / 设置（§4.2）

必须修复：

- 相邻三个页面三套配色，无一用规范 token：`MeHub.css` 青色 → `MeHub.polish.css` 暖纸（`#fffdf9`、`#9b654b`）→ 同文件后段白色 `!important` 强制；`Member.polish.css` 深蓝渐变 hero；设置页暖纸。需收敛到同一套 token。
- 成员主页不展示帖子（§4.2 要求优先展示帖子）：只有身份 + 资料 + 视频，帖子只藏在 5–7 个等权圆形入口之一的「时间线」里（`Member.tsx:354`）。

暂缓：8–9px 元数据文字；标题尺寸偏 H2（成员名 24px、我的 25px、设置 22px、账号 20px）；次要设置在个人资料编辑页重复（`MyProfile.tsx:420-459`）；`MeSettings.tsx` 与 `SettingsShell.tsx` 各有一份约 60 行内联页眉样式且已分叉；账号页密码输入只有 placeholder、无 `<label>`；我的页无直达「编辑资料」入口。

### 4.4 私信（§4.3）

必须修复：

- 无在线/在线状态：规范要求区分在线态，但 `Chat.tsx` / `Friends.tsx` 里无 `online|presence|last_seen|is_online`。需新增在线来源 + 列表与会话头指示。
- 一整套已死的深色私信主题仍在 `Chat.tsx`（约 887–940 行）里，只靠 `Chat.polish.css:10-26` 的 `!important` 压住；两层对「已发送状态」颜色说法不一（`#8df0b3` vs `#7f9cbd`）。删除死层。

暂缓：每条气泡 `blur(12px)`（现因气泡不透明而不可见，可删）；已发送气泡为饱和蓝 `#3478d4`，规范说「克制的蓝 tint」，可考虑更淡；9–11px 元数据；桌面端消息流不限宽（仅气泡限 560px）；语音消息用原生 `<audio controls>`；输入框 placeholder 字面写着 `iMessage`；好友页未读点只有颜色/形状（数字只在 `aria-label` 里）；`styles-call.css` 两套通话层叠加；全局壁纸引导滑块不影响私信（两套系统，各说各话）。

### 4.5 管理后台（§4.4、§5）

必须修复：

- 小于 12px 的文字遍布后台：快捷栏标签 8px、品牌/分组 9px、面包屑 11px（`styles-admin-scaffold.css` 多处）；TSX 内联 `fontSize: 11` 35 处、`11.5` 22 处、`10.5` 20 处。全部抬到 ≥12px。
- 四套完整后台壳子叠在一个导入列表里（`Admin.tsx:8-18`）：cinematic（深色玻璃、蓝紫渐变主按钮）→ unified → scaffold（深色侧栏）→ tokens（浅色）→ pages → contrast → paper → mosaic → shadcn-shell（冷白）→ antd-pro（最后，`#1677ff`）。胜者由导入顺序决定。另有深色遗留：在浅色底上出现粉彩文字（`#8de0b7/#ffb5c1/#9de3e2` 等），cinematic 的输入框底色 `rgba(255,255,255,.045)` 在浅色底上近乎不可见，只靠 contrast 覆盖层救。
- 无共享状态徽章体系：状态是裸文字三元表达式；安全态「高风险操作」只有颜色 + 11px 字（`AdminSecurityCenter.tsx:205`）。
- 危险样式四种写法；「驳回」被样式化成 tertiary（`mini ghost`），不是 danger。
- 按钮变体不全：无 tertiary；`mini` 既当 secondary 又当默认（`styles-admin-pages.css:68` 把普通 `mini` 写成主蓝 `#2563eb`）；`:focus-visible` 只在 11 个后台 CSS 文件中的 3 个有；`:disabled` 只有全局 `opacity:.45`。
- 三套覆盖层、键盘行为不一：`DialogHost` z 1000 vs 广播预览 1400 vs 后台 toast `z-index:2147483000`（能盖住打开的确认框）；`DialogHost` 的 prompt 禁 Esc、无焦点陷阱；三个手写弹窗完全无 Esc 处理。
- 筛选控件各页各写各的（`Moderate.tsx:242` 内联 chips vs 五个页签用 `OptionSheet` vs 其他临时写法）。

暂缓：后台根本没有 `<table>`（密度问题无从答）；死规则 `.wrap:has(.admin-shell-v3)`（`styles-admin-cinematic.css:135,423-424`）从不匹配但一旦后台挂进 `.wrap` 就会改写成员页布局，删除；`AdminShell` 渲染成员装饰 `<div className="glow" />`（`main.tsx:189,191`）；`button.mini` 36px、快捷栏 8px 低于约 44px 目标。

### 4.6 音乐 / 灵动岛 / Dock（§4.5–4.7）

必须修复：

- 主站侧无音量状态与控件：桥协议只有 `toggle|previous|next|seek`，`MusicTrack` 无音量字段（`MusicIsland.tsx:11-28`）；规范要求音量有明确状态。
- 无队列状态与控件：「列表」图标按钮只是跳到 `/music`（`QianzhiMusicIslandActivity.tsx:186-188`），图标却暗示有队列。
- 岛上文字系统性低于 12px：紧凑标题 10px、展开元数据 9–10px（`rgba(255,255,255,.43-.6)`）、进度时间 9px（`MusicIsland.css:290-295,349-356`）。
- 岛展开时长无法对上规范 220–360ms（用弹簧参数而非毫秒）；唯一明确的岛过渡超带：收起滑动 420ms + 900ms 延迟。
- 收起后的可点目标只有约 7–8px 可见细条（7px 边缘、8px  peek 条；点击区 34px < 约 44px 目标；提示只是一条 22×2px 把手）。
- 可配偏移能把岛推到页面控件上且无保护：offsetX ±90 会平移展开岛；offsetY +90 会把它压进顶部导航区；设置页预览只限 ±18px，真实值却到 90（`MeSettings.tsx:210` vs `:220`）。
- **Dock 未读红点不可见**：`<i className="qz26-dock-unread" />` 在渲染（`App.tsx:97-140,1213-1218`），但唯一规则挂在已死的 `.qz-ios26-liquid-dock` 选择器下（`styles-ios26-liquid-glass.css:722-731`），`FloatingDock` 用的是 `qz-floating-dock`，红点无尺寸/定位/背景。
- 桌面端底部留白少 16px：`.wrap` padding 56px（≥769px），Dock 占 72px（16+56）。

暂缓：`/music` 路由周边仍是浅色（iframe 白底、白色返回 pill/连接卡），与深色嵌入体不搭；音乐只显示时间、无百分比（上传岛有 `%`）；展开岛按构造会盖住顶部导航（z 4001 vs 50），只靠点外部/Esc 恢复，需真机确认；岛是不透明黑而非规范说的半透明胶囊（见第 3 节第 5 点）；Dock 标签 11px；Dock 页签无 hover 态（桌面端）。

### 4.7 跨页面共性

必须修复：

- **`button.pri` 至少 4 种定义**：`styles.css:67`（`var(--a),var(--b)` 渐变）vs `:609`（深灰渐变 `!important`）vs `:960`（青色渐变）vs `styles-ui-foundation.css`（石板蓝 `!important`，限动态/日常/我的）vs 后台 cinematic（蓝紫渐变）。更糟：`--a/--b` 按用户主题重定义（日落橙粉、森林、单色、星空、海洋），又按卡片重定义，主按钮颜色随主题和是否在卡片里而变。
- **两套 token 体系并存**：`--qz-*`（贴近规范）vs 旧 `--fg/--bg/--a/--b/--mut`（按主题、按组件重定义）。基础表 `styles.css:2` 只定义 `--r:20px; --tab-h:68px`，没有规范 token。
- **基础表是深色玻璃，白色是覆盖层**：`.card` `#ffffff0f` + 模糊（`styles.css:63`）、`.post` `#ffffff0c`，只靠 `:604-609` 的 `#fff!important` 与后续表救回来。`.card` 一处定义 4 次。
- **`!important` 是冲突解决机制**：全站约 2,874 处（42/52 文件）。`styles-quiet-editorial-detail.css` 344、`styles-ios26-liquid-glass.css` 307、`Chat.polish.css` 266、`styles-quiet-premium.css` 256。没有 `!important` 的新规则会输。
- **覆盖层 z-index 无统一刻度**：OptionSheet 600/601 < dialog 1000 = 音乐 frame 前台 < 广播预览 1400 < 后台 toast 2147483000 < 岛 4001。Toast 能盖住确认框；岛浮在弹窗之上。
- **触点尺寸参差**：30px 私信操作钮、36px 后台 `mini`、38–39px 私信上下文操作、34px 岛 peek 点击区，均低于约 44px 目标。

暂缓：焦点环颜色随主题变（`input:focus` 用 `var(--a)`），规范要求 `--qz-focus #4776B8`；另有第三种焦点色青 `#58aeb0`；`.glow` 固定层与 `.app-bg` 壁纸层可能盖住成员页白底，需确认无壁纸默认态是纯白。

## 5. CSS 冲突与重复（影响最大 10 项）

1. `.card` / `.mcard` / `.post`：五种皮肤打架，圆角 20px / 14px `!important` / 22px `!important` / 18px / 16px，胜者由加载顺序 + `!important` 决定。
2. `input` / `textarea` / `select`：四种处理，圆角 12 / 14 `!important` / 9 `!important` / 9 `!important`。
3. `.tabbar`（Dock）：三种皮肤；预期的深色移动端 Dock 已死——`styles.css:612` 的白色 `!important` 在移动端也赢，深色版从不渲染。`FloatingDock.tsx` 无专属 CSS 文件，继承这些规则。
4. `body`：两处字体声明、三处背景强制；完整的规范字体栈只在 `styles-quiet-premium.css:17` 出现一次。
5. `.topnav`：四种背景，含一处残留青色（`styles.css:979`，Phase 4 区块遗留）。
6. `button.pri`：三种主按钮（公开深灰渐变 vs 石板蓝 vs 后台蓝紫渐变/扁平 `#1677ff`）；`--admin-accent` 定义了两次（`#2563eb` vs `#22314a`）却 0 次使用。
7. `!important` 饱和：约 2,874 处；仅圆角覆盖就有 `10px !important` 17 次、`12px !important` 16 次等。
8. 私信气泡：已发送蓝两种（`#3478d4` vs `#0a7cff`）；气泡几何 `21px / 15px` 在规范圆角角色与 4px 节奏之外。
9. 后台壳子 6 处重定义：`.admin-shell-v3` 在 antd-pro、paper、scaffold、shadcn-shell、tokens、liquid-glass 六个文件里各写一遍。
10. 标题刻度：无全局 `h2`/`h3` 字号；`h1` 有 `clamp(30px,6vw,52px)`（超规范 display 上限 44px）与 `clamp(26px,5vw,34px)` 两种；15px 的 `h2` 存在。

另：52 个 CSS 文件、19,258 行；1,329 个不同 hex 颜色；近白表面至少四种写法（`#fff` 261 + `#ffffff` 136 + `#fffdf9` 47 + `#f7f8f8` 37）；`--space-*` 刻度已定义但 0 次使用；`--radius-*` 刻度几乎 0 次使用。

## 6. 可复用的 GitHub 开源组件候选

只列候选，**未经确认不集成**。已排除：Radix（用户两次否决）、shadcn（需 Tailwind）、antd/Umi（已否决）、Headless UI（默认配 Tailwind，同类里 Ariakit 更干净）。VoltAgent/awesome-design-md 里的 Apple/Intercom/Linear/Notion 四份 DESIGN.md 只是 Markdown 设计分析文档，无代码，只能当 pattern 来源。

| 缺口 | 候选 | Stars | License | 建议 |
|---|---|---|---|---|
| 设计 token / 主题 | Open Props（argyleink/open-props） | 约 5.6k | MIT | 推荐试点：只借间距/圆角/阴影/缓动等中性 token，映射到 `--qz-*`；不要整包照搬它的颜色体系 |
| 无头组件（弹窗/菜单/下拉/toast） | Ariakit（ariakit/ariakit） | 约 8.6k | MIT | 推荐试点：先在一个弹窗（如后台确认框）试，toast 已有 Sonner 不需要它 |
| 后台表格 | TanStack Table（TanStack/table） | 约 28.6k | MIT | 推荐试点：先用在一个后台列表；与已装的 @tanstack/react-virtual 同一家 |
| 私信 UI | Chat UI Kit React（chatscope/chat-ui-kit-react） | 约 1.8k | MIT | 仅作版式参考，不建议当底座；自带视觉体系要覆盖，版本也偏旧 |
| 底部导航 / Dock / 灵动岛 | — | — | — | 已有方案，无需新候选：岛引擎 islandcn 已 vendored 在 `src/lib/island/`，Dock 已按 Aceternity 版式自写 |

## 7. 分阶段整改计划

每阶段独立 PR，完成后跑 `npm run typecheck`、`npm run build`、`npm run check:styles`、`npm run check:admin-styles`，再做移动端与桌面端视觉验收。**各阶段均不涉及数据库迁移与生产数据。**

### 阶段 0 — Token 基础（先行，解锁其余阶段）

- 定 token 终值：采纳或修正规范值（第 3 节 7 项决策，见第 8 节）；在基础表定义 `--qz-canvas/--qz-surface/--qz-surface-subtle/--qz-surface-hover/--qz-ink/--qz-ink-secondary/--qz-ink-muted/--qz-border/--qz-border-strong/--qz-action/--qz-action-hover/--qz-focus/--qz-success/--qz-warning/--qz-danger`；印泥红如保留则补 `--qz-accent-red` 之类的品牌 token。
- 退役 `--a/--b` 作为操作色；`button.pri` / `button.ghost` / `.card` / `.post` 各只留一个定义；基础表改白底优先，删深色玻璃底层。
- 覆盖层 z-index 刻度 token 化（sheet < dialog < toast < island，写死顺序）。
- 涉及文件：`src/styles-ios26-tokens.css`、`src/styles.css`、`src/styles-ui-foundation.css`、`src/lib/dialog.tsx`、`src/components/OptionSheet.tsx`；顺带核对 `docs/frontend-css-architecture.md`。
- 验收：全站主按钮同一颜色、卡片同一皮肤；新增 token 一致性检查进 `scripts/check-style-contracts.mjs`（目前只守白底/壁纸/隔离，不守 token）。

### 阶段 1 — 文字底线与标题

- 全站小于 12px 的文字抬到 ≥12px；H1 进 30–34px（首页、公告板、表白墙、提问箱、我的/成员/设置、私信元数据、岛元数据、后台）。
- 涉及文件：`Home.vibe.css`、`GuestBrowse.css`、`GuestPosts.css`、`PostList.longform.css`、`LoveWall.tsx`、`MeHub.css`、`Member.polish.css`、`Chat.polish.css`、`MusicIsland.css`、`styles-admin-*.css`、后台 TSX 内联样式。
- 验收：移动端 320px 与桌面端抽查；对比度实测（第 9 节）。

### 阶段 2 — 后台收敛

- 四套壳子只留一套为唯一事实来源，其余删除或调和；一个 `.danger`（自 `--qz-danger`）覆盖全部危险/驳回操作；一个状态徽章组件（颜色 + 文字 + 非颜色线索）；一套弹窗行为（Esc + 焦点陷阱 + 初始焦点）与一套筛选模式；焦点/禁用/按压态补齐。
- 涉及文件：`Admin.tsx`（导入列表）、11 个 `styles-admin-*.css`、`Moderate.tsx`、`AdminReviewCenter.tsx`、`AdminAccountManagement.tsx`、`AdminBroadcast.tsx`、`lib/dialog.tsx`。
- 验收：后台各页签在 320px 可用；确认框不被 toast 盖住；新增后台 token 检查进 `scripts/check-admin-style-contracts.mjs`。

### 阶段 3 — 私信与个人主页收敛

- 删私信死深色层；成员/我的/设置三套配色收敛到阶段 0 的 token；新增在线状态来源与指示；成员主页展示帖子预览/数量或提升时间线入口。
- 涉及文件：`Chat.tsx`、`Chat.polish.css`、`Friends.tsx`、`Member.tsx`、`Member.polish.css`、`MeHub.css`、`MeHub.polish.css`、`MeSettings.tsx`、`SettingsShell.tsx`。
- 验收：双号实测在线态；壁纸下气泡对比度。

### 阶段 4 — 灵动岛 / Dock / 音乐

- 桥协议加音量；队列要么做真视图、要么换掉误导图标；岛文字 ≥11–12px、收起滑动与弹簧收进规范带宽；收起边缘加高、点击区 ≥44px；展开岛偏移独立钳制（与紧凑偏移脱钩）；修 Dock 未读红点（给 `.qz-floating-dock` 下的规则）；桌面端 `.wrap` 底部留白 ≥72px；删死 Dock 样式（三处来源）与未引用的 `liquid-glass-dock/`。
- 涉及文件：`MusicIsland.tsx`、`MusicIsland.css`、`QianzhiMusicIslandActivity.tsx`、`lib/island/*`、`FloatingDock.tsx`、`App.tsx`、`styles-desktop.css`、`styles-ios26-liquid-glass.css`。
- 验收：真机测岛展开/收起时长、收起细条可找到、偏移不盖控件、Dock 红点可见。

### 阶段 5 — 动态 / 表白墙 / 公告补齐（最小）

- 动态页加简介；成员帖子加可见性标签；表白墙补点赞数（或明确说明无点赞）；`PostList` 卡片套卡片拍平；公告板空态加聚焦发帖器的按钮。
- 涉及文件：`PostList.tsx`、`LoveWall.tsx`、`GuestLoveWall.tsx`、`Board.tsx`、`Board.polish.css`、`Board.starterblog.css`。
- 验收：游客与成员视图一致；空态操作可达。

### 阶段 6 — 视觉验收（收尾）

- 全站 ≤12px 弱灰文字与壁纸上文字的计算对比度；每页层叠胜者实拍核对；岛/Dock 时长、展开岛遮挡、后台 320px 的真机检查；减弱动效模式复核。
- 全部通过后，`DESIGN.md` 的「建议值」标注可改为已验证值；未验证项留在第 11 节。

## 8. 需要用户决策的事项（整改前定）

1. 印泥红 `#b0404f`：保留为品牌强调色（补 token），还是收敛到深灰/石板蓝？
2. Token 终值：以 `DESIGN.md` 建议值为准，还是以现状值（`#202733`、`#bd5d68`、`#f7f8f8`）为准改规范？
3. 圆角刻度：规范 8/12/16/20，还是现状 9/14/18？
4. 深色移动端 Dock（`styles.css:36-45`）是特意退役的，还是误删？删还是恢复？
5. 灵动岛：接受不透明黑胶囊（改规范措辞），还是改回半透明？
6. 开源候选试点：Open Props（token）、Ariakit（一个弹窗）、TanStack Table（一个后台列表）是否逐项试？Chat UI Kit 只当参考，不装。

## 9. 源码无法验证、需浏览器/真机核对的项

- 10–11px 弱灰文字（`#9299a1`、`#a0a6ad`、`#7a8894`、岛上 `rgba(255,255,255,.43-.46)`）与 Dock/非活跃文字在用户壁纸上的实际对比度。
- 同一选择器在 3 个以上样式表里定义时，运行时真正的胜者（`.page .hero`、`.vh-modal`、`.board-post`、私信气泡）。
- 浅色底上的粉彩后台文字是否真的难读；8–9px 后台标签在真机上是否可读。
- 岛展开/收起的真实体感时长（弹簧 vs 220–360ms 带宽）；展开岛盖住顶部导航是否可接受；7px 收起细条是否找得到。
- Toast 与弹窗重叠；确认框的初始焦点行为。
