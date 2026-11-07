import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { supabase } from '../lib/supabase';
import { alertDialog } from '../lib/dialog';
import { getTestingMark, clearTestingMark } from '../lib/testSwitch';

// 测试账号快切：从管理后台一键切换登录后，各页面右下角悬浮「结束测试」。
// 挂在 main.tsx 的根上，主站与管理后台两个域名都会渲染；标记走父域 Cookie，
// 两边都读得到（见 lib/testSwitch.ts）。
export default function TestSwitchFab() {
  const { session } = useAuth();
  const [testingAs, setTestingAs] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTestingAs(getTestingMark()); }, [session]);
  if (!session || !testingAs) return null;
  async function back() {
    if (busy) return;
    setBusy(true);
    clearTestingMark();
    setTestingAs(null);
    const { error } = await supabase.auth.signOut();
    if (error) alertDialog('退出测试账号失败，请重试。');
    else alertDialog('测试账号已退出。为保护账号安全，请重新登录原账号。');
    setBusy(false);
  }
  return (
    <button onClick={back} disabled={busy}
      style={{
        position: 'fixed', right: 14, bottom: 92, zIndex: 200, padding: '10px 15px', borderRadius: 999,
        border: '1px solid #ffffff2e', color: '#202124', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        background: 'color-mix(in srgb, #1a1e30 72%, transparent)', backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 24px #000a', opacity: busy ? 0.6 : 1,
      }}>⇄ {busy ? '切换中…' : '结束测试'}</button>
  );
}
