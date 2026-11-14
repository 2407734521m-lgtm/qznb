import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { alog, card, h3, mut } from '../pages/admin/shared';

type RecoveryStatus = { total: number; remaining: number };

function authMethodNames(methods: Array<string | { method: string }> | undefined) {
  return (methods ?? []).map((entry) => typeof entry === 'string' ? entry : entry.method);
}

function recoveryErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
}

function formatCode(code: string) {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

export default function AdminMfaSecurity() {
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<'generate' | 'rotate' | null>(null);
  const [stepUpCode, setStepUpCode] = useState('');
  const [recoveryCodesEnabled, setRecoveryCodesEnabled] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: statusError } = await supabase.auth.mfa.recoveryCodes.getStatus();
      if (statusError) {
        const code = recoveryErrorCode(statusError);
        if (code === 'mfa_factor_not_found') {
          setRecoveryCodesEnabled(true);
          setStatus(null);
          return;
        }
        if (code === 'mfa_recovery_codes_enroll_not_enabled' || code === 'mfa_recovery_codes_verify_not_enabled') {
          setRecoveryCodesEnabled(false);
          setError('当前 Supabase Auth 项目尚未启用 Recovery Codes 服务端功能；请先在测试项目确认支持状态。');
          return;
        }
        setRecoveryCodesEnabled(false);
        setError('暂时无法读取恢复码状态，请稍后重试。');
        return;
      }
      setRecoveryCodesEnabled(true);
      setStatus({ total: data.total, remaining: data.remaining });
    } catch {
      setRecoveryCodesEnabled(false);
      setError('暂时无法读取恢复码状态，请检查网络后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  function requestGenerate() {
    setError('');
    setNotice('');
    setStepUpCode('');
    setPendingAction('generate');
  }

  function requestRotate() {
    if (!window.confirm('轮换后，原来所有尚未使用的恢复码会立即失效。请确认你可以马上保存新的一组。')) return;
    setError('');
    setNotice('');
    setStepUpCode('');
    setPendingAction('rotate');
  }

  async function verifyTotpAndRunAction() {
    const cleanCode = stepUpCode.replace(/\s/g, '');
    if (!/^\d{6}$/.test(cleanCode) || !pendingAction) {
      setError('请输入身份验证器当前显示的 6 位验证码。');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const factor = factors.totp.find((item) => item.status === 'verified');
      if (!factor) throw new Error('totp_factor_missing');

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: cleanCode,
      });
      if (verifyError) throw verifyError;

      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const methods = authMethodNames(aal?.currentAuthenticationMethods);
      if (aalError || aal?.currentLevel !== 'aal2' || !methods.includes('totp')) {
        throw new Error('totp_step_up_failed');
      }

      if (pendingAction === 'generate') {
        const { data, error: generateError } = await supabase.auth.mfa.recoveryCodes.generate({
          friendlyName: '管理员备用恢复码',
        });
        if (generateError) throw generateError;
        setCodes(data.codes);
        setStatus({ total: data.total, remaining: data.total });
        void alog('admin_recovery_codes_generated', { count: data.total });
      } else {
        const { data, error: regenerateError } = await supabase.auth.mfa.recoveryCodes.regenerate();
        if (regenerateError) throw regenerateError;
        setCodes(data.codes);
        setStatus({ total: data.total, remaining: data.total });
        void alog('admin_recovery_codes_rotated', { count: data.total });
      }
      setPendingAction(null);
      setStepUpCode('');
    } catch {
      setStepUpCode('');
      setError('TOTP 验证或恢复码操作失败。请确认验证码有效、服务端功能可用，然后重新验证。');
    } finally {
      setBusy(false);
    }
  }

  function cancelStepUp() {
    setPendingAction(null);
    setStepUpCode('');
    setError('');
  }

  function acknowledgeSaved() {
    setCodes(null);
    setNotice('恢复码明文已从当前页面状态清除；之后无法再次查看，只能轮换生成新的一组。');
    void loadStatus();
  }

  return <div style={{ display: 'grid', gap: 12 }}>
    <section style={{ ...card, margin: 0 }}>
      <h3 style={h3}>管理员备用恢复码</h3>
      <p style={mut}>
        恢复码用于无法使用当前 TOTP 时恢复验证器。每个码只能使用一次；使用后仍须绑定并验证新的 TOTP，完成前不会开放后台权限。
      </p>
      {status
        ? <p style={{ ...mut, fontWeight: 700 }}>当前剩余 {status.remaining} / {status.total} 个未使用恢复码。</p>
        : <p style={mut}>尚未生成恢复码，或 Supabase Auth 暂无可读取的恢复码集合。</p>}
      {error && <p role="alert" style={{ color: '#b42336', fontSize: 13 }}>{error}</p>}
      {notice && <p role="status" style={{ color: '#166534', fontSize: 13 }}>{notice}</p>}

      {pendingAction && !codes && <div style={{ margin: '14px 0', padding: 14, border: '1px solid #d7dee9', borderRadius: 12, display: 'grid', gap: 8 }}>
        <p style={{ ...mut, margin: 0 }}>为{pendingAction === 'generate' ? '生成' : '轮换'}恢复码，请重新输入身份验证器当前的 6 位验证码。</p>
        <label htmlFor="admin-mfa-step-up" style={{ fontSize: 13, fontWeight: 700 }}>TOTP 验证码</label>
        <input id="admin-mfa-step-up" value={stepUpCode}
          onChange={(event) => setStepUpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
          onKeyDown={(event) => event.key === 'Enter' && void verifyTotpAndRunAction()} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="mini" disabled={busy || stepUpCode.length !== 6} onClick={() => void verifyTotpAndRunAction()}>
            {busy ? '验证中…' : pendingAction === 'generate' ? '验证并生成恢复码' : '验证并轮换恢复码'}
          </button>
          <button type="button" className="mini" disabled={busy} onClick={cancelStepUp}>取消</button>
        </div>
      </div>}

      {codes && <div style={{ margin: '14px 0', padding: 14, border: '1px solid #f0bd55', borderRadius: 12, background: '#fffaf0' }}>
        <p style={{ color: '#7c4a03', fontWeight: 700, marginTop: 0 }}>
          这组明文只显示这一次。请现在保存到安全的密码管理器或离线位置；不要截图、转发或保存到共享云盘。
        </p>
        <div role="list" aria-label="备用恢复码" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          {codes.map((code) => <code role="listitem" key={code} style={{ padding: 9, borderRadius: 8, background: '#fff', border: '1px solid #ead8b5', userSelect: 'all', overflowWrap: 'anywhere' }}>
            {formatCode(code)}
          </code>)}
        </div>
        <button type="button" className="mini danger" style={{ marginTop: 12 }} onClick={acknowledgeSaved}>
          我已安全保存，清除页面显示
        </button>
      </div>}

      {!codes && !pendingAction && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {!status
          ? <button type="button" className="mini" disabled={busy || loading || !recoveryCodesEnabled} onClick={requestGenerate}>
              {loading ? '处理中…' : '生成备用恢复码'}
            </button>
          : <button type="button" className="mini danger" disabled={busy || loading} onClick={requestRotate}>
              {loading ? '处理中…' : '轮换全部恢复码'}
            </button>}
        <button type="button" className="mini" disabled={busy || loading} onClick={() => void loadStatus()}>
          {loading ? '读取中…' : '刷新剩余数量'}
        </button>
      </div>}
    </section>
    <p style={{ ...mut, margin: 0 }}>
      每次生成或轮换都要求重新完成 TOTP challenge。Recovery Codes 是 Supabase experimental 功能；如果项目服务端未开放，需先在 staging 验证，不要改成客户端自造或存储恢复码。
    </p>
  </div>;
}
