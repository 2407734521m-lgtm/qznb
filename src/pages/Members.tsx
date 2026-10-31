import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useSignedUrls } from '../lib/media';
import Photo from '../components/Photo';
import { setShot, takeShot, shotFrom, flyTo } from '../lib/transition';
import { badgeText } from '../data/games';
import type { MemberListItem } from '../types/profile';

const PAGE = 18;

const LAYOUTS = [
  { k: 'c2', name: '2列 · 大卡', icon: '🖼️' },
  { k: 'c3', name: '3列', icon: '🔲' },
  { k: 'c4', name: '4列 · 紧凑', icon: '▦' },
  { k: 'c6', name: '6列 · 迷你', icon: '⋮⋮' },
  { k: 'list', name: '列表', icon: '📋' },
] as const;

function Card({ m, i, badge, signedUrl, onOpen }: { m: MemberListItem; i: number; badge?: string; signedUrl?: string; onOpen: (m: MemberListItem, el: HTMLElement, img: string) => void }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const name = m.display_name ?? m.username;
  return (
    <motion.div ref={ref} className="mcard" data-member={m.id}
      initial={reduce ? {} : { opacity: 0, y: 26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduce ? 0 : Math.min(i * 0.05, 0.5), ease: [0.22, 1, 0.36, 1] }}
      onClick={() => ref.current && onOpen(m, ref.current.querySelector('.photo') as HTMLElement, signedUrl ?? '')}>
      <Photo id={m.id} path={m.avatar_path} name={name} signedUrl={signedUrl ?? ''} />
      <h3>{name}</h3>
      <p>{m.signature ?? m.personality ?? '这个人很神秘'}</p>
      {badge && <div className="gbadge">{badge}</div>}
    </motion.div>
  );
}

export default function Members() {
  const nav = useNavigate(); const reduce = useReducedMotion();
  const [q, setQ] = useState(''); const [rows, setRows] = useState<MemberListItem[]>([]);
  const avatarUrls = useSignedUrls('avatars', rows.map(m => m.avatar_path));
  const [badges, setBadges] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<string>(() => localStorage.getItem('ca_members_layout') || 'c2');
  const [lopen, setLopen] = useState(false);
  function pickLayout(k: string) {
    setLayout(k); localStorage.setItem('ca_members_layout', k); setLopen(false);
  }
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading'); const [more, setMore] = useState(false);

  async function load(reset: boolean, query: string, base: MemberListItem[]) {
    setState('loading');
    const { data, error } = await supabase.rpc('member_directory', { q: query, lim: PAGE, skip: reset ? 0 : base.length });
    if (error) return setState('error');
    const list = data ?? [];
    setRows(reset ? list : [...base, ...list]); setMore(list.length === PAGE); setState('ok');
  }
  useEffect(() => { const t = setTimeout(() => load(true, q, []), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    supabase.rpc('game_badges').then(({ data }) => {
      const map: Record<string, string> = {};
      ((data ?? []) as Array<{ profile_id: string; game_name: string; rank: string }>).forEach(b => {
        map[b.profile_id] = badgeText(b.game_name, b.rank);
      });
      setBadges(map);
    });
  }, []);

  // 返回时的反向共享元素过渡：飞回对应的卡片
  useEffect(() => {
    const s = takeShot();
    if (!s || reduce) return;
    const sel = s.key ? `[data-member="${CSS.escape(s.key)}"] .photo` : '.mcard .photo';
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    // 先把目标卡片滚回视口再飞，避免幽灵飞向屏幕外的坐标。
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const t = setTimeout(() => {
      el.style.visibility = 'hidden';
      flyTo(s, el, { duration: 520, onDone: () => { el.style.visibility = ''; } });
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open(m: MemberListItem, photoEl: HTMLElement, img: string) {
    const s = shotFrom(photoEl, img, m.display_name || m.username);
    if (s) {
      // 按卡片所在列决定飞入方向：左列← / 右列→ / 中间↓
      const cx = photoEl.getBoundingClientRect(), midX = cx.x + cx.width / 2, w = window.innerWidth;
      s.dir = midX < w * 0.38 ? 'left' : midX > w * 0.62 ? 'right' : 'down';
      setShot(s);
    }
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
      <div className="mtoolbar">
        <span className="mut" style={{ fontSize: 12.5 }}>{rows.length} 位成员</span>
        <div className="lswitch">
          <button type="button" className="ghost" style={{ width: 'auto', padding: '8px 14px', fontSize: 13 }}
            onClick={() => setLopen(!lopen)}>🔲 排列</button>
          {lopen && <>
            <div className="lmask" onClick={() => setLopen(false)} />
            <div className="lpop">
              {LAYOUTS.map(l => (
                <button key={l.k} type="button" className={layout === l.k ? 'on' : ''}
                  onClick={() => pickLayout(l.k)}>{l.icon} {l.name}</button>
              ))}
            </div>
          </>}
        </div>
      </div>
      <div className={'mgrid ' + layout}>
        {rows.map((m, i) => <Card key={m.id} m={m} i={i} badge={badges[m.id]} signedUrl={m.avatar_path ? avatarUrls[m.avatar_path] : ''} onOpen={open} />)}
      </div>
      {state === 'loading' && <p className="center" style={{ minHeight: 120 }}>加载中…</p>}
      {state === 'ok' && more && <button className="pri" onClick={() => load(false, q, rows)}>加载更多</button>}
    </div>
  );
}
