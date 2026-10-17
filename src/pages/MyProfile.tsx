import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

const FIELDS = [['display_name', '名字', 'show_name'], ['age', '年龄', 'show_age'], ['personality', '性格', 'show_personality'],
  ['signature', '个性签名', 'show_signature'], ['bio', '个人简介', 'show_bio'], ['hobbies', '兴趣爱好', 'show_hobbies'],
  ['contact', '联系方式', 'show_contact'], ['social', '社交账号', 'show_social']] as const;
const THEMES = [['aurora', '极光'], ['sunset', '晚霞'], ['forest', '森林'], ['mono', '黑白'], ['stars', '星空'], ['ocean', '海洋']];
const LAYOUTS = [['left', '照片在左'], ['right', '照片在右'], ['center', '居中'], ['full', '全屏背景']];

export default function MyProfile() {
  const uid = useAuth().session!.user.id;
  const [v, setV] = useState<Record<string, string>>({}); const [priv, setPriv] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState('aurora'); const [layout, setLayout] = useState('left');
  const [joined, setJoined] = useState(true); const [avatar, setAvatar] = useState<string | null>(null);
  const [code, setCode] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState<Array<{ id: string; friendly_name?: string | null; created_at?: string }>>([]);
  const [role, setRole] = useState('');
  useEffect(() => { supabase.rpc('my_role').then(({ data }) => setRole(data ?? '')); }, []);
  async function logout() { await supabase.auth.signOut(); }

  useEffect(() => { (async () => {
    const [p, pr, c] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('profile_privacy').select('*').eq('profile_id', uid).single(),
      supabase.from('profile_contacts').select('*').eq('profile_id', uid).single()]);
    if (p.error || pr.error || c.error) return setMsg('资料加载失败，请刷新重试');
    const all: Record<string, any> = { ...p.data, ...c.data };
    setV(Object.fromEntries(FIELDS.map(([k]) => [k, all[k] == null ? '' : String(all[k])])));
    setPriv(pr.data); setJoined(p.data.joined); setAvatar(p.data.avatar_path);
    setTheme(p.data.theme?.theme ?? 'aurora'); setLayout(p.data.theme?.layout ?? 'left');
  })(); }, [uid]);

  const n = (s: string) => s.trim() === '' ? null : s.trim();
  async function save() {
    if (busy) return; setBusy(true); setMsg('');
    const age = n(v.age ?? ''); if (age && !(Number(age) >= 5 && Number(age) <= 120)) { setBusy(false); return setMsg('年龄需在 5–120 之间'); }
    const r = await Promise.all([
      supabase.from('profiles').update({ display_name: n(v.display_name), age: age ? Number(age) : null,
        personality: n(v.personality), signature: n(v.signature), bio: n(v.bio), hobbies: n(v.hobbies),
        theme: { theme, layout } }).eq('id', uid),
      supabase.from('profile_privacy').update(Object.fromEntries(Object.keys(priv).filter(k => k.startsWith('show_')).map(k => [k, !!priv[k]]))).eq('profile_id', uid),
      supabase.from('profile_contacts').update({ contact: n(v.contact), social: n(v.social) }).eq('profile_id', uid)]);
    setBusy(false); setMsg(r.some(x => x.error) ? '保存失败：' + r.find(x => x.error)!.error!.message : '已保存');
  }

  async function upload(f?: File) {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setMsg('仅支持 JPG / PNG / WebP');
    if (f.size > 2 * 1024 * 1024) return setMsg('图片不能超过 2MB');
    const path = `${uid}/${crypto.randomUUID()}.${f.type.split('/')[1]}`;
    const up = await supabase.storage.from('avatars').upload(path, f, { contentType: f.type });
    if (up.error) return setMsg('上传失败：' + up.error.message);
    const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
    if (error) return setMsg('保存失败：' + error.message);
    if (avatar) await supabase.storage.from('avatars').remove([avatar]);
    setAvatar(path); setMsg('照片已更新');
  }

  async function join() {
    const { data, error } = await supabase.rpc('join_class', { code: code.trim() });
    if (error) return setMsg('加入失败：' + error.message);
    if (data) { setJoined(true); setMsg('已加入班级'); } else setMsg('邀请码不正确');
  }

  async function loadKeys() {
    try {
      const { data, error } = await supabase.auth.passkey.list();
      if (!error && data) setKeys((data as unknown as { passkeys?: typeof keys }).passkeys ?? []);
    } catch { /* 忽略，旧版本客户端不支持时不展示 */ }
  }
  useEffect(() => { loadKeys(); }, []);

  async function regKey() {
    setMsg('');
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      setMsg('通行密钥已注册，下次登录可用指纹 / 面容 ID 一键登录');
      loadKeys();
    } catch (x) { setMsg('注册失败：' + (x as Error).message); }
  }

  async function delKey(id: string) {
    const { error } = await supabase.auth.passkey.delete({ id });
    setMsg(error ? '删除失败：' + error.message : '通行密钥已删除');
    loadKeys();
  }

  return (
    <div className="card">
      <h2>我的档案</h2>
      {!joined && <div><p>输入班级邀请码后，才能查看其他成员，也才会出现在成员页。</p>
        <input placeholder="邀请码" value={code} onChange={e => setCode(e.target.value)} />
        <button className="pri" onClick={join}>加入班级</button><hr /></div>}
      <label>个人照片（≤2MB）<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => upload(e.target.files?.[0])} /></label>
      {FIELDS.map(([k, label, flag]) => (
        <div key={k}>
          <label>{label}{k === 'bio' ? <textarea rows={4} maxLength={1000} value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} />
            : <input value={v[k] ?? ''} maxLength={100} onChange={e => setV({ ...v, [k]: e.target.value })} />}</label>
          <label className="row"><input type="checkbox" checked={!!priv[flag]} onChange={e => setPriv({ ...priv, [flag]: e.target.checked })} />对其他成员公开</label>
        </div>
      ))}
      <label className="row"><input type="checkbox" checked={!!priv.show_avatar} onChange={e => setPriv({ ...priv, show_avatar: e.target.checked })} />照片对其他成员公开</label>
      <label>主页主题<select value={theme} onChange={e => setTheme(e.target.value)}>{THEMES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label>照片位置<select value={layout} onChange={e => setLayout(e.target.value)}>{LAYOUTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {msg && <p>{msg}</p>}
      <button className="pri" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存'}</button>
      <hr />
      <h3>通行密钥登录</h3>
      <p style={{ fontSize: 13, opacity: 0.75 }}>注册后，下次登录可用指纹 / 面容 ID / 安全密钥一键登录，不用输密码。</p>
      <button onClick={regKey}>注册通行密钥</button>
      {keys.map(k => (
        <div key={k.id} className="row" style={{ justifyContent: 'space-between' }}>
          <span>{k.friendly_name || '通行密钥'} · {k.created_at?.slice(0, 10) ?? ''}</span>
          <button onClick={() => delKey(k.id)}>删除</button>
        </div>
      ))}
      <hr />
      <div className="row" style={{ gap: 8 }}>
        {(role === 'admin' || role === 'super_admin') &&
          <button className="ghost" onClick={() => { location.hash = '#/admin'; }}>⚙️ 管理后台</button>}
        <button className="ghost" onClick={logout}>退出登录</button>
      </div>
    </div>
  );
}
