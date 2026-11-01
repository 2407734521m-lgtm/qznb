import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';
import { useAuth } from '../auth';
import AvatarCropper from '../components/AvatarCropper';
import Photo from '../components/Photo';
import { setShot, takeShot, shotFrom, flyTo } from '../lib/transition';
import { badgeText } from '../data/games';
import { confirmDialog } from '../lib/dialog';
import { parseSocial } from '../data/social';
import type { Dir } from '../lib/transition';
import './Member.polish.css';
import type { MemberListItem } from '../types/profile';

const REV: Record<Dir, Dir> = { left: 'right', right: 'left', down: 'down' };

type RelationshipState = {
  friend_status: string | null;
  friend_requester: string | null;
  blocked_by_me: boolean;
  blocked_me: boolean;
};

export default function Member() {
  const { id = '' } = useParams(); const nav = useNavigate(); const reduce = useReducedMotion();
  const locState = (useLocation().state as { m?: MemberListItem; img?: string } | null);
  const [m, setM] = useState<any>(locState?.m ?? null);
  const [err, setErr] = useState('');
  const [flying, setFlying] = useState(false);
  const [enterDir, setEnterDir] = useState<Dir>('down');
  const [upMsg, setUpMsg] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [fstat, setFstat] = useState<RelationshipState | null>(null);
  const [fbusy, setFbusy] = useState(false);
  const [gbadge, setGbadge] = useState<{ game_name: string; game_uid: string | null; rank: string } | null>(null);
  const [gx, setGx] = useState<'game' | 'social' | null>(null);
  const uid = useAuth().session?.user.id;
  const isMe = !!uid && uid === id;
  const photoRef = useRef<HTMLDivElement>(null);
  const imgUrl = useSignedUrl('avatars', m?.avatar_path);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const videoUrl = useSignedUrl('videos', videoPath);

  useEffect(() => {
    supabase.rpc('member_detail', { uid: id }).then(({ data, error }) => {
      if (error || !data?.length) setErr('无法加载该成员，可能尚未加入班级。'); else setM(data[0]);
    });
    supabase.rpc('member_video', { uid: id }).then(({ data }) => {
      if (data?.length && data[0].path) setVideoPath(data[0].path);
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

  // 好友与拉黑状态由受限 RPC 返回，不直接读取关系表。
  async function loadFriend() {
    if (!uid || uid === id) return;
    const { data, error } = await supabase.rpc('relationship_state', { target: id });
    if (error) {
      setFstat(null);
      setUpMsg('好友状态暂时无法读取，请稍后刷新。');
      return;
    }
    setFstat(((data ?? []) as RelationshipState[])[0] ?? {
      friend_status: null, friend_requester: null, blocked_by_me: false, blocked_me: false,
    });
  }
  useEffect(() => { loadFriend(); }, [id, uid]);
  useEffect(() => {
    supabase.rpc('game_badges').then(({ data }) => {
      const b = ((data ?? []) as Array<{ profile_id: string; game_name: string; game_uid: string | null; rank: string }>)
        .find(x => x.profile_id === id);
      setGbadge(b ?? null);
    });
  }, [id]);

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

  async function relationshipAction(action: 'remove_friend' | 'block_member' | 'unblock_member') {
    if (fbusy) return;
    const title = action === 'remove_friend'
      ? `确定解除与「${name}」的好友关系吗？历史消息不会删除，但双方将暂时无法继续进入这段私聊；重新成为好友后可恢复访问。`
      : action === 'block_member'
        ? `确定拉黑「${name}」吗？双方将无法互相申请好友，也无法查看或发送彼此的私聊。取消拉黑不会自动恢复好友关系。`
        : `确定解除对「${name}」的拉黑吗？解除后不会自动恢复好友关系。`;
    if (!(await confirmDialog(title, { danger: true }))) return;

    setFbusy(true);
    setUpMsg('');
    try {
      let error: { message: string } | null = null;
      if (action === 'remove_friend') {
        const result = await supabase.rpc('remove_friend', { target: id });
        error = result.error;
      } else if (action === 'block_member') {
        const result = await supabase.rpc('block_member', { target: id });
        error = result.error;
      } else {
        const result = await supabase.rpc('unblock_member', { target: id });
        error = result.error;
      }
      if (error) {
        setUpMsg('操作失败：' + error.message);
        return;
      }
      await loadFriend();
      setUpMsg(action === 'remove_friend'
        ? '已解除好友关系。'
        : action === 'block_member'
          ? '已拉黑该成员。双方私聊访问已停止。'
          : '已解除拉黑。需要重新发送好友申请才能恢复好友关系。');
    } catch (error) {
      console.error('member relationship action failed', error);
      setUpMsg('操作失败，请检查网络后重试。');
    } finally {
      setFbusy(false);
    }
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
    ['简介', m.bio], ['兴趣爱好', m.hobbies], ['联系方式', m.contact]] as [string, any][])
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
    <div className="page member-profile-page">
      <button className="backbtn member-backbtn" onClick={goBack}>← 返回成员墙</button>
      <div className={pcls + " member-profile-card"}>
        <div className="info member-info">
          <motion.h1 {...itemProps(0)}>{name || '…'}</motion.h1>
          {gbadge && <motion.div {...itemProps(1)} style={{ marginBottom: 6 }}>
            <span className="gbadge">{badgeText(gbadge.game_name, gbadge.rank)}</span>
          </motion.div>}
          {rows.length === 0 && <motion.p className="mut" {...itemProps(1)} style={{ fontSize: 13, lineHeight: 1.7 }}>这位同学暂未公开更多个人资料。</motion.p>}
          {rows.map(([k, v], i) => k === '个性签名'
            ? <motion.p key={k} className="sig" {...itemProps(i + 1)}>{v}</motion.p>
            : <motion.div key={k} className="kv" {...itemProps(i + 1)}><b>{k}</b><div>{v}</div></motion.div>)}
          {videoUrl && (
            <motion.div {...itemProps(rows.length + 1)}>
              <div className="kv"><b>自我介绍视频</b></div>
              <video src={videoUrl} controls playsInline style={{ width: '100%', borderRadius: 10, background: '#000', marginTop: 6 }} />
            </motion.div>
          )}
          {(gbadge || m?.social) && (
            <motion.div {...itemProps(rows.length + 1)} className="xbtns">
              {gbadge && <button type="button" className={'xbtn' + (gx === 'game' ? ' on' : '')}
                onClick={() => setGx(gx === 'game' ? null : 'game')}>游戏</button>}
              {m?.social && <button type="button" className={'xbtn' + (gx === 'social' ? ' on' : '')}
                onClick={() => setGx(gx === 'social' ? null : 'social')}>社交</button>}
            </motion.div>
          )}
          <div className={'xpanel' + (gx ? ' open' : '')}>
            <div>
              {gx === 'game' && gbadge && (
                <div className="xbody">
                  <div className="xrow"><b>游戏</b><span>{gbadge.game_name}</span></div>
                  <div className="xrow"><b>段位</b><span>{gbadge.rank}</span></div>
                  {gbadge.game_uid && <div className="xrow"><b>ID</b><span>{gbadge.game_uid}</span></div>}
                </div>
              )}
              {gx === 'social' && m?.social && (
                <div className="xbody">
                  {parseSocial(m.social).map((it, i) => (
                    <div key={i} className="xrow"><b>{it.p || '账号'}</b><span>{it.a}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {m && (
            <motion.div {...itemProps(rows.length + 1)}>
              <Link to={`/timeline/${id}`} className="ghost" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 8 }}>
                看{name}的青春时间线
              </Link>
            </motion.div>
          )}
        </div>
        <div className="head-photo member-photo-panel">
          <motion.div ref={photoRef} layout="position"
            initial={reduce ? false : { opacity: 0.72, scale: 0.985 }}
            animate={{ opacity: flying ? 0 : 1, scale: 1 }}
            transition={{ duration: reduce ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
            style={{ visibility: flying ? 'hidden' : 'visible', transformOrigin: 'center' }}>
            <Photo id={id} path={m?.avatar_path} name={name || '?'} />
          </motion.div>
          {isMe && <label className="ghost upbtn">上传照片
            <input type="file" hidden accept="image/jpeg,image/png,image/webp"
              onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </label>}
          {isMe && upMsg && <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>{upMsg}</p>}
          {!isMe && uid && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10, alignItems: 'center' }}>
              {!fstat ? (
                <span className="mut" style={{ fontSize: 12 }}>正在读取好友状态…</span>
              ) : fstat.blocked_by_me ? (
                <button className="ghost upbtn" style={{ width: 'auto', padding: '8px 14px' }}
                  disabled={fbusy} onClick={() => void relationshipAction('unblock_member')}>解除拉黑</button>
              ) : fstat.blocked_me ? (
                <span className="mut" style={{ fontSize: 12 }}>对方已限制联系，无法互相申请好友或私聊。</span>
              ) : (
                <>
                  {fstat.friend_status === 'accepted' ? (
                    <>
                      <button className="pri upbtn" style={{ width: 'auto', padding: '8px 18px' }} disabled={fbusy} onClick={goChat}>去聊天</button>
                      <button className="ghost upbtn" style={{ width: 'auto', padding: '8px 14px' }}
                        disabled={fbusy} onClick={() => void relationshipAction('remove_friend')}>解除好友</button>
                    </>
                  ) : fstat.friend_status === 'pending' && fstat.friend_requester === uid ? (
                    <button className="ghost upbtn" style={{ width: 'auto', padding: '8px 14px' }} disabled>已申请，等待通过</button>
                  ) : fstat.friend_status === 'pending' ? (
                    <button className="pri upbtn" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => nav('/friends')}>对方想加你，去看看</button>
                  ) : (
                    <button className="ghost upbtn" style={{ width: 'auto', padding: '8px 14px' }}
                      disabled={fbusy} onClick={addFriend}>＋ 加好友</button>
                  )}
                  <button className="ghost upbtn" style={{ width: 'auto', padding: '8px 14px', borderColor: 'rgba(235,105,120,.4)', color: '#ffb4bd' }}
                    disabled={fbusy} onClick={() => void relationshipAction('block_member')}>拉黑</button>
                </>
              )}
            </div>
          )}
          {!isMe && upMsg && <p className="mut" style={{ fontSize: 12, margin: '6px 0 0' }}>{upMsg}</p>}
        </div>
      </div>
      {cropSrc && <AvatarCropper src={cropSrc} onCancel={closeCrop} onDone={uploadCropped} />}
    </div>
  );
}
