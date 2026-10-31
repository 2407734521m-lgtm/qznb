import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';
import { alertDialog, confirmDialog } from '../lib/dialog';

type Counts = {
  posts: number; comments: number; photos: number; albums: number; timelines: number;
  wishes: number; songs: number; love: number; capsules: number; greetings: number; favorites: number;
};
type ArchivedAlbum = { id: number; title: string; category: string; deleted_at: string | null };

const SECTIONS: { key: keyof Counts; title: string; description: string; to: string; mark: string }[] = [
  { key: 'posts', title: '动态与日常', description: '查看已发布内容；可在对应板块编辑文字和配图', to: '/me/posts', mark: '动态' },
  { key: 'comments', title: '我的评论', description: '查看你参与过的讨论；编辑和删除请进入对应动态', to: '/feed', mark: '评论' },
  { key: 'photos', title: '我的照片', description: '管理自己上传的相册照片', to: '/albums', mark: '照片' },
  { key: 'albums', title: '我创建的相册', description: '管理相册名称、分类和已归档相册', to: '/albums', mark: '相册' },
  { key: 'timelines', title: '青春时间线', description: '编辑自己的日期、文字、照片和视频', to: '/timeline', mark: '回忆' },
  { key: 'wishes', title: '我的愿望', description: '查看、编辑和删除自己发布的愿望', to: '/wishes', mark: '愿望' },
  { key: 'songs', title: '歌声墙投稿', description: '查看自己的音频投稿并管理删除', to: '/songs', mark: '歌声' },
  { key: 'love', title: '表白墙投稿', description: '查看投稿审核状态或删除自己的投稿', to: '/love-wall?mine=1', mark: '投稿' },
  { key: 'capsules', title: '时光胶囊', description: '管理自己创建的胶囊和回收站内容', to: '/capsule', mark: '胶囊' },
  { key: 'greetings', title: '我的留言', description: '查看和管理自己发布的留言', to: '/me/greetings', mark: '留言' },
  { key: 'favorites', title: '我的收藏', description: '找回收藏的同学档案和动态', to: '/me/favorites', mark: '收藏' },
];

