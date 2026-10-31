import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';
import { confirmDialog } from '../../lib/dialog';

type Ic = { id: number; code: string; nickname: string | null; active: boolean; created_at: string; expires_at: string | null };
export default function InviteTab({ isSuper, setMsg }: { isSuper: boolean; setMsg: (s: string) => void }) {
  const [ics, setIcs] = useState<Ic[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newNick, setNewNick] = useState('');
  const [newExp, setNewExp] = useState('0');
  const [batchBusy, setBatchBusy] = useState(false);
  async function load() {
    const { data } = await supabase.from('invite_codes').select('id, code, nickname, active, created_at, expires_at').order('created_at');
    setIcs((data ?? []) as Ic[]);
  }
  useEffect(() => { load(); }, []);
  async function batchCodes(n: number) {
    if (!(await confirmDialog(`一次生成 ${n} 个随机邀请码？`))) return;
    setBatchBusy(true);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ok = 0;
    for (let i = 0; i < n; i++) {
      let code = '';
      for (let j = 0; j < 6; j++) code += chars[Math.floor(Math.random() * chars.length)];
      const { error } = await supabase.rpc('create_invite_code', { new_code: code, nick: null });
      if (!error) ok++;
    }
    setBatchBusy(false); setMsg(`已生成 ${ok} 个邀请码`); load();
    await alog('invite_batch', { n: ok });
  }
  async function addIc() {
    const c = newCode.trim(); if (!c) return setMsg('请填写邀请码');
    const { error } = await supabase.rpc('create_invite_code', { new_code: c, nick: newNick.trim() || null });
    if (error) { setMsg('添加失败：' + error.message); return; }
    const days = parseInt(newExp, 10);
    if (days > 0) await supabase.from('invite_codes').update({ expires_at: new Date(Date.now() + days * 864e5).toISOString() }).eq('code', c);
    await alog('invite_add', { code: c });
    setMsg('邀请码已添加'); setNewCode(''); setNewNick(''); setNewExp('0'); load();
  }
  async function toggleIc(id: number, a: boolean) {
    const { error } = await supabase.rpc('set_invite_code_active', { cid: id, active: !a });
    if (!error) { await alog('invite_toggle', { id, active: !a }); load(); } else setMsg('操作失败：' + error.message);
  }
  async function delIc(id: number) {
    if (!(await confirmDialog('删除这个邀请码？', { danger: true }))) return;
    const { error } = await supabase.rpc('delete_invite_code', { cid: id });
    if (!error) { await alog('invite_delete', { id }); load(); } else setMsg('删除失败：' + error.message);
  }
  return (
    <div style={card}>
      <h3 style={h3}>邀请码管理</h3>
      <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={mut}>批量生成：</span>
        <button className="mini" disabled={batchBusy} onClick={() => batchCodes(10)}>10 个</button>
        <button className="mini" disabled={batchBusy} onClick={() => batchCodes(20)}>20 个</button>
        <button className="mini" disabled={batchBusy} onClick={() => batchCodes(50)}>50 个</button>
      </div>
      {isSuper ? (<>
        {ics.map(ic => (
          <div key={ic.id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c', opacity: ic.active ? 1 : 0.5 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{ic.code}
              {!ic.active && <span style={mut}>（已停用）</span>}</div>
            <div style={mut}>
              欢迎动画：「{ic.nickname || 'xxx'} — Welcome to Class 13!」
              {ic.expires_at && <> · {new Date(ic.expires_at) < new Date() ? '已过期' : '过期：' + ic.expires_at.slice(0, 16).replace('T', ' ')}</>}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="mini ghost" onClick={() => toggleIc(ic.id, ic.active)}>{ic.active ? '停用' : '启用'}</button>
              <button className="mini danger" onClick={() => delIc(ic.id)}>删除</button>
            </div>
          </div>
        ))}
        {ics.length === 0 && <p style={mut}>还没有邀请码，添加一个吧</p>}
        <label style={{ marginTop: 10 }}>新邀请码</label>
        <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="如：zhangsan" maxLength={40} />
        <label style={{ marginTop: 8 }}>欢迎昵称（这个码专属）</label>
        <input value={newNick} onChange={e => setNewNick(e.target.value)} placeholder="如：张三" maxLength={30} style={{ maxWidth: 220 }} />
        <label style={{ marginTop: 8 }}>有效期</label>
        <select value={newExp} onChange={e => setNewExp(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="0">不过期</option><option value="1">1 天（一次性）</option>
          <option value="3">3 天</option><option value="7">7 天</option>
        </select>
        <div style={{ marginTop: 8 }}>
          <button className="pri" style={{ width: 'auto', padding: '10px 24px' }} onClick={addIc}>添加邀请码</button>
        </div>
      </>) : <p style={mut}>邀请码仅超级管理员可管理</p>}
    </div>
  );
}
