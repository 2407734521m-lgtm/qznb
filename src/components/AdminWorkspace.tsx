import { BRAND_NAME } from '../lib/brand';
import BrandMark from './BrandMark';
import { supabase } from '../lib/supabase';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';

type AdminTab = [string, string, boolean];

interface AdminWorkspaceProps {
  tabs: AdminTab[];
  activeTab: string;
  onSelect: (id: string) => void;
  onLogout: () => void;
  isSuper: boolean;
  memberSearch: string;
  onMemberSearchChange: (value: string) => void;
  onMemberSearchSubmit: () => void;
  children: ReactNode;
}

const NAV_GROUPS = [
  { label: '工作台', ids: ['overview', 'analytics'] },
  { label: '成员与权限', ids: ['accounts', 'invite', 'approvals', 'mySecurity'] },
  { label: '内容运营', ids: ['moderate', 'reviewCenter', 'loveWall', 'songWall', 'musicDownloads', 'authorizedRequests', 'board', 'events', 'game', 'recruit'] },
  { label: '消息与反馈', ids: ['notifications', 'communication', 'bulkEmail', 'broadcast', 'feedback'] },
  { label: '系统管理', ids: ['backups', 'release', 'appCenter', 'appClickStats', 'logs', 'security', 'system', 'guestAccess', 'settings', 'test'] },
] as const;

const ICON_PATHS: Record<string, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 14h7v7H3z',
  analytics: 'M4 19V5 M4 19h17 M8 15l3-4 3 2 5-7',
  accounts: 'M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20 M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M17 4.2a3.5 3.5 0 0 1 0 6.6 M17 14h.5a4.5 4.5 0 0 1 4.5 4.5V20',
  invite: 'M12 5v14 M5 12h14 M4 4h16v16H4z',
  mySecurity: 'M6 11V7a6 6 0 1 1 12 0v4 M4 11h16v10H4z M12 15v3',
  approvals: 'M5 12l4 4L19 6 M3 3h18v18H3z',
  moderate: 'M4 5h16 M4 12h16 M4 19h10 M7 2v6 M17 9v6',
  reviewCenter: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  musicDownloads: 'M12 3v10 M7 8l5 5 5-5 M4 21h16',
  notifications: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0',
  loveWall: 'M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5z',
  songWall: 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3z M21 16a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3z',
  authorizedRequests: 'M12 3v18 M3 12h18 M5 5l14 14 M19 5L5 19',
  board: 'M4 4h16v12H7l-3 3z M8 8h8 M8 12h5',
  events: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',
  game: 'M6 8h12a4 4 0 0 1 3.7 5.5l-1.1 2.8a2.5 2.5 0 0 1-4.3.7L14.5 15h-5l-1.8 2a2.5 2.5 0 0 1-4.3-.7l-1.1-2.8A4 4 0 0 1 6 8z M7 11v4 M5 13h4 M16 12h.01 M18.5 14h.01',
  communication: 'M4 5h16v11H8l-4 4z M8 9h8 M8 12h5',
  bulkEmail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  broadcast: 'M4 10v4h3l7 5V5l-7 5H4z M18 9a4 4 0 0 1 0 6 M20.5 6.5a8 8 0 0 1 0 11',
  feedback: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z',
  backups: 'M4 7h16 M4 12h16 M4 17h16 M7 4v6 M17 14v6',
  appClickStats: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  recruit: 'M3 7h18v13H3z M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M3 13h18 M9 3v4 M15 3v4',
  release: 'M12 3v12 M7 10l5 5 5-5 M4 20h16',
  logs: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5',
  security: 'M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z M9 12l2 2 4-4',
  system: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.4v-2.6h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.1H15v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.5 1z',
  guestAccess: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19 13.5a7.4 7.4 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.5 7.5 0 0 0-2.6-1.5L13.6 2h-4l-.4 3a7.5 7.5 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 3l-2 1.5 2 3.5 2.4-1a7.5 7.5 0 0 0 2.6 1.5l.4 3h4l.4-3a7.5 7.5 0 0 0 2.6-1.5l2.4 1 2-3.5z',
  test: 'M8 3h8 M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6A2 2 0 0 0 19 18l-5-9V3 M8 15h8',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.3-4.3',
  logout: 'M10 17l5-5-5-5 M15 12H3 M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7',
  chevron: 'M9 18l6-6-6-6',
  close: 'M18 6L6 18 M6 6l12 12',
  panel: 'M4 4h16v16H4z M9 4v16',
};

function AdminIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS[name] ?? ICON_PATHS.overview} />
    </svg>
  );
}

