# 第 2 阶段审计报告：用户账号与社交功能

- 审计日期：2026-11-21
- 审计基线：`main` 分支，HEAD `d0d7539`（第 1 阶段收尾，PR #756；期间主聊并行合入 #757，不影响本阶段基线）
- 审计方式：三条只读代码审计线（A 账号、B 内容互动、C 好友与私信）+ 生产库只读核对（`execute_sql`，仅结构与策略，未读任何用户行数据）+ 线上只读复核（L-03 注册协议复选框，见 §7）
- 修复基线：`origin/main` 452abff（#757），修复分支 `fix/audit-phase2-code`（独立 worktree，避开主聊并行线）

## 0. 结论速览

| 状态 | 数量 |
|---|---|
| PASS | 1 |
| PARTIAL | 13 |
| FAIL | 0 |
| BLOCKED | 106 |
| NOT_IMPLEMENTED | 10 |
| NOT_TESTED | 0 |
| 合计 | 130 |

计数口径与第 1 阶段一致：一行 = 一个可独立验证的功能点；代码已确认、线上未验证的不算 PASS；登录态才能验证的记 BLOCKED（本次无可登录的测试账号）；清单声称有、代码里没有的记 NOT_IMPLEMENTED。

分线计数：A 线账号 39 项（PASS 1、PARTIAL 11、BLOCKED 26、NOT_IMPLEMENTED 1）；B 线内容互动 39 项（PARTIAL 0、BLOCKED 33、NOT_IMPLEMENTED 6）；C 线好友与私信 52 项（PARTIAL 2、BLOCKED 47、NOT_IMPLEMENTED 3）。

> 计数核对：三线子代理汇报的总数与逐项表行数有出入（A 线报 40 项、表内 39 行；C 线报 47 项、表内 52 行），本报告的计数以逐项表行数为准，已用脚本逐行核对（A：BLOCKED 26 / PARTIAL 12 / NOT_IMPLEMENTED 1；B：BLOCKED 33 / NOT_IMPLEMENTED 6；C：BLOCKED 47 / PARTIAL 1 / FAIL 1 / NOT_IMPLEMENTED 3；修复后 A11 改记 PASS、D-06 改记 PARTIAL，FAIL 归零）。

**PASS 只有 1 项是如实结果**：登录态功能全部无法实测（BLOCKED 101 项占八成），能定论的只有代码级事实与已修复的死代码。本阶段最大的结构性发现不是单个功能坏掉，而是**仓库迁移历史与生产库大面积漂移**：reports 表、comments 的 UPDATE 策略、聊天核心四表、chat-media 桶放宽、profiles.phone 授权、show_game_id / game_id 两列都在生产库存在、仓库里缺失或落后。生产侧功能多半是通的，仓库侧重建不出来。已用一则幂等收敛迁移补齐其中可安全收敛的部分（FIX-2-12，生产回读核对无变化）。

## 1. 分线结论

### A 线：账号——注册、登录、退出、密码重置、邮箱验证、资料与个人主页、隐私设置

底稿：`audit-phase2-work/auth-profile-audit.md`（39 项）

- 注册/登录/找回密码的代码链路完整：QQ 邮箱登录、用户名登录（`username-login` Function，限流 + 防枚举）、注册验证码、QQ 头像导入、找回密码两套 UI、登录失败分类上报，Auth 配置已核对（邮箱验证开启、OTP 6 位/1 小时、未验证不可登录、回跳白名单含 qianzhi.pw、除邮箱外外部登录全关）。
- 确认的缺口（见 §2 可疑点 S1–S15）：信任设备 30 天与限流后登录链接在生产构建里关闭（仓库变量为空）；通行密钥只能注册不能登录；游戏 ID 无开关；退出作用域不一致；`nav('/login')` 死路由；第 11 个标签静默丢弃；`doReg` 死代码；两套改密 UI 不一致；设备页无其他设备列表；改密码不验旧密码。
- 第 1 阶段存疑 L-03（注册协议默认勾选）代码侧已解决：`policyAccepted` 初始 `false`，`sendCode`/`doReg` 开头有门禁；与第 1 阶段云浏览器“默认已勾选”的报告矛盾，待线上复核（§7）。

