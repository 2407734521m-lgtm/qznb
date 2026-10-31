import { useState } from 'react';
import { useAuth } from '../../auth';
import { supabase } from '../../lib/supabase';
import { card, h3, mut } from './shared';

type TA = { id: string; label: string; email: string; password: string };
function loadTAs(): TA[] {
  try {
    const current = sessionStorage.getItem('ca_test_accounts');
    const legacy = localStorage.getItem('ca_test_accounts');
    if (current) {
      if (legacy) localStorage.removeItem('ca_test_accounts');
      return JSON.parse(current);
    }
    if (!legacy) return [];
    const parsed = JSON.parse(legacy);
    sessionStorage.setItem('ca_test_accounts', JSON.stringify(parsed));
    localStorage.removeItem('ca_test_accounts');
    return parsed;
  } catch { return []; }
}
export default function TestTab({ setMsg }: { setMsg: (s: string) => void }) {
  const { session } = useAuth();
  const [tas, setTas] = useState<TA[]>(loadTAs);
  const [label, setLabel] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  function save(list: TA[]) {
    setTas(list);
    try {
      sessionStorage.setItem('ca_test_accounts', JSON.stringify(list));
      localStorage.removeItem('ca_test_accounts');
    } catch {}
  }
  async function switchTo(a: TA) {
    if (!confirm(`切换登录到 ${a.label || a.email}？`)) return;
    if (!session?.user.email) return setMsg('无法读取当前账号邮箱，请先重新登录。');
    try {
      sessionStorage.setItem('ca_testing_from', session.user.email);
      sessionStorage.setItem('ca_testing_as', a.label || a.email);
    } catch {
      return setMsg('浏览器无法保存本次切换状态，请检查存储权限。');
    }
    const { error } = await supabase.auth.signInWithPassword({ email: a.email, password: a.password });
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
      <p style={mut}>测试账号快切：密码只存这台手机浏览器里。切出去后右下角有"结束测试"一键切回。</p>
      {tas.map(a => (
        <div key={a.id} className="row" style={{ alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #ffffff0c' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{a.label || a.email}</div>
            <div style={mut}>{a.email}</div>
          </div>
          <button className="mini" onClick={() => switchTo(a)}>切换登录</button>
          <button className="mini danger" onClick={() => save(tas.filter(x => x.id !== a.id))}>删除</button>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <input placeholder="备注名（选填）" value={label} onChange={e => setLabel(e.target.value)} style={{ flex: '1 1 90px', minWidth: 0 }} />
        <input placeholder="QQ 邮箱" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" style={{ flex: '1 1 110px', minWidth: 0 }} />
        <input type="password" placeholder="密码" value={pw} onChange={e => setPw(e.target.value)} style={{ flex: '1 1 90px', minWidth: 0 }} />
        <button className="mini" onClick={() => {
          if (!email.trim() || !pw) return setMsg('邮箱和密码都要填');
          save([...tas, { id: String(Date.now()), label: label.trim(), email: email.trim(), password: pw }]);
          setLabel(''); setEmail(''); setPw(''); setMsg('已保存');
        }}>保存账号</button>
      </div>
    </div>
  );
}

/* ---------------- 活动管理 ---------------- */
