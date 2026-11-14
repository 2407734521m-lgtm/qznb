import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import SettingsShell from '../components/SettingsShell';
import { RowSkeleton, useDelayedLoading } from '../components/fx/Skeleton';

type PasskeyItem = { id: string; friendly_name?: string | null; created_at?: string };

/** 通行密钥：独立子页（原在编辑资料页的折叠栏里，2026-11-07 从设置页拆出） */
export default function MePasskey() {
  const [keys, setKeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedLoading(loading);
  const [msg, setMsg] = useState('');

  async function loadKeys() {
    try {
      const { data, error } = await supabase.auth.passkey.list();
      if (!error && data) setKeys((data as unknown as { passkeys?: PasskeyItem[] }).passkeys ?? []);
    } catch { /* 忽略，旧版本客户端不支持时不展示 */ }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadKeys(); }, []);

  async function regKey() {
    setMsg('');
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      setMsg('通行密钥已注册，下次登录可用指纹 / 面容 ID 一键登录');
      void loadKeys();
    } catch (x) { setMsg('注册失败：' + (x as Error).message); }
  }

  async function delKey(id: string) {
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
    setMsg(error ? '删除失败：' + error.message : '通行密钥已删除');
    void loadKeys();
  }

  return (
    <SettingsShell title="通行密钥">
      <p>注册后，下次登录可用指纹 / 面容 ID 一键登录，不用输密码。</p>
      <div className="qz-settings-choice">
        <button type="button" onClick={() => void regKey()}>注册通行密钥</button>
      </div>
      {showSkeleton && <RowSkeleton count={2} />}
      {keys.map(k => (
        <div key={k.id} className="qz-sub-key-row">
          <span>{k.friendly_name || '通行密钥'} · {k.created_at?.slice(0, 10) ?? ''}</span>
          <button type="button" onClick={() => void delKey(k.id)}>删除</button>
        </div>
      ))}
      {msg && <p role="status">{msg}</p>}
    </SettingsShell>
  );
}