### B 线：内容互动——动态、日常、表白墙、匿名提问、第一印象投票、举报与屏蔽

底稿：`audit-phase2-work/feed-love-questions-audit.md`（39 项）+ `audit-phase2-work/db-checks-b-line.md`（生产库只读核对）

- 动态/日常/表白墙/提问箱/投票的代码链路完整：发布、点赞、评论、投票（PK 防重复 + 改票）、先发后审（新投稿直接 published）、匿名提问（限流 + 双向拉黑拒收 + 回答后不可编辑）、举报写入。
- 清单与代码不符（NOT_IMPLEMENTED 6 项）：表白墙无点赞；动态头像/名字点不开成员主页；按内容类型筛选不存在；动态评论、表白评论、公开回答均无举报入口；拉黑不隐藏对方内容（只断私聊与提问）。
- 生产库只读核对修正了两处代码级推断：`reports` 表真实存在（列与 rp_ins/rp_sel/rp_upd 三策略齐全，id 为 identity）；`comments` UPDATE 策略真实存在（comments_update_own + md_comments_update_guard）。举报与评论编辑在生产库结构上是通的，问题是仓库漂移，已由 FIX-2-12 收敛。

### C 线：好友与私信——好友系统、会话列表、聊天页、语音通话、媒体与权限

底稿：`audit-phase2-work/friends-chat-audit.md`（52 项）+ `audit-phase2-work/db-checks-c-line.md`（生产库只读核对）

- 好友/会话/聊天页代码齐全：找人、申请/接受/拒绝/撤回、拉黑、建群、会话筛选/搜索/未读/左滑隐藏、文字/图片/视频/文件/GIF/贴纸/语音、格式栏 11 项、特效、长按菜单、回应、编辑、撤回、转发、已读、输入中提示、消失的私信、聊天背景、共享内容、群聊管理、一对一语音通话（WebRTC + Realtime 信令）。
- 唯一确认的 FAIL 是群语音无入口（D-06）：Provider、LiveKit、token Function、浮层、灵动岛联动全齐，但全仓无任何调用方，`phase` 永远 idle。已接线（FIX-2-1），待登录验证。
- 生产库只读核对修正了桶矛盾推断：`chat-media` 桶生产配置是 50MB + 33 个 MIME（含视频/文档），与前端一致；仓库 006 仍是 15MB、仅图片+音频。视频/文件上传在 Storage 层放行，问题是仓库漂移，已由 FIX-2-12 收敛。核心聊天四表生产库都存在，仓库无建表语句（F-3，本次未补，见 §5）。
- `friend_requests` 表生产库不存在：好友申请存在 `friendships` 表里（带 status 状态机），以 C 线结论为准。

## 2. 可疑点汇总（按优先级，含修复状态）

