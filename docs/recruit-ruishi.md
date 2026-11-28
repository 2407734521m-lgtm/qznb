# 瑞氏集团有限公司招聘（/jobs）

公开招聘页挂在主站 `qianzhi.pw` 上，游客不用登录就能看职位、应聘、查进度；
超管在管理后台「招聘管理」页签里审核，通过后发录用通知邮件到应聘者的 QQ 邮箱。

流程借 GitHub 上 YuLin-Coder 的 No85OnlineJobRecruitmentManagementSystem
（三角色：管理员发职位、用户投简历、招聘人员看简历点通过/不通过、发通知），
在本站 React + TypeScript + Vite + Supabase 技术栈里重新实现，不跑原项目的 Java/JSP/MySQL。

## 公开页面

- `/jobs` 职位列表：搜索框、部门筛选（站内 OptionSheet）、每张卡显示招几人 / 已招几人；满员显示“已满”，点进去也不能报名。
- `/jobs/:id` 职位详情 + 申请表单：姓名、QQ 邮箱（必填，格式校验）、手机号、自我介绍、工作经历。提交走服务端 `recruit-apply` 函数（见下“QQ 头像校验”），成功后显示“已提交，待审核”。
- `/jobs/status` 凭 QQ 邮箱查自己的申请进度；状态是“未通过”时显示原因（`admin_note`）。

未登录游客打开 `/jobs` 时 App.tsx 有单独的公开分支，直接渲染招聘路由，不经过登录页；
维护模式开启时仍显示维护页。已登录成员走正常站内路由。

## 后台（仅 super_admin）

管理后台「内容运营」分组下的「招聘管理」页签：

- 统计：职位总数 / 开放中 / 申请总数 / 待审核 / 已通过 / 未通过，各职位招录情况。
- 申请列表：按职位与状态筛选；通过 / 驳回（可填备注）；通过后自动发录用通知邮件，失败可重发；驳回后可手动发婉拒邮件。
- 职位管理：新增 / 编辑 / 关闭职位、改名额、改薪资与描述。

## 数据库（迁移 20261128140000_recruit_ruishi.sql）

- `recruit_positions`：职位（名称、部门、名额 quota、薪资范围、描述、要求、是否开放、排序）。初始 11 个职位（董事长 1、总经理 1、人事经理 1、财务总监 1、会计 2、技术总监 1、前端工程师 1、后端工程师 1、运营专员 2、保洁员 2、保安 2），表空时才播种。
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
