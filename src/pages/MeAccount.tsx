import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { trustedLoginAvailable } from '../lib/trustedLogin';
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
    if (pw.length < 8) return setMsg('密码至少 8 位');
    if (pw !== pw2) return setMsg('两次输入不一致');
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg('修改失败：' + error.message);
    else { setMsg('密码已修改'); setPw(''); setPw2(''); }
  }

  async function revokeDevices() {
    if (!(await confirmDialog('取消此账号所有已信任设备？不会退出当前会话，下次登录仍需密码。'))) return;
    setBusy(true); setMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('username-login', { body: { action: 'revoke_all_devices' } });
      if (error || !data?.ok) throw new Error();
      setMsg('已撤销所有设备信任；现有会话未退出。');
    } catch { setMsg('撤销失败，请稍后重试。'); }
    finally { setBusy(false); }
  }

  async function logout() {
    if (busy) return;
    if (!(await confirmDialog('只退出当前设备，其他设备会继续保持登录。确定退出吗？', { confirmText: '退出当前设备' }))) return;
    setBusy(true);
    setMsg('');
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        setMsg('退出失败：' + error.message);
        return;
      }
      nav('/login', { replace: true });
    } catch (error) {
      setMsg('退出失败：' + (error instanceof Error ? error.message : '网络异常，请重试'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page" style={{ paddingBottom: 16 }}>
      <BackButton fallback="/me" />
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>账号安全</h2>
      <div className="card">
        <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 4 }}>登录邮箱</div>
        <div style={{ fontSize: 14, marginBottom: 14 }}>{session?.user.email || '—'}</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>修改密码</div>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="新密码（至少 8 位）" style={{ marginBottom: 8 }} />
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="再输入一次" style={{ marginBottom: 8 }} />
        <button className="pri" disabled={busy} onClick={changePw}>{busy ? '提交中…' : '确认修改'}</button>
        {msg && <p className="priv-note" style={{ margin: '8px 0 0' }}>{msg}</p>}
      </div>
      {trustedLoginAvailable && <div className="card"><button disabled={busy} onClick={revokeDevices}>撤销所有已信任设备</button><p className="priv-note">设备信任不代替密码。修改密码后原设备信任自动失效。</p></div>}
      <div className="card">
        <button className="mini danger" style={{ width: '100%', padding: '10px 0' }} disabled={busy} onClick={logout}>退出当前设备</button>
      </div>
    </div>
  );
}