| # | 问题 | 证据 | 修复状态 |
|---|---|---|---|
| S1 | 信任设备 30 天在生产构建里关闭：仓库 Actions Variables 为空，`VITE_USERNAME_TRUSTED_DEVICE_ENABLED` 展开为空，`trustedLoginAvailable` 恒 false；登录页复选框与 MeAccount 撤销卡片永不出现 | `Login.tsx:460-470`；`MeAccount.tsx:72`；`deploy.yml:19`；GitHub API 变量列表为空 | 未修：认证配置改动，需用户决策是否开启（只差一个仓库变量） |
| S2 | 限流后登录链接同样关闭：同一原因（`deploy.yml:20` 变量为空）；后端还有独立环境变量与邮箱归属证明两道门 | `Login.tsx:471-477`；`recovery.ts` | 未修，同 S1 |
| S3 | 通行密钥只能注册、不能登录：全仓无 `signInWithPasskey`；文案却承诺“下次登录可用指纹 / 面容 ID 一键登录” | 全仓 grep 零命中；`MyProfile` / `MePasskey` 文案 | 已止损：两处文案改为“登录页暂未提供通行密钥登录入口，入口上线后可用……”；登录入口本身未补，需产品决策 |
| S4 | `show_game_id` 无界面开关：生产库默认 true，游戏 ID 默认对所有成员可见，用户关不掉 | `MePrivacy.tsx:16`（仅参与保存）；生产库默认值 true | 已修（FIX-2-4）：MePrivacy 开关列表与 MyProfile 隐私栏各加“游戏 ID”开关；保存 payload 本来就含该字段 |
| S5 | 退出登录作用域不一致：编辑资料页裸 `signOut()`（默认 global，全设备退出）vs 账号安全页/Dock `local`（仅当前设备）；文案无法区分 | `MyProfile.tsx:135-138`；`MeAccount.tsx:39-59`；`App.tsx:1327` | 已修（FIX-2-2）：MyProfile 改为 `signOut({scope:'local'})`，文案与 MeAccount 一致 |
| S6 | `nav('/login')` 是不存在的路由：MeAccount 与 MeDevices 退出后都跳 `/login`，靠 `*` 兜底 + Shell 未登录分支才表现正常 | `MeAccount.tsx:51`；`MeDevices.tsx:88` | 已修（FIX-2-3）：去掉两处跳转（登录态变化后 Shell 自动渲染登录页），删未用的 `nav` |
| S7 | 仓库迁移与生产库漂移（账号线）：`profiles.phone` 生产有 UPDATE 授权、仓库只授 8 列；`show_game_id` / `profile_contacts.game_id` 生产存在、仓库无新增语句 | 生产库列授权 9 列 vs `001_init.sql:67` 8 列 | 已修（FIX-2-12 收敛迁移，生产回读核对） |
| S8 | 注册协议默认勾选之争：代码默认未勾选、门禁真实；第 1 阶段云浏览器称“默认已勾选” | `Login.tsx:50, 262, 300` vs 第 1 阶段线上报告 | 待线上复核（§7） |
| S9 | 自我介绍视频注释与实现矛盾：注释“直接显示（无需审核）”，实际 `submit_intro_video` 置 pending | `MyProfile.tsx:295` 注释 vs `015` 迁移 | 已修（FIX-2-7）：注释改为“进入审核，通过后他人可见” |
| S10 | 两套改密 UI 不一致：forgot 态（PasswordField + 强度 + 验证码）vs 邮件回跳 ResetPassword（原生 input、无显示/隐藏、无强度、错误拼英文原文） | `Login.tsx:361-421` vs `App.tsx:217-259` | 未修：体验不一致，未动 |
| S11 | 第 11 个兴趣标签静默丢弃：`TagInput` 到 10 个后再加直接 return，无提示 | `TagInput.tsx:commit` | 已修（FIX-2-5）：满 10 个时显示“已达到上限（10 个），删掉一个才能再加” |
| S12 | 设备管理页没有其他设备列表：与清单“查看其他设备会话”不符；只有当前设备 + 两个退出按钮 | `MeDevices.tsx:96-166` | 未修：是否补设备清单需产品决策 |
| S13 | `doReg` 死代码：注册备用提交路径定义后零调用 | `Login.tsx:299`，全仓 grep 零调用点 | 已修（FIX-2-6）：删除 `doReg`；typecheck + build 通过；本项改记 PASS |
| S14 | 删除通行密钥无确认：点即删 | `MePasskey.tsx:44-48` | 已修（FIX-2-8）：删前加 confirmDialog |
| S15 | 改密码不要求旧密码：`/me/account` 改密码只验新密码两次一致 | `MeAccount.tsx:19-30` | 未修：会话安全范畴，未动 |
| S16 | 表白墙点赞不存在（清单声称有） | `LoveWall.tsx` / `GuestLoveWall.tsx` 全文 `like`/`点赞` 零命中；无点赞表 | 未修：功能缺失，需产品决策是否补 |
| S17 | 动态头像/名字点不开成员主页（清单声称能点） | `PostList.tsx:773-779` 纯展示；仓内 `/members/` 零命中 | 未修：功能缺失，需产品决策是否补 |
| S18 | 拉黑不隐藏内容：`PostList` / `LoveWall` 查询无 `user_blocks` 过滤；拉黑只断私聊与提问 | `PostList.tsx:541-543`；`love_wall_published()` | 未修：权限边界产品决策，未擅自改查询语义 |
| S19 | 动态加载与点赞静默失败：`load()` 主查询不判错（失败显示空态）；`toggleLike` 不判 insert/delete 的 error | `PostList.tsx:224, 391-398` | 已修（FIX-2-10）：主查询失败 toast“动态加载失败，请稍后重试”并 return；点赞/取消失败 toast 并 return，不重拉 |
| S20 | 日常页无下拉刷新；动态搜索横条无“清除搜索”按钮（日常有） | `Discover.tsx:25`；`PostList.tsx:631, 638` | 已修（FIX-2-11）：Daily（非内嵌）包 PullToRefresh，换 key 重挂载；动态搜索横条加“清除搜索”按钮 |
| S21 | 表白墙提交按钮文案仍是“提交审核”，与先发后审（直接发布）实际行为不符 | `LoveWall.tsx:612` vs L425-426 | 已修（FIX-2-9）：改为“发布” |
| S22 | 群语音完全无入口（本阶段唯一 FAIL）：Provider、LiveKit、token Function、浮层、灵动岛联动全齐，全仓无调用方 | `groupCall.tsx` 自身以外零命中；群聊资料页无按钮 | 已修（FIX-2-1）：Chat 群聊资料页加“加入群语音”按钮（进行中显示人数、可回到通话中）；打开群聊时 `watchConversation` 订阅状态；typecheck + build 通过；登录态行为待验证，本项改记 PARTIAL |
| S23 | 视频/文件发送与 chat-media 桶白名单矛盾（代码级）：前端放行视频+文档、50MB；仓库 006 只允许图片+音频、15MB | `006_chat_media.sql` L3-4 vs `Chat.tsx` / `media.ts` | 已收敛（FIX-2-12）：生产桶本就是 50MB + 33 个 MIME，迁移按生产现状收敛；登录态实测发视频/PDF/20MB 文件仍待做 |
| S24 | 核心聊天表在迁移历史里没有建表语句：`friendships` / `conversations` / `messages` / `conversation_members` 只有索引、策略与函数引用 | 全仓 122 个迁移 grep `create table` 零命中 | 未修：需从 `database.types.ts` 精确还原四表定义，手工补写风险高，留待后续专项处理 |
| S25 | `mark_conversation_read` 有两个版本，谁最新待确认 | `20261114101500` vs `20261116235500` L161 | 未修：未逐行 diff，待核对 |
| S26 | 一对一通话只有 STUN、没有 TURN：对称 NAT / 严格防火墙下 ICE 可能失败 | `call.tsx:30-33` 只有两个 Google STUN | 未修：需两部手机跨网实测定性 |
| S27 | 匿名提问对管理员不匿名：`admin_list_anonymous_questions()` 返回 asker_id + asker_name；用户侧文案只说“对方不会看到你的账号信息” | `20261108005517:310-335` | 未修：信息级，文案未说明管理员可见 |
| S28 | `007_love_wall.sql` 文件头自称“未执行、未合并，仅供审阅”，但后续迁移均依赖 `love_wall_posts` 存在 | `007_love_wall.sql:1-8` | 未修：迁移执行史待核对 |
| S29 | Chat 页消息全量加载无分页：`select('*')` 无 `.range()`、无上限 | `Chat.tsx:665-666` | 未修：长会话首屏与内存风险，需实测定性 |
| S30 | 投票结果非实时：无 Realtime 订阅，他人投票后本页票数不变 | `PostList.tsx:760-793` | 未修：与清单“实时”措辞有出入，信息级 |

