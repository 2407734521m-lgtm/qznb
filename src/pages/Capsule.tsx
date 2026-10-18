import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

/** 时光胶囊：写给未来的信，到期才能看 */
export default function Capsule() {
  const me = useAuth().session!.user.id;
  const [list, setList] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [openAt, setOpenAt] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<any>(null);

  async function load() {
    const { data } = await supabase.from('time_capsules').select('*').order('open_at', { ascending: true }).limit(50);
    setList(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!title.trim() || !content.trim() || !openAt) return setMsg('标题、内容、开启日期都要填');
    const { error } = await supabase.from('time_capsules').insert({
      author_id: me, title: title.trim().slice(0, 60), content: content.trim().slice(0, 2000),
      open_at: openAt, is_public: isPublic,
    });
    if (error) setMsg('保存失败：' + error.message);
    else { setMsg('已封存，到期才能开启'); setTitle(''); setContent(''); setOpenAt(''); setIsPublic(false); load(); }
  }
  async function del(id: number) {
    if (!confirm('删除这个时光胶囊？')) return;
    await supabase.from('time_capsules').delete().eq('id', id);
    load();
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="page" style={{ paddingBottom: 100 }}>
      <div className="hero"><h1>时光胶囊</h1><p>写 给 未 来 的 信</p></div>
      <div className="card">
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>埋下新的胶囊</h3>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="标题" maxLength={60} style={{ marginBottom: 8 }} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="想对未来的自己或班级说什么…" rows={4} maxLength={2000} style={{ width: '100%', marginBottom: 8 }} />
        <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--mut)' }}>开启日期：</span>
          <input type="date" value={openAt} min={today} onChange={e => setOpenAt(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /> 到期后公开给全班看
        </label>
        <button className="pri" onClick={save}>封存</button>
        {msg && <p className="priv-note" style={{ marginTop: 8 }}>{msg}</p>}
      </div>
      {list.map(c => {
        const opened = c.open_at <= today;
        const mine = c.author_id === me;
        return (
          <div key={c.id} className="card" style={{ opacity: opened ? 1 : 0.7 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{opened ? c.title : '未开启的胶囊'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--mut)', margin: '4px 0' }}>
              开启日期：{c.open_at} · {c.is_public ? '公开' : '私密'}
            </div>
            {opened ? (
              <>
                <p style={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{c.content}</p>
                {mine && <button className="mini danger" onClick={() => del(c.id)}>删除</button>}
              </>
            ) : (
              <div className="row" style={{ gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--mut)' }}>还有 {Math.ceil((new Date(c.open_at).getTime() - Date.now()) / 864e5)} 天开启</span>
                {mine && <button className="mini ghost" onClick={() => del(c.id)}>删除</button>}
              </div>
            )}
          </div>
        );
      })}
      {list.length === 0 && <div className="center"><div className="card">还没有时光胶囊，埋下第一个吧</div></div>}
    </div>
  );
}
