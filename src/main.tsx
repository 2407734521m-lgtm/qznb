import { resolveBrandTitle } from './lib/brand';
import { DelayedPageSkeleton, RouteLoading } from './components/fx/Skeleton';
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
const App = lazyWithRetry(() => import('./App'));
const Admin = lazyWithRetry(() => import('./pages/Admin'));
const AdminLogin = lazyWithRetry(() => import('./pages/AdminLogin'));
const IntroAnimation = lazyWithRetry(() => import('./components/IntroAnimation'));
import { AuthProvider, useAuth } from './auth';
import { supabase } from './lib/supabase';
import { DialogHost } from './lib/dialog';
import { Toaster } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary';
import { lazyWithRetry } from './lib/lazyWithRetry';
import TestSwitchFab from './components/TestSwitchFab';
import { detectInstalledAdminApp } from './lib/installedApp';
import AppUpdateDialog from './components/AppUpdateDialog';
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

/* Sonner Toast 纸面冷白覆盖（最后加载，确保盖过 Toast 默认样式）。 */
import './styles-toast.css';

// 只有精确匹配的管理员域名可以挂载后台；其他任何域名都不能加载 AdminShell。
const isAdminHost = window.location.hostname.toLowerCase() === 'admin.qianzhi.pw';

// 主站不承载后台界面，也不再跳转：后台只在 admin.qianzhi.pw 上打开（用户 2026-11-07 定）。

