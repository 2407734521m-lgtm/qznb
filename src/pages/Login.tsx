import { useState, FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// Supabase Auth 需要邮箱，这里用用户名生成内部占位邮箱；密码由 Supabase 哈希保存。
const toEmail = (u: string) => `${u.toLowerCase()}@class.example.com`;

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [p2, setP2] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/members';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (!/^[A-Za-z0-9_]{3,20}$/.test(u)) return setErr('用户名需为 3–20 位字母、数字或下划线');
    if (p.length < 8) return setErr('密码至少 8 位');
    if (mode === 'up' && p !== p2) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      if (mode === 'up') {
        const { data: free, error: e1 } = await supabase.rpc('username_available', { u });
        if (e1) throw e1;
        if (!free) throw new Error('用户名已被占用，请换一个');
        const { data, error } = await supabase.auth.signUp({
          email: toEmail(u), password: p, options: { data: { username: u } } });
        if (error) throw error;
        if (!data.session) throw new Error('已注册，但 Supabase 仍开启邮箱确认。请在 Auth 设置中关闭 Confirm email 后再登录');
        nav('/me', { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: toEmail(u), password: p });
        if (error) throw new Error('用户名或密码错误');
        nav(from, { replace: true });
      }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="center"><form className="card" onSubmit={submit} style={{ width: 'min(360px,100%)', textAlign: 'left' }}>
      <h2>我们的班级 · 青春档案</h2>
      <label>用户名<input value={u} onChange={e => setU(e.target.value)} autoComplete="username" /></label>
      <label>密码<input type="password" value={p} onChange={e => setP(e.target.value)}
        autoComplete={mode === 'up' ? 'new-password' : 'current-password'} /></label>
      {mode === 'up' && <label>确认密码<input type="password" value={p2} onChange={e => setP2(e.target.value)} autoComplete="new-password" /></label>}
      {err && <p className="err">{err}</p>}
      <button className="pri" disabled={busy}>{busy ? '请稍候…' : mode === 'in' ? '登录' : '注册'}</button>
      <p><a href="#/login" onClick={ev => { ev.preventDefault(); setErr(''); setMode(mode === 'in' ? 'up' : 'in'); }}>
        {mode === 'in' ? '没有账号？去注册' : '已有账号？去登录'}</a></p>
    </form></div>
  );
}
