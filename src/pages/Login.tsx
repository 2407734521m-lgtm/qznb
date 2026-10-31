import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import FeedbackModal from '../components/FeedbackModal';
import { downscaleImage } from '../lib/media';
import bgDefault from '../assets/cow.jpg';

const BG_KEY = 'ca_login_bg_v2';
const DEFAULT_BG = bgDefault; // 默认壁纸（纯牛马）

// 按钮里的加载小圈圈（等待动画）
function Spin() {
  return (
    <motion.span aria-hidden
      style={{ display: 'inline-block', width: 13, height: 13, marginRight: 8, borderRadius: '50%', border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', verticalAlign: -2 }}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} />
  );
}

export default function Login() {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<'login' | 'reg' | 'forgot'>('login');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const PRIVACY_POLICY_VERSION = '2026-10-25-v2';
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
  const [codeSent, setCodeSent] = useState(false); // 注册表单上已点过“发送验证码”
  const [resendIn, setResendIn] = useState(0);
  const [waitSec, setWaitSec] = useState(0); // 验证屏已等待秒数
  const [invite, setInvite] = useState(''); // 注册页邀请码
  const [forgotSent, setForgotSent] = useState(false); // 忘记密码：重置验证码是否已发送
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotNewPw2, setForgotNewPw2] = useState('');
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

  // 验证屏打开期间，每秒累加已等待时间，让用户心里有数
  useEffect(() => {
    if (!verifyEmail) { setWaitSec(0); return; }
    setWaitSec(0);
    const t = setInterval(() => setWaitSec(v => v + 1), 1000);
    return () => clearInterval(t);
  }, [verifyEmail]);

  function pickAvatar(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return setErr('头像只支持 jpg / png / webp');
    if (f.size > 2 * 1024 * 1024) return setErr('头像不能超过 2MB');
    setAvatar(f); setAvatarPrev(URL.createObjectURL(f)); setErr('');
  }

  async function doLogin() {
    const id = ident.trim();
    if (!id) return setErr('请输入登录账号');
    if (!pw) return setErr('请输入密码');
    setErr(''); setBusy(true);
    let em = '';
    try {
      try { sessionStorage.setItem('ca_login_success', '1'); } catch {}
      if (id.includes('@')) {
        em = id;
        const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.functions.invoke('username-login', {
          body: { username: id, password: pw },
        });
        if (error) throw error;
        if (data?.code === 'email_not_confirmed') throw new Error('USERNAME_EMAIL_NOT_CONFIRMED');
        if (data?.code === 'rate_limited') throw new Error('USERNAME_LOGIN_RATE_LIMITED');
        if (!data?.ok || !data?.session?.access_token || !data?.session?.refresh_token) {
          throw new Error('Invalid login credentials');
        }
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) throw sessionError;
      }
    } catch (e: any) {
      try { sessionStorage.removeItem('ca_login_success'); } catch {}
      const m = e?.message || '';
      if (/email not confirmed/i.test(m) && em) {
        setVerifyEmail(em); setCode(''); setResendIn(0); setErr('');
        return;
      }
      setErr(m === 'USERNAME_EMAIL_NOT_CONFIRMED'
        ? '此账号尚未完成邮箱验证，请使用注册时的 QQ 邮箱登录并完成验证'
        : m === 'USERNAME_LOGIN_RATE_LIMITED'
          ? '尝试次数过多，请稍后再试'
          : /Invalid login credentials/i.test(m) ? '账号或密码错误'
          : '登录失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  async function uploadAvatar(uid: string) {
    if (!avatar) return;
    const small = await downscaleImage(avatar);
    const path = `${uid}/${Date.now()}.jpg`;
    const up = await supabase.storage.from('avatars').upload(path, small, { contentType: 'image/jpeg' });
    if (!up.error) await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
  }

  // 注册/验证拿到 session 后补做的事：展示名、头像、用邀请码加入班级
  // （欢迎动画递给 App 层播，这里播会被登录跳转直接卸载）
  async function finishJoin(uid: string) {
    // 仅在新注册完成后安排一次自愿 GPS 说明；这里不请求位置，也不记录坐标。
    try { sessionStorage.setItem('ca_gps_offer', '1'); } catch {}
    const nm = name.trim();
    // 注意：username / real_name 由注册触发器写入，列级权限不允许前端直接改，这里只更新展示名
    if (nm) supabase.from('profiles').update({ display_name: nm }).eq('id', uid).then(() => {});
    await uploadAvatar(uid);
    const iv = invite.trim();
    if (!iv) return;
    const { data: nick, error: e3 } = await supabase.rpc('join_with_code', { code: iv });
    if (!e3 && nick !== null && nick !== undefined) {
      try { sessionStorage.setItem('ca_welcome_nick', (nick as string) || nm); } catch {}
    } else {
      try { sessionStorage.setItem('ca_invite_bad', '1'); } catch {}
    }
  }

  // 注册表单上的“发送验证码”：走 Supabase + Resend SMTP 发 6 位码。
  // 第一次点 = signUp（建未验证账号并经 Resend 发码），已发送过且倒计时结束 = resend 重发。
  async function sendCode() {
    setErr('');
    if (!policyAccepted) return setErr('请先阅读并勾选同意《隐私政策与用户协议》');
    const nm = name.trim(), rl = real.trim(), em = email.trim();
    if (nm.length < 1 || nm.length > 30) return setErr('用户名 1～30 个字');
    if (!rl || rl.length > 30) return setErr('请填写真实姓名（仅管理员可见）');
    if (!/^[1-9]\d{4,10}@qq\.com$/i.test(em)) return setErr('请填写正确的 QQ 邮箱');
    if (pw.length < 8) return setErr('密码至少 8 位');
    if (pw !== pw2) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      if (codeSent) {
        const { error } = await supabase.auth.resend({ type: 'signup', email: em });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: em, password: pw,
          options: { data: { username: nm, real_name: rl, privacy_policy_version: PRIVACY_POLICY_VERSION, privacy_policy_accepted_at: new Date().toISOString() } },
        });
        if (error) throw error;
        // 已注册过的邮箱：Supabase 为防枚举不报错、也不发码，返回的 identities 为空。
        // 这时不能假装“已发送”，要直接告诉用户去登录。
        if (data.user && Array.isArray((data.user as any).identities) && (data.user as any).identities.length === 0) {
          setErr('这个 QQ 邮箱已经注册过，直接登录吧');
          return;
        }
        if (data.session) { await finishJoin(data.session.user.id); return; }
        setCodeSent(true);
      }
      setCode(''); setResendIn(60);
    } catch (e: any) {
      const m = e?.message || '';
      setErr(/already registered|already exists/i.test(m) ? '这个 QQ 邮箱已经注册过，直接登录吧'
        : /rate limit|429/i.test(m) ? '发得太频繁了，稍后再试'
        : '发送失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  // 注册表单上填码后点“验证并进入”：核对 Resend 发来的 6 位码，通过后补做头像和邀请码加入。
  async function doVerifyReg() {
    const c = code.trim();
    if (!/^\d{6,10}$/.test(c)) return setErr('请输入邮箱收到的数字验证码');
    setErr(''); setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: email.trim(), token: c, type: 'signup' });
      if (error) throw error;
      if (data.session) await finishJoin(data.session.user.id);
      setCodeSent(false); setCode('');
    } catch (e: any) {
      const m = e?.message || '';
      setErr(/expired|invalid/i.test(m) ? '验证码不正确或已过期，请核对后重试' : '验证失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  async function doReg() {
    setErr('');
    if (!policyAccepted) return setErr('请先阅读并勾选同意《隐私政策与用户协议》');
    const nm = name.trim(), rl = real.trim(), em = email.trim();
    if (nm.length < 1 || nm.length > 30) return setErr('用户名 1～30 个字');
    if (!rl || rl.length > 30) return setErr('请填写真实姓名（仅管理员可见）');
    if (!/^[1-9]\d{4,10}@qq\.com$/i.test(em)) return setErr('请填写正确的 QQ 邮箱');
    if (pw.length < 8) return setErr('密码至少 8 位');
    if (pw !== pw2) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: em, password: pw,
        options: { data: { username: nm, real_name: rl, privacy_policy_version: PRIVACY_POLICY_VERSION, privacy_policy_accepted_at: new Date().toISOString() } },
      });
      if (error) throw error;
      if (data.user && Array.isArray((data.user as any).identities) && (data.user as any).identities.length === 0) {
        setErr('这个 QQ 邮箱已经注册过，直接登录吧');
        return;
      }
      if (!data.session) {
        // 邮箱验证已打开：没有 session，先转到验证屏；头像和邀请码加入等验证成功后在 doVerify 里补做
        setVerifyEmail(em); setCode(''); setResendIn(60);
        return;
      }
      await finishJoin(data.session.user.id);
    } catch (e: any) {
      const m = e?.message || '';
      setErr(/already registered|already exists/i.test(m) ? '这个 QQ 邮箱已经注册过，直接登录吧'
        : '注册失败：' + (m || '网络错误'));
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
      if (data.session) await finishJoin(data.session.user.id);
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

  // 忘记密码：发 6 位重置验证码（不用点链接，填码就能改密码）
  async function doForgot() {
    const em = email.trim();
    if (!/^[1-9]\d{4,10}@qq\.com$/i.test(em)) return setErr('请填写正确的 QQ 邮箱');
    setErr(''); setBusy(true);
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo });
      if (error) throw error;
      setForgotSent(true); setForgotCode(''); setResendIn(60);
    } catch (e: any) {
      const m = e?.message || '';
      setErr(/rate limit|429/i.test(m) ? '发得太频繁了，稍后再试'
        : /redirect/i.test(m) ? '发送失败：跳转地址未在 Supabase 后台放行，请联系管理员'
        : '发送失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  // 忘记密码第二步：核对 6 位重置码，通过后直接改密码，再回登录页
  async function doForgotVerify() {
    const em = email.trim();
    const c = forgotCode.trim();
    if (!/^\d{6,10}$/.test(c)) return setErr('请输入邮箱收到的 6 位数字验证码');
    if (forgotNewPw.length < 8) return setErr('新密码至少 8 位');
    if (forgotNewPw !== forgotNewPw2) return setErr('两次输入的新密码不一致');
    setErr(''); setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: em, token: c, type: 'recovery' });
      if (error) throw error;
      if (!data.session) throw new Error('no session');
      const { error: e2 } = await supabase.auth.updateUser({ password: forgotNewPw });
      if (e2) throw e2;
      await supabase.auth.signOut();
      setMode('login'); setForgotSent(false); setForgotCode(''); setForgotNewPw(''); setForgotNewPw2('');
      setPw(''); setPw2(''); setErr('');
      alert('密码已重设成功，去登录吧');
    } catch (e: any) {
      const m = e?.message || '';
      setErr(/expired|invalid/i.test(m) ? '验证码不正确或已过期，请核对后重试'
        : /rate limit|429/i.test(m) ? '试得太频繁了，稍后再试'
        : '重设失败：' + (m || '网络错误'));
    } finally { setBusy(false); }
  }

  return (
    <>
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
            <motion.div aria-hidden
              animate={reduce ? {} : { y: [0, -7, 0], rotate: [0, -4, 4, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              style={{ fontSize: 44, lineHeight: 1.2, margin: '2px 0 6px' }}>✉️</motion.div>
            <p className="priv-note" style={{ margin: '0 0 4px' }}>验证码已发送到 <b style={{ color: '#fff' }}>{verifyEmail}</b><br />
              打开 QQ 邮箱，找标题是「我们的班级 · 青春档案 — 你的验证码」的邮件，把里面的 <b style={{ color: '#fff' }}>6 位数字验证码</b> 填到下面<br />
              没看到就翻一下垃圾箱；也可以点邮件里的「确认邮箱」链接直接完成验证</p>
            <p className="priv-note" style={{ margin: '0 0 6px' }}>已等待 {waitSec} 秒 · 邮件通常 1 分钟内到达
              <motion.span animate={reduce ? {} : { opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.2 }}>…</motion.span>
            </p>
            <label>验证码</label>
            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="邮箱收到的数字码" inputMode="numeric" autoComplete="one-time-code"
              style={{ letterSpacing: 10, textAlign: 'center', fontSize: 22, fontWeight: 700 }}
              onKeyDown={e => e.key === 'Enter' && doVerify()} />
            {err && <p className="err">{err}</p>}
            <button className="pri" disabled={busy} onClick={doVerify}>{busy ? <><Spin />验证中…</> : '验证并进入'}</button>
            <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={busy || resendIn > 0} onClick={doResend}>
              {resendIn > 0 ? `重新发送确认邮件（${resendIn}s）` : '重新发送确认邮件'}</button>
            {resendIn > 0 && (
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.15)', marginTop: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(resendIn / 60) * 100}%`, background: 'rgba(255,255,255,.65)', transition: 'width 1s linear' }} />
              </div>
            )}
            <p className="login-switch"><button onClick={() => { setVerifyEmail(null); setCode(''); setErr(''); }}>← 返回</button></p>
          </>) : mode === 'login' ? (<>
            <label>账号</label>
            <input value={ident} onChange={e => setIdent(e.target.value)} placeholder="QQ 邮箱 / 用户名" autoComplete="username" />
            <label>密码</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="密码" autoComplete="current-password"
              onKeyDown={e => e.key === 'Enter' && doLogin()} />
            {err && <p className="err">{err}</p>}
            <button className="pri" disabled={busy} onClick={doLogin}>{busy ? <><Spin />登录中…</> : '进入班级'}</button>
            <p className="login-switch">忘记密码了？<button onClick={() => { setMode('forgot'); setErr(''); setForgotSent(false); }}>点我重置</button></p>
            <p className="login-switch">还没有账号？<button onClick={() => { setMode('reg'); setErr(''); setCode(''); setInvite(''); setForgotSent(false); }}>去注册</button></p>
            <p className="login-switch" style={{ marginTop: 2 }}>如果登录不上<button onClick={() => setFbOpen(true)}>点我反馈</button></p>
          </>) : mode === 'forgot' ? (<>
            <h1 style={{ fontSize: 22 }}>🔑 重置密码</h1>
            <p className="sub">找 回 密 码</p>
            <p className="priv-note" style={{ margin: '0 0 4px' }}>输入注册时的 QQ 邮箱，我们会发一个 6 位重置验证码给你<br />不用点邮件里的链接，在下面填码、设新密码就行</p>
            <label>QQ 邮箱</label>
            <input value={email} onChange={e => { setEmail(e.target.value); if (forgotSent) { setForgotSent(false); setForgotCode(''); } }} placeholder="123456@qq.com" inputMode="email"
              onKeyDown={e => e.key === 'Enter' && doForgot()} />
            <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={busy || resendIn > 0} onClick={doForgot}>
              {busy ? '发送中…' : resendIn > 0 ? `重新发送验证码（${resendIn}s）` : forgotSent ? '重新发送验证码' : '发送验证码'}
            </button>
            {forgotSent && <p className="priv-note" style={{ margin: '4px 0 0' }}>验证码已发到上面这个 QQ 邮箱，找标题是「我们的班级 · 青春档案 — 你的重置密码验证码」的邮件，没看到就翻一下垃圾箱；如果这个邮箱没注册过，是不会收到码的</p>}
            {forgotSent && (<>
              <label>邮箱验证码</label>
              <input value={forgotCode} onChange={e => setForgotCode(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="6 位数字验证码" inputMode="numeric" />
              <label>新密码</label>
              <input type="password" value={forgotNewPw} onChange={e => setForgotNewPw(e.target.value)} placeholder="至少 8 位" autoComplete="new-password" />
              <label>确认新密码</label>
              <input type="password" value={forgotNewPw2} onChange={e => setForgotNewPw2(e.target.value)} placeholder="再输一次" autoComplete="new-password"
                onKeyDown={e => e.key === 'Enter' && doForgotVerify()} />
            </>)}
            {err && <p className="err">{err}</p>}
            {forgotSent && <button className="pri" disabled={busy} onClick={doForgotVerify}>{busy ? <><Spin />重设中…</> : '验证并重设密码'}</button>}
            <p className="login-switch"><button onClick={() => { setMode('login'); setErr(''); setForgotSent(false); }}>← 返回登录</button></p>
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
            <input value={email} onChange={e => { setEmail(e.target.value); if (codeSent) { setCodeSent(false); setCode(''); } }} placeholder="123456@qq.com" inputMode="email" />
            <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={busy || resendIn > 0} onClick={sendCode}>
              {busy ? '发送中…' : resendIn > 0 ? `重新发送验证码（${resendIn}s）` : codeSent ? '重新发送验证码' : '发送验证码'}
            </button>
            {codeSent && <p className="priv-note" style={{ margin: '4px 0 0' }}>验证码已通过 Resend 发到上面这个 QQ 邮箱，找标题是「我们的班级 · 青春档案 — 你的验证码」的邮件，没看到就翻一下垃圾箱</p>}
            {codeSent && (<>
              <label>邮箱验证码</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="6 位数字验证码" inputMode="numeric"
                onKeyDown={e => e.key === 'Enter' && doVerifyReg()} />
            </>)}
            <label>密码</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="至少 8 位" autoComplete="new-password" />
            <label>确认密码</label>
            <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="再输一次" autoComplete="new-password" />
            <label>邀请码（选填）</label>
            <input value={invite} onChange={e => setInvite(e.target.value)} placeholder="有就填，没有先不填，注册后在个人中心补填" />
            <div style={{ margin: '14px 0 10px', padding: '12px 13px', borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, lineHeight: 1.6, cursor: 'pointer' }}>
                <input type="checkbox" checked={policyAccepted} onChange={e => setPolicyAccepted(e.target.checked)} style={{ width: 18, height: 18, marginTop: 3, flexShrink: 0 }} />
                <span>我已阅读并同意 <button type="button" className="linklike" onClick={() => setShowPrivacyPolicy(true)} style={{ border: 0, padding: 0, background: 'none', color: '#a9c2ff', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>《隐私政策与用户协议》</button></span>
              </label>
              <p className="priv-note" style={{ margin: '7px 0 0', lineHeight: 1.65 }}>政策说明账号、设备信息及 IP 推算地区的处理方式。GPS 精确位置不会由本协议自动授权。</p>
            </div>
            {err && <p className="err">{err}</p>}
            <button className="pri" disabled={busy} onClick={codeSent ? doVerifyReg : sendCode}>{busy ? <><Spin />{codeSent ? '验证中…' : '发送中…'}</> : codeSent ? '验证并进入' : '发送验证码并注册'}</button>
            <p className="login-switch">已有账号？<button onClick={() => { setMode('login'); setErr(''); setCode(''); setInvite(''); setForgotSent(false); }}>去登录</button></p>
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
      {showPrivacyPolicy && <div role="dialog" aria-modal="true" aria-labelledby="privacy-policy-title" onClick={() => setShowPrivacyPolicy(false)} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(8px)' }}>
        <section onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, maxHeight: '85vh', overflowY: 'auto', padding: 22, borderRadius: 18, color: '#f4f6ff', background: 'linear-gradient(160deg,#171d35,#0b1020)', border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 24px 70px #000b' }}>
          <h2 id="privacy-policy-title" style={{ margin: '0 0 8px', fontSize: 22 }}>隐私政策与用户协议</h2>
          <p className="priv-note">版本：{PRIVACY_POLICY_VERSION} · 请认真阅读后再决定是否同意</p>
          <h3>一、我们可能处理的信息</h3>
          <p>为提供班级档案服务，网站会处理你注册时填写的用户名、真实姓名、QQ 邮箱、密码验证信息及你主动上传的头像和资料。密码由认证服务处理，网站不应以明文保存密码。</p>
          <h3>二、登录设备与地区信息</h3>
          <p>当前版本登录后会读取浏览器提供的设备标识信息，并通过第三方 IP 查询服务推算大致地区（例如国家、州/省或城市）。IP 推算地区可能不准确，不代表 GPS 定位或实时位置。设备和地区信息会更新到站点的成员状态记录，管理员可能在账号管理页面查看。</p>
          <h3>三、GPS 精确定位的独立自愿授权</h3>
          <p>GPS 精确定位属于可选功能，不是注册、登录或使用班级档案的必要条件。隐私政策的阅读或同意、注册成功、继续使用网站，均不代表你已同意 GPS 定位。只有当你主动点击“同意并开启定位”后，网站才会调用浏览器定位接口，并由浏览器或设备系统另行请求位置权限；你可以拒绝系统请求或选择“暂不授权”，不会因此失去网站基本功能。</p>
          <p>在当前版本中，定位结果仅在当前页面临时显示纬度、经度和设备报告的精度，不会上传到网站服务器、写入账号或数据库，也不会提供给管理员查看。关闭定位说明弹窗时，页面会清除临时显示的坐标。定位精度受设备、浏览器、网络及周围环境影响，不能保证准确到具体地点。</p>
          <p>你可以不启用此功能。若浏览器曾允许本网站访问位置，可通过浏览器或设备的站点权限设置撤回该权限。未来如需将位置上传、保存或提供管理员查看，网站必须先更新说明，明确具体用途、可查看人员、保存期限和删除方式，并在实施前另行取得明确、自愿的授权；当前版本不会进行这些操作。</p>
          <h3>四、查看权限与用途</h3>
          <p>管理员仅应为账号安全、处理登录问题及维护班级网站而查看必要信息，不得将信息用于跟踪、骚扰、公开披露或与网站无关的用途。普通成员不应获得其他成员的私密登录记录。</p>
          <h3>五、保存、共享与安全</h3>
          <p>网站会尽量限制访问权限并采取合理措施保护信息。为完成 IP 地区推算，浏览器会向第三方查询服务发起请求；该服务可能接收到请求 IP。网络服务商、托管平台也可能按其规则处理技术日志。网站不应出售成员个人信息。</p>
          <h3>六、你的选择与权利</h3>
          <p>你可以选择不注册或不提供非必要资料，并可联系网站管理员申请查阅、更正或删除个人资料。不同意本政策将无法创建新账号，但不应因此被要求授权 GPS 精确定位。若你是未成年人，请在老师或监护人协助下阅读并决定是否提供个人信息。</p>
          <h3>七、政策变更与联系</h3>
          <p>如果收集的信息种类、用途或查看范围发生实质变化，网站应更新政策并在需要时重新征求同意。请通过网站公开的管理员联系方式提出隐私相关问题。</p>
          <p style={{ marginTop: 14, fontSize: 12, opacity: .75 }}>提示：此文本是网站说明草案，不构成法律意见；上线前应由负责网站的成年人核对实际数据流、权限及适用规则。</p>
          <button className="pri" onClick={() => setShowPrivacyPolicy(false)} style={{ width: '100%', marginTop: 12 }}>返回注册</button>
        </section>
      </div>}
      {fbOpen && <FeedbackModal kind="login" onClose={() => setFbOpen(false)} />}
    </>
  );
}
