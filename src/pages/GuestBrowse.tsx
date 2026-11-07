import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Login from './Login';
import GuestLoveWall from './GuestLoveWall';

type Notice = { id?: number | string; title?: string | null; content?: string | null; created_at?: string | null };
type Props = {
  nickname: string;
  siteConfig: any;
  loginOpen: boolean;
  loginEnabled: boolean;
  onOpenLogin: () => void;
  onCloseLogin: () => void;
  onExit: () => void;
};

function GuestHome({ siteConfig, onLoginRequired }: { siteConfig: any; onLoginRequired: () => void }) {
  const notices = (Array.isArray(siteConfig?.notices) ? siteConfig.notices : []) as Notice[];
  const title = siteConfig?.site_title || '堯';
  const subtitle = siteConfig?.site_subtitle || '公开浏览';
  const banner = siteConfig?.home_banner_text || '欢迎来到堯';
  const bannerUrl = typeof siteConfig?.home_banner_url === 'string' && /^https?:\/\//.test(siteConfig.home_banner_url)
    ? siteConfig.home_banner_url : '';

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '10px 0 36px' }}>
      <section style={{
        position: 'relative', overflow: 'hidden', aspectRatio: '16 / 9',
        borderRadius: 22, background: '#eef2f7', border: '1px solid #e5e8ee',
        boxShadow: '0 12px 34px #202a3d0c',
      }}>
        {bannerUrl && <img src={bannerUrl} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          justifyContent: 'flex-end', padding: 'clamp(18px,5vw,30px)',
          background: bannerUrl ? 'linear-gradient(90deg,#10182870,transparent 75%)' : 'linear-gradient(145deg,#f7f9fc,#e9eef5)',
        }}>
          <div style={{
            display: 'inline-block', alignSelf: 'flex-start', padding: 'clamp(14px,3vw,20px)',
            borderRadius: 16, background: 'rgba(255,255,255,.62)',
            border: '1px solid rgba(255,255,255,.7)', backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#737b89' }}>PUBLIC SPACE</div>
            <h1 style={{ margin: '7px 0 0', color: '#202632', fontSize: 'clamp(22px,5vw,32px)', lineHeight: 1.3 }}>{banner}</h1>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: '#8a93a1' }}>EXPLORE THE SITE</div>
            <h2 style={{ margin: '5px 0 0', fontSize: 20, color: '#202632' }}>先逛一逛</h2>
          </div>
          <span style={{ fontSize: 11, color: '#929aa6' }}>游客只读</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,220px),1fr))', gap: 10 }}>
          <NavLink to="/love-wall" style={{ textDecoration: 'none', color: 'inherit' }}>
            <FeatureCard title="表白墙" description="查看已经审核公开的心意，点赞、评论和投稿需要登录。" />
          </NavLink>
          <NavLink to="/board" style={{ textDecoration: 'none', color: 'inherit' }}>
            <FeatureCard title="公告" description="浏览网站公开公告和近期通知。" />
          </NavLink>
          <button type="button" onClick={onLoginRequired} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
            <FeatureCard title="歌声墙" description="了解声音分享功能，登录后即可参与。" locked />
          </button>
          <button type="button" onClick={onLoginRequired} style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
            <FeatureCard title="日常与动态" description="了解日常分享功能，正式账号可发布和互动。" locked />
          </button>
        </div>
      </section>

      <section style={{ marginTop: 20, padding: '18px clamp(14px,4vw,22px)', borderRadius: 20, background: '#fff', border: '1px solid #e9ebf0', boxShadow: '0 8px 28px #202a3d0a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#202632' }}>公开公告</h2>
          <NavLink to="/board" style={{ fontSize: 12, color: '#697386', textDecoration: 'none' }}>查看全部</NavLink>
        </div>
        {notices.length ? notices.slice(0, 4).map((notice, index) => (
          <article key={notice.id ?? index} style={{ borderTop: '1px solid #edf0f4', padding: '12px 0' }}>
            {notice.title && <h3 style={{ margin: '0 0 5px', fontSize: 14, color: '#303846' }}>{notice.title}</h3>}
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 13, color: '#5b6472' }}>{notice.content}</p>
            {notice.created_at && <div style={{ marginTop: 6, color: '#9aa2ae', fontSize: 11 }}>{new Date(notice.created_at).toLocaleString()}</div>}
          </article>
        )) : <p style={{ color: '#87909d', fontSize: 13, margin: 0 }}>暂时没有公开公告。</p>}
      </section>

      <p style={{ margin: '18px 2px 0', color: '#929aa6', fontSize: 11, lineHeight: 1.7 }}>
        {title} · {subtitle} · 游客可浏览公开信息，互动与个人功能需要正式账号。
      </p>
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

