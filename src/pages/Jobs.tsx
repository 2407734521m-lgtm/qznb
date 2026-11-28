import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import OptionSheet from '../components/OptionSheet';
import {
  RECRUIT_COMPANY,
  departmentColor,
  formatCloseDeadline,
  getPositionCounts,
  getRecruitCloseAt,
  isRecruitClosed,
  listOpenPositions,
  loadFavoritePositionIds,
  salaryText,
  sharePosition,
  toggleFavoritePositionId,
  type RecruitPosition,
} from '../lib/recruit';
import './Jobs.css';

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.6 10.7l6.8-4M8.6 13.3l6.8 4" />
    </svg>
  );
}

export default function Jobs() {
  const [positions, setPositions] = useState<RecruitPosition[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [closeAt, setCloseAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('all');
  const [favorites, setFavorites] = useState<number[]>(() => loadFavoritePositionIds());
  const [favOnly, setFavOnly] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [list, filled, close] = await Promise.all([
          listOpenPositions(),
          getPositionCounts(),
          // 关闭时间读不到也不影响列表，按未设置处理。
          getRecruitCloseAt().catch(() => null),
        ]);
        if (!alive) return;
        setPositions(list);
        setCounts(filled);
        setCloseAt(close);
        setErr('');
      } catch (e) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : '职位列表读取失败，请稍后重试。');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const departments = useMemo(
    () => Array.from(new Set(positions.map(p => p.department))).sort((a, b) => a.localeCompare(b, 'zh-CN')),
    [positions],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return positions.filter(p => {
      if (department !== 'all' && p.department !== department) return false;
      if (favOnly && !favorites.includes(p.id)) return false;
      if (!q) return true;
      return [p.title, p.department, p.description, p.requirements].join(' ').toLowerCase().includes(q);
    });
  }, [positions, query, department, favOnly, favorites]);

  const fullIds = useMemo(() => {
    const set = new Set<number>();
    for (const p of positions) {
      if ((counts[p.id] ?? 0) >= p.quota) set.add(p.id);
    }
    return set;
  }, [positions, counts]);

  const closed = isRecruitClosed(closeAt);

  function onToggleFavorite(id: number) {
    const nowFav = toggleFavoritePositionId(id);
    setFavorites(loadFavoritePositionIds());
    setToast(nowFav ? '已收藏这个职位。' : '已取消收藏。');
  }

  async function onShare(p: RecruitPosition) {
    const result = await sharePosition(p.title, p.id);
    if (result === 'shared') return;
    setToast(result === 'copied' ? '职位链接已复制，可以发给朋友。' : '分享失败，请稍后重试。');
  }

  return (
    <div className="rj-page">
      <header className="rj-hero">
        <p className="rj-hero-kicker">{RECRUIT_COMPANY} · 招聘中心</p>
        <h1>加入瑞氏，和我们一起做事</h1>
        <p className="rj-hero-sub">选一个适合你的职位，填好资料就能应聘。审核通过后，我们会发邮件到你的 QQ 邮箱通知你。</p>
        {loading ? null : (
          <p className="rj-hero-stats">在招 {positions.length} 个职位 · {departments.length} 个部门{favorites.length > 0 ? ` · 已收藏 ${favorites.length} 个` : ''}</p>
        )}
        <nav className="rj-nav" aria-label="招聘导航">
          <NavLink to="/jobs" end aria-current="page">职位列表</NavLink>
          <NavLink to="/jobs/status">查询申请进度</NavLink>
        </nav>
      </header>

      {err ? <div className="rj-error" role="alert">职位列表读取失败，请刷新重试。</div> : null}
      {toast ? <div className="rj-toast" role="status">{toast}</div> : null}
      {loading ? null : closed ? (
        <div className="rj-closed" role="status">
          招聘已结束，不再接受新申请。已经提交的申请照常审核，可在“查询申请进度”里查看进度。
        </div>
      ) : closeAt ? (
        <p className="rj-deadline">报名截止：{formatCloseDeadline(closeAt)}（北京时间）</p>
      ) : null}

      <div className="rj-toolbar">
        <input
          className="rj-search"
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索职位、部门或要求…"
          aria-label="搜索职位"
        />
        <OptionSheet
          title="选择部门"
          value={department}
          options={[
            { value: 'all', label: '全部部门' },
            ...departments.map(d => ({ value: d, label: d })),
          ]}
          onChange={setDepartment}
          buttonText={department === 'all' ? '全部部门' : department}
          buttonClassName="rj-filter-btn"
        />
        <button
          type="button"
          className={`rj-filter-btn rj-fav-toggle${favOnly ? ' rj-fav-toggle--on' : ''}`}
          aria-pressed={favOnly}
          onClick={() => setFavOnly(v => !v)}
        >
          <StarIcon filled={favOnly} /> 只看收藏
        </button>
      </div>

      {loading ? (
        <div className="rj-empty">正在加载职位…</div>
      ) : visible.length === 0 ? (
        <div className="rj-empty">
          {positions.length === 0
            ? '目前没有正在招聘的职位，请过段时间再来看看。'
            : favOnly
              ? '还没有收藏任何职位，看到喜欢的点一下星标就能收藏。'
              : '没有符合条件的职位，换个关键词或部门试试。'}
        </div>
      ) : (
        <>
          <p className="rj-count">{closed ? `共 ${visible.length} 个职位（招聘已结束）` : `共 ${visible.length} 个职位正在招聘`}</p>
          <div className="rj-list">
            {visible.map((p, i) => {
              const filled = counts[p.id] ?? 0;
              const full = fullIds.has(p.id);
              const fav = favorites.includes(p.id);
              return (
                <article
                  key={p.id}
                  className={`rj-card rj-card--enter${full || closed ? ' rj-card--full' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  aria-label={`${p.title}，${closed ? '招聘已结束' : full ? '已招满' : `招${p.quota}人，已招${filled}人`}`}
                >
                  <div className="rj-card-top">
                    <h2><Link to={`/jobs/${p.id}`}>{p.title}</Link></h2>
                    <span className="rj-salary">{salaryText(p)}</span>
                  </div>
                  <div className="rj-meta">
                    <span className="rj-chip">
                      <span className="rj-dept-dot" style={{ background: departmentColor(p.department) }} aria-hidden="true" />
                      {p.department}
                    </span>
                    {closed
                      ? <span className="rj-badge rj-badge--rejected">已结束</span>
                      : full
                        ? <span className="rj-badge rj-badge--full">已满</span>
                        : <span className="rj-badge rj-badge--open">招聘中</span>}
                  </div>
                  <p className="rj-desc">{p.description}</p>
                  <div className="rj-card-foot">
                    <span className="rj-quota">招 <b>{p.quota}</b> 人 · 已招 <b>{filled}</b> 人</span>
                    <span className="rj-card-actions">
                      <button
                        type="button"
                        className={`rj-icon-btn${fav ? ' rj-icon-btn--on' : ''}`}
                        aria-pressed={fav}
                        aria-label={fav ? `取消收藏${p.title}` : `收藏${p.title}`}
                        onClick={() => onToggleFavorite(p.id)}
                      >
                        <StarIcon filled={fav} />{fav ? '已收藏' : '收藏'}
                      </button>
                      <button
                        type="button"
                        className="rj-icon-btn"
                        aria-label={`分享${p.title}`}
                        onClick={() => void onShare(p)}
                      >
                        <ShareIcon />分享
                      </button>
                      <Link className={closed || full ? 'rj-cta--full' : 'rj-cta'} to={`/jobs/${p.id}`}>
                        {closed ? '招聘已结束' : full ? '已招满' : '查看并应聘 →'}
                      </Link>
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
