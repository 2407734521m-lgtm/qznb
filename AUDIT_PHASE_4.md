# 第 4 阶段审计报告：管理员后台

- 审计日期：2026-11-21
- 审计基线：启动时 `main` HEAD `706514a`（第 3 阶段 FIX-3 PR #761 已合并）；审计过程中 `origin/main` 前进到 `2bcde30`（只改 `radio/public/download.html`，后台文件未动），三线底稿均以 `2bcde30` 为准并注明。
- 修复基线：`origin/main` HEAD `e11ada5`（并行线 PR #764 后台动画铺全站 + 音乐下载代理改动已合并，与本修复无关；rebase 无冲突）。
- 生产 Supabase 项目：`ldypnxxxgscibopgiaso`（`class-youth-archive2`）；旧项目 `wnddwkdfndrkxivvrxcy` 已 INACTIVE，未用。
- 审计方式：三条只读代码审计线 + 生产库只读核对（仅 `SELECT` / `pg_proc` / `pg_policies` / `pg_get_functiondef`，未读任何用户行数据）；未登录任何账号，未向真实用户发任何消息，未发测试邮件，未删真实用户数据，未清理生产 Storage；备份/恢复、版本发布、应用发布、批量邮件、批量通知等生产写操作只核对入口与调用链，未实际执行。

## 0. 计数

| 状态 | 数量 |
|---|---|
| PASS | 0 |
| PARTIAL | 81 |
| FAIL | 7 |
| BLOCKED | 175 |
| NOT_IMPLEMENTED | 5 |
| NOT_TESTED | 0 |
| 合计 | 268 |

分线计数：A 线运营总览 62 项（PARTIAL 6、FAIL 2、BLOCKED 53、NOT_IMPLEMENTED 1）；B 线成员与内容 118 项（PARTIAL 12、FAIL 4、BLOCKED 98、NOT_IMPLEMENTED 4）；C 线沟通与安全 88 项（PARTIAL 63、FAIL 1、BLOCKED 24）。三线底稿计数均已用脚本逐行核对，与逐项表行数一致。

PASS 为 0 是如实结果：本阶段全部功能都挂在 `AdminShell` 内，无管理员账号可登录验证，代码完整也不算 PASS。175 项 BLOCKED 均为无可登录管理员测试账号，待管理员登录态回归实测。

## 1. 分线结论

### A 线：运营总览类（全局 / 总览 / 数据分析 / 备份与恢复 / 版本发布 / 应用管理 / 日志管理 / 测试工具）

底稿：`audit-phase4-work/admin-ops-audit.md`（62 项）

- 总览五步重做后的页面结构完整；数据分析、备份、版本发布、应用管理、日志、测试工具的代码入口与调用链齐全。
- 2 项 FAIL 均为代码已定论：A3 三个已注册页签（沟通中心 / 审核中心 / 音乐下载记录）在 `TABS_ALL` 但不在 `NAV_GROUPS`，且全仓无任何 `go()` 调用点——从任何地方都点不开；「全站通知中心」按钮调 `go('notifications')`，但 `Admin.tsx` 无此分支，点后内容区空白。与 PR #712 海外视频入口翻车同款。A21 总览药丸「数据分析」「文件管理」指向超管页签，但 `Overview` 未接 `isSuper`、药丸无权限判断，普通管理员点后内容区空白；顶栏设置齿轮同样直通 `settings`。
- 6 项 PARTIAL：数据分析无运行指标；恢复点只有登记记录、无可恢复的点；「创建备份」实为人工登记（Free 套餐无自动备份，页面文案已诚实说明）；连通性检查用 `HEAD` + `no-cors`，404 也判「能连上」；日志页硬上限 100 条、无分页/刷新、查询失败静默显「暂无记录」（已修 FIX-4-6）；测试账号邮箱无格式校验（已修 FIX-4-6）。
- 1 项 NOT_IMPLEMENTED：版本发布页按设计就没有「发布版本」入口（只读 Actions 状态，发布走 GitHub 合并），文案已写明。
- 漂移：`site_settings` 与 `backup_logs` 在仓库 124 个迁移里无 `CREATE TABLE`、无策略定义，只在生产存在（已由 FIX-4-7 收敛）。

