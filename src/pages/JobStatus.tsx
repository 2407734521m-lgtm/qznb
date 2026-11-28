import { useState, type FormEvent } from 'react';
import { NavLink } from 'react-router-dom';
import {
  QQ_EMAIL_RE,
  RECRUIT_COMPANY,
  STATUS_LABEL,
  applicationTimelineSteps,
  formatDate,
  formatDateTime,
  myApplications,
  type RecruitMyApplication,
} from '../lib/recruit';
import './Jobs.css';

function Timeline({ app }: { app: RecruitMyApplication }) {
  const steps = applicationTimelineSteps(app);
  return (
    <ol className="rj-timeline" aria-label={`${app.position_title}申请进度`}>
      {steps.map(step => (
        <li key={step.key} className={`rj-timeline-step rj-timeline-step--${step.state}`}>
          <span className="rj-timeline-dot" aria-hidden="true" />
          <div className="rj-timeline-body">
            <b>{step.label}</b>
            {step.time ? <small>{step.key === 'interview' ? formatDateTime(step.time) : formatDate(step.time)}</small> : null}
            {step.note ? <small className="rj-status-reason">{step.key === 'interview' ? `说明：${step.note}` : `原因：${step.note}`}</small> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function JobStatus() {
  const [qqEmail, setQqEmail] = useState('');
  const [searchedEmail, setSearchedEmail] = useState('');
  const [rows, setRows] = useState<RecruitMyApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [searched, setSearched] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = qqEmail.trim();
    if (!QQ_EMAIL_RE.test(trimmed)) { setErr('QQ 邮箱格式不对，请检查一下。'); return; }
    setErr('');
    setLoading(true);
    try {
      const data = await myApplications(trimmed);
      setRows(data);
      setSearchedEmail(trimmed);
      setSearched(true);
    } catch {
      setErr('查询失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rj-page rj-status-page">
      <header className="rj-hero rj-hero--compact">
        <p className="rj-hero-kicker">{RECRUIT_COMPANY} · 招聘中心</p>
        <h1>查询申请进度</h1>
        <p className="rj-hero-sub">输入你应聘时填的 QQ 邮箱，就能查到申请进度。</p>
        <nav className="rj-nav" aria-label="招聘导航">
          <NavLink to="/jobs">职位列表</NavLink>
          <NavLink to="/jobs/status" aria-current="page">查询申请进度</NavLink>
        </nav>
      </header>

      <form className="rj-form rj-status-search" onSubmit={onSearch}>
        {err ? <div className="rj-error" role="alert">{err}</div> : null}
        <div className="rj-field">
          <label htmlFor="rj-status-email">QQ 邮箱</label>
          <input
            id="rj-status-email"
            type="email"
            value={qqEmail}
            maxLength={254}
            onChange={e => setQqEmail(e.target.value)}
            placeholder="例如：123456@qq.com"
            autoComplete="email"
          />
        </div>
        <button className="rj-submit" type="submit" disabled={loading}>
          {loading ? '正在查询…' : '查询我的申请'}
        </button>
      </form>

      {searched && !loading && (
        <section className="rj-status-results" aria-live="polite">
          <div className="rj-status-results-head">
            <div>
              <h2>查询结果</h2>
              <p>你的申请记录与当前审核进度</p>
            </div>
            <span>{rows.length} 条记录</span>
          </div>
          {rows.length === 0 ? (
            <div className="rj-empty rj-status-empty">
              <strong>暂时没有申请记录</strong>
              <span>请确认邮箱是否与应聘时填写的一致。</span>
            </div>
          ) : (
            rows.map(r => (
              <div className="rj-status-card" key={r.id}>
                <div className="rj-status-head">
                  <div>
                    <span className="rj-status-card-kicker">应聘职位</span>
                    <b>{r.position_title}</b>
                  </div>
                  <span className={`rj-badge rj-badge--${r.status}`}>{STATUS_LABEL[r.status]}</span>
                </div>
                <Timeline app={r} />
                {r.status === 'approved' && (
                  <p className="rj-status-hint">审核已通过，录用通知已发到你的 QQ 邮箱，请留意查收。</p>
                )}
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
