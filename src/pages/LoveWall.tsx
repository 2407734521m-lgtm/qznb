import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { confirmDialog } from '../lib/dialog';
import { getSignedUrls, downscaleImage } from '../lib/media';
import { fetchReviewEstimates, estimateText, type ReviewEstimates } from '../lib/reviewEstimate';
import OptionSheet from '../components/OptionSheet';

// 公开列表来自 love_wall_published()，不含 author_id；自己的投稿来自表查询，只含自己的 author_id。
type PublicPost = { id: string; recipient_name: string | null; category: string; content: string; is_anonymous: boolean; author_display_name: string | null; status: string; created_at: string };
type MyPost = { id: string; author_id: string; recipient_name: string | null; category: string; content: string; is_anonymous: boolean; status: string; created_at: string };
type MediaRow = { id: string; post_id: string; path: string; kind: string; sort: number };
type MediaItem = MediaRow & { url?: string };
type CommentRow = { id: string; post_id: string; author_id: string; content: string; created_at: string; deleted_at: string | null };
type CommentItem = CommentRow & { name: string };
type RecipientOption = { id: string; username: string; display_name: string | null };

const MAX_IMAGES = 9;
const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v', 'video/3gpp',
]);
const MAX_VIDEOS = 3;

const categories = ['暗恋心事', '认真表白', '感谢与祝福', '毕业寄语'];
const catColor: Record<string, { bg: string; fg: string }> = {
  '暗恋心事': { bg: '#fdeef3', fg: '#c2437b' },
  '认真表白': { bg: '#fdecec', fg: '#c22f3d' },
  '感谢与祝福': { bg: '#fdf6e0', fg: '#9a7408' },
  '毕业寄语': { bg: '#eceffd', fg: '#4c5ec2' },
};

function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(s).toLocaleDateString();
}

async function cleanupUnlinkedLoveMedia(paths: string[]): Promise<boolean> {
  if (!paths.length) return false;
  // 写入请求可能已在服务端成功但客户端超时；先保留已被附件记录引用的文件。
  const { data: linkedRows, error: lookupError } = await supabase.from('love_wall_media')
    .select('path').in('path', paths);
  if (lookupError) return true;
  const linked = new Set((linkedRows ?? []).map(row => row.path));
  const unlinked = paths.filter(path => !linked.has(path));
  if (!unlinked.length) return false;
  const { error: removeError } = await supabase.storage.from('media').remove(unlinked);
  return Boolean(removeError);
}

