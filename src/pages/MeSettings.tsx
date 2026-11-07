import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { confirmDialog } from '../lib/dialog';
import FeedbackModal from '../components/FeedbackModal';
import { DEFAULT_USER_PREFERENCES, normalizeUserPreferences, type UserPreferences } from '../lib/userPreferences';

type NotificationKey = 'comment' | 'like' | 'greeting' | 'notice' | 'feedback' | 'love_wall' | 'admin_message' | 'moderation' | 'friend_request';
type Preferences = UserPreferences;
type PanelKey = 'general' | 'notifications' | 'devices' | 'font' | 'search' | 'chat';
type IconName = 'account' | 'lock' | 'settings' | 'bell' | 'chat' | 'play' | 'wallpaper' | 'palette' | 'font' | 'device' | 'key' | 'history' | 'content' | 'help';

const DEFAULTS: Preferences = DEFAULT_USER_PREFERENCES;
const LABELS: Record<NotificationKey, string> = { comment: '评论与回复', like: '点赞提醒', greeting: '留言提醒', notice: '公告提醒', feedback: '反馈处理进度', love_wall: '表白墙提醒', admin_message: '管理员私信', moderation: '纪律处理通知', friend_request: '好友申请提醒' };

function deviceLabel(ua: string) {
  if (/Android/i.test(ua)) return 'Android 设备';
  if (/iPhone|iPad/i.test(ua)) return /iPad/i.test(ua) ? 'iPad' : 'iPhone';
  if (/Windows/i.test(ua)) return 'Windows 电脑';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac 电脑';
  return '当前浏览器';
}
function readSearchHistory(uid: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('qznb_search_history_v2:' + uid) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 6) : [];
  } catch { return []; }
}
function readPreferences(uid: string): Preferences {
  try {
    const raw = JSON.parse(localStorage.getItem('qznb_user_preferences_v1:' + uid) || 'null');
    return normalizeUserPreferences(raw);
  } catch { return DEFAULTS; }
}
function SettingIcon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" {...common}>
      {name === 'account' && <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6.5 18c.8-2.5 2.7-3.8 5.5-3.8s4.7 1.3 5.5 3.8"/></>}
      {name === 'lock' && <><rect x="4.5" y="10" width="15" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>}
      {name === 'settings' && <><path d="m12 2 1.3 2.4 2.7.7 2.3-1.4 2 2-1.4 2.3.7 2.7L22 12l-2.4 1.3-.7 2.7 1.4 2.3-2 2-2.3-1.4-2.7.7L12 22l-1.3-2.4-2.7-.7-2.3 1.4-2-2 1.4-2.3-.7-2.7L2 12l2.4-1.3.7-2.7-1.4-2.3 2-2 2.3 1.4 2.7-.7L12 2Z"/><circle cx="12" cy="12" r="3"/></>}
      {name === 'bell' && <><path d="M18 9a6 6 0 0 0-12 0c0 7-2.5 7-2.5 9h17C20.5 16 18 16 18 9Z"/><path d="M10 21h4"/></>}
      {name === 'chat' && <><path d="M20.5 11.5a8.5 8.5 0 0 1-9 8.5 9.8 9.8 0 0 1-4.3-1L3 20l1.2-3.7A8.1 8.1 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 8.5 8.5Z"/><circle cx="8" cy="11.5" r=".8"/><circle cx="12" cy="11.5" r=".8"/><circle cx="16" cy="11.5" r=".8"/></>}
      {name === 'play' && <><rect x="4" y="3" width="12" height="18" rx="2"/><path d="m10 8 4 4-4 4"/><path d="M19 7v10"/></>}
      {name === 'wallpaper' && <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4m0-15.6-1.4 1.4M5.6 18.4l-1.4 1.4"/></>}
      {name === 'palette' && <><path d="M12 3a9 9 0 1 0 0 18h1.2a2.2 2.2 0 0 0 1.6-3.7 1.8 1.8 0 0 1 1.3-3h1.4A3.5 3.5 0 0 0 21 10.8C21 6.5 17 3 12 3Z"/><circle cx="7.5" cy="10" r=".9"/><circle cx="10.5" cy="6.8" r=".9"/><circle cx="15" cy="7.5" r=".9"/></>}
      {name === 'font' && <><path d="M4 19 10 5h2l6 14M6.5 13h9"/><path d="M18 17h4"/></>}
      {name === 'device' && <><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 18.5h4"/></>}
      {name === 'key' && <><circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 8-8 2 2-2 2 1.5 1.5-2 2-1.5-1.5-3 3"/></>}
      {name === 'history' && <><path d="M3 12a9 9 0 1 0 2.4-6.1L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>}
      {name === 'content' && <><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 12h8M8 16h8"/></>}
      {name === 'help' && <><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.5 2.5 0 1 1 4.5 1.5c-.9 1.1-2.1 1.4-2.1 3M12 17.5v.1"/></>}
    </svg>
  );
}

type SettingRow = { icon: IconName; label: string; panel?: PanelKey; path?: string; action?: 'feedback'; searchTerms?: string };
const GROUPS: { title: string; rows: SettingRow[] }[] = [
  { title: '账号', rows: [
    { icon: 'account', label: '账号与安全', path: '/me/account', searchTerms: '邮箱 密码 登录' },
    { icon: 'key', label: '通行密钥', path: '/me/edit?sec=key', searchTerms: '指纹 面容 ID 生物识别 passkey' },
    { icon: 'device', label: '登录设备管理', panel: 'devices', searchTerms: '设备 会话 退出登录' },
  ]},
  { title: '隐私与安全', rows: [
    { icon: 'lock', label: '隐私设置', path: '/me/edit?sec=priv', searchTerms: '姓名 年龄 头像 联系方式 社交资料 公开范围 表白墙匿名' },
  ]},
  { title: '通用', rows: [
    { icon: 'settings', label: '通用设置', panel: 'general', searchTerms: '动画 动效 页面体验' },
    { icon: 'bell', label: '通知设置', panel: 'notifications', searchTerms: '评论 点赞 留言 公告 表白墙 管理员私信 纪律处理 提醒 免打扰' },
    { icon: 'chat', label: '私聊与已读回执', panel: 'chat', searchTerms: '聊天 私聊 已读 回执 隐私' },
    { icon: 'wallpaper', label: '主页主题与壁纸', path: '/me/edit?sec=look', searchTerms: '动态壁纸 背景 颜色 布局 主页装扮' },
    { icon: 'font', label: '字体大小', panel: 'font', searchTerms: '字号 显示 阅读' },
  ]},
  { title: '内容与记录', rows: [
    { icon: 'content', label: '我的内容管理', path: '/me/content', searchTerms: '动态 照片 评论 投稿 收藏' },
    { icon: 'history', label: '最近搜索记录', panel: 'search', searchTerms: '清除 搜索历史 记录' },
  ]},
  { title: '帮助与支持', rows: [
    { icon: 'help', label: '问题反馈', action: 'feedback', searchTerms: '联系开发者 帮助 建议 bug' },
    { icon: 'content', label: '我的反馈进度', path: '/me/feedback', searchTerms: '反馈 回复 处理状态' },
  ]},
];

export default function MeSettings() {
  const nav = useNavigate();
  const { session } = useAuth();
  const uid = session!.user.id;
  const [prefs, setPrefs] = useState<Preferences>(() => readPreferences(uid));
  const [prefsReady, setPrefsReady] = useState(false);
  const [syncState, setSyncState] = useState<'loading' | 'saved' | 'error'>('loading');
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => readSearchHistory(uid));
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<PanelKey | null>(null);
  const [fontSize, setFontSize] = useState(() => {
    try { const saved = Number(localStorage.getItem('qznb_font_size_v1')); return [13, 14, 16, 18].includes(saved) ? saved : 14; } catch { return 14; }
  });
  const currentDevice = useMemo(() => deviceLabel(navigator.userAgent || ''), []);

  useEffect(() => {
    let active = true;
    async function loadCloudPreferences() {
      const localPreferences = readPreferences(uid);
      const { data, error } = await (supabase as any).from('profile_notification_preferences').select('preferences').eq('profile_id', uid).maybeSingle();
      if (!active) return;
      if (error) {
        setPrefs(localPreferences); setSyncState('error'); setPrefsReady(true); return;
      }
      if (data?.preferences && typeof data.preferences === 'object') {
        const remote = data.preferences as Partial<Preferences>;
        setPrefs(normalizeUserPreferences({
          ...localPreferences,
          ...remote,
          notifications: { ...DEFAULTS.notifications, ...localPreferences.notifications, ...(remote.notifications || {}) },
          chat: { ...localPreferences.chat, ...(remote.chat || {}) },
          quietHours: { ...localPreferences.quietHours, ...(remote.quietHours || {}) },
        }));
        setSyncState('saved');
      } else {
        const { error: insertError } = await (supabase as any).from('profile_notification_preferences').upsert({ profile_id: uid, preferences: localPreferences }, { onConflict: 'profile_id' });
        if (!active) return;
        setPrefs(localPreferences); setSyncState(insertError ? 'error' : 'saved');
      }
      setPrefsReady(true);
    }
    void loadCloudPreferences();
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    if (!prefsReady) return;
    try { localStorage.setItem('qznb_user_preferences_v1:' + uid, JSON.stringify(prefs)); } catch {}
    try { localStorage.setItem('qznb_motion_preference_v1', prefs.motion); } catch {}
    window.dispatchEvent(new Event('qznb-settings-changed'));
    let active = true;
    const timer = window.setTimeout(async () => {
      const { error } = await (supabase as any).from('profile_notification_preferences').upsert({ profile_id: uid, preferences: prefs }, { onConflict: 'profile_id' });
      if (active) setSyncState(error ? 'error' : 'saved');
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [prefs, uid, prefsReady]);

  useEffect(() => {
    document.body.style.fontSize = fontSize + 'px';
    try { localStorage.setItem('qznb_font_size_v1', String(fontSize)); } catch {}
    window.dispatchEvent(new Event('qznb-font-size-changed'));
  }, [fontSize]);

  async function signOutOtherDevices() {
    if (!(await confirmDialog('退出其他设备上的登录？当前这台设备会保持登录。'))) return;
    setDeviceBusy(true); setMessage('');
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    setDeviceBusy(false);
    setMessage(error ? '操作失败：' + error.message : '已请求退出其他设备上的会话。');
  }

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = GROUPS.map(group => ({
    ...group,
    rows: group.rows.filter(row => !normalizedQuery || (group.title + row.label + (row.searchTerms || '')).toLocaleLowerCase().includes(normalizedQuery)),
  })).filter(group => group.rows.length > 0);

  function openRow(row: SettingRow) {
    if (row.action === 'feedback') { setFeedbackOpen(true); return; }
    if (row.panel) setExpanded(old => old === row.panel ? null : row.panel!);
    else if (row.path) nav(row.path);
  }

  async function clearSearchHistory() {
    if (!(await confirmDialog('清空最近搜索记录？此操作不会删除动态、帖子或其他内容。'))) return;
    try { localStorage.removeItem('qznb_search_history_v2:' + uid); } catch {}
    setSearchHistory([]);
  }

  return (
    <main className="page qz-settings-page">
      <style>{`
        .qz-settings-page{box-sizing:border-box;min-height:100dvh;width:100%;max-width:none;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 4px) 0 24px!important;background:transparent;color:#2b2823}
        .qz-settings-page *{box-sizing:border-box}
        body:has(.qz-settings-page){color-scheme:light;background:#f5f1e9!important;color:#2b2823!important}
        body:has(.qz-settings-page) .glow,body:has(.qz-settings-page) .app-bg{display:none!important}
        body:has(.qz-settings-page) .wrap{padding-bottom:calc(150px + env(safe-area-inset-bottom))!important}
        body:has(.qz-settings-page) .topnav{background:rgba(250,247,240,.96)!important;border-bottom:1px solid #e8dfd3!important;color:#29251f!important}
        body:has(.qz-settings-page) .topnav .brand{color:#29251f!important}
        body:has(.qz-settings-page) .topnav a,body:has(.qz-settings-page) .topnav button{color:#6d6256!important}
        body:has(.qz-settings-page) .topnav a.on{color:#704632!important;background:#f1e7dc!important;box-shadow:none!important}
        .qz-settings-top{height:64px;display:flex;align-items:center;justify-content:center;position:relative;margin:0 0 18px}
        .qz-settings-top h1{font-size:22px;font-weight:500;letter-spacing:.02em;margin:0;color:#2b2823}
        .qz-settings-back{position:absolute;left:-7px;top:50%;transform:translateY(-50%);width:42px;height:42px;display:grid;place-items:center;border:0;background:transparent;color:#2b2823;cursor:pointer;padding:0}
        .qz-settings-group{margin:0 0 30px}
        .qz-settings-group-title{font-size:15px;color:#786f63;font-weight:400;margin:0 0 10px 16px}
        .qz-settings-card{background:#fff;border:0;border-radius:16px;overflow:hidden;box-shadow:none}
        .qz-setting-row{width:100%;min-height:56px;padding:0 18px 0 18px;display:flex;align-items:center;gap:16px;text-align:left;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit}
        .qz-setting-row+.qz-setting-row{position:relative}
        .qz-setting-row+.qz-setting-row:before{content:"";position:absolute;top:0;left:50px;right:0;height:1px;background:#e9e1d6}
        .qz-setting-row:active{background:#f8f4ee}
        .qz-setting-icon{width:24px;height:24px;flex:0 0 24px;display:grid;place-items:center;color:#302b24}
        .qz-setting-label{min-width:0;flex:1;font-size:16px;font-weight:400;letter-spacing:0;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .qz-setting-chevron{font-size:28px;font-weight:300;color:#8c8174;line-height:1;margin-top:-2px}
        .qz-settings-search{position:fixed;z-index:90;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 88px);width:min(680px,calc(100vw - 28px));max-width:680px;height:52px;border:1px solid #e5dccf;border-radius:18px;background:rgba(255,255,255,.94);box-shadow:0 2px 10px rgba(0,0,0,.035);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);display:flex;align-items:center;gap:10px;padding:0 16px}
        .qz-settings-search svg{width:22px;height:22px;flex:0 0 22px;color:#8c8174}
        .qz-settings-search input{width:100%;min-width:0;border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important;font:inherit;font-size:15px;color:#302b24;padding:0!important}
        .qz-settings-search input::placeholder{color:#81776b;opacity:1}
        .qz-settings-panel{padding:12px 18px 16px 58px;border-top:1px solid #e9e1d6;background:#fff}
        .qz-settings-panel p{font-size:12px;line-height:1.65;color:#786f63;margin:7px 0}
        .qz-settings-panel label{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #eee7dd;font-size:14px}
        .qz-settings-panel input[type=checkbox]{width:18px;height:18px;accent-color:#9b654b;flex:0 0 auto}
        .qz-settings-choice{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
        .qz-settings-choice button{border:1px solid #e6dccf;border-radius:999px;background:#fff;color:#39332c;padding:8px 12px;font:inherit;font-size:13px}
        .qz-settings-choice button.active{border-color:#9b654b;background:#f4e9df;color:#80513c}
        .qz-settings-row-note{font-size:11px;color:#83786c;margin-top:8px}
        .qz-settings-subsection{margin-top:16px;padding-top:10px;border-top:1px solid #e9e1d6}
        .qz-settings-time-row{display:flex;gap:14px;flex-wrap:wrap}
        .qz-settings-time-row label{flex:1;min-width:118px}
        .qz-settings-time-input{width:auto;min-width:112px;max-width:100%;margin:0;padding:7px 8px;border:1px solid #e6dccf!important;border-radius:9px;background:#fff!important;color:#302b24!important}
        .qz-settings-history{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}
        .qz-settings-history span{padding:6px 10px;border-radius:999px;background:#f1ebe2;color:#5f564c;font-size:12px}
        @media(min-width:700px){
          .qz-settings-page{max-width:900px;padding:24px 0 24px!important}
          .qz-settings-top{margin-bottom:22px}
          .qz-settings-group{margin-bottom:28px}
          .qz-setting-row{min-height:64px;padding:0 24px;gap:18px}
          .qz-setting-row+.qz-setting-row:before{left:66px}
          .qz-settings-search{position:relative;left:auto;bottom:auto;transform:none;margin:26px auto 0}
        }
        @media(prefers-reduced-motion:no-preference){.qz-setting-row{transition:background .14s ease}}
      `}</style>

      <header className="qz-settings-top">
        <button className="qz-settings-back" aria-label="返回" onClick={() => nav('/me')}>
          <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <h1>设置</h1>
      </header>

      {visibleGroups.map(group => (
        <section className="qz-settings-group" key={group.title}>
          <h2 className="qz-settings-group-title">{group.title}</h2>
          <div className="qz-settings-card">
            {group.rows.map(row => (
              <div key={row.label}>
                <button type="button" onClick={() => openRow(row)} className="qz-setting-row" aria-expanded={row.panel ? expanded === row.panel : undefined}>
                  <span className="qz-setting-icon"><SettingIcon name={row.icon} /></span>
                  <span className="qz-setting-label">{row.label}</span>
                  <span className="qz-setting-chevron" aria-hidden="true">›</span>
                </button>
                {row.panel && expanded === row.panel && (
                  <div className="qz-settings-panel">
                    {row.panel === 'notifications' && <>
                      <p>关闭某类通知后，只会在通知中心隐藏该类别，不会删除历史记录。</p>
                      {(Object.keys(LABELS) as NotificationKey[]).map(key => <label key={key}><span>{LABELS[key]}</span><input type="checkbox" checked={prefs.notifications[key] !== false} onChange={e => setPrefs(old => ({ ...old, notifications: { ...old.notifications, [key]: e.target.checked } }))} /></label>)}
                      <div className="qz-settings-subsection">
                        <p><b>免打扰时段</b></p>
                        <label><span>启用未读角标免打扰</span><input type="checkbox" checked={prefs.quietHours.enabled} onChange={e => setPrefs(old => ({ ...old, quietHours: { ...old.quietHours, enabled: e.target.checked } }))} /></label>
                        <div className="qz-settings-time-row">
                          <label><span>开始时间</span><input className="qz-settings-time-input" type="time" value={prefs.quietHours.start} onChange={e => setPrefs(old => ({ ...old, quietHours: { ...old.quietHours, start: e.target.value } }))} /></label>
                          <label><span>结束时间</span><input className="qz-settings-time-input" type="time" value={prefs.quietHours.end} onChange={e => setPrefs(old => ({ ...old, quietHours: { ...old.quietHours, end: e.target.value } }))} /></label>
                        </div>
                        <p className="qz-settings-row-note">按设备当地时间生效，只隐藏网站未读角标；消息仍会正常接收并保存在通知中心。开始和结束时间相同时，表示全天免打扰。</p>
                      </div>
                      <p>{syncState === 'loading' ? '正在读取账号级偏好…' : syncState === 'saved' ? '设置已同步到账号。' : '云端同步暂不可用；当前设备仍保留本地设置。'}</p>
                    </>}
                    {row.panel === 'chat' && <>
                      <p>你可以决定是否向好友发送自己的已读状态，以及是否在聊天气泡下显示对方的已读状态。</p>
                      <label><span>发送已读回执</span><input type="checkbox" checked={prefs.chat.sendReadReceipts} onChange={e => setPrefs(old => ({ ...old, chat: { ...old.chat, sendReadReceipts: e.target.checked } }))} /></label>
                      <label><span>显示对方已读状态</span><input type="checkbox" checked={prefs.chat.showReadReceipts} onChange={e => setPrefs(old => ({ ...old, chat: { ...old.chat, showReadReceipts: e.target.checked } }))} /></label>
                      <p className="qz-settings-row-note">关闭发送回执不会影响收件箱未读计数；重新开启后，下一次打开聊天时恢复更新回执。</p>
                    </>}
                    {row.panel === 'general' && <>
                      <p>页面动效</p>
                      <div className="qz-settings-choice">
                        {([['system', '跟随设备'], ['reduce', '减少动画'], ['full', '完整动画']] as const).map(([value, label]) => <button type="button" key={value} className={prefs.motion === value ? 'active' : ''} onClick={() => setPrefs(old => ({ ...old, motion: value }))}>{label}</button>)}
                      </div>
                      <p className="qz-settings-row-note">完整动画仍会尊重设备的减少动态效果设置。</p>
                    </>}
                    {row.panel === 'font' && <>
                      <p>调整整个网站的基础字号</p>
                      <div className="qz-settings-choice">
                        {[13, 14, 16, 18].map(size => <button type="button" key={size} className={fontSize === size ? 'active' : ''} onClick={() => setFontSize(size)}>{size === 13 ? '小' : size === 14 ? '标准' : size === 16 ? '大' : '特大'}</button>)}
                      </div>
                    </>}
                    {row.panel === 'search' && <>
                      <p>最近搜索仅保存在当前账号使用的这台设备中，最多保留 6 条，不会公开给其他成员。</p>
                      {searchHistory.length ? <div className="qz-settings-history">{searchHistory.map(term => <span key={term}>{term}</span>)}</div> : <p>暂时没有搜索记录。</p>}
                      <div className="qz-settings-choice"><button type="button" disabled={!searchHistory.length} onClick={() => void clearSearchHistory()}>清空最近搜索记录</button></div>
                    </>}
                    {row.panel === 'devices' && <>
                      <p><b>{currentDevice} · 当前设备</b></p>
                      <p>当前浏览器会话 · {session?.user.email || '已登录账号'}</p>
                      {session?.expires_at && <p>访问令牌预计到期：{new Date(session.expires_at * 1000).toLocaleString()}</p>}
                      <div className="qz-settings-choice"><button type="button" disabled={deviceBusy} onClick={() => void signOutOtherDevices()}>{deviceBusy ? '处理中…' : '退出其他设备上的登录'}</button></div>
                      {message && <p role="status">{message}</p>}
                      <p className="qz-settings-row-note">当前显示本设备；可撤销其他设备会话。暂不支持逐台设备列表与单台撤销。</p>
                    </>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {!visibleGroups.length && <div style={{ padding: 28, textAlign: 'center', color: '#92949a' }}>没有找到相关设置</div>}
      {feedbackOpen && <FeedbackModal kind="general" onClose={() => setFeedbackOpen(false)} />}

      <div className="qz-settings-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.2 16.2 5 5"/></svg>
        <input aria-label="搜索设置" value={query} onChange={e => setQuery(e.target.value)} placeholder="可以问我设置相关的问题" />
      </div>
    </main>
  );
}
