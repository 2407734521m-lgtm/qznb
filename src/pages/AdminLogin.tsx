import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import PasswordField from '../components/PasswordField';
import { alog } from './admin/shared';

type Step = 'credentials' | 'pin_setup' | 'pin_verify' | 'success';

function isValidPin(value: string) {
  return /^\d{6}$/.test(value);
}

function isWeakPin(value: string) {
  return /^(\d)\1{5}$/.test(value)
    || ['012345', '123456', '234567', '345678', '456789',
      '987654', '876543', '765432', '654321', '543210'].includes(value);
}

export default function AdminLogin({
  showBack = true,
  onAuthenticated,
}: {
  showBack?: boolean;
  onAuthenticated?: () => void;
}) {
  const [ident, setIdent] = useState('');
  const [pw, setPw] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [step, setStep] = useState<Step>('credentials');
  const startedRef = useRef(false);

  // Existing sessions must re-enter the primary password and this session's PIN.
  // A previously authenticated session is not treated as PIN verification.
  useEffect(() => {
    let alive = true;
    try {
      if (sessionStorage.getItem('qz_admin_idle_logout') === '1') {
        sessionStorage.removeItem('qz_admin_idle_logout');
        setErr('管理员后台因超过 20 分钟无操作已退出，请重新登录。');
      }
    } catch { /* storage may be unavailable */ }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (alive && !error && data.session) setHasSession(true);
    });

    return () => { alive = false; };
  }, []);

  async function beginSecondaryPasswordFlow() {
    if (startedRef.current) return;
    startedRef.current = true;
    setBusy(true);
    setErr('');

    try {
      const { data: isAdmin, error: identityError } = await supabase.rpc('admin_login_is_admin' as any);
      if (identityError) throw identityError;

      if (isAdmin !== true) {
        const { error: monitorError } = await supabase.rpc('record_auth_login_failure' as any, {
          p_method: 'admin',
          p_failure_class: 'other',
        } as any);
        if (monitorError) console.warn('管理员登录失败统计暂不可用：', monitorError.message);

        await supabase.auth.signOut({ scope: 'local' });
        setHasSession(false);
        setStep('credentials');
        setErr('账号或密码错误，或该账号没有管理权限');
        return;
      }

      const { data: configured, error: statusError } = await supabase.rpc(
        'admin_secondary_password_status' as any
      );
      if (statusError) throw statusError;

      setPin('');
      setPinConfirm('');
      setStep(configured === true ? 'pin_verify' : 'pin_setup');
    } catch (error) {
      console.error('管理员二级密码状态读取失败', error);
      setErr('无法读取管理员二级密码状态，请检查网络后重试。');
      setStep('credentials');
    } finally {
      startedRef.current = false;
      setBusy(false);
    }
  }

  async function finishAdminLogin() {
    const { data: role, error: roleError } = await supabase.rpc('my_role');
    if (roleError || (role !== 'admin' && role !== 'super_admin')) {
      throw new Error('admin_secondary_password_gate_failed');
    }

    await alog('admin_login_success', { method: 'password_and_secondary_pin' });
    setPin('');
    setPinConfirm('');
    setStep('success');
    setErr('');
    onAuthenticated?.();
  }

  async function verifyPin() {
    if (!isValidPin(pin)) {
      setErr('请输入 6 位数字二级密码。');
      return;
    }

    setBusy(true);
    setErr('');
    try {
      const { data: verified, error: verifyError } = await supabase.rpc(
        'admin_verify_secondary_password' as any,
        { p_pin: pin } as any
      );
      if (verifyError) throw verifyError;
      if (verified !== true) {
        throw new Error('secondary_pin_invalid_or_locked');
      }
      await finishAdminLogin();
    } catch (error) {
      console.error('管理员二级密码验证失败', error);
      setPin('');
      setErr('二级密码错误，或验证次数过多已暂时锁定。请检查后重试。');
    } finally {
      setBusy(false);
    }
  }

  async function setupPin() {
    if (!isValidPin(pin) || !isValidPin(pinConfirm)) {
      setErr('请设置并确认 6 位数字二级密码。');
      return;
    }
    if (pin !== pinConfirm) {
      setErr('两次输入的二级密码不一致。');
      return;
    }
    if (isWeakPin(pin)) {
      setErr('请勿使用连续数字或 6 位相同数字。');
      return;
    }

    setBusy(true);
    setErr('');
    try {
      const { data: created, error: setError } = await supabase.rpc(
        'admin_set_secondary_password' as any,
        { p_pin: pin } as any
      );
      if (setError) throw setError;

      if (created !== true) {
        const { data: configured } = await supabase.rpc('admin_secondary_password_status' as any);
        if (configured === true) {
          setStep('pin_verify');
          setPin('');
          setPinConfirm('');
          setErr('此账号的二级密码已设置，请输入现有二级密码。');
          return;
        }
        throw new Error('secondary_pin_setup_failed');
      }

      const { data: verified, error: verifyError } = await supabase.rpc(
        'admin_verify_secondary_password' as any,
        { p_pin: pin } as any
      );
      if (verifyError || verified !== true) {
        throw verifyError ?? new Error('secondary_pin_verify_failed');
      }
      await finishAdminLogin();
    } catch (error) {
      console.error('管理员二级密码初始化失败', error);
      setPin('');
      setPinConfirm('');
      setErr('二级密码设置失败。请换一个 6 位数字组合后重试。');
    } finally {
      setBusy(false);
    }
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
    } catch (error) {
      loginFailed = true;
      const message = String((error as { message?: unknown })?.message ?? error).toLowerCase();
      const failureClass = /429|rate.?limit|too many/.test(message)
        ? 'rate_limited'
        : /network|fetch|timeout|failed to fetch/.test(message)
          ? 'network'
          : 'invalid_credentials';
      const { error: monitorError } = await supabase.rpc('record_auth_login_failure' as any, {
        p_method: 'admin',
        p_failure_class: failureClass,
      } as any);
      if (monitorError) console.warn('管理员登录失败统计暂不可用：', monitorError.message);
      setErr('账号或密码错误，或暂时无法登录，请检查后重试');
    } finally {
      setBusy(false);
    }

    if (!loginFailed) await beginSecondaryPasswordFlow();
  }

  function submit() {
    if (step === 'credentials') {
      void doLogin();
    } else if (step === 'pin_setup') {
      void setupPin();
    } else if (step === 'pin_verify') {
      void verifyPin();
    }
  }

  return (
    <div style={{ minHeight: '72vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="login-card" style={{ background: '#ffffff', color: '#202a35', border: '1px solid #e5e8ec', maxWidth: 380, width: '100%' }}>
        <h1 style={{ fontSize: 20 }}>管理后台</h1>
        <p className="sub">
          {step === 'credentials' ? '管理员登录'
            : step === 'pin_setup' ? '设置二级密码'
              : step === 'pin_verify' ? '二级密码验证' : '验证成功'}
        </p>

        {step === 'credentials' && <>
          {hasSession && <p className="priv-note">检测到已有登录会话。为确认是本人操作，请重新输入管理员账号和密码。</p>}
          <label htmlFor="admin-ident">管理员账号</label>
          <input id="admin-ident" value={ident} onChange={(event) => setIdent(event.target.value)} placeholder="QQ 邮箱 / 用户名"
            autoComplete="username" onKeyDown={(event) => event.key === 'Enter' && submit()} disabled={busy} />
          <label htmlFor="admin-password">密码</label>
          <PasswordField value={pw} onChange={setPw} placeholder="管理员密码" autoComplete="current-password"
            onKeyDown={(event) => event.key === 'Enter' && submit()} />
        </>}

        {step === 'pin_setup' && <div style={{ display: 'grid', gap: 12 }}>
          <p className="priv-note">首次登录需要为当前管理员账号设置个人专属的 6 位数字二级密码。以后每次进入后台都需要验证。</p>
          <label htmlFor="admin-pin">设置 6 位二级密码</label>
          <input id="admin-pin" type="password" value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="输入 6 位数字"
            onKeyDown={(event) => event.key === 'Enter' && submit()} />
          <label htmlFor="admin-pin-confirm">再次输入二级密码</label>
          <input id="admin-pin-confirm" type="password" value={pinConfirm}
            onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="再次输入 6 位数字"
            onKeyDown={(event) => event.key === 'Enter' && submit()} />
          <p className="priv-note">请勿使用生日、连续数字或 6 位相同数字。二级密码按账号分别保存，不会在前端或数据库明文存储。</p>
        </div>}

        {step === 'pin_verify' && <div style={{ display: 'grid', gap: 12 }}>
          <p className="priv-note">请输入当前管理员账号的 6 位数字二级密码。</p>
          <label htmlFor="admin-pin">二级密码</label>
          <input id="admin-pin" type="password" value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="输入 6 位数字"
            onKeyDown={(event) => event.key === 'Enter' && submit()} />
        </div>}

        {step === 'success' && <p className="priv-note" role="status">验证成功，正在安全进入后台…</p>}
        {err && <p className="err" role="alert">{err}</p>}
        {step !== 'success' && <button className="pri" disabled={busy} onClick={submit}>
          {busy ? '验证中…' : step === 'credentials' ? '验证账号密码并继续'
            : step === 'pin_setup' ? '设置二级密码并进入后台' : '验证二级密码并进入后台'}
        </button>}
        {showBack && step === 'credentials' && <p className="login-switch"><Link to="/home">← 返回站点</Link></p>}
      </div>
    </div>
  );
}
