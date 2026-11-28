import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';
import { confirmDialog } from '../../lib/dialog';

type Order = {
  id: number;
  title: string;
  content: string;
  source: string;
  code_verified: boolean;
  status: string;
  admin_reply: string | null;
  created_at: string;
  confirmed_at: string | null;
};

const statusLabel: Record<string, string> = {
  awaiting_confirm: '待确认',
  confirmed: '已确认·待执行',
  in_progress: '执行中',
  done: '已完成',
  cancelled: '已取消',
};

const statusColor: Record<string, string> = {
  awaiting_confirm: '#f5c26b',
  confirmed: '#8bb5ff',
  in_progress: '#8bb5ff',
  done: '#7ee2a8',
  cancelled: '#aeb7d4',
};

export default function ZhiWorkOrdersTab({ me, isSuper, setMsg }: { me: string; isSuper: boolean; setMsg: (s: string) => void }) {
  const [list, setList] = useState<Order[]>([]);
  const [filter, setFilter] = useState('all');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const [loadError, setLoadError] = useState('');

  async function load() {
    const { data, error } = await supabase.from('zhi_work_orders')
      .select('id, title, content, source, code_verified, status, admin_reply, created_at, confirmed_at')
      .order('created_at', { ascending: false }).limit(100);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setLoadError('');
    const rows = (data ?? []) as Order[];
    setList(rows);
    setReplyDrafts(Object.fromEntries(rows.map(item => [item.id, item.admin_reply ?? ''])));
  }

  useEffect(() => { void load(); }, []);

  async function submit() {
    const t = title.trim();
    const c = content.trim();
    if (!t || !c) {
      setMsg('请先写标题和要改的内容。');
      return;
    }
    if (t.length > 100) {
      setMsg('标题不能超过 100 字。');
      return;
    }
    if (c.length > 2000) {
      setMsg('内容不能超过 2000 字。');
      return;
    }
    if (submitBusy) return;
    setSubmitBusy(true);
    const { error } = await supabase.rpc('create_zhi_work_order', { p_title: t, p_content: c });
    setSubmitBusy(false);
    if (error) {
      setMsg('提交工单失败：' + error.message);
      return;
    }
    setTitle('');
    setContent('');
    setMsg('工单已提交，还是待确认状态，点「确认执行」后栀才会开始执行。');
    await load();
  }

  async function confirmOrder(order: Order) {
    if (busyId !== null) return;
    if (!(await confirmDialog(`确认执行这条工单吗？\n「${order.title}」\n确认后栀才会开始按工单改站。`, { confirmText: '确认执行' }))) return;
    setBusyId(order.id);
    const { error } = await supabase.rpc('confirm_zhi_work_order', { p_order_id: order.id });
    setBusyId(null);
    if (error) {
      setMsg('确认失败：' + error.message);
      return;
    }
    await alog('zhi_work_order_confirmed', { id: order.id });
    setMsg('已确认执行，栀会按工单开始改，改好在聊天里告诉你。');
    await load();
  }

  async function move(order: Order, status: string) {
    if (busyId !== null) return;
    const reply = (replyDrafts[order.id] ?? order.admin_reply ?? '').trim();
    if (reply.length > 500) {
      setMsg('处理说明不能超过 500 字。');
      return;
    }
    if (status === 'cancelled' && !(await confirmDialog('取消这条工单吗？取消后可以重新打开、再确认。', { danger: true, confirmText: '确认取消' }))) return;
    setBusyId(order.id);
    const { error } = await supabase.rpc('update_zhi_work_order', {
      p_order_id: order.id,
      p_status: status,
      p_admin_reply: reply || undefined,
    });
    setBusyId(null);
    if (error) {
      setMsg('更新工单失败：' + error.message);
      return;
    }
    setMsg(status === 'done' ? '工单已标记完成。' : status === 'in_progress' ? '工单已开始处理。' : '工单状态已更新。');
    await load();
  }

  async function saveReply(order: Order) {
    if (busyId !== null) return;
    const reply = (replyDrafts[order.id] ?? '').trim();
    if (reply.length > 500) {
      setMsg('处理说明不能超过 500 字。');
      return;
    }
    setBusyId(order.id);
    const { error } = await supabase.rpc('update_zhi_work_order', {
      p_order_id: order.id,
      p_status: order.status,
      p_admin_reply: reply || undefined,
    });
    setBusyId(null);
    if (error) {
      setMsg('保存说明失败：' + error.message);
      return;
    }
    setMsg('处理说明已保存。');
    await load();
  }

  async function del(id: number) {
    if (!(await confirmDialog('删除这条工单吗？删除后无法恢复。', { danger: true, confirmText: '确认删除' }))) return;
    const { error } = await supabase.from('zhi_work_orders').delete().eq('id', id);
    if (!error) { await alog('zhi_work_order_delete', { id }); await load(); }
    else setMsg('删除失败：' + error.message);
  }

  const shown = list.filter(item => filter === 'all' ? true : item.status === filter);
  const awaiting = list.filter(item => item.status === 'awaiting_confirm').length;
  void me;

  return (
    <div style={card}>
      <h3 style={h3}>给栀的工单（{awaiting} 条待确认）</h3>
      <p style={{ ...mut, margin: '0 0 10px' }}>
        在这里写要改什么，提交后先是待确认，你再点「确认执行」，栀才会开始改。
        邮件来单也一样：只有带了约定暗号的邮件才建单，没有暗号的不建单、不执行；
        建单后同样要你在这里点确认才执行。删数据、改权限这类事即使确认了，栀动手前也会再跟你确认一次。
      </p>

      <label style={{ display: 'block', fontSize: 11.5, color: '#aeb7d4', marginBottom: 5 }}>标题（最多 100 字）</label>
      <input
        value={title}
        onChange={e => setTitle(e.target.value.slice(0, 100))}
        maxLength={100}
        placeholder="一句话写要改什么，比如：首页公告换成运动会通知"
        style={{ width: '100%', marginBottom: 7 }}
      />
      <label style={{ display: 'block', fontSize: 11.5, color: '#aeb7d4', marginBottom: 5 }}>要改的内容（最多 2000 字）</label>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value.slice(0, 2000))}
        rows={4}
        maxLength={2000}
        placeholder="写清楚改哪里、改成什么样。写得越具体，改得越准。"
        style={{ width: '100%', marginBottom: 7 }}
      />
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="mini" disabled={submitBusy} onClick={() => void submit()}>
          {submitBusy ? '提交中…' : '提交工单（先待确认）'}
        </button>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        {([['all', '全部'], ['awaiting_confirm', '待确认'], ['confirmed', '已确认'], ['in_progress', '执行中'], ['done', '已完成'], ['cancelled', '已取消']] as const).map(([k, l]) => (
          <button key={k} className={'mini' + (filter === k ? '' : ' ghost')} onClick={() => setFilter(k)}>{l}</button>
        ))}
        <button className="mini ghost" onClick={() => void load()}>刷新</button>
      </div>
      {loadError && <p className="err">读取失败：{loadError}</p>}
      {shown.length === 0 && !loadError && <p style={mut}>暂无工单</p>}
      {shown.map(order => (
        <div key={order.id} style={{ padding: '12px 0', borderBottom: '1px solid #ffffff0c' }}>
          <div style={{ fontSize: 12, display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={mut}>{order.source === 'email' ? '邮件来单' : '后台提交'} · {(order.created_at || '').slice(0, 16).replace('T', ' ')}</span>
            <span style={{ fontSize: 10.5, color: statusColor[order.status] ?? '#aeb7d4' }}>{statusLabel[order.status] || order.status}</span>
            <span style={{ fontSize: 10.5, color: order.code_verified ? '#7ee2a8' : '#f5c26b' }}>
              {order.code_verified ? '暗号已验证' : '未带暗号'}
            </span>
            {order.confirmed_at && <span style={mut}>确认于 {order.confirmed_at.slice(0, 16).replace('T', ' ')}</span>}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, margin: '5px 0 2px' }}>{order.title}</div>
          <div style={{ fontSize: 14, margin: '0 0 8px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{order.content}</div>
          <label style={{ display: 'block', fontSize: 11.5, color: '#aeb7d4', marginBottom: 5 }}>处理说明（最多 500 字）</label>
          <textarea
            value={replyDrafts[order.id] ?? ''}
            onChange={e => setReplyDrafts(current => ({ ...current, [order.id]: e.target.value.slice(0, 500) }))}
            rows={2}
            maxLength={500}
            placeholder="栀处理完会在这里留说明…"
            style={{ width: '100%', marginBottom: 7 }}
          />
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button className="mini" disabled={busyId === order.id} onClick={() => void saveReply(order)}>
              {busyId === order.id ? '保存中…' : '保存说明'}
            </button>
            {order.status === 'awaiting_confirm' && (
              <button className="mini" disabled={busyId === order.id} onClick={() => void confirmOrder(order)}>
                {busyId === order.id ? '确认中…' : '确认执行'}
              </button>
            )}
            {order.status === 'confirmed' && (
              <button className="mini ghost" disabled={busyId === order.id} onClick={() => void move(order, 'in_progress')}>开始处理</button>
            )}
            {order.status === 'in_progress' && (
              <button className="mini ghost" disabled={busyId === order.id} onClick={() => void move(order, 'done')}>标记已完成</button>
            )}
            {(order.status === 'done' || order.status === 'cancelled') && (
              <button className="mini ghost" disabled={busyId === order.id} onClick={() => void move(order, order.status === 'done' ? 'confirmed' : 'awaiting_confirm')}>重新打开</button>
            )}
            {order.status !== 'cancelled' && (
              <button className="mini ghost" disabled={busyId === order.id} onClick={() => void move(order, 'cancelled')}>取消工单</button>
            )}
            {isSuper && <button className="mini danger" onClick={() => void del(order.id)}>删除</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
