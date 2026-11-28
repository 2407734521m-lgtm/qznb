import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
import OptionSheet from '../components/OptionSheet';
import {
  RECRUIT_COMPANY,
  QQ_EMAIL_RE,
  departmentColor,
  describePositionRequestError,
  filledHolders,
  formatCloseDeadline,
  getPositionCounts,
  getRecruitCloseAt,
  isRecruitClosed,
  listOpenPositions,
  loadFavoritePositionIds,
  parseSalaryRange,
  salaryText,
  sharePosition,
  submitPositionRequest,
  toggleFavoritePositionId,
  type RecruitPosition,
} from '../lib/recruit';
import './Jobs.css';

// 现任团队名单：静态展示，用户 2026-11-28 提供的名单，顺序照用户给的来。
// 与 11 个招聘职位无关，不参与名额与申请逻辑。
const TEAM_ROSTER: { role: string; name: string }[] = [
  { role: '董事长', name: '王瑞' },
  { role: '总经理', name: '刘俊威' },
  { role: '人事经理', name: '谢铭辛' },
  { role: '财务经理', name: '陈泽洋' },
  { role: '股东', name: '苟龙翔' },
  { role: '主管', name: '何达' },
  { role: '秘书', name: '何皓然' },
  { role: '保安', name: '李柯' },
  { role: '保安', name: '严浩溢' },
  { role: '女优', name: '李炫宇' },
  { role: '男优', name: '米乔睿' },
  { role: '摄影师', name: '袁梓航' },
];

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

