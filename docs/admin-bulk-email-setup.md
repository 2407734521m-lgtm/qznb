# 管理员批量邮件配置

该功能的代码不会自动发送邮件。上线前必须单独部署 Supabase Edge Function，并配置邮件服务：

1. 在 Resend 验证一个你有权使用的发件域名。
2. 在 Supabase 项目的 Edge Functions 中部署 `admin-bulk-email`，文件位置为 `supabase/functions/admin-bulk-email/index.ts`。
3. 在 Edge Function Secrets 中设置：
   - `RESEND_API_KEY`：Resend API 密钥。
   - `EMAIL_FROM`：已验证域名下的发件人，例如 `我们的班级 · 青春档案 <notice@你的已验证域名>`。
4. 确认函数环境提供标准的 `SUPABASE_URL`、`SUPABASE_ANON_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY`。Service Role Key 只能存放在服务端 Secrets，绝不能放进前端代码。
5. 使用管理员账号测试：只选一个自己有权测试的账号，发送一封测试邮件；确认无误后再分批使用。

函数会在服务端验证登录身份与 `my_role()` 管理员权限；每次最多 100 个账号，且每个收件人单独发送，避免泄露其他人的邮箱地址。请仅向明确选择且合理预期会接收社区通知的成员发送邮件，不要用于骚扰或营销群发。
