import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Snip = {
  id: number; title: string; language: string; code: string; summary: string;
  source_url: string | null; source_name: string; views: number; created_at: string;
};

// 热门代码片段板块：每小时自动加 1 条，上限 10 条，每 5 小时删窗口访问量最低 1 条。
// 点开一条算一次访问（调 bump_hot_snippet_view，只加计数，改不了别的字段）。
export default function HotSnippets() {
  const [list, setList] = useState<Snip[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [counted, setCounted] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<number | null>(null);
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

  async function copyCode(s: Snip) {
    try {
      await navigator.clipboard.writeText(s.code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = s.code; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    setCopied(s.id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div>
      <h1 style={{ fontSize: 20 }}>🔥 热门代码</h1>
      <p className="sub">每小时自动上新 1 条 · 最多保留 10 条 · 每 5 小时删掉最少人看的 1 条</p>
      {err && <p className="err">{err}</p>}
      {list.length === 0 && !err && (
        <div className="center" style={{ minHeight: 160 }}><div className="card">还没上热门代码，每小时会自动来一条 ✨</div></div>
      )}
      {list.map(s => (
        <div key={s.id} className="card" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
            <div>
              <b>{s.title}</b>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {s.language || '不限语言'} · 👁 {s.views} 次访问
                {s.source_name ? ` · 来源：${s.source_name}` : ''}
              </div>
            </div>
            <button className="mini ghost" onClick={() => toggle(s)}>{openId === s.id ? '收起' : '查看代码'}</button>
          </div>
          {s.summary && <p style={{ fontSize: 13, margin: '8px 0 0' }}>{s.summary}</p>}
          {openId === s.id && (
            <div style={{ marginTop: 10 }}>
              <pre style={{
                margin: 0, padding: 12, borderRadius: 10, background: '#0a0e1a',
                overflowX: 'auto', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>{s.code}</pre>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button className="mini" onClick={() => copyCode(s)}>{copied === s.id ? '已复制 ✓' : '复制代码'}</button>
                {s.source_url && (
                  <a href={s.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#9db4ff', alignSelf: 'center' }}>去原链接看看 →</a>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
