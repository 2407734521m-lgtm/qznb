import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import './PostList.layout.css';
import './PostList.longform.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrls, uploadMedia, uploadMediaWithProgress, downscaleImage, removeOwnedMedia } from '../lib/media';
import { timeAgo } from '../lib/time';
import { withRetry } from '../lib/retry';
import type { ProfileSummary as Profile } from '../types/profile';
import type { FeedPost as Post, FeedComment as Cmt } from '../types/content';
import { confirmDialog, alertDialog, promptDialog } from '../lib/dialog';
import { toast } from 'sonner';
import BlurImg from './fx/BlurImg';
import ShimmerButton from './fx/ShimmerButton';
import SmoothProgress from './fx/SmoothProgress';
import { FeedSkeleton, useDelayedLoading } from './fx/Skeleton';

type ImpressionPollOption = { id: number; label: string; voteCount: number };
type ImpressionPoll = {
  question: string;
  totalVotes: number;
  myOptionId: number | null;
  options: ImpressionPollOption[];
};
const DEFAULT_IMPRESSION_OPTIONS = ['阳光开朗', '安静慢热', '幽默有趣', '认真靠谱'];
const PAGE_SIZE = 30;


function Avatar({ p, url, size = 42 }: { p?: Profile; url?: string; size?: number }) {
  return (
    <div className="av" style={{ width: size, height: size }}>
      {url ? <BlurImg src={url} alt="" loading="eager" /> : <span>{(p?.display_name ?? p?.username ?? '?').slice(0, 1)}</span>}
    </div>
  );
}
function PostImg({ url }: { url?: string }) {
  return url ? <BlurImg className="bdimg" src={url} alt="" /> : null;
}


export type PostSection = 'feed' | 'daily';

/**
 * 三栏动态流外壳（版式借自 Socially 的左导航/中动态流/右信息栏，只借排布不抄代码）。
 * 嵌入模式（表白墙内嵌的日常）不套三栏，保持原单栏；数据逻辑一律不动。
 */
const POST_LIST_RAIL_LINKS = [
  { to: '/feed', label: '动态' },
  { to: '/daily', label: '日常' },
  { to: '/love-wall', label: '表白墙' },
  { to: '/explore', label: '发现' },
  { to: '/home', label: '首页' },
];

