import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import { AuthProvider, useAuth } from './auth';
import { supabase } from './lib/supabase';
import { DialogHost } from './lib/dialog';
import './styles.css';
import './styles-cinematic.css';
import './styles-editorial.css';

// 只有精确匹配的管理员域名可以挂载后台；其他任何域名都不能加载 AdminShell。
const isAdminHost = window.location.hostname.toLowerCase() === 'admin.qianzhi.pw';

// 主站不承载后台界面；历史入口只负责跳转到唯一管理员域名。
function redirectLegacyAdminEntry() {
  if (isAdminHost) return;
  const isLegacyPath = window.location.pathname.replace(/\/+$/, '') === '/admin';
  const isLegacyHash = /^#\/admin(?:\/|$|[?])/.test(window.location.hash);
  if (isLegacyPath || isLegacyHash) {
    window.location.replace('https://admin.qianzhi.pw/');
  }
}
redirectLegacyAdminEntry();
window.addEventListener('hashchange', redirectLegacyAdminEntry);

function AdminShell() {
  const { session, loading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    if (!session) { setRole(null); return; }
    let live = true;
    const timer = setTimeout(() => { if (live) setRole(''); }, 8000);
    supabase.rpc('my_role').then(
      ({ data, error }) => { clearTimeout(timer); if (live) setRole(error ? '' : (data ?? '')); },
      () => { clearTimeout(timer); if (live) setRole(''); });
    return () => { live = false; clearTimeout(timer); };
  }, [session]);
  // 后台标签标题：跟随后台设置里的网站标题，格式为「<网站标题> · 管理后台」。
  useEffect(() => {
    let live = true;
    supabase.from('site_settings').select('key, value').in('key', ['site_title'])
      .then(({ data }) => {
        if (!live) return;
        const t = (data ?? []).find((x: any) => x.key === 'site_title')?.value;
        document.title = `${String(t || '我们的班级').trim() || '我们的班级'} · 管理后台`;
      });
    return () => { live = false; };
  }, []);
  if (loading || (session && role === null)) return <div className="center">加载中…</div>;
  const isAdmin = role === 'admin' || role === 'super_admin';
  if (!isAdmin) return (<><div className="glow" /><AdminLogin showBack={false} /></>);
  return (<>
    <div className="glow" />
    <div className="wrap"><Admin /></div>
  </>);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HashRouter><AuthProvider>
    {isAdminHost ? <AdminShell /> : <App />}
    <DialogHost />
  </AuthProvider></HashRouter></React.StrictMode>
);
