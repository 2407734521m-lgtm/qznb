import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Login from './Login';
import GuestLoveWall from './GuestLoveWall';
import VisitCounter from '../components/VisitCounter';
import GuestPosts from './GuestPosts';
import './GuestBrowse.css';

type Notice = { id?: number | string; title?: string | null; content?: string | null; created_at?: string | null };
type Props = {
  nickname: string;
  expiresAt: number;
  siteConfig: any;
  showLoveWall: boolean;
  showAnnouncements: boolean;
  loginOpen: boolean;
  loginEnabled: boolean;
  onOpenLogin: () => void;
  onCloseLogin: () => void;
  onExit: () => void;
};

function GuestHome({ siteConfig, onLoginRequired, showLoveWall, showAnnouncements }: {
  siteConfig: any;
  onLoginRequired: () => void;
  showLoveWall: boolean;
  showAnnouncements: boolean;
}) {
  const notices = showAnnouncements && Array.isArray(siteConfig?.notices) ? siteConfig.notices as Notice[] : [];
  const title = siteConfig?.site_title || '堯';
  const subtitle = siteConfig?.site_subtitle || '连接人与内容';
  const configuredBanner = typeof siteConfig?.home_banner_text === 'string' ? siteConfig.home_banner_text.trim() : '';
  const banner = !configuredBanner || /^(测试|test|demo)$/i.test(configuredBanner)
    ? '让分享与连接，自然发生。'
    : configuredBanner;
  const bannerUrl = typeof siteConfig?.home_banner_url === 'string' && /^https?:\/\//.test(siteConfig.home_banner_url)
    ? siteConfig.home_banner_url : '';

  return (
    <main className="guest-main">
      <section className={`guest-hero${bannerUrl ? ' has-image' : ''}`} aria-label="堯社区介绍">
        {bannerUrl ? <img className="guest-hero-image" src={bannerUrl} alt="" /> : null}
        <div className="guest-hero-shade" />
        <div className="guest-hero-content">
          <span className="guest-eyebrow">堯 · OPEN COMMUNITY</span>
          <h1>{banner}</h1>
          <p>{subtitle}。浏览公开内容，发现正在发生的分享与故事。</p>
          <div className="guest-hero-actions">
            <NavLink to="/feed" className="guest-button guest-button-primary">浏览动态 <span aria-hidden="true">↗</span></NavLink>
            {showAnnouncements && <NavLink to="/board" className="guest-button guest-button-quiet">查看公告</NavLink>}
          </div>
        </div>
        <span className="guest-hero-index">01 <i /> PUBLIC SPACE</span>
      </section>

      <div className="guest-home-layout">
        <div className="guest-home-feed">
          <GuestPosts section="all" onLoginRequired={onLoginRequired} />
        </div>

        <aside className="guest-home-aside">
          <section className="guest-panel guest-explore">
            <header className="guest-panel-heading">
              <div><span className="guest-eyebrow">EXPLORE</span><h2>发现更多</h2></div>
              <span className="guest-panel-note">公开浏览</span>
            </header>
            <div className="guest-feature-list">
              {showLoveWall
                ? <NavLink to="/love-wall" className="guest-feature-link"><FeatureCard symbol="♡" title="表白墙" description="看看公开的心意与故事。" /></NavLink>
                : <FeatureCard symbol="♡" title="表白墙" description="管理员暂未开放游客浏览。" locked />}
              {showAnnouncements
                ? <NavLink to="/board" className="guest-feature-link"><FeatureCard symbol="↗" title="公告" description="了解网站消息与近期更新。" /></NavLink>
                : <FeatureCard symbol="↗" title="公告" description="管理员暂未开放游客浏览。" locked />}
              <button type="button" className="guest-feature-button" onClick={onLoginRequired}>
                <FeatureCard symbol="♫" title="歌声墙" description="登录后分享声音与作品。" locked />
              </button>
              <NavLink to="/daily" className="guest-feature-link"><FeatureCard symbol="☼" title="日常" description="浏览大家记录的日常片段。" /></NavLink>
            </div>
          </section>

          {showAnnouncements && (
            <section className="guest-panel guest-announcements">
              <header className="guest-panel-heading">
                <div><span className="guest-eyebrow">UPDATES</span><h2>最近公告</h2></div>
                <NavLink to="/board" className="guest-inline-link">全部 ↗</NavLink>
              </header>
              {notices.length ? notices.slice(0, 3).map((notice, index) => (
                <article className="guest-notice-row" key={notice.id ?? index}>
                  <span className="guest-notice-marker" />
                  <div>
                    {notice.title && <h3>{notice.title}</h3>}
                    <p>{notice.content || '查看公告详情，了解最新消息。'}</p>
                    {notice.created_at && <time>{new Date(notice.created_at).toLocaleDateString()}</time>}
                  </div>
                </article>
              )) : <p className="guest-empty-note">暂时没有新的公开公告。</p>}
            </section>
          )}

          <div className="guest-aside-note">
            <span className="guest-note-dot" />
            游客可以浏览公开内容；点赞、评论与发布需要登录。
          </div>
        </aside>
      </div>

      <footer className="guest-footer">
        <strong>{title}</strong><span>{subtitle}</span>
      </footer>
    </main>
  );
}

