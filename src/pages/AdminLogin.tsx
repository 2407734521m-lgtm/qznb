import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PasswordField from '../components/PasswordField';
import { alog } from './admin/shared';

export default function AdminLogin({
  showBack = true,
  onAuthenticated,
}: {
  showBack?: boolean;
  onAuthenticated?: () => void;
}) {
  const [ident, setIdent] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);

  async function recordFailure(failureClass: 'invalid_credentials' | 'rate_limited' | 'network' | 'other') {
    const { error: monitorError } = await supabase.rpc('record_auth_login_failure' as any, {
      p_method: 'admin',
      p_failure_class: failureClass,
    } as any);
    if (monitorError) console.warn('管理员登录失败统计暂不可用：', monitorError.message);
  }

  async function doLogin() {
    const id = ident.trim();
    if (!id) {
      setErr('请输入管理员账号');
      return;
    }
    if (!pw) {
      setErr('请输入密码');
      return;
    }

    setErr('');
    setBusy(true);
    let signedIn = false;

    try {
      let email = id;
      if (!id.includes('@')) {
        const { data, error } = await supabase.rpc('resolve_login_email', { ident: id });
        if (error || !data) throw new Error('invalid_login');
        email = data as string;
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (loginError) throw loginError;
      signedIn = true;
      setPw('');

      // Verify the account's server-side role after password authentication.
      // The database role gate no longer requires an AAL2/TOTP step-up.
      const { data: isAdmin, error: identityError } = await supabase.rpc('admin_login_is_admin' as any);
      if (identityError) throw identityError;
      if (isAdmin !== true) {
        await recordFailure('other');
        await supabase.auth.signOut({ scope: 'local' });
        signedIn = false;
        setErr('账号或密码错误，或该账号没有管理权限');
        return;
      }

      const { data: role, error: roleError } = await supabase.rpc('my_role');
      if (roleError) throw roleError;
      if (role !== 'admin' && role !== 'super_admin') {
        await recordFailure('other');
        await supabase.auth.signOut({ scope: 'local' });
        signedIn = false;
        setErr('管理员权限暂不可用，请稍后重试');
        return;
      }

      await alog('admin_login_success', { method: 'password' });
      setSuccess(true);
      onAuthenticated?.();
    } catch (error) {
      if (signedIn) {
        await supabase.auth.signOut({ scope: 'local' });
      }
      const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
      const failureClass = /429|rate.?limit|too many/.test(message)
        ? 'rate_limited'
        : /network|fetch|timeout|failed to fetch/.test(message)
          ? 'network'
          : 'invalid_credentials';
      await recordFailure(failureClass);
      setErr('账号或密码错误，或暂时无法登录，请检查后重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="login-card" style={{ background: '#0d1017f2', border: '1px solid #ffffff1f', maxWidth: 380, width: '100%' }}>
        <h1 style={{ fontSize: 20 }}>管理后台</h1>
        <p className="sub">管 理 员 登 录</p>

        <label htmlFor="admin-ident">管理员账号</label>
        <input
          id="admin-ident"
          value={ident}
          onChange={(event) => setIdent(event.target.value)}
          placeholder="QQ 邮箱 / 用户名"
          autoComplete="username"
          onKeyDown={(event) => event.key === 'Enter' && void doLogin()}
          disabled={busy || success}
        />

        <label htmlFor="admin-password">密码</label>
        <PasswordField
          value={pw}
          onChange={setPw}
          placeholder="密码"
          autoComplete="current-password"
          onKeyDown={(event) => event.key === 'Enter' && void doLogin()}
        />

        {success && <p className="priv-note" role="status">登录成功，正在进入后台…</p>}
        {err && <p className="err" role="alert">{err}</p>}
        {!success && (
          <button className="pri" disabled={busy} onClick={() => void doLogin()}>
            {busy ? '登录中…' : '登录并进入后台'}
          </button>
        )}
        {showBack && <p className="login-switch"><Link to="/home">← 返回站点</Link></p>}
      </div>
    </div>
  );
}
