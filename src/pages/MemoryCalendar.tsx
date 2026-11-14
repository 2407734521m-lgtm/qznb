import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isInApp } from '../lib/installedApp';
import BackButton from '../components/BackButton';
import './MemoryCalendar.css';
import { RowSkeleton } from '../components/fx/Skeleton';

type MemoryKind = 'event' | 'timeline' | 'post' | 'notice';
type MemoryItem = { id: string; date: string; title: string; detail: string; kind: MemoryKind; to: string };

function dateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
function localDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateKey(date);
}
function monthLabel(date: Date) {
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
}
function startOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }

export default function MemoryCalendar() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => dateKey(new Date()));
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const firstKey = dateKey(startOfMonth(month));
  const lastKey = dateKey(endOfMonth(month));
  const monthId = month.getFullYear() + '-' + month.getMonth();

  useEffect(() => {
    let alive = true;
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    setLoading(true);
    setError('');
    const db = supabase as any;

    (async () => {
      const [events, timelines, posts, notices] = await Promise.all([
        db.from('events').select('id, title, description, event_at, location')
          .gte('event_at', from).lt('event_at', to).order('event_at', { ascending: true }).limit(250),
        db.from('timelines').select('id, title, content, happened_on')
          .gte('happened_on', firstKey).lte('happened_on', lastKey)
          .order('happened_on', { ascending: true }).limit(250),
        db.from('posts').select('id, content, created_at, section')
          .in('section', ['feed', 'daily']).is('deleted_at', null)
          .gte('created_at', from).lt('created_at', to)
          .order('created_at', { ascending: true }).limit(250),
        db.from('board_messages').select('id, title, content, created_at')
          .eq('is_admin_msg', true).is('deleted_at', null).in('audience', isInApp() ? ['all', 'app'] : ['all'])
          .gte('created_at', from).lt('created_at', to)
          .order('created_at', { ascending: true }).limit(100),
      ]);
      if (!alive) return;
      const failures = [events, timelines, posts, notices].filter(result => result.error);
      const merged: MemoryItem[] = [
        ...(events.data ?? []).filter((row: any) => row.event_at).map((row: any) => ({
          id: 'event-' + row.id, date: localDate(row.event_at), title: row.title || '班级活动',
          detail: [row.location, row.description].filter(Boolean).join(' · '), kind: 'event' as const, to: '/events',
        })),
        ...(timelines.data ?? []).map((row: any) => ({
          id: 'timeline-' + row.id, date: String(row.happened_on).slice(0, 10), title: row.title || '青春记录',
          detail: row.content || '留下了一段个人回忆', kind: 'timeline' as const, to: '/timeline',
        })),
        ...(posts.data ?? []).map((row: any) => ({
          id: 'post-' + row.id, date: localDate(row.created_at), title: row.section === 'daily' ? '日常分享' : '班级动态',
          detail: row.content || '分享了一段班级记忆', kind: 'post' as const, to: row.section === 'daily' ? '/daily' : '/feed',
        })),
        ...(notices.data ?? []).map((row: any) => ({
          id: 'notice-' + row.id, date: localDate(row.created_at), title: row.title || '班级公告',
          detail: row.content || '发布了一条班级公告', kind: 'notice' as const, to: '/board',
        })),
      ].filter(item => item.date >= firstKey && item.date <= lastKey)
        .sort((a, b) => a.date.localeCompare(b.date));
      setItems(merged);
      if (failures.length) setError('部分记录暂时无法读取，已显示其他可访问的内容。');
      setLoading(false);
    })().catch(() => {
      if (!alive) return;
      setItems([]);
      setError('记忆日历暂时无法加载，请稍后重试。');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [monthId]);

  const dayItems = useMemo(() => items.filter(item => item.date === selected), [items, selected]);
  const counts = useMemo(() => items.reduce<Record<string, number>>((all, item) => {
    all[item.date] = (all[item.date] || 0) + 1;
    return all;
  }, {}), [items]);

  const firstWeekday = (startOfMonth(month).getDay() + 6) % 7;
  const dayCount = endOfMonth(month).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: dayCount }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);

  function changeMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelected(dateKey(next));
  }

  return (
    <main className="page memory-calendar">
      <BackButton fallback="/home" />
      <header className="mc-heading">
        <h1>班级记忆日历</h1>
        <p>把活动、动态、公告和个人回忆，放回它们发生的日子。</p>
      </header>

      <section className="mc-calendar-card" aria-label="记忆日历">
        <div className="mc-month-bar">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="上个月">‹</button>
          <strong>{monthLabel(month)}</strong>
          <button type="button" onClick={() => changeMonth(1)} aria-label="下个月">›</button>
        </div>
        <div className="mc-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(day => <span key={day}>{day}</span>)}</div>
        <div className="mc-days">
          {cells.map((day, index) => {
            if (!day) return <span className="mc-day-empty" key={'empty-' + index} />;
            const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
            const active = key === selected;
            const today = key === dateKey(new Date());
            const count = counts[key] || 0;
            return (
              <button type="button" key={key} className={'mc-day' + (active ? ' is-selected' : '') + (today ? ' is-today' : '')}
                onClick={() => setSelected(key)} aria-pressed={active} aria-label={key + (count ? '，' + count + ' 条记录' : '')}>
                <span>{day}</span>{count > 0 && <i aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="mc-legend"><span><i className="event" />活动</span><span><i className="memory" />记录</span><span><i className="notice" />公告</span></div>
      </section>

      <section className="mc-list-section">
        <div className="mc-list-heading">
          <div><h2>{selected.replace(/-/g, ' / ')}</h2></div>
          <span>{dayItems.length} 条记忆</span>
        </div>
        {loading ? <RowSkeleton count={3} /> : dayItems.length ? (
          <div className="mc-items">
            {dayItems.map(item => (
              <button type="button" className="mc-item" key={item.id} onClick={() => navigate(item.to)}>
                <span className={'mc-item-mark ' + item.kind}>{item.kind === 'event' ? '活' : item.kind === 'notice' ? '告' : item.kind === 'timeline' ? '忆' : '记'}</span>
                <span className="mc-item-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                <span className="mc-item-arrow">›</span>
              </button>
            ))}
          </div>
        ) : <div className="mc-state mc-empty"><strong>这一天还没有收录的记忆</strong><span>可以去分享一条动态，或记录一段属于自己的回忆。</span></div>}
        {error && <p className="mc-error" role="status">{error}</p>}
      </section>
    </main>
  );
}