function GuestBoard({ siteConfig }: { siteConfig: any }) {
  const notices = (Array.isArray(siteConfig?.notices) ? siteConfig.notices : []) as Notice[];
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '10px 0 36px' }}>
      <div style={{ padding: '8px 2px 14px' }}>
        <div style={{ fontSize: 11, letterSpacing: 2.4, color: '#737b89' }}>PUBLIC ANNOUNCEMENTS</div>
        <h1 style={{ fontSize: 27, margin: '8px 0 4px', color: '#202632' }}>公告</h1>
        <p style={{ color: '#606673', fontSize: 13, lineHeight: 1.7, margin: 0 }}>仅展示网站允许公开浏览的管理员公告。</p>
      </div>
      <section style={{ padding: '18px clamp(14px,4vw,22px)', borderRadius: 20, background: '#fff', border: '1px solid #e9ebf0' }}>
        {notices.length ? notices.map((notice, index) => (
          <article key={notice.id ?? index} style={{ padding: '13px 0', borderTop: index ? '1px solid #edf0f4' : 0 }}>
            {notice.title && <h2 style={{ margin: '0 0 6px', fontSize: 15, color: '#303846' }}>{notice.title}</h2>}
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#4b5563', fontSize: 14 }}>{notice.content}</p>
            {notice.created_at && <div style={{ marginTop: 7, color: '#9aa2ae', fontSize: 11 }}>{new Date(notice.created_at).toLocaleString()}</div>}
          </article>
        )) : <p style={{ color: '#87909d', fontSize: 13 }}>暂时没有公开公告。</p>}
      </section>
    </main>
  );
}

function GuestUnavailable() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '36px 18px', textAlign: 'center', color: '#697386' }}>
      <div style={{ fontSize: 26, marginBottom: 8 }}>◌</div>
      <h2 style={{ color: '#303846', fontSize: 18, margin: '0 0 8px' }}>暂未开放游客浏览</h2>
      <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }}>管理员暂时关闭了这部分公开内容。</p>
    </main>
  );
}

function FeatureCard({ title, description, locked = false, symbol }: {
  title: string;
  description: string;
  locked?: boolean;
  symbol: string;
}) {
  return (
    <div className={`guest-feature-card${locked ? ' is-locked' : ''}`}>
      <span className="guest-feature-symbol" aria-hidden="true">{symbol}</span>
      <div className="guest-feature-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <span className="guest-feature-arrow" aria-hidden="true">{locked ? '↗' : '→'}</span>
    </div>
  );
}

