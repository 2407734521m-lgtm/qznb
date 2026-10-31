import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';
import { confirmDialog } from '../lib/dialog';

/** 账号安全：改密码 / 退出登录 */
export default function MeAccount() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function changePw() {
    if (pw.length < 6) return setMsg('密码至少 6 位');
    if (pw !== pw2) return setMsg('两次输入不一致');
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg('修改失败：' + error.message);
    else { setMsg('密码已修改'); setPw(''); setPw2(''); }
  }

  async function logout() {
    if (!(await confirmDialog('确定退出登录？'))) return;
    await supabase.auth.signOut();
    nav('/login', { replace: true });
  }

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <BackButton fallback="/me" />
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>账号安全</h2>
      <div className="card">
        <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 4 }}>登录邮箱</div>
        <div style={{ fontSize: 14, marginBottom: 14 }}>{session?.user.email || '—'}</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>修改密码</div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="新密码（至少 6 位）" style={{ marginBottom: 8 }} />
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="再输入一次" style={{ marginBottom: 8 }} />
        <button className="pri" disabled={busy} onClick={changePw}>{busy ? '提交中…' : '确认修改'}</button>
        {msg && <p className="priv-note" style={{ margin: '8px 0 0' }}>{msg}</p>}
      </div>
      <div className="card">
        <button className="mini danger" style={{ width: '100%', padding: '10px 0' }} onClick={logout}>退出登录</button>
      </div>
    </div>
  );
}
