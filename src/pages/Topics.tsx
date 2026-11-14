import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';
import { useDelayedLoading } from '../components/fx/Skeleton';

type TopicPost = {
  id: number;
  author_id: string;
  content: string;
  created_at: string;
};

type TopicProfile = {
  id: string;
  username: string;
  display_name: string | null;
};

type TopicSummary = {
  name: string;
  count: number;
  latestAt: string;
};

const TOPIC_PATTERN = /#([\p{L}\p{N}_-]{1,24})/gu;

function getTopicNames(content: string): string[] {
  const matches = content.match(TOPIC_PATTERN) ?? [];
  return matches.map(tag => tag.slice(1));
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

/** 话题广场：从最近可见动态中的 #标签 自动汇总话题，不建立第二套内容系统。 */
export default function Topics() {
  const nav = useNavigate();
  const [posts, setPosts] = useState<TopicPost[]>([]);
  const [profiles, setProfiles] = useState<Record<string, TopicProfile>>({});
  const [query, setQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const showSkeleton = useDelayedLoading(loading);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const { data, error: postsError } = await supabase.from('posts')
          .select('id, author_id, content, created_at')
          .eq('section', 'feed')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(160);

        if (!active) return;
        if (postsError) {
          setError('话题暂时无法加载，请稍后重试。');
          setPosts([]);
          setLoading(false);
          return;
        }

        const rows = (data ?? []) as TopicPost[];
        setPosts(rows);
        const authorIds = [...new Set(rows.map(post => post.author_id).filter(Boolean))];
        if (authorIds.length) {
          const { data: people } = await supabase.from('profiles')
            .select('id, username, display_name')
            .in('id', authorIds);
          if (active) {
            setProfiles(Object.fromEntries(((people ?? []) as TopicProfile[]).map(person => [person.id, person])));
          }
        } else if (active) {
          setProfiles({});
        }
      } catch (loadError) {
        console.error('topics load failed', loadError);
        if (active) setError('网络暂时不可用，请检查连接后重试。');
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => { active = false; };
  }, []);

  const topics = useMemo<TopicSummary[]>(() => {
    const map = new Map<string, TopicSummary>();
    posts.forEach(post => {
      const uniqueNames = new Set(getTopicNames(post.content).map(name => name.toLocaleLowerCase()));
      uniqueNames.forEach(name => {
        const previous = map.get(name);
        if (previous) {
          previous.count += 1;
          if (post.created_at > previous.latestAt) previous.latestAt = post.created_at;
        } else {
          map.set(name, { name, count: 1, latestAt: post.created_at });
        }
      });
    });
    return [...map.values()].sort((a, b) =>
      b.count - a.count || b.latestAt.localeCompare(a.latestAt) || a.name.localeCompare(b.name, 'zh-CN'),
    );
  }, [posts]);

  const normalizedQuery = query.trim().replace(/^#+/, '').toLocaleLowerCase();
  const visibleTopics = topics.filter(topic => !normalizedQuery || topic.name.includes(normalizedQuery));
  const selectedPosts = selectedTopic
    ? posts.filter(post => getTopicNames(post.content).some(name => name.toLocaleLowerCase() === selectedTopic))
    : [];

  function openTopic(topic: string) {
    const matchingPosts = posts.filter(post =>
      getTopicNames(post.content).some(name => name.toLocaleLowerCase() === topic),
    );
    nav('/feed', {
      state: {
        openTab: 'feed',
        searchQuery: '#' + topic,
        focusPostId: matchingPosts[0]?.id,
      },
    });
  }

  return (
    <main className="page" style={{ paddingBottom: 16, background: '#fff', color: '#263244' }}>
      <BackButton fallback="/explore" />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '6px 16px 28px' }}>
        <header style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, letterSpacing: '.16em', color: '#8792a2', fontWeight: 700 }}>COMMUNITY TOPICS</div>
          <h1 style={{ margin: '7px 0 6px', fontSize: 27, lineHeight: 1.2, letterSpacing: '-.035em' }}>话题广场</h1>
          <p style={{ margin: 0, color: '#748093', fontSize: 13, lineHeight: 1.7 }}>
            从成员动态里的 #标签，发现大家最近在聊什么。
          </p>
          <p style={{ margin: '7px 0 0', color: '#9aa3af', fontSize: 11 }}>
            自动统计最近 160 条可见动态；发布动态时添加 #话题名，即可参与讨论。
          </p>
        </header>

        <label style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #e7eaf0', borderRadius: 14, padding: '0 13px', minHeight: 46, background: '#fff' }}>
          <span aria-hidden="true" style={{ color: '#929cab', fontSize: 19 }}>⌕</span>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索话题，例如：音乐、日常"
            aria-label="搜索话题"
            maxLength={30}
            style={{ border: 0, outline: 0, flex: 1, minWidth: 0, background: 'transparent', color: '#263244', fontSize: 14 }}
          />
          {query && <button type="button" onClick={() => setQuery('')} style={{ border: 0, background: 'transparent', color: '#687589', fontSize: 12 }}>清空</button>}
        </label>

        {showSkeleton && <div role="status" aria-label="话题加载中" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '22px 4px' }}>{[120, 90, 140, 100, 80].map(w => <div key={w} className="fx-skel-wrap"><div className="fx-skel" style={{ width: w, height: 40, borderRadius: 12 }} /></div>)}</div>}
        {!loading && error && (
          <div style={{ marginTop: 16, padding: 16, border: '1px solid #eceff3', borderRadius: 16, color: '#667386', fontSize: 13 }}>
            {error}
            <button type="button" onClick={() => window.location.reload()} style={{ display: 'block', marginTop: 10, border: 0, background: 'transparent', padding: 0, color: '#34445c', fontWeight: 650 }}>重新加载</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {visibleTopics.length > 0 ? (
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))', gap: 10, marginTop: 18 }}>
                {visibleTopics.map((topic, index) => (
                  <button
                    type="button"
                    key={topic.name}
                    onClick={() => setSelectedTopic(current => current === topic.name ? null : topic.name)}
                    aria-pressed={selectedTopic === topic.name}
                    style={{
                      textAlign: 'left', padding: '14px 14px 13px', minHeight: 94, borderRadius: 16,
                      border: selectedTopic === topic.name ? '1px solid #aeb9c8' : '1px solid #eceff3',
                      background: selectedTopic === topic.name ? '#f7f9fb' : '#fff',
                      color: '#263244', cursor: 'pointer', transition: 'border-color .18s ease, background .18s ease',
                    }}
                  >
                    <span style={{ display: 'block', color: '#a0a9b6', fontSize: 10, letterSpacing: '.08em' }}>
                      {index < 3 ? '活跃话题' : '成员话题'}
                    </span>
                    <strong style={{ display: 'block', marginTop: 7, fontSize: 16, fontWeight: 700 }}>#{topic.name}</strong>
                    <span style={{ display: 'block', marginTop: 7, color: '#8590a0', fontSize: 11 }}>{topic.count} 条动态</span>
                  </button>
                ))}
              </section>
            ) : (
              <section style={{ marginTop: 18, padding: '28px 20px', border: '1px dashed #dfe4eb', borderRadius: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 650, color: '#354256' }}>
                  {topics.length ? '没有找到这个话题' : '这里还没有话题'}
                </div>
                <p style={{ maxWidth: 360, margin: '8px auto 14px', color: '#8792a2', fontSize: 12, lineHeight: 1.7 }}>
                  {topics.length
                    ? '试试更短的关键词，或者清空搜索查看全部话题。'
                    : '在发布动态时加上 #音乐、#日常 或你感兴趣的标签，话题就会自动出现在这里。'}
                </p>
                {!topics.length && <button type="button" onClick={() => nav('/feed')} style={{ border: '1px solid #e2e7ee', background: '#fff', color: '#354256', borderRadius: 12, padding: '9px 14px', fontSize: 12 }}>去发布动态</button>}
              </section>
            )}

            {selectedTopic && (
              <section style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #edf0f4' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 11 }}>
                  <div>
                    <div style={{ color: '#9aa3af', fontSize: 10, letterSpacing: '.12em' }}>TOPIC FEED</div>
                    <h2 style={{ margin: '4px 0 0', fontSize: 19 }}>#{selectedTopic}</h2>
                  </div>
                  <button type="button" onClick={() => openTopic(selectedTopic)} style={{ border: 0, borderRadius: 11, padding: '9px 12px', color: '#fff', background: '#354256', fontSize: 12, whiteSpace: 'nowrap' }}>查看全部动态</button>
                </div>
                {selectedPosts.length === 0 ? (
                  <p style={{ color: '#8792a2', fontSize: 12 }}>暂时没有相关动态。</p>
                ) : selectedPosts.slice(0, 4).map(post => {
                  const person = profiles[post.author_id];
                  return (
                    <button
                      type="button"
                      key={post.id}
                      onClick={() => nav('/feed', { state: { openTab: 'feed', searchQuery: '#' + selectedTopic, focusPostId: post.id } })}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '13px 2px', border: 0, borderBottom: '1px solid #f0f2f5', background: 'transparent', color: '#354256' }}
                    >
                      <span style={{ display: 'block', color: '#8a95a4', fontSize: 11, marginBottom: 5 }}>
                        {person?.display_name || person?.username || '成员'} · {shortDate(post.created_at)}
                      </span>
                      <span style={{ display: 'block', fontSize: 13, lineHeight: 1.65, overflowWrap: 'anywhere' }}>
                        {post.content.length > 150 ? post.content.slice(0, 150) + '…' : post.content}
                      </span>
                    </button>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
