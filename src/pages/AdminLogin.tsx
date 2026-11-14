import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PasswordField from '../components/PasswordField';
import { alog } from './admin/shared';

type Step = 'credentials' | 'enroll' | 'challenge' | 'recovery' | 'success';

function authMethodNames(methods: Array<string | { method: string }> | undefined) {
  return (methods ?? []).map((entry) => typeof entry === 'string' ? entry : entry.method);
}

// Dedicated admin login: password is only the first factor. The backend role
// gate also requires aal2, so this component is UX—not the security boundary.
export default function AdminLogin({
  showBack = true,
  onAuthenticated,
}: {
  showBack?: boolean;
  onAuthenticated?: () => void;
}) {
  const [ident, setIdent] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [step, setStep] = useState<Step>('credentials');
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryVerified, setRecoveryVerified] = useState(false);
  const startedRef = useRef(false);

  // A previous aal1 session must not be allowed to enroll an attacker's factor.
  // Show that a session exists, but always require password reauthentication.
  useEffect(() => {
    let alive = true;
    try {
      if (sessionStorage.getItem('qz_admin_idle_logout') === '1') {
        sessionStorage.removeItem('qz_admin_idle_logout');
        setErr('管理员后台因超过 20 分钟无操作已退出，请重新登录。');
      }
    } catch { /* storage may be unavailable */ }
    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive || error || !data.session) return;
      setHasSession(true);
      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!alive || aalError || aal.currentLevel !== 'aal2') return;
      const methods = authMethodNames(aal.currentAuthenticationMethods);
      if (!methods.includes('mfa/recovery_code') || methods.includes('totp')) return;

      const { data: isAdmin, error: identityError } = await supabase.rpc('admin_login_is_admin' as any);
      if (!alive) return;
      if (identityError || isAdmin !== true) {
        await supabase.auth.signOut({ scope: 'local' });
        if (alive) {
          setHasSession(false);
          setStep('credentials');
          setErr('账号或密码错误，或该账号没有管理权限');
        }
        return;
      }

      setRecoveryVerified(true);
      setStep('recovery');
      await beginReplacementTotpEnrollment();
    });
    return () => { alive = false; };
  }, []);

  async function beginReplacementTotpEnrollment() {
    if (startedRef.current) return;
    startedRef.current = true;
    setBusy(true);
    setErr('');
    try {
      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: '管理员替代验证器',
      });
      if (enrollError) throw enrollError;
      setFactorId(enrollment.id);
      setQrCode(enrollment.totp.qr_code);
      setSecret(enrollment.totp.secret);
      setCode('');
      setStep('enroll');
    } catch {
      setErr('恢复码已验证，但无法启动新的 TOTP 绑定。请重试；不要重复输入已使用的恢复码。');
      setStep('recovery');
    } finally {
      startedRef.current = false;
      setBusy(false);
    }
  }

  async function beginTotpFlow() {
    if (startedRef.current) return;
    startedRef.current = true;
    setBusy(true);
    setErr('');
    try {
      const { data: isAdmin, error: identityError } = await supabase.rpc('admin_login_is_admin' as any);
      if (identityError) throw identityError;
      if (isAdmin !== true) {
        await supabase.auth.signOut({ scope: 'local' });
        setHasSession(false);
        startedRef.current = false;
        setStep('credentials');
        setErr('账号或密码错误，或该账号没有管理权限');
        return;
      }

      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) throw factorError;

      const verifiedTotp = factors.totp.find((factor) => factor.status === 'verified');
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setStep('challenge');
        return;
      }

      const { data: enrollment, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: '管理后台验证器',
      });
      if (enrollError) throw enrollError;
      setFactorId(enrollment.id);
      setQrCode(enrollment.totp.qr_code);
      setSecret(enrollment.totp.secret);
      setStep('enroll');
    } catch (error) {
      console.error('管理员 TOTP 安全验证初始化失败', error);
      startedRef.current = false;
      setErr('无法启动管理员二次验证，请检查网络后重试。');
      setStep('credentials');
    } finally {
      setBusy(false);
    }
  }

  async function finishAdminLogin(recoveredLogin = false) {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const methods = authMethodNames(aal?.currentAuthenticationMethods);
    if (aalError || aal?.currentLevel !== 'aal2' || !methods.includes('totp')) {
      throw new Error('aal2_totp_required');
    }
    const { data: role, error: roleError } = await supabase.rpc('my_role');
    if (roleError || (role !== 'admin' && role !== 'super_admin')) {
      throw new Error('admin_role_required');
    }
    if (recoveredLogin) void alog('admin_totp_rebound_after_recovery', { method: 'recovery_code' });
    setStep('success');
    setErr('');
    onAuthenticated?.();
  }

  async function doLogin() {
    const id = ident.trim();
    if (!id) return setErr('请输入管理员账号');
    if (!pw) return setErr('请输入密码');
    setErr('');
    setBusy(true);
    let loginFailed = false;
    try {
      let email = id;
      if (!id.includes('@')) {
        const { data, error } = await supabase.rpc('resolve_login_email', { ident: id });
        if (error || !data) throw new Error('invalid_login');
        email = data as string;
      }
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (loginError) throw loginError;
      setPw('');
      setHasSession(true);
    } catch {
      loginFailed = true;
      setErr('账号或密码错误，或暂时无法登录，请检查后重试');
    } finally {
      setBusy(false);
    }
    if (!loginFailed) await beginTotpFlow();
  }

  async function verifyCode() {
    const cleanCode = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      setErr('请输入验证器应用中当前的 6 位验证码');
      return;
    }
    if (!factorId) {
      setErr('验证器状态已失效，请重新登录后重试');
      return;
    }

    setBusy(true);
    setErr('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: cleanCode,
      });
      if (verifyError) throw verifyError;
      const recoveredLogin = recoveryVerified;
      setRecoveryVerified(false);
      await finishAdminLogin(recoveredLogin);
    } catch (error) {
      console.error('管理员 TOTP 验证失败', error);
      setErr('验证码无效或已过期，请等待新验证码后重试。');
    } finally {
      setBusy(false);
    }
  }

  async function verifyRecoveryCode() {
    if (recoveryVerified) {
      await beginReplacementTotpEnrollment();
      return;
    }
    const candidate = recoveryCode.trim();
    if (!candidate) {
      setErr('请输入一枚尚未使用的备用恢复码');
      return;
    }

    setBusy(true);
    setErr('');
    try {
      const { error: recoveryError } = await supabase.auth.mfa.recoveryCodes.verify({ code: candidate });
      if (recoveryError) {
        const codeName = (recoveryError as { code?: string }).code;
        if (codeName === 'mfa_recovery_codes_locked') {
          throw new Error('尝试次数过多，恢复码验证已暂时锁定，请稍后再试或使用其他验证器。');
        }
        throw new Error('恢复码无效、已使用，或暂时无法验证。');
      }
      setRecoveryCode('');
      setRecoveryVerified(true);
      await beginReplacementTotpEnrollment();
    } catch (error) {
      setErr(error instanceof Error ? error.message : '恢复码验证失败，请稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  const submit = () => {
    if (step === 'credentials') {
      void doLogin();
    } else if (step === 'enroll' || step === 'challenge') {
      void verifyCode();
    } else if (step === 'recovery') {
      void verifyRecoveryCode();
    }
  };

  return (
    <div style={{ minHeight: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="login-card" style={{ background: '#0d1017f2', border: '1px solid #ffffff1f', maxWidth: 380, width: '100%' }}>
        <h1 style={{ fontSize: 20 }}>管理后台</h1>
        <p className="sub">{step === 'credentials' ? '管 理 员 登 录' : '双重验证'}</p>

        {step === 'credentials' && <>
          {hasSession && <p className="priv-note">检测到已有登录会话。为避免被盗用的会话绑定新验证器，请重新输入管理员密码后继续。</p>}
          <label htmlFor="admin-ident">管理员账号</label>
          <input id="admin-ident" value={ident} onChange={(event) => setIdent(event.target.value)} placeholder="QQ 邮箱 / 用户名"
            autoComplete="username" onKeyDown={(event) => event.key === 'Enter' && submit()} disabled={busy} />
          <label htmlFor="admin-password">密码</label>
          <PasswordField value={pw} onChange={setPw} placeholder="密码" autoComplete="current-password"
            onKeyDown={(event) => event.key === 'Enter' && submit()} />
        </>}

        {step === 'enroll' && <div style={{ display: 'grid', gap: 12 }}>
          <p className="priv-note">请用身份验证器应用扫描二维码。无法扫描时，可手动输入下方密钥。完成绑定前不会开放后台权限。</p>
          {qrCode && <img src={qrCode} alt="TOTP 身份验证器绑定二维码" width={190} height={190}
            style={{ display: 'block', margin: '0 auto', padding: 8, background: '#fff', borderRadius: 10 }} />}
          <label htmlFor="totp-secret">手动设置密钥</label>
          <code id="totp-secret" style={{ display: 'block', overflowWrap: 'anywhere', padding: 10, borderRadius: 8, background: '#ffffff12', userSelect: 'all' }}>{secret}</code>
          <label htmlFor="totp-code">验证器 6 位验证码</label>
          <input id="totp-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="000000" onKeyDown={(event) => event.key === 'Enter' && submit()} />
        </div>}

        {step === 'challenge' && <div style={{ display: 'grid', gap: 12 }}>
          <p className="priv-note">请输入身份验证器应用当前显示的 6 位验证码。</p>
          <label htmlFor="totp-code">验证码</label>
          <input id="totp-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="000000" onKeyDown={(event) => event.key === 'Enter' && submit()} />
          <button type="button" className="mini" disabled={busy} onClick={() => { setErr(''); setRecoveryCode(''); setStep('recovery'); }}>
            无法使用验证器？输入备用恢复码
          </button>
        </div>}

        {step === 'recovery' && <div style={{ display: 'grid', gap: 12 }}>
          {recoveryVerified ? <>
            <p className="priv-note" role="status">恢复码已使用。为保护管理员权限，请立即绑定并验证新的 TOTP 验证器；完成前不会开放后台。</p>
            <p className="sub">如果二维码尚未显示，请点击下方按钮重试设置。</p>
          </> : <>
            <p className="priv-note">备用恢复码只能使用一次。验证后需要马上绑定新的 TOTP 验证器，恢复码本身不会直接开放后台。</p>
            <label htmlFor="admin-recovery-code">备用恢复码</label>
            <input id="admin-recovery-code" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.slice(0, 64))}
              autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} placeholder="输入一枚未使用的恢复码"
              onKeyDown={(event) => event.key === 'Enter' && submit()} />
            <button type="button" className="mini" disabled={busy} onClick={() => { setErr(''); setStep('challenge'); }}>
              返回身份验证器验证码
            </button>
          </>}
        </div>}

        {step === 'success' && <p className="priv-note" role="status">验证成功，正在安全进入后台…</p>}
        {err && <p className="err" role="alert">{err}</p>}
        {step !== 'success' && <button className="pri" disabled={busy} onClick={submit}>
          {busy ? '验证中…' : step === 'credentials' ? '验证密码并继续'
            : step === 'recovery' ? recoveryVerified ? '重试设置新验证器' : '验证恢复码并绑定新验证器'
              : '验证并进入后台'}
        </button>}
        {showBack && step === 'credentials' && <p className="login-switch"><Link to="/home">← 返回站点</Link></p>}
      </div>
    </div>
  );
}
