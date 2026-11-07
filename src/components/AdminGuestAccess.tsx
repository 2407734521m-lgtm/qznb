import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { card, h3, mut } from '../pages/admin/shared';
import { confirmDialog } from '../lib/dialog';
import DateTimeField from './DateTimeField';

const SESSION_DURATIONS = [
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 120, label: '2 小时' },
  { value: 240, label: '4 小时' },
  { value: 480, label: '8 小时' },
  { value: 720, label: '12 小时' },
  { value: 1440, label: '24 小时' },
] as const;

function toLocalDateTimeInput(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

type GuestSettings = Record<string, string>;

export default function AdminGuestAccess({ setMsg }: { setMsg: (message: string) => void }) {
  const [settings, setSettings] = useState<GuestSettings>({
    guest_browse_enabled: 'true',
    guest_entry_visible: 'true',
    guest_session_minutes: '60',
    guest_session_epoch: '1',
    guest_show_love_wall: 'true',
    guest_show_announcements: 'true',
    guest_schedule: '{"enabled":false,"start_at":null,"end_at":null}',
  });
  const [scheduleStart, setScheduleStart] = useState('');
  const [scheduleEnd, setScheduleEnd] = useState('');
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_get_guest_access_settings' as any);
    setLoading(false);
    if (error || !data || typeof data !== 'object') {
      setMsg('读取游客访问设置失败：' + (error?.message || '返回数据无效'));
      return;
    }
    const next = { ...settings, ...(data as Record<string, string>) };
    setSettings(next);
    try {
      const plan = JSON.parse(next.guest_schedule || '{}');
      setScheduleStart(toLocalDateTimeInput(plan.start_at || ''));
      setScheduleEnd(toLocalDateTimeInput(plan.end_at || ''));
      setScheduleEnabled(plan.enabled === true);
    } catch {
      setScheduleStart('');
      setScheduleEnd('');
      setScheduleEnabled(false);
      setMsg('游客定时计划格式异常，请重新设置。');
    }
  }

  useEffect(() => { void load(); }, []);

  async function save(key: string, value: string, successMessage?: string) {
    setBusy(key);
    const { error } = await supabase.rpc('admin_save_guest_access_setting' as any, {
      p_key: key,
      p_value: value,
    });
    setBusy(null);
    if (error) {
      setMsg('保存游客设置失败：' + error.message);
      return false;
    }
    setSettings(current => ({ ...current, [key]: value }));
    if (successMessage) setMsg(successMessage);
    return true;
  }

  async function saveGuestSchedule() {
    if (!scheduleStart || !scheduleEnd) return setMsg('请同时设置游客开放开始和结束时间。');
    const start = new Date(scheduleStart);
    const end = new Date(scheduleEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return setMsg('游客开放时间格式无效，请重新选择。');
    if (end <= start) return setMsg('游客开放结束时间必须晚于开始时间。');
    if (end <= new Date()) return setMsg('游客开放结束时间必须晚于当前时间。');
    const value = JSON.stringify({ enabled: true, start_at: start.toISOString(), end_at: end.toISOString() });
    const ok = await save('guest_schedule', value, '游客开放计划已保存；仅在设定时间段内允许游客进入。');
    if (ok) setScheduleEnabled(true);
  }

  async function clearGuestSchedule() {
    if (!(await confirmDialog('取消游客定时开放计划？游客入口将改为由总开关控制。'))) return;
    const value = JSON.stringify({ enabled: false, start_at: null, end_at: null });
    const ok = await save('guest_schedule', value, '游客定时开放计划已取消。');
    if (ok) {
      setScheduleEnabled(false);
      setScheduleStart('');
      setScheduleEnd('');
    }
  }

  async function revokeGuestSessions() {
    if (!(await confirmDialog(
      '立即结束所有游客会话？已进入的游客会在下一次配置刷新时退出，最迟约 15 秒；今后仍可按设置重新进入。',
      { danger: true, confirmText: '立即清退' }
    ))) return;
    const currentEpoch = Math.max(1, Number.parseInt(settings.guest_session_epoch || '1', 10) || 1);
    const nextEpoch = currentEpoch + 1;
    setRevokeBusy(true);
    const { error } = await supabase.rpc('admin_save_guest_access_setting' as any, {
      p_key: 'guest_session_epoch',
      p_value: String(nextEpoch),
    });
    setRevokeBusy(false);
    if (error) {
      setMsg('清退游客失败：' + error.message);
      return;
    }
    setSettings(current => ({ ...current, guest_session_epoch: String(nextEpoch) }));
    setMsg('清退指令已生效，当前游客会话将在配置刷新后自动结束。');
  }

  const switches = [
    { key: 'guest_browse_enabled', label: '游客浏览总开关', detail: '关闭后停止新的游客进入，并让现有游客会话自动退出。' },
    { key: 'guest_entry_visible', label: '显示「游客登录」按钮', detail: '关闭后隐藏登录页、公开首页和登录入口关闭页中的游客按钮。' },
    { key: 'guest_show_love_wall', label: '允许游客查看表白墙', detail: '关闭后游客无法读取表白内容、评论数量及表白墙附件。' },
    { key: 'guest_show_announcements', label: '允许游客查看公告', detail: '关闭后游客首页不再显示公开公告，也无法打开公告列表。' },
  ];

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={card}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h3 style={h3}>游客访问管理</h3>
          <span style={{ ...mut, fontSize: 11 }}>只读访问 · 不计入成员</span>
        </div>
        <p style={mut}>游客无需邮箱和密码，只能查看你允许公开的内容。昵称只保存在当前浏览器标签页，不创建正式账号，也不会计入成员人数或在线成员统计。</p>
        {loading ? <p style={mut}>正在读取游客设置…</p> : (
          <>
            <div style={{ display: 'grid', gap: 9 }}>
              {switches.map(item => {
                const enabled = settings[item.key] !== 'false';
                return <div key={item.key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '11px 12px', borderRadius: 12, border: '1px solid #e5eaf2', background: '#f8fafc',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</div>
                    <div style={{ ...mut, fontSize: 11.5 }}>{item.detail}</div>
                    <div style={{ fontSize: 10.5, marginTop: 3, color: enabled ? '#16835d' : '#a33f48' }}>{enabled ? '已开启' : '已关闭'}</div>
                  </div>
                  <button type="button" className={enabled ? 'mini ghost' : 'mini'}
                    disabled={busy !== null || revokeBusy}
                    style={{ minWidth: 74, flexShrink: 0 }}
                    onClick={async () => {
                      const next = !enabled;
                      if (!next && !(await confirmDialog(
                        item.key === 'guest_browse_enabled'
                          ? '关闭游客浏览后，游客将不能继续浏览；正式账号不受影响。确定关闭？'
                          : `关闭「${item.label}」后，游客将无法再看到对应入口或内容。确定继续？`,
                        { danger: true }
                      ))) return;
                      void save(item.key, String(next), `${item.label}已${next ? '开启' : '关闭'}。`);
                    }}>
                    {busy === item.key ? '保存中…' : enabled ? '关闭' : '开启'}
                  </button>
                </div>;
              })}
            </div>

            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5eaf2' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>游客会话有效期</div>
              <p style={{ ...mut, margin: '0 0 9px' }}>从游客进入时开始计时，到期自动退出；浏览期间不会自动延长。关闭浏览器标签页也会结束本次游客身份。</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {SESSION_DURATIONS.map(option => {
                  const active = Number(settings.guest_session_minutes || 60) === option.value;
                  return <button key={option.value} type="button"
                    className={active ? 'mini' : 'mini ghost'}
                    disabled={busy !== null || revokeBusy}
                    onClick={() => void save('guest_session_minutes', String(option.value), `游客会话有效期已设置为${option.label}。`)}
                    style={{ minWidth: 72 }}>
                    {option.label}
                  </button>;
                })}
              </div>
              <p style={{ ...mut, margin: '8px 0 0' }}>当前有效期：{SESSION_DURATIONS.find(x => x.value === Number(settings.guest_session_minutes || 60))?.label || '1 小时'}</p>
            </div>

            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5eaf2' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 5 }}>定时开放游客入口</div>
              <p style={{ ...mut, margin: '0 0 10px' }}>按当前设备时区设置。计划启用后，只有在开始与结束时间之间允许游客进入；到期自动关闭，不需要管理员在线。</p>
              <label style={mut}>开放开始时间</label>
              <DateTimeField value={scheduleStart} onChange={setScheduleStart} style={{ margin: '5px 0 10px' }} />
              <label style={mut}>开放结束时间</label>
              <DateTimeField value={scheduleEnd} onChange={setScheduleEnd} style={{ margin: '5px 0 10px' }} />
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="pri" style={{ width: 'auto' }} disabled={busy !== null || revokeBusy} onClick={() => void saveGuestSchedule()}>
                  {busy === 'guest_schedule' ? '保存中…' : '保存并启用计划'}
                </button>
                <button className="mini ghost" disabled={busy !== null || revokeBusy || !scheduleEnabled} onClick={() => void clearGuestSchedule()}>
                  取消定时计划
                </button>
              </div>
              {scheduleEnabled && <p style={{ ...mut, margin: '9px 0 0', color: '#16835d' }}>
                定时计划已启用 · {scheduleStart ? new Date(scheduleStart).toLocaleString() : '未设置'} 至 {scheduleEnd ? new Date(scheduleEnd).toLocaleString() : '未设置'}
              </p>}
            </div>

            <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: '#fff7f7', border: '1px solid #f2dddd' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#963f4a', marginBottom: 5 }}>紧急清退游客</div>
              <p style={{ ...mut, margin: '0 0 10px' }}>立即撤销所有当前游客会话。清退后游客需要重新输入昵称进入；不会影响正式成员或管理员。</p>
              <button type="button" className="mini" disabled={revokeBusy || busy !== null} onClick={() => void revokeGuestSessions()}>
                {revokeBusy ? '正在清退…' : '立即结束全部游客会话'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
