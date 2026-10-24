import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { downscaleImage, uploadMedia, useSignedUrl } from '../lib/media';

type ClassInfo = { id: string; school_id: string; name: string; description: string | null };
type MemberRow = { class_id: string; profile_id: string; role: string; status: string };
type Post = { id: number; author_id: string; content: string; image_url: string | null; created_at: string };
type Comment = { id: number; post_id: number; author_id: string; content: string; created_at: string };
type Profile = { id: string; username: string; display_name: string | null; avatar_path: string | null };

function ClassAvatar({ profile, size = 38 }: { profile?: Profile; size?: number }) {
  const url = useSignedUrl('avatars', profile?.avatar_path);
  return <span className="class-detail-avatar" style={{ width: size, height: size, flexBasis: size }}>{url ? <img src={url} alt="" /> : (profile?.display_name || profile?.username || '同').slice(0, 1)}</span>;
}
function ClassPostImage({ path }: { path: string }) {
  const url = useSignedUrl('media', path);
  return url ? <img className="class-detail-image" src={url} alt="动态配图" loading="lazy" /> : null;
}
function classTime(value: string) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前';
  return new Date(value).toLocaleDateString();
}

export default function ClassDetail() {
  const { id = '' } = useParams();
  const me = useAuth().session!.user.id;
  const [info, setInfo] = useState<ClassInfo | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Record<number, Comment[]>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [draft, setDraft] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [commentOpen, setCommentOpen] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    const { data: classData, error: classError } = await supabase.from('classes')
      .select('id,school_id,name,description').eq('id', id).maybeSingle();
    if (classError || !classData) {
      setError(classError?.message || '没有找到这个班级，或你没有访问权限。');
      setInfo(null); setLoading(false); return;
    }
    const classInfo = classData as ClassInfo;
    setInfo(classInfo);
    const { data: myMembership, error: memberError } = await supabase.from('class_memberships')
      .select('class_id,profile_id,role,status').eq('class_id', id).eq('profile_id', me).maybeSingle();
    if (memberError) {
      setError(memberError.message); setLoading(false); return;
    }
    if (!myMembership || myMembership.status !== 'active') {
      setAllowed(false); setPosts([]); setMembers([]); setLoading(false); return;
    }
    setAllowed(true);
    const [postResult, memberResult] = await Promise.all([
      supabase.from('posts').select('id,author_id,content,image_url,created_at')
        .eq('class_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(40),
      supabase.from('class_memberships').select('class_id,profile_id,role,status')
        .eq('class_id', id).eq('status', 'active'),
    ]);
    if (postResult.error) setError(postResult.error.message);
    const postRows = (postResult.data || []) as Post[];
    setPosts(postRows); setMembers((memberResult.data || []) as MemberRow[]);
    const ids = [...new Set([...postRows.map(row => row.author_id), ...((memberResult.data || []) as MemberRow[]).map(row => row.profile_id)])];
    if (ids.length) {
      const { data: directory } = await supabase.rpc('member_directory', { q: '', lim: 50, skip: 0 });
      const profileMap: Record<string, Profile> = {};
      ((directory || []) as Profile[]).filter(profile => ids.includes(profile.id))
        .forEach(profile => { profileMap[profile.id] = profile; });
      setProfiles(profileMap);
    } else setProfiles({});
    if (postRows.length) {
      const { data: commentRows } = await supabase.from('comments')
        .select('id,post_id,author_id,content,created_at').in('post_id', postRows.map(row => row.id))
        .is('deleted_at', null).order('created_at', { ascending: true });
      const commentMap: Record<number, Comment[]> = {};
      ((commentRows || []) as Comment[]).forEach(row => { (commentMap[row.post_id] ||= []).push(row); });
      setComments(commentMap);
    } else setComments({});
    setLoading(false);
  }, [id, me]);

  useEffect(() => { load(); }, [load]);

  async function publish(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() && !image) return;
    setBusy(true); setNotice(''); setError('');
    try {
      let imagePath: string | null = null;
      if (image) imagePath = await uploadMedia('media', await downscaleImage(image));
      const { error: insertError } = await supabase.from('posts').insert({
        author_id: me, content: draft.trim(), image_url: imagePath,
        school_id: info?.school_id, class_id: id,
      });
      if (insertError) throw insertError;
      setDraft(''); setImage(null); setNotice('动态已发布。');
      await load();
    } catch (e: any) {
      setError('发布失败：' + (e?.message || '网络错误'));
    } finally { setBusy(false); }
  }

  async function addComment(post: Post) {
    const text = (commentDrafts[post.id] || '').trim();
    if (!text) return;
    setBusy(true);
    const { error: commentError } = await supabase.from('comments').insert({
      post_id: post.id, author_id: me, content: text.slice(0, 500),
    });
    setBusy(false);
    if (commentError) setError('评论失败：' + commentError.message);
    else {
      setCommentDrafts(prev => ({ ...prev, [post.id]: '' }));
      const { data } = await supabase.from('comments')
        .select('id,post_id,author_id,content,created_at').eq('post_id', post.id)
        .is('deleted_at', null).order('created_at', { ascending: true });
      setComments(prev => ({ ...prev, [post.id]: (data || []) as Comment[] }));
    }
  }

  if (loading) return <div className="center">正在打开班级空间…</div>;
  if (!info && error) return <main className="class-detail-page"><div className="class-detail-state"><b>暂时无法打开这个班级</b><p>{error}</p><Link to="/classes">返回班级空间</Link></div></main>;
  if (!info) return null;
  if (!allowed) return <main className="class-detail-page"><header className="class-detail-hero"><span>PRIVATE CLASS SPACE</span><h1>{info.name}</h1><p>这个空间只对通过审核的班级成员开放。</p></header><div className="class-detail-state"><b>你还没有加入这个班级</b><p>请使用班级邀请码提交申请，等待管理员审核后再访问班级动态。</p><Link to="/classes">前往加入班级 →</Link></div></main>;

  return (
    <main className="class-detail-page">
      <header className="class-detail-hero">
        <Link to="/classes" className="class-detail-back">← 所有班级</Link>
        <span className="class-detail-eyebrow">PRIVATE CLASS COMMUNITY</span>
        <h1>{info.name}</h1>
        <p>{info.description || '属于这个班级的小小空间。分享日常、记录活动、和同学一起留下回忆。'}</p>
        <div className="class-detail-meta"><span>{members.length} 位成员</span><span>仅班级成员可见</span></div>
      </header>

      <div className="class-detail-layout">
        <section className="class-detail-main">
          <form className="class-detail-composer" onSubmit={publish}>
            <div className="class-detail-composer-heading"><b>分享一条班级动态</b><span>CLASS FEED</span></div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="今天班里发生了什么？" maxLength={2000} rows={3} />
            {image && <div className="class-detail-file">{image.name}<button type="button" onClick={() => setImage(null)}>移除</button></div>}
            <div className="class-detail-composer-actions"><label className="class-detail-file-button">添加照片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setImage(e.target.files?.[0] || null)} /></label><button type="submit" disabled={busy || (!draft.trim() && !image)}>{busy ? '发布中…' : '发布动态 →'}</button></div>
          </form>
          {notice && <p className="class-detail-notice">{notice}</p>}
          {error && <p className="class-detail-error">{error}</p>}
          <div className="class-detail-feed-heading"><div><span>OUR MOMENTS</span><h2>班级动态</h2></div><button onClick={load}>刷新</button></div>
          {posts.length ? <div className="class-detail-posts">{posts.map(post => {
            const postComments = comments[post.id] || [];
            return <article className="class-detail-post" key={post.id}>
              <div className="class-detail-post-author"><ClassAvatar profile={profiles[post.author_id]} /><div><b>{profiles[post.author_id]?.display_name || profiles[post.author_id]?.username || '班级成员'}</b><small>{classTime(post.created_at)}</small></div></div>
              {post.content && <p className="class-detail-post-content">{post.content}</p>}
              {post.image_url && <ClassPostImage path={post.image_url} />}
              <button className="class-detail-comment-toggle" onClick={() => setCommentOpen(prev => ({ ...prev, [post.id]: !prev[post.id] }))}>评论 · {postComments.length}</button>
              {commentOpen[post.id] && <div className="class-detail-comments">
                {postComments.map(comment => <div className="class-detail-comment" key={comment.id}><ClassAvatar size={28} profile={profiles[comment.author_id]} /><div><b>{profiles[comment.author_id]?.display_name || profiles[comment.author_id]?.username || '班级成员'}</b><p>{comment.content}</p></div></div>)}
                <form className="class-detail-comment-form" onSubmit={e => { e.preventDefault(); addComment(post); }}><input value={commentDrafts[post.id] || ''} onChange={e => setCommentDrafts(prev => ({ ...prev, [post.id]: e.target.value }))} placeholder="写下你的评论…" maxLength={500} /><button disabled={busy || !(commentDrafts[post.id] || '').trim()}>发送</button></form>
              </div>}
            </article>;
          })}</div> : <div className="class-detail-state"><b>班级动态还没有开始</b><p>发布第一条动态，和同学一起开启这里的故事。</p></div>}
        </section>
        <aside className="class-detail-members"><div className="class-detail-members-heading"><b>班级成员</b><span>{members.length}</span></div>{members.map(member => <div className="class-detail-member" key={member.profile_id}><ClassAvatar profile={profiles[member.profile_id]} size={34} /><div><b>{profiles[member.profile_id]?.display_name || profiles[member.profile_id]?.username || '班级成员'}</b><small>{member.role === 'class_admin' ? '班级管理员' : '班级成员'}</small></div></div>)}</aside>
      </div>
    </main>
  );
}
