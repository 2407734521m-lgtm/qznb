import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';
import Photo from '../components/Photo';
import { setShot, takeShot, shotFrom, flyTo } from '../lib/transition';

export type M = {
  id: string; username: string; display_name: string | null; personality: string | null;
  signature: string | null; avatar_path: string | null;
};
const PAGE = 18;

function Card({ m, i, onOpen }: { m: M; i: number; onOpen: (m: M, el: HTMLElement, img: string) => void }) {
  const reduce = useReducedMotion();
  const url = useSignedUrl('avatars', m.avatar_path);
  const ref = useRef<HTMLDivElement>(null);
  const name = m.display_name ?? m.username;
  return (
    <motion.div ref={ref} className="mcard" data-member={m.id}
      initial={reduce ? {} : { opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : Math.min(i * 0.05, 0.5), ease: [0.22, 1, 0.36, 1] }}
      onClick={() => ref.current && onOpen(m, ref.current.querySelector('.photo') as HTMLElement, url ?? '')}>
      <Photo id={m.id} path={m.avatar_path} name={name} />
      <h3>{name}</h3>
      <p>{m.signature ?? m.personality ?? '这个人很神秘'}</p>
    </motion.div>
  );
}

export default function Members() {
  const nav = useNavigate(); const reduce = useReducedMotion();
  const [q, setQ] = useState(''); const [rows, setRows] = useState<M[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading'); const [more, setMore] = useState(false);

  async function load(reset: boolean, query: string, base: M[]) {
    setState('loading');
    const { data, error } = await supabase.rpc('member_directory', { q: query, lim: PAGE, skip: reset ? 0 : base.length });
    if (error) return setState('error');
    const list = (data ?? []) as M[];
    setRows(reset ? list : [...base, ...list]); setMore(list.length === PAGE); setState('ok');
  }
  useEffect(() => { const t = setTimeout(() => load(true, q, []), 300); return () => clearTimeout(t); }, [q]);

  // 返回时的反向共享元素过渡：飞回对应的卡片
  useEffect(() => {
    const s = takeShot();
    if (!s?.img || reduce) return;
    const t = setTimeout(() => {
      const sel = s.key ? `[data-member="${CSS.escape(s.key)}"] .photo` : '.mcard .photo';
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) {
        el.style.visibility = 'hidden';
        flyTo(s, el, { duration: 520, onDone: () => { el.style.visibility = ''; } });
      }
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(m: M, photoEl: HTMLElement, img: string) {
    const s = shotFrom(photoEl, img);
    if (s) setShot(s);
    nav(`/members/${m.id}`, { state: { m, img } });
  }

  return (
    <div className="page">
      <div className="hero">
        <h1>我们的班级</h1>
        <p>青 春 档 案 · 每 一 张 面 孔 都 是 故 事</p>
      </div>
      <div className="searchbar">
        <input placeholder="🔍 按名字、性格搜索成员" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {state === 'error' && <p className="err">加载失败。请确认已用邀请码加入班级，或检查网络后重试。
        <button className="ghost" onClick={() => load(true, q, [])}>重试</button></p>}
      {state === 'ok' && rows.length === 0 && <div className="center"><div className="card">
        {q ? '没有找到匹配的成员。' : '还没有成员公开资料。先到「我的」填写资料并加入班级，邀请同学注册吧。'}</div></div>}
      <div className="mgrid">
        {rows.map((m, i) => <Card key={m.id} m={m} i={i} onOpen={open} />)}
      </div>
      {state === 'loading' && <p className="center" style={{ minHeight: 120 }}>加载中…</p>}
      {state === 'ok' && more && <button className="pri" onClick={() => load(false, q, rows)}>加载更多</button>}
    </div>
  );
}