### B 线：成员与内容类（§6–13、§17–19）

底稿：`audit-phase4-work/admin-members-content-audit.md`（118 项）

- 账号管理、邀请码、内容审核、审核中心、表白墙、授权队列、歌声墙、下载记录、段位、公告、活动，代码层面基本齐全。
- 4 项 FAIL 均为代码已定论：B9-1 审核中心入口与 B13-1 音乐下载记录入口（`TABS_ALL` 注册、有渲染分支，但 `NAV_GROUPS` 里没有，界面上无任何入口）；B8-5 内容审核「匿名提问」子栏（按钮与数据加载都在，`setAnonymousQuestionHidden` 已定义，但 JSX 里没有任何 `sub === 'questions'` 的渲染分支，点开只剩搜索卡片）；B17-5 段位「撤销已审核」（`revoke()` 对 approved 行调 `review_game_profile(approve=false)`，但生产 RPC 只更新 `status='pending'` 的行，必抛错，全仓无第二条撤销路径）。
- 12 项 PARTIAL 主要是权限口径矛盾：§7 邀请码 8 项（清单标普通、TABS_ALL 非超管、`ic_sel` 允许 admin，但三个写 RPC 生产版只认 `super_admin`，列表与添加表单只对超管渲染；批量生成按钮却在门外，内容管理员点它静默得「已生成 0 个邀请码」）；§18 横幅 4 项（保存走 `site_settings` 直接 upsert，而 `ss_ins`/`ss_upd` 只允许 `super_admin`；另「移除图片」只清空输入框、不保存）。
- 4 项 NOT_IMPLEMENTED：审核中心没有「退回待审核」与「重新打开」（done 的反馈根本不加载）；内容审核回收站没有「彻底清理」批量按钮（两处清单功能在中心/回收站里缺失）。
- 漂移：`010`（set_joined 等三函数）、`009`（隐藏两函数）、`007`（表白墙）文件头都写「未执行」，但生产定义/策略与之一致；`create_invite_code` 等四个 RPC 在仓内没有任何 CREATE 定义，只有 015 的授权行（已由 FIX-4-7 收敛）。
- 生产库只读核对：20 个本线 RPC 全部存在且 SECURITY DEFINER；17 张表 RLS 全开；`my_role()` 含二级密码降级，当前无资料行账号为 0。

### C 线：沟通与安全类（管理员登录 / 批量邮件 / 沟通中心 / 反馈 / 账户安全 / 安全防护 / 审批 / 安全与监控 / 游客 / 全站设置）

底稿：`audit-phase4-work/admin-comms-security-audit.md`（88 项）

- 63 项 PARTIAL 是三线中比例最高的：绝大多数功能代码齐全，但都挂在管理员登录态后，只能记 PARTIAL 或 BLOCKED。
- 1 项 FAIL：C63 安全与监控页「全站通知中心」入口是死链（`AdminSystemCenter.tsx:537` 调 `go('notifications')`，但 `Admin.tsx` 的 TABS_ALL 与渲染区均无 `notifications`；`switchTab` 不校验 id，点后内容区空白）。
- 服务端已证实的安全行为（生产函数定义逐行核对）：二级密码 5 次失败/15 分钟窗口 → 锁 15 分钟；正确验证写 8 小时有效会话；改密码时服务端验旧密码、弱码双重拦截、bcrypt(12)、删除其他会话的授权行；审批 `admin_decide_sensitive_action` 服务端拦本人审批、验 pending 与过期；登录失败统计写 `login_private.auth_login_failure_rollups`，按分钟桶聚合、单桶上限 500、保留 30 天；反馈更新只走 `admin_update_feedback` RPC（生产无 UPDATE 策略，与仓库迁移一致，非漂移）。
- 关键可疑点：S2 站内通知列表受生产 `nt_sel`（仅本人）限制，管理员只能看到自己的通知，看不到全站通知；S3 定向消息「仅超管」是纯前端限制，生产 `admin_send_member_message` 只验 `my_role() in ('admin','super_admin')`，普通管理员直连 RPC 即可绕过；S4 健康检查的 notify 探针在前端硬编码 `sb_publishable_4dNtXkAYz6Q2KE0hZdZyKw_vF7b9T5q` 并以 401 判正常，第 2 阶段已怀疑该 key 属旧项目，若属实则探针恒报「正常」，属假阳性；S6 生产缺 `guest_show_love_wall` / `guest_show_announcements` / `guest_schedule` 三行，界面用组件默认值兜底显示「已开启」，与第 1 阶段游客配置 fail-open 同源；S7 生产 `site_subtitle` 仍为废弃品牌副标题「连接人与内容」；S8 `admin-bulk-email` / `maintenance-notify` 无 CI 部署步骤，线上版本无法核对。
- 本线范围无新增仓库/生产漂移；23 个 RPC 全部存在且签名与前端调用一致。

