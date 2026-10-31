import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { card, h3, mut, alog } from './shared';

type Gp = { profile_id: string; game_name: string; rank: string | null; game_uid: string | null; status: string };
export default function GameTab({ setMsg }: { setMsg: (s: string) => void }) {
  const [pend, setPend] = useState<Gp[]>([]);
  const [ok, setOk] = useState<Gp[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  async function load() {
    const { data } = await supabase.from('game_profiles').select('profile_id, game_name, rank, game_uid, status').order('created_at', { ascending: false });
    const list = (data ?? []) as Gp[];
    setPend(list.filter(x => x.status === 'pending')); setOk(list.filter(x => x.status === 'approved'));
    const ids = [...new Set(list.map(x => x.profile_id))];
    if (ids.length) {
      const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 200, skip: 0 });
      const mp: Record<string, string> = {};
      ((dir ?? []) as any[]).forEach((x: any) => { if (ids.includes(x.id)) mp[x.id] = x.display_name ?? x.username; });
      setNames(mp);
    }
  }
  useEffect(() => { load(); }, []);
  async function review(pid: string, approve: boolean) {
    const { error } = await supabase.rpc('review_game_profile', { pid, approve });
    if (!error) { await alog(approve ? 'game_approve' : 'game_reject', { pid }); load(); setMsg(approve ? '已通过' : '已驳回'); }
    else setMsg('操作失败：' + error.message);
  }
  async function revoke(pid: string) {
    if (!confirm('撤销这个段位认证？')) return;
    const { error } = await supabase.rpc('review_game_profile', { pid, approve: false });
    if (!error) { await alog('game_revoke', { pid }); load(); } else setMsg('操作失败：' + error.message);
  }
  return (
    <div style={card}>
      <h3 style={h3}>游戏段位审核</h3>
      {pend.length === 0 && ok.length === 0 && <p style={mut}>暂无提交</p>}
      {pend.length > 0 && <>
        <p style={mut}>待审核（{pend.length}）</p>
        {pend.map(g => (
          <div key={g.profile_id} style={{ padding: '8px 0', borderBottom: '1px solid #ffffff0c' }}>
            <div style={{ fontSize: 13.5 }}><b>{names[g.profile_id] || '…'}</b> · {g.game_name}
              {g.rank ? <> · <span style={{ color: '#ffd9ec' }}>{g.rank}</span></> : <span style={mut}>（未填段位）</span>}
              {g.game_uid && <span style={mut}> · ID: {g.game_uid}</span>}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="mini" onClick={() => review(g.profile_id, true)}>通过</button>
              <button className="mini ghost" onClick={() => review(g.profile_id, false)}>驳回</button>
            </div>
          </div>
        ))}
      </>}
      {ok.length > 0 && <>
        <p style={{ ...mut, marginTop: 10 }}>已通过（{ok.length}）</p>
        {ok.map(g => (
          <div key={g.profile_id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #ffffff0c' }}>
            <span style={{ fontSize: 13 }}>{names[g.profile_id] || '…'} · {g.game_name}{g.rank ? ` · ${g.rank}` : ''}</span>
            <button className="mini danger" onClick={() => revoke(g.profile_id)}>撤销</button>
          </div>
        ))}
      </>}
    </div>
  );
}
