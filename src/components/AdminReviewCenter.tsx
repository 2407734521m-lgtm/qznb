import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSignedUrls, useSignedUrl } from '../lib/media';
import { card, h3, mut, rowBtn, alog, timeAgo } from '../pages/admin/shared';
import { confirmDialog, promptDialog } from '../lib/dialog';
import type { Database } from '../lib/database.types';

type LoveRow = Database['public']['Tables']['love_wall_posts']['Row'];
type SongRow = Database['public']['Tables']['song_posts']['Row'];
type ReportRow = Database['public']['Tables']['reports']['Row'];
type FbRow = Database['public']['Tables']['feedbacks']['Row'];
type GameRow = { id: number; profile_id: string; game_name: string; rank: string | null; game_uid: string | null; status: string; created_at: string };
type LoveMedia = { id: string; path: string; kind: string; url?: string };

type Kind = 'love' | 'song' | 'game' | 'report' | 'feedback';
type Item =
  | { kind: 'love'; key: string; at: string; pos: number; row: LoveRow }
  | { kind: 'song'; key: string; at: string; pos: number; row: SongRow }
  | { kind: 'game'; key: string; at: string; pos: number; row: GameRow }
  | { kind: 'report'; key: string; at: string; pos: number; row: ReportRow }
  | { kind: 'feedback'; key: string; at: string; pos: number; row: FbRow };

const KIND_META: Record<Kind, { label: string; color: string; bg: string; tab: string; tabLabel: string }> = {
  love: { label: '表白', color: '#c2437e', bg: '#fdeef4', tab: 'loveWall', tabLabel: '表白墙' },
  song: { label: '歌声', color: '#6a4bc4', bg: '#efeafd', tab: 'songWall', tabLabel: '歌声墙' },
  game: { label: '段位', color: '#9a6d0d', bg: '#fdf3d8', tab: 'game', tabLabel: '段位' },
  report: { label: '举报', color: '#c23a3a', bg: '#fdeeee', tab: 'moderate', tabLabel: '审核' },
  feedback: { label: '反馈', color: '#1f66b3', bg: '#e8f1fd', tab: 'feedback', tabLabel: '反馈' },
};
const FILTERS: ['all' | Kind, string][] = [
  ['all', '全部待办'], ['love', '表白'], ['song', '歌声'], ['game', '段位'], ['report', '举报'], ['feedback', '反馈'],
];