## 2. 生产库只读核对（本阶段）

- A 线：16 个函数全部存在；8 张表全部存在且 RLS 已开；待办红点 5 张表、审计日志、备份记录的 RLS 表达式均已核对，与管理员可读的预期一致。
- B 线：20 个 RPC 全部存在且 SECURITY DEFINER；17 张表 RLS 全开；关键策略已逐条读过（`site_settings` 超管写、`profile_contacts` 仅本人读、`feedbacks` 超管删、`posts`/`comments` 无管理员 UPDATE 策略故隐藏走 RPC）。
- C 线：23 个 RPC 全部存在且签名与前端调用一致；二级密码、审批、登录失败统计、反馈更新等服务端行为已逐行核对函数定义。

## 3. 逐项状态总表（268 项，证据见各线底稿）

| 编号 | 功能 | 状态 |
|---|---|---|
| A1 | 展开/收起导航 | BLOCKED |
| A2 | 移动端菜单开关 | BLOCKED |
| A3 | 点菜单切换 | FAIL |
| A4 | 搜功能 | BLOCKED |
| A5 | Ctrl+K | BLOCKED |
| A6 | 上下键选 | BLOCKED |
| A7 | 回车打开 | BLOCKED |
| A8 | 收藏/取消常用 | BLOCKED |
| A9 | 待处理数 | BLOCKED |
| A10 | 成功/失败提示及关闭 | BLOCKED |
| A11 | 退出管理员账号 | BLOCKED |
| A12 | 概况 | BLOCKED |
| A13 | 待处理 | BLOCKED |
| A14 | 客户端分布 | BLOCKED |
| A15 | 最近加入 | BLOCKED |
| A16 | 30 天趋势 | BLOCKED |
| A17 | 实时运行 | BLOCKED |
| A18 | 最近活动 | BLOCKED |
| A19 | 刷新/重载 | BLOCKED |
| A20 | 看全部日志 | BLOCKED |
| A21 | 进相关模块（药丸） | FAIL |
| A22 | 成员活跃 | BLOCKED |
| A23 | 内容增长 | BLOCKED |
| A24 | 运行指标 | PARTIAL |
| A25 | 日期范围/天数切换 | BLOCKED |
| A26 | 刷新 | BLOCKED |
| A27 | 备份任务 | BLOCKED |
| A28 | 恢复点 | PARTIAL |
| A29 | 创建/记录备份 | PARTIAL |
| A30 | 选范围 | BLOCKED |
| A31 | 打开数据库备份页 | BLOCKED |
| A32 | 打开 Storage 分桶页 | BLOCKED |
| A33 | 当前构建提交 | BLOCKED |
| A34 | 部署详情 | BLOCKED |
| A35 | 发布版本 | NOT_IMPLEMENTED |
| A36 | 部署状态 | BLOCKED |
| A37 | 打开 GitHub Actions | BLOCKED |
| A38 | 刷新 | BLOCKED |
| A39 | 线上状态 | BLOCKED |
| A40 | 刷新 | BLOCKED |
| A41 | 连通性检查 | PARTIAL |
| A42 | 现有版本 | BLOCKED |
| A43 | 填新版本/版本号/说明/下载地址 | BLOCKED |
| A44 | 发布移动端版本 | BLOCKED |
| A45 | 更新弹窗预览 | BLOCKED |
| A46 | 复制下载链接 | BLOCKED |
| A47 | 是否强制更新 | BLOCKED |
| A48 | 管理普通版/管理版 | BLOCKED |
| A49 | 看管理版发布历史 | BLOCKED |
| A50 | 软件成员与平台分布、筛选 | BLOCKED |
| A51 | 软件公告发布/撤下与记录、学生版发布历史 | BLOCKED |
| A52 | 看操作日志 | BLOCKED |
| A53 | 看数量 | BLOCKED |
| A54 | 按类型筛 | BLOCKED |
| A55 | 看全部日志 | PARTIAL |
| A56 | 添加测试账号资料 | BLOCKED |
| A57 | 设标签/邮箱 | PARTIAL |
| A58 | 保存 | BLOCKED |
| A59 | 切换测试账号 | BLOCKED |
| A60 | 临时输入密码 | BLOCKED |
| A61 | 删除测试账号资料 | BLOCKED |
| A62 | 取消切换 | BLOCKED |
| B6-1 | 搜成员（用户名/展示名/真实姓名/邮箱/账号 ID） | BLOCKED |
| B6-2 | 按状态筛（全部/正常/已禁用） | BLOCKED |
| B6-3 | 按角色筛 | BLOCKED |
| B6-4 | 导出当前筛选 CSV | BLOCKED |
| B6-5 | 导出已选 CSV | BLOCKED |
| B6-6 | 选择本页 / 选择筛选结果 | BLOCKED |
| B6-7 | 清空选择 | BLOCKED |
| B6-8 | 批量恢复 / 暂停权限 | BLOCKED |
| B6-9 | 给指定成员发消息 | BLOCKED |
| B6-10 | 单独弹窗 | BLOCKED |
| B6-11 | 打开纪律管理 | BLOCKED |
| B6-12 | 看档案（成员详情） | BLOCKED |
| B6-13 | 看活动记录 | BLOCKED |
| B6-14 | 复制账号 ID | BLOCKED |
| B6-15 | 改账号状态（单条暂停/恢复） | BLOCKED |
| B6-16 | 删除账号 | BLOCKED |
| B6-17 | 上下页 | BLOCKED |
| B6-18 | 改成员显示名（模板主项：改名 → 接口/数据库 → 前台刷新是否显示 → 无权限账号是否被拦） | BLOCKED |
| B6-19 | 改成员真实姓名 | NOT_IMPLEMENTED |
| B7-1 | 查看邀请码列表 | PARTIAL |
| B7-2 | 批量生成 10 个 | PARTIAL |
| B7-3 | 批量生成 20 个 | PARTIAL |
| B7-4 | 批量生成 50 个 | PARTIAL |
| B7-5 | 添加邀请码 | PARTIAL |
| B7-6 | 启用邀请码 | PARTIAL |
| B7-7 | 禁用 / 停用邀请码 | PARTIAL |
| B7-8 | 删除邀请码 | PARTIAL |
| B8-1 | 举报子栏 | BLOCKED |
| B8-2 | 帖子子栏 | BLOCKED |
| B8-3 | 评论子栏 | BLOCKED |
| B8-4 | 回收站子栏 | BLOCKED |
| B8-5 | 匿名提问子栏 | FAIL |
| B8-6 | 看举报 | BLOCKED |
| B8-7 | 看帖子 | BLOCKED |
| B8-8 | 看评论 | BLOCKED |
| B8-9 | 看已隐藏 | BLOCKED |
| B8-10 | 看回收站 | BLOCKED |
| B8-11 | 筛内容状态 | BLOCKED |
| B8-12 | 筛举报状态 | BLOCKED |
| B8-13 | 选当前筛选全部 | BLOCKED |
| B8-14 | 清空选择 | BLOCKED |
| B8-15 | 批量隐藏帖子 | BLOCKED |
| B8-16 | 批量恢复帖子 | BLOCKED |
| B8-17 | 批量隐藏评论 | BLOCKED |
| B8-18 | 批量恢复评论 | BLOCKED |
| B8-19 | 标记举报已处理 | BLOCKED |
| B8-20 | 驳回举报 | BLOCKED |
| B8-21 | 恢复帖子（单条） | BLOCKED |
| B8-22 | 隐藏帖子（单条） | BLOCKED |
| B8-23 | 彻底删除帖子 | BLOCKED |
| B8-24 | 恢复评论（单条） | BLOCKED |
| B8-25 | 隐藏评论（单条） | BLOCKED |
| B8-26 | 彻底删除评论 | BLOCKED |
| B8-27 | 恢复公告 | BLOCKED |
| B8-28 | 彻底清理回收站 | NOT_IMPLEMENTED |
| B8-29 | 刷新 | BLOCKED |
| B9-1 | 审核中心入口 | FAIL |
| B9-2 | 歌声墙队列 | BLOCKED |
| B9-3 | 表白墙队列 | BLOCKED |
| B9-4 | 游戏段位队列 | BLOCKED |
| B9-5 | 举报队列 | BLOCKED |
| B9-6 | 反馈队列 | BLOCKED |
| B9-7 | 待审核数 | BLOCKED |
| B9-8 | 切换状态（筛选片） | BLOCKED |
| B9-9 | 通过（段位/歌声） | BLOCKED |
| B9-10 | 通过并发布（表白） | BLOCKED |
| B9-11 | 拒绝（表白/歌声） | BLOCKED |
| B9-12 | 驳回（段位/举报） | BLOCKED |
| B9-13 | 退回待审核 | NOT_IMPLEMENTED |
| B9-14 | 标记举报已处理 | BLOCKED |
| B9-15 | 驳回举报 | BLOCKED |
| B9-16 | 看反馈 | BLOCKED |
| B9-17 | 开始处理（反馈） | BLOCKED |
| B9-18 | 标记已处理（反馈） | BLOCKED |
| B9-19 | 重新打开（反馈） | NOT_IMPLEMENTED |
| B9-20 | 站内私信回复成员 | BLOCKED |
| B9-21 | 删除反馈 | BLOCKED |
| B10-1 | 看投稿 | BLOCKED |
| B10-2 | 切换筛选 | BLOCKED |
| B10-3 | 刷新 | BLOCKED |
| B10-4 | 通过并发布 | BLOCKED |
| B10-5 | 隐藏 | BLOCKED |
| B10-6 | 拒绝 | BLOCKED |
| B10-7 | 退回待审核 | BLOCKED |
| B11-1 | 看队列 | BLOCKED |
| B11-2 | 刷新 | BLOCKED |
| B11-3 | 标记未找到 | BLOCKED |
| B11-4 | 递补处理 | BLOCKED |
| B11-5 | 标记完成 | BLOCKED |
| B12-1 | 看音频投稿 | BLOCKED |
| B12-2 | 按状态筛 | BLOCKED |
| B12-3 | 通过 | BLOCKED |
| B12-4 | 隐藏 | BLOCKED |
| B12-5 | 拒绝 | BLOCKED |
| B12-6 | 退回待审核 | BLOCKED |
| B13-1 | 音乐下载记录入口 | FAIL |
| B13-2 | 看记录 | BLOCKED |
| B13-3 | 按条件筛 | BLOCKED |
| B13-4 | 刷新 | BLOCKED |
| B17-1 | 看游戏资料 | BLOCKED |
| B17-2 | 审核段位 | BLOCKED |
| B17-3 | 通过 | BLOCKED |
| B17-4 | 驳回 | BLOCKED |
| B17-5 | 撤销已审核 | FAIL |
| B18-1 | 设首页 16:9 横幅（文字 + 图片地址） | PARTIAL |
| B18-2 | 上传横幅 | PARTIAL |
| B18-3 | 保存横幅 | PARTIAL |
| B18-4 | 移除横幅 | PARTIAL |
| B18-5 | 发布公告 | BLOCKED |
| B18-6 | 全体可见（发布时） | BLOCKED |
| B18-7 | 仅软件版可见（发布时） | BLOCKED |
| B18-8 | 置顶 | BLOCKED |
| B18-9 | 循环切换弹窗展示 | BLOCKED |
| B18-10 | 切换受众 | BLOCKED |
| B18-11 | 撤下公告 | BLOCKED |
| B19-1 | 看活动 | BLOCKED |
| B19-2 | 发布活动 | BLOCKED |
| B19-3 | 删除活动 | BLOCKED |
| C1 | 账号密码登录（用户名/QQ 邮箱） | PARTIAL |
| C2 | 显示/隐藏密码 | PARTIAL |
| C3 | 首次设置 6 位二级密码 | PARTIAL |
| C4 | 二次确认（两次输入一致） | PARTIAL |
| C5 | 后续输二级密码验证（满 6 位自动提交） | PARTIAL |
| C6 | 返回主站 | PARTIAL |
| C7 | 登录失败统计 | PARTIAL |
| C8 | 失败提示 | PARTIAL |
| C9 | 二级密码错锁定 | PARTIAL |
| C10 | 20 分钟无操作自动退出 | PARTIAL |
| C11 | 选接收账号 | PARTIAL |
| C12 | 看已选数 | PARTIAL |
| C13 | 确认发送对象（两次点确认） | PARTIAL |
| C14 | 发送 | BLOCKED |
| C15 | 看进度 | PARTIAL |
| C16 | 看最近发送记录 | PARTIAL |
| C17 | 刷新发送历史 | PARTIAL |
| C18 | 打开不同栏目 | PARTIAL |
| C19 | 搜目标成员 | PARTIAL |
| C20 | 选当前筛选成员 / 清空 | PARTIAL |
| C21 | 编写成员消息 | PARTIAL |
| C22 | 向指定成员发站内消息 | BLOCKED |
| C23 | 定向消息（超管限定） | PARTIAL |
| C24 | 弹窗广播（六种类型） | PARTIAL |
| C25 | 预约发布 | PARTIAL |
| C26 | 触达记录管理 | PARTIAL |
| C27 | 看站内通知列表 | PARTIAL |
| C28 | 发站内通知 | BLOCKED |
| C29 | 看反馈 | PARTIAL |
| C30 | 筛状态 | PARTIAL |
| C31 | 刷新 | PARTIAL |
| C32 | 保存处理状态（保存说明并通知） | PARTIAL |
| C33 | 开始处理 | PARTIAL |
| C34 | 标记已完成 | PARTIAL |
| C35 | 重新打开 | PARTIAL |
| C36 | 站内私信回复 | BLOCKED |
| C37 | 删除反馈 | PARTIAL |
| C38 | 看二级密码状态 | PARTIAL |
| C39 | 改二级密码 | PARTIAL |
| C40 | 重载安全状态 | PARTIAL |
| C41 | 登录异常监控 | PARTIAL |
| C42 | 当前管理员会话 | PARTIAL |
| C43 | 管理员登录设备 | PARTIAL |
| C44 | 管理员操作审计 | PARTIAL |
| C45 | 看当前/其他设备会话 | PARTIAL |
| C46 | 退出当前设备 | BLOCKED |
| C47 | 退出其他设备 | BLOCKED |
| C48 | 刷新会话 | PARTIAL |
| C49 | 看待审批 | PARTIAL |
| C50 | 看最近审批记录 | PARTIAL |
| C51 | 切换待审批/全部筛选 | PARTIAL |
| C52 | 批准 | BLOCKED |
| C53 | 拒绝 | BLOCKED |
| C54 | 系统诊断 | PARTIAL |
| C55 | 运行状态 | PARTIAL |
| C56 | 导出巡检报告 | PARTIAL |
| C57 | 看完整审计日志 | PARTIAL |
| C58 | 维护计划入口 | PARTIAL |
| C59 | 临时通行码入口 | PARTIAL |
| C60 | 打开操作日志 | PARTIAL |
| C61 | 账号与会话管理入口 | PARTIAL |
| C62 | 内容审核入口 | PARTIAL |
| C63 | 全站通知中心入口 | FAIL |
| C64 | 全站设置入口 | PARTIAL |
| C65 | 管理员操作日志入口 | PARTIAL |
| C66 | 导出成员数据 | PARTIAL |
| C67 | 开启/关闭游客浏览 | BLOCKED |
| C68 | 设游客会话有效期 | BLOCKED |
| C69 | 设游客开放计划 | BLOCKED |
| C70 | 保存/取消定时计划 | BLOCKED |
| C71 | 撤销游客会话 | BLOCKED |
| C72 | 控制游客入口是否显示 | BLOCKED |
| C73 | 改网站标题并保存 | PARTIAL |
| C74 | 改副标题并保存 | PARTIAL |
| C75 | 邀请码注册要求开关 | BLOCKED |
| C76 | 关闭/开启登录入口 | BLOCKED |
| C77 | 跳过登录页设置 | BLOCKED |
| C78 | 维护模式开关 | BLOCKED |
| C79 | 改维护页标题并保存 | PARTIAL |
| C80 | 改维护页提示内容并保存 | PARTIAL |
| C81 | 临时通行码开关 | BLOCKED |
| C82 | 设维护计划 | BLOCKED |
| C83 | 保存/取消维护计划 | BLOCKED |
| C84 | 发网站恢复邮件通知 | BLOCKED |
| C85 | 全站功能开关中心 | BLOCKED |
| C86 | 切换独立功能开关 | BLOCKED |
| C87 | 健康检查（开始系统检查） | PARTIAL |
| C88 | 导出数据库数据与文件清单 | PARTIAL |