function PostListShell({ embedded, side, children }: { embedded: boolean; side: ReactNode; children: ReactNode }) {
  if (embedded) return <>{children}</>;
  return (
    <div className="pl-shell">
      <nav className="pl-rail" aria-label="动态相关导航">
        <p className="pl-rail__title">去看看</p>
        {POST_LIST_RAIL_LINKS.map(link => (
          <NavLink key={link.to} to={link.to} className={({ isActive }) => isActive ? 'pl-rail__link is-active' : 'pl-rail__link'}>
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="pl-main">{children}</div>
      <aside className="pl-side" aria-label="动态信息">{side}</aside>
    </div>
  );
}

/** 右栏信息卡：只展示已加载数据的派生统计，不新增任何请求。 */
function PostListSidePanels({ section, loadedCount, myCount, totalLikes }: {
  section: PostSection; loadedCount: number; myCount: number; totalLikes: number;
}) {
  const isFeed = section === 'feed';
  return (
    <>
      <section className="pl-panel" aria-label={isFeed ? '关于动态' : '关于日常'}>
        <h2 className="pl-panel__title">{isFeed ? '关于动态' : '关于日常'}</h2>
        <p className="pl-panel__body">
          {isFeed
            ? '在这里发一条动态，或发起一次匿名印象投票。全部动态可以看到所有同学的内容，切到好友动态只看好友。'
            : '记录生活里的小片段：今天吃了什么、看到了什么、想到了什么，都可以留在这里。'}
        </p>
      </section>
      <section className="pl-panel" aria-label="本页统计">
        <h2 className="pl-panel__title">本页统计</h2>
        <div className="pl-panel__stat"><span>已加载</span><strong>{loadedCount} 条</strong></div>
        <div className="pl-panel__stat"><span>其中我的</span><strong>{myCount} 条</strong></div>
        <div className="pl-panel__stat"><span>共收到赞</span><strong>{totalLikes} 个</strong></div>
      </section>
    </>
  );
}

export default function PostList({ section, searchQuery = '', embedded = false, focusPostId = null }: { section: PostSection; searchQuery?: string; embedded?: boolean; focusPostId?: number | null }) {
  const nav = useNavigate();
  const me = useAuth().session!.user.id; const reduce = useReducedMotion();
  const isFeed = section === 'feed';
  const [posts, setPosts] = useState<Post[]>([]);
  // 首屏骨架只显示一次：搜索换词会重复拉取，那时列表留在原地不闪骨架。
  const [initialLoading, setInitialLoading] = useState(true);
  const showSkeleton = useDelayedLoading(initialLoading);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const avatarUrls = useSignedUrls('avatars', Object.values(profiles).map(p => p.avatar_path));
  const postImageUrls = useSignedUrls('media', posts.map(p => p.image_url));
  const [likes, setLikes] = useState<Record<number, number>>({});
  const [liked, setLiked] = useState<Record<number, boolean>>({});
  const [cmts, setCmts] = useState<Record<number, Cmt[]>>({});
  const [openCmt, setOpenCmt] = useState<Record<number, boolean>>({});
  const [cmtText, setCmtText] = useState<Record<number, string>>({});
  const [sendingComment, setSendingComment] = useState<Record<number, boolean>>({});
  const [highlightedPostId, setHighlightedPostId] = useState<number | null>(null);
  const focusedPostRef = useRef<number | null>(null);
  const [text, setText] = useState(''); const [img, setImg] = useState<File | null>(null);
  const [impressionEnabled, setImpressionEnabled] = useState(false);
  const [impressionQuestion, setImpressionQuestion] = useState('你觉得我给人的第一印象是？');
  const [impressionOptions, setImpressionOptions] = useState<string[]>(DEFAULT_IMPRESSION_OPTIONS);
  const [impressionPolls, setImpressionPolls] = useState<Record<number, ImpressionPoll>>({});
  const [votingPostId, setVotingPostId] = useState<number | null>(null);
  const [upPct, setUpPct] = useState<number | null>(null);
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
  const [feedScope, setFeedScope] = useState<'all' | 'friends'>('all');
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const fref = useRef<HTMLInputElement>(null);

  async function refreshImpressionPolls(postIds: number[]) {
    if (!postIds.length) return;
    const { data: pollRows, error } = await (supabase as any).rpc(
      'get_post_impression_poll_results',
      { p_post_ids: postIds },
    );
    // Keep the last known results when a transient request fails.
    if (error) return;

    const grouped: Record<number, ImpressionPoll> = {};
    for (const row of (pollRows ?? []) as Array<Record<string, any>>) {
      const postId = Number(row.post_id);
      if (!Number.isFinite(postId)) continue;
      if (!grouped[postId]) {
        grouped[postId] = {
          question: String(row.question ?? ''),
          totalVotes: Number(row.total_votes ?? 0),
          myOptionId: row.my_option_id == null ? null : Number(row.my_option_id),
          options: [],
        };
      }
      grouped[postId].options.push({
        id: Number(row.option_id),
        label: String(row.option_label ?? ''),
        voteCount: Number(row.vote_count ?? 0),
      });
    }
    setImpressionPolls(current => {
      const next = { ...current };
      postIds.forEach(postId => { delete next[postId]; });
      return { ...next, ...grouped };
    });
  }

  async function load(append = false) {
    try {
    const offset = append ? posts.length : 0;
    let postQuery = supabase.from('posts').select('*').eq('section', section).is('deleted_at', null)
      .order('created_at', { ascending: false }).range(offset, offset + PAGE_SIZE - 1);
    if (searchQuery.trim()) postQuery = postQuery.ilike('content', `%${searchQuery.trim()}%`);
    const { data: ps } = await postQuery;
    const list = ps ?? [];
    if (append) setPosts(current => [...current, ...list]); else setPosts(list);
    setHasMore(list.length === PAGE_SIZE);
    // 帖子一上屏就撤掉骨架屏，不等点赞/评论等附属数据慢慢回来；
    // 附属查询中途出错也不让骨架永远赖在列表底部（finally 兜底）。
    setInitialLoading(false);
    if (!list.length) { if (isFeed) setImpressionPolls({}); return; }
    const ids = [...new Set(list.map(p => p.author_id))];
    const pids = list.map(p => p.id);
    if (isFeed) await refreshImpressionPolls(pids);
    const { data: pr } = await supabase.from('profiles').select('id, username, display_name, avatar_path').in('id', ids);
    const pm: Record<string, Profile> = {};
    (pr ?? []).forEach((x) => { pm[x.id] = x; });
    if (append) setProfiles(current => ({ ...current, ...pm })); else setProfiles(pm);
    const { data: lk } = await supabase.from('post_likes').select('post_id, profile_id').in('post_id', pids);
    const cnt: Record<number, number> = {}; const mine: Record<number, boolean> = {};
    (lk ?? []).forEach((r: any) => { cnt[r.post_id] = (cnt[r.post_id] || 0) + 1; if (r.profile_id === me) mine[r.post_id] = true; });
    if (append) { setLikes(current => ({ ...current, ...cnt })); setLiked(current => ({ ...current, ...mine })); }
    else { setLikes(cnt); setLiked(mine); }
    const { data: cs } = await supabase.from('comments').select('*').is('deleted_at', null).in('post_id', pids).order('created_at');
    const cm: Record<number, Cmt[]> = {}; const aids = new Set<string>();
    (cs ?? []).forEach((c: any) => { (cm[c.post_id] = cm[c.post_id] || []).push(c); aids.add(c.author_id); });
    if (append) setCmts(current => ({ ...current, ...cm })); else setCmts(cm);
    const missing = [...aids].filter(a => !pm[a]);
    if (missing.length) {
      const { data: pr2 } = await supabase.from('profiles').select('id, username, display_name, avatar_path').in('id', missing);
      const pm2 = { ...pm };
      (pr2 ?? []).forEach((x) => { pm2[x.id] = x; });
      if (append) setProfiles(current => ({ ...current, ...pm2 })); else setProfiles(pm2);
    }
    const { data: r } = await supabase.rpc('my_role');
    setIsAdmin(r === 'admin' || r === 'super_admin');
    } finally {
      setInitialLoading(false);
    }
  }
  useEffect(() => { void load(); }, [searchQuery]);

  async function loadMore() {
    if (loadingMore || !hasMore || initialLoading) return;
    setLoadingMore(true);
    try { await load(true); } finally { setLoadingMore(false); }
  }
  useEffect(() => {
    if (!focusPostId || focusedPostRef.current === focusPostId || !posts.some(post => post.id === focusPostId)) return;
    focusedPostRef.current = focusPostId;
    setHighlightedPostId(focusPostId);
    setOpenCmt(current => ({ ...current, [focusPostId]: true }));
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`${section}-post-${focusPostId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      target.focus({ preventScroll: true });
    });
    const timer = window.setTimeout(() => {
      setHighlightedPostId(current => current === focusPostId ? null : current);
    }, 2400);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusPostId, posts, reduce]);
  useEffect(() => {
    if (!isFeed) return;
    let alive = true;
    supabase.rpc('my_friends').then(
      ({ data, error }) => {
        if (!alive || error) return;
        setFriendIds(((data ?? []) as Array<{ id: string }>).map(item => item.id));
      },
      () => { /* 好友列表读取失败时保留全部动态视图 */ }
    );
    return () => { alive = false; };
  }, [me]);

  async function publish() {
    const question = impressionQuestion.trim();
    const options = impressionOptions.map(option => option.trim());
    if (isFeed) {
      if (!text.trim() && !img && !impressionEnabled) return setErr('写点什么再发布吧');
    } else if (!text.trim() && !img) {
      return toast.error('写点什么再发布吧');
    }
    if (impressionEnabled) {
      if (question.length < 2 || question.length > 120) return setErr('投票问题请填写 2–120 个字。');
      if (options.length < 2 || options.length > 8 || options.some(option => !option || option.length > 40)) {
        return setErr('请填写 2–8 个选项，每项不超过 40 个字。');
      }
      if (new Set(options.map(option => option.toLocaleLowerCase())).size !== options.length) {
        return setErr('投票选项不能重复。');
      }
    }
    setBusy(true); setErr('');
    let uploadedPath: string | null = null;
    try {
      let image_url: string | null = null;
      if (img) {
        image_url = await uploadMediaWithProgress('media', await downscaleImage(img), undefined, pct => setUpPct(pct));
        uploadedPath = image_url;
      }
      const content = text.trim() || (impressionEnabled ? '来收集一下大家对我的印象吧。' : '');
      const { data: createdPost, error } = await withRetry(() =>
        supabase.from('posts').insert({ author_id: me, content, image_url, section }).select('id').single()
      );
      if (error) throw error;
      if (!createdPost?.id) throw new Error('帖子发布后没有返回记录编号。');
      if (impressionEnabled) {
        const { error: pollError } = await (supabase as any).rpc('create_post_impression_poll', {
          p_post_id: createdPost.id,
          p_question: question,
          p_options: options,
        });
        if (pollError) {
          await supabase.from('posts').delete().eq('id', createdPost.id).eq('author_id', me);
          throw pollError;
        }
      }
      // 帖子记录已引用该文件，之后不再把它当作失败上传清理。
      uploadedPath = null;
      setText(''); setImg(null);
      if (impressionEnabled) {
        setImpressionEnabled(false);
        setImpressionQuestion('你觉得我给人的第一印象是？');
        setImpressionOptions(DEFAULT_IMPRESSION_OPTIONS);
      }
      if (isFeed) {
        await load();
      } else {
        if (fref.current) fref.current.value = '';
        void load();
      }
      toast.success('发布成功');
    } catch (e: any) {
      const failure = e.message || '网络错误';
      if (isFeed) {
        if (uploadedPath) await removeOwnedMedia(uploadedPath, me);
        toast.error('发布失败：' + failure);
      } else if (!uploadedPath) {
        setErr('发布失败：' + failure);
      } else {
        // 网络错误可能发生在服务端提交成功之后；先确认没有帖子引用该图片，再清理。
        const { data: linkedPost, error: checkError } = await supabase.from('posts')
          .select('id').eq('image_url', uploadedPath).maybeSingle();
        if (checkError) {
          setErr('发布结果暂时无法确认，请刷新列表核对；为避免误删，暂未清理图片。');
        } else if (linkedPost) {
          setErr('已找到引用该图片的帖子，提交可能已成功。请刷新列表确认，避免重复发布。');
          void load();
        } else {
          const cleanupError = await removeOwnedMedia(uploadedPath, me);
          setErr('发布失败：' + failure + (cleanupError ? '；图片清理失败：' + cleanupError : ''));
        }
      }
    }
    finally { setBusy(false); setUpPct(null); }
  }

  async function toggleLike(p: Post) {
    if (liked[p.id]) {
      await supabase.from('post_likes').delete().eq('post_id', p.id).eq('profile_id', me);
    } else {
      await supabase.from('post_likes').insert({ post_id: p.id, profile_id: me });
    }
    load();
  }

  async function voteForImpression(p: Post, optionId: number) {
    if (p.author_id === me || votingPostId === p.id) return;
    const previousPoll = impressionPolls[p.id];
    if (!previousPoll || previousPoll.myOptionId === optionId) return;

    // Update the card immediately; reconcile with the server without reloading the feed.
    const previousOptionId = previousPoll.myOptionId;
    const optimisticPoll: ImpressionPoll = {
      ...previousPoll,
      totalVotes: previousPoll.totalVotes + (previousOptionId == null ? 1 : 0),
      myOptionId: optionId,
      options: previousPoll.options.map(option => ({
        ...option,
        voteCount: option.voteCount
          + (option.id === optionId ? 1 : 0)
          - (option.id === previousOptionId ? 1 : 0),
      })),
    };
    setImpressionPolls(current => ({ ...current, [p.id]: optimisticPoll }));
    setVotingPostId(p.id);
    try {
      const { error } = await (supabase as any).rpc('cast_post_impression_vote', {
        p_post_id: p.id,
        p_option_id: optionId,
      });
      if (error) throw error;
      await refreshImpressionPolls([p.id]);
    } catch (error) {
      setImpressionPolls(current => ({ ...current, [p.id]: previousPoll }));
      alertDialog('投票没有成功：' + (error instanceof Error ? error.message : '请稍后重试。'));
    } finally {
      setVotingPostId(current => current === p.id ? null : current);
    }
  }

  async function addCmt(p: Post) {
    const t = (cmtText[p.id] || '').trim();
    if (!t || sendingComment[p.id]) return;
    setSendingComment(current => ({ ...current, [p.id]: true }));
    try {
      const { error } = await withRetry(() => supabase.from('comments').insert({ post_id: p.id, author_id: me, content: t }));
      if (error) throw error;
      setCmtText(current => ({ ...current, [p.id]: '' }));
      setOpenCmt(current => ({ ...current, [p.id]: true }));
      void load();
      // 通知动态作者（不是自己评论自己才发）
      if (p.author_id !== me) {
        const who = profiles[me];
        void supabase.from('notifications').insert({
          profile_id: p.author_id, type: 'comment',
          title: isFeed ? '有人评论了你的动态' : (embedded ? '有人评论了你的帖子' : '有人评论了你的日常'),
          body: `${who ? (who.display_name ?? who.username) : '同学'}：${t.slice(0, 60)}`,
          link: isFeed ? '/feed' : '/daily',
        }).then(() => {});
      }
    } catch (error) {
      alertDialog('评论发送失败：' + (error instanceof Error ? error.message : '请检查网络后重试。'));
    } finally {
      setSendingComment(current => ({ ...current, [p.id]: false }));
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
        .eq('id', p.id).eq('author_id', me).eq('section', section)
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
    if (!(await confirmDialog(isFeed ? '删除这条动态？评论和点赞会一起删除。' : '删除这条日常？评论和点赞会一起删除。', { danger: true, confirmText: '确认删除' }))) return;
    const { data, error } = await supabase.from('posts').delete()
      .eq('id', p.id).eq('author_id', p.author_id).eq('section', section)
      .select('id').maybeSingle();
    if (error) { alertDialog('删除失败：' + error.message); return; }
    if (!data) { alertDialog('删除未完成：内容不存在或当前账号没有权限。'); return; }
    const cleanupError = await removeOwnedMedia(p.image_url, p.author_id);
    await load();
    if (cleanupError) alertDialog('内容已删除，但原配图清理失败：' + cleanupError);
  }

  async function reportPost(p: Post) {
    const reason = await promptDialog(isFeed ? '举报这条动态，请输入原因：' : '举报这条日常，请输入原因：');
    if (!reason || !reason.trim()) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: me, target_type: 'post', target_id: String(p.id), reason: reason.trim().slice(0, 200),
    });
    alertDialog(error ? '举报失败：' + error.message : '已举报，管理员会处理');
  }

  async function delCmt(c: Cmt) {
    if (!(await confirmDialog('删除这条评论？', { danger: true, confirmText: '确认删除' }))) return;
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

  const visiblePosts = isFeed
    ? posts.filter(post => feedScope === 'all' || post.author_id === me || friendIds.includes(post.author_id))
    : posts;
  // 右栏“本页”统计：只由已加载的数据派生，不新增请求。
  const myPostCount = visiblePosts.filter(post => post.author_id === me).length;
  const totalLikes = visiblePosts.reduce((sum, post) => sum + (likes[post.id] || 0), 0);

  return (
    <div className={isFeed ? 'page feed-page postlist-longform' : 'page postlist-longform'}>
      <PostListShell
        embedded={embedded}
        side={<PostListSidePanels section={section} loadedCount={visiblePosts.length} myCount={myPostCount} totalLikes={totalLikes} />}
      >
      {isFeed ? <>
        <header className="community-page-heading">
          <div>
            <h1>动态</h1>
          </div>
        </header>
        <div className="feed-filters" role="group" aria-label="动态筛选">
          <button type="button" className={feedScope === 'all' ? 'on' : ''} onClick={() => setFeedScope('all')}>全部动态</button>
          <button type="button" className={feedScope === 'friends' ? 'on' : ''} onClick={() => setFeedScope('friends')}>好友动态</button>
          {searchQuery.trim() && <span className="feed-search-note">搜索：{searchQuery}</span>}
        </div>
      </> : <>
        <div className="hero">
          <h1>{embedded ? '帖子' : '日常'}</h1>
          <p>{embedded ? '分享想法 · 记录日常' : '记 录 生 活 · 分 享 点 滴'}</p>
        </div>
        {searchQuery.trim() && <div className="feed-search-banner">搜索日常：{searchQuery}<button type="button" onClick={() => nav('/daily', { replace: true })}>清除搜索</button></div>}
      </>}
      <div className="composer">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={isFeed ? '写下此刻的想法，分享给大家…' : (embedded ? '分享点什么…' : '分享今天的小日常…')} rows={3} maxLength={2000} />
        {isFeed && <div className="impression-composer-actions">
          <button type="button" className={impressionEnabled ? 'impression-toggle is-active' : 'impression-toggle'}
            aria-expanded={impressionEnabled} aria-controls="impression-poll-builder"
            onClick={() => setImpressionEnabled(value => !value)} disabled={busy}>
            {impressionEnabled ? '收起印象投票' : '＋ 发起印象投票'}
          </button>
          <span>让大家匿名选一选对你的印象</span>
        </div>}
        {isFeed && impressionEnabled && <section className="impression-builder" id="impression-poll-builder">
          <div className="impression-builder__heading">
            <strong>印象投票</strong>
            <span>匿名参与 · 只展示票数</span>
          </div>
          <label className="impression-field">
            <span className="impression-field__label">你想问什么？ <small>{impressionQuestion.length}/120</small></span>
            <input value={impressionQuestion} onChange={event => setImpressionQuestion(event.target.value)}
              placeholder="例如：你觉得我给人的第一印象是？" maxLength={120} />
          </label>
          <div className="impression-presets" aria-label="问题模板">
            <span>快速套用</span>
            <button type="button" onClick={() => { setImpressionQuestion('你觉得我给人的第一印象是？'); setImpressionOptions(['阳光开朗', '安静慢热', '幽默有趣', '认真靠谱']); }}>第一印象</button>
            <button type="button" onClick={() => { setImpressionQuestion('你觉得我的性格更接近哪一种？'); setImpressionOptions(['活泼外向', '温柔细腻', '理性冷静', '慢热随和']); }}>性格类型</button>
            <button type="button" onClick={() => { setImpressionQuestion('你最常用哪个词形容我？'); setImpressionOptions(['真诚', '有趣', '靠谱', '有想法']); }}>关键词</button>
          </div>
          <div className="impression-fields-heading">
            <span>让别人选择的选项</span>
            <small>{impressionOptions.length}/8</small>
          </div>
          <div className="impression-option-editor">
            {impressionOptions.map((option, index) => <div className="impression-option-editor__row" key={index}>
              <span>{index + 1}</span>
              <input value={option} onChange={event => setImpressionOptions(current => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                placeholder={`选项 ${index + 1}`} maxLength={40} aria-label={`投票选项 ${index + 1}`} />
              <button type="button" aria-label={`删除选项 ${index + 1}`} disabled={impressionOptions.length <= 2}
                onClick={() => setImpressionOptions(current => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
            </div>)}
          </div>
          {impressionOptions.length < 8 && <button type="button" className="impression-add-option"
            onClick={() => setImpressionOptions(current => [...current, ''])}>＋ 添加选项</button>}
          <p className="impression-privacy-note">每人只能投一票，可修改自己的选择。其他人看不到是谁投的，只能看到各选项票数。</p>
        </section>}
        <div className="row">
          <button className="ghost" onClick={() => fref.current?.click()}>{img ? (isFeed ? '重新选图' : '已选图片 ✓') : '＋ 图片'}</button>
          <input ref={fref} type="file" accept="image/*" hidden onChange={e => setImg(e.target.files?.[0] ?? null)} />
          <div className="sp" style={{ flex: 1 }} />
          <ShimmerButton style={{ width: 'auto', padding: '10px 28px' }} disabled={busy} onClick={publish}>
            {busy ? '发布中…' : '发布'}</ShimmerButton>
        </div>
        {isFeed && img && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: '#5b6472' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>已选：{img.name}（{(img.size / 1024).toFixed(0)} KB，发布时自动压缩）</span>
            <button type="button" className="ghost" style={{ padding: '2px 10px', flexShrink: 0 }} disabled={busy} onClick={() => setImg(null)}>删除</button>
          </div>
        )}
        {busy && upPct !== null && (
          <div style={{ marginTop: 8 }}>
            <SmoothProgress value={upPct} label={`图片上传中 ${upPct}%`} />
          </div>
        )}
        {err && <p className="err">{err}</p>}
      </div>

      {visiblePosts.map((p, i) => {
        const a = profiles[p.author_id];
        const list = cmts[p.id] ?? [];
        const open = !!openCmt[p.id];
        const poll = impressionPolls[p.id];
        return (
          <motion.article key={p.id} id={`${section}-post-${p.id}`}
            className={`post${highlightedPostId === p.id ? ' post--focused' : ''}`}
            tabIndex={-1}
            initial={reduce ? {} : { opacity: 0, y: isFeed ? 8 : 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: isFeed ? 0.32 : 0.34, delay: Math.min(i * 0.025, isFeed ? 0.15 : 0.18) }}>
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
            {isFeed && poll && <section className="impression-poll" aria-label="印象匿名投票" aria-busy={votingPostId === p.id}>
              <div className="impression-poll__top">
                <strong>✦ 印象投票</strong>
                <span>匿名统计 · 不显示投票者</span>
              </div>
              <h3>{poll.question}</h3>
              <div className="impression-poll__options">
                {poll.options.map(option => {
                  const percent = poll.totalVotes ? Math.round(option.voteCount / poll.totalVotes * 100) : 0;
                  const selected = poll.myOptionId === option.id;
                  return <button key={option.id} type="button"
                    className={selected ? 'impression-poll__option is-selected' : 'impression-poll__option'}
                    disabled={p.author_id === me || votingPostId === p.id}
                    aria-pressed={selected}
                    aria-label={`${option.label}，${option.voteCount} 票，${percent}%`}
                    onClick={() => void voteForImpression(p, option.id)}>
                    <span className="impression-poll__option-head">
                      <span className="impression-poll__label">{option.label}</span>
                      {selected && <span className="impression-poll__selected">已选择</span>}
                    </span>
                    <span className="impression-poll__bar" role="progressbar"
                      aria-label={`${option.label}得票比例`} aria-valuemin={0}
                      aria-valuemax={100} aria-valuenow={percent}>
                      <span style={{ width: `${percent}%` }} />
                    </span>
                    <span className="impression-poll__option-meta">
                      <strong>{option.voteCount} 票</strong><em>{percent}%</em>
                    </span>
                  </button>;
                })}
              </div>
              <div className="impression-poll__foot">
                <span>共 {poll.totalVotes} 票</span>
                <span aria-live="polite">{p.author_id === me
                  ? '这是你发起的投票 · 只能查看汇总结果'
                  : votingPostId === p.id ? '正在提交投票…'
                    : poll.myOptionId == null ? '选择一项表达印象'
                      : '已匿名投票 · 再次选择可修改'}</span>
              </div>
            </section>}
            <div className="ft">
              <button className={liked[p.id] ? 'liked' : ''} onClick={() => toggleLike(p)}>
                <svg className="like-ico" viewBox="0 0 24 24" aria-hidden="true" fill={liked[p.id] ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>{likes[p.id] || ''}
              </button>
              <button type="button" aria-expanded={open} aria-controls={`${section}-comments-${p.id}`}
                onClick={() => setOpenCmt(current => ({ ...current, [p.id]: !open }))}>{list.length} 条评论</button>
              {p.author_id === me && <button className="mini ghost" onClick={() => beginEditPost(p)}>编辑</button>}
              {p.author_id !== me && <button className="mini ghost" onClick={() => reportPost(p)}>举报</button>}
              {(p.author_id === me || isAdmin) && <button className="del" onClick={() => delPost(p)}>删除</button>}
            </div>
            {open && <div className="cmt" id={`${section}-comments-${p.id}`}>
              {list.length === 0 && <p className="cmt-empty">还没有评论，来开启这段对话。</p>}
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
                <input aria-label="写评论" value={cmtText[p.id] || ''} onChange={e => setCmtText(current => ({ ...current, [p.id]: e.target.value }))}
                  placeholder="写评论…" maxLength={500}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void addCmt(p);
                    }
                  }} />
                <button type="button" disabled={!(cmtText[p.id] || '').trim() || !!sendingComment[p.id]}
                  onClick={() => void addCmt(p)}>{sendingComment[p.id] ? '发送中…' : '发送'}</button>
              </div>
            </div>}
          </motion.article>
        );
      })}
      {!initialLoading && hasMore && (
        <div style={{ textAlign: 'center', margin: '16px 0 8px' }}>
          <button type="button" className="ghost" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? '正在加载…' : '加载更多'}
          </button>
        </div>
      )}
      {showSkeleton && <FeedSkeleton count={2} />}
      {isFeed && !initialLoading && visiblePosts.length === 0 && <div className="center" style={{ minHeight: 200 }}><div className="card">{searchQuery.trim() ? '没有找到匹配的动态。' : feedScope === 'friends' ? '暂时没有好友动态。添加好友后，这里会显示他们分享的内容。' : '还没有动态，来发第一条吧'}</div></div>}
      {!isFeed && !initialLoading && posts.length === 0 && <div className="center" style={{ minHeight: 200 }}><div className="card">{embedded ? '还没有帖子，来发第一条吧' : '还没有日常，来发第一条吧'}</div></div>}
      </PostListShell>
    </div>
  );
}
