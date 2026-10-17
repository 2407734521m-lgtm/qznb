import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl, uploadMedia, downscaleImage } from '../lib/media';

type P = { id: number; photo_url: string; caption: string | null; uploaded_by: string | null };

function Thumb({ p, onView }: { p: P; onView: () => void }) {
  const url = useSignedUrl('media', p.photo_url);
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
  const [view, setView] = useState<P | null>(null);
  const [cap, setCap] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const fref = useRef<HTMLInputElement>(null);
  const viewUrl = useSignedUrl('media', view?.photo_url);

  async function load() {
    const { data: a } = await supabase.from('albums').select('*').eq('id', id).maybeSingle();
    setAlbum(a ?? null);
    const { data: p } = await supabase.from('album_photos').select('*').eq('album_id', Number(id))
      .order('created_at', { ascending: false });
    setPhotos(((p ?? []) as P[]));
    const { data: r } = await supabase.rpc('my_role');
    setIsAdmin(r === 'admin' || r === 'super_admin');
  }
  useEffect(() => { load(); }, [id]);

  async function upload(files: FileList | null) {
    const f = files?.[0]; if (!f) return;
    if (!f.type.startsWith('image/')) return setErr('只能上传图片');
    setBusy(true); setErr('');
    try {
      const small = await downscaleImage(f);
      const path = await uploadMedia('media', small);
      const { error } = await supabase.from('album_photos')
        .insert({ album_id: Number(id), photo_url: path, caption: cap.trim() || null, uploaded_by: me });
      if (error) throw error;
      if (!album?.cover_url) await supabase.from('albums').update({ cover_url: path }).eq('id', Number(id));
      setCap(''); load();
    } catch (e: any) { setErr('上传失败：' + (e.message || '网络错误')); }
    finally { setBusy(false); }
  }

  async function del(p: P) {
    if (!confirm('删除这张照片？')) return;
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
          <button className="ghost" disabled={busy} onClick={() => fref.current?.click()}>{busy ? '上传中…' : '📷 选择照片'}</button>
          <input ref={fref} type="file" accept="image/*" hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        </div>
        {err && <p className="err">{err}</p>}
      </div>
      <div className="masonry">
        {photos.map(p => (
          <div key={p.id} style={{ position: 'relative' }}>
            <Thumb p={p} onView={() => setView(p)} />
            {(p.uploaded_by === me || isAdmin) && (
              <button className="mini danger" style={{ position: 'absolute', top: 6, right: 6 }}
                onClick={e => { e.stopPropagation(); del(p); }}>删除</button>
            )}
          </div>
        ))}
      </div>
      {photos.length === 0 && <div className="center" style={{ minHeight: 160 }}><div className="card">空空如也，快上传第一张吧 ✨</div></div>}

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
