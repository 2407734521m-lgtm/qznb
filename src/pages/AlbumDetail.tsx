import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl, useSignedUrls, uploadMedia, downscaleImage } from '../lib/media';
import { withRetry } from '../lib/retry';
import { confirmDialog, alertDialog } from '../lib/dialog';

type P = { id: number; photo_url: string; caption: string | null; uploaded_by: string | null };

function Thumb({ p, url, onView }: { p: P; url?: string; onView: () => void }) {
  if (!url) return null;
  return (
    <figure onClick={onView}>
      <img src={url} alt={p.caption ?? ''} loading="lazy" />
      {p.caption && <figcaption>{p.caption}</figcaption>}
    </figure>
  );
}

export default function AlbumDetail() {
  const { id = '' } = useParams(); const nav = useNavigate(); const reduce = useReducedMotion();
  const me = useAuth().session!.user.id;
  const [album, setAlbum] = useState<any>(null);
  const [photos, setPhotos] = useState<P[]>([]);
  const photoUrls = useSignedUrls('media', photos.map(p => p.photo_url));
  const [view, setView] = useState<P | null>(null);
  const [cap, setCap] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [editAlbumOpen, setEditAlbumOpen] = useState(false);
  const [editAlbumTitle, setEditAlbumTitle] = useState('');
  const [editAlbumCategory, setEditAlbumCategory] = useState('');
  const [manageBusy, setManageBusy] = useState(false);
  const [manageNotice, setManageNotice] = useState('');
  const fref = useRef<HTMLInputElement>(null);
  const viewUrl = useSignedUrl('media', view?.photo_url);

  async function load() {
    const { data: a, error: albumError } = await supabase.from('albums').select('*').eq('id', Number(id)).maybeSingle();
    if (albumError) { setErr('相册加载失败：' + albumError.message); return; }
    if (!a || a.deleted_at) {
      setAlbum(null);
      if (a?.deleted_at) nav('/albums', { replace: true });
      return;
    }
    setAlbum(a);
    setEditAlbumTitle(a.title ?? '');
    setEditAlbumCategory(a.category ?? '');
    const { data: p, error: photoError } = await supabase.from('album_photos').select('*').eq('album_id', Number(id))
      .order('created_at', { ascending: false });
    if (photoError) { setErr('照片列表加载失败：' + photoError.message); return; }
    setPhotos(((p ?? []) as P[]));
    const { data: r } = await supabase.rpc('my_role');
    setIsAdmin(r === 'admin' || r === 'super_admin');
  }
  useEffect(() => { load(); }, [id]);

  const [upProg, setUpProg] = useState('');
  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []).filter(f => f.type.startsWith('image/'));
    if (!list.length) { if (files?.length) setErr('只能上传图片'); return; }
    setBusy(true); setErr(''); setUpProg('');
    try {
      let firstPath: string | null = null;
      for (let i = 0; i < list.length; i++) {
        setUpProg(`上传中 ${i + 1}/${list.length}…`);
        const small = await downscaleImage(list[i]);
        const path = await uploadMedia('media', small);
        if (!firstPath) firstPath = path;
        const { error } = await withRetry(() => supabase.from('album_photos')
          .insert({ album_id: Number(id), photo_url: path, caption: i === 0 ? (cap.trim() || null) : null, uploaded_by: me }));
        if (error) throw error;
      }
      if (!album?.cover_url && firstPath) await withRetry(() => supabase.from('albums').update({ cover_url: firstPath }).eq('id', Number(id)));
      setCap(''); setUpProg(''); load();
    } catch (e: any) { setErr('上传失败：' + (e.message || '网络错误')); }
    finally { setBusy(false); setUpProg(''); }
  }

  async function saveAlbum() {
    const title = editAlbumTitle.trim();
    const category = editAlbumCategory.trim();
    if (!title || title.length > 60) { alertDialog('相册名称请填写 1–60 个字。'); return; }
    if (!category || category.length > 20) { alertDialog('相册分类请填写 1–20 个字。'); return; }
    setManageBusy(true);
    try {
      const { data, error } = await supabase.from('albums').update({ title, category })
        .eq('id', Number(id)).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('相册不存在或当前账号没有管理权限。');
      setEditAlbumOpen(false);
      setManageNotice('相册信息已保存。');
      await load();
    } catch (error) {
      alertDialog('保存失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
    } finally { setManageBusy(false); }
  }

  async function removeAlbum() {
    const otherContributors = photos.filter(photo => photo.uploaded_by && photo.uploaded_by !== me);
    const message = otherContributors.length
      ? '该相册包含其他成员上传的照片。删除操作会将相册从公开列表移除，但不会删除任何照片或文件，以保护上传者的作品。'
      : '删除后相册会从列表移除；照片记录和文件会保留，管理员仍可恢复或进一步处理。';
    if (!(await confirmDialog(message, { danger: true }))) return;
    setManageBusy(true);
    try {
      const { data, error } = await supabase.from('albums').update({ deleted_at: new Date().toISOString() })
        .eq('id', Number(id)).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('相册不存在或当前账号没有管理权限。');
      nav('/albums', { replace: true });
    } catch (error) {
      alertDialog('移除相册失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
    } finally { setManageBusy(false); }
  }

  async function del(p: P) {
    if (!isAdmin && p.uploaded_by !== me) return;
    if (album.cover_url === p.photo_url && album.created_by !== me && !isAdmin) {
      alertDialog('这张照片是相册封面，请先联系相册创建者更换封面，再删除这张照片。');
      return;
    }
    if (!(await confirmDialog('删除这张照片？文件也会从相册存储中移除。', { danger: true }))) return;
    try {
      if (album.cover_url === p.photo_url) {
        const nextCover = photos.find(photo => photo.id !== p.id)?.photo_url ?? null;
        const { error: coverError } = await supabase.from('albums').update({ cover_url: nextCover })
          .eq('id', Number(id));
        if (coverError) throw new Error('无法先更新相册封面：' + coverError.message);
      }
      if (p.photo_url && !p.photo_url.startsWith('http://') && !p.photo_url.startsWith('https://')) {
        if (!isAdmin && !p.photo_url.startsWith(`${me}/`)) throw new Error('无法确认这张照片属于当前账号，已停止删除。');
        const { error: storageError } = await supabase.storage.from('media').remove([p.photo_url]);
        if (storageError) throw new Error('照片文件清理失败：' + storageError.message);
      }
      let query = supabase.from('album_photos').delete().eq('id', p.id);
      if (!isAdmin) query = query.eq('uploaded_by', me);
      const { data, error } = await query.select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('照片记录未删除，可能已不存在或当前账号没有权限。');
      await load();
      setManageNotice('照片和对应文件已删除。');
    } catch (error) {
      alertDialog('删除失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
      await load();
    }
  }

  if (album === null) return <div className="page"><div className="center">加载中…</div></div>;

  return (
    <div className="page">
      <button className="backbtn" onClick={() => nav('/albums')}>← 返回相册</button>
      <div className="hero" style={{ paddingTop: 8 }}>
        <h1 style={{ fontSize: 24 }}>{album.title}</h1>
        <p>{album.category} · {photos.length} 张</p>
      </div>
      {(album.created_by === me || isAdmin) && <div className="row" style={{ gap: 8, margin: '0 0 12px' }}>
        <button className="ghost" onClick={() => { setEditAlbumTitle(album.title); setEditAlbumCategory(album.category); setEditAlbumOpen(value => !value); }}>{editAlbumOpen ? '收起编辑' : '编辑相册'}</button>
        <button className="mini danger" disabled={manageBusy} onClick={() => void removeAlbum()}>删除相册</button>
      </div>}
      {editAlbumOpen && (album.created_by === me || isAdmin) && <div className="card" style={{ marginBottom: 12 }}>
        <label>相册名称</label>
        <input value={editAlbumTitle} onChange={e => setEditAlbumTitle(e.target.value)} maxLength={60} />
        <label>相册分类</label>
        <input value={editAlbumCategory} onChange={e => setEditAlbumCategory(e.target.value)} maxLength={20} />
        <button className="pri" disabled={manageBusy} onClick={() => void saveAlbum()}>{manageBusy ? '保存中…' : '保存相册信息'}</button>
      </div>}
      {manageNotice && <p role="status" style={{ fontSize: 12, color: 'var(--mut)' }}>{manageNotice}</p>}
      <div className="card" style={{ marginBottom: 6 }}>
        <label>添加照片</label>
        <input value={cap} onChange={e => setCap(e.target.value)} placeholder="给照片写句话（可选）" maxLength={200} />
        <div className="row">
          <button className="ghost" disabled={busy} onClick={() => fref.current?.click()}>{busy ? (upProg || '上传中…') : '选择照片（可多选）'}</button>
          <input ref={fref} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif" multiple hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        </div>
        {err && <p className="err">{err}</p>}
      </div>
      <div className="masonry">
        {photos.map(p => (
          <div key={p.id} style={{ position: 'relative' }}>
            <Thumb p={p} url={photoUrls[p.photo_url]} onView={() => setView(p)} />
            {(p.uploaded_by === me || isAdmin) && (
              <button className="mini danger" style={{ position: 'absolute', top: 6, right: 6 }}
                onClick={e => { e.stopPropagation(); del(p); }}>删除</button>
            )}
          </div>
        ))}
      </div>
      {photos.length === 0 && <div className="center" style={{ minHeight: 160 }}><div className="card">空空如也，快上传第一张吧</div></div>}

      <AnimatePresence>
        {view && (
          <motion.div className="viewer" onClick={() => setView(null)}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.25 }}>
            <button className="x" onClick={() => setView(null)}>✕</button>
            {viewUrl && <motion.img src={viewUrl} alt=""
              initial={reduce ? {} : { scale: 0.94 }} animate={{ scale: 1 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }} />}
            {view.caption && <div className="cap">{view.caption}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
