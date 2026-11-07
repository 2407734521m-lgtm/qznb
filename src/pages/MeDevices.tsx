import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { confirmDialog } from '../lib/dialog';
import SettingsShell from '../components/SettingsShell';

function deviceLabel(ua: string) {
  if (/Android/i.test(ua)) return 'Android 设备';
  if (/iPhone|iPad/i.test(ua)) return /iPad/i.test(ua) ? 'iPad' : 'iPhone';
  if (/Windows/i.test(ua)) return 'Windows 电脑';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac 电脑';
  return '当前浏览器';
}

/** 登录设备管理：独立子页（原为设置页内展开面板，2026-11-07 拆出） */
export default function MeDevices() {
  const { session } = useAuth();
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [message, setMessage] = useState('');
  const currentDevice = useMemo(() => deviceLabel(navigator.userAgent || ''), []);

  async function signOutOtherDevices() {
    if (!(await confirmDialog('退出其他设备上的登录？当前这台设备会保持登录。', { confirmText: '确认退出' }))) return;
    setDeviceBusy(true); setMessage('');
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setDeviceBusy(false);
    setMessage(error ? '操作失败：' + error.message : '已请求退出其他设备上的会话。');
  }

  return (
    <SettingsShell title="登录设备管理">
      <p><b>{currentDevice} · 当前设备</b></p>
      <p>当前浏览器会话 · {session?.user.email || '已登录账号'}</p>
      {session?.expires_at && <p>访问令牌预计到期：{new Date(session.expires_at * 1000).toLocaleString()}</p>}
      <div className="qz-settings-choice">
        <button type="button" disabled={deviceBusy} onClick={() => void signOutOtherDevices()}>{deviceBusy ? '处理中…' : '退出其他设备上的登录'}</button>
      </div>
      {message && <p role="status">{message}</p>}
      <p className="qz-settings-row-note">当前显示本设备；可撤销其他设备会话。暂不支持逐台设备列表与单台撤销。</p>
    </SettingsShell>
  );
}
