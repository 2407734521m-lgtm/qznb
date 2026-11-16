import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { confirmDialog } from '../lib/dialog';
import FeedbackModal from '../components/FeedbackModal';
import IslandAlignOverlay from '../components/IslandAlignOverlay';
import SettingIcon, { type SettingIconName } from '../components/SettingIcon';
import SponsorModal from '../components/SponsorModal';
import { useUserPreferences } from '../lib/useUserPreferences';
import { DEFAULT_ISLAND_PREFERENCE } from '../lib/userPreferences';
import { ISLAND_TRACK_EVENT, readIslandLastTrack, type IslandLastTrack } from '../lib/islandLastTrack';

type PanelKey = 'font' | 'search' | 'chat' | 'island';
type IconName = SettingIconName;

function readSearchHistory(uid: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('qznb_search_history_v2:' + uid) || '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 6) : [];
  } catch { return []; }
}

type SettingRow = { icon: IconName; label: string; panel?: PanelKey; path?: string; action?: 'feedback' | 'sponsor' | 'profile'; searchTerms?: string };
const GROUPS: { title: string; rows: SettingRow[] }[] = [
  { title: '账号', rows: [
    { icon: 'account', label: '账号与安全', path: '/me/account', searchTerms: '邮箱 密码 登录' },
    { icon: 'key', label: '通行密钥', path: '/me/settings/passkey', searchTerms: '指纹 面容 ID 生物识别 passkey' },
    { icon: 'device', label: '登录设备管理', path: '/me/settings/devices', searchTerms: '设备 会话 退出登录' },
    { icon: 'account', label: '我的主页', action: 'profile', searchTerms: '个人主页 名片 别人看到的样子' },
    { icon: 'settings', label: '编辑资料', path: '/me/edit?sec=base', searchTerms: '昵称 签名 兴趣爱好 修改资料' },
  ]},
  { title: '隐私与安全', rows: [
    { icon: 'lock', label: '隐私设置', path: '/me/settings/privacy', searchTerms: '姓名 年龄 头像 联系方式 社交资料 公开范围 表白墙匿名' },
  ]},
  { title: '通用', rows: [
    { icon: 'settings', label: '通用设置', path: '/me/settings/general', searchTerms: '动画 动效 页面体验' },
    { icon: 'device', label: '灵动岛', panel: 'island', searchTerms: '动态胶囊 灵动岛 位置 水平 垂直 宽度 高度 尺寸' },
    { icon: 'bell', label: '通知设置', path: '/me/settings/notifications', searchTerms: '评论 点赞 留言 公告 表白墙 管理员私信 纪律处理 提醒 免打扰' },
    { icon: 'chat', label: '私聊与已读回执', panel: 'chat', searchTerms: '聊天 私聊 已读 回执 隐私' },
    { icon: 'wallpaper', label: '主页主题与壁纸', path: '/me/edit?sec=look', searchTerms: '动态壁纸 背景 颜色 布局 主页装扮' },
    { icon: 'font', label: '字体大小', panel: 'font', searchTerms: '字号 显示 阅读' },
  ]},
  { title: '内容与记录', rows: [
    { icon: 'content', label: '我的内容管理', path: '/me/content', searchTerms: '动态 照片 评论 投稿 收藏' },
    { icon: 'history', label: '最近搜索记录', panel: 'search', searchTerms: '清除 搜索历史 记录' },
    { icon: 'content', label: '我的相册', path: '/albums', searchTerms: '照片 影像 分类' },
    { icon: 'play', label: '活动', path: '/events', searchTerms: '近期活动 安排 报名' },
    { icon: 'history', label: '内容日历', path: '/calendar', searchTerms: '日期 回看 动态 公告' },
    { icon: 'palette', label: '热门特效', path: '/hot', searchTerms: '互动效果 特效 好玩' },
    { icon: 'chat', label: '我的留言', path: '/me/greetings', searchTerms: '留言 收到 问候' },
  ]},
  { title: '帮助与支持', rows: [
    { icon: 'help', label: '问题反馈', action: 'feedback', searchTerms: '联系开发者 帮助 建议 bug' },
    { icon: 'content', label: '我的反馈进度', path: '/me/feedback', searchTerms: '反馈 回复 处理状态' },
    { icon: 'help', label: '赞助网站', action: 'sponsor', searchTerms: '赞助 支持 维护 捐赠' },
  ]},
];

