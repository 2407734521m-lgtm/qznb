import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSignedUrl, uploadMedia } from '../lib/media';
import { withRetry } from '../lib/retry';
import { useAuth } from '../auth';
import AvatarCropper from '../components/AvatarCropper';
import FeedbackModal from '../components/FeedbackModal';
import GamePicker, { type GameProfile, type Origin } from '../components/GamePicker';
import SocialPicker from '../components/SocialPicker';
import { badgeText } from '../data/games';
import WelcomeOverlay from '../components/WelcomeOverlay';
import BackButton from '../components/BackButton';

const PROFILE_FIELDS = [['display_name', '名字', 'show_name'], ['age', '年龄', 'show_age'],
  ['personality', '性格', 'show_personality'], ['signature', '个性签名', 'show_signature'],
  ['bio', '个人简介', 'show_bio'], ['hobbies', '兴趣爱好', 'show_hobbies']] as const;
const CONTACT_FIELDS = [
  ['contact', '联系方式', 'show_contact', '手机号 / QQ…'],
  ['social', '社交平台', 'show_social', '微信 / 微博 / B站…'],
] as const;
const ALL_FIELDS = [...PROFILE_FIELDS, ...CONTACT_FIELDS];
const THEMES = [['aurora', '极光', '#7c9cff', '#c27cff'], ['sunset', '晚霞', '#ff8a5c', '#ff5c93'],
  ['forest', '森林', '#4ade80', '#14b8a6'], ['mono', '黑白', '#e8e8e8', '#777777'],
  ['stars', '星空', '#818cf8', '#38bdf8'], ['ocean', '海洋', '#22d3ee', '#3b82f6']];
const LAYOUTS = [['left', '照片在左'], ['right', '照片在右'], ['center', '居中']];
const PRIV_ICONS: Record<string, string> = { show_avatar: '🖼️', show_name: '📝', show_age: '🎂', show_personality: '✨', show_signature: '💬', show_bio: '📖', show_hobbies: '🎯', show_contact: '📞', show_social: '🌐' };
const PRIV_ROWS: [string, string][] = [['show_avatar', '个人照片'], ...ALL_FIELDS.map(([, label, flag]) => [flag, label] as [string, string])];

// 通用折叠栏
// 折叠栏展开/收起状态持久化：记住，下次打开保持上次的样子
function usePersistedSec(key: string, init: boolean) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s === null ? init : s === '1'; }
    catch { return init; }
  });
  const set = (u: boolean | ((o: boolean) => boolean)) => {
    setV(prev => {
      const nv = typeof u === 'function' ? (u as (o: boolean) => boolean)(prev) : u;
      try { localStorage.setItem(key, nv ? '1' : '0'); } catch {}
      return nv;
    });
  };
  return [v, set] as const;
}

