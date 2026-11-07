import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { withRetry } from '../lib/retry';
import SettingsShell from '../components/SettingsShell';

// 与编辑资料页隐私折叠栏同一批开关、同一张 profile_privacy 表（2026-11-07 从设置页拆成独立子页）。
const ROWS: [string, string][] = [
  ['show_avatar', '个人照片'], ['show_name', '名字'], ['show_age', '年龄'],
  ['show_personality', '性格'], ['show_signature', '个性签名'], ['show_bio', '个人简介'],
  ['show_hobbies', '兴趣爱好'], ['show_contact', '联系方式'], ['show_social', '社交平台'],
];
const ALL_FLAGS = [...ROWS.map(([f]) => f), 'show_game_id', 'hide_love_wall_name'];

export default function MePrivacy() {
  const uid = useAuth().session!.user.id;
  const [priv, setPriv] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const privRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    supabase.from('profile_privacy').select('*').eq('profile_id', uid).single().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) { setStatus('隐私设置加载失败，请刷新重试'); return; }
      const next: Record<string, boolean> = {};
      for (const f of ALL_FLAGS) next[f] = !!(data as Record<string, unknown>)[f];
      // 与编辑资料页一致：表白墙隐藏姓名缺省视为开启
      next.hide_love_wall_name = (data as Record<string, unknown>).hide_love_wall_name !== false;
      privRef.current = next; setPriv(next); setLoaded(true);
    });
    return () => { active = false; };
  }, [uid]);

  async function toggle(flag: string) {
    if (!loaded) return;
    const next = { ...privRef.current, [flag]: !privRef.current[flag] };
    privRef.current = next; setPriv(next);
    setStatus('保存中…');
    const payload = {
      show_avatar: !!next.show_avatar, show_name: !!next.show_name, show_age: !!next.show_age,
      show_personality: !!next.show_personality, show_signature: !!next.show_signature,
      show_bio: !!next.show_bio, show_hobbies: !!next.show_hobbies,
      show_contact: !!next.show_contact, show_social: !!next.show_social,
      show_game_id: !!next.show_game_id, hide_love_wall_name: !!next.hide_love_wall_name,
    };
    const { error } = await withRetry(() => supabase.from('profile_privacy').update(payload).eq('profile_id', uid));
    setStatus(error ? '保存失败：' + error.message : '已保存');
  }

  const openCount = ROWS.filter(([f]) => priv[f]).length;

  return (
    <SettingsShell title="隐私设置">
      <p>哪些资料对其他成员公开，点一下开关就行{loaded ? `（${openCount}/${ROWS.length} 项公开）` : ''}</p>
      {ROWS.map(([flag, label]) => (
        <label key={flag} className="qz-sub-row"><span>{label}</span>
          <input type="checkbox" disabled={!loaded} checked={!!priv[flag]} onChange={() => void toggle(flag)} />
        </label>
      ))}
      <div className="qz-settings-subsection">
        <p>表白墙：开启后，新发布的表白默认匿名；关闭后，新帖子显示你的昵称。只影响新帖子，老帖子保持原样。</p>
        <label className="qz-sub-row"><span>表白墙隐藏姓名</span>
          <input type="checkbox" disabled={!loaded} checked={priv.hide_love_wall_name !== false} onChange={() => void toggle('hide_love_wall_name')} />
        </label>
      </div>
      {status && <p role="status">{status}</p>}
    </SettingsShell>
  );
}
