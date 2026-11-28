import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import {
  RECRUIT_COMPANY,
  QQ_EMAIL_RE,
  describeApplyResultError,
  getOpenPosition,
  getPositionCounts,
  salaryText,
  submitApplicationChecked,
  type RecruitPosition,
} from '../lib/recruit';
import './Jobs.css';

export default function JobDetail() {
  const { id } = useParams();
  const positionId = Number(id);
  const [position, setPosition] = useState<RecruitPosition | null>(null);
  const [filled, setFilled] = useState(0);
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

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!Number.isInteger(positionId) || positionId <= 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      try {
        const [pos, counts] = await Promise.all([getOpenPosition(positionId), getPositionCounts()]);
        if (!alive) return;
        if (!pos) {
          setNotFound(true);
        } else {
          setPosition(pos);
          setFilled(counts[pos.id] ?? 0);
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

  const full = position != null && filled >= position.quota;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!position || submitting) return;
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

  return (
    <div className="rj-page">
      <Link className="rj-back" to="/jobs">← 返回职位列表</Link>
      <header className="rj-header">
        <h1>{RECRUIT_COMPANY}</h1>
        <nav className="rj-nav" aria-label="招聘导航">
          <NavLink to="/jobs">职位列表</NavLink>
          <NavLink to="/jobs/status">查询申请进度</NavLink>
        </nav>
      </header>

      {loading ? (
        <div className="rj-empty">正在加载职位…</div>
      ) : notFound || !position ? (
        <div className="rj-empty">这个职位不存在，或者已经关闭报名了。<br /><Link to="/jobs">回职位列表看看其他职位</Link></div>
      ) : (
        <>
          <div className="rj-card-top">
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{position.title}</h2>
            <span className="rj-salary">{salaryText(position)}</span>
          </div>
          <div className="rj-detail-meta">
            <span className="rj-chip">{position.department}</span>
            {full
              ? <span className="rj-badge rj-badge--full">已满</span>
              : <span className="rj-badge rj-badge--open">招聘中</span>}
            <span className="rj-quota">招 <b>{position.quota}</b> 人 · 已招 <b>{filled}</b> 人</span>
          </div>
          <section className="rj-section">
            <h2>职位描述</h2>
            <p>{position.description || '暂无描述。'}</p>
          </section>
          <section className="rj-section">
            <h2>任职要求</h2>
            <p>{position.requirements || '暂无要求。'}</p>
          </section>

          {submitted ? (
            <div className="rj-success" role="status" style={{ marginTop: 24 }}>
              <h2>已提交，待审核</h2>
              <p>你的申请已经收到，正在等待审核。审核通过后，我们会发邮件到你的 QQ 邮箱（{qqEmail.trim()}）通知你。</p>
              <p><Link to="/jobs/status">查询申请进度 →</Link></p>
            </div>
          ) : full ? (
            <div className="rj-error" role="status" style={{ marginTop: 24 }}>
              这个职位已经招满了，暂时不能再报名。可以回职位列表看看其他正在招聘的职位。
            </div>
          ) : (
            <form className="rj-form" onSubmit={onSubmit}>
              <h2>应聘这个职位</h2>
              <p>带 * 的是必填项。提交后请留意 QQ 邮箱，审核结果会发到你的邮箱。</p>
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