function groupFor(id: string) {
  return NAV_GROUPS.find(group => (group.ids as readonly string[]).includes(id))?.label ?? '管理功能';
}

function descriptionFor(id: string) {
  const descriptions: Record<string, string> = {
    overview: '查看站点运行概况、待处理事项与最近活动。',
    analytics: '汇总成员活跃、内容增长与站点运行指标。',
    accounts: '管理成员账号、角色、状态与使用权限。',
    invite: '管理邀请入口与注册邀请码。',
    mySecurity: '修改当前管理员账号的二级密码。',
    approvals: '集中处理需要超级管理员审批的申请。',
    moderate: '处理举报、违规内容与社区审核任务。',
    reviewCenter: '集中处理歌声墙、表白墙、游戏段位、举报与反馈的待审核事项。',
    musicDownloads: '查看成员下载音乐的记录。',
    notifications: '查看全站通知与发送通知活动。',
    loveWall: '管理表白墙内容与发布状态。',
    songWall: '管理匿名歌声投稿与审核状态。',
    authorizedRequests: '查看并处理经过授权的申请队列。',
    board: '发布和维护站点公告与首页内容。',
    events: '管理社区活动与活动参与情况。',
    game: '维护游戏段位资料和相关审核。',
    communication: '统一管理弹窗广播、成员定向消息、预约发布与触达记录。',
    bulkEmail: '管理面向成员的邮件通知。',

    feedback: '查看成员反馈、建议与问题报告。',
    backups: '查看备份任务与恢复点。',
    release: '查看网站与项目的版本发布和更新记录。',
    appCenter: '发布移动端软件版本和专属公告，查看网页版与移动端成员。',
    appClickStats: '查看谁点了哪个单独软件、点了多少次。',
    recruit: '管理瑞氏集团招聘职位与应聘申请，审核通过后发送录用通知邮件。',
    logs: '审查重要管理操作和系统日志。',
    security: '检查登录安全、会话与风险记录。',
    system: '查看系统诊断、维护与运行状态。',
    guestAccess: '控制游客入口、浏览时长、开放计划与公开内容。',
    settings: '配置全站管理设置。',
    test: '执行管理端测试与回归检查。',
  };
  return descriptions[id] ?? `管理 ${BRAND_NAME} 站点的相关功能。`;
}

