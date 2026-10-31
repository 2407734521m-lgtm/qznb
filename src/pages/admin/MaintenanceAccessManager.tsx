import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';

export default function MaintenanceAccessManager({ setMsg }: { setMsg: (s: string) => void }) {
  const [minutes, setMinutes] = useState('15');
  const [maxUses, setMaxUses] = useState('1');
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true); setCode('');
    const { data, error } = await supabase.rpc('admin_create_maintenance_code', {
      p_valid_minutes: Number(minutes), p_max_uses: Number(maxUses),
    });
    setBusy(false);
    if (error || !data?.code) { setMsg('验证码生成失败：' + (error?.message || '请检查数据库迁移是否已执行')); return; }
    setCode(String(data.code));
    setExpiresAt(String(data.expires_at || ''));
    setMsg('临时通行码已生成。请及时复制并发送给需要进入的人。');
    await alog('maintenance_code_created', { valid_minutes: Number(minutes), max_uses: Number(maxUses) });
  }

  async function revoke() {
    if (!confirm('立即撤销当前所有临时通行码？已通过该码进入的访问会话也会失效。')) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_revoke_maintenance_codes');
    setBusy(false);
    if (error) { setMsg('撤销失败：' + error.message); return; }
    setCode(''); setExpiresAt('');
    setMsg(data?.ok ? '已立即撤销，相关临时访问会话也已失效。' : '当前没有有效通行码。');
    await alog('maintenance_codes_revoked', {});
  }

  return <div style={card}>
    <h3 style={h3}>六位数临时通行码</h3>
    <p style={{ ...mut, margin: '0 0 12px' }}>独立于管理员登录。仅绕过维护页面，不授予管理员权限；撤销后已进入的临时会话也会失效。</p>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      <label style={{ ...mut, display: 'flex', alignItems: 'center', gap: 6 }}>有效期
        <select value={minutes} onChange={e => setMinutes(e.target.value)} style={{ minWidth: 112 }}>
          <option value="5">5 分钟</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">1 小时</option><option value="360">6 小时</option><option value="1440">24 小时</option>
        </select>
      </label>
      <label style={{ ...mut, display: 'flex', alignItems: 'center', gap: 6 }}>可使用次数
        <select value={maxUses} onChange={e => setMaxUses(e.target.value)} style={{ minWidth: 100 }}>
          <option value="1">1 次</option><option value="3">3 次</option><option value="5">5 次</option><option value="10">10 次</option><option value="30">30 次</option><option value="100">100 次</option>
        </select>
      </label>
    </div>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <button className="pri" style={{ width: 'auto' }} disabled={busy} onClick={() => void generate()}>{busy ? '处理中…' : '生成六位数验证码'}</button>
      <button className="mini ghost" disabled={busy} onClick={() => void revoke()}>立即撤销</button>
    </div>
    {code && <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: '#ffffff0b', border: '1px solid #ffffff1c' }}>
      <div style={{ ...mut, marginBottom: 6 }}>新验证码（仅本次显示）</div>
      <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 30, letterSpacing: 8, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{code}</strong>
        <button className="mini" onClick={() => { void navigator.clipboard?.writeText(code).then(() => setMsg('验证码已复制。')).catch(() => setMsg('复制失败，请手动复制。')); }}>复制</button>
      </div>
      {expiresAt && <p style={{ ...mut, margin: '8px 0 0' }}>有效期至：{new Date(expiresAt).toLocaleString()}</p>}
    </div>}
  </div>;
}
