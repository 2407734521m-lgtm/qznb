import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';
import { confirmDialog } from '../lib/dialog';

type MotionPreference = 'system' | 'reduce' | 'full';
type NotificationKey = 'comment' | 'like' | 'greeting' | 'notice' | 'feedback';
type Preferences = { motion: MotionPreference; notifications: Record<NotificationKey, boolean> };
const DEFAULTS: Preferences = { motion: 'system', notifications: { comment: true, like: true, greeting: true, notice: true, feedback: true } };
const LABELS: Record<NotificationKey, string> = { comment: '评论与回复', like: '点赞提醒', greeting: '留言提醒', notice: '公告提醒', feedback: '反馈处理进度' };
function deviceLabel(ua: string) {
  if (/Android/i.test(ua)) return 'Android 设备';
  if (/iPhone|iPad/i.test(ua)) return /iPad/i.test(ua) ? 'iPad' : 'iPhone';
  if (/Windows/i.test(ua)) return 'Windows 电脑';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac 电脑';
  return '当前浏览器';
}
function readPreferences(uid: string): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem('qznb_user_preferences_v1:' + uid) || 'null');
    return { motion: ['system', 'reduce', 'full'].includes(raw?.motion) ? raw.motion : 'system', notifications: { ...DEFAULTS.notifications, ...(raw?.notifications || {}) } };
  } catch { return DEFAULTS; }
}
export default function MeSettings() {
  const nav = useNavigate();
  const { session } = useAuth();
  const uid = session!.user.id;
  const [prefs, setPrefs] = useState<Preferences>(() => readPreferences(uid));
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [message, setMessage] = useState('');
  const currentDevice = useMemo(() => deviceLabel(navigator.userAgent || ''), []);
  useEffect(() => {
    try { localStorage.setItem('qznb_user_preferences_v1:' + uid, JSON.stringify(prefs)); } catch {}
    try { localStorage.setItem('qznb_motion_preference_v1', prefs.motion); } catch {}
    window.dispatchEvent(new Event('qznb-settings-changed'));
  }, [prefs, uid]);
  function toggle(key: NotificationKey, checked: boolean) {
    setPrefs(old => ({ ...old, notifications: { ...old.notifications, [key]: checked } }));
  }
  async function signOutOtherDevices() {
    if (!(await confirmDialog('退出其他设备上的登录？当前这台设备会保持登录。'))) return;
    setDeviceBusy(true); setMessage('');
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setDeviceBusy(false);
    setMessage(error ? '操作失败：' + error.message : '已请求退出其他设备上的会话。');
  }
  return (
    <main className="page" style={{ paddingBottom: 110, color: '#203b4b' }}>
      <BackButton fallback="/me" />
      <header style={{ margin: '8px 0 18px' }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#63818c' }}>PREFERENCES · ACCOUNT</div>
        <h1 style={{ fontSize: 23, margin: '5px 0' }}>设置中心</h1>
        <p style={{ margin: 0, color: '#748792', fontSize: 13 }}>管理账号、隐私、通知与使用体验</p>
      </header>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>账号与隐私</h2>
        <p style={{ fontSize: 12, color: 'var(--mut)', margin: '0 0 12px' }}>沿用现有的安全与资料隐私控制</p>
        <button className="mini ghost" style={{ width: '100%', marginBottom: 8 }} onClick={() => nav('/me/account')}>账号与安全　›</button>
        <button className="mini ghost" style={{ width: '100%', marginBottom: 8 }} onClick={() => nav('/me/edit?sec=priv')}>隐私权限　›</button>
        <button className="mini ghost" style={{ width: '100%' }} onClick={() => nav('/me/edit?sec=look')}>个人主页主题与背景　›</button>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>消息通知偏好</h2>
        <p style={{ fontSize: 12, color: 'var(--mut)', margin: '0 0 10px' }}>关闭后会在通知中心隐藏对应类别，不会删除历史通知。</p>
        {(Object.keys(LABELS) as NotificationKey[]).map(key => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid #edf1f3', fontSize: 13 }}>
            <span>{LABELS[key]}</span><input type="checkbox" checked={prefs.notifications[key]} onChange={e => toggle(key, e.target.checked)} />
          </label>
        ))}
        <p style={{ fontSize: 11, color: 'var(--mut)', margin: '8px 0 0' }}>偏好保存在当前设备浏览器中；目前不会阻止服务器生成通知，也不会关闭私信未读计数。</p>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>主题与动画</h2>
        <p style={{ fontSize: 12, color: 'var(--mut)', margin: '0 0 12px' }}>主题和背景可在主页装修中调整；这里控制页面动效。</p>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 7 }}>动画偏好</label>
        <select value={prefs.motion} onChange={e => setPrefs(old => ({ ...old, motion: e.target.value as MotionPreference }))} style={{ width: '100%', padding: 11, borderRadius: 12, border: '1px solid #dce7eb', background: '#fff' }}>
          <option value="system">跟随设备设置</option><option value="reduce">减少动画</option><option value="full">允许完整动画</option>
        </select>
        <p style={{ fontSize: 11, color: 'var(--mut)', margin: '8px 0 0' }}>减少动画会关闭页面过渡；完整动画仍尊重设备强制减少动态效果的设置。</p>
      </section>
      <section className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>登录设备管理</h2>
        <div style={{ border: '1px solid #e4edef', borderRadius: 14, padding: 12, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{currentDevice} · 当前设备</div>
          <div style={{ color: 'var(--mut)', fontSize: 11, marginTop: 4 }}>当前浏览器会话 · {session?.user.email || '已登录账号'}</div>
          {session?.expires_at && <div style={{ color: 'var(--mut)', fontSize: 11, marginTop: 3 }}>访问令牌预计到期：{new Date(session.expires_at * 1000).toLocaleString()}</div>}
        </div>
        <button className="mini ghost" style={{ width: '100%', marginTop: 10 }} disabled={deviceBusy} onClick={() => void signOutOtherDevices()}>{deviceBusy ? '处理中…' : '退出其他设备上的登录'}</button>
        {message && <p role="status" style={{ fontSize: 12, color: '#176477', margin: '8px 0 0' }}>{message}</p>}
        <p style={{ fontSize: 11, color: 'var(--mut)', margin: '8px 0 0' }}>当前显示本设备；可撤销其他设备会话。暂不支持逐台设备列表与单台撤销。</p>
      </section>
    </main>
  );
}