function Collapsible({ icon, title, sub, open, onToggle, children, sid }: {
  icon: string; title: string; sub?: string; open: boolean; onToggle: () => void; children: React.ReactNode; sid?: string;
}) {  return (
    <div className="card" id={sid} style={{ padding: 0, overflow: 'hidden' }}>
      <BackButton fallback="/me" />
      <button type="button" onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{icon} {title}</span>
        {sub && <span style={{ fontSize: 12, color: '#fff', opacity: 0.85 }}>{sub}</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#fff', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }}>▼</span>
      </button>
      <div className={'xpanel' + (open ? ' open' : '')}><div><div className="xbody" style={{ padding: '0 20px 20px' }}>
        {children}
      </div></div></div>
    </div>
  );
}

export default function MyProfile() {
  const uid = useAuth().session!.user.id;
  const [v, setV] = useState<Record<string, string>>({}); const [priv, setPriv] = useState<Record<string, boolean>>({});
  // 折叠栏的展开/收起要记住，下次打开保持上次的样子
  const [privOpen, setPrivOpen] = usePersistedSec('ca_sec_priv', false);
  const [baseOpen, setBaseOpen] = usePersistedSec('ca_sec_base', true);
  const [lookOpen, setLookOpen] = usePersistedSec('ca_sec_look', false);
  const [gameOpen, setGameOpen] = usePersistedSec('ca_sec_game', true);
  const [keyOpen, setKeyOpen] = usePersistedSec('ca_sec_key', false);
  const [notifOpen, setNotifOpen] = usePersistedSec('ca_sec_notif', false);
  // 个人中心 hub 跳转：?sec=base|game|look|priv 自动展开并滚动
  useEffect(() => {
    const sec = new URLSearchParams(window.location.hash.split('?')[1] || '').get('sec');
    const map: Record<string, (v: boolean) => void> = {
      base: setBaseOpen, game: setGameOpen, look: setLookOpen, priv: setPrivOpen,
    };
    if (sec && map[sec]) {
      map[sec](true);
      setTimeout(() => document.getElementById('sec-' + sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    }
  }, []);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [uname, setUname] = useState('');
  const [theme, setTheme] = useState('aurora'); const [layout, setLayout] = useState('right');
  const [joined, setJoined] = useState(true); const [avatar, setAvatar] = useState<string | null>(null);
  const [code, setCode] = useState(''); const [msg, setMsg] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [fbOpen, setFbOpen] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const [gprof, setGprof] = useState<GameProfile | null>(null);
  const [gpickOpen, setGpickOpen] = useState(false);
  const [gpickOrigin, setGpickOrigin] = useState<Origin | null>(null);
  function openGpick(e: React.MouseEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setGpickOrigin({ x: r.left, y: r.top, w: r.width, h: r.height });
    setGpickOpen(true);
  }
  const loadedRef = useRef(false); const savingRef = useRef(false); const pendingRef = useRef(false);
  const [keys, setKeys] = useState<Array<{ id: string; friendly_name?: string | null; created_at?: string }>>([]);
  const [role, setRole] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarUrl = useSignedUrl('avatars', avatar);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const videoUrl = useSignedUrl('videos', videoPath);
  const [videoFile, setVideoFile] = useState<File | null>(null); // 待确认上传的视频（弹窗用）
  const [videoBusy, setVideoBusy] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { supabase.rpc('my_role').then(({ data }) => setRole(data ?? '')); }, []);
  useEffect(() => { // 加载站内通知
    supabase.from('notifications').select('*').eq('profile_id', uid)
      .order('created_at', { ascending: false }).limit(30).then(({ data }) => {
        const list = (data ?? []) as any[];
        setNotifs(list);
        setNotifUnread(list.filter(n => !n.is_read).length);
      });
  }, [uid]);
  useEffect(() => { // 注册时邀请码无效：在这里提示（登录页的报错会被跳转吞掉）
    try {
      if (sessionStorage.getItem('ca_invite_bad')) {
        sessionStorage.removeItem('ca_invite_bad');
        setMsg('邀请码不正确，请检查后重新填写');
      }
    } catch {}
  }, []);
  async function logout() { await supabase.auth.signOut(); }

  useEffect(() => { (async () => {
    const [p, pr, c, g] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('profile_privacy').select('*').eq('profile_id', uid).single(),
      supabase.from('profile_contacts').select('*').eq('profile_id', uid).maybeSingle(),
      supabase.from('game_profiles').select('game_name, game_uid, rank, status').eq('profile_id', uid).maybeSingle()]);
    if (p.error || pr.error || c.error) return setMsg('资料加载失败，请刷新重试');
    const all: Record<string, any> = { ...p.data, ...(c.data ?? {}) };
    setV(Object.fromEntries(ALL_FIELDS.map(([k]) => [k, all[k] == null ? '' : String(all[k])])));
    setPriv(pr.data); setJoined(p.data.joined); setAvatar(p.data.avatar_path); setUname(p.data.username ?? '');
    setVideoPath(p.data.intro_video_path ?? null);
    setTheme(p.data.theme?.theme ?? 'aurora'); setLayout(p.data.theme?.layout ?? 'left');
    if (!g.error) setGprof((g.data as GameProfile) ?? null);
    loadedRef.current = true;
  })(); }, [uid]);

  async function reloadGame() {
    const { data } = await supabase.from('game_profiles')
      .select('game_name, game_uid, rank, status').eq('profile_id', uid).maybeSingle();
    setGprof((data as GameProfile) ?? null);
  }
  async function clearGame() {
    if (!confirm('清除游戏段位资料？成员卡片上的标签也会消失。')) return;
    const { error } = await supabase.rpc('clear_game_profile');
    if (error) return setMsg('清除失败：' + error.message);
    setGprof(null); setMsg('已清除游戏资料');
  }

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
      withRetry(() => supabase.from('profiles').update({ display_name: n(v.display_name), age: age ? Number(age) : null,
        personality: n(v.personality), signature: n(v.signature), bio: n(v.bio), hobbies: n(v.hobbies),
        theme: { theme, layout } }).eq('id', uid)),
      withRetry(() => supabase.from('profile_privacy').update(Object.fromEntries(Object.keys(priv).filter(k => k.startsWith('show_') || k === 'hide_love_wall_name').map(k => [k, !!priv[k]]))).eq('profile_id', uid)),
      withRetry(() => supabase.from('profile_contacts').upsert({ profile_id: uid, contact: n(v.contact), social: n(v.social) }, { onConflict: 'profile_id' }))]);
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

  // 自我介绍视频：选文件 → 弹窗提示 → 确认上传 → 直接显示（无需审核）
  function pickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('video/')) return setMsg('请选择视频文件');
    if (f.size > 200 * 1024 * 1024) return setMsg('视频不能超过 200MB');
    setVideoFile(f); // 打开确认弹窗
  }
  async function confirmVideoUpload() {
    if (!videoFile) return;
    setVideoBusy(true); setMsg('视频上传中，请稍候…');
    try {
      const path = await uploadMedia('videos', videoFile);
      const { error } = await supabase.rpc('submit_intro_video', { p_path: path });
      if (error) throw error;
      setVideoPath(path); setVideoFile(null);
      setMsg('已上传');
    } catch (err: any) {
      setMsg('上传失败：' + (err?.message || '未知错误'));
    }
    setVideoBusy(false);
  }

  async function uploadCropped(blob: Blob) {
    closeCrop(); setMsg('头像上传中…');
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    const up = await withRetry(() => supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' }));
    if (up.error) return setMsg('上传失败：' + up.error.message);
    const { error } = await withRetry(() => supabase.from('profiles').update({ avatar_path: path }).eq('id', uid));
    if (error) return setMsg('保存失败：' + error.message);
    if (avatar) await supabase.storage.from('avatars').remove([avatar]);
    setAvatar(path); setMsg('照片已更新 ✓');
  }

  async function join() {
    const c = code.trim();
    if (!c) return setMsg('请填写邀请码');
    const { data, error } = await supabase.rpc('join_with_code', { code: c });
    if (error) return setMsg('加入失败：' + error.message);
    if (data === null || data === undefined) return setMsg('邀请码不正确');
    setJoined(true); setMsg('已加入班级 ✓'); setCode('');
    // 欢迎动画：这个邀请码专属的昵称 — Welcome to Class 13!
    setWelcome(data as string);
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
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id });
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

      <Collapsible sid="sec-base" icon="📝" title="基本资料" open={baseOpen} onToggle={() => setBaseOpen(o => !o)}>
        {PROFILE_FIELDS.map(([k, label]) => fieldInput(k, label))}
        {/* 自我介绍视频 */}
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 700 }}>自我介绍视频</label>
          {videoUrl && (
            <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 10, background: '#000', marginTop: 6 }} />
          )}
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="ghost" onClick={() => videoInputRef.current?.click()}>
              {videoPath ? '重新上传视频' : '上传自我介绍视频'}
            </button>
          </div>
          <input ref={videoInputRef} type="file" hidden accept="video/*" onChange={pickVideo} />
        </div>
      </Collapsible>

      <Collapsible sid="sec-game" icon="🎮" title="游戏与社交" open={gameOpen} onToggle={() => setGameOpen(o => !o)}>
        <label>我的游戏段位</label>
        {!gprof && <button className="ghost" style={{ width: '100%' }} onClick={openGpick}>🎮 设置我的游戏段位</button>}
        {gprof && (
          <div className="gprof">
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{gprof.game_name}
              {gprof.game_uid && <span className="mut" style={{ fontWeight: 400, fontSize: 12.5 }}> · ID: {gprof.game_uid}</span>}
            </div>
            {gprof.rank && <div style={{ fontSize: 13, marginTop: 2 }}>段位：{gprof.rank}</div>}
            {gprof.status === 'approved' && gprof.rank && <div className="gbadge">{badgeText(gprof.game_name, gprof.rank)}</div>}
            <div className="mut" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>
              {gprof.status === 'pending' && '⏳ 段位审核中，通过后成员卡片会显示标签'}
              {gprof.status === 'approved' && !gprof.rank && '✓ 已通过（未填段位，不显示标签）'}
              {gprof.status === 'rejected' && '❌ 审核未通过，可以修改后重新提交'}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="ghost" style={{ width: 'auto', padding: '8px 18px' }} onClick={openGpick}>修改</button>
              <button className="ghost" style={{ width: 'auto', padding: '8px 18px' }} onClick={clearGame}>清除</button>
            </div>
          </div>
        )}
        {fieldInput('contact', '联系方式', '手机号 / QQ…')}
        <label style={{ marginBottom: 6 }}>社交平台</label>
        <SocialPicker value={v.social ?? ''} onChange={s => setV({ ...v, social: s })} />
      </Collapsible>

      <Collapsible sid="sec-priv" icon="🔒" title="隐私设置"
        sub={`${PRIV_ROWS.filter(([f]) => priv[f]).length}/${PRIV_ROWS.length} 项公开`}
        open={privOpen} onToggle={() => setPrivOpen(o => !o)}>
        <p className="priv-note">哪些资料对其他成员公开，点一下开关就行</p>
        <div className="priv-list">
          {PRIV_ROWS.map(([flag, label]) => (
            <button key={flag} type="button" className={'priv-btn' + (priv[flag] ? ' on' : '')}
              onClick={() => setPriv({ ...priv, [flag]: !priv[flag] })}>
              <span>{PRIV_ICONS[flag] ?? '🔹'} {label}</span>
              <span className="sw"><span className="knob" /></span>
            </button>
          ))}
        </div>
        <p className="priv-note" style={{ marginTop: 12 }}>表白墙：开启后，新发布的表白默认匿名；关闭后，新帖子显示你的昵称。只影响新帖子，老帖子保持原样。</p>
        <div className="priv-list">
          <button type="button" className={'priv-btn' + (priv.hide_love_wall_name !== false ? ' on' : '')}
            onClick={() => setPriv({ ...priv, hide_love_wall_name: !(priv.hide_love_wall_name !== false) })}>
            <span>💌 表白墙隐藏姓名</span>
            <span className="sw"><span className="knob" /></span>
          </button>
        </div>
      </Collapsible>

      <Collapsible icon="🎨" sid="sec-look" title="我的主页外观" open={lookOpen} onToggle={() => setLookOpen(o => !o)}>
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
        <button type="button" className="pri" style={{ width: '100%', marginTop: 12 }}
          onClick={() => window.dispatchEvent(new Event('ca:wallpaper:open'))}>🖼️ 换壁纸</button>
      </Collapsible>

      <Collapsible icon="🔑" title="通行密钥登录" open={keyOpen} onToggle={() => setKeyOpen(o => !o)}>
        <p className="mut" style={{ fontSize: 12.5 }}>注册后，下次登录可用指纹 / 面容 ID 一键登录，不用输密码。</p>
        <button onClick={regKey}>注册通行密钥</button>
        {keys.map(k => (
          <div key={k.id} className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 13 }}>{k.friendly_name || '通行密钥'} · {k.created_at?.slice(0, 10) ?? ''}</span>
            <button className="mini" onClick={() => delKey(k.id)}>删除</button>
          </div>
        ))}
      </Collapsible>

      <Collapsible icon="🔔" title={`站内通知${notifUnread ? `（${notifUnread} 条未读）` : ''}`} open={notifOpen} onToggle={() => {
        const n = !notifOpen; setNotifOpen(n);
        if (n && notifUnread > 0) {
          supabase.from('notifications').update({ is_read: true }).eq('profile_id', uid).eq('is_read', false).then(() => {
            setNotifUnread(0);
            setNotifs(prev => prev.map(x => ({ ...x, is_read: true })));
            window.dispatchEvent(new Event('notif-read'));
          });
        }
      }}>
        {notifs.length === 0 ? <p className="mut" style={{ fontSize: 13 }}>暂无通知</p> :
          notifs.map(n => (
            <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid #edf0f4', opacity: n.is_read ? 0.65 : 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: n.is_read ? 400 : 700 }}>
                {!n.is_read && <span style={{ color: '#ff4d4f', marginRight: 6 }}>●</span>}{n.title}
              </div>
              {n.body && <div className="mut" style={{ fontSize: 12.5, marginTop: 2 }}>{n.body}</div>}
              <div className="mut" style={{ fontSize: 11.5, marginTop: 2 }}>{(n.created_at || '').slice(0, 16).replace('T', ' ')}</div>
            </div>
          ))}
      </Collapsible>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 6px', fontSize: 16, fontWeight: 700 }}>⚙️ 账号</div>
        {(role === 'admin' || role === 'super_admin') &&
          <button type="button" onClick={() => { location.hash = '#/admin'; }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '13px 20px', background: 'none', border: 0, borderTop: '1px solid #edf0f4', color: 'inherit', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
            🛠️ 管理后台 <span style={{ flex: 1 }} /><span style={{ color: '#8a8f9a', opacity: 1 }}>›</span></button>}
        <button type="button" onClick={() => setFbOpen(true)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '13px 20px', background: 'none', border: 0, borderTop: '1px solid #edf0f4', color: 'inherit', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
          💬 意见反馈 <span style={{ flex: 1 }} /><span style={{ color: '#8a8f9a', opacity: 1 }}>›</span></button>
        <button type="button" onClick={logout}
          style={{ width: '100%', display: 'flex', alignItems: 'center', padding: '13px 20px', background: 'none', border: 0, borderTop: '1px solid #edf0f4', color: 'inherit', font: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
          退出登录 <span style={{ flex: 1 }} /><span style={{ color: '#8a8f9a', opacity: 1 }}>›</span></button>
      </div>

      {msg && <p className="card me-msg">{msg}</p>}
      <p className="autosave">
        {saveState === 'saving' ? '● 保存中…' : saveState === 'saved' ? '✓ 已自动保存' : saveState === 'error' ? '● 保存失败，请检查网络' : '✓ 改动会自动保存'}
      </p>
      {cropSrc && <AvatarCropper src={cropSrc} onCancel={closeCrop} onDone={uploadCropped} />}
      {fbOpen && <FeedbackModal kind="general" onClose={() => setFbOpen(false)} />}
      {welcome !== null && <WelcomeOverlay nick={welcome} onDone={() => setWelcome(null)} />}
      {gpickOpen && <GamePicker initial={gprof} origin={gpickOrigin} onClose={() => setGpickOpen(false)}
        onDone={() => { setGpickOpen(false); reloadGame(); setMsg('已提交，等待管理员审核 ✓'); }} />}
      {/* 上传视频确认弹窗 */}
      {videoFile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: '#000c', display: 'grid', placeItems: 'center', padding: 20 }}
          onClick={() => !videoBusy && setVideoFile(null)}>
          <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 380 }}>
            <h3 style={{ margin: '0 0 10px' }}>上传自我介绍视频</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: '0 0 6px' }}>
              文件：{videoFile.name}<br />
              大小：{(videoFile.size / 1024 / 1024).toFixed(1)} MB
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="ghost" style={{ flex: 1 }} disabled={videoBusy}
                onClick={() => setVideoFile(null)}>取消</button>
              <button type="button" className="pri" style={{ flex: 1 }} disabled={videoBusy}
                onClick={confirmVideoUpload}>{videoBusy ? '上传中…' : '确认上传'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
