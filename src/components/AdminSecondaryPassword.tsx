import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { alog, card, h3, mut } from '../pages/admin/shared';

export default function AdminSecondaryPassword() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: statusError } = await supabase.rpc(
        'admin_secondary_password_status' as any
      );
      if (statusError) throw statusError;
      setConfigured(data === true);
    } catch {
      setConfigured(null);
      setError('暂时无法读取二级密码状态，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function changePassword() {
    if (!/^\d{6}$/.test(currentPin)) {
      setError('请输入当前 6 位二级密码。');
      return;
    }
    if (!/^\d{6}$/.test(newPin) || !/^\d{6}$/.test(confirmPin)) {
      setError('新二级密码必须为 6 位数字。');
      return;
    }
    if (newPin !== confirmPin) {
      setError('两次输入的新二级密码不一致。');
      return;
    }
    if (/^(\d)\1{5}$/.test(newPin)
      || ['012345', '123456', '234567', '345678', '456789',
        '987654', '876543', '765432', '654321', '543210'].includes(newPin)) {
      setError('请勿使用连续数字或 6 位相同数字。');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data, error: changeError } = await supabase.rpc(
        'admin_change_secondary_password' as any,
        { p_current_pin: currentPin, p_new_pin: newPin } as any
      );
      if (changeError) throw changeError;
      if (data !== true) throw new Error('secondary_pin_change_failed');

      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setNotice('二级密码已更新。本设备保持后台授权，其他登录设备的后台授权已撤销。');
      void alog('admin_secondary_password_changed', { method: 'current_pin' });
      await loadStatus();
    } catch {
      setCurrentPin('');
      setError('修改失败：当前二级密码错误、验证已锁定，或新密码格式无效。');
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ display: 'grid', gap: 12 }}>
    <section style={{ ...card, margin: 0 }}>
      <h3 style={h3}>管理员二级密码</h3>
      <p style={mut}>
        每个管理员账号分别设置 6 位数字二级密码。密码仅以慢速哈希保存；连续验证失败会暂时锁定验证。
      </p>
      {loading && <p style={mut}>正在读取状态…</p>}
      {configured === false && <p role="alert" style={{ color: '#b42336', fontSize: 13 }}>
        当前账号尚未完成二级密码设置。请退出后台后重新登录，按照登录页提示完成首次设置。
      </p>}
      {configured === true && <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
        <label htmlFor="admin-current-pin" style={{ fontSize: 13, fontWeight: 700 }}>当前二级密码</label>
        <input id="admin-current-pin" type="password" value={currentPin}
          onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="current-password" maxLength={6} placeholder="输入当前 6 位密码" />
        <label htmlFor="admin-new-pin" style={{ fontSize: 13, fontWeight: 700 }}>新二级密码</label>
        <input id="admin-new-pin" type="password" value={newPin}
          onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="输入新的 6 位密码" />
        <label htmlFor="admin-confirm-pin" style={{ fontSize: 13, fontWeight: 700 }}>确认新二级密码</label>
        <input id="admin-confirm-pin" type="password" value={confirmPin}
          onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="再次输入新密码" />
        <button type="button" className="mini" disabled={busy || loading} onClick={() => void changePassword()}>
          {busy ? '正在更新…' : '更新二级密码'}
        </button>
      </div>}
      {error && <p role="alert" style={{ color: '#b42336', fontSize: 13 }}>{error}</p>}
      {notice && <p role="status" style={{ color: '#166534', fontSize: 13 }}>{notice}</p>}
      <button type="button" className="mini" disabled={busy || loading} onClick={() => void loadStatus()}>
        {loading ? '读取中…' : '刷新状态'}
      </button>
    </section>
    <p style={{ ...mut, margin: 0 }}>
      6 位密码的强度低于身份验证器。请使用不重复、不连续的数字组合，并避免与账号登录密码相同。
    </p>
  </div>;
}
