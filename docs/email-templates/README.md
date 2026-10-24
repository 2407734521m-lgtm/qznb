# 「我们的班级 · 青春档案」中文邮件模板

统一视觉：深海蓝品牌头部、冰蓝验证码卡片、浅色背景、手机优先排版。所有模板均使用 Supabase Auth 模板变量，不包含真实用户信息。

## 模板对应关系

| Supabase Auth 模板 | 文件 | 用途 |
|---|---|---|
| Confirm signup（注册确认） | `signup-confirmation.html` | 注册时发送验证码 |
| Reset password（密码重置） | `password-recovery.html` | 忘记密码后发送重置验证码 |
| Magic Link（无密码登录 / 邮箱 OTP） | `email-otp-login.html` | 邮箱验证码登录 |
| Change Email Address（更改邮箱） | `email-change.html` | 确认新的邮箱地址 |
| Reauthentication（重新验证身份） | `reauthentication.html` | 敏感操作前的身份验证 |

## 应用到 Supabase（需要手动保存）

1. 打开 Supabase Dashboard，选择网站实际使用的项目。
2. 进入 **Authentication → Email Templates**。
3. 逐个打开上表对应模板，把对应 HTML 文件内容复制到正文编辑区。
4. 把邮件主题改为下方建议主题，然后保存。
5. 用自己的测试邮箱分别测试注册、忘记密码、邮箱 OTP 登录和更换邮箱。

建议主题：
- Confirm signup：`【青春档案】请验证你的邮箱`
- Reset password：`【青春档案】密码重置验证码`
- Magic Link：`【青春档案】邮箱登录验证码`
- Change Email Address：`【青春档案】确认新的邮箱地址`
- Reauthentication：`【青春档案】身份验证验证码`

**注意：** 这些文件是模板源码，提交到 GitHub 不会自动更改 Supabase 线上模板。必须在正确的 Supabase 项目里粘贴并保存后才会生效。项目目前存在两个 Supabase 项目，操作前先核对网站域名所用的 Project URL，避免改到备用项目。不要把 service_role 密钥或 Resend API 密钥写进仓库。

当前网站注册和忘记密码流程都使用 6 位验证码，所以注册确认和密码重置模板使用 `{{ .Token }}`。若之后把流程改成邮件链接，再按 Supabase 的链接流程调整模板，不要随意删除模板变量。
