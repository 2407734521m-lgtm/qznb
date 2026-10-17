import { useEffect, useState, FormEvent, CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

// ---- 自定义登录背景（localStorage 持久化，图片压缩后存） ----
type BgCfg = { img: string | null; blur: number; dark: number };
const BG_KEY = 'ca_login_bg';
const DEFAULT_BG: BgCfg = { img: null, blur: 10, dark: 0.5 };
function loadBg(): BgCfg {
  try { return { ...DEFAULT_BG, ...JSON.parse(localStorage.getItem(BG_KEY) || '{}') }; }
  catch { return { ...DEFAULT_BG }; }
}
function fileToDataURL(f: File, maxW = 1280): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('图片读取失败')); };
    img.src = url;
  });
}

const inputS: CSSProperties = { padding: '7px 10px', fontSize: 13, margin: '3px 0 7px', borderRadius: 9 };
const labelS: CSSProperties = { fontSize: 12.5, display: 'block' };
const btnS: CSSProperties = { padding: '8px', fontSize: 13, borderRadius: 10 };

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [u, setU] = useState('');
  const [realName, setRealName] = useState('');
  const [email, setEmail] = useState('');
  const [p, setP] = useState(''); const [p2, setP2] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPrev, setAvatarPrev] = useState<string | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [bg, setBg] = useState<BgCfg>(DEFAULT_BG);
  const [showBg, setShowBg] = useState(false);
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/members';

  useEffect(() => { setBg(loadBg()); }, []);
  useEffect(() => () => { if (avatarPrev) URL.revokeObjectURL(avatarPrev); }, [avatarPrev]);

  function onAvatar(f?: File) {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setErr('头像仅支持 JPG / PNG / WebP');
    if (f.size > 2 * 1024 * 1024) return setErr('头像不能超过 2MB');
    setAvatarFile(f);
    if (avatarPrev) URL.revokeObjectURL(avatarPrev);
    setAvatarPrev(URL.createObjectURL(f));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    const em = email.trim().toLowerCase();
    if (!isEmail(em)) return setErr('请输入有效的邮箱地址（如 123456@qq.com）');
    if (mode === 'up') {
      const name = u.trim();
      if (name.length < 1 || name.length > 30) return setErr('用户名需为 1–30 个字符');
      if (!realName.trim()) return setErr('请填写真实姓名（仅管理员可见）');
      if (realName.trim().length > 30) return setErr('真实姓名最多 30 个字符');
    }
    if (p.length < 8) return setErr('密码至少 8 位');
    if (mode === 'up' && p !== p2) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({
          email: em, password: p,
          options: { data: { username: u.trim(), real_name: realName.trim() } },
        });
        if (error) throw error;
        if (!data.session) throw new Error('已注册，但 Supabase 仍开启邮箱确认。请在 Auth 设置中关闭 Confirm email 后再登录');
        // 注册时顺手上传头像
        if (avatarFile) {
          try {
            const uid = data.session.user.id;
            const path = `${uid}/${crypto.randomUUID()}.${avatarFile.type.split('/')[1]}`;
            const up = await supabase.storage.from('avatars').upload(path, avatarFile, { contentType: avatarFile.type });
            if (!up.error) await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
          } catch { /* 头像失败不影响注册，稍后可在「我的档案」里设置 */ }
        }
        nav('/me', { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: p });
        if (error) throw new Error('邮箱或密码错误');
        nav(from, { replace: true });
      }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  async function passkeyLogin() {
    if (busy) return;
    setErr(''); setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      nav(from, { replace: true });
    } catch (x) {
      setErr('通行密钥登录失败：' + (x as Error).message + '。请确认已在「我的档案」里注册过通行密钥');
    } finally { setBusy(false); }
  }

  async function onBgFile(f?: File) {
    if (!f || !f.type.startsWith('image/')) return;
    try {
      const url = await fileToDataURL(f);
      const next = { ...bg, img: url };
      setBg(next);
      localStorage.setItem(BG_KEY, JSON.stringify(next));
    } catch { setErr('背景图片处理失败'); }
  }
  function saveBg(patch: Partial<BgCfg>) {
    const next = { ...bg, ...patch };
    setBg(next);
    try { localStorage.setItem(BG_KEY, JSON.stringify(next)); } catch { /* 空间不足则仅本次生效 */ }
  }
  function resetBg() {
    setBg({ ...DEFAULT_BG });
    localStorage.removeItem(BG_KEY);
  }

  return (
    <div className="center" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', padding: 12 }}>
      {bg.img && <>
        <div style={{
          position: 'fixed', inset: -24, zIndex: -1,
          backgroundImage: `url(${bg.img})`, backgroundSize: 'cover', backgroundPosition: 'center',
          filter: `blur(${bg.blur}px)`,
        }} />
        <div style={{ position: 'fixed', inset: 0, zIndex: -1, background: `rgba(5,6,12,${bg.dark})` }} />
      </>}
      <form className="card" onSubmit={submit} style={{ width: 'min(320px,94vw)', textAlign: 'left', padding: 18, fontSize: 13 }}>
        <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>我们的班级 · 青春档案</h2>

        {mode === 'up' && <>
          <label style={labelS}>用户名（可重复）
            <input style={inputS} value={u} onChange={e => setU(e.target.value)} autoComplete="username" placeholder="大家看到的名字" />
          </label>
          {u.trim() !== '' && (
            <label style={labelS}>真实姓名
              <input style={inputS} value={realName} onChange={e => setRealName(e.target.value)} placeholder="如 张三" />
              <span style={{ fontSize: 11, opacity: 0.65 }}>仅管理员可见，用于班级统计，不会公开给其他同学</span>
            </label>
          )}
          <label style={labelS}>头像（可选）
            <span className="row" style={{ gap: 8, alignItems: 'center' }}>
              {avatarPrev && <img src={avatarPrev} alt="头像预览" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />}
              <input style={{ ...inputS, margin: 0 }} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => onAvatar(e.target.files?.[0])} />
            </span>
          </label>
        </>}

        <label style={labelS}>QQ 邮箱
          <input style={inputS} value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="email" placeholder="如 123456@qq.com" />
        </label>
        <label style={labelS}>密码
          <input style={inputS} type="password" value={p} onChange={e => setP(e.target.value)}
            autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
        </label>
        {mode === 'up' && (
          <label style={labelS}>确认密码
            <input style={inputS} type="password" value={p2} onChange={e => setP2(e.target.value)} autoComplete="new-password" />
          </label>
        )}
        {err && <p className="err" style={{ fontSize: 12 }}>{err}</p>}
        <button className="pri" style={btnS} disabled={busy}>{busy ? '请稍候…' : mode === 'in' ? '登录' : '注册'}</button>
        <p style={{ fontSize: 12, margin: '8px 0 0' }}>
          <a href="#/login" onClick={ev => { ev.preventDefault(); setErr(''); setMode(mode === 'in' ? 'up' : 'in'); }}>
            {mode === 'in' ? '没有账号？去注册' : '已有账号？去登录'}</a>
        </p>
        <hr style={{ opacity: 0.4, margin: '10px 0' }} />
        <button type="button" style={btnS} disabled={busy} onClick={passkeyLogin}>使用通行密钥登录</button>
        <p style={{ fontSize: 11, opacity: 0.65, margin: '6px 0 0' }}>首次使用请先密码登录，在「我的档案」里注册通行密钥</p>
        <p style={{ fontSize: 12, margin: '8px 0 0' }}>
          <a href="#/login" onClick={ev => { ev.preventDefault(); setShowBg(!showBg); }}>自定义背景</a>
        </p>
        {showBg && (
          <div style={{ marginTop: 8, padding: 10, border: '1px solid #ffffff1c', borderRadius: 10, fontSize: 12 }}>
            <label style={labelS}>上传背景图
              <input style={{ ...inputS, margin: 0 }} type="file" accept="image/*" onChange={e => onBgFile(e.target.files?.[0])} />
            </label>
            <label style={labelS}>模糊度（{bg.blur}px）
              <input style={{ ...inputS, padding: 0 }} type="range" min={0} max={24} value={bg.blur}
                onChange={e => saveBg({ blur: Number(e.target.value) })} />
            </label>
            <label style={labelS}>暗度（{Math.round(bg.dark * 100)}%）
              <input style={{ ...inputS, padding: 0 }} type="range" min={0} max={90} value={Math.round(bg.dark * 100)}
                onChange={e => saveBg({ dark: Number(e.target.value) / 100 })} />
            </label>
            <button type="button" style={{ ...btnS, marginTop: 4 }} onClick={resetBg}>恢复默认</button>
          </div>
        )}
      </form>
    </div>
  );
}
