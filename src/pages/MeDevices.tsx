import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { confirmDialog } from '../lib/dialog';
import SettingsShell from '../components/SettingsShell';

function getDeviceLabel(ua: string) {
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android 手机' : 'Android 平板或设备';
  if (/Windows/i.test(ua)) return 'Windows 电脑';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac 电脑';
  if (/Linux/i.test(ua)) return 'Linux 设备';
  return '当前设备';
}

function getBrowserLabel(ua: string) {
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/EdgA?\//i.test(ua)) return 'Microsoft Edge';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/CriOS\//i.test(ua)) return 'Chrome（iOS）';
  if (/FxiOS\//i.test(ua)) return 'Firefox（iOS）';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  if (/wv\)/i.test(ua)) return 'Android WebView';
  return '当前浏览器';
}

type Notice = { kind: 'success' | 'error'; text: string };

export default function MeDevices() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [busyAction, setBusyAction] = useState<'others' | 'all' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const userAgent = useMemo(() => navigator.userAgent || '', []);
  const currentDevice = useMemo(() => getDeviceLabel(userAgent), [userAgent]);
  const currentBrowser = useMemo(() => getBrowserLabel(userAgent), [userAgent]);
  const isMobile = useMemo(() => /Android|iPhone|iPad|Mobile/i.test(userAgent), [userAgent]);

  async function signOutOtherDevices() {
    if (busyAction) return;
    const confirmed = await confirmDialog(
      '将撤销此账号在其他手机、平板和电脑上的持续登录权限；当前设备会保持登录。',
      { confirmText: '退出其他设备' },
    );
    if (!confirmed) return;

    setBusyAction('others');
    setNotice(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      setNotice({
        kind: 'success',
        text: '已撤销其他设备的持续登录权限，当前设备仍保持登录。',
      });
    } catch (error) {
      setNotice({
        kind: 'error',
        text: '操作失败：' + (error instanceof Error ? error.message : '网络异常，请重试'),
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function signOutAllDevices() {
    if (busyAction) return;
    const confirmed = await confirmDialog(
      '这会退出当前设备和此账号在其他所有设备上的登录。下次使用需要重新登录。',
      { confirmText: '退出所有设备', danger: true },
    );
    if (!confirmed) return;

    setBusyAction('all');
    setNotice(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) throw error;
      nav('/login', { replace: true });
    } catch (error) {
      setNotice({
        kind: 'error',
        text: '操作失败：' + (error instanceof Error ? error.message : '网络异常，请重试'),
      });
      setBusyAction(null);
    }
  }

  return (
    <SettingsShell title="登录设备管理">
      <style>{`
        .qz-device-hero{padding:17px;border:1px solid #e9dfd2;border-radius:17px;background:linear-gradient(145deg,#fff,#f8f2e9)}
        .qz-device-eyebrow{margin:0 0 7px!important;color:#8b6b53!important;font-size:10px!important;letter-spacing:.12em;font-weight:700}
        .qz-device-title{margin:0!important;color:#302a24!important;font-size:18px!important;font-weight:650!important;line-height:1.4!important}
        .qz-device-desc{margin:7px 0 0!important;color:#7b7064!important;font-size:12px!important;line-height:1.75!important}
        .qz-device-current{display:flex;align-items:center;gap:12px;margin-top:14px;padding:14px 12px;border:1px solid #eee6dc;border-radius:15px;background:#fff}
        .qz-device-icon{width:44px;height:44px;flex:0 0 44px;display:grid;place-items:center;border-radius:14px;background:#f2e9df;color:#805b42}
        .qz-device-current-copy{min-width:0;flex:1}
        .qz-device-current-copy strong{display:block;color:#332d26;font-size:14px;font-weight:650;overflow-wrap:anywhere}
        .qz-device-current-copy span{display:block;margin-top:4px;color:#82776c;font-size:11px;overflow-wrap:anywhere}
        .qz-device-current-tag{padding:5px 8px;border-radius:999px;background:#f3eee7;color:#80674f;font-size:10px;white-space:nowrap}
        .qz-device-action{margin-top:16px;padding-top:14px;border-top:1px solid #eee6dc}
        .qz-device-action h3{margin:0;color:#332d26;font-size:14px;font-weight:650}
        .qz-device-action p{margin:6px 0 0;color:#80766b;font-size:12px;line-height:1.7}
        .qz-device-buttons{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}
        .qz-device-buttons button{min-height:39px}
        .qz-device-buttons .qz-device-danger{border:1px solid #ecd8d3;background:#fff8f6;color:#a24b3b}
        .qz-device-notice{margin-top:12px!important;padding:10px 12px;border-radius:12px;font-size:12px!important;line-height:1.65}
        .qz-device-notice.success{background:#f0f6ef;color:#416c49!important}
        .qz-device-notice.error{background:#fbefed;color:#9a4438!important}
        .qz-device-foot{margin-top:14px!important;padding-top:12px;border-top:1px solid #eee6dc;color:#83786c!important;font-size:11px!important;line-height:1.75!important}
        @media(max-width:380px){.qz-device-current{gap:9px;padding:12px 9px}.qz-device-current-tag{font-size:9px;padding:4px 6px}.qz-device-icon{width:40px;height:40px;flex-basis:40px}}
      `}</style>

      <section className="qz-device-hero" aria-label="多设备登录说明">
        <p className="qz-device-eyebrow">ACCOUNT ACCESS</p>
        <h2 className="qz-device-title">一个账号，多台设备同时使用</h2>
        <p className="qz-device-desc">
          手机、平板、电脑和已安装的应用都可以分别登录。同一浏览器的多个标签页通常共享一次登录，不会被重复计算成多台设备。
        </p>
      </section>

      <section className="qz-device-current" aria-label="当前会话所在设备">
        <div className="qz-device-icon" aria-hidden="true">
          {isMobile ? (
            <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="2.5" width="12" height="19" rx="2.2"/><path d="M10 18.3h4"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2.5" y="3.5" width="19" height="13" rx="1.8"/><path d="M8 20.5h8M12 16.5v4"/>
            </svg>
          )}
        </div>
        <div className="qz-device-current-copy">
          <strong>{currentDevice} · {currentBrowser}</strong>
          <span>{session?.user.email || '当前已登录账号'}</span>
        </div>
        <span className="qz-device-current-tag">本次会话</span>
      </section>

      <section className="qz-device-action">
        <h3>会话管理</h3>
        <p>不认识其他设备上的登录时，可以撤销它们的持续登录权限，并保留当前设备。</p>
        <div className="qz-device-buttons">
          <button type="button" disabled={busyAction !== null} onClick={() => void signOutOtherDevices()}>
            {busyAction === 'others' ? '正在退出…' : '退出其他设备'}
          </button>
          <button className="qz-device-danger" type="button" disabled={busyAction !== null} onClick={() => void signOutAllDevices()}>
            {busyAction === 'all' ? '正在退出…' : '退出所有设备'}
          </button>
        </div>
        {notice && <p className={`qz-device-notice ${notice.kind}`} role="status" aria-live="polite">{notice.text}</p>}
      </section>

      <p className="qz-device-foot">
        安全提示：当前页面仅能准确识别本次会话所在的设备和浏览器。为避免展示不准确的设备/IP/在线时间，暂不生成其他设备清单。
        撤销会话后，其他设备已签发的短期访问令牌可能在到期前短暂有效；需要刷新登录状态时将无法继续使用。
        发现陌生登录时，建议同时修改账号密码。
      </p>
    </SettingsShell>
  );
}
