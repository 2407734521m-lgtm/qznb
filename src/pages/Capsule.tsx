import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';
import { EASE, DUR } from '../lib/motion';

/** 时光胶囊：写给未来的信，到期才能看。
 *  呈现照参考视频的信封收件箱来做：信封叠成一摞、日期居中、右上角火漆印、
 *  自动滚动每 3.5 秒翻一封、点下面一封把它翻到最上面、点最上面一封开封阅读
 *  （背景模糊 + 信封口翻开 + 信纸滑出）、左滑或点删除进碎纸机（纸条飘落）再进回收站。
 *  碎纸机动画播完才写 deleted_at，写失败信不删；回收站里可恢复，彻底删除仍要确认。 */
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// open_at 是日期（YYYY-MM-DD），按本地午夜算开启时刻，避免 UTC 午夜在 +8 时区差一天。
function parseLocalDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function fmtEnvelopeDate(s: string) {
  const d = parseLocalDate(s);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// 信纸分页：按 260 字切页，页数是内容真实长度算出来的，不虚构 10 页。
function chunkContent(content: string, size = 260) {
  const pages: string[] = [];
  for (let i = 0; i < content.length; i += size) pages.push(content.slice(i, i + size));
  return pages.length ? pages : [''];
}

// 视频里的倒计时口径：还有 X 天 Y 小时开启；不足一天只说小时。
function countdown(openAt: string, now: number) {
  const diff = parseLocalDate(openAt).getTime() - now;
  if (diff <= 0) return '';
  const days = Math.floor(diff / 864e5);
  const hours = Math.floor((diff % 864e5) / 36e5);
  return days > 0 ? `还有 ${days} 天 ${hours} 小时开启` : `还有 ${hours} 小时开启`;
}

export default function Capsule() {
  const me = useAuth().session!.user.id;
  const reduce = useReducedMotion();
  const [list, setList] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [openAt, setOpenAt] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [msg, setMsg] = useState('');
  const [reading, setReading] = useState<any>(null);
  const [shakeId, setShakeId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // 信封摞的顺序：初始按开启日期，自动滚动 / 点下面一封都会改这个顺序，不改数据库。
  const [order, setOrder] = useState<number[]>([]);
  // 视频里默认就是自动滚动：开着，每 3.5 秒翻一封；阅读时自动停。
  const [autoScroll, setAutoScroll] = useState(true);
  // 视频里的分类与未读：收件箱 = 别人的公开胶囊，我发的 = 自己的，未读 = 已到期但本机还没点开过的。
  // 未读只记在本机 localStorage 里，表里没有已读字段，换设备不会同步，这一点下面和汇报里都会明说。
  const [readIds, setReadIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem('capsule-read-ids') || '[]'); } catch { return []; }
  });
  const [filter, setFilter] = useState<'all' | 'inbox' | 'sent' | 'unread' | 'locked' | 'trash'>('all');
  const [page, setPage] = useState(0);
  const [trash, setTrash] = useState<any[]>([]);
  const [shredding, setShredding] = useState<any>(null);
  const swipedRef = useRef(false);
  const touchXRef = useRef(0);

  async function load() {
    // 主列表只显示没删的；回收站只显示本人的已删胶囊。
    const { data } = await supabase.from('time_capsules').select('*').is('deleted_at', null).order('open_at', { ascending: true }).limit(50);
    setList(data ?? []);
    const { data: trashData } = await supabase.from('time_capsules').select('*').eq('author_id', me).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(50);
    setTrash(trashData ?? []);
  }
  useEffect(() => { load(); }, []);
  const idsKey = useMemo(() => list.map(c => c.id).join(','), [list]);
  useEffect(() => { setOrder(list.map(c => c.id)); }, [idsKey, list]);
  // 倒计时按分钟刷新一次即可，不必每秒重渲染。
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  // 自动滚动：阅读、碎纸、回收站时都停下，免得信纸还没看完摞就翻走了。
  useEffect(() => {
    if (!autoScroll || reading || shredding || filter === 'trash' || order.length < 2 || reduce) return;
    const t = setInterval(() => setOrder(o => (o.length < 2 ? o : [...o.slice(1), o[0]])), 3500);
    return () => clearInterval(t);
  }, [autoScroll, reading, shredding, filter, order.length, reduce]);
  // 碎纸机：动画播完（1.5 秒，减动效 0.4 秒）才真正写 deleted_at；写失败信不删、只报错。
  useEffect(() => {
    if (!shredding) return;
    const t = setTimeout(async () => {
      const { error } = await supabase.from('time_capsules').update({ deleted_at: new Date().toISOString() }).eq('id', shredding.id);
      if (error) setMsg('放进回收站失败：' + error.message);
      setShredding(null);
      load();
    }, reduce ? 400 : 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shredding]);
  // 阅读页按 Esc 关闭；每次换一封信都回到第 1 页。
  useEffect(() => {
    if (!reading) return;
    setPage(0);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReading(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reading]);

  function markRead(id: number) {
    setReadIds(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try { localStorage.setItem('capsule-read-ids', JSON.stringify(next)); } catch { /* 本机存不下也不影响读信 */ }
      return next;
    });
  }

  async function save() {
    if (!title.trim() || !content.trim() || !openAt) return setMsg('标题、内容、开启日期都要填');
    const { error } = await supabase.from('time_capsules').insert({
      author_id: me, title: title.trim().slice(0, 60), content: content.trim().slice(0, 2000),
      open_at: openAt, is_public: isPublic,
    });
    if (error) setMsg('保存失败：' + error.message);
    else { setMsg('已封存，到期才能开启'); setTitle(''); setContent(''); setOpenAt(''); setIsPublic(false); load(); }
  }
  async function restore(id: number) {
    const { error } = await supabase.from('time_capsules').update({ deleted_at: null }).eq('id', id);
    if (error) setMsg('恢复失败：' + error.message);
    load();
  }
  async function permDel(id: number) {
    if (!confirm('彻底删除？删了就找不回来了')) return;
    await supabase.from('time_capsules').delete().eq('id', id);
    if (reading?.id === id) setReading(null);
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  const byId = useMemo(() => new Map(list.map(c => [c.id, c])), [list]);
  const allOrdered = order.map(id => byId.get(id)).filter(Boolean);
  const ordered = allOrdered.filter(c => {
    if (filter === 'trash') return false;
    if (filter === 'inbox') return c.author_id !== me;
    if (filter === 'sent') return c.author_id === me;
    if (filter === 'unread') return c.open_at <= today && !readIds.includes(c.id);
    if (filter === 'locked') return c.open_at > today;
    return true;
  });
  const top = ordered[0];
  const readingPages = reading ? chunkContent(String(reading.content || '')) : [''];
  const safePage = Math.min(page, readingPages.length - 1);
  const counts = {
    all: allOrdered.length,
    inbox: allOrdered.filter(c => c.author_id !== me).length,
    sent: allOrdered.filter(c => c.author_id === me).length,
    unread: allOrdered.filter(c => c.open_at <= today && !readIds.includes(c.id)).length,
    locked: allOrdered.filter(c => c.open_at > today).length,
    trash: trash.length,
  };

  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      <BackButton fallback="/explore" />
      <div className="hero"><h1>时光胶囊</h1><p>写 给 未 来 的 信</p></div>
      <div className="card">
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>埋下新的胶囊</h3>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="标题" maxLength={60} style={{ marginBottom: 8 }} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="想对未来的自己或班级说什么…" rows={4} maxLength={2000} style={{ width: '100%', marginBottom: 8 }} />
        <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--mut)' }}>开启日期：</span>
          <input type="date" value={openAt} min={today} onChange={e => setOpenAt(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /> 到期后公开给全班看
        </label>
        <button className="pri" onClick={save}>封存</button>
        {msg && <p className="priv-note" style={{ marginTop: 8 }}>{msg}</p>}
      </div>

      {(allOrdered.length > 0 || trash.length > 0) && (
        <>
          <div className="capsule-filters" role="tablist" aria-label="胶囊分类">
            {([
              ['all', '全部'], ['inbox', '收件箱'], ['sent', '我发的'], ['unread', '未读'], ['locked', '未开启'], ['trash', '最近删除'],
            ] as const).map(([key, label]) => (
              <button key={key} className={`mini ${filter === key ? 'pri' : 'ghost'}`} onClick={() => setFilter(key)}>
                {label} {counts[key]}
              </button>
            ))}
          </div>
          <div className="capsule-toolbar">
            <label className="capsule-autoscroll">
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
              自动滚动
            </label>
            <span className="capsule-hint">点下面一封翻到最上面，点最上面一封打开它；左滑一封或点删除进碎纸机</span>
          </div>
          <div className="capsule-stack">
            {ordered.map((c, i) => {
              const opened = c.open_at <= today;
              const mine = c.author_id === me;
              const shaking = shakeId === c.id;
              const isTop = i === 0;
              return (
                <motion.div key={c.id} className="capsule-item" layout={!reduce}
                  style={{ zIndex: ordered.length - i, marginLeft: Math.min(i * 6, 24), marginRight: Math.min(i * 6, 24) }}
                  initial={reduce ? false : { opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DUR.slow, delay: Math.min(i, 8) * 0.05, ease: EASE }}>
                  <motion.div
                    className={`capsule-envelope ${opened ? 'is-open' : 'is-sealed'}`}
                    role="button" tabIndex={0}
                    animate={shaking && !reduce ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                    transition={{ duration: 0.4, ease: 'easeInOut' }}
                    whileTap={reduce ? undefined : { scale: 0.98 }}
                    onTouchStart={e => { touchXRef.current = e.touches[0].clientX; }}
                    onTouchEnd={e => {
                      // 左滑超过 80 才进碎纸机；没滑够不删。不用 framer drag：弹性约束会把位移压到阈值以下，滑再远也触发不了。
                      const dx = e.changedTouches[0].clientX - touchXRef.current;
                      if (dx < -80 && mine) { swipedRef.current = true; setShredding(c); }
                    }}
                    onClick={() => {
                      if (swipedRef.current) { swipedRef.current = false; return; }
                      if (!isTop) { setOrder(o => [c.id, ...o.filter(x => x !== c.id)]); return; }
                      if (opened) { setReading(c); markRead(c.id); } else setShakeId(c.id);
                    }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLElement).click(); } }}
                    aria-label={isTop
                      ? (opened ? `打开胶囊：${c.title}` : `未开启的胶囊，${countdown(c.open_at, now)}`)
                      : `把这封胶囊翻到最上面，开启日期 ${c.open_at}`}>
                    <span className="capsule-flap" aria-hidden="true" />
                    {opened && !readIds.includes(c.id) && <span className="capsule-paperclip" aria-hidden="true">📎</span>}
                    <span className="capsule-seal" aria-hidden="true">{opened ? '开' : '封'}</span>
                    <span className="capsule-face">
                      <span className="capsule-date">{fmtEnvelopeDate(c.open_at)}</span>
                      {/* 未到期绝不露标题与内容，只显示“未开启的胶囊”，与原来一致 */}
                      <span className="capsule-title">{opened ? c.title : '未开启的胶囊'}</span>
                      <span className="capsule-meta">
                        {opened ? '点开读信' : countdown(c.open_at, now)} · {c.is_public ? '公开' : '私密'}
                      </span>
                    </span>
                  </motion.div>
                  {mine && (
                    <div className="capsule-row">
                      <span>{isTop ? '最上面这封是你的' : '你的胶囊'}</span>
                      <button className="mini ghost" onClick={e => { e.stopPropagation(); setShredding(c); }}>删除</button>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
          {filter === 'trash' && (
            <div className="capsule-stack">
              {trash.map(t => (
                <div key={t.id} className="capsule-item">
                  <div className="capsule-envelope is-sealed">
                    <span className="capsule-flap" aria-hidden="true" />
                    <span className="capsule-seal" aria-hidden="true">删</span>
                    <span className="capsule-face">
                      <span className="capsule-date">{fmtEnvelopeDate(t.open_at)}</span>
                      <span className="capsule-title">{t.title}</span>
                      <span className="capsule-meta">删除于 {new Date(t.deleted_at).toISOString().slice(0, 10)} · {t.is_public ? '公开' : '私密'}</span>
                    </span>
                  </div>
                  <div className="capsule-row">
                    <span>你的胶囊，可恢复</span>
                    <span style={{ display: 'flex', gap: 8 }}>
                      <button className="mini ghost" onClick={() => restore(t.id)}>恢复</button>
                      <button className="mini danger" onClick={() => permDel(t.id)}>彻底删除</button>
                    </span>
                  </div>
                </div>
              ))}
              {trash.length === 0 && <div className="center"><div className="card">回收站是空的</div></div>}
            </div>
          )}
          {ordered.length === 0 && filter !== 'trash' && <div className="center"><div className="card">这个分类下还没有胶囊</div></div>}
          {top && filter !== 'trash' && (
            <p className="capsule-count">共 {ordered.length} 封 · 最上面是 {fmtEnvelopeDate(top.open_at)} 的一封</p>
          )}
        </>
      )}
      {list.length === 0 && trash.length === 0 && <div className="center"><div className="card">还没有时光胶囊，埋下第一个吧</div></div>}

      {/* 开封阅读：背景模糊 + 信封口翻开 + 信纸从信封里滑出；未到期永远进不了这里 */}
      <AnimatePresence>
        {reading && (
          <motion.div className="capsule-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE }}
            onClick={() => setReading(null)}>
            <div className="capsule-reading" onClick={e => e.stopPropagation()}>
              <motion.div className="capsule-reading-flap" aria-hidden="true"
                initial={reduce ? false : { rotateX: 0 }}
                animate={{ rotateX: reduce ? 0 : -180 }}
                transition={{ duration: DUR.slow, ease: EASE }} />
              <div className="capsule-reading-body" aria-hidden="true" />
              <motion.div className="capsule-letter"
                initial={reduce ? false : { opacity: 0, y: 48, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: DUR.slow, delay: reduce ? 0 : 0.22, ease: EASE }}>
                <div className="capsule-letter-head">
                  <div>
                    <div className="capsule-letter-title">{reading.title}</div>
                    <div className="capsule-letter-meta">{fmtEnvelopeDate(reading.open_at)} · {reading.is_public ? '公开' : '私密'}</div>
                  </div>
                  <button className="mini ghost" onClick={() => setReading(null)} aria-label="关闭">✕</button>
                </div>
                <p className="capsule-letter-body">{readingPages[safePage]}</p>
                <div className="capsule-page-nav">
                  <button className="mini ghost" disabled={safePage <= 0} onClick={() => setPage(p => Math.max(0, p - 1))}>‹ 上一页</button>
                  <span>{safePage + 1} / {readingPages.length}</span>
                  <button className="mini ghost" disabled={safePage >= readingPages.length - 1} onClick={() => setPage(p => Math.min(readingPages.length - 1, p + 1))}>下一页 ›</button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 碎纸机：信封先被吸进机器，再掉纸条；动画播完 useEffect 才写 deleted_at */}
      <AnimatePresence>
        {shredding && (
          <motion.div className="capsule-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: DUR.base, ease: EASE }}>
            <div className="capsule-shredder-wrap">
              <div className="capsule-shredder" aria-hidden="true">
                <div className="capsule-shredder-slot" />
                <span>碎纸机</span>
              </div>
              <motion.div className="capsule-shred-envelope"
                initial={reduce ? false : { y: 140, opacity: 1, scale: 1 }}
                animate={{ y: reduce ? 0 : -30, opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.7 }}
                transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}>
                <span className="capsule-date">{fmtEnvelopeDate(shredding.open_at)}</span>
                <span className="capsule-title">{shredding.open_at <= today ? shredding.title : '未开启的胶囊'}</span>
              </motion.div>
              <div className="capsule-strips" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <motion.span key={i} className="capsule-strip"
                    style={{ left: `${(i * 13) % 180}px`, width: `${8 + (i % 3) * 3}px` }}
                    initial={reduce ? false : { y: 0, opacity: 0, rotate: 0 }}
                    animate={{ y: reduce ? 0 : 180, opacity: reduce ? 1 : [0, 1, 0], rotate: ((i * 37) % 60) - 30 }}
                    transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.6 + i * 0.05, ease: EASE }} />
                ))}
              </div>
              <p className="capsule-shred-text">正在碎掉，放进回收站</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
