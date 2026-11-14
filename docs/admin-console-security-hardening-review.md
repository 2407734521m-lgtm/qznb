# 管理员后台安全加固建议

## 先区分已上线和本地改动

本次只读审查当时的基线 `HEAD` 与 `origin/main` 均为 `abe8bfc`。之后远程 `main` 已前进；TOTP 登录页与 `my_role()` 的 AAL2 门禁现已提交到基于最新 `main` 的独立 PR 分支，但尚未合并或部署。不能据此认为 GitHub `main` 或生产已经强制 MFA。应先完成 staging 验证，再按数据库 migration 与前端兼容顺序发布。

仓库已把后台 UI 限制在 `admin.qianzhi.pw`，并使用独立 Supabase Auth storage key；数据库已有 `admin_audit_logs`、`admin_security_overview()` 和部分高风险操作双人审批。`AdminSecurityCenter` 能查看匿名聚合登录失败、有限的近期管理员操作，并允许当前账号退出其他设备。但登录页直接调用 Supabase `signInWithPassword()`，不经过用户名登录的自定义限速函数；后台认证失败不等于已被该限速器或应用审计完整覆盖。通用 `alog()` 在审计写入失败时会忽略错误。仓库注释指出后台 `/api` 经 Cloudflare 路由，但没有纳入实际 Cloudflare Access、DNS/WAF 或代理配置，因此无法确认这些防护是否已经部署。

## 建议优先级

### 1. 先完成服务器端授权与 MFA 发布闭环

先验证并发布现有 TOTP 后端门禁，确认所有受保护的 RLS policy、`SECURITY DEFINER` RPC 和 Edge Functions 都在服务端检查角色与 MFA，不以“后台只在某个域名显示”、前端按钮隐藏或 CORS 作为授权依据。直接调用 Supabase API 的请求也必须受数据库/RPC 权限约束。对 `service_role` 函数逐个检查调用者身份与目标权限；密钥只留在服务端。

### 2. 给 `admin.qianzhi.pw` 增加 Cloudflare Access 门禁，并有条件地加 IP 限制

如果该 hostname 确实经过 Cloudflare，可把整个后台 host（包括相关 `/api` 路径）放到 Access 后面。策略建议同时要求指定管理员身份/IdP 登录，并按需要要求批准的 IP CIDR 或受管设备/WARP 状态。Cloudflare Access 支持把 IP ranges 用作策略条件，并通过 Include/Require/Exclude 组合规则；IP 属性会在后续请求中持续检查。[1]

IP 白名单适合管理员总是从固定办公网或固定 VPN 出口访问的情形。若你会用 Android 移动网络、家用动态 IP 或旅行网络，硬性白名单容易把自己锁在门外。此时优先使用身份 + 受管设备/WARP 条件；IP 可作风险信号或第二条件，并预留另一名管理员可审计的恢复办法。Access 只保护实际经过 Cloudflare 的流量，仍需检查是否有可直连的 Pages/Worker/API/Supabase 地址或绕过规则。它不能取代 Supabase RLS 和后端身份检查。

### 3. 后台登录与 MFA 接口单独做速率控制和告警

不要把主站用户名登录限流当成后台保护：当前 `AdminLogin.tsx` 直接调用 Supabase Auth 密码登录，自定义用户名登录 limiter 不覆盖这条路径。建议组合使用 Supabase Auth 自身限制、后台登录/MFA 错误的服务端节流，以及 Cloudflare WAF 对后台登录/API 的速率规则；按账号与来源组合限速，使用渐进退避而非永久锁死账号，并对连续失败、单账号多 IP、成功前突发失败发出告警。

Cloudflare WAF 的规则字段、计数维度、窗口和数量会依套餐不同；它主要是边缘层补充，不能代替应用/Auth 侧的账号维度限制。[2] 还要核对请求是否都经过预期 Cloudflare 代理，否则攻击者可能直接请求公开的 Supabase endpoint。

### 4. 把审计从“可查看”升级为“完整、可告警、难篡改”

