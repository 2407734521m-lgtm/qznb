# 瑞氏集团有限公司招聘（/jobs）

公开招聘页挂在主站 `qianzhi.pw` 上，游客不用登录就能看职位、应聘、查进度；
超管在管理后台「招聘管理」页签里审核，通过后发录用通知邮件到应聘者的 QQ 邮箱。

流程借 GitHub 上 YuLin-Coder 的 No85OnlineJobRecruitmentManagementSystem
（三角色：管理员发职位、用户投简历、招聘人员看简历点通过/不通过、发通知），
在本站 React + TypeScript + Vite + Supabase 技术栈里重新实现，不跑原项目的 Java/JSP/MySQL。

## 公开页面

- `/jobs` 职位列表：搜索框、部门筛选（站内 OptionSheet）、每张卡显示招几人 / 已招几人；满员显示“已满”，点进去也不能报名。横幅下方有「+ 申请新增岗位」按钮，游客不用登录就能申请加一个新岗位，后台审核通过后自动出现在列表里（见下“申请新增岗位”）。
- `/jobs/:id` 职位详情 + 申请表单：姓名、QQ 邮箱（必填，格式校验）、手机号、自我介绍、工作经历。提交走服务端 `recruit-apply` 函数（见下“QQ 头像校验”），成功后显示“已提交，待审核”。
- `/jobs/status` 凭 QQ 邮箱查自己的申请进度；状态是“未通过”时显示原因（`admin_note`）。

未登录游客打开 `/jobs` 时 App.tsx 有单独的公开分支，直接渲染招聘路由，不经过登录页；
维护模式开启时仍显示维护页。已登录成员走正常站内路由。

## 后台（仅 super_admin）

管理后台「内容运营」分组下的「招聘管理」页签：

- 统计：职位总数 / 开放中 / 申请总数 / 待审核 / 已通过 / 未通过，各职位招录情况。
- 申请列表：按职位与状态筛选；通过 / 驳回（可填备注）；通过后自动发录用通知邮件，失败可重发；驳回后可手动发婉拒邮件。
- 新增岗位申请：访客申请加的岗位都在这里审核；通过后自动新建职位（名额 1 人），驳回只记备注。
- 职位管理：新增 / 编辑 / 关闭职位、改名额、改薪资与描述；编辑职位时可填“任职人”（已入职人员，多个名字用顿号隔开），任职人会算进已占名额。

## 数据库（迁移 20261128140000_recruit_ruishi.sql）

- `recruit_positions`：职位（名称、部门、名额 quota、薪资范围、描述、要求、是否开放、排序、任职人 `holder_names text[]`）。初始 11 个职位（董事长 1、总经理 1、人事经理 1、财务总监 1、会计 2、技术总监 1、前端工程师 1、后端工程师 1、运营专员 2、保洁员 2、保安 2），表空时才播种。任职人占名额：已占 = 已通过申请数 + 任职人数，剩余 = 名额 − 已占（最小为 0）；提交申请与审核通过（含批量）都在服务端按这个口径判满员，绕过前端也提交不进。
- `recruit_applications`：申请（职位外键、姓名、QQ 邮箱、手机号、自我介绍、工作经历、状态 pending/approved/rejected、管理员备注、审核时间、邮件发送状态）。
- RLS：公开只读开放中的职位；申请表不对客户端开放。
- RPC（全部 SECURITY DEFINER，`search_path = ''`，按角色授权）：
  - 公开：`recruit_position_counts()`（各职位已招人数）、`submit_recruit_application()`（提交时校验名额、同一邮箱同一职位不重复投递）、`recruit_my_applications(email)`（凭邮箱查进度）。
  - 超管：`admin_list_recruit_positions()`、`admin_upsert_recruit_position()`、`admin_list_recruit_applications()`、`admin_review_recruit_application()`（通过时先对职位行加锁再数已通过人数，防并发超员）、`admin_recruit_stats()`。
- 同迁移把 `email_delivery_logs` 的类别白名单加了 `recruit_notice`、来源白名单加了 `recruit-notify`（与之前加 `friend-request-email` 的迁移同款写法）。

