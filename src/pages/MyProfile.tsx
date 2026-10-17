import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';
import { useAuth } from '../auth';
import AvatarCropper from '../components/AvatarCropper';
import FeedbackModal from '../components/FeedbackModal';
import WelcomeOverlay from '../components/WelcomeOverlay';

const PROFILE_FIELDS = [['display_name', '名字', 'show_name'], ['age', '年龄', 'show_age'],
  ['personality', '性格', 'show_personality'], ['signature', '个性签名', 'show_signature'],
  ['bio', '个人简介', 'show_bio'], ['hobbies', '兴趣爱好', 'show_hobbies']] as const;
const CONTACT_FIELDS = [
  ['game_id', '游戏账号 / ID', 'show_game_id', '如：原神 UID、王者荣耀 ID…'],
  ['contact', '联系方式', 'show_contact', '手机号 / QQ…'],
  ['social', '社交平台', 'show_social', '微信 / 微博 / B站…'],
] as const;
const ALL_FIELDS = [...PROFILE_FIELDS, ...CONTACT_FIELDS];
const THEMES = [['aurora', '极光', '#7c9cff', '#c27cff'], ['sunset', '晚霞', '#ff8a5c', '#ff5c93'],
  ['forest', '森林', '#4ade80', '#14b8a6'], ['mono', '黑白', '#e8e8e8', '#777777'],
  ['stars', '星空', '#818cf8', '#38bdf8'], ['ocean', '海洋', '#22d3ee', '#3b82f6']];
const LAYOUTS = [['left', '照片在左'], ['right', '照片在右'], ['center', '居中']];
const PRIV_ICONS: Record<string, string> = { show_avatar: '🖼️', show_name: '📝', show_age: '🎂', show_personality: '✨', show_signature: '💬', show_bio: '📖', show_hobbies: '🎯', show_game_id: '🎮', show_contact: '📞', show_social: '🌐' };