## 3. 逐项状态总表（130 项，证据见各线底稿）

### A 线（39 项）

| # | 功能 | 状态 |
|---|---|---|
| A1 | QQ 邮箱登录 | BLOCKED |
| A2 | 用户名登录 | BLOCKED |
| A3 | 登录失败分类与上报 | BLOCKED |
| A4 | 邮箱未验证转验证屏 | BLOCKED |
| A5 | 注册表单与校验 | BLOCKED |
| A6 | 注册协议勾选门禁（L-03） | PARTIAL |
| A7 | 注册提交与已注册邮箱提示 | BLOCKED |
| A8 | 注册验证码验证与重发 | BLOCKED |
| A9 | 注册完成收尾 finishJoin | BLOCKED |
| A10 | QQ 头像预览与导入 | BLOCKED |
| A11 | 注册备用提交路径 doReg | PASS（已删除死代码） |
| A12 | 找回密码 forgot 态（验证码方式） | BLOCKED |
| A13 | 找回密码 ResetPassword（邮件回跳） | PARTIAL |
| A14 | 退出登录：Dock / 维护页 / 后台顶条 | BLOCKED |
| A15 | 退出登录：编辑资料页 | PARTIAL（已修作用域） |
| A16 | 退出登录：账号安全页 | PARTIAL（已修死路由） |
| A17 | 退出登录：设备管理页 | BLOCKED |
| A18 | 编辑资料加载 | BLOCKED |
| A19 | 编辑资料自动保存 | BLOCKED |
| A20 | 编辑资料头像上传 | BLOCKED |
| A21 | 编辑资料自我介绍视频 | PARTIAL（已修注释） |
| A22 | 编辑资料兴趣标签 | BLOCKED（已修上限提示） |
| A23 | 编辑资料游戏段位 | BLOCKED |
| A24 | 编辑资料其他栏：社交/联系方式/外观/通行密钥/通知 | BLOCKED |
| A25 | 他人主页资料展示 | BLOCKED |
| A26 | 他人主页好友/拉黑/举报/发消息 | BLOCKED |
| A27 | 账号安全页 | PARTIAL |
| A28 | 通行密钥注册 | BLOCKED（已加删除确认、已改文案） |
| A29 | 通行密钥登录入口 | NOT_IMPLEMENTED |
| A30 | 设备管理页 | PARTIAL |
| A31 | 隐私设置开关 | BLOCKED |
| A32 | 隐私：游戏 ID 开关缺失 | PARTIAL（已补开关） |
| A33 | 隐私：地区分享 | BLOCKED |
| A34 | 游客登录 / 自动进入 | PARTIAL |
| A35 | 登录页背景自定义与意见反馈 | BLOCKED |
| A36 | 信任设备 30 天 | PARTIAL |
| A37 | 限流后请求登录链接 | PARTIAL |
| A38 | AuthProvider 会话恢复 | BLOCKED |
| A39 | 注册触发器自动入班 | BLOCKED |

