import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import { AuthProvider, useAuth } from './auth';
import { supabase } from './lib/supabase';
import { DialogHost } from './lib/dialog';
import ErrorBoundary from './components/ErrorBoundary';
import TestSwitchFab from './components/TestSwitchFab';
/* Global foundation and legacy compatibility sheets. Keep their order stable. */
import './styles.css';
import './styles-editorial.css';
import './styles-desktop.css';
import './styles-motion-polish.css';
import './styles-particle-flower.css';
import './styles-visual-rules.css';
import './styles-liquid-backdrop.css';

/* Canonical material tokens load after legacy themes and before their components. */
import './styles-ios26-tokens.css';
import './styles-ios26-liquid-glass.css';

/* Form controls intentionally refine the shared component styles last. */
import './styles-form-ux.css';

/* rdev liquid-glass dock shell overrides (must stay after ios26 + form-ux). */
import './styles-dock-rdev.css';

/* 深色残留清理：全站页头横幅与成员页搜索框统一浅色，必须最后加载。 */
import './styles-light-cleanup.css';
import './styles-fullheight-dialogs.css';

/* Canonical public-site design system; keep last to prevent legacy theme collisions. */
import './styles-quiet-premium.css';
import './styles-quiet-editorial-detail.css';
import './styles-quiet-community-detail.css';
import './styles-archive.css';
import './styles-motion-premium.css'; // Final motion layer: keep after all visual overrides.

// 只有精确匹配的管理员域名可以挂载后台；其他任何域名都不能加载 AdminShell。
const isAdminHost = window.location.hostname.toLowerCase() === 'admin.qianzhi.pw';

// 主站不承载后台界面，也不再跳转：后台只在 admin.qianzhi.pw 上打开（用户 2026-11-07 定）。

function AdminShell() {
  const { session, loading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  const [verifiedUid, setVerifiedUid] = useState<string | null>(null);
  useEffect(() => {
    setRole(null);
    setVerifiedUid(null);
    if (!session) return;
    let live = true;
    const uid = session.user.id;
    const markUnavailable = () => {
      if (!live) return;
      setRole('');
      setVerifiedUid(uid);
    };
    const timer = setTimeout(markUnavailable, 8000);
    supabase.rpc('my_role').then(
      ({ data, error }) => {
        clearTimeout(timer);
        if (!live) return;
        setRole(error ? '' : (data ?? ''));
        setVerifiedUid(uid);
      },
      () => {
        clearTimeout(timer);
        markUnavailable();
      }
    );
    return () => { live = false; clearTimeout(timer); };
  }, [session?.user.id]);
  // 后台标签标题：跟随后台设置里的网站标题，格式为「<网站标题> · 管理后台」。
  useEffect(() => {
    let live = true;
    supabase.from('site_settings').select('key, value').in('key', ['site_title'])
      .then(({ data }) => {
        if (!live) return;
        const t = (data ?? []).find((x: any) => x.key === 'site_title')?.value;
        document.title = `${String(t || '堯').trim() || '堯'} · 管理后台`;
      });
    return () => { live = false; };
  }, []);
  if (loading || (session && (role === null || verifiedUid !== session.user.id))) return <div className="center">加载中…</div>;
  const isAdmin = Boolean(session) && (role === 'admin' || role === 'super_admin');
  if (!isAdmin) return (<><div className="glow" /><AdminLogin showBack={false} /></>);
  return (<>
    <div className="glow" />
    <Admin verifiedRole={role === 'super_admin' ? 'super_admin' : 'admin'} />
  </>);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HashRouter><AuthProvider>
    <ErrorBoundary>
      {isAdminHost ? <AdminShell /> : <App />}
      <TestSwitchFab />
    </ErrorBoundary>
    <DialogHost />
  </AuthProvider></HashRouter></React.StrictMode>
);
