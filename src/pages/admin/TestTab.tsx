import { useState } from 'react';
import { useAuth } from '../../auth';
import { supabase } from '../../lib/supabase';
import { card, h3, mut } from './shared';
import { confirmDialog } from '../../lib/dialog';

type TA = { id: string; label: string; email: string };
function loadTAs(): TA[] {
  try {
    const stored = sessionStorage.getItem('ca_test_accounts') || localStorage.getItem('ca_test_accounts');
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    const safe: TA[] = Array.isArray(parsed) ? parsed
      .filter((item): item is { id: string; label?: string; email: string } =>
        !!item && typeof item.id === 'string' && typeof item.email === 'string')
      .map(item => ({
        id: item.id,
        label: typeof item.label === 'string' ? item.label : '',
        email: item.email.trim(),
      })) : [];
    // 立即覆盖旧数据，移除历史版本保存在浏览器里的明文密码。
    sessionStorage.setItem('ca_test_accounts', JSON.stringify(safe));
    localStorage.removeItem('ca_test_accounts');
    return safe;
  } catch {
    try {
      sessionStorage.removeItem('ca_test_accounts');
      localStorage.removeItem('ca_test_accounts');
    } catch {}
    return [];
  }
}
export default function TestTab({ setMsg }: { setMsg: (s: string) => void }) {
  const { session } = useAuth();
  const [tas, setTas] = useState<TA[]>(loadTAs);
  const [label, setLabel] = useState(''); const [email, setEmail] = useState('');
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  function save(list: TA[]) {
    setTas(list);
    try {
      sessionStorage.setItem('ca_test_accounts', JSON.stringify(list));
      localStorage.removeItem('ca_test_accounts');
    } catch {}
  }
  async function switchTo(a: TA) {
    const password = switchPassword;
    if (!password) return setMsg('请输入测试账号密码。');
    if (!(await confirmDialog(`切换登录到 ${a.label || a.email}？`))) {
      setSwitchPassword('');
      setSwitchingId(null);
      return;
    }
    if (!session?.user.email) {
      setSwitchPassword('');
      return setMsg('无法读取当前账号邮箱，请先重新登录。');
    }
    try {
      sessionStorage.setItem('ca_testing_from', session.user.email);
      sessionStorage.setItem('ca_testing_as', a.label || a.email);
    } catch {
      setSwitchPassword('');
      return setMsg('浏览器无法保存本次切换状态，请检查存储权限。');
    }
    setSwitchPassword('');
    setSwitchingId(null);
    const { error } = await supabase.auth.signInWithPassword({ email: a.email, password });
    if (error) {
      try {
        sessionStorage.removeItem('ca_testing_as');
        sessionStorage.removeItem('ca_testing_from');
      } catch {}
      setMsg('切换失败，请检查测试账号和密码。');
    } else {
      location.reload();
    }
  }
  return (
    <div style={card}>
      <h3 style={h3}>测试工具</h3>
      <p style={mut}>测试账号列表只保存备注名和邮箱；每次切换时临时输入密码，不会把密码写入浏览器存储。切出去后右下角有"结束测试"入口。</p>
      {tas.map(a => (
        <div key={a.id} className="row" style={{ alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{a.label || a.email}</div>
            <div style={mut}>{a.email}</div>
          </div>
          {switchingId === a.id ? (
            <>
              <input type="password" value={switchPassword} onChange={e => setSwitchPassword(e.target.value)}
                placeholder="输入密码" autoComplete="current-password" style={{ width: 110, minWidth: 0 }} />
              <button className="mini" onClick={() => void switchTo(a)}>确认</button>
              <button className="mini ghost" onClick={() => { setSwitchPassword(''); setSwitchingId(null); }}>取消</button>
            </>
          ) : <button className="mini" onClick={() => { setSwitchingId(a.id); setSwitchPassword(''); }}>切换登录</button>}
          <button className="mini danger" onClick={() => { save(tas.filter(x => x.id !== a.id)); if (switchingId === a.id) { setSwitchPassword(''); setSwitchingId(null); } }}>删除</button>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input placeholder="备注名（选填）" value={label} onChange={e => setLabel(e.target.value)} style={{ flex: '1 1 90px', minWidth: 0 }} />
        <input placeholder="QQ 邮箱" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" style={{ flex: '1 1 140px', minWidth: 0 }} />
        <button className="mini" onClick={() => {
          if (!email.trim()) return setMsg('请填写测试账号邮箱');
          save([...tas, { id: String(Date.now()), label: label.trim(), email: email.trim() }]);
          setLabel(''); setEmail(''); setMsg('已保存测试账号资料；密码会在切换时临时输入。');
        }}>保存账号</button>
      </div>
    </div>
  );
}

/* ---------------- 活动管理 ---------------- */
