import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';
import type { ProfileSummary as Profile } from '../types/profile';
import { confirmDialog } from '../lib/dialog';
import KaiboxDialog from '../components/KaiboxDialog';
import './Board.polish.css';

type Msg = { id: number; author_id: string; title: string | null; content: string; is_admin_msg: boolean; is_pinned: boolean; created_at: string };

function Avatar({ p, size = 38 }: { p?: Profile; size?: number }) {
  const url = useSignedUrl('avatars', p?.avatar_path);
  return (
    <div className="av" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <span>{(p?.display_name ?? p?.username ?? '?').slice(0, 1)}</span>}
    </div>
  );
}
function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(s).toLocaleDateString();
}

export default function Board() {
  const me = useAuth().session!.user.id; const reduce = useReducedMotion();
  const location = useLocation();
  const nav = useNavigate();
  const searchQuery = new URLSearchParams(location.search).get('q')?.trim() || '';
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showKaibox, setShowKaibox] = useState(false);
  const titleTaps = useRef({ count: 0, last: 0 });

  function handleTitleTap() {
    const now = Date.now();
    if (now - titleTaps.current.last > 1400) titleTaps.current.count = 0;
    titleTaps.current.last = now;
    titleTaps.current.count += 1;
    if (titleTaps.current.count >= 7) {
      titleTaps.current.count = 0;
      setShowKaibox(true);
    }
  }

  async function load() {
    const nowIso = new Date().toISOString();
    const { data } = await supabase.from('board_messages')
      .select('id, author_id, title, content, is_admin_msg, is_pinned, created_at')
      .is('deleted_at', null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('is_pinned', { ascending: false }).order('is_admin_msg', { ascending: false }).order('created_at', { ascending: false }).limit(100);
    const list = (data ?? []) as Msg[];
    setMsgs(list);
    const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 50, skip: 0 });
    const pm: Record<string, Profile> = {};
    (dir ?? []).forEach(x => { pm[x.id] = x; });
    setProfiles(pm);
    const { data: r } = await supabase.rpc('my_role');
    setIsAdmin(r === 'admin' || r === 'super_admin');
    // 标记已读：打开公告板即视为看过
    supabase.from('board_reads').upsert({ profile_id: me, last_seen_at: new Date().toISOString() }, { onConflict: 'profile_id' }).then(() => {
      window.dispatchEvent(new Event('board-read'));
    });
  }
  useEffect(() => { load(); }, []);

  async function send() {
    const c = text.trim();
    if (!c) return;
    setBusy(true); setErr('');
    const { error } = await supabase.from('board_messages').insert({
      author_id: me, content: c.slice(0, 500), is_admin_msg: false,
    });
    setBusy(false);
    if (error) return setErr('发送失败：' + error.message);
    setText(''); load();
  }

  async function del(id: number) {
    if (isAdmin) {
      if (!(await confirmDialog('删除这条留言？（先进回收站，可恢复）', { danger: true }))) return;
      await supabase.from('board_messages').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    } else {
      if (!(await confirmDialog('删除这条留言？', { danger: true }))) return;
      await supabase.from('board_messages').delete().eq('id', id);
    }
    load();
  }

  const displayMsgs = searchQuery
    ? msgs.filter(m => (m.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : msgs;
  const notices = displayMsgs.filter(m => m.is_admin_msg);
  const talks = displayMsgs.filter(m => !m.is_admin_msg);

  function renderMsg(m: Msg, i: number) {
    const a = profiles[m.author_id];
    return (
      <motion.article key={m.id} className={'post board-post' + (m.is_admin_msg ? ' board-post-admin' : '')}
        initial={reduce ? {} : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.25) }}>
        <div className="hd board-post-head">
          <Avatar p={a} />
          <div><div className="nm">{a ? (a.display_name ?? a.username) : '…'}
            {m.is_admin_msg && <span className="chip ad" style={{ marginLeft: 8, fontSize: 11 }}>公告</span>}
            {m.is_pinned && <span className="chip" style={{ marginLeft: 6, fontSize: 11 }}>置顶</span>}</div>
            <div className="tm">{timeAgo(m.created_at)}</div></div>
          <div style={{ flex: 1 }} />
          {(m.author_id === me || isAdmin) && <button className="del" onClick={() => del(m.id)}>删除</button>}
        </div>
        {m.is_admin_msg && m.title && <div className="board-post-title">{m.title}</div>}
        <p className="bd board-post-body" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p>
      </motion.article>
    );
  }

  return (
    <div className="page board-page" style={{ paddingBottom: 120 }}>
      <div className="hero board-hero">
        <h1 onClick={handleTitleTap} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTitleTap(); } }} style={{ cursor: 'pointer', userSelect: 'none' }}>公告板</h1>
        <p>班 级 通 知 · 留 言</p>
      </div>

      {searchQuery && <div className="feed-search-banner">搜索公告板：{searchQuery}<button type="button" onClick={() => nav('/board', { replace: true })}>清除搜索</button></div>}
      {notices.length > 0 && <>
        <p className="mut board-section-label board-section-label-admin">管理员公告</p>
        {notices.map((m, i) => renderMsg(m, i))}
      </>}

      {talks.length > 0 && <>
        <p className="mut board-section-label">同学留言</p>
        {talks.map((m, i) => renderMsg(m, i + notices.length))}
      </>}

      {displayMsgs.length === 0 && <div className="center" style={{ minHeight: 160 }}><div className="card">{searchQuery ? '公告板没有匹配内容。' : '还没有留言，来发第一条吧'}</div></div>}

      <div style={{ height: 70 }} />

      <div className="board-composer-wrap" style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(78px + env(safe-area-inset-bottom))', zIndex: 30 }}>
        <div className="card board-composer" style={{ margin: 0, padding: 8, borderRadius: 18 }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="board-composer-input" value={text} onChange={e => setText(e.target.value)} placeholder="说点什么…"
              maxLength={500} style={{ flex: 1, minWidth: 0, padding: '9px 12px', fontSize: 13.5 }} onKeyDown={e => e.key === 'Enter' && send()} />
            <button className="pri board-send" style={{ width: 'auto', padding: '9px 18px', fontSize: 13.5 }} disabled={busy || !text.trim()} onClick={send}>
              {busy ? '…' : '发送'}</button>
          </div>
          {err && <p className="err" style={{ margin: '6px 0 0', fontSize: 12.5 }}>{err}</p>}
        </div>
      </div>
      {showKaibox && <KaiboxDialog onClose={() => setShowKaibox(false)} />}
    </div>
  );
}