## 4. 修复清单（FIX-4，7 项）

| 编号 | 问题 | 严重程度 | 修复内容 | 状态 |
|---|---|---|---|---|
| FIX-4-1 | 三个已注册页签无入口；「全站通知中心」按钮通向空白页 | 高 | NAV_GROUPS「内容运营」加 reviewCenter、musicDownloads，「消息与反馈」加 communication（+ 图标 + 描述）；Admin.tsx 加 notifications 页签（TABS_ALL + 渲染分支，渲染现成的 AdminNotificationCenter）并同样进 NAV_GROUPS；NAV_GROUPS 里的死 id `broadcast` 未动（会被过滤，无可见影响） | 已修复，管理员登录态待验证 |
| FIX-4-2 | 总览药丸与顶栏齿轮对普通管理员是死路 | 高 | 两层：① Overview 接 isSuper，超管专属药丸（数据分析、文件管理）与入门指南「成员与权限」项对内容管理员隐藏，进度按可见项算；顶栏设置齿轮只对超管渲染。② Admin.tsx 的 switchTab（所有入口的唯一切页点）拦不存在的 id 与无权访问的超管页签，被拦时留当前页并 toast 提示；渲染层再加兜底，当前页签不可达时显示「需要超级管理员权限…」/「这个管理功能不存在…」提示卡而不是空白 | 已修复，管理员登录态待验证 |
| FIX-4-3 | 内容审核「匿名提问」子栏是死标签 | 高 | Moderate.tsx 补 `sub === 'questions'` 渲染分支，照帖子/评论卡片样式渲染列表（提问、回答、提问者→被问者、状态、公开/隐藏），接通已有的 setAnonymousQuestionHidden 做隐藏/恢复；搜索过滤一并接通 | 已修复，管理员登录态待验证 |
| FIX-4-4 | 游戏段位「撤销已审核」必定失败 | 高 | 选了前端修法，没动生产函数：实测 review_game_profile 除了改状态什么都不做（无审计、无通知），且 gp_admin 是 ALL 策略、管理员可直接写 game_profiles。revoke() 改为直接 update（status='pending' + updated_at，限 status='approved' 的行，.select().maybeSingle() 验 0 行时报错），alog('game_revoke') 保留 | 已修复，管理员登录态待验证 |
| FIX-4-5 | 四处 RPC 旧式 NULL-role 写法 | 中 | 四个函数 admin_member_moderation / admin_apply_member_moderation / admin_revoke_member_moderation / admin_member_activity 的守卫由 my_role() <> 'super_admin' 改成 (my_role() is null or my_role() <> 'super_admin')，与 010 的 IS NULL OR 写法一致；定义取自生产 pg_get_functiondef，脚本核对过每函数只改 1 行、其余逐字保留 | 已应用到生产并回读核对（四函数定义与应用前逐行 diff，每函数恰好只改守卫那 1 行） |
| FIX-4-6 | 五处小修 | 低 | BoardMgr「移除图片」改为清空后立即调已有 saveBanner('')；AdminMusicDownloads「刷新」由 window.location.reload() 改为重拉查询（保留筛选与滚动）；AdminLoveWall / AdminSongWall 报错文案里的「007_love_wall.sql / 010_song_wall.sql 是否已执行」改为「请检查管理员数据库权限」；Logs 的 .then 改 async/await 并加失败文案；TestTab 测试账号邮箱加 isQQEmail 校验（站内 lib/validate.ts 的 QQ 邮箱口径） | 已修复，管理员登录态待验证 |
| FIX-4-7 | 仓库与生产库漂移收敛（part 3） | 中 | 新增幂等迁移 `20261121094500_audit_phase4_drift_convergence.sql`：site_settings / backup_logs 建表 + RLS + 5 条策略（表达式与角色均为生产实测原文，ss_sel 保持 using (true) 未动）；create_invite_code / set_invite_code_active / delete_invite_code / review_game_profile 四个 RPC 的定义逐字收录（生产 pg_get_functiondef 实测） | 已应用到生产并回读核对（site_settings / backup_logs 策略仍恰好 5 条，表达式与应用前一致；四个 RPC 定义与应用前一致） |

