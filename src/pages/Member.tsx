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
import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog';
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
  const locState = (useLocation().state as { m?: MemberListItem; img?: string; no?: number } | null);
  const [m, setM] = useState<any>(locState?.m ?? null);
  const [err, setErr] = useState('');
  const [flying, setFlying] = useState(false);
  const [enterDir, setEnterDir] = useState<Dir>('down');
  const [upMsg, setUpMsg] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [fstat, setFstat] = useState<RelationshipState | null>(null);
  const [fbusy, setFbusy] = useState(false);
  const [sendEmailReminder, setSendEmailReminder] = useState(false);
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
    const reminderRequested = sendEmailReminder;
    const { data, error } = await supabase.rpc('send_friend_request', { target: id });
    setFbusy(false);
    if (error) return setUpMsg('请求失败：' + error.message);
    if (data === 'accepted') setUpMsg('对方已申请你，已成为好友 ✓');
    else if (data === 'already_friends') setUpMsg('已经是好友了');
    else if (data === 'already_pending') setUpMsg('已申请，等待对方通过');
    else {
      let suffix = '';
      if (reminderRequested) {
        setSendEmailReminder(false);
        try {
          const { data: emailResult, error: emailError } = await supabase.functions.invoke('friend-request-email', { body: { target: id } });
          if (emailError) suffix = ' 但邮件提醒暂时发送失败。';
          else if (emailResult?.sent === true) suffix = ' 邮件提醒已提交。';
          else if (emailResult?.reason === 'recipient_email_unavailable') suffix = ' 对方没有可用的已验证邮箱，未发送邮件。';
          else if (emailResult?.reason === 'rate_limited') suffix = ' 邮件提醒已达到发送频率限制，未发送邮件。';
          else suffix = ' 邮件提醒暂未发送。';
        } catch { suffix = ' 但邮件提醒暂时发送失败。'; }
      }
      setUpMsg('好友申请已发送 ✓' + suffix);
    }
    loadFriend();
  }

  async function withdrawFriend() {
    if (fbusy) return;
    if (!(await confirmDialog(`撤回给「${name}」的好友申请？`, { confirmText: '撤回申请' }))) return;
    setFbusy(true); setUpMsg('');
    const { data, error } = await supabase.rpc('withdraw_friend_request', { target: id });
    setFbusy(false);
    if (error) return setUpMsg('撤回失败：' + error.message);
    setUpMsg(data === 'withdrawn' ? '已撤回好友申请' : '申请状态已变化');
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
    if (!(await confirmDialog(title, { danger: true, confirmText: action === 'remove_friend' ? '确认解除好友' : action === 'block_member' ? '确认拉黑' : '确认解除拉黑' }))) return;

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
  async function reportMember() {
    if (!uid || isMe || fbusy) return;
    setFbusy(true);
    try {
      const reason = await promptDialog('举报该成员，请填写具体原因（最多 200 字）：');
      if (!reason || !reason.trim()) return;
      const normalizedReason = reason.trim().slice(0, 200);
      if (normalizedReason.length < 3) {
        await alertDialog('请至少填写 3 个字的举报原因。');
        return;
      }

      const { data: existing, error: lookupError } = await supabase.from('reports')
        .select('id')
        .eq('reporter_id', uid)
        .eq('target_type', 'member')
        .eq('target_id', id)
        .eq('status', 'pending')
        .limit(1)
        .maybeSingle();
      if (!lookupError && existing) {
        await alertDialog('你已经提交过针对该成员的待处理举报，请等待管理员审核。');
        return;
      }

      const { error } = await supabase.from('reports').insert({
        reporter_id: uid,
        target_type: 'member',
        target_id: id,
        reason: normalizedReason,
      });
      if (error) {
        await alertDialog('举报提交失败：' + error.message);
        return;
      }
      await alertDialog('举报已提交，管理员会核实处理。请勿重复提交。');
    } catch (error) {
      console.error('member report failed', error);
      await alertDialog('网络暂时不可用，举报未能提交，请稍后重试。');
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
  const rows = m ? ([['性格', m.personality], ['年龄', m.age], ['个性签名', m.signature],
    ['简介', m.bio], ['兴趣爱好', m.hobbies], ['联系方式', m.contact]] as [string, any][])
    .filter(([, v]) => v) : [];
  // 个性签名放到 hero 名字下方当状态行（参考图版式），资料卡里不再重复。
  const sig = m?.signature ? String(m.signature) : '';
  const infoRows = rows.filter(([k]) => k !== '个性签名');

  const itemProps = (i: number) => {
    // 资料卡从下方轻轻升入
    const init = reduce ? { opacity: 0 } : { opacity: 0, y: 16 };
    return {
      initial: init,
      animate: { opacity: 1, x: 0, y: 0 },
      transition: { duration: reduce ? 0 : 0.45, delay: reduce ? 0 : 0.22 + i * 0.06, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    };
  };

  const actIcon = (paths: React.ReactNode) => (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
  );

  return (
    <div className="page member-profile-page">
      <button className="backbtn member-backbtn" onClick={goBack}>← 返回成员墙</button>
      <section className="mp-hero">
        <div className="mp-profile-top">
        <motion.div ref={photoRef} layout="position" className="mp-avatar"
          initial={reduce ? false : { opacity: 0.72, scale: 0.985 }}
          animate={{ opacity: flying ? 0 : 1, scale: 1 }}
          transition={{ duration: reduce ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{ visibility: flying ? 'hidden' : 'visible', transformOrigin: 'center' }}>
          <Photo id={id} path={m?.avatar_path} name={name || '?'} />
        </motion.div>
          <div className="mp-profile-identity">
        <h1 className="mp-name">{name || '…'}</h1>
        {sig && <p className="mp-sig">{sig}</p>}
        {gbadge && <div className="mp-badge-row"><span className="gbadge">{badgeText(gbadge.game_name, gbadge.rank)}</span></div>}
        {typeof locState?.no === 'number' && <div className="mp-stamp" aria-hidden="true">档案 No.{String(locState.no).padStart(2, '0')}</div>}
          </div>
        </div>
        {!isMe && fstat?.blocked_me && <p className="mp-note">对方已限制联系，无法互相申请好友或私聊。</p>}
        <div className="mp-actions">
          {isMe && (
            <label className="mp-act">
              <span className="mp-act-circle">{actIcon(<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>)}</span>
              <span className="mp-act-label">上传照片</span>
              <input type="file" hidden accept="image/jpeg,image/png,image/webp"
                onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          )}
          {!isMe && uid && !fstat && <span className="mp-loading">正在读取好友状态…</span>}
          {!isMe && uid && fstat && !fstat.blocked_me && (
            fstat.blocked_by_me ? (
              <button type="button" className="mp-act" disabled={fbusy} onClick={() => void relationshipAction('unblock_member')}>
                <span className="mp-act-circle">{actIcon(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>)}</span>
                <span className="mp-act-label">解除拉黑</span>
              </button>
            ) : fstat.friend_status === 'accepted' ? (
              <button type="button" className="mp-act primary" disabled={fbusy} onClick={goChat}>
                <span className="mp-act-circle">{actIcon(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />)}</span>
                <span className="mp-act-label">发消息</span>
              </button>
            ) : fstat.friend_status === 'pending' && fstat.friend_requester === uid ? (
              <button type="button" className="mp-act" disabled={fbusy} onClick={withdrawFriend}>
                <span className="mp-act-circle">{actIcon(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>)}</span>
                <span className="mp-act-label">撤回申请</span>
              </button>
            ) : fstat.friend_status === 'pending' ? (
              <button type="button" className="mp-act primary" onClick={() => nav('/friends')}>
                <span className="mp-act-circle">{actIcon(<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>)}</span>
                <span className="mp-act-label">去处理</span>
              </button>
            ) : (
              <button type="button" className="mp-act primary" disabled={fbusy} onClick={addFriend}>
                <span className="mp-act-circle">{actIcon(<><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="20" y1="8" x2="20" y2="14" /><line x1="23" y1="11" x2="17" y2="11" /></>)}</span>
                <span className="mp-act-label">加好友</span>
              </button>
            )
          )}
          {!isMe && uid && m && fstat && !fstat.blocked_me && !fstat.blocked_by_me && (
            <Link to={`/questions/${id}`} className="mp-act">
              <span className="mp-act-circle">{actIcon(<><path d="M5 5h14v11H9l-4 4V5Z" /><path d="M9 9h6M9 12h4" /></>)}</span>
              <span className="mp-act-label">匿名提问</span>
            </Link>
          )}
          {isMe && (
            <Link to="/questions" className="mp-act">
              <span className="mp-act-circle">{actIcon(<><path d="M5 5h14v11H9l-4 4V5Z" /><path d="M9 9h6M9 12h4" /></>)}</span>
              <span className="mp-act-label">我的提问箱</span>
            </Link>
          )}
          {m && (
            <Link to={`/timeline/${id}`} className="mp-act">
              <span className="mp-act-circle">{actIcon(<><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></>)}</span>
              <span className="mp-act-label">时间线</span>
            </Link>
          )}
          {gbadge && (
            <button type="button" className={'mp-act' + (gx === 'game' ? ' on' : '')} onClick={() => setGx(gx === 'game' ? null : 'game')}>
              <span className="mp-act-circle">{actIcon(<><line x1="6" y1="12" x2="10" y2="12" /><line x1="8" y1="10" x2="8" y2="14" /><line x1="15" y1="13" x2="15.01" y2="13" /><line x1="18" y1="11" x2="18.01" y2="11" /><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.6C2.7 8.8 2.68 9 2.68 9.2L2.68 19a2 2 0 0 0 3.6 1.4L8.5 18h7l2.22 2.6A2 2 0 0 0 21.32 19l0-9.8c0-.2-.02-.4-.02-.6A4 4 0 0 0 17.32 5z" /></>)}</span>
              <span className="mp-act-label">游戏</span>
            </button>
          )}
          {m?.social && (
            <button type="button" className={'mp-act' + (gx === 'social' ? ' on' : '')} onClick={() => setGx(gx === 'social' ? null : 'social')}>
              <span className="mp-act-circle">{actIcon(<><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></>)}</span>
              <span className="mp-act-label">社交</span>
            </button>
          )}
        </div>
      </section>
      {!isMe && uid && fstat && !fstat.blocked_me && !fstat.friend_status && (
        <label className="mp-email-option">
          <input type="checkbox" checked={sendEmailReminder} onChange={e => setSendEmailReminder(e.target.checked)} />
          <span>同时发送邮件提醒（仅对这次申请生效）</span>
        </label>
      )}
      {upMsg && <p className="mp-msg">{upMsg}</p>}
      {gx === 'game' && gbadge && (
        <motion.section className="mp-card" {...itemProps(1)}>
          <div className="mp-row"><div className="mp-k">游戏</div><div className="mp-v">{gbadge.game_name}</div></div>
          <div className="mp-row"><div className="mp-k">段位</div><div className="mp-v">{gbadge.rank}</div></div>
          {gbadge.game_uid && <div className="mp-row"><div className="mp-k">ID</div><div className="mp-v">{gbadge.game_uid}</div></div>}
        </motion.section>
      )}
      {gx === 'social' && m?.social && (
        <motion.section className="mp-card" {...itemProps(1)}>
          {parseSocial(m.social).map((it, i) => (
            <div className="mp-row" key={i}><div className="mp-k">{it.p || '账号'}</div><div className="mp-v">{it.a}</div></div>
          ))}
        </motion.section>
      )}
      {infoRows.length > 0 ? (
        <motion.section className="mp-card" {...itemProps(2)}>
          {infoRows.map(([k, v]) => (
            <div className="mp-row" key={k}><div className="mp-k">{k}</div><div className="mp-v">{v}</div></div>
          ))}
        </motion.section>
      ) : !videoUrl && (
        <motion.p className="mp-empty" {...itemProps(2)}>这位同学暂未公开更多个人资料。</motion.p>
      )}
      {videoUrl && (
        <motion.section className="mp-card mp-video-card" {...itemProps(3)}>
          <div className="mp-k">自我介绍视频</div>
          <video src={videoUrl} controls playsInline className="mp-video" />
        </motion.section>
      )}
      {!isMe && uid && m && (
        <div className="mp-danger-row">
          {fstat && !fstat.blocked_me && !fstat.blocked_by_me && fstat.friend_status === 'accepted' && (
            <button type="button" className="mp-text-btn" disabled={fbusy} onClick={() => void relationshipAction('remove_friend')}>解除好友</button>
          )}
          {fstat && !fstat.blocked_me && !fstat.blocked_by_me && (
            <button type="button" className="mp-text-btn danger" disabled={fbusy} onClick={() => void relationshipAction('block_member')}>拉黑</button>
          )}
          <button type="button" className="mp-text-btn danger" disabled={fbusy} onClick={() => void reportMember()}>举报此成员</button>
        </div>
      )}
      {cropSrc && <AvatarCropper src={cropSrc} onCancel={closeCrop} onDone={uploadCropped} />}
    </div>
  );
}
