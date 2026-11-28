# 瑞氏集团有限公司招聘（/jobs）

公开招聘页挂在主站 `qianzhi.pw` 上，游客不用登录就能看职位、应聘、查进度；
超管在管理后台「招聘管理」页签里审核，通过后发录用通知邮件到应聘者的 QQ 邮箱。

流程借 GitHub 上 YuLin-Coder 的 No85OnlineJobRecruitmentManagementSystem
（三角色：管理员发职位、用户投简历、招聘人员看简历点通过/不通过、发通知），
在本站 React + TypeScript + Vite + Supabase 技术栈里重新实现，不跑原项目的 Java/JSP/MySQL。

## 公开页面

- `/jobs` 职位列表：搜索框、部门筛选（站内 OptionSheet）、每张卡显示招几人 / 已招几人；满员显示“已满”，点进去也不能报名。
- `/jobs/:id` 职位详情 + 申请表单：姓名、QQ 邮箱（必填，格式校验）、手机号、自我介绍、工作经历。提交后显示“已提交，待审核”。
- `/jobs/status` 凭 QQ 邮箱查自己的申请进度。

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

## 邮件（复用站内 email-dispatch + Resend）

- 新 Edge Function `supabase/functions/recruit-notify`：只接受超管调用，读库里的申请与职位，按审核状态发录用通知或婉拒邮件，再经 `email-dispatch` 发出（事件 key `recruit:offer:<id>` / `recruit:rejection:<id>`，防重复发送），并回写 `email_sent_at` / `email_status`。
- `supabase/functions/email-dispatch/index.ts` 的类别与来源白名单里加了 `recruit_notice` / `recruit-notify`。
- 注意：发件人沿用现有链路的 `Class Memory <notice@qianzhi.pw>`，邮件正文落款是瑞氏集团有限公司人事部。如需把发件人改成瑞氏集团，要另外改 email-dispatch（会影响全站邮件）。

## 上线步骤（合并后按顺序做）

1. 合并 PR 后跑迁移：`supabase db push`（或在 Supabase 控制台执行迁移文件）。迁移只新增表与函数，不动现有数据。
2. 部署 Edge Function：`supabase functions deploy recruit-notify`，以及因改了白名单要重新部署 `email-dispatch`。
3. 等 GitHub Pages 部署成功后，打开 `https://qianzhi.pw/#/jobs` 核对：11 个职位都在、董事长显示招 1 人；后台 `admin.qianzhi.pw` 里「招聘管理」页签能点开。
4. 真机验收（登录态 / 游客态）：投一份测试申请 → 后台通过 → 查 QQ 邮箱是否收到录用通知；再投一份到已满的职位应为“已满”不可报名。
