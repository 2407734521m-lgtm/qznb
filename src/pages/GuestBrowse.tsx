import { BRAND_NAME, BRAND_SUBTITLE, BRAND_MARK, resolveBrandTitle, resolveBrandSubtitle } from '../lib/brand';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Login from './Login';
import GuestLoveWall from './GuestLoveWall';
import VisitCounter from '../components/VisitCounter';
import GuestPosts from './GuestPosts';
import './GuestBrowse.css';
import './Guest.cruip.css';

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
  const title = resolveBrandTitle(siteConfig?.site_title);
  const subtitle = resolveBrandSubtitle(siteConfig?.site_subtitle);
  const configuredBanner = typeof siteConfig?.home_banner_text === 'string' ? siteConfig.home_banner_text.trim() : '';
  const banner = !configuredBanner || /^(测试|test|demo)$/i.test(configuredBanner)
    ? '让分享与连接，自然发生。'
    : configuredBanner;
  const bannerUrl = typeof siteConfig?.home_banner_url === 'string' && /^https?:\/\//.test(siteConfig.home_banner_url)
    ? siteConfig.home_banner_url : '';

  return (
    <main className="guest-main">
      <section className="guest-cruip-hero" aria-label={`${title} 社区介绍`}>
        <div className="guest-cruip-hero-copy">
          <span className="guest-eyebrow">{BRAND_NAME.toUpperCase()} · OPEN COMMUNITY</span>
          <h1>{banner}</h1>
          <p>{subtitle}。浏览公开内容，发现正在发生的分享与故事。</p>
          <div className="guest-cruip-hero-actions">
            <NavLink to="/feed" className="guest-button guest-button-primary">浏览动态 <span aria-hidden="true">↗</span></NavLink>
            {showAnnouncements && <NavLink to="/board" className="guest-button guest-button-secondary">查看公告</NavLink>}
          </div>
        </div>
        {bannerUrl ? (
          <figure className="guest-cruip-hero-visual">
            <img src={bannerUrl} alt="" />
          </figure>
        ) : null}
      </section>

      <section className="guest-quick-section" aria-label="快捷入口">
        <div className="guest-section-heading">
          <div><span className="guest-eyebrow">START EXPLORING</span><h2>从这里开始</h2><p>先看看大家正在分享什么。</p></div>
          <span className="guest-section-index">01 / EXPLORE</span>
        </div>
        <div className="guest-quick-grid">
          <NavLink to="/feed" className="guest-quick-card"><span className="guest-quick-icon">↗</span><strong>社区动态</strong><small>看看最近的新鲜事</small></NavLink>
          <NavLink to="/daily" className="guest-quick-card"><span className="guest-quick-icon">☼</span><strong>日常片段</strong><small>发现生活里的小事</small></NavLink>
          <button type="button" className="guest-quick-card is-locked" onClick={onLoginRequired}><span className="guest-quick-icon">◎</span><strong>认识成员</strong><small>登录后探索成员主页</small></button>
          {showLoveWall ? <NavLink to="/love-wall" className="guest-quick-card"><span className="guest-quick-icon">♡</span><strong>表白墙</strong><small>阅读公开的心意</small></NavLink> : <button type="button" className="guest-quick-card is-locked" onClick={onLoginRequired}><span className="guest-quick-icon">♡</span><strong>表白墙</strong><small>暂未开放游客浏览</small></button>}
        </div>
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

      <section className="guest-discovery-section">
        <div className="guest-section-heading">
          <div><span className="guest-eyebrow">A LITTLE MORE</span><h2>这里不止有动态</h2><p>不同的角落，记录不同的想法与瞬间。</p></div>
          <span className="guest-section-index">02 / COMMUNITY</span>
        </div>
        <div className="guest-discovery-grid">
          <NavLink to="/feed" className="guest-discovery-card guest-discovery-members"><span>PEOPLE & STORIES</span><strong>从分享认识彼此</strong><p>在公开动态里，发现社区成员的故事。</p><i>浏览动态 ↗</i></NavLink>
          <NavLink to="/daily" className="guest-discovery-card guest-discovery-daily"><span>MOMENTS</span><strong>收集日常灵感</strong><p>看看大家分享的生活片段。</p><i>浏览日常 ↗</i></NavLink>
          <NavLink to="/feed" className="guest-discovery-card guest-discovery-feed"><span>DISCOVER</span><strong>让灵感继续发生</strong><p>在公开动态里，遇见新的话题。</p><i>继续发现 ↗</i></NavLink>
        </div>
      </section>

      <section className="guest-cruip-cta" aria-label="加入社区">
        <span className="guest-eyebrow">JOIN CLASS MEMORY</span>
        <h2>准备好加入了吗？</h2>
        <p>登录后可以点赞、评论、发布内容，认识更多同学。</p>
        <div className="guest-cruip-hero-actions">
          <button type="button" className="guest-button guest-button-primary" onClick={onLoginRequired}>登录 / 注册</button>
          <NavLink to="/feed" className="guest-button guest-button-secondary">继续浏览动态</NavLink>
        </div>
      </section>

      <footer className="guest-footer guest-cruip-footer">
        <div className="guest-cruip-footer-brand">
          <span className="guest-brand-mark">{BRAND_MARK}</span>
          <div><strong>{title}</strong><span>{subtitle}</span></div>
        </div>
        <nav className="guest-cruip-footer-nav" aria-label="游客页脚导航">
          <NavLink to="/home">首页</NavLink>
          <NavLink to="/feed">动态</NavLink>
          <NavLink to="/daily">日常</NavLink>
          {showLoveWall && <NavLink to="/love-wall">表白墙</NavLink>}
          {showAnnouncements && <NavLink to="/board">公告</NavLink>}
        </nav>
      </footer>
    </main>
  );
}

function GuestBoard({ siteConfig }: { siteConfig: any }) {
  const notices = (Array.isArray(siteConfig?.notices) ? siteConfig.notices : []) as Notice[];
  return (
    <main className="guest-cruip-board">
      <header className="guest-cruip-section-head">
        <span className="guest-eyebrow">PUBLIC ANNOUNCEMENTS</span>
        <h1>公告</h1>
        <p>仅展示网站允许公开浏览的管理员公告。</p>
      </header>
      <section className="guest-cruip-board-card">
        {notices.length ? notices.map((notice, index) => (
          <article key={notice.id ?? index} className="guest-cruip-board-row">
            {notice.title && <h2>{notice.title}</h2>}
            <p>{notice.content}</p>
            {notice.created_at && <time>{new Date(notice.created_at).toLocaleString()}</time>}
          </article>
        )) : <p className="guest-cruip-board-empty">暂时没有公开公告。</p>}
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
        <NavLink to="/home" className="guest-brand" aria-label={`${BRAND_NAME} 首页`}>
          <span className="guest-brand-mark">{BRAND_MARK}</span>
          <span className="guest-brand-copy"><strong>{BRAND_NAME}</strong><small>{BRAND_SUBTITLE}</small></span>
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
