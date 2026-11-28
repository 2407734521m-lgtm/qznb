import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import {
  RECRUIT_COMPANY,
  QQ_EMAIL_RE,
  departmentColor,
  describeApplyResultError,
  formatCloseDeadline,
  getOpenPosition,
  getPositionCounts,
  getRecruitCloseAt,
  isFavoritePositionId,
  isPositionFull,
  isRecruitClosed,
  positionOccupied,
  salaryText,
  sharePosition,
  submitApplicationChecked,
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

function paragraphs(text: string): string[] {
  return text.split(/\n+/).map(s => s.trim()).filter(Boolean);
}

export default function JobDetail() {
  const { id } = useParams();
  const positionId = Number(id);
  const [position, setPosition] = useState<RecruitPosition | null>(null);
  const [filled, setFilled] = useState(0);
  const [closeAt, setCloseAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState('');
  const [qqEmail, setQqEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [intro, setIntro] = useState('');
  const [experience, setExperience] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [fav, setFav] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!Number.isInteger(positionId) || positionId <= 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      try {
        const [pos, counts, close] = await Promise.all([
          getOpenPosition(positionId),
          getPositionCounts(),
          // 关闭时间读不到也不影响详情，按未设置处理。
          getRecruitCloseAt().catch(() => null),
        ]);
        if (!alive) return;
        if (!pos) {
          setNotFound(true);
        } else {
          setPosition(pos);
          setFilled(counts[pos.id] ?? 0);
          setCloseAt(close);
          setFav(isFavoritePositionId(pos.id));
        }
      } catch {
        if (!alive) return;
        setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [positionId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const holders = position ? (position.holder_names ?? []) : [];
  const isFilled = holders.length > 0;
  const occupied = positionOccupied(filled, holders);
  const full = position != null && isPositionFull(position.quota, filled, holders);
  const closed = isRecruitClosed(closeAt);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!position || submitting || closed || full) return;
    const trimmedName = name.trim();
    const trimmedEmail = qqEmail.trim();
    if (!trimmedName) { setFormError('请填写姓名。'); return; }
    if (!QQ_EMAIL_RE.test(trimmedEmail)) { setFormError('QQ 邮箱格式不对，请检查一下。'); return; }
    setFormError('');
    setSubmitting(true);
    try {
      const result = await submitApplicationChecked({
        positionId: position.id,
        name: trimmedName,
        qqEmail: trimmedEmail,
        phone: phone.trim(),
        intro: intro.trim(),
        experience: experience.trim(),
      });
      if (result.ok) {
        setConfirmationSent(result.confirmationEmailSent === true);
        setSubmitted(true);
      } else {
        setFormError(describeApplyResultError(result.reason ?? ''));
      }
    } catch (err) {
      setFormError(describeApplyResultError(err instanceof Error ? err.message : ''));
    } finally {
      setSubmitting(false);
    }
  }

  function onToggleFavorite() {
    if (!position) return;
    setFav(toggleFavoritePositionId(position.id));
    setToast(fav ? '已取消收藏。' : '已收藏这个职位。');
  }

  async function onShare() {
    if (!position) return;
    const result = await sharePosition(position.title, position.id);
    if (result === 'shared') return;
    setToast(result === 'copied' ? '职位链接已复制，可以发给朋友。' : '分享失败，请稍后重试。');
  }

  return (
    <div className="rj-page">
      <Link className="rj-back" to="/jobs">← 返回职位列表</Link>
      <header className="rj-hero rj-hero--compact">
        <p className="rj-hero-kicker">{RECRUIT_COMPANY} · 招聘中心</p>
        <h1>加入瑞氏，和我们一起做事</h1>
        <nav className="rj-nav" aria-label="招聘导航">
          <NavLink to="/jobs">职位列表</NavLink>
          <NavLink to="/jobs/status">查询申请进度</NavLink>
        </nav>
      </header>

      {toast ? <div className="rj-toast" role="status">{toast}</div> : null}

      {loading ? (
        <div className="rj-empty">正在加载职位…</div>
      ) : notFound || !position ? (
        <div className="rj-empty">这个职位不存在，或者已经关闭报名了。<br /><Link to="/jobs">回职位列表看看其他职位</Link></div>
      ) : (
        <>
          <div className="rj-card-top">
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{position.title}</h2>
            <span className="rj-salary rj-salary--big">{salaryText(position)}</span>
          </div>
          <div className="rj-detail-meta">
            <span className="rj-chip">
              <span className="rj-dept-dot" style={{ background: departmentColor(position.department) }} aria-hidden="true" />
              {position.department}
            </span>
            {closed
              ? <span className="rj-badge rj-badge--rejected">已结束</span>
              : isFilled && full
                ? <span className="rj-badge rj-badge--full">已入职</span>
                : full
                  ? <span className="rj-badge rj-badge--full">已满</span>
                  : <span className="rj-badge rj-badge--open">招聘中</span>}
            {isFilled && full
              ? <span className="rj-quota">已入职：<b>{holders.join('、')}</b></span>
              : <span className="rj-quota">招 <b>{position.quota}</b> 人 · 已招 <b>{occupied}</b> 人</span>}
          </div>
          {!closed && closeAt ? (
            <p className="rj-deadline">报名截止：{formatCloseDeadline(closeAt)}（北京时间）</p>
          ) : null}
          <div className="rj-card-actions rj-detail-actions">
            <button
              type="button"
              className={`rj-icon-btn${fav ? ' rj-icon-btn--on' : ''}`}
              aria-pressed={fav}
              onClick={onToggleFavorite}
            >
              <StarIcon filled={fav} />{fav ? '已收藏' : '收藏'}
            </button>
            <button type="button" className="rj-icon-btn" onClick={() => void onShare()}>
              <ShareIcon />分享
            </button>
          </div>

          <div className="rj-highlights" aria-label="职位亮点">
            <span>薪资 {salaryText(position)}</span>
            <span>招 {position.quota} 人</span>
            <span>{position.department}</span>
            <span>{closed ? '已结束' : isFilled && full ? '已入职' : full ? '已招满' : '正在招聘'}</span>
          </div>

          <section className="rj-section">
            <h2>职位描述</h2>
            {paragraphs(position.description).length > 0
              ? paragraphs(position.description).map((line, i) => <p key={i}>{line}</p>)
              : <p>暂无描述。</p>}
          </section>
          <section className="rj-section">
            <h2>任职要求</h2>
            {paragraphs(position.requirements).length > 0
              ? paragraphs(position.requirements).map((line, i) => <p key={i}>{line}</p>)
              : <p>暂无要求。</p>}
          </section>

          {full ? null : (
            <ol className="rj-steps" aria-label="应聘流程">
              <li className={submitted ? 'rj-step--done' : 'rj-step--current'}><span>1</span>填写资料</li>
              <li className={submitted ? 'rj-step--done' : ''}><span>2</span>提交申请</li>
              <li className={submitted ? 'rj-step--current' : ''}><span>3</span>等待审核</li>
            </ol>
          )}

          {submitted ? (
            <div className="rj-success" role="status" style={{ marginTop: 24 }}>
              <h2>已提交，待审核</h2>
              <p>你的申请已经收到，正在等待审核。审核通过后，我们会发邮件到你的 QQ 邮箱（{qqEmail.trim()}）通知你。</p>
              {confirmationSent
                ? <p>确认信已经发到你的 QQ 邮箱，请留意查收。</p>
                : <p>确认信发送失败也没关系，申请已经收到，审核结果仍会发到你的 QQ 邮箱。</p>}
              <p><Link to="/jobs/status">查询申请进度 →</Link></p>
            </div>
          ) : closed ? (
            <div className="rj-closed" role="status" style={{ marginTop: 24 }}>
              招聘已结束，不能再报名了。可以回职位列表看看其他职位，或者在“查询申请进度”里查看已提交申请的审核进度。
            </div>
          ) : isFilled && full ? (
            <div className="rj-closed" role="status" style={{ marginTop: 24 }}>
              该职位已有任职人员，不再接受申请。
              <br />任职人员：{holders.join('、')}
              <br /><Link to="/jobs">回职位列表看看其他职位</Link>
            </div>
          ) : full ? (
            <div className="rj-error" role="status" style={{ marginTop: 24 }}>
              这个职位已经招满了，暂时不能再报名。可以回职位列表看看其他正在招聘的职位。
            </div>
          ) : (
            <form className="rj-form" onSubmit={onSubmit}>
              <h2>应聘这个职位</h2>
              <p>带 * 的是必填项。提交后请留意 QQ 邮箱，审核结果会发到你的邮箱。</p>
              {isFilled ? <p>已有任职人员：{holders.join('、')}，还剩 {position.quota - occupied} 个名额。</p> : null}
              {formError ? <div className="rj-error" role="alert">{formError}</div> : null}
              <div className="rj-field">
                <label htmlFor="rj-name">姓名 <span>*</span></label>
                <input id="rj-name" value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="你的姓名" autoComplete="name" />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-email">QQ 邮箱 <span>*</span></label>
                <input id="rj-email" type="email" value={qqEmail} maxLength={254} onChange={e => setQqEmail(e.target.value)} placeholder="例如：123456@qq.com" autoComplete="email" />
                <p className="rj-field-hint">请使用已设置头像的 QQ 邮箱；没有头像的 QQ 邮箱会被系统自动拒绝。审核通过后，录用通知会发到这个邮箱，请务必填写正确。</p>
              </div>
              <div className="rj-field">
                <label htmlFor="rj-phone">手机号</label>
                <input id="rj-phone" type="tel" value={phone} maxLength={20} onChange={e => setPhone(e.target.value)} placeholder="方便联系你的电话" autoComplete="tel" />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-intro">自我介绍</label>
                <textarea id="rj-intro" value={intro} maxLength={2000} onChange={e => setIntro(e.target.value)} placeholder="简单介绍一下自己…" />
              </div>
              <div className="rj-field">
                <label htmlFor="rj-exp">工作经历</label>
                <textarea id="rj-exp" value={experience} maxLength={2000} onChange={e => setExperience(e.target.value)} placeholder="以前做过什么工作，有什么经验…" />
              </div>
              <button className="rj-submit" type="submit" disabled={submitting}>
                {submitting ? '正在提交…' : '提交应聘申请'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
