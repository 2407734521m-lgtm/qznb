import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';
import { EASE, DUR } from '../lib/motion';

/** 时光胶囊：写给未来的信，到期才能看。
 *  本次只改列表的呈现与开封交互：信封叠层 + 点开居中放大、背景模糊、
 *  信封口翻开、信纸滑出成阅读页。查询、封存、删除、未到期不露内容均原样不动。 */
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

  async function load() {
    const { data } = await supabase.from('time_capsules').select('*').order('open_at', { ascending: true }).limit(50);
    setList(data ?? []);
  }
  useEffect(() => { load(); }, []);
  // 倒计时按分钟刷新一次即可，不必每秒重渲染。
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  // 阅读页按 Esc 关闭。
  useEffect(() => {
    if (!reading) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setReading(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reading]);

  async function save() {
    if (!title.trim() || !content.trim() || !openAt) return setMsg('标题、内容、开启日期都要填');
    const { error } = await supabase.from('time_capsules').insert({
      author_id: me, title: title.trim().slice(0, 60), content: content.trim().slice(0, 2000),
      open_at: openAt, is_public: isPublic,
    });
    if (error) setMsg('保存失败：' + error.message);
    else { setMsg('已封存，到期才能开启'); setTitle(''); setContent(''); setOpenAt(''); setIsPublic(false); load(); }
  }
  async function del(id: number) {
    if (!confirm('删除这个时光胶囊？')) return;
    await supabase.from('time_capsules').delete().eq('id', id);
    if (reading?.id === id) setReading(null);
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
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

      <div className="capsule-stack">
        {list.map((c, i) => {
          const opened = c.open_at <= today;
          const mine = c.author_id === me;
          const shaking = shakeId === c.id;
          return (
            <motion.div key={c.id}
              initial={reduce ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.slow, delay: Math.min(i, 8) * 0.05, ease: EASE }}>
              <motion.button type="button"
                className={`capsule-envelope ${opened ? 'is-open' : 'is-sealed'}`}
                animate={shaking && !reduce ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                whileTap={reduce ? undefined : { scale: 0.98 }}
                onClick={() => { if (opened) setReading(c); else setShakeId(c.id); }}
                aria-label={opened ? `打开胶囊：${c.title}` : `未开启的胶囊，${countdown(c.open_at, now)}`}>
                <span className="capsule-flap" aria-hidden="true" />
                <span className="capsule-seal" aria-hidden="true">{opened ? '开' : '封'}</span>
                <span className="capsule-face">
                  <span className="capsule-date">{fmtEnvelopeDate(c.open_at)}</span>
                  {/* 未到期绝不露标题与内容，只显示“未开启的胶囊”，与原来一致 */}
                  <span className="capsule-title">{opened ? c.title : '未开启的胶囊'}</span>
                  <span className="capsule-meta">
                    {opened ? '点开读信' : countdown(c.open_at, now)} · {c.is_public ? '公开' : '私密'}
                  </span>
                </span>
              </motion.button>
              {mine && (
                <div className="capsule-row">
                  <span>{opened ? '已到期' : '未到期'}</span>
                  <button className="mini ghost" onClick={() => del(c.id)}>删除</button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
      {list.length === 0 && <div className="center"><div className="card">还没有时光胶囊，埋下第一个吧</div></div>}

      {/* 开封阅读：背景模糊 + 信封口翻开 + 信纸滑出；未到期永远进不了这里 */}
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
                <p className="capsule-letter-body">{reading.content}</p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
