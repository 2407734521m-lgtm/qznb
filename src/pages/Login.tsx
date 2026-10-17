import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import FeedbackModal from '../components/FeedbackModal';
import WelcomeOverlay from '../components/WelcomeOverlay';
import { downscaleImage } from '../lib/media';
import bgDefault from '../assets/cow.jpg';

const BG_KEY = 'ca_login_bg_v2';
const DEFAULT_BG = bgDefault; // 默认壁纸（纯牛马）

// 登录标识可以是：QQ 邮箱 / 用户名 / 真实姓名
async function resolveEmail(ident: string): Promise<string> {
  const id = ident.trim();
  if (!id) throw new Error('empty');
  if (id.includes('@')) return id; // 邮箱直接用
  const { data, error } = await supabase.rpc('resolve_login_email', { ident: id });
  if (error || !data) throw new Error('notfound');
  return data as string;
}

export default function Login() {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<'login' | 'reg'>('login');
  const [ident, setIdent] = useState(''); // 登录标识
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [real, setReal] = useState('');
  const [email, setEmail] = useState('');
  const [pw2, setPw2] = useState('');
  const [avatar, setAvatar] = useState<File | null>(null);
  const [avatarPrev, setAvatarPrev] = useState<string | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [fbOpen, setFbOpen] = useState(false);
  // 邮箱验证码
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [codeSent, setCodeSent] = useState(false); // 注册页：验证码是否已发送
  const [sentEmail, setSentEmail] = useState(''); // 验证码实际发到的邮箱
  const [tempPw, setTempPw] = useState(false); // 发送验证码时密码还没填好，用了临时密码
  const [invite, setInvite] = useState(''); // 注册页邀请码
  const [welcomeNick, setWelcomeNick] = useState<string | null>(null);
  const [bg, setBg] = useState<string>(() => { try { return localStorage.getItem(BG_KEY) || DEFAULT_BG; } catch { return DEFAULT_BG; } });
  const [blur, setBlur] = useState(3); const [dark, setDark] = useState(45);
  const [showBg, setShowBg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null); const bgRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { localStorage.setItem(BG_KEY, bg); } catch {} }, [bg]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function pickAvatar(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setErr('头像只支持 jpg / png / webp');
    if (f.size > 2 * 1024 * 1024) return setErr('头像不能超过 2MB');
    setAvatar(f); setAvatarPrev(URL.createObjectURL(f)); setErr('');
  }

  async function doLogin() {
    setErr(''); setBusy(true);
    let em = '';
    try {
      em = await resolveEmail(ident);
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (error) throw error;
    } catch (e: any) {
      const m = e?.message || '';
      if (/email not confirmed/i.test(m) && em) {
        // 邮箱还没验证：转到验证码界面
        setVerifyEmail(em); setCode(''); setResendIn(0); setErr(''); setBusy(false);
        return;
      }
      setErr(e?.message === 'notfound' ? '找不到这个账号，请检查用户名 / 真实姓名 / QQ 邮箱是否正确'
        : e?.message === 'empty' ? '请输入登录账号'
        : /Invalid login credentials/i.test(m) ? '账号或密码错误'
        : '登录失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  async function doPasskey() {
    setErr(''); setBusy(true);
    try { const { error } = await supabase.auth.signInWithPasskey(); if (error) throw error; }
    catch (e: any) { setErr('通行密钥登录失败：' + (e?.message || '未知错误')); }
    finally { setBusy(false); }
  }

  async function uploadAvatar(uid: string) {
    if (!avatar) return;
    const small = await downscaleImage(avatar);
    const path = `${uid}/${Date.now()}.jpg`;
    const up = await supabase.storage.from('avatars').upload(path, small, { contentType: 'image/jpeg' });
    if (!up.error) await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
  }

  // 注册页：点「获取验证码」→ 只需要填好用户名/真实姓名/邮箱，密码可以后填
  async function sendCode() {
    setErr('');
    const nm = name.trim(), rl = real.trim(), em = email.trim();
    if (nm.length < 1 || nm.length > 30) return setErr('用户名 1～30 个字');
    if (!rl || rl.length > 30) return setErr('请填写真实姓名（仅管理员可见）');
    if (!/^[1-9]\d{4,10}@qq\.com$/i.test(em)) return setErr('请填写正确的 QQ 邮箱');
    if (resendIn > 0 || busy) return;
    if (codeSent && em !== sentEmail) return setErr('邮箱换了？验证码发到了最开始填的邮箱，请改回去再收');
    // 密码还没填好就先用随机密码占位，点注册时再换成用户填的
    let pwd = pw, tmp = false;
    if (pw.length < 8 || pw !== pw2) { pwd = 'Tmp!' + crypto.randomUUID().replace(/-/g, '').slice(0, 12); tmp = true; }
    setBusy(true);
    try {
      if (!codeSent) {
        const { data, error } = await supabase.auth.signUp({
          email: em, password: pwd,
          options: { data: { username: nm, real_name: rl } },
        });
        if (error) throw error;
        if (data.session) { await uploadAvatar(data.session.user.id); return; } // 未开邮箱确认：直接进
        setSentEmail(em); setTempPw(tmp);
      } else {
        const { error } = await supabase.auth.resend({ type: 'signup', email: sentEmail });
        if (error) throw error;
      }
      setCodeSent(true); setResendIn(60); setErr('');
    } catch (e: any) {
      const m = e?.message || '';
      setErr(/already registered|already exists/i.test(m) ? '这个 QQ 邮箱已经注册过，直接登录吧'
        : /rate limit|429/i.test(m) ? '发得太频繁了，稍后再试'
        : '发送失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  async function doReg() {
    setErr('');
    const nm = name.trim(), rl = real.trim(), em = email.trim();
    if (nm.length < 1 || nm.length > 30) return setErr('用户名 1～30 个字');
    if (!rl || rl.length > 30) return setErr('请填写真实姓名（仅管理员可见）');
    if (!/^[1-9]\d{4,10}@qq\.com$/i.test(em)) return setErr('请填写正确的 QQ 邮箱');
    if (!codeSent) return setErr('请先点「获取验证码」，再把邮箱收到的数字码填进来');
    if (em !== sentEmail) return setErr('邮箱改动了，请重新获取验证码');
    if (pw.length < 8) return setErr('密码至少 8 位');
    if (pw !== pw2) return setErr('两次输入的密码不一致');
    const c = code.trim();
    if (!/^\d{6,10}$/.test(c)) return setErr('请输入邮箱收到的数字验证码');
    setBusy(true);
    try {
      // 验证码校验走 Supabase 后台，前端只做格式检查
      const { data, error } = await supabase.auth.verifyOtp({ email: sentEmail, token: c, type: 'signup' });
      if (error) throw error;
      const uid = data.session?.user?.id;
      if (!uid) throw new Error('no session');
      if (tempPw) {
        const { error: e2 } = await supabase.auth.updateUser({ password: pw });
        if (e2) throw new Error('密码设置失败：' + e2.message);
      }
      // 资料以点注册时填的为准（防止点了验证码后又改了名字）
      supabase.from('profiles').update({ username: nm, real_name: rl, display_name: nm }).eq('id', uid).then(() => {});
      await uploadAvatar(uid);
      const iv = invite.trim();
      if (iv) {
        const { data: nick, error: e3 } = await supabase.rpc('join_with_code', { code: iv });
        if (!e3 && nick !== null && nick !== undefined) setWelcomeNick((nick as string) || nm);
        else setErr('注册成功，但邀请码不正确，稍后可到 我的 → 🎟️加入班级 填写');
      }
      setCodeSent(false); setCode('');
    } catch (e: any) {
      const m = e?.message || '';
      setErr(/expired|invalid/i.test(m) ? '验证码不正确或已过期，请核对后重试' : '注册失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  async function doVerify() {
    const c = code.trim();
    if (!/^\d{6,10}$/.test(c)) return setErr('请输入邮箱收到的数字验证码');
    if (!verifyEmail) return;
    setErr(''); setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: verifyEmail, token: c, type: 'signup' });
      if (error) throw error;
      if (data.session) await uploadAvatar(data.session.user.id);
      setVerifyEmail(null); setCode('');
    } catch (e: any) {
      const m = e?.message || '';
      setErr(/expired|invalid/i.test(m) ? '验证码不正确或已过期，请核对后重试' : '验证失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  async function doResend() {
    if (!verifyEmail || resendIn > 0 || busy) return;
    setErr('');
    const { error } = await supabase.auth.resend({ type: 'signup', email: verifyEmail });
    if (error) { setErr(/rate limit|429/i.test(error.message) ? '发得太频繁了，稍后再试' : '发送失败：' + error.message); return; }
    setResendIn(60);
  }

  return (
    <>
      {welcomeNick !== null && <WelcomeOverlay nick={welcomeNick} onDone={() => setWelcomeNick(null)} />}
      {bg && <div className="login-bg" style={{ backgroundImage: `url(${bg})`, filter: `blur(${blur}px) brightness(${100 - dark}%)`, transform: 'scale(1.1)' }} />}
      <div className="login-wrap">
        <motion.div className="login-card page"
          initial={reduce ? {} : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <h1>我们的班级</h1>
          <p className="sub">青 春 档 案</p>

          {verifyEmail ? (<>
            <h1 style={{ fontSize: 22 }}>📧 验证邮箱</h1>
            <p className="sub">注 册 验 证</p>
            <p className="priv-note" style={{ margin: '0 0 4px' }}>验证码已发送到 <b style={{ color: '#fff' }}>{verifyEmail}</b><br />QQ 邮箱如果没收到，请检查垃圾箱</p>
            <label>验证码</label>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="邮箱收到的数字码" inputMode="numeric" autoComplete="one-time-code"
              style={{ letterSpacing: 10, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
              onKeyDown={e => e.key === 'Enter' && doVerify()} />
            {err && <p className="err">{err}</p>}
            <button className="pri" disabled={busy} onClick={doVerify}>{busy ? '验证中…' : '验证并进入'}</button>
            <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={busy || resendIn > 0} onClick={doResend}>
              {resendIn > 0 ? `重新发送（${resendIn}s）` : '重新发送验证码'}</button>
            <p className="login-switch"><button onClick={() => { setVerifyEmail(null); setCode(''); setErr(''); }}>← 返回</button></p>
          </>) : mode === 'login' ? (<>
            <label>账号</label>
            <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="QQ 邮箱 / 用户名 / 真实姓名" autoComplete="username" />
            <label>密码</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="密码" autoComplete="current-password"
              onKeyDown={e => e.key === 'Enter' && doLogin()} />
            {err && <p className="err">{err}</p>}
            <button className="pri" disabled={busy} onClick={doLogin}>{busy ? '登录中…' : '进入班级'}</button>
            <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={doPasskey}>🔑 使用通行密钥登录</button>
            <p className="login-switch">还没有账号？<button onClick={() => { setMode('reg'); setErr(''); setCodeSent(false); setCode(''); setInvite(''); }}>去注册</button></p>
            <p className="login-switch" style={{ marginTop: 2 }}>如果登录不上<button onClick={() => setFbOpen(true)}>点我反馈</button></p>
          </>) : (<>
            <label>用户名</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="班级里显示的名字，可重复" maxLength={30} />
            {name.trim() && (<>
              <label>真实姓名</label>
              <input value={real} onChange={e => setReal(e.target.value)} placeholder="仅管理员可见，不会公开" maxLength={30} />
              <p className="priv-note">🔒 真实姓名只用于后台统计，普通成员看不到</p>
            </>)}
            <label>头像（可选）</label>
            <div className="avatar-pick">
              <div className="prev">{avatarPrev ? <img src={avatarPrev} alt="" /> : '🙂'}</div>
              <button className="ghost" onClick={() => fileRef.current?.click()}>选择照片</button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
                onChange={e => pickAvatar(e.target.files?.[0])} />
            </div>
            <label>QQ 邮箱</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="123456@qq.com" inputMode="email" />
            <label>邮箱验证码</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="邮箱收到的数字码" inputMode="numeric" autoComplete="one-time-code"
                style={{ flex: 1, minWidth: 0, letterSpacing: 8, textAlign: 'center', fontSize: 18, fontWeight: 700 }} />
              <button className="ghost" style={{ whiteSpace: 'nowrap', padding: '0 14px' }}
                disabled={busy || resendIn > 0} onClick={sendCode}>
                {resendIn > 0 ? `重新发送(${resendIn}s)` : codeSent ? '重新发送' : '获取验证码'}</button>
            </div>
            <label>密码</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="至少 8 位" autoComplete="new-password" />
            <label>确认密码</label>
            <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="再输一次" autoComplete="new-password" />
            <label>邀请码（可选）</label>
            <input value={invite} onChange={e => setInvite(e.target.value)} placeholder="有邀请码就填，可直接加入班级" />
            {err && <p className="err">{err}</p>}
            <button className="pri" disabled={busy} onClick={doReg}>{busy ? '注册中…' : '注册并进入'}</button>
            <p className="login-switch">已有账号？<button onClick={() => { setMode('login'); setErr(''); setCodeSent(false); setCode(''); setInvite(''); }}>去登录</button></p>
          </>)}

          <div className="bg-panel">
            <button className="ghost" style={{ fontSize: 12.5 }} onClick={() => setShowBg(!showBg)}>🖼 自定义背景 {showBg ? '▲' : '▼'}</button>
            {showBg && (<div style={{ marginTop: 8 }}>
              <div className="row">
                <button className="ghost" style={{ fontSize: 12 }} onClick={() => bgRef.current?.click()}>上传照片</button>
                {bg !== DEFAULT_BG && <button className="ghost" style={{ fontSize: 12 }} onClick={() => setBg(DEFAULT_BG)}>恢复默认</button>}
                <input ref={bgRef} type="file" accept="image/*" hidden onChange={e => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const r = new FileReader();
                  r.onload = () => {
                    const img = new Image();
                    img.onload = () => {
                      const c = document.createElement('canvas');
                      const s = Math.min(1, 1280 / Math.max(img.width, img.height));
                      c.width = img.width * s; c.height = img.height * s;
                      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
                      setBg(c.toDataURL('image/jpeg', 0.82));
                    };
                    img.src = r.result as string;
                  };
                  r.readAsDataURL(f);
                }} />
              </div>
              <div className="row"><span style={{ width: 52 }}>模糊</span><input type="range" min={0} max={24} value={blur} onChange={e => setBlur(+e.target.value)} /></div>
              <div className="row"><span style={{ width: 52 }}>暗度</span><input type="range" min={0} max={90} value={dark} onChange={e => setDark(+e.target.value)} /></div>
            </div>)}
          </div>
        </motion.div>
      </div>
      {fbOpen && <FeedbackModal kind="login" onClose={() => setFbOpen(false)} />}
    </>
  );
}