export default function MeContent() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [counts, setCounts] = useState<Counts | null>(null);
  const [archived, setArchived] = useState<ArchivedAlbum[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoringId, setRestoringId] = useState<number | null>(null);

  async function load() {
    setLoading(true); setError('');
    const [
      posts, comments, photos, albums, timelines, wishes, songs, love, capsules, greetings, favorites, archivedAlbums,
    ] = await Promise.all([
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', me).is('deleted_at', null),
      supabase.from('comments').select('id', { count: 'exact', head: true }).eq('author_id', me).is('deleted_at', null),
      supabase.from('album_photos').select('id', { count: 'exact', head: true }).eq('uploaded_by', me),
      supabase.from('albums').select('id', { count: 'exact', head: true }).eq('created_by', me).is('deleted_at', null),
      supabase.from('timelines').select('id', { count: 'exact', head: true }).eq('profile_id', me),
      supabase.from('wishes').select('id', { count: 'exact', head: true }).eq('author_id', me),
      supabase.from('song_posts').select('id', { count: 'exact', head: true }).eq('author_id', me),
      supabase.from('love_wall_posts').select('id', { count: 'exact', head: true }).eq('author_id', me),
      supabase.from('time_capsules').select('id', { count: 'exact', head: true }).eq('author_id', me),
      supabase.from('greetings').select('id', { count: 'exact', head: true }).eq('author_id', me).is('deleted_at', null),
      supabase.from('favorites').select('target_id', { count: 'exact', head: true }).eq('profile_id', me),
      supabase.from('albums').select('id,title,category,deleted_at').eq('created_by', me).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(30),
    ]);
    const results = [posts, comments, photos, albums, timelines, wishes, songs, love, capsules, greetings, favorites, archivedAlbums];
    const failed = results.find(result => result.error);
    if (failed) {
      setError('部分内容统计暂时无法读取：' + (failed.error?.message || '请稍后重试。'));
    }
    setCounts({
      posts: posts.count ?? 0, comments: comments.count ?? 0, photos: photos.count ?? 0,
      albums: albums.count ?? 0, timelines: timelines.count ?? 0, wishes: wishes.count ?? 0,
      songs: songs.count ?? 0, love: love.count ?? 0, capsules: capsules.count ?? 0,
      greetings: greetings.count ?? 0, favorites: favorites.count ?? 0,
    });
    setArchived((archivedAlbums.data ?? []) as ArchivedAlbum[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [me]);

  async function restoreAlbum(album: ArchivedAlbum) {
    if (!(await confirmDialog(`恢复相册“${album.title}”？恢复后它会重新出现在相册列表中。`))) return;
    setRestoringId(album.id);
    try {
      const { data, error: updateError } = await supabase.from('albums')
        .update({ deleted_at: null }).eq('id', album.id).eq('created_by', me)
        .select('id').maybeSingle();
      if (updateError) throw updateError;
      if (!data) throw new Error('相册不存在或当前账号没有恢复权限。');
      await load();
      alertDialog('相册已恢复。');
    } catch (error) {
      alertDialog('恢复失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
    } finally { setRestoringId(null); }
  }

  return (
    <main className="page" style={{ paddingBottom: 110 }}>
      <BackButton fallback="/me" />
      <header style={{ margin: '8px 0 16px' }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#63818c' }}>MY CONTENT · PERSONAL ARCHIVE</div>
        <h1 style={{ fontSize: 23, margin: '5px 0' }}>我的全部内容</h1>
        <p style={{ margin: 0, color: 'var(--mut)', fontSize: 13 }}>集中查看你发布、上传、收藏和记录的内容</p>
      </header>
      {error && <div className="card err" role="alert">{error}<button className="mini ghost" onClick={() => void load()}>重新加载</button></div>}
      <section className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>内容总览</strong><span style={{ fontSize: 11, color: 'var(--mut)' }}>{loading ? '正在统计…' : '实时查询'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 9, marginTop: 12 }}>
          {SECTIONS.slice(0, 9).map(item => <button key={item.key} onClick={() => nav(item.to)}
            style={{ border: '1px solid #e6edf0', borderRadius: 13, padding: '11px 7px', background: '#f8fbfc', color: '#244351', textAlign: 'center' }}>
            <strong style={{ display: 'block', fontSize: 22, lineHeight: 1.3 }}>{loading ? '—' : counts?.[item.key] ?? 0}</strong>
            <span style={{ display: 'block', fontSize: 11, marginTop: 3 }}>{item.mark}</span>
          </button>)}
        </div>
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
        {SECTIONS.map(item => <button key={item.key} className="card" onClick={() => nav(item.to)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', border: '1px solid #e7eef0', color: 'inherit' }}>
          <span style={{ width: 42, height: 42, flex: '0 0 42px', borderRadius: 13, display: 'grid', placeItems: 'center', background: '#eaf4f5', color: '#176477', fontSize: 12, fontWeight: 800 }}>{item.mark}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ display: 'block', fontSize: 13 }}>{item.title} · {loading ? '—' : counts?.[item.key] ?? 0}</strong>
            <small style={{ display: 'block', color: 'var(--mut)', fontSize: 11, lineHeight: 1.5, marginTop: 3 }}>{item.description}</small>
          </span>
          <span aria-hidden style={{ color: 'var(--mut)', fontSize: 20 }}>›</span>
        </button>)}
      </section>
      <section className="card" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div><strong>已归档相册</strong><p style={{ margin: '3px 0 0', color: 'var(--mut)', fontSize: 11 }}>你移除的相册可以在这里恢复；照片文件会保留。</p></div>
          <span style={{ fontSize: 12, color: 'var(--mut)' }}>{archived.length}</span>
        </div>
        {archived.length === 0 ? <p style={{ color: 'var(--mut)', fontSize: 12, marginBottom: 0 }}>目前没有已归档的相册。</p> : archived.map(album => <div key={album.id} className="row" style={{ justifyContent: 'space-between', gap: 8, padding: '10px 0', borderTop: '1px solid #edf1f3' }}>
          <div style={{ minWidth: 0 }}><strong style={{ display: 'block', fontSize: 12 }}>{album.title}</strong><small style={{ color: 'var(--mut)', fontSize: 11 }}>{album.category} · 已归档</small></div>
          <button className="mini ghost" disabled={restoringId === album.id} onClick={() => void restoreAlbum(album)}>{restoringId === album.id ? '恢复中…' : '恢复'}</button>
        </div>)}
      </section>
      <p style={{ color: 'var(--mut)', fontSize: 11, lineHeight: 1.6, marginTop: 12 }}>说明：这里汇总你当前有权限查看的内容。已删除的帖子、评论和其他模块不一定支持恢复；目前相册归档提供独立恢复入口，避免误称全部内容都可撤销。</p>
    </main>
  );
}
