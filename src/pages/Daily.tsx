import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrls, uploadMedia, downscaleImage } from '../lib/media';
import { withRetry } from '../lib/retry';
import type { ProfileSummary as Profile } from '../types/profile';
import type { FeedPost as Post, FeedComment as Cmt } from '../types/content';
import { confirmDialog, alertDialog, promptDialog } from '../lib/dialog';


function Avatar({ p, url, size = 42 }: { p?: Profile; url?: string; size?: number }) {
  return (
    <div className="av" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <span>{(p?.display_name ?? p?.username ?? '?').slice(0, 1)}</span>}
    </div>
  );
}
function PostImg({ url }: { url?: string }) {
  return url ? <img className="bdimg" src={url} alt="" loading="lazy" /> : null;
}
function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(s).toLocaleDateString();
}

/** 日常板块：普通日常帖子，与动态共用 posts 表，以 section='daily' 区分 */
async function removeOwnedMedia(path: string | null | undefined, ownerId: string): Promise<string | null> {
  if (!path || path.startsWith('http://') || path.startsWith('https://') || !path.startsWith(`${ownerId}/`)) return null;
  try {
    const { error } = await supabase.storage.from('media').remove([path]);
    return error?.message ?? null;
  } catch (error) {
    return error instanceof Error ? error.message : '存储服务暂时不可用';
  }
}