function SongItem({ song, busy, onStatus }: { song: SongRow; busy: boolean; onStatus: (s: SongRow, status: string) => void }) {
  const url = useSignedUrl('song-audio', song.audio_path);
  return (
    <>
      <div style={{ fontSize: 13.5 }}><b>{song.title || '（无标题）'}</b></div>
      {song.description && <div style={{ fontSize: 13, marginTop: 3, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{song.description}</div>}
      {url && <audio controls preload="none" src={url} style={{ width: '100%', height: 36, marginTop: 8 }} />}
      <div style={rowBtn}>
        <button className="mini" disabled={busy} onClick={() => onStatus(song, 'published')}>审核通过</button>
        <button className="mini ghost" disabled={busy} onClick={() => onStatus(song, 'rejected')}>拒绝</button>
      </div>
    </>
  );
}

// 审核中心：把表白/歌声/段位/举报/反馈五个待办队列合到一页，按提交时间从早到晚排，
// 在一处审完。各队列的操作沿用各自原栏目的写法（同表、同 RPC、同状态值），
// 原栏目保留不动，历史与已处理内容仍在原栏目查看。
export default function AdminReviewCenter({ me, isSuper, setMsg, go }: {
  me: string;
  isSuper: boolean;
  setMsg: (s: string) => void;
  go: (tab: string) => void;
}) {
  const [love, setLove] = useState<LoveRow[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [games, setGames] = useState<GameRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [feedbacks, setFeedbacks] = useState<FbRow[]>([]);
  const [mediaByPost, setMediaByPost] = useState<Record<string, LoveMedia[]>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [loveProfiles, setLoveProfiles] = useState<Record<string, { display_name: string | null; real_name: string | null; username: string }>>({});
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [replyOpen, setReplyOpen] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [replyBusy, setReplyBusy] = useState(false);

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    const [lv, sg, gm, rp, fb] = await Promise.all([
      supabase.from('love_wall_posts').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
      supabase.from('song_posts').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
      supabase.from('game_profiles').select('id, profile_id, game_name, rank, game_uid, status, created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
      supabase.from('reports').select('*').eq('status', 'pending').order('created_at', { ascending: true }).limit(100),
      supabase.from('feedbacks').select('id, name, contact, content, kind, status, created_at, user_id, admin_note, handled_at').in('status', ['open', 'in_progress']).order('created_at', { ascending: true }).limit(100),
    ]);
    const loveRows = (lv.data ?? []) as LoveRow[];
    const fbRows = (fb.data ?? []) as FbRow[];
    setLove(loveRows);
    setSongs((sg.data ?? []) as SongRow[]);
    setGames((gm.data ?? []) as GameRow[]);
    setReports((rp.data ?? []) as ReportRow[]);
    setFeedbacks(fbRows);
    setNoteDrafts(Object.fromEntries(fbRows.map(f => [f.id, f.admin_note ?? ''])));

    if (loveRows.length) {
      const { data: mrows } = await supabase.rpc('love_wall_media_for_posts' as any, { p_post_ids: loveRows.map(x => x.id) });
      const mlist = ((mrows ?? []) as { id: string; post_id: string; path: string | null; kind: string }[])
        .filter((row): row is typeof row & { path: string } => typeof row.path === 'string' && row.path.length > 0);
      if (mlist.length) {
        const signed = await getSignedUrls('media', mlist.map(m => m.path)).catch(() => ({} as Record<string, string>));
        const grouped: Record<string, LoveMedia[]> = {};
        mlist.forEach(m => { (grouped[m.post_id] = grouped[m.post_id] || []).push({ id: m.id, path: m.path, kind: m.kind, url: signed[m.path] }); });
        setMediaByPost(grouped);
      } else setMediaByPost({});
      const { data: people } = await supabase.from('profiles')
        .select('id,username,display_name,real_name').in('id', [...new Set(loveRows.map(p => p.author_id))]);
      setLoveProfiles(Object.fromEntries((people ?? []).map(p => [p.id, p])));
    } else {
      setMediaByPost({});
      setLoveProfiles({});
    }

    const ids = new Set<string>();
    loveRows.forEach(x => ids.add(x.author_id));
    ((sg.data ?? []) as SongRow[]).forEach(x => ids.add(x.author_id));
    ((gm.data ?? []) as GameRow[]).forEach(x => ids.add(x.profile_id));
    ((rp.data ?? []) as ReportRow[]).forEach(x => { if (x.reporter_id) ids.add(x.reporter_id); });
    fbRows.forEach(x => { if (x.user_id) ids.add(x.user_id); });
    if (ids.size) {
      const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 200, skip: 0 });
      const mp: Record<string, string> = {};
      ((dir ?? []) as any[]).forEach((x: any) => { if (ids.has(x.id)) mp[x.id] = x.display_name ?? x.username; });
      setNames(mp);
    } else setNames({});
    if (!quiet) setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...love.map((row, i) => ({ kind: 'love' as const, key: 'love-' + row.id, at: row.created_at, pos: i + 1, row })),
      ...songs.map((row, i) => ({ kind: 'song' as const, key: 'song-' + row.id, at: row.created_at, pos: i + 1, row })),
      ...games.map((row, i) => ({ kind: 'game' as const, key: 'game-' + row.id, at: row.created_at, pos: i + 1, row })),
      ...reports.map((row, i) => ({ kind: 'report' as const, key: 'report-' + row.id, at: row.created_at, pos: i + 1, row })),
      ...feedbacks.map((row, i) => ({ kind: 'feedback' as const, key: 'fb-' + row.id, at: row.created_at, pos: i + 1, row })),
    ];
    all.sort((a, b) => a.at.localeCompare(b.at));
    return filter === 'all' ? all : all.filter(x => x.kind === filter);
  }, [love, songs, games, reports, feedbacks, filter]);

  const counts: Record<'all' | Kind, number> = {
    all: love.length + songs.length + games.length + reports.length + feedbacks.length,
    love: love.length, song: songs.length, game: games.length, report: reports.length, feedback: feedbacks.length,
  };

  async function loveSetStatus(p: LoveRow, status: string) {
    if (busyKey) return;
    setBusyKey('love-' + p.id);
    const { error } = await supabase.from('love_wall_posts').update({ status, updated_at: new Date().toISOString() }).eq('id', p.id);
    setBusyKey(null);
    if (error) { setMsg('处理失败：请检查管理员权限后重试。'); return; }
    setMsg(status === 'published' ? '表白已通过并发布。' : '表白已驳回。');
    await load(true);
  }

  async function songSetStatus(s: SongRow, status: string) {
    if (busyKey) return;
    setBusyKey('song-' + s.id);
    const { error } = await supabase.from('song_posts').update({ status, updated_at: new Date().toISOString() }).eq('id', s.id);
    setBusyKey(null);
    if (error) { setMsg('处理失败：请检查管理员权限后重试。'); return; }
    setMsg(status === 'published' ? '歌声已通过并发布。' : '歌声已拒绝。');
    await load(true);
  }

  async function gameReview(g: GameRow, approve: boolean) {
    if (busyKey) return;
    setBusyKey('game-' + g.id);
    const { error } = await supabase.rpc('review_game_profile', { pid: g.profile_id, approve });
    setBusyKey(null);
    if (error) { setMsg('操作失败：' + error.message); return; }
    await alog(approve ? 'game_approve' : 'game_reject', { pid: g.profile_id });
    setMsg(approve ? '段位已通过。' : '段位已驳回。');
    await load(true);
  }

  async function reportHandle(r: ReportRow, ok: boolean) {
    if (busyKey) return;
    const answer = ok ? null : await promptDialog('驳回原因（可选）：');
    if (!ok && answer === null) return;
    setBusyKey('report-' + r.id);
    const { error } = await supabase.from('reports').update({
      status: ok ? 'done' : 'rejected', handle_note: (answer ?? '') || null, handled_at: new Date().toISOString(),
    }).eq('id', r.id);
    setBusyKey(null);
    if (error) { setMsg('失败：' + error.message); return; }
    await alog('report_handle', { id: r.id, result: ok ? 'done' : 'rejected', note: answer ?? '' });
    setMsg('举报已处理。');
    await load(true);
  }

  async function fbSave(f: FbRow, status: string) {
    if (busyKey) return;
    const note = (noteDrafts[f.id] ?? f.admin_note ?? '').trim();
    if (note.length > 500) { setMsg('给用户的处理说明不能超过 500 字。'); return; }
    setBusyKey('fb-' + f.id);
    const { error } = await supabase.rpc('admin_update_feedback', {
      p_feedback_id: f.id, p_status: status, p_admin_note: note || null,
    });
    setBusyKey(null);
    if (error) { setMsg('更新反馈失败：' + error.message); return; }
    setMsg('反馈状态已更新' + (f.user_id ? '，已向提交人发送进度通知。' : '。'));
    await load(true);
  }

  async function fbReply(f: FbRow) {
    const text = (replyText[f.id] || '').trim();
    if (!text || !f.user_id || replyBusy) return;
    setReplyBusy(true);
    try {
      const { data: cid, error: e1 } = await supabase.rpc('get_or_create_conversation', { other: f.user_id });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body: text.slice(0, 2000) });
      if (e2) throw e2;
      setReplyText({ ...replyText, [f.id]: '' });
      setReplyOpen(null);
      await alog('feedback_reply', { id: f.id });
      setMsg('消息已发送，对方在「好友 - 聊天」里能看到。');
    } catch (e: any) { setMsg('发送失败：' + (e?.message || '')); }
    finally { setReplyBusy(false); }
  }

  async function fbDelete(f: FbRow) {
    if (!(await confirmDialog('删除这条反馈？删除后无法恢复。', { danger: true, confirmText: '确认删除' }))) return;
    const { error } = await supabase.from('feedbacks').delete().eq('id', f.id);
    if (error) { setMsg('删除失败：' + error.message); return; }
    await alog('feedback_delete', { id: f.id });
    await load(true);
  }

  const nameOf = (id: string | null | undefined) => (id ? names[id] || '…' : '…');

  return (
    <div>
      <div style={card}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h3 style={{ ...h3, margin: 0 }}>审核中心</h3>
          <button className="mini ghost" disabled={loading} onClick={() => void load()}>{loading ? '加载中…' : '刷新'}</button>
        </div>
        <p style={{ ...mut, margin: '6px 0 0' }}>
          表白、歌声、段位、举报、反馈的待办都在这里，按提交时间从早到晚排，在一处审完。
          {counts.all > 0 ? ` 当前共 ${counts.all} 件待办。` : ' 当前没有待办。'}
          已处理的历史仍在各原栏目里查看。
        </p>
        <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {FILTERS.map(([k, label]) => (
            <button key={k} className={'mini' + (filter === k ? '' : ' ghost')} onClick={() => setFilter(k)}>
              {label}{counts[k] ? `（${counts[k]}）` : ''}
            </button>
          ))}
        </div>
        {filter !== 'all' && (
          <p style={{ ...mut, margin: '8px 0 0' }}>
            只看{KIND_META[filter].label}队列。
            <button className="mini ghost" style={{ marginLeft: 8 }} onClick={() => go(KIND_META[filter].tab)}>打开原「{KIND_META[filter].tabLabel}」栏目</button>
          </p>
        )}
      </div>

      {!loading && items.length === 0 && (
        <div style={card}><p style={mut}>{counts.all === 0 ? '全部处理完了，没有待办。' : '这个分类没有待办。'}</p></div>
      )}

      {items.map(item => {
        const meta = KIND_META[item.kind];
        const busy = busyKey === item.key;
        return (
          <div key={item.key} style={card}>
            <div className="row" style={{ gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg, borderRadius: 999, padding: '2px 9px' }}>{meta.label}</span>
              <span style={mut}>排队第 {item.pos} 位 · {timeAgo(item.at)}</span>
            </div>

            {item.kind === 'love' && (() => {
              const p = item.row;
              const profile = loveProfiles[p.author_id];
              const media = mediaByPost[p.id] ?? [];
              return (
                <>
                  <div style={{ fontSize: 13, marginTop: 7 }}>
                    写给 <b>{p.recipient_name || '（未填）'}</b>
                    {p.category ? <span style={mut}> · {p.category}</span> : null}
                    <span style={mut}> · {p.is_anonymous ? '匿名投稿' : '实名投稿'} · 投稿人 {profile?.display_name || profile?.username || nameOf(p.author_id)}{profile?.real_name ? `（${profile.real_name}）` : ''}</span>
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{p.content}</div>
                  {media.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {media.map(m => m.kind === 'image' && m.url
                        ? <img key={m.id} src={m.url} alt="" style={{ width: 74, height: 74, objectFit: 'cover', borderRadius: 10 }} />
                        : m.url
                          ? <a key={m.id} href={m.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>{m.kind === 'video' ? '查看视频' : '查看附件'}</a>
                          : <span key={m.id} style={mut}>附件加载失败</span>)}
                    </div>
                  )}
                  <div style={rowBtn}>
                    <button className="mini" disabled={busy} onClick={() => void loveSetStatus(p, 'published')}>审核通过并发布</button>
                    <button className="mini ghost" disabled={busy} onClick={() => void loveSetStatus(p, 'rejected')}>拒绝投稿</button>
                  </div>
                </>
              );
            })()}

            {item.kind === 'song' && (
              <>
                <div style={{ ...mut, marginTop: 6 }}>投稿人 {nameOf(item.row.author_id)}</div>
                <SongItem song={item.row} busy={busy} onStatus={(s, st) => void songSetStatus(s, st)} />
              </>
            )}

            {item.kind === 'game' && (
              <>
                <div style={{ fontSize: 13.5, marginTop: 7 }}>
                  <b>{nameOf(item.row.profile_id)}</b> · {item.row.game_name}
                  {item.row.rank ? <> · <span style={{ color: '#b97e10' }}>{item.row.rank}</span></> : <span style={mut}>（未填段位）</span>}
                  {item.row.game_uid && <span style={mut}> · ID: {item.row.game_uid}</span>}
                </div>
                <div style={rowBtn}>
                  <button className="mini" disabled={busy} onClick={() => void gameReview(item.row, true)}>通过</button>
                  <button className="mini ghost" disabled={busy} onClick={() => void gameReview(item.row, false)}>驳回</button>
                </div>
              </>
            )}

            {item.kind === 'report' && (
              <>
                <div style={{ fontSize: 13.5, marginTop: 7 }}>
                  <b>{item.row.target_type}</b> #{item.row.target_id}
                  <span style={mut}> · 举报人 {nameOf(item.row.reporter_id)}</span>
                </div>
                <div style={{ fontSize: 13, marginTop: 3 }}>原因：{item.row.reason}</div>
                <div style={rowBtn}>
                  <button className="mini" disabled={busy} onClick={() => void reportHandle(item.row, true)}>已处理</button>
                  <button className="mini ghost" disabled={busy} onClick={() => void reportHandle(item.row, false)}>驳回</button>
                </div>
              </>
            )}

            {item.kind === 'feedback' && (() => {
              const f = item.row;
              return (
                <>
                  <div style={{ ...mut, marginTop: 6 }}>
                    {f.kind === 'login' ? '登录反馈' : '意见反馈'} · {f.status === 'in_progress' ? '处理中' : '待处理'}
                    {(f.name || f.contact) && <> — {f.name ?? ''}{f.name && f.contact ? ' / ' : ''}{f.contact ?? ''}</>}
                    {f.user_id && <> · {nameOf(f.user_id)}</>}
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.content}</div>
                  <label style={{ display: 'block', fontSize: 11.5, color: '#aeb7d4', margin: '8px 0 5px' }}>给提交人的处理说明（最多 500 字）</label>
                  <textarea
                    value={noteDrafts[f.id] ?? ''}
                    onChange={e => setNoteDrafts(current => ({ ...current, [f.id]: e.target.value.slice(0, 500) }))}
                    rows={2}
                    maxLength={500}
                    placeholder="填写用户可见的处理结果或下一步安排…"
                    style={{ width: '100%', marginBottom: 7 }}
                  />
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button className="mini" disabled={busy} onClick={() => void fbSave(f, f.status || 'open')}>{busy ? '保存中…' : '保存说明并通知'}</button>
                    {f.status === 'open' && <button className="mini ghost" disabled={busy} onClick={() => void fbSave(f, 'in_progress')}>开始处理</button>}
                    {f.status !== 'done' && <button className="mini ghost" disabled={busy} onClick={() => void fbSave(f, 'done')}>标记已处理</button>}
                    {f.user_id && <button className="mini ghost" onClick={() => setReplyOpen(replyOpen === f.id ? null : f.id)}>站内私信</button>}
                    {isSuper && <button className="mini danger" onClick={() => void fbDelete(f)}>删除</button>}
                  </div>
                  {replyOpen === f.id && (
                    <div style={{ marginTop: 8 }}>
                      <textarea value={replyText[f.id] || ''} onChange={e => setReplyText({ ...replyText, [f.id]: e.target.value })} rows={3} maxLength={2000} placeholder="发送一条站内私信…" style={{ width: '100%' }} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button className="mini" disabled={replyBusy} onClick={() => void fbReply(f)}>{replyBusy ? '发送中…' : '发送私信'}</button>
                        <button className="mini ghost" onClick={() => setReplyOpen(null)}>取消</button>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