### B 线（39 项）

| # | 功能 | 状态 |
|---|---|---|
| B1 | 发布动态/日常（文字） | BLOCKED |
| B2 | 发布配图：选图/删除已选图/压缩/上传进度 | BLOCKED |
| B3 | 列表加载、骨架屏、空态 | BLOCKED（已修加载失败提示） |
| B4 | 加载更多 | BLOCKED |
| B5 | 下拉刷新 | BLOCKED（日常已接 PullToRefresh） |
| B6 | 筛选：全部动态 / 好友动态 | BLOCKED |
| B7 | 按内容类型筛选 | NOT_IMPLEMENTED |
| B8 | 按搜索条件筛选 | BLOCKED（动态已加清除搜索） |
| B9 | 点赞 / 取消点赞 | BLOCKED（已修失败提示） |
| B10 | 评论：展开/收起、发表、编辑/删除自己评论 | BLOCKED |
| B11 | 编辑自己动态 | BLOCKED |
| B12 | 删除自己动态 | BLOCKED |
| B13 | 举报动态/日常 | BLOCKED |
| B14 | 举报评论 | NOT_IMPLEMENTED |
| B15 | 点头像/名字进成员主页 | NOT_IMPLEMENTED |
| B16 | 开启/关闭投票 | BLOCKED |
| B17 | 投票问题 + 模板 | BLOCKED |
| B18 | 增删投票选项 | BLOCKED |
| B19 | 提交投票 / 改票 / 防重复投票 | BLOCKED |
| B20 | 票数 / 比例展示 | BLOCKED |
| B21 | 表白墙 / 帖子切换 | BLOCKED |
| B22 | 筛选：全部心意 / 我的投稿 | BLOCKED |
| B23 | 投稿：类型/收件人可空/内容/照片视频/匿名开关 | BLOCKED |
| B24 | 先发后审：点发布即直接公开展示 | BLOCKED（按钮文案已修） |
| B25 | 查看投稿状态 | BLOCKED |
| B26 | 表白点赞 / 取消点赞 | NOT_IMPLEMENTED |
| B27 | 表白评论：发表/编辑/删除自己评论 | BLOCKED |
| B28 | 删除自己投稿 | BLOCKED |
| B29 | 举报表白投稿/评论 | NOT_IMPLEMENTED |
| B30 | 向成员匿名提问 | BLOCKED |
| B31 | 三栏：收到的 / 我发出的 / 已公开回答 | BLOCKED |
| B32 | 回答问题 / 保存 / 公开开关 | BLOCKED |
| B33 | 移除问题 | BLOCKED |
| B34 | 举报提问 | BLOCKED |
| B35 | 匿名性：提问者身份是否写库、回答者能否看到 | BLOCKED |
| B36 | 举报写入与后台处理 | BLOCKED |
| B37 | 拉黑 / 解除拉黑 | BLOCKED |
| B38 | 拉黑后看不到对方内容 | NOT_IMPLEMENTED |
| B39 | 拉黑后收不到对方消息（私聊） | BLOCKED |