export default function Daily({ searchQuery = '' }: { searchQuery?: string }) {
  const nav = useNavigate();
  const me = useAuth().session!.user.id; const reduce = useReducedMotion();
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const avatarUrls = useSignedUrls('avatars', Object.values(profiles).map(p => p.avatar_path));
  const postImageUrls = useSignedUrls('media', posts.map(p => p.image_url));
  const [likes, setLikes] = useState<Record<number, number>>({});
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [cmts, setCmts] = useState<Record<number, Cmt[]>>({});
  const [openCmt, setOpenCmt] = useState<Record<number, boolean>>({});
  const [cmtText, setCmtText] = useState<Record<number, string>>({});
  const [text, setText] = useState(''); const [img, setImg] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editPostId, setEditPostId] = useState<number | null>(null);
  const [editPostText, setEditPostText] = useState('');
  const [editPostImage, setEditPostImage] = useState<File | null>(null);
  const [removePostImage, setRemovePostImage] = useState(false);
  const [editPostBusy, setEditPostBusy] = useState(false);
  const [editCommentId, setEditCommentId] = useState<number | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [editCommentBusy, setEditCommentBusy] = useState(false);
  const fref = useRef<HTMLInputElement>(null);

  async function load() {
    let postQuery = supabase.from('posts').select('*').eq('section', 'daily').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(30);
    if (searchQuery.trim()) postQuery = postQuery.ilike('content', `%${searchQuery.trim()}%`);
    const { data: ps } = await postQuery;
    const list = ps ?? [];
    setPosts(list);
    if (!list.length) return;
    const ids = [...new Set(list.map(p => p.author_id))];
    const pids = list.map(p => p.id);
    const { data: pr } = await supabase.from('profiles').select('id, username, display_name, avatar_path').in('id', ids);
    const pm: Record<string, Profile> = {};
    (pr ?? []).forEach((x) => { pm[x.id] = x; });
    setProfiles(pm);
    const { data: lk } = await supabase.from('post_likes').select('post_id, profile_id').in('post_id', pids);
    const cnt: Record<number, number> = {}; const mine: Record<number, boolean> = {};
    (lk ?? []).forEach((r: any) => { cnt[r.post_id] = (cnt[r.post_id] || 0) + 1; if (r.profile_id === me) mine[r.post_id] = true; });
    setLikes(cnt); setLiked(mine);
    const { data: cs } = await supabase.from('comments').select('*').is('deleted_at', null).in('post_id', pids).order('created_at');
    const cm: Record<number, Cmt[]> = {}; const aids = new Set<string>();
    (cs ?? []).forEach((c: any) => { (cm[c.post_id] = cm[c.post_id] || []).push(c); aids.add(c.author_id); });
    setCmts(cm);
    const missing = [...aids].filter(a => !pm[a]);
    if (missing.length) {
      const { data: pr2 } = await supabase.from('profiles').select('id, username, display_name, avatar_path').in('id', missing);
      const pm2 = { ...pm };
      (pr2 ?? []).forEach((x) => { pm2[x.id] = x; });
      setProfiles(pm2);
    }
    const { data: r } = await supabase.rpc('my_role');
    setIsAdmin(r === 'admin' || r === 'super_admin');
  }
  useEffect(() => { void load(); }, [searchQuery]);

  async function publish() {
    if (!text.trim() && !img) return setErr('写点什么再发布吧');
    setBusy(true); setErr('');
    try {
      let image_url: string | null = null;
      if (img) image_url = await uploadMedia('media', await downscaleImage(img));
      const { error } = await withRetry(() => supabase.from('posts').insert({ author_id: me, content: text.trim(), image_url, section: 'daily' }));
      if (error) throw error;
      setText(''); setImg(null); load();
    } catch (e: any) { setErr('发布失败：' + (e.message || '网络错误')); }
    finally { setBusy(false); }
  }

  async function toggleLike(p: Post) {
    if (liked[p.id]) {
      await supabase.from('post_likes').delete().eq('post_id', p.id).eq('profile_id', me);
    } else {
      await supabase.from('post_likes').insert({ post_id: p.id, profile_id: me });
    }
    load();
  }

  async function addCmt(p: Post) {
    const t = (cmtText[p.id] || '').trim();
    if (!t) return;
    const { error } = await withRetry(() => supabase.from('comments').insert({ post_id: p.id, author_id: me, content: t }));
    if (!error) {
      setCmtText({ ...cmtText, [p.id]: '' }); load();
      // 通知日常作者（不是自己评论自己才发）
      if (p.author_id !== me) {
        const who = profiles[me];
        supabase.from('notifications').insert({
          profile_id: p.author_id, type: 'comment',
          title: '有人评论了你的日常',
          body: `${who ? (who.display_name ?? who.username) : '同学'}：${t.slice(0, 60)}`,
          link: '/daily',
        }).then(() => {});
      }
    }
  }

  function beginEditPost(p: Post) {
    setEditPostId(p.id);
    setEditPostText(p.content);
    setEditPostImage(null);
    setRemovePostImage(false);
  }

  async function savePost(p: Post) {
    const content = editPostText.trim();
    if (!content) { alertDialog('内容不能为空。'); return; }
    setEditPostBusy(true);
    let uploadedPath: string | null = null;
    const imageUrl = removePostImage ? null : (p.image_url ?? null);
    let nextImageUrl = imageUrl;
    try {
      if (editPostImage) {
        const image = await downscaleImage(editPostImage);
        if (image.size > 10 * 1024 * 1024) throw new Error('图片处理后仍超过 10 MB。');
        uploadedPath = await uploadMedia('media', image);
        nextImageUrl = uploadedPath;
      }
      const { data, error } = await supabase.from('posts')
        .update({ content, image_url: nextImageUrl })
        .eq('id', p.id).eq('author_id', me).eq('section', 'daily')
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('内容不存在或当前账号没有编辑权限。');

      setEditPostId(null); setEditPostText(''); setEditPostImage(null); setRemovePostImage(false);
      await load();
      if (p.image_url && p.image_url !== nextImageUrl) {
        const cleanupError = await removeOwnedMedia(p.image_url, me);
        if (cleanupError) alertDialog('内容已保存，但旧图片清理失败：' + cleanupError);
      }
    } catch (error) {
      if (uploadedPath) await removeOwnedMedia(uploadedPath, me);
      alertDialog('保存失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
    } finally {
      setEditPostBusy(false);
    }
  }

  async function delPost(p: Post) {
    if (!(await confirmDialog('删除这条日常？评论和点赞会一起删除。', { danger: true }))) return;
    const { data, error } = await supabase.from('posts').delete()
      .eq('id', p.id).eq('author_id', p.author_id).eq('section', 'daily')
      .select('id').maybeSingle();
    if (error) { alertDialog('删除失败：' + error.message); return; }
    if (!data) { alertDialog('删除未完成：内容不存在或当前账号没有权限。'); return; }
    const cleanupError = await removeOwnedMedia(p.image_url, p.author_id);
    await load();
    if (cleanupError) alertDialog('内容已删除，但原配图清理失败：' + cleanupError);
  }

  async function reportPost(p: Post) {
    const reason = await promptDialog('举报这条日常，请输入原因：');
    if (!reason || !reason.trim()) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: me, target_type: 'post', target_id: String(p.id), reason: reason.trim().slice(0, 200),
    });
    alertDialog(error ? '举报失败：' + error.message : '已举报，管理员会处理');
  }

  async function delCmt(c: Cmt) {
    if (!(await confirmDialog('删除这条评论？', { danger: true }))) return;
    const { data, error } = await supabase.from('comments').delete()
      .eq('id', c.id).eq('author_id', c.author_id).select('id').maybeSingle();
    if (error) { alertDialog('评论删除失败：' + error.message); return; }
    if (!data) { alertDialog('评论未删除：内容不存在或当前账号没有权限。'); return; }
    await load();
  }

  async function saveComment(c: Cmt) {
    const content = editCommentText.trim();
    if (!content) { alertDialog('评论内容不能为空。'); return; }
    setEditCommentBusy(true);
    try {
      const { data, error } = await supabase.from('comments').update({ content })
        .eq('id', c.id).eq('author_id', me).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('评论不存在或当前账号没有编辑权限。');
      setEditCommentId(null); setEditCommentText('');
      await load();
    } catch (error) {
      alertDialog('评论保存失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
    } finally {
      setEditCommentBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="hero">
        <h1>日常</h1>
        <p>记 录 生 活 · 分 享 点 滴</p>
      </div>
      {searchQuery.trim() && <div className="feed-search-banner">搜索日常：{searchQuery}<button type="button" onClick={() => nav('/daily', { replace: true })}>清除搜索</button></div>}
      <div className="composer">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="分享今天的小日常…" rows={3} maxLength={2000} />
        <div className="row">
          <button className="ghost" onClick={() => fref.current?.click()}>{img ? '已选图片 ✓' : '＋ 图片'}</button>
          <input ref={fref} type="file" accept="image/*" hidden onChange={e => setImg(e.target.files?.[0] ?? null)} />
          <div className="sp" style={{ flex: 1 }} />
          <button className="pri" style={{ width: 'auto', padding: '10px 28px' }} disabled={busy} onClick={publish}>
            {busy ? '发布中…' : '发布'}</button>
        </div>
        {err && <p className="err">{err}</p>}
      </div>

      {posts.map((p, i) => {
        const a = profiles[p.author_id];
        const list = cmts[p.id] ?? [];
        const open = !!openCmt[p.id];
        return (
          <motion.article key={p.id} className="post"
            initial={reduce ? {} : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.05, 0.3) }}>
            <div className="hd">
              <Avatar p={a} url={a?.avatar_path ? avatarUrls[a.avatar_path] : undefined} />
              <div><div className="nm">{a ? (a.display_name ?? a.username) : '…'}</div>
                <div className="tm">{timeAgo(p.created_at)}</div></div>
            </div>
            {editPostId === p.id ? (
              <div className="card" style={{ margin: '10px 0', padding: 12 }}>
                <textarea value={editPostText} onChange={e => setEditPostText(e.target.value)} rows={3} maxLength={2000} />
                <label style={{ display: 'block', fontSize: 11, margin: '8px 0' }}>替换配图（不选择则保留原图）
                  <input type="file" accept="image/*" onChange={e => { setEditPostImage(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setRemovePostImage(false); }} />
                </label>
                {p.image_url && <label style={{ display: 'block', fontSize: 11, margin: '8px 0' }}><input type="checkbox" checked={removePostImage} onChange={e => setRemovePostImage(e.target.checked)} /> 移除原配图</label>}
                <div className="row" style={{ gap: 8 }}>
                  <button className="pri" disabled={editPostBusy} onClick={() => void savePost(p)}>{editPostBusy ? '保存中…' : '保存修改'}</button>
                  <button className="ghost" disabled={editPostBusy} onClick={() => { setEditPostId(null); setEditPostText(''); setEditPostImage(null); setRemovePostImage(false); }}>取消</button>
                </div>
              </div>
            ) : <><p className="bd">{p.content}</p>{p.image_url && <PostImg url={postImageUrls[p.image_url]} />}</>}
            <div className="ft">
              <button className={liked[p.id] ? 'liked' : ''} onClick={() => toggleLike(p)}>
                {liked[p.id] ? '♥' : '♡'} {likes[p.id] || ''}
              </button>
              <button onClick={() => setOpenCmt({ ...openCmt, [p.id]: !open })}>{list.length || ''} 评论</button>
              {p.author_id === me && <button className="mini ghost" onClick={() => beginEditPost(p)}>编辑</button>}
              {p.author_id !== me && <button className="mini ghost" onClick={() => reportPost(p)}>举报</button>}
              {(p.author_id === me || isAdmin) && <button className="del" onClick={() => delPost(p)}>删除</button>}
            </div>
            {open && <div className="cmt">
              {list.map(c => {
                const ca = profiles[c.author_id];
                return (
                  <div key={c.id} className="one">
                    <b>{ca ? (ca.display_name ?? ca.username) : '…'}</b>
                    <span className="tm">{timeAgo(c.created_at)}</span>
                    {c.author_id === me && <button className="mini ghost" style={{ marginLeft: 8 }} onClick={() => { setEditCommentId(c.id); setEditCommentText(c.content); }}>编辑</button>}
                    {(c.author_id === me || isAdmin) && <button className="mini danger" style={{ marginLeft: 8 }} onClick={() => delCmt(c)}>删</button>}
                    {editCommentId === c.id ? <div style={{ marginTop: 7 }}><textarea value={editCommentText} onChange={e => setEditCommentText(e.target.value)} rows={2} maxLength={500} /><div className="row" style={{ gap: 7 }}><button disabled={editCommentBusy} onClick={() => void saveComment(c)}>{editCommentBusy ? '保存中…' : '保存'}</button><button disabled={editCommentBusy} onClick={() => { setEditCommentId(null); setEditCommentText(''); }}>取消</button></div></div> : <div>{c.content}</div>}
                  </div>
                );
              })}
              <div className="box">
                <input value={cmtText[p.id] || ''} onChange={e => setCmtText({ ...cmtText, [p.id]: e.target.value })}
                  placeholder="写评论…" maxLength={500} onKeyDown={e => e.key === 'Enter' && addCmt(p)} />
                <button onClick={() => addCmt(p)}>发送</button>
              </div>
            </div>}
          </motion.article>
        );
      })}
      {posts.length === 0 && <div className="center" style={{ minHeight: 200 }}><div className="card">还没有日常，来发第一条吧</div></div>}
    </div>
  );
}
