import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrls, uploadMedia, downscaleImage } from '../lib/media';
import { withRetry } from '../lib/retry';

type Post = { id: number; author_id: string; content: string; image_url: string | null; created_at: string };
type Profile = { id: string; username: string; display_name: string | null; avatar_path: string | null };
type Cmt = { id: number; post_id: number; author_id: string; content: string; created_at: string };

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

export default function Feed() {
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
  const fref = useRef<HTMLInputElement>(null);

  async function load() {
    const { data: ps } = await supabase.from('posts').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(30);
    const list = (ps ?? []) as Post[];
    setPosts(list);
    if (!list.length) return;
    const ids = [...new Set(list.map(p => p.author_id))];
    const pids = list.map(p => p.id);
    const { data: pr } = await supabase.from('profiles').select('id, username, display_name, avatar_path').in('id', ids);
    const pm: Record<string, Profile> = {};
    (pr ?? []).forEach((x: any) => { pm[x.id] = x; });
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
      (pr2 ?? []).forEach((x: any) => { pm2[x.id] = x; });
      setProfiles(pm2);
    }
    const { data: r } = await supabase.rpc('my_role');
    setIsAdmin(r === 'admin' || r === 'super_admin');
  }
  useEffect(() => { load(); }, []);

  async function publish() {
    if (!text.trim() && !img) return setErr('写点什么再发布吧');
    setBusy(true); setErr('');
    try {
      let image_url: string | null = null;
      if (img) image_url = await uploadMedia('media', await downscaleImage(img));
      const { error } = await withRetry(() => supabase.from('posts').insert({ author_id: me, content: text.trim(), image_url }));
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
      // 通知动态作者（不是自己评论自己才发）
      if (p.author_id !== me) {
        const who = profiles[me];
        supabase.from('notifications').insert({
          profile_id: p.author_id, type: 'comment',
          title: '有人评论了你的动态',
          body: `${who ? (who.display_name ?? who.username) : '同学'}：${t.slice(0, 60)}`,
          link: '/feed',
        }).then(() => {});
      }
    }
  }

  async function delPost(p: Post) {
    if (!confirm('删除这条动态？评论和点赞会一起删除。')) return;
    await supabase.from('posts').delete().eq('id', p.id);
    load();
  }
  async function reportPost(p: Post) {
    const reason = prompt('举报这条动态，请输入原因：');
    if (!reason || !reason.trim()) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: me, target_type: 'post', target_id: String(p.id), reason: reason.trim().slice(0, 200),
    });
    alert(error ? '举报失败：' + error.message : '已举报，管理员会处理');
  }
  async function delCmt(c: Cmt) {
    await supabase.from('comments').delete().eq('id', c.id);
    load();
  }

  return (
    <div className="page">
      <div className="hero">
        <h1>班级动态</h1>
        <p>分 享 此 刻 · 留 住 感 动</p>
      </div>
      <div className="composer">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="分享今天的班级故事…" rows={3} maxLength={2000} />
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
            <p className="bd">{p.content}</p>
            {p.image_url && <PostImg url={postImageUrls[p.image_url]} />}
            <div className="ft">
              <button className={liked[p.id] ? 'liked' : ''} onClick={() => toggleLike(p)}>
                {liked[p.id] ? '❤️' : '🤍'} {likes[p.id] || ''}
              </button>
              <button onClick={() => setOpenCmt({ ...openCmt, [p.id]: !open })}>💬 {list.length || ''} 评论</button>
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
                    {(c.author_id === me || isAdmin) &&
                      <button className="mini danger" style={{ marginLeft: 8 }} onClick={() => delCmt(c)}>删</button>}
                    <div>{c.content}</div>
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
      {posts.length === 0 && <div className="center" style={{ minHeight: 200 }}><div className="card">还没有动态，来发第一条吧 ✨</div></div>}
    </div>
  );
}
