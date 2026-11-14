# 管理员备用恢复码方案

> 实现状态：当前 PR 分支已按本方案接入 Supabase 原生 API，涉及 `src/pages/AdminLogin.tsx`、`src/components/AdminMfaSecurity.tsx` 与 `src/lib/supabase.ts`。这仍是 experimental 功能；必须先在 staging 验证 Supabase Auth 服务端支持，再发布。旧代码块用于说明设计，不应整段复制覆盖现有实现。

## 采用 Supabase 原生 Recovery Codes

不建议另建 `recovery_codes` 表或自写密码校验接口。当前仓库安装的 `@supabase/supabase-js` / `@supabase/auth-js` 是 `2.119.0`，已经包含 `supabase.auth.mfa.recoveryCodes` API。Supabase 将该 API 标记为 experimental，需要客户端显式启用；服务端若尚未开放相应 endpoint，会返回 `mfa_recovery_codes_enroll_not_enabled` 或 `mfa_recovery_codes_verify_not_enabled`，所以应先在测试项目验证可用性，再上线。[1] [2]

原生实现负责产生代码、保存及单次消费，并有失败次数锁定。生成时明文只返回一次；验证成功后会把当前 session 升级到 `aal2`，并在 JWT 的 `amr` 中记录 `mfa/recovery_code`。它不需要本项目自行保存恢复码哈希，也不应把明文写进数据库、日志、分析事件或浏览器持久化存储。[1] [2] [3]

## 与现有 TOTP 后端门禁的关系

当前本地 migration 有意要求管理员 JWT 同时满足 `aal2` 和 `amr.method = totp`。因此，恢复码验证成功后虽然是 `aal2`，但只含 `mfa/recovery_code` 的 session 仍会被 `my_role()` 降为 `member`，不能直接进入后台。

建议保留这个边界：恢复码只允许开始“重新绑定 TOTP”的恢复流程。用户输入密码及一枚未使用恢复码后，应用在同一页面立即发起新的 TOTP enrollment；显示二维码，用户扫描并验证新 TOTP。只有新 TOTP 验证成功、JWT 的 `amr` 含 `totp` 后，才允许进入完整后台。这样丢失手机时能恢复，同时不会把备用码变成一条绕过既有 TOTP 后端策略的通道。

### 1. 仅在管理员域名启用 SDK 功能

在 `src/lib/supabase.ts` 的 `authOptions` 中，把实验开关放进现有管理员域名分支，不必对主站普通用户启用：

```ts
const authOptions = {
  persistSession: true,
  autoRefreshToken: true,
  ...(isDedicatedAdminHost
    ? {
        storageKey: 'qznb-admin-auth-v1',
        experimental: { recoveryCodes: true },
      }
    : {}),
};
```

如果当前实际工作区中的选项结构与示例略有不同，只需把 `experimental` 加到传给 `createClient(..., { auth: authOptions })` 的管理员 `auth` 选项中。

### 2. 登录页加入“备用恢复码”入口

当管理员已有已验证的 TOTP factor、当前页面显示 TOTP challenge 时，提供一个次要入口。验证恢复码后，不调用 `finishAdminLogin()`；改为马上启动新的 TOTP enrollment：

```ts
async function verifyRecoveryCode(code: string) {
  const { error } = await supabase.auth.mfa.recoveryCodes.verify({ code });
  if (error) throw error; // 包括错误码、已用码和服务端锁定；不要自行绕过

  const { data: aal, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError || aal.currentLevel !== 'aal2') {
    throw new Error('recovery_verification_failed');
  }

  const methods = aal.currentAuthenticationMethods.map((entry) =>
    typeof entry === 'string' ? entry : entry.method
  );
  if (!methods.includes('mfa/recovery_code')) {
    throw new Error('recovery_verification_failed');
  }

  // Recovery code 已经消耗，但 my_role() 仍只给 member。
  // 在当前页面为管理员绑定替代 TOTP；不要先渲染 AdminShell。
  const { data: enrollment, error: enrollError } =
    await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: '管理员替代验证器',
    });
  if (enrollError) throw enrollError;

  setFactorId(enrollment.id);
  setQrCode(enrollment.totp.qr_code);
  setSecret(enrollment.totp.secret);
  setStep('enroll');
}
```

