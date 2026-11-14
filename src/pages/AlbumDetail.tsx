import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl, useSignedUrls, uploadMediaWithProgress, downscaleImage } from '../lib/media';
import SmoothProgress from '../components/fx/SmoothProgress';
import { withRetry } from '../lib/retry';
import { confirmDialog, alertDialog } from '../lib/dialog';
import { PageSkeleton } from '../components/fx/Skeleton';
import BlurImg from '../components/fx/BlurImg';

type P = { id: number; photo_url: string; caption: string | null; uploaded_by: string | null };

const HERO_H = 248;
const BAR_H = 56;
const COLLAPSE = HERO_H - BAR_H;
const clamp01 = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));

// 吸顶大标题头图（2026-11-07 按用户给的交互规格）：上滑时封面以 0.5 倍速度视差
// 移动并慢慢压暗，大标题缩小上移、淡入顶部毛玻璃导航条；顶部下拉时封面放大；
// 滑到一半松手，按方向/位置自动收到底或弹回展开，不停在半路。
function AlbumHero({ title, meta, coverUrl, onBack, reduce }: {
  title: string; meta: string; coverUrl: string; onBack: () => void; reduce: boolean | null;
}) {
  const { scrollY } = useScroll();
  const imgY = useTransform(scrollY, (v: number) => (reduce ? 0 : Math.max(v, 0) * 0.5));
  const imgScale = useTransform(scrollY, (v: number) => {
    if (reduce) return 1;
    if (v < 0) return 1 + Math.min(-v / 120, 1) * 0.12;
    return 1 - clamp01(v, 0, HERO_H) * 0.04;
  });
  const imgFilter = useTransform(scrollY, (v: number) =>
    `brightness(${reduce ? 1 : 1 - clamp01(v, 0, HERO_H) * 0.22})`);
  const bigTitleY = useTransform(scrollY, (v: number) => (reduce ? 0 : -34 * clamp01(v, 0, COLLAPSE)));
  const bigTitleScale = useTransform(scrollY, (v: number) => (reduce ? 1 : 1 - 0.22 * clamp01(v, 0, COLLAPSE)));
  const bigTitleOpacity = useTransform(scrollY, (v: number) => (reduce ? 1 : 1 - clamp01(v, COLLAPSE - 46, COLLAPSE)));
  const barBgOpacity = useTransform(scrollY, (v: number) => (reduce ? (v > 24 ? 1 : 0) : clamp01(v, COLLAPSE - 52, COLLAPSE)));
  const barTitleOpacity = useTransform(scrollY, (v: number) => (reduce ? (v > 24 ? 1 : 0) : clamp01(v, COLLAPSE - 34, COLLAPSE + 8)));
  const barTitleX = useTransform(scrollY, (v: number) => (reduce ? 0 : -10 + 10 * clamp01(v, COLLAPSE - 34, COLLAPSE + 8)));

  const lastY = useRef(0);
  const lastDy = useRef(0);
  const snapTimer = useRef<number | undefined>(undefined);
  const snapping = useRef(false);
  useMotionValueEvent(scrollY, 'change', (y) => {
    lastDy.current = y - lastY.current;
    lastY.current = y;
    if (reduce || snapping.current) return;
    window.clearTimeout(snapTimer.current);
    snapTimer.current = window.setTimeout(() => {
      const yy = window.scrollY;
      if (yy > 36 && yy < COLLAPSE - 2) {
        snapping.current = true;
        window.scrollTo({ top: lastDy.current > 0 || yy > COLLAPSE * 0.6 ? COLLAPSE + 4 : 0, behavior: 'smooth' });
        window.setTimeout(() => { snapping.current = false; }, 480);
      }
    }, 130);
  });

  return (
    <>
      <div style={{ position: 'relative', height: HERO_H, borderRadius: 24, overflow: 'hidden', background: '#1c2739', marginBottom: 12 }}>
        <motion.img src={coverUrl} alt="" draggable={false}
          style={{ y: imgY, scale: imgScale, filter: imgFilter, width: '100%', height: '100%', objectFit: 'cover', transformOrigin: 'center top', display: 'block' }} />
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,12,20,.18) 0%, rgba(8,12,20,0) 34%, rgba(8,12,20,0) 52%, rgba(8,12,20,.55) 100%)' }} />
        <motion.div style={{ y: bigTitleY, scale: bigTitleScale, opacity: bigTitleOpacity, transformOrigin: 'left bottom', position: 'absolute', left: 18, right: 18, bottom: BAR_H + 12 }}>
          <h1 style={{ fontSize: 26, margin: '0 0 5px', color: '#fff', lineHeight: 1.25 }}>{title}</h1>
          <p style={{ margin: 0, color: 'rgba(235,242,255,.85)', fontSize: 13 }}>{meta}</p>
        </motion.div>
      </div>
      <div style={{ position: 'sticky', top: 0, zIndex: 30, height: BAR_H, marginTop: -BAR_H, display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
        <motion.div aria-hidden="true" style={{ opacity: barBgOpacity, position: 'absolute', inset: 0, background: 'rgba(252,253,255,.86)', backdropFilter: 'blur(14px) saturate(1.4)', WebkitBackdropFilter: 'blur(14px) saturate(1.4)', borderBottom: '1px solid rgba(24,32,48,.07)', borderRadius: '0 0 18px 18px' }} />
        <button type="button" onClick={onBack}
          style={{ position: 'relative', border: 0, cursor: 'pointer', background: 'rgba(10,15,24,.42)', color: '#fff', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', padding: '8px 13px', borderRadius: 999, fontSize: 13, fontFamily: 'inherit', flexShrink: 0 }}>
          ← 返回相册
        </button>
        <motion.span style={{ opacity: barTitleOpacity, x: barTitleX, position: 'relative', fontSize: 15, fontWeight: 700, color: '#202632', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </motion.span>
      </div>
    </>
  );
}

function Thumb({ p, url, onView }: { p: P; url?: string; onView: () => void }) {
  if (!url) return null;
  return (
    <figure onClick={onView}>
      <BlurImg src={url} alt={p.caption ?? ''} />
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
  const coverUrl = useSignedUrl('media', album?.cover_url ?? null);
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
    setErr('');
    const { data: a, error: albumError } = await supabase.from('albums').select('*').eq('id', Number(id)).maybeSingle();
    if (albumError) { setErr('相册加载失败：' + albumError.message); return; }
    if (!a || a.deleted_at) {
      setAlbum(null);
      if (!a) setErr('找不到这个相册，或你没有查看权限。');
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
  const [upPct, setUpPct] = useState<number | null>(null);
  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []).filter(f => f.type.startsWith('image/'));
    if (!list.length) { if (files?.length) setErr('只能上传图片'); return; }
    setBusy(true); setErr(''); setUpProg(''); setUpPct(0);
    try {
      let firstPath: string | null = null;
      for (let i = 0; i < list.length; i++) {
        setUpProg(`上传中 ${i + 1}/${list.length}`);
        setUpPct(0);
        const small = await downscaleImage(list[i]);
        const path = await uploadMediaWithProgress('media', small, undefined, pct => setUpPct(pct));
        if (!firstPath) firstPath = path;
        const { error } = await withRetry(() => supabase.from('album_photos')
          .insert({ album_id: Number(id), photo_url: path, caption: i === 0 ? (cap.trim() || null) : null, uploaded_by: me }));
        if (error) throw error;
      }
      if (!album?.cover_url && firstPath) await withRetry(() => supabase.from('albums').update({ cover_url: firstPath }).eq('id', Number(id)));
      setCap(''); setUpProg(''); load();
    } catch (e: any) { setErr('上传失败：' + (e.message || '网络错误')); }
    finally { setBusy(false); setUpProg(''); setUpPct(null); }
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
    if (!(await confirmDialog(message, { danger: true, confirmText: '确认删除' }))) return;
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
    if (!(await confirmDialog('删除这张照片？文件也会从相册存储中移除。', { danger: true, confirmText: '确认删除' }))) return;
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

  if (album === null && !err) return <div className="page"><PageSkeleton /></div>;
  if (album === null && err) return <div className="page"><div className="center" role="alert" style={{ padding: 24 }}><p>{err}</p><button className="ghost" onClick={() => void load()}>重试</button><button className="ghost" onClick={() => nav('/albums')}>返回相册</button></div></div>;

  return (
    <div className="page">
      {coverUrl ? (
        <AlbumHero title={album.title} meta={`${album.category} · ${photos.length} 张`}
          coverUrl={coverUrl} onBack={() => nav('/albums')} reduce={reduce} />
      ) : (
        <>
          <button className="backbtn" onClick={() => nav('/albums')}>← 返回相册</button>
          <div className="hero" style={{ paddingTop: 8 }}>
            <h1 style={{ fontSize: 24 }}>{album.title}</h1>
            <p>{album.category} · {photos.length} 张</p>
          </div>
        </>
      )}
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
          {busy && upPct !== null && <div style={{ marginTop: 8 }}><SmoothProgress value={upPct} label={upProg ? `${upProg} · ${upPct}%` : undefined} /></div>}
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