export default function AdminWorkspace({
  tabs,
  activeTab,
  onSelect,
  onLogout,
  isSuper,
  memberSearch,
  onMemberSearchChange,
  onMemberSearchSubmit,
  children,
}: AdminWorkspaceProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('qznb-admin-collapsed-groups') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem('qznb-admin-favorites') || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; } catch { return []; }
  });
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem('qznb-admin-recent') || '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 5) : []; } catch { return []; }
  });
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const commandInput = useRef<HTMLInputElement>(null);
  const commandDialog = useRef<HTMLElement>(null);
  const commandTrigger = useRef<HTMLButtonElement>(null);
  const [todoCounts, setTodoCounts] = useState<Record<string, number> | null>(null);

  const groups = useMemo(() => NAV_GROUPS.map(group => ({
    label: group.label,
    items: group.ids
      .map(id => tabs.find(item => item[0] === id))
      .filter((item): item is AdminTab => Boolean(item))
      .map(item => ({ id: item[0], label: item[1] })),
  })).filter(group => group.items.length > 0), [tabs]);

  const flatItems = useMemo(() => groups.flatMap(group => group.items.map(item => ({
    ...item, group: group.label,
  }))), [groups]);

  const availableItems = useMemo(() => groups.flatMap(group => group.items)
    .filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index), [groups]);
  const navigationGroups = useMemo(() => {
    const byId = new Map(availableItems.map(item => [item.id, item]));
    const favorites = favoriteIds.map(id => byId.get(id)).filter((item): item is {id:string;label:string} => Boolean(item));
    const recent = recentIds.filter(id => !favoriteIds.includes(id)).map(id => byId.get(id)).filter((item): item is {id:string;label:string} => Boolean(item));
    return [
      ...(favorites.length ? [{ label: '常用功能', items: favorites }] : []),
      ...(recent.length ? [{ label: '最近访问', items: recent }] : []),
      ...groups,
    ];
  }, [availableItems, favoriteIds, recentIds, groups]);
  const mobileQuickItems = useMemo(() => availableItems, [availableItems]);
  const referenceNavItems = useMemo(() => (
    ['overview', 'analytics', 'accounts', 'moderate', 'board', 'communication', 'appCenter', 'settings']
      .map(id => availableItems.find(item => item.id === id))
      .filter((item): item is { id: string; label: string } => Boolean(item))
  ), [availableItems]);
  const quickbarRef = useRef<HTMLElement>(null);

  const matchingItems = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return flatItems;
    return flatItems.filter(item => [
      item.label,
      item.group,
      descriptionFor(item.id),
    ].join(' ').toLocaleLowerCase().includes(value));
  }, [flatItems, query]);

  const current = tabs.find(item => item[0] === activeTab);
  const currentGroup = groupFor(activeTab);
  const todoCountFor = (id: string) => todoCounts?.[id] ?? 0;

  // 与总览使用同一组待办口径；仅在后台前台可见时刷新，失败时不伪报 0。
  useEffect(() => {
    let alive = true;
    let inFlight = false;
    const loadTodoCounts = async () => {
      if (!alive || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const results = await Promise.all([
          supabase.from('love_wall_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('song_posts').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('game_profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('feedbacks').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        ]);
        if (!alive) return;
        if (results.some(result => result.error)) return;
        setTodoCounts({
          loveWall: results[0].count ?? 0,
          songWall: results[1].count ?? 0,
          game: results[2].count ?? 0,
          moderate: results[3].count ?? 0,
          feedback: results[4].count ?? 0,
        });
      } catch {
        // 保持上一次成功结果；首次读取失败时不显示误导性的零数量。
      } finally {
        inFlight = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadTodoCounts();
    };
    void loadTodoCounts();
    const timer = window.setInterval(() => void loadTodoCounts(), 60_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    try { localStorage.setItem('qznb-admin-collapsed-groups', JSON.stringify(collapsedGroups)); } catch { /* storage may be disabled */ }
  }, [collapsedGroups]);

  useEffect(() => {
    try { localStorage.setItem('qznb-admin-favorites', JSON.stringify(favoriteIds)); } catch { /* storage may be disabled */ }
  }, [favoriteIds]);

  useEffect(() => {
    try { localStorage.setItem('qznb-admin-recent', JSON.stringify(recentIds)); } catch { /* storage may be disabled */ }
  }, [recentIds]);

  useEffect(() => {
    const activeGroup = groupFor(activeTab);
    setCollapsedGroups(previous => previous[activeGroup]
      ? { ...previous, [activeGroup]: false }
      : previous);
  }, [activeTab]);

  // 切页后兜底：新内容挂载后再立即归零一次，防止残留滚动把页标题
  // 顶进 sticky 顶栏下（switchTab 里的 scrollTo 在 React 尚未提交新
  // 内容时也可能被后续渲染顶回去）。instant 盖掉全局 smooth。
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeTab]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

  useEffect(() => {
    const active = quickbarRef.current?.querySelector<HTMLElement>('.admin-mobile-quick-item.is-active');
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeTab]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(open => !open);
        setQuery('');
      } else if (event.key === 'Escape') {
        setPaletteOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!paletteOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    commandInput.current?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = commandDialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      document.body.style.overflow = previousOverflow;
      const target = previousFocus?.isConnected ? previousFocus : commandTrigger.current;
      target?.focus();
    };
  }, [paletteOpen]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  function toggleFavorite(id: string) {
    setFavoriteIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id].slice(-8));
  }

  function choose(id: string) {
    setRecentIds(previous => [id, ...previous.filter(value => value !== id)].slice(0, 5));
    onSelect(id);
    setPaletteOpen(false);
    setMobileOpen(false);
    setQuery('');
  }

  function handleCommandKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(index => Math.min(index + 1, Math.max(0, matchingItems.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(index => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && matchingItems[activeIndex]) {
      event.preventDefault();
      choose(matchingItems[activeIndex].id);
    }
  }

  function toggleNavigation() {
    setMobileOpen(open => !open);
  }

  return (
    <div className={['admin-workspace', 'is-reference-dashboard', mobileOpen ? 'is-mobile-open' : ''].filter(Boolean).join(' ')}>
      {mobileOpen && <button type="button" className="admin-sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
      <aside className="admin-sidebar" aria-label="管理后台导航">
        <div className="admin-sidebar-brand">
          <BrandMark className="admin-brand-logo" size={38} />
          <div className="admin-brand-copy">
            <strong>{BRAND_NAME}</strong>
            <span>ADMIN CONSOLE</span>
          </div>
          <button type="button" className="admin-sidebar-close" aria-label="关闭导航" onClick={() => setMobileOpen(false)}>
            <AdminIcon name="close" size={17} />
          </button>
        </div>

        <nav className="admin-sidebar-nav">
          {navigationGroups.map(group => (
            <section className="admin-nav-group" key={group.label}>
              <button
                type="button"
                className="admin-nav-group-title"
                aria-expanded={!collapsedGroups[group.label]}
                onClick={() => setCollapsedGroups(previous => ({
                  ...previous, [group.label]: !previous[group.label],
                }))}
              >
                <span>{group.label}</span>
                <AdminIcon name="chevron" size={13} />
              </button>
              <div className={['admin-nav-group-items', collapsedGroups[group.label] ? 'is-group-collapsed' : ''].join(' ')}>
                {group.items.map(item => (
                  <div className="admin-nav-item-row" key={`${group.label}-${item.id}`}>
                    <button type="button"
                      className={['admin-nav-item', activeTab === item.id ? 'is-active' : ''].join(' ')}
                      aria-current={activeTab === item.id ? 'page' : undefined}
                      title={item.label}
                      onClick={() => choose(item.id)}>
                      <span className="admin-nav-icon"><AdminIcon name={item.id} size={16} /></span>
                      <span className="admin-nav-label">{item.label}</span>
                      {todoCountFor(item.id) > 0 && (
                        <span
                          aria-label={`${todoCountFor(item.id)} 项待处理`}
                          title={`${todoCountFor(item.id)} 项待处理`}
                          style={{
                            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            minWidth: 18, height: 18,
                            padding: '0 5px', borderRadius: 999,
                            background: '#d94b5b', color: '#fff', fontSize: 10.5, fontWeight: 800,
                            lineHeight: 1, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {todoCountFor(item.id) > 99 ? '99+' : todoCountFor(item.id)}
                        </span>
                      )}
                    </button>
                    <button type="button" className={['admin-nav-pin', favoriteIds.includes(item.id) ? 'is-pinned' : ''].join(' ')}
                      aria-label={`${favoriteIds.includes(item.id) ? '取消常用' : '设为常用'}：${item.label}`}
                      aria-pressed={favoriteIds.includes(item.id)} title={favoriteIds.includes(item.id) ? '取消常用' : '设为常用'}
                      onClick={() => toggleFavorite(item.id)}>
                      <AdminIcon name="star" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-account">
            <span className="admin-sidebar-avatar">{isSuper ? '超' : '管'}</span>
            <span className="admin-sidebar-account-copy">
              <strong>{isSuper ? '超级管理员' : '内容管理员'}</strong>
              <small>安全会话已验证</small>
            </span>
          </div>
          <button type="button" className="admin-sidebar-logout" onClick={onLogout}>
            <AdminIcon name="logout" size={16} />
            <span>退出管理后台</span>
          </button>
        </div>
      </aside>

      <div className="admin-workspace-main">
        <header className="admin-console-topbar admin-reference-topbar">
          <div className="admin-reference-brand">
            <BrandMark className="admin-reference-brand-mark" size={34} />
            <div>
              <strong>{BRAND_NAME}</strong>
              <small>ADMIN CONSOLE</small>
            </div>
          </div>
          <button type="button" className="admin-console-icon-button admin-reference-app-trigger"
            aria-label={mobileOpen ? '关闭应用菜单' : '打开应用菜单'} aria-expanded={mobileOpen}
            onClick={toggleNavigation}>
            <AdminIcon name="menu" size={17} />
            <span>应用</span>
          </button>
          <nav className="admin-reference-topnav" aria-label="常用管理功能">
            {referenceNavItems.map(item => (
              <button type="button" key={item.id}
                className={['admin-reference-topnav-item', activeTab === item.id ? 'is-active' : ''].join(' ')}
                aria-label={item.label} aria-current={activeTab === item.id ? 'page' : undefined}
                title={item.label} onClick={() => choose(item.id)}>
                <AdminIcon name={item.id} size={17} />
              </button>
            ))}
          </nav>
          <div className="admin-console-spacer" />
          <button ref={commandTrigger} type="button" className="admin-command-trigger admin-reference-search"
            aria-label="搜索管理功能" aria-haspopup="dialog" aria-expanded={paletteOpen}
            onClick={() => { setQuery(''); setPaletteOpen(true); }}>
            <AdminIcon name="search" size={16} />
            <span>搜索</span>
            <kbd>Ctrl K</kbd>
          </button>
          <span className="admin-console-role">{isSuper ? '超级管理员' : '内容管理员'}</span>
          <span className="admin-reference-avatar" aria-label={isSuper ? '超级管理员' : '内容管理员'}>
            {isSuper ? '超' : '管'}
          </span>
          {/* 设置页签仅超管可见，内容管理员点齿轮会进空白页（审计 FIX-4-2），
              因此齿轮本身只对超管渲染。 */}
          {isSuper && (
            <button type="button" className="admin-console-icon-button admin-reference-settings"
              aria-label="设置" title="设置" onClick={() => choose('settings')}>
              <AdminIcon name="settings" size={17} />
            </button>
          )}
          <button type="button" className="admin-console-logout" onClick={onLogout} aria-label="退出管理员后台">
            <AdminIcon name="logout" size={16} />
            <span>退出</span>
          </button>
        </header>

        <main className="admin-workspace-content">
          <div key={activeTab} className={['admin-page-heading', activeTab === 'overview' ? 'is-dashboard-heading' : ''].filter(Boolean).join(' ')}>
            <div className="admin-page-heading-copy">
              <p className="admin-page-greeting">欢迎回来，管理员 · {new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p>
              <h1>{current?.[1] ?? '工作台'}</h1>
              <p>{descriptionFor(activeTab)}</p>
            </div>
            {isSuper && (
              <form className="admin-member-search" onSubmit={event => { event.preventDefault(); onMemberSearchSubmit(); }}>
                <label htmlFor="admin-member-search">快速定位成员</label>
                <div className="admin-member-search-control">
                  <AdminIcon name="search" size={16} />
                  <input id="admin-member-search" value={memberSearch}
                    onChange={event => onMemberSearchChange(event.target.value)}
                    placeholder="姓名、用户名、邮箱或 ID" />
                  <button type="submit">定位</button>
                </div>
              </form>
            )}
          </div>
          <div className="admin-workspace-inner">
            {children}
          </div>
        </main>

        <footer className="admin-console-footer">
          <span>{BRAND_NAME} · 管理控制台</span>
          <span>管理功能与站点数据保持原有权限边界</span>
        </footer>
      </div>

      <nav ref={quickbarRef} className="admin-mobile-quickbar" aria-label="移动端快捷导航">
        {mobileQuickItems.map(item => (
            <button type="button" key={item.id}
              className={['admin-mobile-quick-item', activeTab === item.id ? 'is-active' : ''].join(' ')}
              aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => choose(item.id)}>
              <span className="admin-mobile-quick-icon" style={{ position: 'relative' }}>
                <AdminIcon name={item.id} size={18} />
                {todoCountFor(item.id) > 0 && (
                  <span
                    aria-label={`${todoCountFor(item.id)} 项待处理`}
                    style={{
                      position: 'absolute', top: -6, right: -10, minWidth: 16, height: 16, padding: '0 4px',
                      borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: '#d94b5b', color: '#fff', fontSize: 9.5, fontWeight: 800,
                      lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    }}
                  >{todoCountFor(item.id) > 99 ? '99+' : todoCountFor(item.id)}</span>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        <button type="button" className="admin-mobile-quick-item"
          aria-expanded={mobileOpen} onClick={() => setMobileOpen(open => !open)}>
          <span className="admin-mobile-quick-icon"><AdminIcon name="menu" size={18} /></span>
          <span>更多</span>
        </button>
      </nav>

      {paletteOpen && (
        <div className="admin-command-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setPaletteOpen(false); }}>
          <section ref={commandDialog} className="admin-command-palette" role="dialog" aria-modal="true" aria-label="搜索管理功能">
            <div className="admin-command-input-wrap">
              <AdminIcon name="search" size={18} />
              <input ref={commandInput} value={query} aria-label="搜索管理功能" onChange={event => setQuery(event.target.value)}
                onKeyDown={handleCommandKeyDown} placeholder="搜索功能名称或所属分组…" />
              <kbd>ESC</kbd>
            </div>
            <div className="admin-command-results">
              {matchingItems.length ? matchingItems.map((item, index) => (
                <button type="button" key={item.id}
                  className={['admin-command-result', index === activeIndex ? 'is-active' : ''].join(' ')}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(item.id)}>
                  <span className="admin-command-result-icon"><AdminIcon name={item.id} size={16} /></span>
                  <span className="admin-command-result-copy"><strong>{item.label}</strong><small>{item.group} · {descriptionFor(item.id)}</small></span>
                  <AdminIcon name="chevron" size={15} />
                </button>
              )) : <div className="admin-command-empty">没有找到匹配的管理功能</div>}
            </div>
            <div className="admin-command-foot"><span>↑ ↓ 选择</span><span>Enter 打开</span><span>Esc 关闭</span></div>
          </section>
        </div>
      )}
    </div>
  );
}
