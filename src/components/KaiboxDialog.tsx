import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type RequestRow = {
  id: string;
  request_date: string;
  status: 'selected' | 'pending' | 'not_found' | 'completed' | 'closed';
  created_at: string;
  request_type: string;
};

const TYPES = [
  { value: '本人资料核验', label: '本人资料核验' },
  { value: '授权资料核验', label: '已获授权的资料核验' },
  { value: '公开资料整理', label: '公开资料整理' },
];

export default function KaiboxDialog({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState(TYPES[0].value);
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rows, setRows] = useState<RequestRow[]>([]);

  async function refresh() {
    const { data, error: e } = await (supabase as any).rpc('my_authorized_request_queue');
    if (!e && Array.isArray(data)) setRows(data as RequestRow[]);
  }
  useEffect(() => { void refresh(); }, []);

  async function submit() {
    if (!consent) return setError('请先确认你拥有相关数据的权利或已取得明确授权。');
    if (description.trim().length < 5) return setError('请补充申请说明（至少 5 个字）。');
    setBusy(true); setError(''); setNotice('');
    const { data, error: e } = await (supabase as any).rpc('submit_authorized_request', {
      p_request_type: type,
      p_description: description.trim().slice(0, 500),
      p_contact: contact.trim().slice(0, 100) || null,
      p_confirmed: true,
    });
    setBusy(false);
    if (e) return setError('提交失败：' + e.message);
    setNotice(data?.message || '已提交，正在按时间顺序排队。');
    setDescription('');
    await refresh();
  }

  const statusText: Record<string, string> = {
    selected: '今日优先处理中',
    pending: '候选队列中',
    not_found: '本次未找到，已通知你',
    completed: '已完成',
    closed: '今日名额已用完',
  };

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(8,14,28,.48)', backdropFilter: 'blur(14px)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <section role="dialog" aria-modal="true" aria-labelledby="kaibox-title" onClick={e => e.stopPropagation()}
        style={{ width: 'min(100%, 560px)', maxHeight: 'min(86dvh, 820px)', overflowY: 'auto', borderRadius: 26, padding: 22, color: '#202632', background: 'rgba(255,255,255,.94)', border: '1px solid rgba(255,255,255,.82)', boxShadow: '0 28px 90px rgba(15,23,42,.24)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div><div style={{ fontSize: 10, letterSpacing: 3, color: '#82909e' }}>PRIVATE REQUEST CENTER</div><h2 id="kaibox-title" style={{ margin: '5px 0 0', fontSize: 25 }}>开盒</h2></div>
          <button className="mini ghost" onClick={onClose} aria-label="关闭">关闭</button>
        </header>
        <div style={{ marginTop: 16, borderRadius: 18, padding: 14, background: '#f4f7fb', fontSize: 13, lineHeight: 1.8 }}>
          <strong>使用帮助</strong>　<details style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 650 }}>展开申请说明</summary>
            <div style={{ marginTop: 9 }}>
              <p>一、选择申请类型：本人资料核验、已获授权的资料核验或公开资料整理。</p>
              <p>二、填写申请说明：描述希望核验的资料范围和用途。请勿填写他人的身份证号码、手机号、住址、账号密码等敏感信息。</p>
              <p>三、提交后按时间顺序排队。每日最多处理一项成功申请；如当前申请无法完成，会通知申请人并自动递补下一位候选人。</p>
              <p>四、仅处理本人数据、明确授权的数据或合法公开资料。申请人需确保授权真实有效。</p>
            </div>
          </details>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 700 }}>申请类型
            <select value={type} onChange={e => setType(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 7, padding: 12, borderRadius: 13, border: '1px solid #dce3ec', background: '#fff', color: '#202632' }}>
              {TYPES.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13, fontWeight: 700 }}>申请说明
            <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} rows={4} placeholder="说明资料归属、授权情况和核验目的；不要填写第三方敏感个人信息。" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 7, padding: 12, borderRadius: 13, border: '1px solid #dce3ec', resize: 'vertical', background: '#fff', color: '#202632' }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 700 }}>联系方式（选填）
            <input value={contact} onChange={e => setContact(e.target.value)} maxLength={100} placeholder="用于接收申请进度通知" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 7, padding: 12, borderRadius: 13, border: '1px solid #dce3ec', background: '#fff', color: '#202632' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12, lineHeight: 1.6, color: '#596579' }}>
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            我确认申请仅涉及本人、已取得明确授权的数据或合法公开资料，并同意按此范围处理。
          </label>
          {error && <p role="alert" style={{ color: '#b42318', fontSize: 12, margin: 0 }}>{error}</p>}
          {notice && <p role="status" style={{ color: '#087443', fontSize: 12, margin: 0 }}>{notice}</p>}
          <button className="pri" disabled={busy || !consent || description.trim().length < 5} onClick={() => void submit()}>{busy ? '提交中…' : '提交申请并排队'}</button>
        </div>
        <div style={{ marginTop: 20, borderTop: '1px solid #e7ebf1', paddingTop: 14 }}>
          <strong style={{ fontSize: 13 }}>我的申请进度</strong>
          {rows.length === 0 ? <p style={{ color: '#82909e', fontSize: 12 }}>暂无申请记录。</p> : rows.map(row => (
            <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid #edf0f4', fontSize: 12 }}>
              <span>{row.request_type} · {new Date(row.created_at).toLocaleString()}</span>
              <strong>{statusText[row.status] || row.status}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
