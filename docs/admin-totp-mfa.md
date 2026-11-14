# 管理员 TOTP MFA 接入说明

这组改动已提交到独立 PR 分支 `manus/admin-security-hardening-20261115`，基于最新 `main`；尚未合并或部署。应用数据库 migration 与生产发布仍需单独审批。

## 实现内容

管理员登录页先校验密码，再执行 TOTP 首次绑定或已绑定验证器的 challenge/verify。没有完成验证时不会进入后台。若浏览器原本已有较低保障级别的登录会话，仍会要求重新输入管理员密码后才允许绑定验证器，避免被盗用的旧会话把攻击者自己的验证器注册到管理员账户上。

后端 migration 覆盖现有权限链路：`public.my_role()` 只有在 JWT 同时具有 `aal2` 和 `amr` 中的 `totp` 方法时，才返回 `admin` / `super_admin`；否则返回最低权限的 `member`。选择返回非 NULL 的 `member` 是为了堵住历史 SQL 中 `IF my_role() <> 'super_admin'` 可能被 NULL 三值逻辑绕过的问题。新增的 `public.admin_login_is_admin()` 只让已认证用户检查自己的账户是否为管理员，不授权任何后台数据或操作。

## 发布顺序

1. 在 Supabase Auth 配置中确认启用 TOTP MFA。后端按签名 JWT 的 `amr.method = totp` 强制 TOTP；仅有其他形式的 `aal2` 不足以进入后台。
2. 先审阅并应用 `supabase/migrations/20261114150000_admin_totp_mfa_gate.sql`，再发布前端。若先发布前端、未应用此 migration，前端会显示 MFA 流程，但数据库/RLS 尚未实施新的 `aal2 + totp` 服务端门禁。
3. 仓库现有 `.github/workflows/migrate.yml` 是手动选择单个 migration 的工作流；运行前必须确认 GitHub Actions 中 `SUPABASE_DB_*` secrets 指向预期项目。此步骤会修改目标数据库，本次工作没有运行它。
4. 数据库 migration 成功后，再合并/发布 `src/pages/AdminLogin.tsx` 与 `src/main.tsx` 的前端更改。
5. 用管理员账户首次登录时扫描二维码并立即在验证器应用中确认绑定。二维码/密钥是账户凭证，不要截图发给他人或放入日志。

## 恢复与验证

管理员备用恢复码与恢复后强制重新绑定 TOTP 的界面已在本地工作区实现：登录页只允许恢复码把会话带入新 TOTP enrollment，数据库门禁仍只认可 `aal2 + amr.method=totp`。所有管理员可在“账户安全”页生成或轮换本人恢复码；代码只在当前页面内存展示一次，不写入本地持久存储。启用前必须先在 Supabase staging 实测 Auth 服务端 API 支持情况，不要假设 Dashboard 一定有对应开关；若返回 `*_not_enabled`，不要放宽数据库门禁或自建恢复码表。

目前没有实现自助移除 TOTP。遗失验证器和恢复码时，应使用受控的 Supabase 项目所有者恢复流程；不要直接修改 Supabase 内部 `auth` 表来绕过验证。

本地检查命令：

```bash
npm run test:admin-mfa-sql
npm run check:admin-security
npm run test:login-sql
npm run check:priority-fixes
npm run typecheck
npm run check:styles
npm run check:admin-styles
npm run build
```

`test:admin-mfa-sql` 用隔离的 PGlite fixture 验证：AAL1 管理员、缺失 AAL 声明、没有 TOTP 的 AAL2 会话，以及仅使用恢复码得到的 AAL2 会话都不能取得管理员角色；只有 AAL2 且 `amr` 含 TOTP 的管理员才能取得原角色。`check:admin-security` 检查恢复码流程和闲置退出的关键安全约束。上述测试不连接线上数据库，也不能替代 staging 端到端登录验证。

参考：

- [Supabase Auth MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [Supabase JWT Claims（`aal` 与 `amr.method`）](https://supabase.com/docs/guides/auth/jwt-fields)
