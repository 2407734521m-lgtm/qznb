import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type SearchResult = {
  kind: 'member' | 'post' | 'album' | 'notice';
  title: string;
  subtitle: string;
  target: string;
  state?: Record<string, unknown>;
};

const HISTORY_KEY = 'qznb_search_history_v1';

function readHistory(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

export default function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<string[]>(readHistory);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setFailed(false);
      setLoading(false);
      return;
    }

    let alive = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const pattern = `%${term}%`;
        const [members, posts, albums, notices] = await Promise.all([
          supabase.rpc('member_directory', { q: term, lim: 6, skip: 0 }),
          supabase.from('posts').select('id, content, section, created_at')
            .is('deleted_at', null).ilike('content', pattern)
            .order('created_at', { ascending: false }).limit(6),
          supabase.from('albums').select('id, title, category')
            .is('deleted_at', null).ilike('title', pattern)
            .order('created_at', { ascending: false }).limit(4),
          supabase.from('board_messages').select('id, title, content, created_at')
            .is('deleted_at', null).ilike('content', pattern)
            .order('created_at', { ascending: false }).limit(4),
        ]);
        if (!alive) return;

        const next: SearchResult[] = [];
        (members.data ?? []).forEach((member: any) => {
          next.push({
            kind: 'member',
            title: member.display_name || member.username || '未命名成员',
            subtitle: member.username ? `成员档案 · @${member.username}` : '成员档案',
            target: `/members/${member.id}`,
          });
        });
        (posts.data ?? []).forEach((post: any) => {
          const section = post.section === 'daily' ? 'daily' : 'feed';
          next.push({
            kind: 'post',
            title: String(post.content || '图片动态').slice(0, 66),
            subtitle: section === 'daily' ? '日常动态' : '班级动态',
            target: section === 'daily' ? '/daily' : '/feed',
            state: section === 'feed' ? { openTab: 'feed', searchQuery: term } : undefined,
          });
        });
        (albums.data ?? []).forEach((album: any) => {
          next.push({
            kind: 'album',
            title: album.title || '未命名相册',
            subtitle: `班级相册 · ${album.category || '未分类'}`,
            target: `/albums/${album.id}`,
          });
        });
        (notices.data ?? []).forEach((notice: any) => {
          next.push({
            kind: 'notice',
            title: notice.title || String(notice.content || '公告留言').slice(0, 66),
            subtitle: '公告板',
            target: `/board?q=${encodeURIComponent(term)}`,
          });
        });
        setResults(next);
        setFailed([members, posts, albums, notices].every((item: any) => !!item.error));
      } catch {
        if (alive) {
          setResults([]);
          setFailed(true);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, 240);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  function remember(value: string) {
    const next = [value, ...history.filter(item => item !== value)].slice(0, 6);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* local history is optional */ }
  }

  function openResult(result: SearchResult) {
    const term = query.trim();
    if (term) remember(term);
    onClose();
    nav(result.target, { state: result.state });
  }

  function useHistory(value: string) {
    setQuery(value);
    inputRef.current?.focus();
  }

  if (!open) return null;

  const groups: Array<{ key: SearchResult['kind']; label: string }> = [
    { key: 'member', label: '成员' },
    { key: 'post', label: '动态' },
    { key: 'album', label: '相册' },
    { key: 'notice', label: '公告' },
  ];

  return (
    <div className="global-search-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="global-search-panel" role="dialog" aria-modal="true" aria-label="全局搜索">
        <div className="global-search-head">
          <div>
            <div className="global-search-eyebrow">SEARCH · 青春档案</div>
            <h2>搜索全站内容</h2>
          </div>
          <button type="button" className="global-search-close" onClick={onClose} aria-label="关闭搜索">×</button>
        </div>
        <label className="global-search-input-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索成员、动态、相册或公告"
            autoComplete="off"
            maxLength={80}
            onKeyDown={event => {
              if (event.key === 'Enter' && results[0]) openResult(results[0]);
            }}
          />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索">清空</button>}
        </label>

        {query.trim().length < 2 ? (
          <div className="global-search-history">
            <div className="global-search-section-title">最近搜索</div>
            {history.length ? (
              <div className="global-search-chips">
                {history.map(item => <button type="button" key={item} onClick={() => useHistory(item)}>{item}</button>)}
                <button type="button" className="clear-history" onClick={() => {
                  setHistory([]);
                  try { localStorage.removeItem(HISTORY_KEY); } catch {}
                }}>清除记录</button>
              </div>
            ) : <p className="global-search-hint">输入至少两个字符，开始搜索全站内容。</p>}
          </div>
        ) : (
          <div className="global-search-results" aria-live="polite">
            {loading && <p className="global-search-hint">正在搜索…</p>}
            {!loading && failed && <p className="global-search-hint">暂时无法完成搜索，请检查网络后重试。</p>}
            {!loading && !failed && results.length === 0 && <p className="global-search-hint">没有找到匹配内容，试试其他关键词。</p>}
            {!loading && groups.map(group => {
              const items = results.filter(item => item.kind === group.key);
              if (!items.length) return null;
              return (
                <section className="global-search-group" key={group.key}>
                  <div className="global-search-section-title">{group.label}</div>
                  {items.map((item, index) => (
                    <button type="button" className="global-search-result" key={group.key + item.target + index}
                      onClick={() => openResult(item)}>
                      <span className="global-search-result-mark" aria-hidden="true">
                        {group.key === 'member' ? '人' : group.key === 'post' ? '动' : group.key === 'album' ? '册' : '告'}
                      </span>
                      <span className="global-search-result-copy">
                        <strong>{item.title}</strong>
                        <small>{item.subtitle}</small>
                      </span>
                      <span className="global-search-result-arrow" aria-hidden="true">›</span>
                    </button>
                  ))}
                </section>
              );
            })}
          </div>
        )}
        <div className="global-search-foot">按 Enter 打开第一条结果 · Esc 关闭</div>
      </section>
    </div>
  );
}