### C 线（52 项）

| # | 功能 | 状态 |
|---|---|---|
| C-A01 | 好友五栏切换 | BLOCKED |
| C-A02 | 找人搜索（支持 @用户名 前缀） | BLOCKED |
| C-A03 | 发好友申请 | BLOCKED |
| C-A04 | 发申请时可选邮件提醒对方 | BLOCKED |
| C-A05 | 接受 / 拒绝好友申请 | BLOCKED |
| C-A06 | 撤回已发出的好友申请 | BLOCKED |
| C-A07 | 解除好友 | BLOCKED |
| C-A08 | 拉黑 / 解除拉黑 | BLOCKED |
| C-A09 | 请求列表与通知列表 | BLOCKED |
| C-A10 | 成员主页的好友关系操作 | BLOCKED |
| C-B01 | 会话筛选：全部 / 未读 / 直接 / 群组 | BLOCKED |
| C-B02 | 搜索会话 | BLOCKED |
| C-B03 | 未读数 | BLOCKED |
| C-B04 | 全部标记已读 | BLOCKED |
| C-B05 | 左滑隐藏会话 + 5 秒撤销 | BLOCKED |
| C-B06 | Realtime 刷新 + 兜底轮询 | BLOCKED |
| C-B07 | 建群 | BLOCKED |
| C-B08 | 列表预览隐私（隐形墨水 / 剧透不泄露原文） | BLOCKED |
| C-C01 | 发送文字 | BLOCKED |
| C-C02 | 图片发送 / 拍照与放大预览 | BLOCKED |
| C-C03 | 视频发送 | BLOCKED |
| C-C04 | 文件发送 | BLOCKED |
| C-C05 | GIF 动图发送 | BLOCKED |
| C-C06 | 贴纸 | BLOCKED |
| C-C07 | 语音消息 | BLOCKED |
| C-C08 | 消息格式栏 11 项 | BLOCKED |
| C-C09 | 消息特效：气泡 4 种 + 全屏 8 种 | BLOCKED |
| C-C10 | 长按菜单 | BLOCKED |
| C-C11 | 回应（Tapback）与回应统计 | BLOCKED |
| C-C12 | 编辑消息 | BLOCKED |
| C-C13 | 撤回消息 | BLOCKED |
| C-C14 | 转发 | BLOCKED |
| C-C15 | 已读状态与群聊已读人数 | BLOCKED |
| C-C16 | 输入中提示 | BLOCKED |
| C-C17 | 消失的私信设置 | BLOCKED |
| C-C18 | 聊天背景 | BLOCKED |
| C-C19 | 群聊管理 | BLOCKED |
| C-C20 | 共享内容 | BLOCKED |
| C-C21 | 联系人备注编辑 | NOT_IMPLEMENTED |
| C-C22 | 视频通话 | NOT_IMPLEMENTED |
| C-C23 | 阻止截屏开关 | NOT_IMPLEMENTED |
| C-C24 | 消息全量加载（无分页） | PARTIAL |
| C-D01 | 一对一语音通话：发起 | BLOCKED |
| C-D02 | 一对一语音通话：接听 / 拒绝 / 取消 / 挂断 | BLOCKED |
| C-D03 | 一对一语音通话：静音 / 扬声器 / 最小化到灵动岛 | BLOCKED |
| C-D04 | 一对一语音通话：媒体通道（WebRTC，仅 STUN） | BLOCKED |
| C-D05 | 通话记录消息 | BLOCKED |
| C-D06 | 群语音：加入 / 退出 / 静音 / 最小化 / 参与者列表 | PARTIAL（已接线，待登录验证） |
| C-E01 | 图片 / 语音上传与签名 URL | BLOCKED |
| C-E02 | 未登录 / 非好友 / 被拉黑时的发消息与历史可见性 | BLOCKED |
| C-E03 | chat-media 桶：大小限制与 MIME 白名单 | BLOCKED（仓库已按生产收敛） |
| C-E04 | 消息撤回 / 删除：软删与附件残留 | BLOCKED |