继续复用现有 `challenge` + `verify` TOTP 代码。TOTP 验证成功后，再调用现有 `finishAdminLogin()`。如果用户刷新页面，启动时先检查 AAL 和 `currentAuthenticationMethods`：若 session 是 `aal2` 且包含 `mfa/recovery_code`、但尚无 `totp`，应恢复到 TOTP 重绑步骤，而不是要求已经消耗的恢复码再输一次，也不能开放后台。

Supabase 对 recovery code 校验做单次消费；格式大小写、空格和连字符会标准化。多次错误会返回 `mfa_recovery_codes_locked` 并暂时锁定。界面应显示通用错误及稍后重试提示，不能自行记录尝试次数来解锁。[2]

### 3. 后台安全设置页生成与轮换

在管理员“账户安全”里，显示 `remaining` 数量；状态查询不会返回旧码。实际界面在每次生成/轮换前会重新发起 TOTP challenge/verify，而不只信任历史 AAL2 session。服务端也会要求 `aal2` 且已有另一个已验证 factor，恢复码不会成为唯一 factor。[1]

```ts
async function generateRecoveryCodes() {
  const { data: aal, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const methods = aal?.currentAuthenticationMethods.map((entry) =>
    typeof entry === 'string' ? entry : entry.method
  ) ?? [];
  if (aalError || aal?.currentLevel !== 'aal2' || !methods.includes('totp')) {
    throw new Error('请先完成 TOTP 验证');
  }

  const { data, error } = await supabase.auth.mfa.recoveryCodes.generate({
    friendlyName: '管理员备用恢复码',
  });
  if (error) throw error;

  // 只放 React 内存状态，展示一次；绝不 console.log、localStorage 或发邮件。
  setRecoveryCodes(data.codes);
}

async function loadRecoveryCodeStatus() {
  const { data, error } =
    await supabase.auth.mfa.recoveryCodes.getStatus();
  if (error) throw error;
  setRecoveryCodesRemaining(data.remaining);
}

async function rotateRecoveryCodes() {
  if (!window.confirm('旧码会立即全部失效。请确认可以马上保存新的一组。')) return;
  const { data, error } =
    await supabase.auth.mfa.recoveryCodes.regenerate();
  if (error) throw error;
  setRecoveryCodes(data.codes); // 新码只显示这一次
}
```

生成后明确提示用户将代码保存在离线或受保护的密码管理器中，并要求勾选“我已安全保存”后才能关闭面板。不要自动复制到剪贴板，也不要提供可被日志或云同步误收集的下载链接。轮换会让旧组立即失效；已生成但未保存的用户必须重新轮换。

## 上线前检查

先在 staging 管理员账户验证 SDK 实验开关与 Supabase Auth 服务端功能均可用，再合并 UI。至少测试首次生成、只显示一次、状态只显示剩余数、一个恢复码只能使用一次、连续错误后触发锁定、用恢复码后只进入 TOTP 重绑、重新绑定 TOTP 后才获得后台权限，以及轮换后旧码立即失效。

当前 Supabase 官方文档一处一般 MFA 指南仍建议备用 TOTP，而新 JS API 文档已列出 experimental Recovery Codes；应以目标项目 Auth 服务端实际支持情况为准。若服务端返回 `*_not_enabled`，先不要自建自定义码库或放宽 `my_role()`；可以先登记第二个 TOTP factor 作为备用。若恢复码和所有 TOTP 均丢失，使用受控的 Supabase 项目所有者恢复流程；官方 Admin API 的 `deleteFactor` 是服务端能力，删除已验证 factor 会让该用户所有活跃 session 登出，`service_role` 不能出现在浏览器代码里。[1] [4]

**References**

[1]: https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-generate "Supabase Auth MFA recovery codes API"
[2]: https://supabase.com/docs/reference/javascript/auth-mfa-recovery-codes-verify "Supabase Recovery Codes verification API"
[3]: https://supabase.com/docs/guides/auth/jwt-fields "Supabase JWT claims reference"
[4]: https://supabase.com/docs/reference/javascript/auth-admin-mfa-deletefactor "Supabase Admin API delete MFA factor"