/** 申请新增岗位的站内弹窗表单：游客不用登录就能提交，后台审核通过后建岗。 */
function PositionRequestDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [salary, setSalary] = useState('');
  const [description, setDescription] = useState('');
  const [qqEmail, setQqEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmedTitle = title.trim();
    const trimmedEmail = qqEmail.trim();
    if (!trimmedTitle) { setFormError('请填写岗位名称。'); return; }
    if (!QQ_EMAIL_RE.test(trimmedEmail)) { setFormError('QQ 邮箱格式不对，请检查一下。'); return; }
    const parsed = parseSalaryRange(salary);
    if (parsed === null) { setFormError('薪资范围格式不对，例如 6000–9000。'); return; }
    const dept = department.trim();
    if (dept.length > 20) { setFormError('部门名称不对（20 字以内）。'); return; }
    setFormError('');
    setSubmitting(true);
    try {
      await submitPositionRequest({
        title: trimmedTitle,
        department: dept === '' ? '综合' : dept,
        salaryMin: parsed.min,
        salaryMax: parsed.max,
        description: description.trim(),
        qqEmail: trimmedEmail,
      });
      setSubmitted(true);
    } catch (err) {
      setFormError(describePositionRequestError(err instanceof Error ? err.message : ''));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rj-modal-overlay" role="dialog" aria-modal="true" aria-label="申请新增岗位" onClick={onClose}>
      <div className="rj-modal-card" onClick={e => e.stopPropagation()}>
        <div className="rj-modal-head">
          <h2>申请新增岗位</h2>
          <button type="button" className="rj-modal-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        {submitted ? (
          <div className="rj-success" role="status" style={{ marginTop: 12 }}>
            <h2>已提交，待审核</h2>
            <p>你的新增岗位申请已经收到，正在等待审核。审核通过后，这个岗位会出现在职位列表里。</p>
            <p><button type="button" className="rj-submit" onClick={onClose}>好的</button></p>
          </div>
        ) : (
          <>
            <p>没有你想应聘的职位？填一下想加的岗位，管理员审核通过后就会加到列表里。带 * 的是必填项。</p>
            <form className="rj-form" onSubmit={onSubmit}>
              {formError ? <div className="rj-error" role="alert">{formError}</div> : null}
              <div className="rj-field">
                <label htmlFor="rj-req-title">岗位名称 <span>*</span></label>
                <input id="rj-req-title" value={title} maxLength={30} onChange={e => setTitle(e.target.value)} placeholder="例如：摄影助理" autoComplete="off" />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-req-dept">部门</label>
                <input id="rj-req-dept" value={department} maxLength={20} onChange={e => setDepartment(e.target.value)} placeholder="例如：技术，留空为综合" autoComplete="off" />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-req-salary">薪资范围</label>
                <input id="rj-req-salary" value={salary} maxLength={30} onChange={e => setSalary(e.target.value)} placeholder="例如：6000–9000，留空为面议" autoComplete="off" />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-req-desc">岗位描述</label>
                <textarea id="rj-req-desc" value={description} maxLength={2000} onChange={e => setDescription(e.target.value)} placeholder="这个岗位主要做什么…" />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-req-email">QQ 邮箱 <span>*</span></label>
                <input id="rj-req-email" type="email" value={qqEmail} maxLength={254} onChange={e => setQqEmail(e.target.value)} placeholder="例如：123456@qq.com" autoComplete="email" />
                <p className="rj-field-hint">审核通过后，这个岗位会直接出现在列表里；有问题时管理员会通过这个邮箱联系你。</p>
              </div>
              <button className="rj-submit" type="submit" disabled={submitting}>
                {submitting ? '正在提交…' : '提交申请'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
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
  const [reqOpen, setReqOpen] = useState(false);

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

  // 只统计仍有名额且没有任职人员的职位。
  const openCount = useMemo(
    () => closed ? 0 : positions.filter(p =>
      filledHolders(p.title).length === 0 && (counts[p.id] ?? 0) < p.quota
    ).length,
    [positions, counts, closed],
  );
  const openVisibleCount = useMemo(
    () => closed ? 0 : visible.filter(p =>
      filledHolders(p.title).length === 0 && (counts[p.id] ?? 0) < p.quota
    ).length,
    [visible, counts, closed],
  );
  const orderedVisible = useMemo(
    () => [...visible].sort((a, b) => {
      const aAvailable = !closed && filledHolders(a.title).length === 0 && (counts[a.id] ?? 0) < a.quota;
      const bAvailable = !closed && filledHolders(b.title).length === 0 && (counts[b.id] ?? 0) < b.quota;
      return Number(bAvailable) - Number(aAvailable);
    }),
    [visible, counts, closed],
  );


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
    <div className="rj-page rj-jobs-page">
      <header className="rj-hero rj-jobs-hero">
        <div className="rj-jobs-hero-main">
          <p className="rj-hero-kicker">{RECRUIT_COMPANY} · 招聘中心</p>
          <h1>加入瑞氏，和我们一起做事</h1>
          <p className="rj-hero-sub">选一个适合你的职位，填好资料就能应聘。审核通过后，我们会发邮件到你的 QQ 邮箱通知你。</p>
        </div>
        {loading ? null : (
          <div className="rj-jobs-stats" aria-label="招聘概况">
            <div><strong>{openCount}</strong><span>正在招聘</span></div>
            <div><strong>{departments.length}</strong><span>招聘部门</span></div>
            <div><strong>{positions.length}</strong><span>可查看岗位</span></div>
          </div>
        )}
        <nav className="rj-nav" aria-label="招聘导航">
          <NavLink to="/jobs" end aria-current="page">职位列表</NavLink>
          <NavLink to="/jobs/status">查询申请进度</NavLink>
        </nav>
        {closed ? null : (
          <div className="rj-hero-actions">
            <button type="button" className="rj-request-btn" onClick={() => setReqOpen(true)}>+ 申请新增岗位</button>
            <span className="rj-request-hint">没有你想应聘的职位？申请加一个，审核通过后就会出现在列表里。</span>
          </div>
        )}
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

      <div className="rj-toolbar rj-jobs-toolbar">
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
          <div className="rj-results-head">
            <div><h2>招聘职位</h2><p>{closed ? "本轮招聘已结束" : `当前筛选下有 ${openVisibleCount} 个岗位开放申请`}</p></div>\n            <span>{visible.length} 个职位</span>\n          </div>
          <div className="rj-list">
            {orderedVisible.map((p, i) => {
              const filled = counts[p.id] ?? 0;
              const full = fullIds.has(p.id);
              const holders = filledHolders(p.title);
              const taken = holders.length > 0;
              const fav = favorites.includes(p.id);
              return (
                <article
                  key={p.id}
                  className={`rj-card rj-card--enter${full || closed || taken ? ' rj-card--full' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
                  aria-label={`${p.title}，${closed ? '招聘已结束' : taken ? `已入职：${holders.join('、')}` : full ? '已招满' : `招${p.quota}人，已招${filled}人`}`}
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
                      : taken
                        ? <span className="rj-badge rj-badge--full">已入职</span>
                        : full
                          ? <span className="rj-badge rj-badge--full">已满</span>
                          : <span className="rj-badge rj-badge--open">招聘中</span>}
                  </div>
                  <p className="rj-desc">{p.description}</p>
                  {taken ? <p className="rj-filled">已入职：{holders.join('、')}</p> : null}
                  <div className="rj-card-foot">
                    {taken ? null : <span className="rj-quota">招 <b>{p.quota}</b> 人 · 已招 <b>{filled}</b> 人</span>}
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
                      {taken
                        ? <span className="rj-cta--full">已满员</span>
                        : <Link className={closed || full ? 'rj-cta--full' : 'rj-cta'} to={`/jobs/${p.id}`}>
                          {closed ? '招聘已结束' : full ? '已招满' : '查看并应聘 →'}
                        </Link>}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <section className="rj-team" aria-label="现任团队">
        <h2>现任团队</h2>
        <p className="rj-team-sub">瑞氏集团的现任团队成员。</p>
        <div className="rj-team-grid">
          {TEAM_ROSTER.map((m) => (
            <div key={`${m.role}-${m.name}`} className="rj-team-card">
              <span className="rj-team-avatar" aria-hidden="true">{m.name.slice(0, 1)}</span>
              <span className="rj-team-info">
                <span className="rj-team-role">{m.role}</span>
                <span className="rj-team-name">{m.name}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
      {reqOpen ? <PositionRequestDialog onClose={() => setReqOpen(false)} /> : null}
    </div>
  );
}