export default function LoveWall() {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [content, setContent] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [recipientLabel, setRecipientLabel] = useState('');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientOptions, setRecipientOptions] = useState<RecipientOption[]>([]);
  const [category, setCategory] = useState(categories[0]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [formErr, setFormErr] = useState('');
  const [mine, setMine] = useState(searchParams.get('mine') === '1');
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [anon, setAnon] = useState(true);
  const [mediaByPost, setMediaByPost] = useState<Record<string, MediaItem[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentItem[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [cBusy, setCBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [estimates, setEstimates] = useState<ReviewEstimates | null>(null);
  const [pick, setPick] = useState<{ file: File; kind: 'image' | 'video'; url: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data, error } = await supabase.rpc('love_wall_published');
    if (error) { setNotice('暂时无法加载表白墙，请稍后再试。'); return; }
    const pubList = (data || []) as PublicPost[];
    setPosts(pubList);
    let mineList: MyPost[] = [];
    if (session) {
      const { data: mineData } = await supabase.from('love_wall_posts')
        .select('id,author_id,recipient_name,category,content,is_anonymous,status,created_at')
        .eq('author_id', session.user.id)
        .order('created_at', { ascending: false }).limit(100);
      mineList = (mineData || []) as MyPost[];
      setMyPosts(mineList);
      if (mineList.some(x => x.status === 'pending')) setEstimates(await fetchReviewEstimates());
      else setEstimates(null);
    } else {
      setMyPosts([]);
      setEstimates(null);
    }
    const ids = [...pubList.map(x => x.id), ...mineList.map(x => x.id)];
    if (ids.length) {
      const { data: mrows } = await supabase.from('love_wall_media')
        .select('id,post_id,path,kind,sort').in('post_id', ids).order('sort');
      const rows = (mrows || []) as MediaRow[];
      if (rows.length) {
        const signed = await getSignedUrls('media', rows.map(r => r.path)).catch(() => ({} as Record<string, string>));
        const grouped: Record<string, MediaItem[]> = {};
        rows.forEach(r => { (grouped[r.post_id] = grouped[r.post_id] || []).push({ ...r, url: signed[r.path] }); });
        setMediaByPost(grouped);
      } else setMediaByPost({});
      const { data: crows } = await supabase.from('love_wall_comments')
        .select('post_id').in('post_id', ids).is('deleted_at', null);
      const cc: Record<string, number> = {};
      (crows || []).forEach(r => { cc[r.post_id] = (cc[r.post_id] || 0) + 1; });
      setCounts(cc);
    } else {
      setMediaByPost({});
      setCounts({});
    }
  }
  useEffect(() => { void load(); }, [session?.user.id]);

  useEffect(() => {
    if (!composing || !session) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.rpc('member_directory', {
        q: recipientSearch.trim(), lim: 50, skip: 0,
      });
      if (!active) return;
      setRecipientOptions(((data || []) as RecipientOption[]).filter(p => p.id !== session.user.id));
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [composing, recipientSearch, session?.user.id]);

  useEffect(() => {
    if (!session) { setIsAdmin(false); return; }
    supabase.rpc('my_role').then(({ data }) => setIsAdmin(data === 'admin' || data === 'super_admin'));
  }, [session]);

  async function openCompose() {
    setFormErr('');
    // 匿名开关的默认值取个人隐私设置（表白墙隐藏姓名）：读取失败或设置缺失时默认匿名。
    if (session) {
      const { data: privRow } = await supabase.from('profile_privacy').select('hide_love_wall_name').eq('profile_id', session.user.id).single();
      setAnon(privRow?.hide_love_wall_name !== false);
    }
    setRecipientId(''); setRecipientLabel(''); setRecipientSearch('');
    setComposing(true);
  }

  async function toggleComments(postId: string) {
    if (openId === postId) { setOpenId(null); return; }
    setOpenId(postId);
    if (commentsByPost[postId]) return;
    const { data } = await supabase.from('love_wall_comments')
      .select('id,post_id,author_id,content,created_at,deleted_at')
      .eq('post_id', postId).is('deleted_at', null).order('created_at');
    const rows = (data || []) as CommentRow[];
    const ids = [...new Set(rows.map(r => r.author_id))];
    const names: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id,username,display_name').in('id', ids);
      (profs || []).forEach(pr => { names[pr.id] = pr.display_name || pr.username || '班级同学'; });
    }
    setCommentsByPost(prev => ({ ...prev, [postId]: rows.map(r => ({ ...r, name: names[r.author_id] || '班级同学' })) }));
  }

  async function sendComment(postId: string) {
    if (!session || cBusy) return;
    const text = (drafts[postId] || '').trim();
    if (!text) return;
    setCBusy(true);
    const { data, error } = await supabase.from('love_wall_comments')
      .insert({ post_id: postId, author_id: session.user.id, content: text })
      .select('id,post_id,author_id,content,created_at,deleted_at').single();
    setCBusy(false);
    if (error || !data) { setNotice('评论发送失败：请确认你已加入班级后再试。'); return; }
    const row = data as CommentRow;
    setCommentsByPost(prev => ({ ...prev, [postId]: [...(prev[postId] || []), { ...row, name: '我' }] }));
    setCounts(prev => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
    setDrafts(prev => ({ ...prev, [postId]: '' }));
  }

  async function deleteComment(c: CommentItem) {
    const { error } = await supabase.from('love_wall_comments')
      .update({ deleted_at: new Date().toISOString() }).eq('id', c.id);
    if (error) { setNotice('删除失败，请稍后再试。'); return; }
    setCommentsByPost(prev => ({ ...prev, [c.post_id]: (prev[c.post_id] || []).filter(x => x.id !== c.id) }));
    setCounts(prev => ({ ...prev, [c.post_id]: Math.max(0, (prev[c.post_id] || 1) - 1) }));
  }

  async function deletePost(p: MyPost) {
    if (!session || session.user.id !== p.author_id || deletingPostId) return;
    const ok = await confirmDialog('删除后，这条投稿及其评论将无法恢复。确认删除？', {
      danger: true,
      confirmText: '删除投稿',
    });
    if (!ok) return;

    setDeletingPostId(p.id);
    const mediaPaths = (mediaByPost[p.id] || []).map(item => item.path);
    try {
      // 双重校验作者身份：前端限制按钮，数据库 RLS 再作最终授权。
      const { data, error } = await supabase.from('love_wall_posts')
        .delete()
        .eq('id', p.id)
        .eq('author_id', session.user.id)
        .select('id')
        .maybeSingle();
      if (error || !data) {
        setNotice(error ? '删除失败：当前账号没有删除权限，或网络暂时不可用。' : '没有找到可删除的投稿，请刷新后重试。');
        return;
      }

      // 帖子删除成功后再清理本人上传的对象；附件行和评论由外键级联清理。
      let mediaCleanupFailed = false;
      if (mediaPaths.length) {
        try {
          const { error: mediaError } = await supabase.storage.from('media').remove(mediaPaths);
          mediaCleanupFailed = Boolean(mediaError);
        } catch {
          mediaCleanupFailed = true;
        }
      }

      setMyPosts(prev => prev.filter(item => item.id !== p.id));
      setMediaByPost(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setCounts(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setCommentsByPost(prev => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setNotice(mediaCleanupFailed
        ? '投稿已删除，但部分附件文件暂未清理；帖子不会再显示。'
        : '投稿已删除。');
    } catch {
      setNotice('删除失败：网络暂时不可用，请稍后重试。');
    } finally {
      setDeletingPostId(null);
    }
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = [...(e.target.files || [])];
    e.target.value = '';
    if (!list.length) return;
    const next = [...pick];
    for (const f of list) {
      const isImg = f.type.startsWith('image/');
      const isVid = f.type.startsWith('video/');
      if (!ALLOWED_MEDIA_TYPES.has(f.type)) { setFormErr('仅支持 JPG、PNG、WebP、GIF、HEIC、AVIF 图片及 MP4、WebM、MOV 等常见视频。'); continue; }
      if (!isImg && !isVid) { setFormErr('只能添加照片或视频文件。'); continue; }
      if (isImg && next.filter(x => x.kind === 'image').length >= MAX_IMAGES) { setFormErr('照片最多添加 9 张。'); continue; }
      if (isVid && next.filter(x => x.kind === 'video').length >= MAX_VIDEOS) { setFormErr('视频最多添加 3 个。'); continue; }
      if (isImg && f.size > 10 * 1024 * 1024) { setFormErr('单张照片不能超过 10MB。'); continue; }
      if (isVid && f.size > 50 * 1024 * 1024) { setFormErr('单个视频不能超过 50MB。'); continue; }
      next.push({ file: f, kind: isImg ? 'image' : 'video', url: URL.createObjectURL(f) });
    }
    setPick(next);
  }

  function removePick(i: number) {
    setPick(prev => { const n = [...prev]; URL.revokeObjectURL(n[i].url); n.splice(i, 1); return n; });
  }

  async function publish() {
    if (!session) return;
    const text = content.trim();
    if (text.length < 2 || text.length > 500) { setFormErr('内容请填写 2–500 个字。'); return; }
    setBusy(true); setFormErr('');
    const uploaded: { path: string; kind: 'image' | 'video' }[] = [];
    let attachmentsCommitted = false;
    try {
      // 先把附件传到 media 桶自己的 love/ 目录，再写帖子与附件记录。
      for (let i = 0; i < pick.length; i++) {
        const it = pick[i];
        const f = it.kind === 'image' ? await downscaleImage(it.file) : it.file;
        const ext = (f.name.split('.').pop() || (it.kind === 'image' ? 'jpg' : 'mp4')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
        const path = `${session.user.id}/love/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage.from('media').upload(path, f, { contentType: f.type || undefined, upsert: false });
        if (upErr) throw new Error('附件上传失败，请检查网络后重试。');
        uploaded.push({ path, kind: it.kind });
      }
      // 匿名与否由发布表单里的开关决定（打开表单时按个人隐私设置初始化默认值）；历史帖子不受影响。
      const { data: post, error } = await supabase.from('love_wall_posts').insert({
        author_id: session.user.id, recipient_id: recipientId || null,
        recipient_name: recipientLabel || null,
        category, content: text, is_anonymous: anon, status: 'pending'
      }).select('id').single();
      if (error || !post) throw new Error('发布失败：请确认网站数据库迁移已执行。');
      let attachFailed = false;
      let cleanupFailed = false;
      if (uploaded.length) {
        const { error: mErr } = await supabase.from('love_wall_media').insert(
          uploaded.map((u, i) => ({ post_id: post.id, path: u.path, kind: u.kind, sort: i }))
        );
        if (mErr) {
          attachFailed = true;
          cleanupFailed = await cleanupUnlinkedLoveMedia(uploaded.map(item => item.path));
        } else {
          attachmentsCommitted = true;
        }
      }
      pick.forEach(x => URL.revokeObjectURL(x.url));
      setPick([]);
      setContent(''); setRecipientId(''); setRecipientLabel(''); setRecipientSearch('');
      setComposing(false);
      setMine(true);
      setNotice(attachFailed
        ? (cleanupFailed ? '投稿已提交，但附件关联失败且部分文件未清理，请联系管理员。' : '投稿已提交，附件没有关联成功，已清理未关联文件。')
        : recipientId ? '投稿已提交；审核通过后公开展示，收件人会收到匿名通知。' : '投稿已提交，审核通过后会展示在表白墙。');
      await load();
    } catch (err) {
      // 失败发生在附件记录提交之前时，清理已上传的文件，避免产生孤立对象。
      let cleanupFailed = false;
      if (uploaded.length && !attachmentsCommitted) {
        try { cleanupFailed = await cleanupUnlinkedLoveMedia(uploaded.map(item => item.path)); }
        catch { cleanupFailed = true; }
      }
      setFormErr((err instanceof Error ? err.message : '发布失败，请稍后再试。')
        + (cleanupFailed ? ' 部分附件未能确认或清理，请刷新「我的投稿」并联系管理员核对。' : ''));
    } finally {
      setBusy(false);
    }
  }

  const shown = mine ? myPosts : posts;
  return <main style={{ maxWidth: 760, margin: '0 auto', padding: '12px 0 110px', color: '#202124' }}>
    {/* 头部：只留标题与页签，发布收成一个按钮 */}
    <div style={{ padding: '6px 2px 0' }}>
      <div style={{ fontSize: 11, letterSpacing: 3, color: '#737b89' }}>OUR CLASS · LITTLE FEELINGS</div>
      <h1 style={{ fontSize: 27, margin: '8px 0 4px' }}>表白墙</h1>
      <p style={{ color: '#606673', lineHeight: 1.7, fontSize: 13, margin: 0 }}>把喜欢、感谢和没来得及说的话，留在青春档案里。</p>
    </div>

    <div style={{ display: 'flex', gap: 8, margin: '16px 2px 14px' }}>
      <button onClick={() => setMine(false)} style={mine ? ghost : segOn}>全部心意</button>
      <button onClick={() => setMine(true)} style={mine ? segOn : ghost}>我的投稿</button>
    </div>

    {notice && <p role="status" style={{ background: '#f2f5fb', border: '1px solid #dfe6f2', borderRadius: 12, padding: '10px 12px', color: '#333946', fontSize: 12.5, lineHeight: 1.6, margin: '0 2px 12px' }}>{notice}</p>}

    {/* 信息流：和班级动态一样的时间流卡片 */}
    {shown.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#606673', border: '1px dashed #dfe3ea', borderRadius: 18 }}>{mine ? '你还没有投稿，点右下角按钮写下第一份心意吧。' : '这里还没有内容，点右下角按钮写下第一份温柔的心意吧。'}</div>}
    <div style={{ display: 'grid', gap: 12 }}>
      {shown.map(p => {
        const cc = catColor[p.category] || { bg: '#eef1f6', fg: '#5a6472' };
        const statusText = p.status === 'pending' ? '审核中' : p.status === 'rejected' ? '未通过' : p.status === 'hidden' ? '已隐藏' : timeAgo(p.created_at);
        const est = mine && p.status === 'pending' ? estimates?.byId.get(p.id) : undefined;
        const canDelete = mine && !!session?.user.id && (p as MyPost).author_id === session.user.id;
        return <article key={p.id} style={{ padding: 17, borderRadius: 18, border: '1px solid #e9ebf0', background: '#fff', boxShadow: '0 8px 28px #202a3d0a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, background: cc.bg, color: cc.fg, borderRadius: 999, padding: '4px 10px' }}>{p.category}</span>
            <span style={{ fontSize: 11, color: '#8a93a1' }}>{statusText}</span>
          </div>
          {p.recipient_name && <div style={{ marginTop: 10, fontSize: 12.5, color: '#333946' }}>TO · <b>{p.recipient_name}</b></div>}
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: '10px 0 12px', overflowWrap: 'anywhere', fontSize: 14.5 }}>{p.content}</p>
          {(mediaByPost[p.id] || []).length > 0 && <LoveMediaGrid items={mediaByPost[p.id]} />}
          <div style={{ fontSize: 11, color: '#606673' }}>{p.is_anonymous ? '匿名同学' : (mine ? '我发布的' : ((p as PublicPost).author_display_name || '班级同学'))} · {p.status === 'pending' ? '审核通过后公开展示' : p.status === 'published' ? '已公开展示' : '未公开展示'}</div>
          {est && <div style={{ fontSize: 11, color: '#606673', marginTop: 4 }}>{estimateText(est, estimates?.adminActive ?? false)}</div>}
          {canDelete && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 9, borderTop: '1px solid #f0f2f6' }}>
              <button
                type="button"
                disabled={deletingPostId === p.id}
                onClick={() => void deletePost(p as MyPost)}
                style={{ border: '1px solid #f0d8dc', borderRadius: 999, padding: '7px 12px', background: '#fff7f8', color: '#ad394b', fontSize: 12, fontWeight: 700, cursor: deletingPostId === p.id ? 'wait' : 'pointer' }}
              >
                {deletingPostId === p.id ? '删除中…' : '删除投稿'}
              </button>
            </div>
          )}
          {p.status === 'published' && (
            <div style={{ marginTop: 10, borderTop: '1px solid #f0f2f6', paddingTop: 10 }}>
              <button onClick={() => void toggleComments(p.id)} style={{ border: 0, background: 'transparent', color: '#5a6472', fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
                评论{counts[p.id] ? `（${counts[p.id]}）` : ''} {openId === p.id ? '▲' : '▼'}
              </button>
              {openId === p.id && (
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                  {(commentsByPost[p.id] || []).length === 0 && <div style={{ fontSize: 12, color: '#8a93a1' }}>还没有评论，来写第一条吧。</div>}
                  {(commentsByPost[p.id] || []).map(c => (
                    <div key={c.id} style={{ fontSize: 13, lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 700, color: '#333946' }}>{c.name}</span>
                      <span style={{ color: '#8a93a1', fontSize: 11, marginLeft: 6 }}>{timeAgo(c.created_at)}</span>
                      {(session?.user.id === c.author_id || isAdmin) && <button onClick={() => void deleteComment(c)} style={{ border: 0, background: 'transparent', color: '#b3261e', fontSize: 11, cursor: 'pointer', marginLeft: 6, padding: 0 }}>删除</button>}
                      <div style={{ color: '#202124', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.content}</div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={drafts[p.id] || ''} onChange={e => setDrafts(prev => ({ ...prev, [p.id]: e.target.value }))} maxLength={300} placeholder="写评论…" style={{ ...field, padding: '9px 12px' }} onKeyDown={e => { if (e.key === 'Enter') void sendComment(p.id); }} />
                    <button onClick={() => void sendComment(p.id)} disabled={cBusy} style={{ ...primary, padding: '9px 16px', flex: '0 0 auto' }}>发送</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </article>;
      })}
    </div>

    {/* 唯一的发布入口：悬浮按钮（避开底部 Dock） */}
    <button onClick={() => { void openCompose(); }} aria-label="写表白"
      style={{ position: 'fixed', right: 18, bottom: 'calc(92px + env(safe-area-inset-bottom))', zIndex: 60, border: 0, borderRadius: 999, padding: '13px 20px', background: 'linear-gradient(135deg,#e0567a,#c22f3d)', color: '#fff', fontWeight: 800, fontSize: 14, boxShadow: '0 12px 28px rgba(194,47,61,.35)', cursor: 'pointer' }}>
      写表白
    </button>

    {/* 发布面板：底部弹层，字段与原来的投稿表单一致 */}
    {composing && (
      <div role="dialog" aria-modal="true" aria-label="写表白"
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(16,20,28,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        onClick={() => !busy && setComposing(false)}>
        <section onClick={e => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 620, maxHeight: '88dvh', overflowY: 'auto', background: '#fff', borderRadius: '22px 22px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <b style={{ fontSize: 16 }}>写表白</b>
            <button onClick={() => !busy && setComposing(false)} aria-label="关闭" style={{ border: 0, background: '#f2f4f7', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 14, color: '#333946' }}>✕</button>
          </div>
          <label style={{ display: 'block', fontSize: 12, color: '#606673', margin: '14px 0 6px' }}>投稿类型</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                style={{ padding: '8px 14px', borderRadius: 999, border: `1px solid ${category === c ? '#58aeb0' : '#dfe3ea'}`, background: category === c ? 'rgba(88,174,176,.10)' : '#fff', color: '#202124', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>{c}</button>
            ))}
          </div>
          <label style={{ display: 'block', fontSize: 12, color: '#606673', margin: '12px 0 6px' }}>收件人（选填）</label>
          <input value={recipientSearch} onChange={e => setRecipientSearch(e.target.value)} maxLength={40} placeholder="搜索班级成员姓名或用户名" style={field} />
          <OptionSheet title="选择收件人" value={recipientId}
            buttonText={recipientId ? (recipientLabel || '已选收件人') : '不指定收件人'}
            buttonStyle={{ ...field, marginTop: 8, justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}
            options={[{ value: '', label: '不指定收件人' }, ...recipientOptions.map(p => ({ value: p.id as string, label: p.display_name || p.username }))]}
            onChange={v => {
              const selected = recipientOptions.find(p => p.id === v);
              setRecipientId(v);
              setRecipientLabel(selected ? (selected.display_name || selected.username) : '');
            }} />
          {recipientId && <div style={{ fontSize: 11, color: '#606673', marginTop: 5 }}>收件人会在投稿审核通过后收到通知；投稿者身份仍只对管理员可见。</div>}
          <label style={{ display: 'block', fontSize: 12, color: '#606673', margin: '12px 0 6px' }}>写下你的心意</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} maxLength={500} rows={4} placeholder="请尊重他人，不要发布联系方式、隐私或让对方不舒服的内容。" style={{ ...field, resize: 'vertical' }} />
          <label style={{ display: 'block', fontSize: 12, color: '#606673', margin: '12px 0 6px' }}>添加照片 / 视频（选填）</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {pick.map((x, i) => (
              <div key={i} style={{ position: 'relative', width: 76, height: 76, borderRadius: 12, overflow: 'hidden', background: '#f2f4f7', border: '1px solid #e9ebf0' }}>
                {x.kind === 'image'
                  ? <img src={x.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <video src={x.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />}
                <button onClick={() => removePick(i)} aria-label="移除附件" style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', border: 0, background: 'rgba(16,20,28,.65)', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: '20px', padding: 0 }}>✕</button>
              </div>
            ))}
            <button onClick={() => fileRef.current?.click()} style={{ width: 76, height: 76, borderRadius: 12, border: '1px dashed #c9d1de', background: '#fbfcfe', color: '#606673', fontSize: 22, cursor: 'pointer' }}>＋</button>
          </div>
          <div style={{ fontSize: 11.5, color: '#8a93a1', marginTop: 6 }}>照片最多 9 张，视频最多 3 个（单个不超过 50MB）</div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif,video/mp4,video/webm,video/quicktime,video/ogg,video/x-m4v,video/3gpp" multiple hidden onChange={onPickFiles} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '14px 0 4px' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#202632' }}>匿名发布</div>
              <div style={{ fontSize: 12, color: '#606673', marginTop: 2, lineHeight: 1.5 }}>{anon ? '开启：墙上显示为「匿名同学」，不显示你的名字' : '关闭：墙上会显示你的名字'}</div>
            </div>
            <button type="button" role="switch" aria-checked={anon} aria-label="匿名发布" onClick={() => setAnon(v => !v)}
              style={{ flex: '0 0 auto', width: 46, height: 26, borderRadius: 999, border: 0, padding: 2, cursor: 'pointer', background: anon ? '#202632' : '#d8dde6', transition: 'background .15s' }}>
              <span style={{ display: 'block', width: 22, height: 22, borderRadius: '50%', background: '#fff', transform: anon ? 'translateX(20px)' : 'translateX(0)', transition: 'transform .15s' }} />
            </button>
          </div>
          <div style={{ margin: '6px 0 12px', fontSize: 12, color: '#606673', lineHeight: 1.6 }}>开关默认按个人中心的隐私设置（表白墙隐藏姓名），每次发帖都能单独改；只影响新帖子。</div>
          {formErr && <p role="status" style={{ color: '#b3261e', fontSize: 12, lineHeight: 1.6 }}>{formErr}</p>}
          <button onClick={publish} disabled={busy} style={{ ...primary, width: '100%' }}>{busy ? '提交中…' : '提交审核'}</button>
        </section>
      </div>
    )}
  </main>;
}

function LoveMediaGrid({ items }: { items: MediaItem[] }) {
  const imgs = items.filter(i => i.kind === 'image');
  const vids = items.filter(i => i.kind === 'video');
  return <div style={{ margin: '2px 0 10px' }}>
    {imgs.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: imgs.length === 1 ? '1fr' : 'repeat(3, 1fr)', gap: 6 }}>
      {imgs.map(m => m.url
        ? <a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: imgs.length === 1 ? 'auto' : '1 / 1', maxHeight: imgs.length === 1 ? 340 : undefined, objectFit: 'cover', borderRadius: 12, display: 'block' }} /></a>
        : <div key={m.id} style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, background: '#f2f4f7' }} />)}
    </div>}
    {vids.map(m => m.url
      ? <video key={m.id} src={m.url} controls playsInline preload="metadata" style={{ width: '100%', borderRadius: 12, marginTop: 6, background: '#000', maxHeight: 380, display: 'block' }} />
      : null)}
  </div>;
}

const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #dfe3ea', background: '#fff', color: '#202124', padding: '11px 12px', borderRadius: 12, outline: 'none', font: 'inherit', fontSize: 13 };
const primary: React.CSSProperties = { border: 0, borderRadius: 999, padding: '11px 18px', background: '#202632', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const ghost: React.CSSProperties = { border: '1px solid #dfe3ea', borderRadius: 999, padding: '7px 14px', background: '#fff', color: '#333946', cursor: 'pointer', fontSize: 12.5 };
const segOn: React.CSSProperties = { border: '1px solid #202632', borderRadius: 999, padding: '7px 14px', background: '#202632', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 };