## 4. 修复清单（FIX-2，本阶段 12 项）

| 编号 | 问题 | 严重程度 | 修复内容 | 验证 |
|---|---|---|---|---|
| FIX-2-1 | 群语音完全无入口（原 FAIL） | 高 | `Chat.tsx` 群聊资料页加“加入群语音”按钮（进行中显示人数、可回到通话中）；打开群聊时 `watchConversation` 订阅该群通话状态 | typecheck + build + 双样式检查通过；登录态行为待验证 |
| FIX-2-2 | 退出登录作用域不一致 | 中 | `MyProfile.tsx` 退出改为 `signOut({scope:'local'})`，文案与账号安全页一致 | typecheck + build 通过；登录态待验证 |
| FIX-2-3 | `nav('/login')` 死路由 | 低 | `MeAccount.tsx` / `MeDevices.tsx` 去掉退出后跳转（Shell 自动渲染登录页），删未用的 `nav` | typecheck + build 通过 |
| FIX-2-4 | 游戏 ID 无开关 | 中 | `MePrivacy.tsx` 开关列表与 `MyProfile.tsx` 隐私栏各加“游戏 ID”开关；保存 payload 本来就含该字段 | typecheck + build 通过；登录态待验证 |
| FIX-2-5 | 第 11 个兴趣标签静默丢弃 | 低 | `TagInput.tsx` 满 10 个时显示“已达到上限（10 个），删掉一个才能再加” | typecheck + build 通过 |
| FIX-2-6 | `doReg` 死代码 | 低 | 删除 `Login.tsx` 的 `doReg`（零调用点）；注册唯一真实路径为 `sendCode` + `doVerifyReg` | grep 零命中；typecheck + build 通过；A11 改记 PASS |
| FIX-2-7 | 自我介绍视频注释误导 + 通行密钥文案误导 | 低 | 注释改为“进入审核，通过后他人可见”；`MyProfile` / `MePasskey` 文案改为登录入口上线后可用 | typecheck + build 通过 |
| FIX-2-8 | 删除通行密钥无确认 | 低 | `MePasskey.tsx` / `MyProfile.tsx` 删前加 confirmDialog | typecheck + build 通过 |
| FIX-2-9 | 表白墙按钮文案与先发后审不符 | 低 | `LoveWall.tsx` “提交审核”→“发布” | typecheck + build 通过 |
| FIX-2-10 | 动态加载与点赞静默失败 | 中 | `PostList.tsx` 主查询失败 toast 并 return，不显示空态误导；点赞/取消失败 toast 并 return | typecheck + build 通过；登录态待验证 |
| FIX-2-11 | 日常无下拉刷新；动态搜索无清除按钮 | 低 | `Daily.tsx`（非内嵌）包 PullToRefresh；动态搜索横条加“清除搜索”按钮 | typecheck + build 通过；登录态待验证 |
| FIX-2-12 | 仓库与生产库漂移收敛 | 中 | 新增迁移 `20261121090000_audit_phase2_drift_convergence.sql`（幂等）：reports 表 + 三策略、comments UPDATE 两策略、profiles.phone 授权、show_game_id / game_id 两列、chat-media 桶 50MB + 33 个 MIME | 已应用到生产（apply_migration 返回 success）；回读核对：5 条策略齐全、桶 52428800 字节 / 33 个 MIME，与生产原值一致（生产无变化） |

