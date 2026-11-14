# 管理员后台控制台加固操作手册

本仓库代码无法代替 Cloudflare 与 Supabase 控制台策略。本手册先说明应配置的边界；此次不会登录控制台、改生产配置或执行数据库迁移。

## Cloudflare Zero Trust：保护后台入口

1. 在 Cloudflare Zero Trust 中为 `admin.qianzhi.pw` 建立 Self-hosted Access application，覆盖整个 hostname，而不只保护登录页；确认 `/api/*` 也必须经过相同的 Access policy。
2. 建立默认拒绝策略，只 Allow 明确列出的管理员身份（最好经 IdP/企业邮箱组管理）。不要依赖隐藏路径或随机 URL。
3. 若管理员只从固定办公网/固定 VPN 出口访问，在 Allow 身份策略外增加 Require IP ranges 条件。若需 Android 移动网络、动态家庭网络或旅行访问，不要把不稳定 IP 当唯一通行条件；优先用 WARP/受管设备 posture，避免管理员被锁出。
4. 盘点 DNS、Pages/Worker/源站和 API Worker 路由，确认不存在绕过 Access 的公网直连入口。代码里 `src/lib/supabase.ts` 使用 `https://admin.qianzhi.pw/api` 同源代理，但公开 Supabase 项目 URL 仍可能被其他客户端直接请求；因此所有数据权限仍必须由 RLS、函数授权和 Auth MFA 执行。
5. 配置受支持的会话时长和设备条件。先用另一位管理员验证新策略、移动端登录和 `/api` 请求，再启用强制策略；保留独立、可审计的应急管理员访问方式。

## Cloudflare WAF：后台认证端点限速

在 WAF Rate Limiting Rules 中，为 `admin.qianzhi.pw` 的 Supabase Auth 同源代理路径单独建规则，至少关注密码登录 `POST /api/auth/v1/token` 与 MFA challenge/verify 路径。采用按来源 IP 的短窗口渐进限速，并对持续异常设置告警/挑战；阈值应在 staging 验证后再启用，避免锁住正常移动用户。

具体计数维度、规则数量、窗口和缓解动作随 Cloudflare 套餐变化。WAF 只保护经过 Cloudflare 的请求，不具备可靠的“每个 Supabase 用户账号”限速；Auth 服务本身的限制与数据库/后端授权仍要保留。若 Supabase 项目 URL 可被直接请求，Cloudflare 规则不能阻止绕过同源 Worker 的流量。

## Supabase Auth：认证审计、限流和会话

1. 在 Supabase Dashboard 的 Auth 设置中核对密码登录、邮箱 OTP、MFA verify 的服务端 rate limits；调整前确认现有站点流量与邮件发送限制。
2. 启用并检查 Supabase Auth Audit Logs。至少关注登录成功/失败、MFA factor 新增/移除、恢复码生成/验证等事件。若需要告警或长期保留，配置官方支持的日志导出/外部只追加存储；不要假定每条 Auth 事件都带 IP，也不要将 JWT、密码、TOTP 秘钥或恢复码写入业务日志。
3. 管理员前端本次实现 20 分钟无操作退出，这是浏览器端补充。项目级 Supabase 最大 session 时长/闲置时间设置可能影响所有普通用户，并受套餐限制；确认其作用范围、套餐与全站体验后再决定，先在 staging 验证。
4. 每项 `service_role` Edge Function 都要独立检查用户身份、角色和目标资源权限。客户端隐藏页面、Access Cookie、CORS 和 WAF 都不能代替这些服务端检查。

## GitHub Actions：数据库迁移与发布审批

当前 `.github/workflows/migrate.yml` 使用手动 `workflow_dispatch` 选择 migration，并将 `SUPABASE_DB_*` secrets 用作数据库连接。建议在 GitHub 为生产创建受保护 Environment，要求另一位维护者审批，限制可部署分支；把生产 secrets 限定在该 Environment。运行前核对 workflow 日志中的目标 host、database、migration 文件名和 project ref；先在 staging 执行同一个 migration 并备份/确认回滚策略。

## 已写入仓库的代码侧补充

- 管理员专用 Supabase client 启用 experimental Recovery Codes；主站客户端不启用。
- 登录页允许恢复码触发登录恢复，但恢复码验证后强制重新绑定并验证 TOTP；数据库角色门禁仍只认可 `aal2 + amr.method=totp`。
- 每个管理员有个人“账户安全”页面；生成/轮换本人恢复码前会重新挑战 TOTP，页面不把明文写入 localStorage/sessionStorage 或审计日志。
- 后台 20 分钟无操作后退出当前本地管理员会话。
- 恢复码生成/轮换及恢复后 TOTP 重绑写入现有管理员操作日志；Auth 认证事件仍需另行启用 Supabase Auth Audit Logs。

本次改动在独立 PR 分支中，尚未合并或部署。先运行 `npm run check:admin-security`、`npm run test:admin-mfa-sql`、`npm run typecheck` 和 `npm run build`，再在 Supabase staging 验证 Auth 服务端实际支持 Recovery Codes API；不要假设 Dashboard 一定存在对应开关。若服务端返回 `*_not_enabled`，先核对当前官方支持状态或向 Supabase 支持渠道确认，不要让管理员依赖此功能。

## 官方资料

- [Cloudflare Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Cloudflare WAF rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs)
- [Supabase Auth sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Recovery Codes generate](https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-generate)
- [Supabase Recovery Codes verify](https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-verify)
