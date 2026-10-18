import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const THEMES = [['aurora', '极光', '#7c9cff', '#c27cff'], ['sunset', '晚霞', '#ff8a5c', '#ff5c93'],
  ['forest', '森林', '#4ade80', '#14b8a6'], ['mono', '黑白', '#e8e8e8', '#777777'],
  ['stars', '星空', '#818cf8', '#38bdf8'], ['ocean', '海洋', '#22d3ee', '#3b82f6']];
const PRIVS: [string, string][] = [['show_avatar', '个人照片'], ['show_contact', '联系方式'], ['show_social', '社交账号'], ['show_age', '年龄']];

/** 新用户 5 步引导：头像昵称 → 主页风格 → 介绍爱好 → 可见范围 → 档案墙 */
export default function Onboarding({ uid, onDone }: { uid: string; onDone: () => void }) {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [nick, setNick] = useState('');
  const [theme, setTheme] = useState('aurora');
  const [bio, setBio] = useState('');
  const [hobbies, setHobbies] = useState('');
  const [priv, setPriv] = useState<Record<string, boolean>>({ show_avatar: true, show_contact: false, show_social: false, show_age: false });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('display_name, theme').eq('id', uid).maybeSingle();
      if (data?.display_name) setNick(data.display_name);
      if ((data as any)?.theme?.theme) setTheme((data as any).theme.theme);
    })();
  }, [uid]);

  function finish() {
    try {
      localStorage.setItem('ca_onboard_done_' + uid, '1');
      localStorage.setItem('ca_wallpaper_onboarded', '1');
    } catch {}
    onDone();
  }

  async function saveStep1() {
    if (!nick.trim()) { setErr('起个昵称吧'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.from('profiles').update({ display_name: nick.trim().slice(0, 30) }).eq('id', uid);
    setBusy(false);
    if (error) setErr('保存失败：' + error.message);
    else setStep(1);
  }

  async function onAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true); setErr('');
    try {
      const img = new Image();
      const url = URL.createObjectURL(f);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const cv = document.createElement('canvas');
      const s = Math.min(img.width, img.height);
      cv.width = cv.height = 512;
      cv.getContext('2d')!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 512, 512);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/jpeg', 0.85));
      if (!blob) throw new Error('处理失败');
      const path = `${uid}/avatar.jpg`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid);
      if (error) throw error;
      setAvatarPreview(URL.createObjectURL(blob));
    } catch (ex: any) { setErr('头像上传失败：' + (ex.message || '')); }
    setBusy(false);
  }

  async function saveStep2() {
    setBusy(true);
    const { data: p } = await supabase.from('profiles').select('theme').eq('id', uid).maybeSingle();
    const cur = (p as any)?.theme ?? {};
    const { error } = await supabase.from('profiles').update({ theme: { ...cur, theme } }).eq('id', uid);
    setBusy(false);
    if (error) setErr('保存失败：' + error.message);
    else setStep(2);
  }

  async function saveStep3() {
    setBusy(true); setErr('');
    const { error } = await supabase.from('profiles').update({
      bio: bio.trim().slice(0, 500), hobbies: hobbies.trim().slice(0, 200),
    }).eq('id', uid);
    setBusy(false);
    if (error) setErr('保存失败：' + error.message);
    else setStep(3);
  }

  async function saveStep4() {
    setBusy(true); setErr('');
    const { error } = await supabase.from('profile_privacy').upsert({ profile_id: uid, ...priv });
    setBusy(false);
    if (error) setErr('保存失败：' + error.message);
    else { finish(); nav('/members'); }
  }

  const dots = [0, 1, 2, 3, 4].map(i => (
    <span key={i} style={{
      flex: 1, height: 4, borderRadius: 99,
      background: i <= step ? 'linear-gradient(135deg,#5b8cff,#8b5cf6)' : '#ffffff1c',
    }} />
  ));
  const titles = ['设置头像和昵称', '选择主页风格', '介绍一下自己', '资料可见范围', '准备好了'];
  const descs = ['让同学们认出你', '以后随时可以在"我的"里换', '写一句介绍，填几个爱好', '默认联系方式不公开', '去看看同学们吧'];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 250, background: '#0a0f1ef2',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>{dots}</div>
        <div className="card" style={{ textAlign: 'center', padding: '26px 18px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>第 {step + 1} 步 · {titles[step]}</div>
          <div style={{ fontSize: 12, color: 'var(--mut)', marginBottom: 16 }}>{descs[step]}</div>

          {step === 0 && <>
            <div onClick={() => fileRef.current?.click()} style={{
              width: 84, height: 84, borderRadius: '50%', margin: '0 auto 12px', cursor: 'pointer',
              background: avatarPreview ? `url(${avatarPreview}) center/cover` : 'linear-gradient(135deg,#5b8cff,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 13, border: '2px dashed #ffffff44',
            }}>{!avatarPreview && <>点我<br />上传</>}</div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatar} />
            <input value={nick} onChange={e => setNick(e.target.value)} maxLength={30}
              placeholder="输入你的昵称…" style={{ textAlign: 'center' }} />
          </>}

          {step === 1 && <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {THEMES.map(([k, l, c1, c2]) => (
                <button key={k} type="button" onClick={() => setTheme(k)} style={{
                  borderRadius: 12, padding: '10px 4px', cursor: 'pointer', fontSize: 12,
                  border: theme === k ? '2px solid #5b8cff' : '1px solid #ffffff1c',
                  background: `linear-gradient(135deg,${c1}33,${c2}33)`, color: '#fff',
                }}>{l}</button>
              ))}
            </div>
          </>}

          {step === 2 && <>
            <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={500}
              placeholder="一句话介绍自己…" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 8 }} />
            <input value={hobbies} onChange={e => setHobbies(e.target.value)} maxLength={200}
              placeholder="兴趣爱好，用空格隔开" />
          </>}

          {step === 3 && <>
            {PRIVS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPriv(p => ({ ...p, [k]: !p[k] }))} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                boxSizing: 'border-box', background: '#ffffff08', border: '1px solid #ffffff14',
                borderRadius: 12, padding: '10px 12px', marginBottom: 8, color: '#fff', fontSize: 13, cursor: 'pointer',
              }}>
                {l}
                <span style={{
                  width: 40, height: 22, borderRadius: 99, position: 'relative',
                  background: priv[k] ? '#5b8cff' : '#ffffff22', transition: 'background .2s',
                }}>
                  <span style={{
                    position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    left: priv[k] ? 20 : 2, transition: 'left .2s',
                  }} />
                </span>
              </button>
            ))}
            <p style={{ fontSize: 11.5, color: 'var(--mut)', margin: '4px 0 0' }}>真实姓名永远只在后台可见，这里不设。</p>
          </>}

          {step === 4 && <>
            <div style={{ fontSize: 40, marginBottom: 8 }}>★</div>
            <div style={{ fontSize: 14, color: '#fff', marginBottom: 16 }}>资料已就绪，欢迎加入！</div>
          </>}

          {err && <p style={{ color: '#ff8a8a', fontSize: 12.5 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="mini ghost" style={{ flex: 1, padding: '10px 0' }} onClick={finish}>跳过</button>
            {step < 4 ? (
              <button className="pri" style={{ flex: 2 }} disabled={busy}
                onClick={step === 0 ? saveStep1 : step === 1 ? saveStep2 : step === 2 ? saveStep3 : saveStep4}>
                {busy ? '保存中…' : '下一步'}
              </button>
            ) : (
              <button className="pri" style={{ flex: 2 }} onClick={() => { finish(); nav('/members'); }}>进入档案墙</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