// Sonner Toast（纸面冷白：白底、墨色字、描边 #e5e8ea，错误态印泥红 #b0404f）。
// 主站根部与 AdminShell 根部各挂一个；两棵树同一时间只挂载一棵，不会重复弹。
function PaperToaster() {
  return (
    <Toaster
      theme="light"
      position="top-center"
      duration={3000}
      gap={8}
      toastOptions={{
        style: { background: '#ffffff', color: '#1f2a3a', border: '1px solid #e5e8ea' },
      }}
    />
  );
}

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
  // 管理版应用（青春管理）更新：后台域名走的是本 AdminShell 而非主站 App，
  // 更新检查必须挂在这里主站那套才够不着。逻辑与主站学生版一致：进应用与
  // 切回前台时查 public_admin_app_update()，序号更高就弹更新框。
  const [adminUpdate, setAdminUpdate] = useState<any>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const adminUpdateCodeRef = useRef('');
  useEffect(() => {
    const check = () => {
      if (!detectInstalledAdminApp()) return;
      supabase.rpc('public_admin_app_update').then(({ data, error }) => {
        if (error || !data) return;
        const code = String((data as any).app_version_code || '');
        if (adminUpdateCodeRef.current && adminUpdateCodeRef.current !== code) setUpdateDismissed(false);
        adminUpdateCodeRef.current = code;
        setAdminUpdate(data);
      });
    };
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  // 网站包自检（与主站 App Shell 同款，AdminShell 此前缺这套）：定期比对线上
  // 脚本包与本页正在跑的包，不一致自动刷新一次。没有它时，管理版应用会一直
  // 躺在缓存里的旧页面上，新功能和更新框永远到不了（2026-11-08 真机实证）。
  useEffect(() => {
    let reloading = false;
    const checkFresh = async () => {
      if (reloading || document.visibilityState !== 'visible') return;
      try {
        const current = document.querySelector('script[src*="assets/index-"]')?.getAttribute('src') || '';
        const currentName = current.split('/').pop() || '';
        if (!currentName) return;
        const res = await fetch('/?fresh=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) return;
        const html = await res.text();
        const found = html.match(/assets\/(index-[^"']+\.js)/);
        if (found && found[1] !== currentName) {
          const last = Number(sessionStorage.getItem('qz_admin_fresh_reload_at') || 0);
          if (Date.now() - last < 60000) return;
          sessionStorage.setItem('qz_admin_fresh_reload_at', String(Date.now()));
          reloading = true;
          location.reload();
        }
      } catch { /* 网络不稳就跳过，下次再查 */ }
    };
    const onVis = () => { void checkFresh(); };
    document.addEventListener('visibilitychange', onVis);
    const timer = window.setInterval(checkFresh, 5 * 60 * 1000);
    return () => { document.removeEventListener('visibilitychange', onVis); window.clearInterval(timer); };
  }, []);
  // 后台标签标题：跟随后台设置里的网站标题，格式为「<网站标题> · 管理后台」。
  useEffect(() => {
    let live = true;
    supabase.from('site_settings').select('key, value').in('key', ['site_title'])
      .then(({ data }) => {
        if (!live) return;
        const t = (data ?? []).find((x: any) => x.key === 'site_title')?.value;
        document.title = `${resolveBrandTitle(t)} · 管理后台`;
      });
    return () => { live = false; };
  }, []);
  if (loading || (session && (role === null || verifiedUid !== session.user.id))) return <DelayedPageSkeleton />;
  const isAdmin = Boolean(session) && (role === 'admin' || role === 'super_admin');
  const adminApp = detectInstalledAdminApp();
  const latestAdminCode = adminUpdate ? Number(adminUpdate.app_version_code || 0) : 0;
  const adminMinCode = adminUpdate ? Number(adminUpdate.app_min_code || 0) : 0;
  const adminForced = adminUpdate?.app_force_update === 'true' || (adminMinCode > 0 && !!adminApp && adminApp.code < adminMinCode);
  let adminIgnored = false;
  try { adminIgnored = localStorage.getItem('qz_admin_app_update_ignored') === String(latestAdminCode); } catch { /* storage unavailable */ }
  const showAdminUpdate = !!adminApp && !!adminUpdate && latestAdminCode > adminApp.code
    && !!adminUpdate.app_apk_url && !updateDismissed && (adminForced || !adminIgnored);
  const ignoreAdminUpdate = () => {
    try { localStorage.setItem('qz_admin_app_update_ignored', String(latestAdminCode)); } catch { /* storage unavailable */ }
    setUpdateDismissed(true);
  };
  const adminUpdateDialog = showAdminUpdate && adminApp ? (
    <AppUpdateDialog currentName={adminApp.name} info={{ ...adminUpdate, app_force_update: adminForced ? 'true' : 'false' }} onIgnore={ignoreAdminUpdate} />
  ) : null;
  if (!isAdmin) return (<><div className="glow" />{adminUpdateDialog}<PaperToaster /><AdminLogin showBack={false} /></>);
  return (<>
    <div className="glow" />
    {adminUpdateDialog}
    <PaperToaster />
    <Admin verifiedRole={role === 'super_admin' ? 'super_admin' : 'admin'} />
  </>);
}

// 开场动画（方向一：品牌浮现）：只在主站播，后台不播；每次冷打开播一次，
// 同一标签页会话内只播一次，点按跳过。IntroAnimation 自己管淡出，
// 这里只负责挂载与会话去重。
function SiteIntro() {
  const [show, setShow] = useState<boolean>(() => {
    try { return !sessionStorage.getItem('qz_intro_seen_v1'); } catch { return true; }
  });
  function done() {
    try { sessionStorage.setItem('qz_intro_seen_v1', '1'); } catch {}
    setShow(false);
  }
  if (!show) return null;
  return (
    <Suspense fallback={null}>
      <IntroAnimation onDone={done} />
    </Suspense>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HashRouter><AuthProvider>
    <ErrorBoundary>
      <Suspense fallback={<RouteLoading />}>
        {isAdminHost ? <AdminShell /> : <App />}
      </Suspense>
      {!isAdminHost ? <SiteIntro /> : null}
      <TestSwitchFab />
    </ErrorBoundary>
    {!isAdminHost ? <PaperToaster /> : null}
    <DialogHost />
  </AuthProvider></HashRouter></React.StrictMode>
);
