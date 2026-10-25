import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';

type Snip = {
  id: number; title: string; language: string; code: string; summary: string;
  source_url: string | null; source_name: string; views: number; created_at: string;
};

// 热门特效板块：每条不是代码文本，而是一个能在站内直接打开玩的网页特效。
// 点开即用 iframe 沙箱渲染 code 里的完整 HTML，点开算一次访问（调 bump_hot_snippet_view）。
export default function HotSnippets() {
  const [list, setList] = useState<Snip[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [counted, setCounted] = useState<Record<number, boolean>>({});
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.from('hot_snippets')
      .select('id,title,language,code,summary,source_url,source_name,views,created_at')
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data, error }) => {
        if (error) setErr('加载失败：' + error.message);
        else setList((data ?? []) as Snip[]);
      });
  }, []);

  async function toggle(s: Snip) {
    if (openId === s.id) { setOpenId(null); return; }
    setOpenId(s.id);
    if (!counted[s.id]) {
      setCounted(prev => ({ ...prev, [s.id]: true }));
      setList(prev => prev.map(x => x.id === s.id ? { ...x, views: x.views + 1 } : x));
      await supabase.rpc('bump_hot_snippet_view', { p_id: s.id });
    }
  }

  return (
    <div>
      <BackButton fallback="/explore" />
      <h1 style={{ fontSize: 20 }}>🔥 热门特效</h1>
      <p className="sub">点开就能在站内直接预览和使用 · 每小时自动上新 1 个 · 最多保留 10 个 · 每 5 小时删掉最少人看的 1 个</p>
      {err && <p className="err">{err}</p>}
      {list.length === 0 && !err && (
        <div className="center" style={{ minHeight: 160 }}><div className="card">还没上热门特效，每小时会自动来一个 ✨</div></div>
      )}
      {list.map(s => (
        <div key={s.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <div>
              <b>{s.title}</b>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {s.language || '网页特效'} · 👁 {s.views} 次使用
                {s.source_name ? ` · 来源：${s.source_name}` : ''}
              </div>
            </div>
            <button className="mini ghost" onClick={() => toggle(s)}>{openId === s.id ? '收起' : '打开玩'}</button>
          </div>
          {s.summary && <p style={{ fontSize: 13, margin: '8px 0 0' }}>{s.summary}</p>}
          {openId === s.id && (
            <div style={{ marginTop: 10 }}>
              <iframe
                title={s.title}
                sandbox="allow-scripts"
                srcDoc={s.code}
                style={{ width: '100%', height: 480, border: 0, borderRadius: 10, background: '#fff' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {s.source_url && (
                  <a href={s.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#9db4ff', alignSelf: 'center' }}>去原站看看 →</a>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
