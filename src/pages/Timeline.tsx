import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl, uploadMedia, downscaleImage } from '../lib/media';

type T = { id: number; profile_id: string; happened_on: string; title: string; content: string | null; media_url: string | null };

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
  const fref = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from('timelines').select('*').eq('profile_id', target)
      .order('happened_on', { ascending: false }).order('id', { ascending: false });
    setRows((data ?? []) as T[]);
    if (!mine) {
      const { data: d } = await supabase.rpc('member_detail', { uid: target });
      setWho(d?.[0] ? (d[0].display_name || d[0].username || '暂未填写') : '');
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

  async function del(id: number) {
    if (!confirm('删除这条时间线？')) return;
    await supabase.from('timelines').delete().eq('id', id);
    load();
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
          <label>日期</label><input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <label>标题</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="如：第一次班级春游" maxLength={80} />
          <label>文字</label><textarea value={content} onChange={e => setContent(e.target.value)} placeholder="写下当时的心情…" rows={3} />
          <label>照片 / 视频（可选）</label>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className="ghost" onClick={() => fref.current?.click()}>{file ? '已选：' + file.name.slice(0, 18) : '选择文件'}</button>
            <input ref={fref} type="file" accept="image/*,video/mp4" hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {err && <p className="err">{err}</p>}
          <button className="pri" disabled={busy} onClick={add}>{busy ? '保存中…' : '保存到时间线'}</button>
        </div>}
      </>}
      <div className="tl">
        {rows.length === 0 && <p className="mut" style={{ padding: '20px 0' }}>还没有记录，去创造第一条吧 ✨</p>}
        {years.map(y => (
          <div key={y}>
            <div className="tl-year">{y}</div>
            {rows.filter(r => r.happened_on.startsWith(y)).map((r, i) => (
              <motion.div key={r.id} className="tl-item"
                initial={reduce ? {} : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: Math.min(i * 0.06, 0.4) }}>
                {mine && <button className="tl-del" onClick={() => del(r.id)}>✕</button>}
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
