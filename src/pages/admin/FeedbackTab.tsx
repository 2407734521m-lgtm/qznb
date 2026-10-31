import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';
import { confirmDialog } from '../../lib/dialog';

type Fb = {
  id: number;
  name: string | null;
  contact: string | null;
  content: string;
  kind: string;
  status: string;
  created_at: string;
  user_id: string | null;
  admin_note: string | null;
  handled_at: string | null;
};

const statusLabel: Record<string, string> = {
  open: '待处理',
  in_progress: '处理中',
  done: '已处理',
};

export default function FeedbackTab({ me, isSuper, setMsg }: { me: string; isSuper: boolean; setMsg: (s: string) => void }) {
  const [list, setList] = useState<Fb[]>([]);
  const [filter, setFilter] = useState('all');
  const [replyOpen, setReplyOpen] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [replyBusy, setReplyBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');

  async function load() {
    const { data, error } = await supabase.from('feedbacks')
      .select('id, name, contact, content, kind, status, created_at, user_id, admin_note, handled_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError('');
    const rows = (data ?? []) as Fb[];
    setList(rows);
    setNoteDrafts(Object.fromEntries(rows.map(item => [item.id, item.admin_note ?? ''])));
  }

  useEffect(() => { void load(); }, []);

  async function saveFeedback(fb: Fb, status: string) {
    if (busyId !== null) return;
    const note = (noteDrafts[fb.id] ?? fb.admin_note ?? '').trim();
    if (note.length > 500) {
      setMsg('给用户的处理说明不能超过 500 字。');
      return;
    }
    setBusyId(fb.id);
    const { error } = await supabase.rpc('admin_update_feedback', {
      p_feedback_id: fb.id,
      p_status: status,
      p_admin_note: note || null,
    });
    setBusyId(null);
    if (error) {
      setMsg('更新反馈失败：' + error.message);
      return;
    }
    setMsg('反馈状态已更新' + (fb.user_id ? '，已向提交人发送进度通知。' : '。'));
    await load();
  }

  async function del(id: number) {
    if (!(await confirmDialog('删除这条反馈？删除后无法恢复。', { danger: true }))) return;
    const { error } = await supabase.from('feedbacks').delete().eq('id', id);
    if (!error) { await alog('feedback_delete', { id }); await load(); }
    else setMsg('删除失败：' + error.message);
  }

  async function sendReply(fb: Fb) {
    const text = (replyText[fb.id] || '').trim();
    if (!text || !fb.user_id || replyBusy) return;
    setReplyBusy(true);
    try {
      const { data: cid, error: e1 } = await supabase.rpc('get_or_create_conversation', { other: fb.user_id });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body: text.slice(0, 2000) });
      if (e2) throw e2;
      setReplyText({ ...replyText, [fb.id]: '' }); setReplyOpen(null);
      await alog('feedback_reply', { id: fb.id });
      setMsg('消息已发送，对方在「好友 - 聊天」里能看到。');
    } catch (e: any) { setMsg('发送失败：' + (e?.message || '')); }
    finally { setReplyBusy(false); }
  }

  const shown = list.filter(f => filter === 'all' ? true : f.status === filter);
  const todo = list.filter(f => f.status === 'open' || f.status === 'in_progress').length;
  return (
    <div style={card}>
      <h3 style={h3}>反馈与申诉（{todo} 条待跟进）</h3>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {([['all', '全部'], ['open', '待处理'], ['in_progress', '处理中'], ['done', '已处理']] as const).map(([k, l]) => (
          <button key={k} className={'mini' + (filter === k ? '' : ' ghost')} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <button className="mini ghost" onClick={() => void load()}>刷新</button>
      </div>
      {loadError && <p className="err">读取失败：{loadError}</p>}
      {shown.length === 0 && !loadError && <p style={mut}>暂无反馈</p>}
      {shown.map(f => (
        <div key={f.id} style={{ padding: '12px 0', borderBottom: '1px solid #ffffff0c' }}>
          <div style={{ fontSize: 12, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={mut}>{f.kind === 'login' ? '登录反馈' : '意见反馈'} · {(f.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            <span style={{ fontSize: 10.5, color: f.status === 'done' ? '#7ee2a8' : f.status === 'in_progress' ? '#8bb5ff' : '#f5c26b' }}>{statusLabel[f.status] || f.status}</span>
            {(f.name || f.contact) && <span style={mut}>— {f.name ?? ''}{f.name && f.contact ? ' / ' : ''}{f.contact ?? ''}</span>}
          </div>
          <div style={{ fontSize: 14, margin: '5px 0 8px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.content}</div>
          <label style={{ display: 'block', fontSize: 11.5, color: '#aeb7d4', marginBottom: 5 }}>给提交人的处理说明（最多 500 字）</label>
          <textarea
            value={noteDrafts[f.id] ?? ''}
            onChange={e => setNoteDrafts(current => ({ ...current, [f.id]: e.target.value.slice(0, 500) }))}
            rows={2}
            maxLength={500}
            placeholder="填写用户可见的处理结果或下一步安排…"
            style={{ width: '100%', marginBottom: 7 }}
          />
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button className="mini" disabled={busyId === f.id} onClick={() => void saveFeedback(f, f.status || 'open')}>
              {busyId === f.id ? '保存中…' : '保存说明并通知'}
            </button>
            {f.status === 'open' && <button className="mini ghost" disabled={busyId === f.id} onClick={() => void saveFeedback(f, 'in_progress')}>开始处理</button>}
            {f.status !== 'done' && <button className="mini ghost" disabled={busyId === f.id} onClick={() => void saveFeedback(f, 'done')}>标记已处理</button>}
            {f.status === 'done' && <button className="mini ghost" disabled={busyId === f.id} onClick={() => void saveFeedback(f, 'open')}>重新打开</button>}
            {f.user_id && <button className="mini ghost" onClick={() => setReplyOpen(replyOpen === f.id ? null : f.id)}>站内私信</button>}
            {isSuper && <button className="mini danger" onClick={() => void del(f.id)}>删除</button>}
          </div>
          {f.handled_at && <div style={{ ...mut, fontSize: 10.5, marginTop: 5 }}>最近处理：{new Date(f.handled_at).toLocaleString()}</div>}
          {replyOpen === f.id && (
            <div style={{ marginTop: 8 }}>
              <textarea value={replyText[f.id] || ''} onChange={e => setReplyText({ ...replyText, [f.id]: e.target.value })} rows={3} maxLength={2000} placeholder="发送一条站内私信…" style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="mini" disabled={replyBusy} onClick={() => sendReply(f)}>{replyBusy ? '发送中…' : '发送私信'}</button>
                <button className="mini ghost" onClick={() => setReplyOpen(null)}>取消</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