export default function MyProfile() {
  const uid = useAuth().session!.user.id;
  const [v, setV] = useState<Record<string, string>>({}); const [priv, setPriv] = useState<Record<string, boolean>>({});
  const [uname, setUname] = useState('');
  const [theme, setTheme] = useState('aurora'); const [layout, setLayout] = useState('right');
  const [joined, setJoined] = useState(true); const [avatar, setAvatar] = useState<string | null>(null);
  const [code, setCode] = useState(''); const [msg, setMsg] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [fbOpen, setFbOpen] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const loadedRef = useRef(false); const savingRef = useRef(false); const pendingRef = useRef(false);
  const [keys, setKeys] = useState<Array<{ id: string; friendly_name?: string | null; created_at?: string }>>([]);
  const [role, setRole] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarUrl = useSignedUrl('avatars', avatar);

  useEffect(() => { supabase.rpc('my_role').then(({ data }) => setRole(data ?? '')); }, []);
  async function logout() { await supabase.auth.signOut(); }

  useEffect(() => { (async () => {
    const [p, pr, c] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('profile_privacy').select('*').eq('profile_id', uid).single(),
      supabase.from('profile_contacts').select('*').eq('profile_id', uid).single()]);
    if (p.error || pr.error || c.error) return setMsg('资料加载失败，请刷新重试');
    const all: Record<string, any> = { ...p.data, ...c.data };
    setV(Object.fromEntries(ALL_FIELDS.map(([k]) => [k, all[k] == null ? '' : String(all[k])])));
    setPriv(pr.data); setJoined(p.data.joined); setAvatar(p.data.avatar_path); setUname(p.data.username ?? '');
    setTheme(p.data.theme?.theme ?? 'aurora'); setLayout(p.data.theme?.layout ?? 'left');
    loadedRef.current = true;
  })(); }, [uid]);

  const n = (s: string) => s.trim() === '' ? null : s.trim();

  // 自动保存：改动后 1 秒自动存，不用点保存按钮
  async function doSave() {
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true; setSaveState('saving');
    const age = n(v.age ?? '');
    if (age && !(Number(age) >= 5 && Number(age) <= 120)) {
      savingRef.current = false; setSaveState('idle'); setMsg('年龄需在 5–120 之间'); return;
    }
    const r = await Promise.all([
      supabase.from('profiles').update({ display_name: n(v.display_name), age: age ? Number(age) : null,
        personality: n(v.personality), signature: n(v.signature), bio: n(v.bio), hobbies: n(v.hobbies),
        theme: { theme, layout } }).eq('id', uid),
      supabase.from('profile_privacy').update(Object.fromEntries(Object.keys(priv).filter(k => k.startsWith('show_')).map(k => [k, !!priv[k]]))).eq('profile_id', uid),
      supabase.from('profile_contacts').update({ game_id: n(v.game_id), contact: n(v.contact), social: n(v.social) }).eq('profile_id', uid)]);
    savingRef.current = false;
    const err = r.find(x => x.error);
    if (err) { setSaveState('error'); setMsg('保存失败：' + err.error!.message); }
    else { setMsg(''); setSaveState('saved'); }
    if (pendingRef.current) { pendingRef.current = false; doSave(); }
  }
  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(() => { doSave(); }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, priv, theme, layout]);

  function pickAvatar(f?: File) {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setMsg('仅支持 JPG / PNG / WebP');
    if (f.size > 2 * 1024 * 1024) return setMsg('图片不能超过 2MB');
    setMsg('');
    setCropSrc(URL.createObjectURL(f));
  }
  function closeCrop() { if (cropSrc) URL.revokeObjectURL(cropSrc); setCropSrc(null); }

  async function uploadCropped(blob: Blob) {
    closeCrop(); setMsg('头像上传中…');
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) return setMsg('上传失败：' + up.error.message);
    const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
    if (error) return setMsg('保存失败：' + error.message);
    if (avatar) await supabase.storage.from('avatars').remove([avatar]);
    setAvatar(path); setMsg('照片已更新 ✓');
  }

  async function join() {
    const { data, error } = await supabase.rpc('join_class', { code: code.trim() });
    if (error) return setMsg('加入失败：' + error.message);
    if (data) {
      setJoined(true); setMsg('已加入班级 ✓');
      // 邀请码欢迎动画：xxx — Welcome to Class 13!
      supabase.rpc('invite_nickname').then(({ data: nick }) => {
        setWelcome(typeof nick === 'string' ? nick : '');
      });
    } else setMsg('邀请码不正确');
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

  const fieldInput = (k: string, label: string, ph?: string) => (
    <label key={k}>{label}{k === 'bio'
      ? <textarea rows={3} maxLength={1000} placeholder={ph} value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} />
      : <input value={v[k] ?? ''} maxLength={100} placeholder={ph} onChange={e => setV({ ...v, [k]: e.target.value })} />}</label>
  );

  return (
    <div className="page me-page">
      {/* 头部：头像 + 名字 */}
      <div className="card me-head">
        <div className="me-ava" onClick={() => fileRef.current?.click()} title="点击更换照片">
          {avatarUrl ? <img src={avatarUrl} alt="我的照片" /> : <span>{(v.display_name || uname || '?').slice(0, 1)}</span>}
          <span className="me-ava-edit">📷</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{v.display_name || uname || '…'}</h2>
          <p className="mut" style={{ margin: '2px 0 0', fontSize: 12.5 }}>@{uname}</p>
        </div>
        <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp"
          onChange={e => { pickAvatar(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      {!joined && <div className="card"><h3 className="me-sec-t">🎟️ 加入班级</h3>
        <p className="mut" style={{ fontSize: 13 }}>输入班级邀请码后，才能查看其他成员，也才会出现在成员页。</p>
        <div className="row" style={{ gap: 8 }}>
          <input placeholder="邀请码" value={code} onChange={e => setCode(e.target.value)} style={{ flex: 1 }} />
          <button className="pri" style={{ width: 'auto', padding: '10px 26px' }} onClick={join}>加入</button>
        </div></div>}

      <div className="card">
        <h3 className="me-sec-t">📝 基本资料</h3>
        {PROFILE_FIELDS.map(([k, label]) => fieldInput(k, label))}
      </div>

      <div className="card">
        <h3 className="me-sec-t">🎮 游戏与社交</h3>
        {CONTACT_FIELDS.map(([k, label, , ph]) => fieldInput(k, label, ph))}
      </div>

      <div className="card">
        <h3 className="me-sec-t">🔒 隐私设置</h3>
        <p className="priv-note">哪些资料对其他成员公开，点一下开关就行</p>
        <div className="priv-list">
          {[['show_avatar', '个人照片'], ...ALL_FIELDS.map(([, label, flag]) => [flag, label] as const)].map(([flag, label]) => (
            <button key={flag} type="button" className={'priv-btn' + (priv[flag] ? ' on' : '')}
              onClick={() => setPriv({ ...priv, [flag]: !priv[flag] })}>
              <span>{PRIV_ICONS[flag] ?? '🔹'} {label}</span>
              <span className="sw"><span className="knob" /></span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="me-sec-t">🎨 我的主页外观</h3>
        <p className="priv-note">主题</p>
        <div className="theme-grid">
          {THEMES.map(([k, l, c1, c2]) => (
            <button key={k} type="button" className={'theme-chip' + (theme === k ? ' on' : '')} onClick={() => setTheme(k)}>
              <span className="dot" style={{ background: `linear-gradient(135deg,${c1},${c2})` }} />
              {l}
            </button>
          ))}
        </div>
        <p className="priv-note" style={{ marginTop: 12 }}>照片位置</p>
        <div className="seg">
          {LAYOUTS.map(([k, l]) => (
            <button key={k} type="button" className={layout === k ? 'on' : ''} onClick={() => setLayout(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="me-sec-t">🔑 通行密钥登录</h3>
        <p className="mut" style={{ fontSize: 12.5 }}>注册后，下次登录可用指纹 / 面容 ID 一键登录，不用输密码。</p>
        <button onClick={regKey}>注册通行密钥</button>
        {keys.map(k => (
          <div key={k.id} className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13 }}>{k.friendly_name || '通行密钥'} · {k.created_at?.slice(0, 10) ?? ''}</span>
            <button className="mini" onClick={() => delKey(k.id)}>删除</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 className="me-sec-t">⚙️ 账号</h3>
        <div className="row" style={{ gap: 8 }}>
          {(role === 'admin' || role === 'super_admin') &&
            <button className="ghost" onClick={() => { location.hash = '#/admin'; }}>🛠️ 管理后台</button>}
          <button className="ghost" onClick={() => setFbOpen(true)}>💬 意见反馈</button>
          <button className="ghost" onClick={logout}>退出登录</button>
        </div>
      </div>

      {msg && <p className="card me-msg">{msg}</p>}
      <p className="autosave">
        {saveState === 'saving' ? '● 保存中…' : saveState === 'saved' ? '✓ 已自动保存' : saveState === 'error' ? '● 保存失败，请检查网络' : '✓ 改动会自动保存'}
      </p>
      {cropSrc && <AvatarCropper src={cropSrc} onCancel={closeCrop} onDone={uploadCropped} />}
      {fbOpen && <FeedbackModal kind="general" onClose={() => setFbOpen(false)} />}
      {welcome !== null && <WelcomeOverlay nick={welcome} onDone={() => setWelcome(null)} />}
    </div>
  );
}
