import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl, useSignedUrls, uploadMedia, downscaleImage } from '../lib/media';
import { withRetry } from '../lib/retry';
import { confirmDialog } from '../lib/dialog';

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
  const fref = useRef<HTMLInputElement>(null);
  const viewUrl = useSignedUrl('media', view?.photo_url);

  async function load() {
    const { data: a } = await supabase.from('albums').select('*').eq('id', Number(id)).maybeSingle();
    setAlbum(a ?? null);
    const { data: p } = await supabase.from('album_photos').select('*').eq('album_id', Number(id))
      .order('created_at', { ascending: false });
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

  async function del(p: P) {
    if (!(await confirmDialog('删除这张照片？', { danger: true }))) return;
    await supabase.from('album_photos').delete().eq('id', p.id);
    load();
  }

  if (album === null) return <div className="page"><div className="center">加载中…</div></div>;

  return (
    <div className="page">
      <button className="backbtn" onClick={() => nav('/albums')}>← 返回相册</button>
      <div className="hero" style={{ paddingTop: 8 }}>
        <h1 style={{ fontSize: 24 }}>{album.title}</h1>
        <p>{album.category} · {photos.length} 张</p>
      </div>
      <div className="card" style={{ marginBottom: 6 }}>
        <label>添加照片</label>
        <input value={cap} onChange={e => setCap(e.target.value)} placeholder="给照片写句话（可选）" maxLength={200} />
        <div className="row">
          <button className="ghost" disabled={busy} onClick={() => fref.current?.click()}>{busy ? (upProg || '上传中…') : '选择照片（可多选）'}</button>
          <input ref={fref} type="file" accept="image/*" multiple hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} />
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