验证：worktree 内 `npm run typecheck` / `npm run build` / `npm run check:styles` / `npm run check:admin-styles` 全部通过（主代理独立复跑 typecheck + build 通过）。两处迁移均已应用，`schema_migrations` 记入 version `20261121012104`（name `audit_phase4_null_role_guard`）与 `20261121012108`（name `audit_phase4_drift_convergence`）；回读确认四函数每函数恰好只改守卫 1 行、策略仍 5 条，生产无非预期变化。

## 5. 未修项（产品决策待定或需真机验证）

- **权限口径类，需用户定夺**：邀请码到底归普通管理员还是只归超管（B S4：清单标普通、RPC 只认超管、批量按钮在门外）；公告横幅保存归超管还是放宽策略/改走 RPC（B S5）；admin_update_profile 是否加「禁改超管目标」限制（B S6，010 已列为待用户定）；site_settings 的 ss_sel=true 是否收紧为管理员可读（A S3，收紧前注意 main.tsx 标题读与主站若干读 site_settings 的地方是否依赖 ss_sel=true）；全站通知只见本人是否聚合 RPC 或放宽策略（C S2，涉隐私）；定向消息「仅超管」是否在服务端也验 super_admin（C S3）；健康检查探针 key 归属确认（C S4）。
- **产品决策类**：审核中心「退回待审核/重新打开」、内容审核回收站「彻底清理」批量按钮是否补（B S12）；数据分析运行指标、恢复点可恢复、备份自动生成、连通性检查口径、日志分页等是否做。
- **残留**：NAV_GROUPS 里无调用方的死 id `broadcast` 仍在（会被过滤，无可见影响）；`admin-bulk-email` / `maintenance-notify` 无 CI 部署步骤，线上版本无法核对（C S8）；全新环境重放迁移仍会在更早的迁移处失败（历史迁移引用顺序问题，第 3 阶段已记录）。
- **需管理员登录实测**：175 项 BLOCKED 的真实渲染、数据与时序（需超管与普通管理员两个账号分别实测）；其中应用发布、软件公告发布、备份登记三类不得用真实操作测试（会改生产配置、给真实成员发通知、写生产备份记录），只核对入口与调用链；S1/S2 的空白页表现需真机截图留证；390px 窄屏未验（云浏览器固定 1920 宽）。

## 6. 工作底稿

- `audit-phase4-work/admin-ops-audit.md`（A 线：62 项）
- `audit-phase4-work/admin-members-content-audit.md`（B 线：118 项）
- `audit-phase4-work/admin-comms-security-audit.md`（C 线：88 项）

## 7. 其他待办（跨阶段）

- L-03（第 2 阶段遗留）：注册页协议复选框初始状态仍未在线上核对到——云浏览器处于已登录态、且不允许为此退出登录；待用户在手机无痕/隐私标签下自行看一次注册页复选框初始状态后定论。
- 第 3 阶段遗留：时光胶囊 `tc_sel` 隐私缺口（正确修法是 RPC 只返元数据，需另立方案等用户定夺）；灵动岛全套保留还是彻底删除。