## QQ 头像校验（迁移 20261128160000_recruit_qq_avatar_reason.sql）

- 新 Edge Function `supabase/functions/recruit-apply`：公开提交入口，申请人不用登录，**部署时 `verify_jwt` 必须为 `false`**。流程：取 QQ 邮箱 `@` 前面的 QQ 号，拉 `https://q1.qlogo.cn/g?b=qq&nk={QQ号}&s=100` 的头像算 SHA-256，和腾讯默认头像（SHA-256 `2d2cf213…85ac4a3`，对应 md5 `4700116072a9eba9330a81fbbe49b7d5`，PNG 100x100，5894 字节，2026-11-28 实测）比对。
  - 一样（没换过头像）：大概率是假号，把申请写入 `recruit_applications`，状态直接记 `rejected`，`admin_note` 写“系统自动拒绝：该 QQ 邮箱未设置头像，无法验证为真实 QQ 邮箱”，并把原因返回给前端显示。
  - 不一样（有头像）：走现有的 `submit_recruit_application` RPC 提交，名额与重复投递校验都在那个 RPC 里。
  - 腾讯头像服务拉不到或超时（8 秒）：不直接拒绝真人，放行提交，但在 `admin_note` 写“头像验证未完成（服务暂不可达），请人工核对”，后台人工看一眼。
  - 注意：从没换过头像的真人 QQ 也会被拒绝，这是用户定的规则，不是 bug。
- 迁移只改 `recruit_my_applications` 的返回结构（加 `admin_note`），须先 DROP 再重建；后台申请列表本来就显示 `admin_note`，不用改。

## 优化第一批（迁移 20261128170000_recruit_polish_batch1.sql）

界面：招聘页顶部加暖色渐变门面横幅（CSS 渐变，无外部图片）；职位卡片部门圆点配色、薪资放大、招满置灰更明显；详情页加职位亮点与三步指示（填写资料 → 提交申请 → 等待审核），描述/要求按段落显示；进度页改成时间线（已提交 → 审核中/通过/未通过 → 面试安排）；列表卡片依次浮现（0.3 秒，减动效时关闭）、按钮按压回缩；小屏收紧、输入框与按钮放大。

功能：
- 投递确认信：提交成功后 `recruit-apply` 再经 `email-dispatch` 给应聘者发一封“已收到申请”的确认信（类别 `recruit_notice` / 来源 `recruit-notify` 已在白名单里，不用另加；事件 key `recruit:received:<id>` 防重复）。发信失败不影响提交结果。
- 收藏与分享：职位收藏只存本机 localStorage（`rj_fav_positions_v1`，不用登录、不用建表），列表可“只看收藏”；分享优先调系统分享，不支持时复制链接。
- 批量审核：新 RPC `admin_review_recruit_applications_batch(ids, status, note)`（超管），按顺序逐份走和单个审核一样的加锁数人数逻辑，名额满了的那份及之后同职位的份记为 full 并跳过，不超员；返回 `{processed, skipped, stopped_full, results}`。批量通过后前端逐份发录用通知邮件。
- 面试：`recruit_applications` 加 `interview_at` / `interview_note` 两列；通过时可在后台一并填面试时间（`admin_review_recruit_application` 加两个可选参数，仅 approved 生效），通过后也可改（新 RPC `admin_set_recruit_interview`，仅已通过的申请）；进度页时间线里显示面试时间；录用通知正文里有面试时间就带上。
- 统计：后台各职位行加“收到几份 · 通过率”，招满的职位在顶部出提示横幅。

## 邮件（复用站内 email-dispatch + Resend）

- 新 Edge Function `supabase/functions/recruit-notify`：只接受超管调用，读库里的申请与职位，按审核状态发录用通知或婉拒邮件，再经 `email-dispatch` 发出（事件 key `recruit:offer:<id>` / `recruit:rejection:<id>`，防重复发送），并回写 `email_sent_at` / `email_status`。
- `supabase/functions/email-dispatch/index.ts` 的类别与来源白名单里加了 `recruit_notice` / `recruit-notify`。
- 注意：发件人沿用现有链路的 `Class Memory <notice@qianzhi.pw>`，邮件正文落款是瑞氏集团有限公司人事部。如需把发件人改成瑞氏集团，要另外改 email-dispatch（会影响全站邮件）。

