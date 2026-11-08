import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { withRetry } from '../lib/retry';
import { useAuth } from '../auth';
import { useSignedUrls } from '../lib/media';

type A = { id: number; title: string; category: string; cover_url: string | null; created_at: string; n?: number };
const CATS = ['班级日常', '军训', '运动会', '春游', '聚会', '毕业', '自定义'];

function Cover({ url }: { url?: string }) {
  return url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span style={{ fontSize: 34 }}></span>;
}

export default function Album() {
  const nav = useNavigate(); const reduce = useReducedMotion();
  const me = useAuth().session!.user.id;
  const [rows, setRows] = useState<A[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const signedCovers = useSignedUrls('media', rows.map(a => a.cover_url));
  const [show, setShow] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [title, setTitle] = useState(''); const [cat, setCat] = useState(CATS[0]); const [custom, setCustom] = useState('');
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true); setLoadError('');
    try {
      const { data: a, error: albumError } = await supabase.from('albums').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (albumError) throw albumError;
      const list = (a ?? []) as A[];
      if (list.length) {
        const { data: p, error: photoError } = await supabase.from('album_photos').select('album_id').in('album_id', list.map(x => x.id));
        if (photoError) throw photoError;
        const cnt: Record<number, number> = {};
        (p ?? []).forEach((r: any) => { cnt[r.album_id] = (cnt[r.album_id] || 0) + 1; });
        list.forEach(x => { x.n = cnt[x.id] || 0; });
      }
      setRows(list);
    } catch (e: any) {
      setLoadError(e?.message || '相册加载失败，请稍后重试。');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const categoryOptions = ['全部', ...Array.from(new Set(rows.map(row => row.category).filter(Boolean)))];
  const visibleRows = categoryFilter === '全部' ? rows : rows.filter(row => row.category === categoryFilter);

  async function create() {
    const t = title.trim(); const c = cat === '自定义' ? custom.trim() : cat;
    if (!t) return setErr('请填写相册名称');
    if (!c) return setErr('请填写分类');
    const { error } = await withRetry(() => supabase.from('albums').insert({ title: t, category: c.slice(0, 20), created_by: me }));
    if (error) return setErr('创建失败：' + error.message);
    setTitle(''); setCustom(''); setShow(false); setErr(''); load();
  }

  return (
    <div className="page">
      <div className="hero">
        <h1>班级相册</h1>
        <p>定 格 每 一 个 值 得 纪 念 的 瞬 间</p>
      </div>
      <button className="pri" onClick={() => setShow(!show)}>{show ? '收起' : '＋ 新建相册'}</button>
      {show && <div className="card" style={{ marginTop: 12 }}>
        <label>相册名称</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="如：2025 春游" maxLength={60} />
        <label>分类</label>
        <div className="album-categories" role="group" aria-label="相册分类" style={{ margin: '6px 0 2px' }}>
          {CATS.map(c => <button type="button" key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        {cat === '自定义' && <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="输入自定义分类" maxLength={20} />}
        {err && <p className="err">{err}</p>}
        <button className="pri" onClick={create}>创建相册</button>
      </div>}
      <div className="album-categories" role="group" aria-label="相册分类">
        {categoryOptions.map(category => <button type="button" key={category}
          className={categoryFilter === category ? 'on' : ''}
          onClick={() => setCategoryFilter(category)}>{category}</button>)}
      </div>
      <div className="agrid">
        {visibleRows.map((a, i) => (
          <motion.div key={a.id} className="acard"
            initial={reduce ? {} : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: Math.min(i * 0.05, 0.4) }}
            onClick={() => nav(`/albums/${a.id}`)}>
            <div className="cov"><Cover url={a.cover_url ? signedCovers[a.cover_url] : undefined} /></div>
            <div className="t"><h4>{a.title}</h4><p>{a.category} · {a.n ?? 0} 张</p></div>
          </motion.div>
        ))}
      </div>
      {loading && <div className="center" style={{ minHeight: 200 }}><div className="card">正在加载相册…</div></div>}
      {!loading && loadError && <div className="card err">{loadError}<button className="mini ghost" onClick={load}>重试</button></div>}
      {!loading && !loadError && rows.length === 0 && <div className="center" style={{ minHeight: 200 }}><div className="card">还没有相册，创建一个吧</div></div>}
      {!loading && !loadError && rows.length > 0 && visibleRows.length === 0 && <div className="center" style={{ minHeight: 140 }}><div className="card">这个分类暂时没有相册。</div></div>}
    </div>
  );
}
