import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import { AuthProvider, useAuth } from './auth';
import { supabase } from './lib/supabase';
import './styles.css';
import './styles-campus-light.css';

// 管理员子域名（如 admin.xxx.com）：直达后台，不加载主站界面
const isAdminHost = window.location.hostname.split('.')[0].toLowerCase() === 'admin';

function AdminShell() {
  const { session, loading } = useAuth();
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    if (!session) { setRole(null); return; }
    supabase.rpc('my_role').then(({ data }) => setRole(data ?? ''));
  }, [session]);
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