## 上线步骤（合并后按顺序做）

1. 合并 PR 后跑迁移：`supabase db push`（或在 Supabase 控制台执行迁移文件）。迁移只新增表与函数，不动现有数据。QQ 头像校验那则（20261128160000）只改 `recruit_my_applications` 返回结构。优化第一批那则（20261128170000）只加面试两列与两个新 RPC、扩展两个列表函数的返回列。
2. 部署 Edge Function：`supabase functions deploy recruit-notify`，以及因改了白名单要重新部署 `email-dispatch`；再部署 `supabase functions deploy recruit-apply --no-verify-jwt`（公开入口，申请人没有登录态，必须关 JWT 校验）。优化第一批改了 `recruit-apply`（投递确认信）与 `recruit-notify`（录用邮件带面试时间），这两个都要重新部署；`email-dispatch` 本身没改，不用重部署。
3. 等 GitHub Pages 部署成功后，打开 `https://qianzhi.pw/#/jobs` 核对：11 个职位都在、董事长显示招 1 人；后台 `admin.qianzhi.pw` 里「招聘管理」页签能点开。
4. 真机验收（登录态 / 游客态）：投一份测试申请 → 后台通过 → 查 QQ 邮箱是否收到录用通知；再投一份到已满的职位应为“已满”不可报名。

## 关闭时间

- 关闭时间存在 `site_settings` 的一行（key `recruit_close_at`，值是 UTC 的 ISO 时间字符串），不新建表。管理员设定走新 RPC `admin_set_recruit_close_at(close_at)`（超管；传 null 删行、重新开放），返回设定后的值。
- 公开读走新 RPC `public_recruit_close_at()`（匿名可读；没设或值非法返回 null）。前台 `/jobs` 未到时间时显示“报名截止：X月X日 HH:mm（北京时间）”，到了时间显示“招聘已结束”横幅、卡片置灰；`/jobs/:id` 到了时间表单禁用；`/jobs/status` 不受影响。
- 服务端强制执行：`recruit-apply` 在查职位之后、头像校验之前读 `site_settings` 的关闭时间，到了时间直接拒绝（reason `recruit closed`），不靠前端拦。
- 上线步骤补充：跑迁移 `20261128180000_recruit_close_schedule.sql`，重新部署 `recruit-apply --no-verify-jwt`（改了关闭判断）。

## 申请新增岗位

- 招聘页（`/jobs`）横幅下方有「+ 申请新增岗位」按钮（招聘已结束时不显示），游客不用登录就能点。点开站内弹窗表单：岗位名称（必填）、部门（选填，留空为“综合”）、薪资范围（选填，如“6000–9000”，留空为面议）、岗位描述（选填）、QQ 邮箱（必填，格式校验照应聘流程）。
- 后端（迁移 `20261128193000_recruit_position_requests.sql`）：新表 `recruit_position_requests`（岗位名、部门、薪资、描述、申请人邮箱、状态 pending/approved/rejected、管理员备注、创建时间、审核时间、通过后建出的职位 id），不对客户端开放；三个 SECURITY DEFINER 函数（`search_path = ''`）：
  - `submit_recruit_position_request()`（公开）：同名岗位已在职位表里、或同名申请还在待审，直接拒绝（`position exists` / `already requested`）。
  - `admin_list_recruit_position_requests(status)`（仅超管，非超管返回空）。
  - `admin_review_recruit_position_request(id, status, note)`（仅超管）：通过时在 `recruit_positions` 里新建该职位（名额默认 1 人，开放招聘，排序排到最后），并把新职位 id 记回申请；驳回只改状态与备注。已审核过的不能再审。