保留现有 `admin_audit_logs`，但统一覆盖管理员登录成功/失败、TOTP 或恢复码生成/使用、因素移除、会话撤销、角色变更、账号删除、数据导出、批量邮件、全站设置、双人审批与部署/migration。记录时间、操作者、动作、目标、结果、原因、请求/关联 ID；来源 IP 只从可信 Cloudflare/服务端上下文取得，不信任浏览器提交的 `X-Forwarded-For`。对登录异常、新增管理员、因素变更、敏感操作和审计写入失败设置通知。

目前安全中心展示的是聚合统计和有限条目；`alog()` 失败不会中断主要操作，且审计写入分散在 RPC。高风险动作应在同一服务端事务中记录结果，或使用可靠 outbox 重试；再把关键审计异步复制到后台数据库权限无法修改的只追加日志服务。不要记录密码、JWT、TOTP/恢复码或不必要的个人资料。OWASP 建议记录认证成功/失败、授权失败和管理员高风险操作，同时保护日志并避免写入认证秘密。[3] Supabase Auth Audit Logs 可补充 Auth 事件，但 IP 地址只在部分事件中提供；它不能自动覆盖你自己的业务敏感操作。[4]

### 5. 缩短后台会话暴露窗口，并对高风险动作重新验证

仓库当前管理员客户端设置 `persistSession: true`、`autoRefreshToken: true`。Supabase Auth 默认 session 可以持续到退出或其他终止事件；官方支持最大时长、闲置超时和单会话等配置，但这些 session 限制只在 Pro 及以上可用。[5] 检查当前项目套餐与设置后，为管理员设定合理的最大时长和闲置超时；后台 UI 的自动锁屏只能作为体验补充，不能替代服务端 session 校验。

对删除账号、改管理员角色、导出数据、批量发送、改安全设置等操作要求近期重新验证 TOTP，并记录谁在何时执行。对异常 IP/新设备登录通知管理员；必要时提供撤销某个管理员全部 session 的应急操作，而不只是在当前管理员账号上点“退出其他设备”。

### 6. 扩大双人审批覆盖面，并保护紧急例外

仓库已有 `admin_dual_approval` 流程，但覆盖范围有限，部分 `super_admin` 操作仍可直接执行。建议把不可逆或影响面大的操作纳入服务端双人审批：角色与账号、批量通知/邮件、敏感数据导出、全站安全设置、恢复/迁移相关操作。请求人不得审批自己的请求；执行前重新检查目标状态与权限，避免审批后目标被替换或发生重复执行。紧急 break-glass 可以保留，但要使用独立身份、强 MFA、理由、即时告警和事后复核，不能作为日常绕过流程。

### 7. 把发布凭证和配置变更也纳入后台安全边界

保护 GitHub Actions 的数据库 secrets 与 migration workflow：生产环境使用受保护 Environment、最小权限凭证和人工审批，先在 staging 运行并核对目标 Supabase project ref；审计 workflow 谁运行了哪个 migration。审查 Cloudflare Access/WAF、DNS、Worker 路由和 `/api` 代理配置，并为认证响应设置不缓存策略及适当安全响应头。此次仓库检查未包含 Cloudflare 控制台配置，因此这些项目需要在实际账户中验证。

## 推荐实施顺序

先完成 MFA 服务端门禁与全量 RLS/RPC 审核；然后保护 Cloudflare 后台入口并确认没有绕过路径；接着为管理员登录/MFA 加服务端节流和告警；之后完善统一审计、会话时限和高风险操作 step-up；最后扩展双人审批与生产发布保护。这样先守住授权边界，再补充检测和运维控制。

**References**

[1]: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/ "Cloudflare Access policies"
[2]: https://developers.cloudflare.com/waf/rate-limiting-rules/ "Cloudflare WAF rate limiting rules"
[3]: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html "OWASP Logging Cheat Sheet"
[4]: https://supabase.com/docs/guides/auth/audit-logs "Supabase Auth Audit Logs"
[5]: https://supabase.com/docs/guides/auth/sessions "Supabase Auth sessions"
