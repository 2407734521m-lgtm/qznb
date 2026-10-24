import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// 独立的管理员登录门：和站点登录区分开，输管理员账号+密码才能进后台
export default function AdminLogin({ showBack = true }: { showBack?: boolean }) {
  const [ident, setIdent] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function doLogin() {
    const id = ident.trim();
    if (!id) return setErr('请输入管理员账号');
    if (!pw) return setErr('请输入密码');
    setErr(''); setBusy(true);
    let authenticated = false;
    try {
      let em = id;
      if (!id.includes('@')) {
        const { data, error } = await supabase.rpc('resolve_login_email', { ident: id });
        if (error || !data) throw new Error('invalid_login');
        em = data as string;
      }
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (loginError) throw loginError;
      authenticated = true;
      const { data: role, error: roleError } = await supabase.rpc('my_role');
      if (roleError || (role !== 'admin' && role !== 'super_admin')) {
        await supabase.auth.signOut();
        authenticated = false;
        setErr('账号或密码错误');
        return;
      }
      // 成功：父级检测到 session/role 变化后自动切进后台
    } catch {
      if (authenticated) await supabase.auth.signOut();
      setErr('账号或密码错误，或暂时无法登录，请检查后重试');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="login-card" style={{ background: '#0d1017f2', border: '1px solid #ffffff1f', maxWidth: 340, width: '100%' }}>
        <h1 style={{ fontSize: 20 }}>🛠️ 管理后台</h1>
        <p className="sub">管 理 员 登 录</p>
        <label>管理员账号</label>
        <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="QQ 邮箱 / 用户名"
          autoComplete="username" onKeyDown={e => e.key === 'Enter' && doLogin()} />
        <label>密码</label>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="密码"
          autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && doLogin()} />
        {err && <p className="err">{err}</p>}
        <button className="pri" disabled={busy} onClick={doLogin}>{busy ? '验证中…' : '进入后台'}</button>
        {showBack && <p className="login-switch"><Link to="/members">← 返回站点</Link></p>}
      </div>
    </div>
  );
}