- 后台「招聘管理」页新增「新增岗位申请」区：按状态筛选；待审的每条可 通过（站内确认框，通过后显示“已加上”，并给前台职位链接）/ 驳回（站内输入框填备注）；已审核过的也列出来（标状态）。
- 上线步骤补充：跑迁移 `20261128193000_recruit_position_requests.sql`；不用部署 Edge Function（纯 RPC）。迁移跑完后在 `/jobs` 点按钮提交一份测试申请（测试岗位名 + 测试 QQ 邮箱）→ 后台审核通过 → 职位列表里出现该职位，测试职位与测试申请验完删干净。

## 现任团队

- 招聘页（`/jobs`）职位列表下方新增「现任团队」区，静态展示 12 人名单（董事长王瑞、总经理刘俊威、人事经理谢铭辛、财务经理陈泽洋、股东苟龙翔、主管何达、秘书何皓然、保安李柯、保安严浩溢、女优李炫宇、男优米乔睿、摄影师袁梓航），每人一张卡片（职位 + 姓名）。名单由用户 2026-11-28 直接提供，顺序照用户给的来。
- 纯前端改动（`src/pages/Jobs.tsx` + `src/pages/Jobs.css`），不改 11 个招聘职位、不改名额、不动后端、不用新迁移。

## 职位已入职标注（任职人存在库里，后台可改）

- 以下 5 个职位已有任职人员，任职人存在 `recruit_positions.holder_names` 里（迁移 `20261128200000_recruit_position_holders.sql` 加的列并 seed）：董事长—王瑞、总经理—刘俊威、人事经理—谢铭辛、财务总监—陈泽洋、保安—李柯、严浩溢。后台「招聘管理」→ 各职位「编辑」→“任职人”字段可改（多个名字用顿号隔开，留空表示暂无任职人员），保存后前台与剩余名额立刻跟着变。
- 任职人算进名额：已占 = 已通过申请数 + 任职人数；剩余 = 名额 − 已占（最小为 0）。这 5 个职位任职人数已等于名额，剩余都是 0：招聘页（`/jobs`）卡片置灰、显示“已入职：姓名”、CTA 为不可点的“已满员”；顶部“在招 N 个职位”与后台统计的“开放”数都只计仍有名额的职位；详情页（`/jobs/:id`）不再显示申请表单，改显示“该职位已有任职人员，不再接受申请”加任职人姓名。绕过前端直接调提交接口也会被服务端以 `position full` 拒绝。任职人没占满名额的职位（如名额 2 只填 1 个任职人）仍可报名，前台显示“已入职：姓名”与剩余名额。
- 注意：用户名单里写的是“财务经理”，招聘页的职位名叫“财务总监”，是同一个财务负责人职位，seed 时按“财务总监”写。2026-11-28 下午生产库里多了一个“男优”（团播，名额 3 人），在招数随之从 6 变成 7（会计、技术总监、前端工程师、后端工程师、运营专员、保洁员、男优）。
- 上线步骤补充：跑迁移 `20261128200000_recruit_position_holders.sql`；不用部署 Edge Function（纯 RPC）。迁移跑完后在 `/jobs` 核对 5 张满员卡片与后台各职位行的“还剩 0”；再用一个满员职位（如董事长）提交测试申请应被服务端拒绝（前台点不进去，绕接口调 RPC 应报 `position full`）。

## 招聘页点按与动效（2026-11-28）

- 点按修好（`src/pages/Jobs.tsx` + `src/pages/Jobs.css`，纯前端，无迁移）：整张职位卡片可点，点空白处直接进详情（收藏/分享/标题/按钮本身的行为不变）；导航药丸、收藏/分享、查看并应聘、弹窗关闭、详情页返回链接等点击区都放大到 44px 高（DESIGN.md §7 约 44px）；卡片、导航、弹窗关闭都有按压回缩反馈。
- 动效加上（DESIGN.md §6 的时长范围，`prefers-reduced-motion` 下全关）：新增岗位弹窗遮罩淡入 + 卡片上滑入场；提示条（toast）上滑淡入；点亮收藏时星星弹一下；列表页横幅与工具栏进场轻微浮现；筛选 chip 出现时淡入。卡片原有的阶梯浮现不动。
