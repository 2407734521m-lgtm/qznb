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
  { label: '成员与权限', ids: ['accounts', 'invite', 'approvals'] },
  { label: '内容运营', ids: ['moderate', 'loveWall', 'songWall', 'authorizedRequests', 'board', 'events', 'game'] },
  { label: '消息与反馈', ids: ['notifications', 'bulkEmail', 'feedback'] },
  { label: '系统管理', ids: ['backups', 'release', 'logs', 'security', 'system', 'settings', 'test'] },
] as const;

const ICON_PATHS: Record<string, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 14h7v7H3z',
  analytics: 'M4 19V5 M4 19h17 M8 15l3-4 3 2 5-7',
  accounts: 'M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20 M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M17 4.2a3.5 3.5 0 0 1 0 6.6 M17 14h.5a4.5 4.5 0 0 1 4.5 4.5V20',
  invite: 'M12 5v14 M5 12h14 M4 4h16v16H4z',
  approvals: 'M5 12l4 4L19 6 M3 3h18v18H3z',
  moderate: 'M4 5h16 M4 12h16 M4 19h10 M7 2v6 M17 9v6',
  loveWall: 'M20.8 8.7c0 5.2-8.8 10.3-8.8 10.3S3.2 13.9 3.2 8.7A4.7 4.7 0 0 1 12 6.2a4.7 4.7 0 0 1 8.8 2.5z',
  songWall: 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3z M21 16a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3z',
  authorizedRequests: 'M12 3v18 M3 12h18 M5 5l14 14 M19 5L5 19',
  board: 'M4 4h16v12H7l-3 3z M8 8h8 M8 12h5',
  events: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',
  game: 'M6 8h12a4 4 0 0 1 3.7 5.5l-1.1 2.8a2.5 2.5 0 0 1-4.3.7L14.5 15h-5l-1.8 2a2.5 2.5 0 0 1-4.3-.7l-1.1-2.8A4 4 0 0 1 6 8z M7 11v4 M5 13h4 M16 12h.01 M18.5 14h.01',
  notifications: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
  bulkEmail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  feedback: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z',
  backups: 'M4 7h16 M4 12h16 M4 17h16 M7 4v6 M17 14v6',
  release: 'M12 3v12 M7 10l5 5 5-5 M4 20h16',
  logs: 'M5 4h14v16H5z M8 8h8 M8 12h8 M8 16h5',
  security: 'M12 3l8 3v5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z M9 12l2 2 4-4',
  system: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.1h-2.6v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6.4v-2.6h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5v-.1H15v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1V14h-.1a1.7 1.7 0 0 0-1.5 1z',
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
    approvals: '集中处理需要超级管理员审批的申请。',
    moderate: '处理举报、违规内容与社区审核任务。',
    loveWall: '管理表白墙内容与发布状态。',
    songWall: '管理匿名歌声投稿与审核状态。',
    authorizedRequests: '查看并处理经过授权的申请队列。',
    board: '发布和维护站点公告与首页内容。',
    events: '管理社区活动与活动参与情况。',
    game: '维护游戏段位资料和相关审核。',
    notifications: '向成员发送站内通知并查看送达情况。',
    bulkEmail: '管理面向成员的邮件通知。',
    feedback: '查看成员反馈、建议与问题报告。',
    backups: '查看备份任务与恢复点。',
    release: '查看版本发布和更新记录。',
    logs: '审查重要管理操作和系统日志。',
    security: '检查登录安全、会话与风险记录。',
    system: '查看系统诊断、维护与运行状态。',
    settings: '配置全站管理设置。',
    test: '执行管理端测试与回归检查。',
  };
  return descriptions[id] ?? '管理青春档案站点的相关功能。';
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
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('qznb-admin-rail-collapsed') === '1'; } catch { return false; }
  });
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
  const mobileQuickItems = useMemo(() => {
    const byId = new Map(availableItems.map(item => [item.id, item]));
    const pinned = favoriteIds.map(id => byId.get(id)).filter((item): item is {id:string;label:string} => Boolean(item)).slice(0, 3);
    const fallback = ['overview', 'moderate', 'notifications', 'accounts']
      .map(id => byId.get(id)).filter((item): item is {id:string;label:string} => Boolean(item));
    const merged = [...pinned, ...fallback.filter(item => !pinned.some(pin => pin.id === item.id))];
    return merged.slice(0, 4);
  }, [availableItems, favoriteIds]);

  const matchingItems = useMemo(() => {
    const value = query.trim().toLowerCase();
    return flatItems.filter(item => !value || item.label.toLowerCase().includes(value) || item.group.toLowerCase().includes(value));
  }, [flatItems, query]);

  const current = tabs.find(item => item[0] === activeTab);
  const currentGroup = groupFor(activeTab);

  useEffect(() => {
    try { localStorage.setItem('qznb-admin-rail-collapsed', collapsed ? '1' : '0'); } catch { /* storage may be disabled */ }
  }, [collapsed]);

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

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileOpen]);

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
    if (window.matchMedia('(max-width: 899px)').matches) setMobileOpen(open => !open);
    else setCollapsed(value => !value);
  }

  return (
    <div className={['admin-workspace', collapsed ? 'is-collapsed' : '', mobileOpen ? 'is-mobile-open' : ''].filter(Boolean).join(' ')}>
      {mobileOpen && <button type="button" className="admin-sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}
      <aside className="admin-sidebar" aria-label="管理后台导航">
        <div className="admin-sidebar-brand">
          <div className="admin-brand-mark">Q</div>
          <div className="admin-brand-copy">
            <strong>青春档案</strong>
            <span>ADMIN CONSOLE</span>
          </div>
          <button type="button" className="admin-sidebar-close" aria-label="关闭导航" onClick={() => setMobileOpen(false)}>
            <AdminIcon name="close" size={17} />
          </button>
        </div>

        <div className="admin-sidebar-caption">WORKSPACE</div>
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
                      title={collapsed ? item.label : undefined}
                      onClick={() => choose(item.id)}>
                      <span className="admin-nav-icon"><AdminIcon name={item.id} size={17} /></span>
                      <span className="admin-nav-label">{item.label}</span>
                      {activeTab === item.id && <span className="admin-nav-active-dot" />}
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
        <header className="admin-console-topbar">
          <button type="button" className="admin-console-icon-button" aria-label="切换导航" onClick={toggleNavigation}>
            <AdminIcon name="panel" size={18} />
          </button>
          <div className="admin-console-breadcrumb">
            <span>管理控制中心</span>
            <AdminIcon name="chevron" size={13} />
            <strong>{current?.[1] ?? '工作台'}</strong>
          </div>
          <div className="admin-console-spacer" />
          <button ref={commandTrigger} type="button" className="admin-command-trigger" aria-haspopup="dialog" aria-expanded={paletteOpen} onClick={() => { setQuery(''); setPaletteOpen(true); }}>
            <AdminIcon name="search" size={16} />
            <span>搜索管理功能</span>
            <kbd>Ctrl K</kbd>
          </button>
          <span className="admin-console-role">{isSuper ? '超级管理员' : '内容管理员'}</span>
          <button type="button" className="admin-console-logout" onClick={onLogout}>
            <AdminIcon name="logout" size={16} />
            <span>退出</span>
          </button>
        </header>

        <main className="admin-workspace-content">
          <div className="admin-page-heading">
            <div className="admin-page-heading-copy">
              <div className="admin-page-eyebrow">{currentGroup} / WORKSPACE</div>
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
      </div>

      <nav className="admin-mobile-quickbar" aria-label="移动端快捷导航">
        {mobileQuickItems.map(item => (
            <button type="button" key={item.id}
              className={['admin-mobile-quick-item', activeTab === item.id ? 'is-active' : ''].join(' ')}
              aria-current={activeTab === item.id ? 'page' : undefined}
              onClick={() => choose(item.id)}>
              <span className="admin-mobile-quick-icon"><AdminIcon name={item.id} size={18} /></span>
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
                  <span className="admin-command-result-icon"><AdminIcon name={item.id} size={17} /></span>
                  <span className="admin-command-result-copy"><strong>{item.label}</strong><small>{item.group}</small></span>
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
