import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl, uploadMedia, downscaleImage } from '../lib/media';
import { confirmDialog, alertDialog } from '../lib/dialog';
import DateTimeField from '../components/DateTimeField';

type T = { id: number; profile_id: string; happened_on: string; title: string; content: string | null; media_url: string | null };

async function removeOwnedMedia(path: string | null | undefined, ownerId: string): Promise<string | null> {
  if (!path || path.startsWith('http://') || path.startsWith('https://') || !path.startsWith(`${ownerId}/`)) return null;
  try {
    const { error } = await supabase.storage.from('media').remove([path]);
    return error?.message ?? null;
  } catch (error) {
    return error instanceof Error ? error.message : '存储服务暂时不可用';
  }
}

function MediaView({ path }: { path: string }) {
  const url = useSignedUrl('media', path);
  if (!url) return null;
  return /\.mp4$/i.test(path)
    ? <video src={url} controls playsInline />
    : <img src={url} alt="" loading="lazy" />;
}

export default function Timeline() {
  const { uid } = useParams(); const nav = useNavigate(); const reduce = useReducedMotion();
  const me = useAuth().session!.user.id;
  const target = uid ?? me; const mine = target === me;
  const [rows, setRows] = useState<T[]>([]);
  const [who, setWho] = useState('');
  const [show, setShow] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState(''); const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);
  const [removeEditMedia, setRemoveEditMedia] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const editFref = useRef<HTMLInputElement>(null);
  const fref = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from('timelines').select('*').eq('profile_id', target)
      .order('happened_on', { ascending: false }).order('id', { ascending: false });
    setRows((data ?? []) as T[]);
    if (!mine) {
      const { data: d } = await supabase.rpc('member_detail', { uid: target });
      setWho(d?.[0] ? (d[0].display_name ?? d[0].username) : '');
    }
  }
  useEffect(() => { load(); }, [target]);

  async function add() {
    if (!title.trim() || !date) return setErr('请填写日期和标题');
    setBusy(true); setErr('');
    try {
      let media_url: string | null = null;
      if (file) {
        const f = file.type.startsWith('image/') ? await downscaleImage(file) : file;
        if (f.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10MB');
        media_url = await uploadMedia('media', f);
      }
      const { error } = await supabase.from('timelines')
        .insert({ profile_id: me, happened_on: date, title: title.trim(), content: content.trim() || null, media_url });
      if (error) throw error;
      setTitle(''); setContent(''); setFile(null); setShow(false); load();
    } catch (e: any) { setErr('保存失败：' + (e.message || '网络错误')); }
    finally { setBusy(false); }
  }

  function beginEdit(row: T) {
    setEditId(row.id);
    setEditDate(row.happened_on);
    setEditTitle(row.title);
    setEditContent(row.content ?? '');
    setEditFile(null);
    setRemoveEditMedia(false);
    setErr('');
  }

  async function saveEdit(row: T) {
    const title = editTitle.trim();
    if (!editDate || !title) { setErr('请填写日期和标题。'); return; }
    if (title.length > 80 || editContent.length > 2000) { setErr('标题最多 80 字，正文最多 2000 字。'); return; }
    setEditBusy(true); setErr('');
    let uploadedPath: string | null = null;
    let mediaUrl = removeEditMedia ? null : row.media_url;
    try {
      if (editFile) {
        const file = editFile.type.startsWith('image/') ? await downscaleImage(editFile) : editFile;
        if (file.size > 10 * 1024 * 1024) throw new Error('文件不能超过 10MB。');
        uploadedPath = await uploadMedia('media', file);
        mediaUrl = uploadedPath;
      }
      const { data, error } = await supabase.from('timelines').update({
        happened_on: editDate,
        title,
        content: editContent.trim() || null,
        media_url: mediaUrl,
      }).eq('id', row.id).eq('profile_id', me).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('记录不存在或当前账号没有编辑权限。');
      setEditId(null); setEditFile(null); setRemoveEditMedia(false);
      await load();
      if (row.media_url && row.media_url !== mediaUrl) {
        const cleanupError = await removeOwnedMedia(row.media_url, me);
        if (cleanupError) alertDialog('记录已保存，但旧文件清理失败：' + cleanupError);
      }
    } catch (error) {
      if (uploadedPath) await removeOwnedMedia(uploadedPath, me);
      setErr('保存修改失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
    } finally { setEditBusy(false); }
  }

  async function del(row: T) {
    if (!(await confirmDialog('删除这条时间线？关联的照片或视频也会一并清理。', { danger: true }))) return;
    const { data, error } = await supabase.from('timelines').delete()
      .eq('id', row.id).eq('profile_id', me).select('id').maybeSingle();
    if (error) { alertDialog('删除失败：' + error.message); return; }
    if (!data) { alertDialog('记录未删除：内容不存在或当前账号没有权限。'); return; }
    const cleanupError = await removeOwnedMedia(row.media_url, me);
    await load();
    if (cleanupError) alertDialog('记录已删除，但媒体文件清理失败：' + cleanupError);
  }

  const years = [...new Set(rows.map(r => r.happened_on.slice(0, 4)))];

  return (
    <div className="page">
      <button className="backbtn" onClick={() => nav(-1)}>← 返回</button>
      <div className="hero" style={{ paddingTop: 8 }}>
        <h1 style={{ fontSize: 24 }}>青春时间线</h1>
        <p>{mine ? '记录你的每一个闪光时刻' : `${who} 的青春印记`}</p>
      </div>
      {mine && <>
        <button className="pri" onClick={() => setShow(!show)}>{show ? '收起' : '＋ 添加时刻'}</button>
        {show && <div className="card" style={{ marginTop: 12 }}>
          <label>日期</label><DateTimeField mode="date" value={date} onChange={setDate} />
          <label>标题</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="如：第一次班级春游" maxLength={80} />
          <label>文字</label><textarea value={content} onChange={e => setContent(e.target.value)} placeholder="写下当时的心情…" rows={3} />
          <label>照片 / 视频（可选）</label>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="ghost" onClick={() => fref.current?.click()}>{file ? '已选：' + file.name.slice(0, 18) : '选择文件'}</button>
            <input ref={fref} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif,video/mp4" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {err && <p className="err">{err}</p>}
          <button className="pri" disabled={busy} onClick={add}>{busy ? '保存中…' : '保存到时间线'}</button>
        </div>}
      </>}
      <div className="tl">
        {rows.length === 0 && <p className="mut" style={{ padding: '20px 0' }}>还没有记录，去创造第一条吧</p>}
        {years.map(y => (
          <div key={y}>
            <div className="tl-year">{y}</div>
            {rows.filter(r => r.happened_on.startsWith(y)).map((r, i) => (
              <motion.div key={r.id} className="tl-item"
                initial={reduce ? {} : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.06, 0.4) }}>
                {mine && <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                  <button className="mini ghost" onClick={() => beginEdit(r)}>编辑</button>
                  <button className="tl-del" onClick={() => void del(r)} aria-label="删除时间线">✕</button>
                </div>}
                {mine && editId === r.id && <div className="card" style={{ marginBottom: 12 }}>
                  <label>日期</label><DateTimeField mode="date" value={editDate} onChange={setEditDate} />
                  <label>标题</label><input value={editTitle} onChange={e => setEditTitle(e.target.value)} maxLength={80} />
                  <label>文字</label><textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={3} maxLength={2000} />
                  <label>替换照片 / 视频（不选择则保留原文件）</label>
                  <div className="row" style={{ marginBottom: 8 }}>
                    <button className="ghost" disabled={editBusy} onClick={() => editFref.current?.click()}>{editFile ? '已选：' + editFile.name.slice(0, 18) : '选择文件'}</button>
                    <input ref={editFref} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/avif,video/mp4" hidden onChange={e => { setEditFile(e.target.files?.[0] ?? null); if (e.target.files?.[0]) setRemoveEditMedia(false); }} />
                  </div>
                  {r.media_url && <label><input type="checkbox" checked={removeEditMedia} onChange={e => setRemoveEditMedia(e.target.checked)} /> 移除现有媒体文件</label>}
                  {err && <p className="err">{err}</p>}
                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                    <button className="pri" disabled={editBusy} onClick={() => void saveEdit(r)}>{editBusy ? '保存中…' : '保存修改'}</button>
                    <button className="ghost" disabled={editBusy} onClick={() => { setEditId(null); setEditFile(null); setErr(''); }}>取消</button>
                  </div>
                </div>}
                <div className="d">{r.happened_on}</div>
                <h4>{r.title}</h4>
                {r.content && <p>{r.content}</p>}
                {r.media_url && <MediaView path={r.media_url} />}
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