export default function MeSettings() {
  const nav = useNavigate();
  const { session } = useAuth();
  const uid = session!.user.id;
  const { prefs, setPrefs } = useUserPreferences(uid);
  const [aligning, setAligning] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => readSearchHistory(uid));
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<PanelKey | null>(null);
  const islandStageRef = useRef<HTMLDivElement | null>(null);
  // The preview pill shows the last song the island played (or a sample title
  // when nothing has played yet on this device), so it reads like the real
  // island instead of a bare dot-and-line placeholder.
  const [previewTrack, setPreviewTrack] = useState<IslandLastTrack | null>(() => readIslandLastTrack());

  useEffect(() => {
    const onTrack = (event: Event) => {
      const detail = (event as CustomEvent<IslandLastTrack>).detail;
      if (detail && typeof detail.title === 'string' && detail.title.trim()) {
        setPreviewTrack({ title: detail.title, artist: typeof detail.artist === 'string' ? detail.artist : '' });
      }
    };
    window.addEventListener(ISLAND_TRACK_EVENT, onTrack);
    return () => window.removeEventListener(ISLAND_TRACK_EVENT, onTrack);
  }, []);
  const [fontSize, setFontSize] = useState(() => {
    try { const saved = Number(localStorage.getItem('qznb_font_size_v1')); return [13, 14, 16, 18].includes(saved) ? saved : 14; } catch { return 14; }
  });

  useEffect(() => {
    document.body.style.fontSize = fontSize + 'px';
    try { localStorage.setItem('qznb_font_size_v1', String(fontSize)); } catch {}
    window.dispatchEvent(new Event('qznb-font-size-changed'));
  }, [fontSize]);

  // While the island panel is open, the live island chrome at the top of the
  // viewport would sit on top of the in-panel preview and read as a second,
  // misaligned capsule. Hide it; the preview is the thing being adjusted.
  // The drag-align overlay needs the real island visible, so it is excluded.
  useEffect(() => {
    const open = expanded === 'island' && !aligning;
    if (!open) return;
    document.documentElement.dataset.qzIslandSettingsOpen = 'true';
    return () => { delete document.documentElement.dataset.qzIslandSettingsOpen; };
  }, [expanded, aligning]);

  // The panel-open flag alone cannot cover the scrolled-to-top position: when
  // the preview stage's top edge meets the viewport top, the live island sits
  // exactly on the preview pill. Hide the live chrome whenever the stage is
  // inside the viewport-top band (120px), not only while the panel is open.
  // Same drag-align exclusion as above: while aligning, the real island must
  // stay visible so there is something to line up.
  useEffect(() => {
    const open = expanded === 'island' && !aligning;
    const stage = islandStageRef.current;
    if (!open || !stage) return;
    const TOP_BAND_PX = 120;
    const sync = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.top < TOP_BAND_PX && rect.bottom > 0) {
        document.documentElement.dataset.qzIslandStageNearTop = 'true';
      } else {
        delete document.documentElement.dataset.qzIslandStageNearTop;
      }
    };
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      delete document.documentElement.dataset.qzIslandStageNearTop;
    };
  }, [expanded, aligning]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = GROUPS.map(group => ({
    ...group,
    rows: group.rows.filter(row => !normalizedQuery || (group.title + row.label + (row.searchTerms || '')).toLocaleLowerCase().includes(normalizedQuery)),
  })).filter(group => group.rows.length > 0);

  function openRow(row: SettingRow) {
    if (row.action === 'feedback') { setFeedbackOpen(true); return; }
    if (row.action === 'sponsor') { setSponsorOpen(true); return; }
    if (row.action === 'profile') { nav('/members/' + uid); return; }
    if (row.panel) setExpanded(old => old === row.panel ? null : row.panel!);
    else if (row.path) nav(row.path);
  }

  async function clearSearchHistory() {
    if (!(await confirmDialog('清空最近搜索记录？此操作不会删除动态、帖子或其他内容。', { confirmText: '确认清空' }))) return;
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
        .qz-island-settings-stage{height:160px;margin:12px 0 14px;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:14px;background:linear-gradient(135deg,#f3f0eb,#eae6df)}
        .qz-island-settings-stage:before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:rgba(5,5,6,.35)}
        .qz-island-settings-preview{position:absolute;left:50%;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 10px;overflow:hidden;border-radius:999px;background:#050506;box-shadow:0 5px 14px rgba(0,0,0,.2);transition:width .14s ease,height .14s ease,top .14s ease,transform .14s ease}
        .qz-island-settings-preview-dot{flex:0 0 auto;color:rgba(255,255,255,.9);font-size:10px;line-height:1}
        .qz-island-settings-preview-title{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.92);font-size:10px;line-height:1.2}
        .qz-island-range{display:block!important;padding:11px 0!important;border-bottom:1px solid #eee7dd}
        .qz-island-range>span{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:14px;color:#302b24}
        .qz-island-range b{font-size:12px;font-weight:600;color:#80513c;font-variant-numeric:tabular-nums}
        .qz-island-range input[type=range]{display:block;width:100%;height:26px;margin:7px 0 0;padding:0!important;accent-color:#80513c;touch-action:pan-y}
        .qz-island-settings-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
        .qz-island-settings-actions button{border:1px solid #e6dccf;border-radius:999px;background:#fff;color:#80513c;padding:8px 13px;font:inherit;font-size:13px}
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
                    {row.panel === 'island' && <>
                      <p>调整灵动岛在页面中的位置和胶囊尺寸。下面的框就是屏幕顶部，药丸的位置和大小跟真机上看到的一样；预览里的歌名是最近一次播放的歌，没播过歌时显示示例；改动会即时预览，并同步到当前账号。</p>
                      <div className="qz-island-settings-stage" ref={islandStageRef} aria-label="灵动岛位置预览（屏幕顶部，等比）">
                        <span
                          className="qz-island-settings-preview"
                          style={{
                            width: prefs.island.width,
                            height: prefs.island.height,
                            // 与真机上同一个公式：锚点 18px + 引擎 shape-top 12.5px +（垂直偏移 - 10px 提供方上抬）。
                            top: 20.5 + prefs.island.offsetY,
                            transform: `translateX(calc(-50% + ${prefs.island.offsetX}px))`,
                          }}
                        >
                          <span className="qz-island-settings-preview-dot" aria-hidden="true">♫</span>
                          <span className="qz-island-settings-preview-title">{previewTrack?.title ?? '流沙'}</span>
                        </span>
                      </div>
                      <label className="qz-island-range">
                        <span><span>水平位置</span><b>{prefs.island.offsetX > 0 ? '+' : ''}{prefs.island.offsetX} px</b></span>
                        <input type="range" min={-90} max={90} step={1} value={prefs.island.offsetX} onChange={event => setPrefs(old => ({ ...old, island: { ...old.island, offsetX: Number(event.target.value) } }))} aria-label="灵动岛水平位置" />
                      </label>
                      <label className="qz-island-range">
                        <span><span>垂直位置</span><b>{prefs.island.offsetY > 0 ? '+' : ''}{prefs.island.offsetY} px</b></span>
                        <input type="range" min={-30} max={90} step={1} value={prefs.island.offsetY} onChange={event => setPrefs(old => ({ ...old, island: { ...old.island, offsetY: Number(event.target.value) } }))} aria-label="灵动岛垂直位置" />
                      </label>
                      <label className="qz-island-range">
                        <span><span>胶囊长度</span><b>{prefs.island.width} px</b></span>
                        <input type="range" min={88} max={144} step={1} value={prefs.island.width} onChange={event => setPrefs(old => ({ ...old, island: { ...old.island, width: Number(event.target.value) } }))} aria-label="灵动岛胶囊长度" />
                      </label>
                      <label className="qz-island-range">
                        <span><span>胶囊高度</span><b>{prefs.island.height} px</b></span>
                        <input type="range" min={28} max={42} step={0.5} value={prefs.island.height} onChange={event => setPrefs(old => ({ ...old, island: { ...old.island, height: Number(event.target.value) } }))} aria-label="灵动岛胶囊高度" />
                      </label>
                      <label><span>触感反馈</span><input type="checkbox" checked={prefs.island.haptics} onChange={e => setPrefs(old => ({ ...old, island: { ...old.island, haptics: e.target.checked } }))} /></label>
                      <div className="qz-island-settings-actions">
                        <button type="button" onClick={() => setAligning(true)}>拖动对准</button>
                        <button type="button" onClick={() => setPrefs(old => ({ ...old, island: { ...DEFAULT_ISLAND_PREFERENCE } }))}>恢复默认</button>
                      </div>
                      {aligning && (
                        <IslandAlignOverlay
                          offsetX={prefs.island.offsetX}
                          offsetY={prefs.island.offsetY}
                          onSave={(x, y) => setPrefs(old => ({ ...old, island: { ...old.island, offsetX: x, offsetY: y } }))}
                          onClose={() => setAligning(false)}
                        />
                      )}
                      <p className="qz-settings-row-note">提示：位置是相对默认居中位置的偏移；尺寸会同步影响收起和展开状态。轻触顶部露出的玻璃边缘即可重新展开。触感反馈需要手机支持振动。</p>
                    </>}
                    {row.panel === 'chat' && <>
                      <p>你可以决定是否向好友发送自己的已读状态，以及是否在聊天气泡下显示对方的已读状态。</p>
                      <label><span>发送已读回执</span><input type="checkbox" checked={prefs.chat.sendReadReceipts} onChange={e => setPrefs(old => ({ ...old, chat: { ...old.chat, sendReadReceipts: e.target.checked } }))} /></label>
                      <label><span>显示对方已读状态</span><input type="checkbox" checked={prefs.chat.showReadReceipts} onChange={e => setPrefs(old => ({ ...old, chat: { ...old.chat, showReadReceipts: e.target.checked } }))} /></label>
                      <p className="qz-settings-row-note">关闭发送回执不会影响收件箱未读计数；重新开启后，下一次打开聊天时恢复更新回执。</p>
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
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {!visibleGroups.length && <div style={{ padding: 28, textAlign: 'center', color: '#92949a' }}>没有找到相关设置</div>}
      {feedbackOpen && <FeedbackModal kind="general" onClose={() => setFeedbackOpen(false)} />}
      {sponsorOpen && <SponsorModal onClose={() => setSponsorOpen(false)} />}

      <div className="qz-settings-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16.2 16.2 5 5"/></svg>
        <input aria-label="搜索设置" value={query} onChange={e => setQuery(e.target.value)} placeholder="可以问我设置相关的问题" />
      </div>
    </main>
  );
}
