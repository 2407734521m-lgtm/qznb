import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import type { AdminPost as Post, AdminComment as Cmt } from '../../types/content';
import { card, mut, rowBtn, alog, timeAgo } from './shared';
import { confirmDialog, promptDialog } from '../../lib/dialog';

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
  const [query, setQuery] = useState('');
  const [contentStatus, setContentStatus] = useState<'all' | 'visible' | 'hidden'>('all');
  const [reportStatus, setReportStatus] = useState<'all' | 'pending' | 'done' | 'rejected'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<Set<Post['id']>>(new Set());
  const [selectedComments, setSelectedComments] = useState<Set<Cmt['id']>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

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

  useEffect(() => {
    setSelectedPosts(new Set());
    setSelectedComments(new Set());
  }, [sub, query, contentStatus]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function hidePost(p: Post, hide: boolean) {
    if (!(await confirmDialog(hide ? '隐藏这条帖子？（进回收站，可恢复）' : '恢复这条帖子？'))) return;
    const { error } = await supabase.rpc('admin_set_post_hidden', { p_id: p.id, p_hidden: hide });
    if (!error) { await alog(hide ? 'post_hide' : 'post_restore', { id: p.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function delPost(p: Post) {
    if (!(await confirmDialog('彻底删除这条帖子？不可恢复！', { danger: true }))) return;
    if (!(await confirmDialog('再次确认：真的彻底删除吗？', { danger: true }))) return;
    const { error } = await supabase.from('posts').delete().eq('id', p.id);
    if (!error) { await alog('post_delete', { id: p.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function hideCmt(c: Cmt, hide: boolean) {
    if (!(await confirmDialog(hide ? '隐藏这条评论？' : '恢复这条评论？'))) return;
    const { error } = await supabase.rpc('admin_set_comment_hidden', { p_id: c.id, p_hidden: hide });
    if (!error) { await alog(hide ? 'comment_hide' : 'comment_restore', { id: c.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function restoreBoard(b: BoardRow) {
    if (!(await confirmDialog('恢复这条公告？恢复后立即公开显示。'))) return;
    const { error } = await supabase.from('board_messages').update({ deleted_at: null }).eq('id', b.id);
    if (!error) { await alog('notice_restore', { id: b.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function purgeBoard(b: BoardRow) {
    if (!(await confirmDialog('彻底删除这条公告？不可恢复！', { danger: true }))) return;
    if (!(await confirmDialog('再次确认：真的彻底删除吗？', { danger: true }))) return;
    const { error } = await supabase.from('board_messages').delete().eq('id', b.id);
    if (!error) { await alog('notice_purge', { id: b.id }); load(); }
    else setMsg('失败：' + error.message);
  }
  async function purgeCmt(c: Cmt) {
    if (!(await confirmDialog('彻底删除这条评论？不可恢复！', { danger: true }))) return;
    if (!(await confirmDialog('再次确认：真的彻底删除吗？', { danger: true }))) return;
    const { error } = await supabase.from('comments').delete().eq('id', c.id);
    if (!error) { await alog('comment_purge', { id: c.id }); load(); }
    else setMsg('失败：' + error.message);
  }

  async function handleReport(r: Report, ok: boolean) {
    const answer = ok ? null : await promptDialog('驳回原因（可选）：');
    if (!ok && answer === null) return;
    const note = answer ?? '';
    const { error } = await supabase.from('reports').update({
      status: ok ? 'done' : 'rejected', handle_note: note || null, handled_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (!error) { await alog('report_handle', { id: r.id, result: ok ? 'done' : 'rejected', note }); load(); setMsg('已处理'); }
    else setMsg('失败：' + error.message);
  }

  const needle = query.trim().toLocaleLowerCase();
  const matches = (value: unknown) => !needle || String(value ?? '').toLocaleLowerCase().includes(needle);
  const filteredPosts = posts.filter(p =>
    (contentStatus === 'all' || (contentStatus === 'hidden' ? !!p.deleted_at : !p.deleted_at))
    && (matches(p.content) || matches(names[p.author_id]) || matches(String(p.id)))
  );
  const filteredComments = cmts.filter(comment =>
    (contentStatus === 'all' || (contentStatus === 'hidden' ? !!comment.deleted_at : !comment.deleted_at))
    && (matches(comment.content) || matches(names[comment.author_id]) || matches(String(comment.post_id)))
  );
  const filteredReports = reports.filter(report =>
    (reportStatus === 'all' || report.status === reportStatus)
    && (matches(report.reason) || matches(report.target_type) || matches(String(report.target_id)) || matches(report.status))
  );
  const filteredTrashP = trashP.filter(p => matches(p.content) || matches(names[p.author_id]) || matches(String(p.id)));
  const filteredTrashC = trashC.filter(comment => matches(comment.content) || matches(names[comment.author_id]) || matches(String(comment.post_id)));
  const filteredTrashB = trashB.filter(b => matches(b.title) || matches(b.content) || matches(names[b.author_id || '']));

  async function batchSetPostsHidden(hide: boolean) {
    const targets = filteredPosts.filter(post =>
      selectedPosts.has(post.id) && (hide ? !post.deleted_at : !!post.deleted_at)
    );
    if (!targets.length) {
      setMsg('当前选择中没有可' + (hide ? '隐藏' : '恢复') + '的帖子。');
      return;
    }
    const verb = hide ? '隐藏' : '恢复';
    if (!(await confirmDialog('确认' + verb + '选中的 ' + targets.length + ' 条帖子？'))) return;

    setBatchBusy(true);
    let success = 0;
    let failed = 0;
    for (const post of targets) {
      const { error } = await supabase.rpc('admin_set_post_hidden', {
        p_id: post.id,
        p_hidden: hide,
      });
      if (error) {
        failed++;
        continue;
      }
      success++;
      await alog(hide ? 'post_hide' : 'post_restore', { id: post.id, batch: true });
    }
    setBatchBusy(false);
    setSelectedPosts(new Set());
    await load();
    setMsg(verb + '帖子完成：成功 ' + success + ' 条，失败 ' + failed + ' 条。');
  }

  async function batchSetCommentsHidden(hide: boolean) {
    const targets = filteredComments.filter(comment =>
      selectedComments.has(comment.id) && (hide ? !comment.deleted_at : !!comment.deleted_at)
    );
    if (!targets.length) {
      setMsg('当前选择中没有可' + (hide ? '隐藏' : '恢复') + '的评论。');
      return;
    }
    const verb = hide ? '隐藏' : '恢复';
    if (!(await confirmDialog('确认' + verb + '选中的 ' + targets.length + ' 条评论？'))) return;

    setBatchBusy(true);
    let success = 0;
    let failed = 0;
    for (const comment of targets) {
      const { error } = await supabase.rpc('admin_set_comment_hidden', {
        p_id: comment.id,
        p_hidden: hide,
      });
      if (error) {
        failed++;
        continue;
      }
      success++;
      await alog(hide ? 'comment_hide' : 'comment_restore', { id: comment.id, batch: true });
    }
    setBatchBusy(false);
    setSelectedComments(new Set());
    await load();
    setMsg(verb + '评论完成：成功 ' + success + ' 条，失败 ' + failed + ' 条。');
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
    <div style={{ ...card, marginBottom: 12 }}>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索内容、发布者、帖子编号或举报原因…" style={{ flex: 1, minWidth: 0 }} />
        <button className="mini ghost" disabled={refreshing} onClick={() => void refresh()}>{refreshing ? '刷新中…' : '刷新'}</button>
      </div>
      {sub === 'posts' || sub === 'comments' ? <div className="row" style={{ gap: 6, marginTop: 9 }}>
        {([['all', '全部'], ['visible', '正常'], ['hidden', '已隐藏']] as const).map(([value, label]) =>
          <button key={value} className={'mini' + (contentStatus === value ? '' : ' ghost')} onClick={() => setContentStatus(value)}>{label}</button>
        )}
      </div> : null}
      {sub === 'reports' ? <div className="row" style={{ gap: 6, marginTop: 9 }}>
        {([['all', '全部状态'], ['pending', '待处理'], ['done', '已处理'], ['rejected', '已驳回']] as const).map(([value, label]) =>
          <button key={value} className={'mini' + (reportStatus === value ? '' : ' ghost')} onClick={() => setReportStatus(value)}>{label}</button>
        )}
      </div> : null}
      {sub === 'posts' && <div className="admin-moderation-batchbar">
        <div className="admin-moderation-batchbar-copy">
          <strong>已选 {filteredPosts.filter(post => selectedPosts.has(post.id)).length} 条帖子</strong>
          <span>当前筛选 {filteredPosts.length} 条；列表最多载入最近 50 条</span>
        </div>
        <div className="admin-moderation-batchbar-actions">
          <button className="mini ghost" disabled={batchBusy || filteredPosts.length === 0}
            onClick={() => setSelectedPosts(new Set(filteredPosts.map(post => post.id)))}>选择当前筛选</button>
          <button className="mini ghost" disabled={batchBusy || selectedPosts.size === 0}
            onClick={() => setSelectedPosts(new Set())}>清空</button>
          {filteredPosts.some(post => selectedPosts.has(post.id) && !post.deleted_at) &&
            <button className="mini ghost" disabled={batchBusy} onClick={() => void batchSetPostsHidden(true)}>
              {batchBusy ? '处理中…' : '批量隐藏'}
            </button>}
          {filteredPosts.some(post => selectedPosts.has(post.id) && !!post.deleted_at) &&
            <button className="mini" disabled={batchBusy} onClick={() => void batchSetPostsHidden(false)}>
              {batchBusy ? '处理中…' : '批量恢复'}
            </button>}
        </div>
      </div>}
      {sub === 'comments' && <div className="admin-moderation-batchbar">
        <div className="admin-moderation-batchbar-copy">
          <strong>已选 {filteredComments.filter(comment => selectedComments.has(comment.id)).length} 条评论</strong>
          <span>当前筛选 {filteredComments.length} 条；列表最多载入最近 50 条</span>
        </div>
        <div className="admin-moderation-batchbar-actions">
          <button className="mini ghost" disabled={batchBusy || filteredComments.length === 0}
            onClick={() => setSelectedComments(new Set(filteredComments.map(comment => comment.id)))}>选择当前筛选</button>
          <button className="mini ghost" disabled={batchBusy || selectedComments.size === 0}
            onClick={() => setSelectedComments(new Set())}>清空</button>
          {filteredComments.some(comment => selectedComments.has(comment.id) && !comment.deleted_at) &&
            <button className="mini ghost" disabled={batchBusy} onClick={() => void batchSetCommentsHidden(true)}>
              {batchBusy ? '处理中…' : '批量隐藏'}
            </button>}
          {filteredComments.some(comment => selectedComments.has(comment.id) && !!comment.deleted_at) &&
            <button className="mini" disabled={batchBusy} onClick={() => void batchSetCommentsHidden(false)}>
              {batchBusy ? '处理中…' : '批量恢复'}
            </button>}
        </div>
      </div>}
      <p style={{ ...mut, margin: '8px 0 0' }}>搜索范围会随当前分类变化；隐藏与永久删除仍保留二次确认。</p>
    </div>

    {sub === 'reports' && (<>
      {filteredReports.length === 0 && <div style={card}><p style={mut}>没有符合条件的举报</p></div>}
      {filteredReports.map(r => (
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
      {filteredPosts.map(p => (
        <div key={p.id} style={{ ...card, opacity: p.deleted_at ? 0.55 : 1 }}>
          <label className="admin-moderation-item-select">
            <input type="checkbox" checked={selectedPosts.has(p.id)}
              onChange={event => setSelectedPosts(current => {
                const next = new Set(current);
                if (event.target.checked) next.add(p.id); else next.delete(p.id);
                return next;
              })} />
            <span>选择帖子 #{p.id}</span>
          </label>
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
      {filteredPosts.length === 0 && <div style={card}><p style={mut}>没有符合条件的帖子</p></div>}
    </>)}

    {sub === 'comments' && (<>
      {filteredComments.map(c => (
        <div key={c.id} style={{ ...card, opacity: c.deleted_at ? 0.55 : 1 }}>
          <label className="admin-moderation-item-select">
            <input type="checkbox" checked={selectedComments.has(c.id)}
              onChange={event => setSelectedComments(current => {
                const next = new Set(current);
                if (event.target.checked) next.add(c.id); else next.delete(c.id);
                return next;
              })} />
            <span>选择评论 #{c.id}</span>
          </label>
          <div style={{ fontSize: 13.5 }}>{(c.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[c.author_id] || '…'} · {postSections[c.post_id] === 'daily' ? '日常' : postSections[c.post_id] === 'feed' ? '动态' : '帖子'} #{c.post_id} · {timeAgo(c.created_at)}{c.deleted_at ? ' · 已隐藏' : ''}</div>
          <div style={rowBtn}>
            {c.deleted_at
              ? <button className="mini" onClick={() => hideCmt(c, false)}>恢复</button>
              : <button className="mini ghost" onClick={() => hideCmt(c, true)}>隐藏</button>}
          </div>
        </div>
      ))}
      {filteredComments.length === 0 && <div style={card}><p style={mut}>没有符合条件的评论</p></div>}
    </>)}

    {sub === 'trash' && (<>
      {trashCount === 0 && <div style={card}><p style={mut}>回收站是空的。撤下的公告、隐藏的帖子和评论会先来到这里，可以恢复。</p></div>}
      {filteredTrashB.length > 0 && <p style={{ ...mut, margin: '4px 0 8px' }}>公告（{filteredTrashB.length}）</p>}
      {filteredTrashB.map(b => (
        <div key={'b' + b.id} style={{ ...card, opacity: 0.75 }}>
          <div style={{ fontSize: 13.5 }}>{b.title && <b>{b.title} </b>}{(b.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[b.author_id || ''] || '…'} · 删除于 {timeAgo(b.deleted_at || b.created_at)}</div>
          <div style={rowBtn}>
            <button className="mini" onClick={() => restoreBoard(b)}>恢复</button>
            <button className="mini danger" onClick={() => purgeBoard(b)}>彻底删除</button>
          </div>
        </div>
      ))}
      {filteredTrashP.length > 0 && <p style={{ ...mut, margin: '12px 0 8px' }}>帖子（{filteredTrashP.length}）</p>}
      {filteredTrashP.map(p => (
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
      {filteredTrashC.length > 0 && <p style={{ ...mut, margin: '12px 0 8px' }}>评论（{filteredTrashC.length}）</p>}
      {filteredTrashC.map(c => (
        <div key={'c' + c.id} style={{ ...card, opacity: 0.75 }}>
          <div style={{ fontSize: 13.5 }}>{(c.content || '').slice(0, 120)}</div>
          <div style={mut}>{names[c.author_id] || '…'} · {postSections[c.post_id] === 'daily' ? '日常' : postSections[c.post_id] === 'feed' ? '动态' : '帖子'} #{c.post_id} · 删除于 {timeAgo(c.deleted_at || c.created_at)}</div>
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
