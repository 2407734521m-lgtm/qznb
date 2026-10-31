import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import type { AdminPost as Post, AdminComment as Cmt } from '../../types/content';
import { card, mut, rowBtn, alog, timeAgo } from './shared';

type Report = Database['public']['Tables']['reports']['Row'];
type BoardRow = Database['public']['Tables']['board_messages']['Row'];

export default function Moderate({ setMsg }: { setMsg: (s: string) => void }) {
  const [sub, setSub] = useState<'posts' | 'comments' | 'reports' | 'trash'>('reports');
  const [posts, setPosts] = useState<Post[]>([]);
  const [cmts, setCmts] = useState<Cmt[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [trashP, setTrashP] = useState<Post[]>([]);
  const [trashC, setTrashC] = useState<Cmt[]>([]);
  const [trashB, setTrashB] = useState<BoardRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [postSections, setPostSections] = useState<Record<number, string>>({});

  async function load() {
    const [p, c, r, tp, tc, tb] = await Promise.all([
      supabase.from('posts').select('id, author_id, content, image_url, created_at, deleted_at, section').order('created_at', { ascending: false }).limit(50),
      supabase.from('comments').select('id, post_id, author_id, content, created_at, deleted_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('posts').select('id, author_id, content, image_url, created_at, deleted_at, section').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(50),
      supabase.from('comments').select('id, post_id, author_id, content, created_at, deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(50),
      supabase.from('board_messages').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(50),
    ]);
    setPosts(p.data ?? []); setCmts(c.data ?? []); setReports((r.data ?? []) as Report[]);
    setTrashP(tp.data ?? []); setTrashC(tc.data ?? []); setTrashB((tb.data ?? []) as BoardRow[]);
    const commentPostIds = [...new Set([...(c.data ?? []), ...(tc.data ?? [])].map(comment => comment.post_id))];
    const sectionMap: Record<number, string> = {};
    if (commentPostIds.length) {
      const { data: commentPosts } = await supabase.from('posts').select('id, section').in('id', commentPostIds);
      (commentPosts ?? []).forEach(post => { sectionMap[post.id] = post.section ?? 'feed'; });
    }
    setPostSections(sectionMap);
    const ids = new Set<string>();
    (p.data ?? []).forEach((x: any) => ids.add(x.author_id));
    (c.data ?? []).forEach((x: any) => ids.add(x.author_id));
    (tp.data ?? []).forEach((x: any) => ids.add(x.author_id));
    (tc.data ?? []).forEach((x: any) => ids.add(x.author_id));
    (tb.data ?? []).forEach((x: any) => ids.add(x.author_id));
    if (ids.size) {
      const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 200, skip: 0 });
      const mp: Record<string, string> = {};
      ((dir ?? []) as any[]).forEach((x: any) => { mp[x.id] = x.display_name ?? x.username; });
      setNames(mp);
    }
  }
  useEffect(() => { load(); }, []);

  async function hidePost(p: Post, hide: boolean) {
    if (!confirm(hide ? '隐藏这条帖子？（进回收站，可恢复）' : '恢复这条帖子？')) return;
    const { error } = await supabase.rpc('admin_set_post_hidden', { p_id: p.id, p_hidden: hide });
    if (!error) { await alog(hide ? 'post_hide' : 'post_restore', { id: p.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function delPost(p: Post) {
    if (!confirm('彻底删除这条帖子？不可恢复！')) return;
    if (!confirm('再次确认：真的彻底删除吗？')) return;
    const { error } = await supabase.from('posts').delete().eq('id', p.id);
    if (!error) { await alog('post_delete', { id: p.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function hideCmt(c: Cmt, hide: boolean) {
    if (!confirm(hide ? '隐藏这条评论？' : '恢复这条评论？')) return;
    const { error } = await supabase.rpc('admin_set_comment_hidden', { p_id: c.id, p_hidden: hide });
    if (!error) { await alog(hide ? 'comment_hide' : 'comment_restore', { id: c.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function restoreBoard(b: BoardRow) {
    if (!confirm('恢复这条公告？恢复后立即公开显示。')) return;
    const { error } = await supabase.from('board_messages').update({ deleted_at: null }).eq('id', b.id);
    if (!error) { await alog('notice_restore', { id: b.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function purgeBoard(b: BoardRow) {
    if (!confirm('彻底删除这条公告？不可恢复！')) return;
    if (!confirm('再次确认：真的彻底删除吗？')) return;
    const { error } = await supabase.from('board_messages').delete().eq('id', b.id);
    if (!error) { await alog('notice_purge', { id: b.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function purgeCmt(c: Cmt) {
    if (!confirm('彻底删除这条评论？不可恢复！')) return;
    if (!confirm('再次确认：真的彻底删除吗？')) return;
    const { error } = await supabase.from('comments').delete().eq('id', c.id);
    if (!error) { await alog('comment_purge', { id: c.id }); load(); }
    else setMsg('失败：' + error.message);
  }

  async function handleReport(r: Report, ok: boolean) {
    const answer = ok ? null : prompt('驳回原因（可选）：');
    if (!ok && answer === null) return;
    const note = answer ?? '';
    const { error } = await supabase.from('reports').update({
      status: ok ? 'done' : 'rejected', handle_note: note || null, handled_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (!error) { await alog('report_handle', { id: r.id, result: ok ? 'done' : 'rejected', note }); load(); setMsg('已处理'); }
    else setMsg('失败：' + error.message);
  }

  const pending = reports.filter(r => r.status === 'pending').length;
  const trashCount = trashP.length + trashC.length + trashB.length;
  return (<>
    <div className="row" style={{ gap: 6, marginBottom: 12 }}>
      <button className={'mini' + (sub === 'reports' ? '' : ' ghost')} onClick={() => setSub('reports')}>举报{pending ? `（${pending}）` : ''}</button>
      <button className={'mini' + (sub === 'posts' ? '' : ' ghost')} onClick={() => setSub('posts')}>帖子</button>
      <button className={'mini' + (sub === 'comments' ? '' : ' ghost')} onClick={() => setSub('comments')}>评论</button>
      <button className={'mini' + (sub === 'trash' ? '' : ' ghost')} onClick={() => setSub('trash')}>回收站{trashCount ? `（${trashCount}）` : ''}</button>
    </div>

    {sub === 'reports' && (<>
      {reports.length === 0 && <div style={card}><p style={mut}>暂无举报</p></div>}
      {reports.map(r => (
        <div key={r.id} style={{ ...card, opacity: r.status === 'pending' ? 1 : 0.6 }}>
          <div style={{ fontSize: 13.5 }}>
            <b>{r.target_type}</b> #{r.target_id} · {r.status === 'pending' ? '待处理' : r.status === 'done' ? '已处理' : '已驳回'}
          </div>
          <div style={{ fontSize: 13, marginTop: 4 }}>原因：{r.reason}</div>
          {r.handle_note && <div style={mut}>处理备注：{r.handle_note}</div>}
          <div style={mut}>{timeAgo(r.created_at)}</div>
          {r.status === 'pending' && (
            <div style={rowBtn}>
              <button className="mini" onClick={() => handleReport(r, true)}>已处理</button>
              <button className="mini ghost" onClick={() => handleReport(r, false)}>驳回</button>
            </div>
          )}
        </div>
      ))}
    </>)}

    {sub === 'posts' && (<>
      {posts.map(p => (
        <div key={p.id} style={{ ...card, opacity: p.deleted_at ? 0.55 : 1 }}>
          <div style={{ fontSize: 11.5, color: '#9aa4c7', marginBottom: 4 }}>{p.section === 'daily' ? '日常' : '动态'}</div>
          <div style={{ fontSize: 13.5 }}>{(p.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[p.author_id] || '…'} · {timeAgo(p.created_at)}{p.deleted_at ? ' · 已隐藏' : ''}</div>
          <div style={rowBtn}>
            {p.deleted_at
              ? <button className="mini" onClick={() => hidePost(p, false)}>恢复</button>
              : <button className="mini ghost" onClick={() => hidePost(p, true)}>隐藏</button>}
            <button className="mini danger" onClick={() => delPost(p)}>彻底删除</button>
          </div>
        </div>
      ))}
      {posts.length === 0 && <div style={card}><p style={mut}>暂无帖子</p></div>}
    </>)}

    {sub === 'comments' && (<>
      {cmts.map(c => (
        <div key={c.id} style={{ ...card, opacity: c.deleted_at ? 0.55 : 1 }}>
          <div style={{ fontSize: 13.5 }}>{(c.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[c.author_id] || '…'} · {postSections[c.post_id] === 'daily' ? '日常' : '动态'} #{c.post_id} · {timeAgo(c.created_at)}{c.deleted_at ? ' · 已隐藏' : ''}</div>
          <div style={rowBtn}>
            {c.deleted_at
              ? <button className="mini" onClick={() => hideCmt(c, false)}>恢复</button>
              : <button className="mini ghost" onClick={() => hideCmt(c, true)}>隐藏</button>}
          </div>
        </div>
      ))}
      {cmts.length === 0 && <div style={card}><p style={mut}>暂无评论</p></div>}
    </>)}

    {sub === 'trash' && (<>
      {trashCount === 0 && <div style={card}><p style={mut}>回收站是空的。撤下的公告、隐藏的动态和评论会先来到这里，可以恢复。</p></div>}
      {trashB.length > 0 && <p style={{ ...mut, margin: '4px 0 8px' }}>公告（{trashB.length}）</p>}
      {trashB.map(b => (
        <div key={'b' + b.id} style={{ ...card, opacity: 0.75 }}>
          <div style={{ fontSize: 13.5 }}>{b.title && <b>{b.title} </b>}{(b.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[b.author_id || ''] || '…'} · 删除于 {timeAgo(b.deleted_at || b.created_at)}</div>
          <div style={rowBtn}>
            <button className="mini" onClick={() => restoreBoard(b)}>恢复</button>
            <button className="mini danger" onClick={() => purgeBoard(b)}>彻底删除</button>
          </div>
        </div>
      ))}
      {trashP.length > 0 && <p style={{ ...mut, margin: '12px 0 8px' }}>帖子（{trashP.length}）</p>}
      {trashP.map(p => (
        <div key={'p' + p.id} style={{ ...card, opacity: 0.75 }}>
          <div style={{ fontSize: 11.5, color: '#9aa4c7', marginBottom: 4 }}>{p.section === 'daily' ? '日常' : '动态'}</div>
          <div style={{ fontSize: 13.5 }}>{(p.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[p.author_id] || '…'} · 删除于 {timeAgo(p.deleted_at || p.created_at)}</div>
          <div style={rowBtn}>
            <button className="mini" onClick={() => hidePost(p, false)}>恢复</button>
            <button className="mini danger" onClick={() => delPost(p)}>彻底删除</button>
          </div>
        </div>
      ))}
      {trashC.length > 0 && <p style={{ ...mut, margin: '12px 0 8px' }}>评论（{trashC.length}）</p>}
      {trashC.map(c => (
        <div key={'c' + c.id} style={{ ...card, opacity: 0.75 }}>
          <div style={{ fontSize: 13.5 }}>{(c.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[c.author_id] || '…'} · {postSections[c.post_id] === 'daily' ? '日常' : '动态'} #{c.post_id} · 删除于 {timeAgo(c.deleted_at || c.created_at)}</div>
          <div style={rowBtn}>
            <button className="mini" onClick={() => hideCmt(c, false)}>恢复</button>
            <button className="mini danger" onClick={() => purgeCmt(c)}>彻底删除</button>
          </div>
        </div>
      ))}
    </>)}
  </>);
}

/* ---------------- 公告管理 ---------------- */
