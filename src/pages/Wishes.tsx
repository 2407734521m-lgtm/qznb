import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import BackButton from '../components/BackButton';
import { confirmDialog, alertDialog } from '../lib/dialog';

/** 愿望墙：班级共同愿望 */
export default function Wishes() {
  const me = useAuth().session!.user.id;
  const [list, setList] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  async function load() {
    const { data } = await supabase.from('wishes').select('*').order('created_at', { ascending: false }).limit(100);
    setList(data ?? []);
    const ids = [...new Set((data ?? []).map((x: any) => x.author_id).filter(Boolean))];
    if (ids.length) {
      const { data: dir } = await supabase.rpc('member_directory', { q: '', lim: 100, skip: 0 });
      const mp: Record<string, string> = {};
      ((dir ?? []) as any[]).forEach((x: any) => { if (ids.includes(x.id)) mp[x.id] = x.display_name ?? x.username; });
      setNames(mp);
    }
  }
  useEffect(() => { load(); }, []);

  async function post() {
    const c = text.trim(); if (!c) return;
    const { error } = await supabase.from('wishes').insert({ author_id: me, content: c.slice(0, 300) });
    if (error) setMsg('发布失败：' + error.message);
    else { setText(''); load(); }
  }
  function beginEdit(w: any) {
    setEditId(w.id);
    setEditText(w.content ?? '');
    setMsg('');
  }

  async function saveEdit(w: any) {
    const content = editText.trim();
    if (!content) { alertDialog('愿望内容不能为空。'); return; }
    setEditBusy(true);
    try {
      const { data, error } = await supabase.from('wishes').update({ content })
        .eq('id', w.id).eq('author_id', me).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('愿望不存在或当前账号没有编辑权限。');
      setEditId(null); setEditText('');
      await load();
      setMsg('愿望已更新。');
    } catch (error) {
      alertDialog('保存失败：' + (error instanceof Error ? error.message : '请稍后重试。'));
    } finally { setEditBusy(false); }
  }

  async function del(w: any) {
    if (!(await confirmDialog('删除这条愿望？', { danger: true }))) return;
    const { data, error } = await supabase.from('wishes').delete()
      .eq('id', w.id).eq('author_id', me).select('id').maybeSingle();
    if (error) { alertDialog('删除失败：' + error.message); return; }
    if (!data) { alertDialog('愿望未删除：内容不存在或当前账号没有权限。'); return; }
    if (editId === w.id) { setEditId(null); setEditText(''); }
    await load();
  }

  // 瀑布流式愿望卡片
  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      <BackButton fallback="/explore" />
      <div className="hero"><h1>愿望墙</h1><p>写 下 共 同 的 愿 望</p></div>
      <div className="card">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="我的愿望是…" rows={3} maxLength={300} style={{ width: '100%', marginBottom: 8 }} />
        <button className="pri" onClick={post}>许愿</button>
        {msg && <p className="err" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
      <div style={{ columns: 2, columnGap: 10 }}>
        {list.map(w => (
          <div key={w.id} className="card" style={{ breakInside: 'avoid', marginBottom: 10, background: 'linear-gradient(135deg,#ffd47918,#ff9ec618)' }}>
            {editId === w.id ? <div style={{ marginBottom: 8 }}>
              <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3} maxLength={300} style={{ width: '100%' }} />
              <div className="row" style={{ gap: 7 }}>
                <button className="mini pri" disabled={editBusy} onClick={() => void saveEdit(w)}>{editBusy ? '保存中…' : '保存'}</button>
                <button className="mini ghost" disabled={editBusy} onClick={() => { setEditId(null); setEditText(''); }}>取消</button>
              </div>
            </div> : <p style={{ fontSize: 14, margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{w.content}</p>}
            <div style={{ fontSize: 11.5, color: 'var(--mut)' }}>— {names[w.author_id] || '同学'}</div>
            {w.author_id === me && editId !== w.id && <div className="row" style={{ gap: 7, marginTop: 6 }}>
              <button className="mini ghost" onClick={() => beginEdit(w)}>编辑</button>
              <button className="mini ghost" onClick={() => void del(w)}>删除</button>
            </div>}
          </div>
        ))}
      </div>
      {list.length === 0 && <div className="center"><div className="card">还没有愿望，来许第一个吧</div></div>}
    </div>
  );
}
