import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { card, h3, mut, timeAgo } from '../pages/admin/shared';
import { confirmDialog } from '../lib/dialog';

type SecurityData = {
  generated_at?: string;
  login?: {
    active_identifiers_24h?: number;
    attempts_24h?: number;
    currently_rate_limited?: number;
    latest_window_at?: string | null;
    auth_failures_24h?: number;
    email_failures_24h?: number;
    username_failures_24h?: number;
    failure_latest_at?: string | null;
  };
  recent_admin_actions?: Array<{
    id: number;
    action: string;
    created_at: string;
    actor_name: string;
    high_risk: boolean;
  }>;
};

function deviceName() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android 设备';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'Apple 移动设备';
  if (/Windows/i.test(ua)) return 'Windows 设备';
  if (/Macintosh/i.test(ua)) return 'Mac 设备';
  return '当前浏览器设备';
}

function Metric({ label, value, hint, warn = false }: { label: string; value: string | number; hint: string; warn?: boolean }) {
  return <div style={{ ...card, margin: 0, minWidth: 0 }}>
    <div style={mut}>{label}</div>
    <div style={{ fontSize: 25, fontWeight: 800, color: warn ? '#ff9a9a' : '#eaf0ff', margin: '7px 0 4px' }}>{value}</div>
    <div style={mut}>{hint}</div>
  </div>;
}

export default function AdminSecurityCenter({ session, setMsg }: { session: Session; setMsg: (s: string) => void }) {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: result, error: rpcError } = await supabase.rpc('admin_security_overview');
    if (rpcError) setError(rpcError.message);
    else setData(result as SecurityData);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const expiresAt = useMemo(() => session.expires_at ? new Date(session.expires_at * 1000) : null, [session.expires_at]);
  const expiryLabel = expiresAt
    ? (expiresAt.getTime() > Date.now() ? '预计 ' : '已于 ') + expiresAt.toLocaleString()
    : '由 Supabase 自动刷新管理';

  async function signOutCurrentDevice() {
    if (!(await confirmDialog('确定退出当前设备的管理员登录？其他设备的会话不会受到影响。', { danger: true }))) return;
    setSigningOut(true);
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
    setSigningOut(false);
    if (signOutError) setMsg('退出当前设备失败：' + signOutError.message);
    else setMsg('当前设备已退出登录。');
  }

  async function signOutOtherDevices() {
    if (!(await confirmDialog('确定退出此账号在其他设备和浏览器上的所有登录？当前设备会保持登录。', { danger: true }))) return;
    setSigningOutOthers(true);
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
    setSigningOutOthers(false);
    if (signOutError) setMsg('退出其他设备失败：' + signOutError.message);
    else setMsg('已请求退出此账号的其他设备；当前设备保持登录。');
  }

  const login = data?.login ?? {};
  const actions = data?.recent_admin_actions ?? [];

  return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ ...card, background: 'linear-gradient(135deg,#17213b,#11182a)' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>安全防护中心</div>
          <div style={mut}>仅超级管理员可读取；登录异常只展示聚合数据，不暴露账号标识。</div>
        </div>
        <button className="mini" onClick={() => void load()} disabled={loading}>{loading ? '刷新中…' : '刷新数据'}</button>
      </div>
      {error && <p style={{ color: '#ffaaaa', fontSize: 12.5, marginBottom: 0 }}>读取失败：{error}</p>}
      {data?.generated_at && <div style={{ ...mut, marginTop: 9 }}>数据更新时间：{new Date(data.generated_at).toLocaleString()}</div>}
    </div>

    <section>
      <h3 style={h3}>登录异常监控</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 9 }}>
        <Metric label="24 小时识别对象" value={login.active_identifiers_24h ?? '—'} hint="按匿名哈希聚合，不显示身份" />
        <Metric label="24 小时累计尝试" value={login.attempts_24h ?? '—'} hint="用户名登录限流记录" />
        <Metric label="24 小时登录失败" value={login.auth_failures_24h ?? '—'} hint="网站端匿名聚合计数" warn={(login.auth_failures_24h ?? 0) > 0} />
        <Metric label="邮箱登录失败" value={login.email_failures_24h ?? '—'} hint="仅统计网站登录表单" />
        <Metric label="用户名登录失败" value={login.username_failures_24h ?? '—'} hint="仅统计网站登录表单" />
        <Metric label="当前限流对象" value={login.currently_rate_limited ?? '—'} hint="15 分钟窗口内超过 8 次" warn={(login.currently_rate_limited ?? 0) > 0} />
      </div>
      <p style={mut}>失败计数仅记录登录方式、固定失败类别和分钟时间桶，不保存邮箱、用户名、密码、验证码、IP 或设备标识。它统计网站登录表单捕获的失败，不等于 Supabase 全平台认证日志；客户端未能上报的失败不会计入。</p>
    </section>

    <section style={card}>
      <h3 style={h3}>当前管理员会话</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}><span style={mut}>设备</span><strong>{deviceName()}</strong></div>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}><span style={mut}>登录时间</span><strong>{session.user.last_sign_in_at ? new Date(session.user.last_sign_in_at).toLocaleString() : '当前会话'}</strong></div>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}><span style={mut}>会话有效期</span><strong style={{ textAlign: 'right', fontSize: 12 }}>{expiryLabel}</strong></div>
        <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}><span style={mut}>用户 ID</span><code style={{ fontSize: 11 }}>{session.user.id.slice(0, 8)}…</code></div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="mini danger" disabled={signingOut} onClick={() => void signOutCurrentDevice()}>
          {signingOut ? '正在退出…' : '退出当前设备'}
        </button>
        <button className="mini" disabled={signingOutOthers} onClick={() => void signOutOtherDevices()}>
          {signingOutOthers ? '正在处理…' : '退出其他设备'}
        </button>
      </div>
      <p style={{ ...mut, marginBottom: 0 }}>「退出其他设备」仅作用于当前登录的管理员账号，并保留本设备。它不是撤销其他管理员账号的会话；被撤销会话的 Access Token 仍可能在过期前短暂有效。</p>
    </section>

    <section style={card}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={h3}>管理员操作审计</h3>
        <span style={mut}>最近 {actions.length} 条</span>
      </div>
      {actions.length === 0 ? <p style={mut}>暂无审计记录。</p> : <div style={{ display: 'grid', gap: 8 }}>
        {actions.map(item => <div key={item.id} style={{ borderTop: '1px solid #ffffff12', paddingTop: 9 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <strong style={{ fontSize: 13, overflowWrap: 'anywhere' }}>{item.action}</strong>
            {item.high_risk && <span style={{ color: '#ffb18a', fontSize: 11, flexShrink: 0 }}>高风险操作</span>}
          </div>
          <div style={mut}>{item.actor_name} · {timeAgo(item.created_at)} · {new Date(item.created_at).toLocaleString()}</div>
        </div>)}
      </div>}
      <p style={{ ...mut, marginBottom: 0 }}>审计列表仅展示操作类型、操作者和时间，不返回原始 detail，避免泄露操作对象或个人信息。</p>
    </section>
  </div>;
}