export default function GuestBrowse({
  nickname, expiresAt, siteConfig, showLoveWall, showAnnouncements,
  loginOpen, loginEnabled, onOpenLogin, onCloseLogin, onExit,
}: Props) {
  function requestLogin() {
    onOpenLogin();
  }

  return (
    <div className="guest-shell">
      <header className="guest-header">
        <NavLink to="/home" className="guest-brand" aria-label="堯首页">
          <span className="guest-brand-mark">堯</span>
          <span className="guest-brand-copy"><strong>堯</strong><small>连接人与内容</small></span>
        </NavLink>
        <div className="guest-header-status">
          <span className="guest-status-label">访客浏览</span>
          <span className="guest-status-detail">{nickname} · {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 后退出</span>
        </div>
        <div className="guest-header-actions">
          {loginEnabled && <button type="button" className="guest-button guest-button-primary" onClick={requestLogin}>登录 / 注册</button>}
          <button type="button" className="guest-exit-button" onClick={onExit}>退出</button>
        </div>
      </header>

      <nav className="guest-nav" aria-label="游客浏览导航">
        {[
          { to: '/home', label: '首页' },
          { to: '/feed', label: '动态' },
          { to: '/daily', label: '日常' },
          ...(showLoveWall ? [{ to: '/love-wall', label: '表白墙' }] : []),
          ...(showAnnouncements ? [{ to: '/board', label: '公告' }] : []),
        ].map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/home'} className={({ isActive }) => isActive ? 'guest-nav-link is-active' : 'guest-nav-link'}>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<GuestHome siteConfig={siteConfig} onLoginRequired={requestLogin} showLoveWall={showLoveWall} showAnnouncements={showAnnouncements} />} />
        <Route path="/feed" element={<GuestPosts section="feed" onLoginRequired={requestLogin} />} />
        <Route path="/daily" element={<GuestPosts section="daily" onLoginRequired={requestLogin} />} />
        <Route path="/love-wall" element={showLoveWall ? <GuestLoveWall onLoginRequired={requestLogin} /> : <GuestUnavailable />} />
        <Route path="/board" element={showAnnouncements ? <GuestBoard siteConfig={siteConfig} /> : <GuestUnavailable />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>

      <div className="guest-bottom-note">公开内容只读 · 登录后解锁完整互动与个人功能</div>
      <VisitCounter />

      {!loginEnabled && loginOpen && (
        <div role="dialog" aria-modal="true" onClick={onCloseLogin} style={{
          position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20, background: 'rgba(20,28,40,.42)', backdropFilter: 'blur(10px)',
        }}>
          <section onClick={event => event.stopPropagation()} style={{ maxWidth: 360, width: '100%', background: '#fff', borderRadius: 20, padding: 22, textAlign: 'center' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>登录入口暂未开放</h2>
            <p style={{ color: '#697386', fontSize: 13, lineHeight: 1.7 }}>管理员暂时关闭了登录与注册入口，请稍后再来。</p>
            <button type="button" onClick={onCloseLogin} style={{ padding: '10px 18px', borderRadius: 999, border: 0, background: '#202632', color: '#fff' }}>知道了</button>
          </section>
        </div>
      )}

      {loginOpen && loginEnabled && (
        <div role="dialog" aria-modal="true" aria-label="登录或注册" onClick={onCloseLogin} style={{
          position: 'fixed', inset: 0, zIndex: 1100, overflowY: 'auto',
          background: 'rgba(20,28,40,.72)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        }}>
          <button type="button" onClick={onCloseLogin} aria-label="关闭登录窗口" style={{
            position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', right: 14, zIndex: 1102,
            width: 40, height: 40, borderRadius: 999, border: '1px solid #e3e7ee',
            background: 'rgba(255,255,255,.92)', color: '#303846', fontSize: 18,
          }}>×</button>
          <div onClick={event => event.stopPropagation()}>
            <Login siteTitle={siteConfig?.site_title} siteSubtitle={siteConfig?.site_subtitle} />
          </div>
        </div>
      )}
    </div>
  );
}
