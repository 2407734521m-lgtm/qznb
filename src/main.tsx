import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import { AuthProvider, useAuth } from './auth';
import { supabase } from './lib/supabase';
import './styles.css';
import './styles-cinematic.css';
import './styles-editorial.css';

// 管理员子域名（如 admin.xxx.com）：直达后台，不加载主站界面
const isAdminHost = window.location.hostname.split('.')[0].toLowerCase() === 'admin';

// 主站不再承载 /admin 后台界面；旧入口统一跳转到独立管理员子域名。
// 同时兼容 HashRouter 的 #/admin 入口，以及历史上直接访问的 /admin 路径。
function redirectLegacyAdminEntry() {
  if (isAdminHost) return;
  const isLegacyPath = window.location.pathname.replace(/\\/+$/, '') === '/admin';
  const isLegacyHash = /^#\\/admin(?:\\/|$|[?])/.test(window.location.hash);
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
    <button
      onClick={() => supabase.auth.signOut().then(() => location.reload())}
      title="退出登录"
      style={{
        position: 'fixed', right: 14, bottom: 14, zIndex: 50,
        width: 44, height: 44, borderRadius: '50%',
        background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)',
        color: '#fff', fontSize: 18, cursor: 'pointer', backdropFilter: 'blur(10px)',
      }}>⏻</button>
  </>);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HashRouter><AuthProvider>
    {isAdminHost ? <AdminShell /> : <App />}
  </AuthProvider></HashRouter></React.StrictMode>
);