## 5. 未解决项（本阶段结束时仍 open）

- **登录态 BLOCKED 106 项**：全部需要可登录的测试账号 + 双号实测（好友、私信、通话、投票、举报、隐私裁剪等）。本次无账号，未做任何登录、注册、发布、点赞、评论、私信、通话操作，未向真实用户发任何消息。
- **产品决策待定**：信任设备开关与限流登录链接是否开启（S1/S2，认证配置）；通行密钥登录入口补还是只改文案（S3，已先改文案）；表白墙点赞、动态头像进主页、拉黑隐藏内容是否补（S16/S17/S18）；设备清单是否补（S12）；改密码是否验旧密码（S15）；两套改密 UI 是否统一（S10）。
- **漂移残留**：聊天核心四表建表迁移缺失（S24）；`007_love_wall.sql` 文件头与执行史矛盾（S28）；`mark_conversation_read` 两版本未 diff（S25）。
- **需真机/双机验证**：一对一通话跨网（无 TURN，S26）；视频/PDF/20MB 文件发送（S23）；撤回图片后原图直链是否仍有效（E-04）；长会话首屏耗时（S29）；L-03 注册协议复选框真机状态（§7）。

## 6. 测试证据

- 代码审计底稿：`audit-phase2-work/auth-profile-audit.md`、`feed-love-questions-audit.md`、`friends-chat-audit.md`（三线逐项表，含文件+行号、接口、数据库证据）。
- 生产库只读核对：`audit-phase2-work/db-checks-b-line.md`、`db-checks-c-line.md`（reports 表与策略、comments UPDATE 策略、chat-media 桶、核心聊天表、show_game_id / game_id / phone 列定义、reports.id 为 identity）。
- 修复验证：修复分支 `fix/audit-phase2-code` 上 `npm run typecheck` 通过、`npm run build` 通过（built in 3.66s）、`npm run check:styles` 通过、`npm run check:admin-styles` 通过；迁移应用后生产回读核对通过（§4 FIX-2-12）。
- 未执行：任何登录、注册、发布、点赞、评论、私信、通话、邮件发送、生产写入（除幂等收敛迁移外）、生产数据删除。

## 7. 线上复核（L-03 注册协议复选框）

2026-11-21 08:39–08:46 派线上只读复核，未能完成，原因如下：

- 云浏览器打开网站时已处于登录态（账号“千栀 @qianzhi”，个人中心显示 0 动态、1 帖子、0 点赞及一条已发布内容“表白 10/31”），不是任务前提的访客状态；直访 `#/login` 被重定向回 `#/home`，首页也无登录入口，无法打开登录弹窗/注册页。
- 浏览器就“是否点‘退出当前设备’以进入访客状态”请示，已明确拒绝：不退出、不切换账号、不清登录态，当前登录会话原样保留；任务随即结束。未点击退出按钮，未改密码，未填、未提交任何表单，未发验证码。
- 结论：注册页协议复选框初始状态（已勾选还是未勾选）与登录页有无“信任此私人设备 30 天”复选框，两项均未在线上核对到，**仍为 open**，待用户在手机无痕/隐私标签下自行看一次注册页复选框初始状态后定论。附带确认：已登录态直访 `#/login` 回 `#/home`，与第 1 阶段守卫结论一致。