function FeatureCard({ title, description, locked = false }: { title: string; description: string; locked?: boolean }) {
  return (
    <div style={{
      minHeight: 108, height: '100%', boxSizing: 'border-box', padding: 16,
      borderRadius: 18, border: '1px solid #e7eaf0', background: '#fff',
      boxShadow: '0 8px 24px #202a3d08',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <strong style={{ fontSize: 15, color: '#202632' }}>{title}</strong>
        {locked && <span style={{ fontSize: 10, borderRadius: 999, background: '#f2f4f7', color: '#707988', padding: '4px 8px' }}>登录可用</span>}
      </div>
      <p style={{ margin: '9px 0 0', fontSize: 12, color: '#697386', lineHeight: 1.65 }}>{description}</p>
    </div>
  );
}

export default function GuestBrowse({
  nickname, siteConfig, loginOpen, loginEnabled, onOpenLogin, onCloseLogin, onExit,
}: Props) {
  function requestLogin() {
    onOpenLogin();
  }

  return (
    <div style={{
      minHeight: '100dvh', boxSizing: 'border-box', padding: 'max(14px, env(safe-area-inset-top)) 14px calc(24px + env(safe-area-inset-bottom))',
      background: '#f7f9fc', color: '#202632',
    }}>
      <header style={{
        maxWidth: 900, margin: '0 auto 14px', padding: '12px 2px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: '#8a93a1' }}>GUEST BROWSING</div>
          <div style={{ fontSize: 19, fontWeight: 850, color: '#202632', marginTop: 3 }}>{siteConfig?.site_title || '堯'}</div>
          <div style={{ fontSize: 11, color: '#7a8492', marginTop: 2 }}>访客 · {nickname}</div>
        </div>
        {loginEnabled && <button type="button" onClick={requestLogin} style={{
          flex: '0 0 auto', border: 0, borderRadius: 999, padding: '10px 15px',
          background: '#202632', color: '#fff', fontSize: 12, fontWeight: 800,
        }}>登录 / 注册</button>}
        <button type="button" onClick={onExit} style={{
          flex: '0 0 auto', border: '1px solid #dfe3ea', borderRadius: 999,
          padding: '9px 12px', background: '#fff', color: '#606673', fontSize: 12,
        }}>退出游客</button>
      </header>

      <nav aria-label="游客浏览导航" style={{
        maxWidth: 900, margin: '0 auto 14px', padding: 5, borderRadius: 999,
        background: '#fff', border: '1px solid #e9ebf0', display: 'flex', gap: 4,
      }}>
        {[{ to: '/home', label: '首页' }, { to: '/love-wall', label: '表白墙' }, { to: '/board', label: '公告' }].map(item => (
          <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
            flex: 1, textAlign: 'center', textDecoration: 'none', borderRadius: 999,
            padding: '10px 8px', fontSize: 13, fontWeight: 750,
            background: isActive ? '#202632' : 'transparent', color: isActive ? '#fff' : '#697386',
          })}>{item.label}</NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<GuestHome siteConfig={siteConfig} onLoginRequired={requestLogin} />} />
        <Route path="/love-wall" element={<GuestLoveWall onLoginRequired={requestLogin} />} />
        <Route path="/board" element={<GuestBoard siteConfig={siteConfig} />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>

      <div style={{ maxWidth: 820, margin: '20px auto 0', textAlign: 'center', color: '#929aa6', fontSize: 11, lineHeight: 1.6 }}>
        游客模式 · 公开内容只读 · 点赞、评论、投稿等互动需要正式账号
      </div>

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
