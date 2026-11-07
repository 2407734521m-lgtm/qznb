# 管理员批量邮件配置

管理员群发继续由 `admin-bulk-email` 负责身份验证、权限校验、收件人范围、频率限制和批次统计；实际投递统一交给内部 `email-dispatch` 函数。

## 部署要求

1. 在 Resend 验证有权使用的发件域名，并确认发送状态正常。
2. 在正式 Supabase 项目部署以下 Edge Functions：
   - `email-dispatch`
   - `admin-bulk-email`
3. 在 Supabase Edge Function Secrets 中配置：
   - `RESEND_API_KEY`：仅由 `email-dispatch` 读取的 Resend API 密钥。
   - Supabase 默认提供的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。
4. 先应用 `supabase/migrations/20261107120000_unified_email_delivery_logs.sql`，再部署 `email-dispatch`，最后部署调用它的业务函数。
5. `email-dispatch` 必须设置为 `verify_jwt = false`，因为它使用内部服务密钥认证；函数代码仍会严格比对完整的 `Authorization: Bearer <service role key>`。不可将该密钥返回给浏览器。
6. 发送前先用管理员账号选择一个可控测试账号进行单封测试；确认记录状态后再进行分批发送。

## 安全与数据处理

- `admin-bulk-email` 仍在服务端验证用户 session 和 `my_role()` 管理员权限。
- 每次最多选择 100 个账号；单个管理员每小时最多发起 5 个批次。
- 每位收件人单独发送，不把其他收件人地址暴露给对方。
- `email_delivery_logs` 只保存事件键、类别、来源、账户引用、Resend message ID、状态和错误分类；不保存收件人邮箱或邮件正文。
- 同一业务事件重试时必须复用相同 `eventKey`，由数据库唯一约束和 Resend `Idempotency-Key` 防止重复投递。
- 日志中的 `accepted` 只代表 Resend 接受发送请求，不等于收件人邮箱已投递；最终投递、退信和投诉状态需要后续接入签名验证的 Resend Webhook。
- 账号注册验证和忘记密码仍由 Supabase Auth + Auth SMTP 管理，不通过普通邮件发送函数绕过 Auth 的验证码校验。

## 当前发件身份

统一 Resend API 通道使用 `堯 <notice@qianzhi.pw>`。修改发件身份应同步检查域名验证和投递率，不要直接把 API Key 写入代码或前端配置。
