import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';
import { useAuth } from '../auth';
import AvatarCropper from '../components/AvatarCropper';
import Photo from '../components/Photo';
import { setShot, takeShot, shotFrom, flyTo } from '../lib/transition';
import type { Dir } from '../lib/transition';
import type { M } from './Members';

const REV: Record<Dir, Dir> = { left: 'right', right: 'left', down: 'down' };

export default function Member() {
  const { id = '' } = useParams(); const nav = useNavigate(); const reduce = useReducedMotion();
  const locState = (useLocation().state as { m?: M; img?: string } | null);
  const [m, setM] = useState<any>(locState?.m ?? null);
  const [err, setErr] = useState('');
  const [flying, setFlying] = useState(false);
  const [enterDir, setEnterDir] = useState<Dir>('down');
  const [upMsg, setUpMsg] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [fstat, setFstat] = useState<{ requester: string; status: string } | null>(null);
  const [fbusy, setFbusy] = useState(false);
  const uid = useAuth().session?.user.id;
  const isMe = !!uid && uid === id;
  const photoRef = useRef<HTMLDivElement>(null);
  const imgUrl = useSignedUrl('avatars', m?.avatar_path);

  useEffect(() => {
    supabase.rpc('member_detail', { uid: id }).then(({ data, error }) => {
      if (error || !data?.length) setErr('无法加载该成员，可能尚未加入班级。'); else setM(data[0]);
    });
  }, [id]);

  useEffect(() => {
    const el = document.documentElement; const t = m?.theme ?? {};
    el.dataset.theme = t.theme ?? 'aurora';
    return () => { delete el.dataset.theme; };
  }, [m?.theme]);

  // 进入：共享元素飞入
  useEffect(() => {
    if (reduce || !m) return;
    const s = takeShot();
    if (s?.dir) setEnterDir(s.dir);
    if (!s || !photoRef.current) return;
    const target = photoRef.current;
    // 等照片 URL 就绪再飞，避免幽灵图与目标错位
    const t = setTimeout(() => {
      setFlying(true);
      flyTo(s, target, { onDone: () => setFlying(false) });
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id, imgUrl]);

  function goBack() {
    if (!reduce && photoRef.current) {
      const s = shotFrom(photoRef.current, imgUrl ?? '', name);
      if (s) { s.key = id; s.dir = REV[enterDir]; setShot(s); }
    }
    nav(-1);
  }

  // 好友状态
  async function loadFriend() {
    if (!uid || uid === id) return;
    const { data } = await supabase.from('friendships').select('requester,status')
      .or(`and(requester.eq.${uid},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${uid})`)
      .maybeSingle();
    setFstat((data as any) ?? null);
  }
  useEffect(() => { loadFriend(); }, [id, uid]);

  async function addFriend() {
    if (fbusy) return; setFbusy(true); setUpMsg('');
    const { data, error } = await supabase.rpc('send_friend_request', { target: id });
    setFbusy(false);
    if (error) return setUpMsg('请求失败：' + error.message);
    if (data === 'accepted') setUpMsg('对方已申请你，已成为好友 ✓');
    else if (data === 'already_friends') setUpMsg('已经是好友了');
    else if (data === 'already_pending') setUpMsg('已申请，等待对方通过');
    else setUpMsg('好友申请已发送 ✓');
    loadFriend();
  }
  async function goChat() {
    if (fbusy) return; setFbusy(true);
    const { data, error } = await supabase.rpc('get_or_create_conversation', { other: id });
    setFbusy(false);
    if (error) return setUpMsg('打开聊天失败：' + error.message);
    nav(`/chat/${data}`, { state: { name } });
  }
  function pickPhoto(f?: File) {
    if (!f || !isMe) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setUpMsg('仅支持 JPG / PNG / WebP');
    if (f.size > 2 * 1024 * 1024) return setUpMsg('图片不能超过 2MB');
    setUpMsg('');
    setCropSrc(URL.createObjectURL(f));
  }
  function closeCrop() { if (cropSrc) URL.revokeObjectURL(cropSrc); setCropSrc(null); }

  async function uploadCropped(blob: Blob) {
    closeCrop(); setUpMsg('上传中…');
    const path = `${id}/${crypto.randomUUID()}.jpg`;
    const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) return setUpMsg('上传失败：' + up.error.message);
    const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', id);
    if (error) return setUpMsg('保存失败：' + error.message);
    if (m?.avatar_path) await supabase.storage.from('avatars').remove([m.avatar_path]);
    setM({ ...m, avatar_path: path }); setUpMsg('已更新 ✓');
  }

  if (err) return <div className="page"><div className="center"><div className="card">{err}</div></div></div>;
  const name = m?.display_name ?? m?.username ?? '';
  const layout = m?.theme?.layout ?? 'right'; // 默认照片在右
  const pcls = 'profile compact' + (layout === 'left' ? ' rev' : layout === 'center' ? ' center' : '');
  const rows = m ? ([['性格', m.personality], ['年龄', m.age], ['个性签名', m.signature],
    ['简介', m.bio], ['兴趣爱好', m.hobbies], ['游戏账号', m.game_id], ['联系方式', m.contact], ['社交平台', m.social]] as [string, any][])
    .filter(([, v]) => v) : [];

  const itemProps = (i: number) => {
    // 基本信息从左侧滑入，贴到照片旁边
    const init = reduce ? { opacity: 0 } : { opacity: 0, x: -48 };
    return {
      initial: init,
      animate: { opacity: 1, x: 0, y: 0 },
      transition: { duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.35 + i * 0.07, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    };
  };

  return (
    <div className="page">
      <button className="backbtn" onClick={goBack}>← 返回成员墙</button>
      <div className={pcls}>
        <div className="info">
          <motion.h1 {...itemProps(0)}>{name || '…'}</motion.h1>
          {rows.map(([k, v], i) => k === '个性签名'
            ? <motion.p key={k} className="sig" {...itemProps(i + 1)}>{v}</motion.p>
            : <motion.div key={k} className="kv" {...itemProps(i + 1)}><b>{k}</b><div>{v}</div></motion.div>)}
          {m && (
            <motion.div {...itemProps(rows.length + 1)}>
              <Link to={`/timeline/${id}`} className="ghost" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 8 }}>
                ✨ 看{name}的青春时间线
              </Link>
            </motion.div>
          )}
        </div>
        <div className="head-photo">
          <div ref={photoRef} style={{ visibility: flying ? 'hidden' : 'visible' }}>
            <Photo id={id} path={m?.avatar_path} name={name || '?'} />
          </div>
          {isMe && <label className="ghost upbtn">📷 上传照片
            <input type="file" hidden accept="image/jpeg,image/png,image/webp"
              onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>}
          {isMe && upMsg && <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>{upMsg}</p>}
          {!isMe && uid && (
            !fstat ? <button className="ghost upbtn" disabled={fbusy} onClick={addFriend}>＋ 加好友</button>
            : fstat.status === 'accepted'
              ? <button className="pri upbtn" style={{ width: 'auto', padding: '8px 18px' }} disabled={fbusy} onClick={goChat}>💬 去聊天</button>
              : fstat.status === 'pending' && fstat.requester === uid
                ? <button className="ghost upbtn" disabled>⏳ 已申请，等待通过</button>
                : <button className="pri upbtn" style={{ width: 'auto', padding: '8px 18px' }} onClick={() => nav('/friends')}>💌 对方想加你，去看看</button>
          )}
          {!isMe && upMsg && <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>{upMsg}</p>}
        </div>
      </div>
      {cropSrc && <AvatarCropper src={cropSrc} onCancel={closeCrop} onDone={uploadCropped} />}
    </div>
  );
}
