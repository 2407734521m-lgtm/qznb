# 堯邮件架构（分阶段）

## 目标

把应用通过 Resend API 发送的业务邮件统一到内部 Edge Function，统一发件身份、基础 HTML 外观、幂等处理和发送日志。优先修复和观察忘记密码流程，但不把 Supabase Auth 的安全邮件迁移成普通业务邮件。

## 邮件通道

| 邮件类型 | 责任系统 | 当前原则 |
| --- | --- | --- |
| 注册邮箱验证 | Supabase Auth + Auth SMTP（Resend） | 保留 Supabase OTP |
| 忘记密码 | Supabase Auth + Auth SMTP（Resend） | 保留 `resetPasswordForEmail`、`verifyOtp(recovery)`、`updateUser` |
| 管理员群发 | `admin-bulk-email` → `email-dispatch` | 服务端管理员授权和速率限制 |
| 维护恢复通知 | `maintenance-notify` → `email-dispatch` | 只通知主动登记的邮箱 |
| 用户反馈 | `dev-feedback` → `email-dispatch` | 固定收件人、用户身份认证和频率限制 |
| 后续安全/好友/功能通知 | 各自受权限保护的业务函数 → `email-dispatch` | 分类别启用，尊重通知偏好 |

## 内部发送入口

`email-dispatch` 不作为浏览器公开 API。它关闭 Gateway JWT 校验后，在函数代码中要求完整匹配服务端 `SUPABASE_SERVICE_ROLE_KEY`。只有受保护的 Edge Function 可以使用该内部密钥调用它。前端只能调用各自受权限保护的业务函数。

当前固定发件身份：`堯 <notice@qianzhi.pw>`。

## 发送记录

`public.email_delivery_logs` 仅服务端可读写，RLS 开启且撤销 public、anon、authenticated 权限。记录只包含事件键、邮件类别和来源、账户引用、Resend 消息 ID、状态、尝试次数和错误分类。收件邮箱和正文不写入统一日志。

状态含义：
- `pending`：已登记，正在请求服务商
- `accepted`：Resend 接受请求，不代表最终投递成功
- `failed`：请求失败或服务商拒绝
- `delivered`、`bounced`、`complained`：预留给签名验证后的 Webhook 事件

同一业务事件使用稳定 `eventKey`，并将它同时用于数据库唯一键和 Resend `Idempotency-Key`。重试不应生成新的事件键。

## 部署顺序

1. 应用统一日志表迁移。
2. 部署 `email-dispatch`（`verify_jwt=false`，函数内要求 service role 密钥精确匹配）。
3. 部署 `admin-bulk-email`、`maintenance-notify`、`dev-feedback`。
4. 检查 Function 日志、统一日志表和 Resend 状态；以小范围测试确认，不直接向全体成员群发。
5. 再逐步接入更多业务邮件。
6. 后续接入 Resend Webhook 前，必须先提供可安全配置和轮换 Webhook Signing Secret 的方式，并验证签名和事件去重。

## Auth 邮件排障

当前登录页使用 Supabase Auth：
- 注册：`signUp` / `resend(signup)` / `verifyOtp(signup)`
- 找回密码：`resetPasswordForEmail` / `verifyOtp(recovery)` / `updateUser`

本系统不会用自建验证码或普通 Resend API 替代这些调用。若恢复邮件没有到达，应分别检查 Supabase Auth 的 SMTP 发件配置、Auth recover 速率限制、Supabase Auth 日志，以及 Resend SMTP 投递事件。Resend API transactional 邮件列表为空，不能单独证明 Auth SMTP 没有发送。

**审计限制：** 当前连接器不能读取 Supabase Auth Dashboard 中的 SMTP 密码和全部 Auth 配置。因此，上线前仍需从项目 Dashboard 的 Authentication → Emails → SMTP Settings 核对 SMTP host、port、username、发件人，以及 Authentication → Rate Limits 的 recover 配置；不要把 SMTP 密码复制到聊天或代码仓库。
