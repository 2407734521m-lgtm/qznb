import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';
import { confirmDialog } from '../../lib/dialog';

type Fb = { id: number; name: string | null; contact: string | null; content: string; kind: string; status: string; created_at: string; user_id: string | null };
export default function FeedbackTab({ me, isSuper, setMsg }: { me: string; isSuper: boolean; setMsg: (s: string) => void }) {
  const [list, setList] = useState<Fb[]>([]);
  const [filter, setFilter] = useState('all');
  const [replyOpen, setReplyOpen] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [replyBusy, setReplyBusy] = useState(false);
  async function load() {
    const { data } = await supabase.from('feedbacks').select('id, name, contact, content, kind, status, created_at, user_id').order('created_at', { ascending: false }).limit(100);
    setList((data ?? []) as Fb[]);
  }
  useEffect(() => { load(); }, []);
  async function mark(id: number, done: boolean) {
    const { error } = await supabase.from('feedbacks').update({ status: done ? 'done' : 'open' }).eq('id', id);
    if (!error) { await alog('feedback_mark', { id, done }); load(); } else setMsg('操作失败：' + error.message);
  }
  async function del(id: number) {
    if (!(await confirmDialog('删除这条反馈？', { danger: true }))) return;
    const { error } = await supabase.from('feedbacks').delete().eq('id', id);
    if (!error) { await alog('feedback_delete', { id }); load(); } else setMsg('删除失败：' + error.message);
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
      setMsg('消息已发送，对方在「好友 - 聊天」里能看到');
    } catch (e: any) { setMsg('发送失败：' + (e?.message || '')); }
    finally { setReplyBusy(false); }
  }
  const shown = list.filter(f => filter === 'all' ? true : f.status === filter);
  const todo = list.filter(f => f.status === 'open').length;
  return (
    <div style={card}>
      <h3 style={h3}>反馈管理（{todo} 条未处理）</h3>
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        {([['all', '全部'], ['open', '未处理'], ['done', '已处理']] as const).map(([k, l]) => (
          <button key={k} className={'mini' + (filter === k ? '' : ' ghost')} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {shown.length === 0 && <p style={mut}>暂无反馈</p>}
      {shown.map(f => (
        <div key={f.id} style={{ padding: '10px 0', borderBottom: '1px solid #ffffff0c', opacity: f.status === 'done' ? 0.55 : 1 }}>
          <div style={{ fontSize: 12 }}>
            <span style={mut}>{f.kind === 'login' ? '登录反馈' : '意见反馈'} · {(f.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            {(f.name || f.contact) && <span style={mut}> — {f.name ?? ''}{f.name && f.contact ? ' / ' : ''}{f.contact ?? ''}</span>}
            {f.status === 'done' && <span style={{ color: '#7ee2a8', marginLeft: 6 }}>已处理</span>}
          </div>
          <div style={{ fontSize: 14, margin: '4px 0 8px' }}>{f.content}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="mini ghost" onClick={() => mark(f.id, f.status !== 'done')}>{f.status === 'done' ? '标为未处理' : '标为已处理'}</button>
            {f.user_id && <button className="mini" onClick={() => setReplyOpen(replyOpen === f.id ? null : f.id)}>给提交人发消息</button>}
            {isSuper && <button className="mini danger" onClick={() => del(f.id)}>删除</button>}
          </div>
          {replyOpen === f.id && (
            <div style={{ marginTop: 8 }}>
              <textarea value={replyText[f.id] || ''} onChange={e => setReplyText({ ...replyText, [f.id]: e.target.value })} rows={3} maxLength={2000} placeholder="告诉提交人处理结果…" style={{ width: '100%' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button className="mini" disabled={replyBusy} onClick={() => sendReply(f)}>{replyBusy ? '发送中…' : '发送'}</button>
                <button className="mini ghost" onClick={() => setReplyOpen(null)}>取消</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
