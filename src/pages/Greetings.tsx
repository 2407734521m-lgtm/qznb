import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

/** 留言祝福墙：给全班或某位同学留祝福 */
export default function Greetings() {
  const me = useAuth().session!.user.id;
  const [list, setList] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [target, setTarget] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from('greetings')
      .select('id, author_id, target_id, content, created_at')
      .is('deleted_at', null).order('created_at', { ascending: false }).limit(60);
    const rows = data ?? [];
    setList(rows);
    const ids = [...new Set(rows.flatMap(r => [r.author_id, r.target_id]).filter(Boolean))];
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, display_name, username').in('id', ids);
      const m: Record<string, string> = {};
      (ps ?? []).forEach((p: any) => { m[p.id] = p.display_name || p.username; });
      setNames(m);
    }
    const { data: ms } = await supabase.from('profiles')
      .select('id, display_name, username').eq('joined', true).order('created_at', { ascending: false }).limit(200);
    setMembers(ms ?? []);
  }
  useEffect(() => { load(); }, []);

  async function send() {
    const c = text.trim();
    if (!c) return setMsg('先写点什么吧');
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.from('greetings').insert({
      author_id: me, target_id: target || null, content: c.slice(0, 500),
    }).select('id').single();
    if (error) { setMsg('发送失败：' + error.message); }
    else {
      setText(''); setTarget(''); setMsg('已送出祝福');
      // 给指定同学发通知
      if (target && target !== me && data) {
        const who = names[me] || '同学';
        supabase.from('notifications').insert({
          profile_id: target, type: 'greeting',
          title: '有人给你留了言', body: `${who}：${c.slice(0, 60)}`, link: '/greetings',
        }).then(() => {});
      }
      load();
    }
    setBusy(false);
  }

  async function del(id: number) {
    if (!confirm('删除这条留言？')) return;
    const { error } = await supabase.from('greetings').delete().eq('id', id);
    if (!error) load(); else setMsg('删除失败：' + error.message);
  }

  async function report(g: any) {
    const reason = prompt('举报这条留言，请输入原因：');
    if (!reason || !reason.trim()) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: me, target_type: 'greeting', target_id: String(g.id), reason: reason.trim().slice(0, 200),
    });
    alert(error ? '举报失败：' + error.message : '已举报，管理员会处理');
  }

  return (
    <div className="page" style={{ paddingBottom: 110 }}>
      <h2 style={{ margin: '4px 0 12px', fontSize: 20 }}>留言祝福墙</h2>
      <div className="card">
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={500}
          placeholder="写下毕业寄语或祝福…" style={{ width: '100%', boxSizing: 'border-box' }} />
        <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <select value={target} onChange={e => setTarget(e.target.value)}
            style={{ width: 'auto', padding: '8px', fontSize: 13 }}>
            <option value="">给全班</option>
            {members.filter(m => m.id !== me).map(m => (
              <option key={m.id} value={m.id}>给 {m.display_name || m.username}</option>
            ))}
          </select>
          <button className="pri" style={{ width: 'auto', padding: '9px 26px' }} disabled={busy}
            onClick={send}>{busy ? '发送中…' : '送出祝福'}</button>
        </div>
        {msg && <p className="priv-note" style={{ margin: '8px 0 0' }}>{msg}</p>}
      </div>
      {list.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--mut)', padding: '36px 14px' }}>
          <div style={{ fontSize: 15, marginBottom: 6, color: '#fff' }}>还没有留言</div>
          写下第一条祝福吧
        </div>
      ) : (
        <div style={{ columns: 2, columnGap: 10 }}>
          {list.map(g => (
            <div key={g.id} className="card" style={{ breakInside: 'avoid', margin: '0 0 10px', display: 'inline-block', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{g.content}</div>
              <div style={{ fontSize: 11, color: 'var(--mut)', marginTop: 8 }}>
                {names[g.author_id] || '同学'} → {g.target_id ? (names[g.target_id] || '同学') : '全班'}
                {' · '}{(g.created_at || '').slice(5, 16).replace('T', ' ')}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                {g.author_id === me && <button className="mini ghost" onClick={() => del(g.id)}>删除</button>}
                {g.author_id !== me && <button className="mini ghost" onClick={() => report(g)}>举报</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
