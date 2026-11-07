import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import FeedbackModal from '../components/FeedbackModal';
import PasswordField from '../components/PasswordField';
import CodeInput from '../components/CodeInput';
import FloatField from '../components/FloatField';
import { alertDialog } from '../lib/dialog';
import './Login.polish.css';
import { getQqAvatarPreviewUrl, getQqNumberFromEmail } from '../lib/qqAvatar';

const BG_KEY = 'ca_login_bg_v2';
const DEFAULT_BG = '';
const LEGACY_DEFAULT_BACKGROUND = /(?:^|\/)(?:assets|src\/assets)\/cow(?:[-.][^/?#]+)?\.jpe?g(?:[?#].*)?$/i;
function readLoginBackground() {
  try {
    const saved = localStorage.getItem(BG_KEY) || '';
    // Older versions stored the bundled cow image as the default. Clear only that
    // stock asset; data URLs and other user-selected backgrounds are preserved.
    return LEGACY_DEFAULT_BACKGROUND.test(saved) ? DEFAULT_BG : saved;
  } catch {
    return DEFAULT_BG;
  }
}

// 按钮里的加载小圈圈（等待动画）
function Spin() {
  return (
    <motion.span aria-hidden
      style={{ display: 'inline-block', width: 13, height: 13, marginRight: 8, borderRadius: '50%', border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', verticalAlign: -2 }}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }} />
  );
}

export default function Login({ siteTitle, siteSubtitle, onGuestLogin }: { siteTitle?: string; siteSubtitle?: string; onGuestLogin?: () => void }) {
  const brandTitle = (siteTitle || '').trim() || '我们的班级';
  const brandSubtitle = (siteSubtitle || '').trim();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<'login' | 'reg' | 'forgot'>('login');
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const PRIVACY_POLICY_VERSION = '2026-11-07-v3';
  const [ident, setIdent] = useState(''); // 登录标识
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [real, setReal] = useState('');
  const [email, setEmail] = useState('');
  const [useQqAvatar, setUseQqAvatar] = useState(false);
  const [qqAvatarLoadState, setQqAvatarLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [qqAvatarPreviewAttempt, setQqAvatarPreviewAttempt] = useState(0);
  const [pw2, setPw2] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [fbOpen, setFbOpen] = useState(false);
  // 邮箱验证码
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false); // 注册表单上已点过“发送验证码”
  const [resendIn, setResendIn] = useState(0);
  const [waitSec, setWaitSec] = useState(0); // 验证屏已等待秒数
  const [forgotSent, setForgotSent] = useState(false); // 忘记密码：重置验证码是否已发送
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotNewPw2, setForgotNewPw2] = useState('');
  const [bg, setBg] = useState<string>(readLoginBackground);
  // 失焦校验：填完离开某个框，才在框正下方提示怎么改；没碰过的框不打扰，改对了自动消失
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string) => () => setTouched(t => (t[k] ? t : { ...t, [k]: true }));
  const terr = (k: string, msg: string | null) => (touched[k] && msg) ? msg : undefined;
  const emailErr = /^[1-9]\d{4,10}@qq\.com$/i.test(email.trim()) ? null : '请填写正确的 QQ 邮箱，如 123456@qq.com';
  const qqNumber = getQqNumberFromEmail(email);
  const qqAvatarPreviewUrl = getQqAvatarPreviewUrl(email, qqAvatarPreviewAttempt);
  function updateRegistrationEmail(value: string) {
    setEmail(value);
    setUseQqAvatar(false);
    setQqAvatarPreviewAttempt(0);
    setQqAvatarLoadState(getQqNumberFromEmail(value) ? 'loading' : 'idle');
  }
  const phoneErr = !phone.trim() || /^1\d{10}$/.test(phone.trim()) ? null : '手机号要 11 位数字，没有可以留空';
  const pwErr = pw.length >= 8 ? null : '密码至少 8 位';
  const pw2Err = pw2 === pw ? null : '两次输入的密码不一致';
  const fPwErr = forgotNewPw.length >= 8 ? null : '新密码至少 8 位';
  const fPw2Err = forgotNewPw2 === forgotNewPw ? null : '两次输入的新密码不一致';
  const [blur, setBlur] = useState(3); const [dark, setDark] = useState(45);
  const [showBg, setShowBg] = useState(false);
  const bgRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

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

  // 注册校验错误会自动滚动到可见位置，避免按钮点击后错误出现在屏幕外。
  useEffect(() => {
    if (!err || mode !== 'reg') return;
    errorRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }, [err, mode, reduce]);

  async function doLogin() {
    const id = ident.trim();
    if (!id) return setErr('请输入登录账号');
    if (!pw) return setErr('请输入密码');
    setErr(''); setBusy(true);
    let em = '';
    try {
      // Persist the start time BEFORE starting authentication. The auth-state
      // listener may update the App before this function's promise resolves.
      try {
        sessionStorage.setItem('ca_login_started_at', String(Date.now()));
        sessionStorage.setItem('ca_login_success', '1');
        sessionStorage.removeItem('ca_login_elapsed_ms');
      } catch {}
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
      try {
        sessionStorage.removeItem('ca_login_success');
        sessionStorage.removeItem('ca_login_started_at');
        sessionStorage.removeItem('ca_login_elapsed_ms');
      } catch {}
      const m = e?.message || '';
      const method = em ? 'email' : 'username';
      const failureClass = /invalid login credentials|invalid_credentials/i.test(m)
        ? 'invalid_credentials'
        : /email not confirmed|USERNAME_EMAIL_NOT_CONFIRMED/i.test(m)
          ? 'email_not_confirmed'
          : /rate.?limit|USERNAME_LOGIN_RATE_LIMITED/i.test(m)
            ? 'rate_limited'
            : /network|fetch|timeout|failed to fetch/i.test(m)
              ? 'network'
              : 'other';
      // Record only the method and a fixed failure category. Never send the
      // entered email, username, password, OTP, or raw error message.
      void supabase.rpc('record_auth_login_failure', {
        p_method: method,
        p_failure_class: failureClass,
      });
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

  // 注册/验证拿到 session 后补做的事：展示名（入班已改为注册自动完成，不再需要邀请码）
  async function finishJoin(uid: string) {
    // 仅在新注册完成后安排一次自愿 GPS 说明；这里不请求位置，也不记录坐标。
    try { sessionStorage.setItem('ca_gps_offer', '1'); } catch {}
    // 新注册：进站后展示一次 3 页功能引导（App 层消费，本机看过后不再展示）
    try { sessionStorage.setItem('ca_guide_pending', '1'); } catch {}
    const nm = name.trim();
    // 用户明确选择 QQ 头像后，服务端只会为当前已验证 QQ 邮箱导入对应公开头像。
    // 导入是非阻断操作：即使 QQ 服务暂时不可用，也不影响账号注册。
    if (useQqAvatar && qqNumber) {
      try {
        // Wait for the best-effort import so the first profile load can see its saved avatar.
        const importRequest = supabase.functions.invoke('qq-avatar-import', { body: { qq: qqNumber } })
          .then(({ data, error }) => !error && data?.ok === true)
          .catch(() => false);
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          importRequest,
          new Promise<boolean>(resolve => { timeoutId = setTimeout(() => resolve(false), 4500); }),
        ]);
        if (timeoutId) clearTimeout(timeoutId);
      } catch {
        // Avatar import is optional and must never block account registration.
      }
    }
    // 注意：username / real_name 由注册触发器写入，列级权限不允许前端直接改，这里只更新展示名
    if (nm) supabase.from('profiles').update({ display_name: nm }).eq('id', uid).then(() => {});
  }

  // 注册表单上的“发送验证码”：走 Supabase + Resend SMTP 发 6 位码。
  // 第一次点 = signUp（建未验证账号并经 Resend 发码），已发送过且倒计时结束 = resend 重发。
  async function sendCode() {
    setErr('');
    if (!policyAccepted) return setErr('请先阅读并勾选同意《隐私政策与用户协议》');
    const nm = name.trim(), rl = real.trim(), em = email.trim();
    if (nm.length < 1 || nm.length > 30) return setErr('用户名 1～30 个字');
    if (!rl || rl.length > 30) return setErr('请填写真实姓名（仅管理员可见）');
    const ph = phone.trim(); if (ph && !/^1\d{10}$/.test(ph)) return setErr('手机号填 11 位数字，也可以留空');
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
          options: { data: { username: nm, real_name: rl, ...(ph ? { phone: ph } : {}), privacy_policy_version: PRIVACY_POLICY_VERSION, privacy_policy_accepted_at: new Date().toISOString() } },
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

  // 注册表单上填码后点“验证并进入”：核对 Resend 发来的 6 位码，通过后补做展示名。
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
    const ph = phone.trim(); if (ph && !/^1\d{10}$/.test(ph)) return setErr('手机号填 11 位数字，也可以留空');
    if (!/^[1-9]\d{4,10}@qq\.com$/i.test(em)) return setErr('请填写正确的 QQ 邮箱');
    if (pw.length < 8) return setErr('密码至少 8 位');
    if (pw !== pw2) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: em, password: pw,
        options: { data: { username: nm, real_name: rl, ...(ph ? { phone: ph } : {}), privacy_policy_version: PRIVACY_POLICY_VERSION, privacy_policy_accepted_at: new Date().toISOString() } },
      });
      if (error) throw error;
      if (data.user && Array.isArray((data.user as any).identities) && (data.user as any).identities.length === 0) {
        setErr('这个 QQ 邮箱已经注册过，直接登录吧');
        return;
      }
      if (!data.session) {
        // 邮箱验证已打开：没有 session，先转到验证屏；展示名和邀请码加入等验证成功后在 doVerify 里补做
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
      alertDialog('密码已重设成功，去登录吧');
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
      {!bg && <div className="login-flow" aria-hidden="true" />}
      <div className="login-wrap">
        <motion.div className="login-card page"
          initial={reduce ? {} : { opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <div className="qz-login-card-content">
          <h1>{brandTitle}</h1>
          {brandSubtitle ? <p className="sub">{brandSubtitle}</p> : null}

          {verifyEmail ? (<>
            <h1 style={{ fontSize: 22 }}>验证邮箱</h1>
            <p className="sub">注 册 验 证</p>
            <p className="priv-note" style={{ margin: '0 0 4px' }}>验证码已发送到 <b style={{ color: '#2456c8' }}>{verifyEmail}</b><br />
              打开 QQ 邮箱，找标题是「我们的班级 · 青春档案 — 你的验证码」的邮件，把里面的 <b style={{ color: '#2456c8' }}>6 位数字验证码</b> 填到下面<br />
              没看到就翻一下垃圾箱；也可以点邮件里的「确认邮箱」链接直接完成验证</p>
            <p className="priv-note" style={{ margin: '0 0 6px' }}>已等待 {waitSec} 秒 · 邮件通常 1 分钟内到达
              <motion.span animate={reduce ? {} : { opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.2 }}>…</motion.span>
            </p>
            <label>验证码</label>
            <CodeInput value={code} onChange={setCode} onEnter={doVerify} autoFocus />
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
            <FloatField label="账号" value={ident} error={terr('ident', ident.trim() ? null : '请输入登录账号')}>
              <input value={ident} onChange={e => setIdent(e.target.value)} onBlur={touch('ident')} placeholder="QQ 邮箱 / 用户名" autoComplete="username" aria-label="账号" />
            </FloatField>
            <FloatField label="密码" value={pw} error={terr('pwLogin', pw ? null : '请输入密码')}>
              <PasswordField disabled={codeSent} value={pw} onChange={setPw} onBlur={touch('pwLogin')} placeholder="密码" autoComplete="current-password"
                onKeyDown={e => e.key === 'Enter' && doLogin()} />
            </FloatField>
            {err && <p className="err">{err}</p>}
            <button className="pri" disabled={busy} onClick={doLogin}>{busy ? <><Spin />登录中…</> : '进入班级'}</button>
            <p className="login-switch">忘记密码了？<button onClick={() => { setMode('forgot'); setErr(''); setForgotSent(false); }}>点我重置</button></p>
            <p className="login-switch">还没有账号？<button onClick={() => { setMode('reg'); setErr(''); setCode(''); setForgotSent(false); }}>去注册</button></p>
            <p className="login-switch" style={{ marginTop: 2 }}>如果登录不上<button onClick={() => setFbOpen(true)}>点我反馈</button></p>
            {onGuestLogin && <button type="button" className="ghost" style={{ width: '100%', marginTop: 10 }} onClick={onGuestLogin}>游客登录（仅浏览）</button>}
          </>) : mode === 'forgot' ? (<>
            <h1 style={{ fontSize: 22 }}>重置密码</h1>
            <p className="sub">找 回 密 码</p>
            <p className="priv-note" style={{ margin: '0 0 4px' }}>输入注册时的 QQ 邮箱，我们会发一个 6 位重置验证码给你<br />不用点邮件里的链接，在下面填码、设新密码就行</p>
            <FloatField label="QQ 邮箱" value={email} error={terr('email', emailErr)}>
              <input disabled={codeSent} value={email} onChange={e => { setEmail(e.target.value); if (forgotSent) { setForgotSent(false); setForgotCode(''); } }} onBlur={touch('email')} placeholder="123456@qq.com" inputMode="email" aria-label="QQ 邮箱"
                onKeyDown={e => e.key === 'Enter' && doForgot()} />
            </FloatField>
            <button className="ghost" style={{ width: '100%', marginTop: 8 }} disabled={busy || resendIn > 0} onClick={doForgot}>
              {busy ? '发送中…' : resendIn > 0 ? `重新发送验证码（${resendIn}s）` : forgotSent ? '重新发送验证码' : '发送验证码'}
            </button>
            {forgotSent && <p className="priv-note" style={{ margin: '4px 0 0' }}>验证码已发到上面这个 QQ 邮箱，找标题是「我们的班级 · 青春档案 — 你的重置密码验证码」的邮件，没看到就翻一下垃圾箱；如果这个邮箱没注册过，是不会收到码的</p>}
            {forgotSent && (<>
              <label>邮箱验证码</label>
              <CodeInput value={forgotCode} onChange={setForgotCode} onEnter={doForgotVerify} />
              <FloatField label="新密码" value={forgotNewPw} hint="至少 8 位" error={terr('fPw', fPwErr)}>
                <PasswordField value={forgotNewPw} onChange={setForgotNewPw} onBlur={touch('fPw')} placeholder="至少 8 位" autoComplete="new-password" ariaLabel="新密码" strength />
              </FloatField>
              <FloatField label="确认新密码" value={forgotNewPw2} error={terr('fPw2', fPw2Err)}>
                <PasswordField value={forgotNewPw2} onChange={setForgotNewPw2} onBlur={touch('fPw2')} placeholder="再输一次" autoComplete="new-password" ariaLabel="确认新密码"
                  onKeyDown={e => e.key === 'Enter' && doForgotVerify()} />
              </FloatField>
            </>)}
            {err && <p className="err">{err}</p>}
            {forgotSent && <button className="pri" disabled={busy} onClick={doForgotVerify}>{busy ? <><Spin />重设中…</> : '验证并重设密码'}</button>}
            <p className="login-switch"><button onClick={() => { setMode('login'); setErr(''); setForgotSent(false); }}>← 返回登录</button></p>
          </>) : (<>
            <FloatField label="用户名" value={name} hint="班级里显示的名字，可重复" error={terr('name', name.trim().length >= 1 && name.trim().length <= 30 ? null : '用户名要 1～30 个字')}>
              <input disabled={codeSent} value={name} onChange={e => setName(e.target.value)} onBlur={touch('name')} placeholder="班级里显示的名字，可重复" maxLength={30} aria-label="用户名" />
            </FloatField>
            {name.trim() && (<>
              <FloatField label="真实姓名" value={real} error={terr('real', real.trim() ? null : '请填写真实姓名')}>
                <input disabled={codeSent} value={real} onChange={e => setReal(e.target.value)} onBlur={touch('real')} placeholder="仅管理员可见，不会公开" maxLength={30} aria-label="真实姓名" />
              </FloatField>
              <p className="priv-note">真实姓名只用于后台统计，普通成员看不到</p>
            </>)}
            <FloatField label="手机号（选填）" value={phone} hint="11 位手机号，没有可不填" error={terr('phone', phoneErr)}>
              <input disabled={codeSent} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))} onBlur={touch('phone')} placeholder="11 位手机号，没有可不填" inputMode="tel" aria-label="手机号（选填）" />
            </FloatField>
            <FloatField label="QQ 邮箱" value={email} error={terr('email', emailErr)}>
              <input value={email} onChange={e => { updateRegistrationEmail(e.target.value); if (codeSent) { setCodeSent(false); setCode(''); } }} onBlur={touch('email')} placeholder="123456@qq.com" inputMode="email" aria-label="QQ 邮箱" />
            </FloatField>
            {qqAvatarPreviewUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '10px 0 4px', padding: '11px 12px', borderRadius: 14, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.14)' }}>
                {qqAvatarLoadState === 'error' ? (
                  <div aria-hidden style={{ width: 48, height: 48, flex: '0 0 48px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.7)', fontSize: 12 }}>QQ</div>
                ) : (
                  <img key={qqAvatarPreviewUrl} src={qqAvatarPreviewUrl} alt="QQ 头像预览" referrerPolicy="no-referrer"
                    onLoad={() => setQqAvatarLoadState('ready')} onError={() => setQqAvatarLoadState('error')}
                    style={{ width: 48, height: 48, flex: '0 0 48px', borderRadius: '50%', objectFit: 'cover', background: 'rgba(255,255,255,.12)' }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>QQ 头像预览</div>
                  <div className="priv-note" style={{ margin: '3px 0 0', fontSize: 11.5 }}>
                    {qqAvatarLoadState === 'error' ? '暂时无法读取头像，注册后仍可手动上传' : qqAvatarLoadState === 'ready' ? (useQqAvatar ? '已选择，注册完成后保存到本站' : '可以选择作为你的注册头像') : '正在读取公开头像…'}
                  </div>
                </div>
                {qqAvatarLoadState === 'ready' && (
                  <button type="button" className="mini ghost" aria-pressed={useQqAvatar}
                    onClick={() => setUseQqAvatar(value => !value)}
                    style={useQqAvatar ? { borderColor: 'rgba(90,190,135,.65)', background: 'rgba(65,160,110,.18)', color: '#b8f2cf' } : undefined}>
                    {useQqAvatar ? '✓ 已选择' : '使用此头像'}
                  </button>
                )}
                {qqAvatarLoadState === 'error' && (
                  <button type="button" className="mini ghost"
                    onClick={() => { setUseQqAvatar(false); setQqAvatarLoadState('loading'); setQqAvatarPreviewAttempt(value => value + 1); }}>
                    重试
                  </button>
                )}
              </div>
            )}
            {!codeSent && <p className="priv-note" style={{ margin: '4px 0 0' }}>请继续填写下方密码、确认密码并勾选协议，再点击页面底部的「发送验证码并注册」。</p>}
            {codeSent && <p className="priv-note" style={{ margin: '4px 0 0' }}>验证码已通过 Resend 发到上面这个 QQ 邮箱，找标题是「我们的班级 · 青春档案 — 你的验证码」的邮件，没看到就翻一下垃圾箱</p>}
            {codeSent && (<>
              <label>邮箱验证码</label>
              <CodeInput value={code} onChange={setCode} onEnter={doVerifyReg} />
              <button className="ghost" type="button" style={{ width: '100%', marginTop: 8 }} disabled={busy || resendIn > 0} onClick={sendCode}>
                {busy ? '发送中…' : resendIn > 0 ? `重新发送验证码（${resendIn}s）` : '重新发送验证码'}
              </button>
            </>)}
            <FloatField label="密码" value={pw} hint="至少 8 位" error={terr('pwReg', pwErr)}>
              <PasswordField value={pw} onChange={setPw} onBlur={touch('pwReg')} placeholder="至少 8 位" autoComplete="new-password" strength />
            </FloatField>
            <FloatField label="确认密码" value={pw2} error={terr('pw2', pw2Err)}>
              <PasswordField disabled={codeSent} value={pw2} onChange={setPw2} onBlur={touch('pw2')} placeholder="再输一次" autoComplete="new-password" ariaLabel="确认密码" />
            </FloatField>
            <div style={{ margin: '14px 0 10px', padding: '12px 13px', borderRadius: 12, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, lineHeight: 1.6, cursor: 'pointer' }}>
                <input type="checkbox" checked={policyAccepted} onChange={e => setPolicyAccepted(e.target.checked)} style={{ width: 18, height: 18, marginTop: 3, flexShrink: 0 }} />
                <span>我已阅读并同意 <button type="button" className="linklike" onClick={() => setShowPrivacyPolicy(true)} style={{ border: 0, padding: 0, background: 'none', color: '#2f5fd0', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>《隐私政策与用户协议》</button></span>
              </label>
              <p className="priv-note" style={{ margin: '7px 0 0', lineHeight: 1.65 }}>政策说明账号、设备信息及 IP 推算地区的处理方式。所在地区分享不会由本协议自动授权。</p>
            </div>
            {err && <p ref={errorRef} className="err" role="alert" aria-live="polite">{err}</p>}
            <button className="pri" disabled={busy} onClick={codeSent ? doVerifyReg : sendCode}>{busy ? <><Spin />{codeSent ? '验证中…' : '发送中…'}</> : codeSent ? '验证并进入' : '发送验证码并注册'}</button>
            <p className="login-switch">已有账号？<button onClick={() => { setMode('login'); setErr(''); setCode(''); setForgotSent(false); }}>去登录</button></p>
          </>)}

          <div className="bg-panel">
            <button className="ghost" style={{ fontSize: 12.5 }} onClick={() => setShowBg(!showBg)}>自定义背景 {showBg ? '▲' : '▼'}</button>
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
          </div>
        </motion.div>
      </div>
      {showPrivacyPolicy && <div role="dialog" aria-modal="true" aria-labelledby="privacy-policy-title" onClick={() => setShowPrivacyPolicy(false)} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(8px)' }}>
        <section onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 620, maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', padding: 22, borderRadius: 18, color: '#f4f6ff', background: 'linear-gradient(160deg,#171d35,#0b1020)', border: '1px solid rgba(255,255,255,.16)', boxShadow: '0 24px 70px #000b' }}>
          <h2 id="privacy-policy-title" style={{ margin: '0 0 8px', fontSize: 22 }}>隐私政策与用户协议</h2>
          <p className="priv-note">版本：{PRIVACY_POLICY_VERSION} · 请认真阅读后再决定是否同意</p>
          <h3>一、我们可能处理的信息</h3>
          <p>为提供班级档案服务，网站会处理你注册时填写的用户名、真实姓名、QQ 邮箱、密码验证信息及你主动上传的头像和资料。密码由认证服务处理，网站不应以明文保存密码。</p>
           <p>如果你输入纯数字 QQ 邮箱，注册页面会向腾讯 QQ 公开头像服务请求该 QQ 号的头像预览；此功能是可选的。只有你主动点击“使用此头像”后，网站才会将图片复制并保存到本站头像存储中。你也可以不使用此功能，注册后再手动上传头像。</p>
          <h3>二、登录设备与地区信息</h3>
          <p>当前版本登录后会读取浏览器提供的设备标识信息，并通过第三方 IP 查询服务推算大致地区（例如国家、州/省或城市）。IP 推算地区可能不准确，不代表 GPS 定位或实时位置。设备和地区信息会更新到站点的成员状态记录，管理员可能在账号管理页面查看。</p>
          <h3>三、设备定位与所在地区分享（独立自愿授权）</h3>
          <p>所在地区分享属于可选功能，不是注册、登录或使用网站的必要条件。注册成功后出现的说明仅用于征求单独授权；只有你主动点击“获取并分享所在地区”，并在浏览器或设备系统的权限提示中允许后，网站才会请求一次设备定位。你也可以选择手动填写城市 / 地区，或点击“暂不分享，直接进入网站”，不会因此失去任何基本功能。</p>
          <p>为降低位置精度，设备坐标会先粗略处理到约 10 公里级别，再交由地区识别服务转换为城市 / 地区文字。网站仅保存城市 / 地区名称，不保存原始 GPS 坐标、街道或门牌号。地区分享后，仅超级管理员可在后台成员管理中查看；普通成员看不到。位置识别可能不准确，也不代表实时位置。</p>
          <p>你可以随时在“我的 → 隐私设置”查看当前分享状态，并撤回分享。撤回时，网站会删除账号中保存的地区信息，管理员也将不再看到该地区。拒绝浏览器定位权限不会自动开启分享，也不会影响网站基本功能。</p>
          <h3>四、查看权限与用途</h3>
          <p>管理员仅应为账号安全、处理登录问题及维护班级网站而查看必要信息，不得将信息用于跟踪、骚扰、公开披露或与网站无关的用途。普通成员不应获得其他成员的私密登录记录。</p>
          <h3>五、保存、共享与安全</h3>
          <p>网站会尽量限制访问权限并采取合理措施保护信息。为完成 IP 地区推算，浏览器会向第三方查询服务发起请求；该服务可能接收到请求 IP。网络服务商、托管平台也可能按其规则处理技术日志。网站不应出售成员个人信息。</p>
          <h3>六、你的选择与权利</h3>
          <p>你可以选择不注册或不提供非必要资料，并可联系网站管理员申请查阅、更正或删除个人资料。不同意本政策将无法创建新账号，但不应因此被要求分享所在地区。若你是未成年人，请在老师或监护人协助下阅读并决定是否提供个人信息。</p>
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
