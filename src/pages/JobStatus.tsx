import { useState, type FormEvent } from 'react';
import { NavLink } from 'react-router-dom';
import {
  QQ_EMAIL_RE,
  RECRUIT_COMPANY,
  STATUS_LABEL,
  formatDate,
  myApplications,
  type RecruitMyApplication,
} from '../lib/recruit';
import './Jobs.css';

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
    <div className="rj-page">
      <header className="rj-header">
        <h1>{RECRUIT_COMPANY}</h1>
        <p>输入你应聘时填的 QQ 邮箱，就能查到申请进度。</p>
        <nav className="rj-nav" aria-label="招聘导航">
          <NavLink to="/jobs">职位列表</NavLink>
          <NavLink to="/jobs/status" aria-current="page">查询申请进度</NavLink>
        </nav>
      </header>

      <form className="rj-form" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }} onSubmit={onSearch}>
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
        <div style={{ marginTop: 20 }}>
          {rows.length === 0 ? (
            <div className="rj-empty">这个邮箱（{searchedEmail}）还没有申请记录。<br />请确认邮箱填得和应聘时一致。</div>
          ) : (
            rows.map(r => (
              <div className="rj-status-row" key={r.id}>
                <div>
                  <b>{r.position_title}</b>
                  <small>申请于 {formatDate(r.created_at)}{r.reviewed_at ? ` · ${formatDate(r.reviewed_at)}审核` : ''}</small>
                </div>
                <span className={`rj-badge rj-badge--${r.status}`}>{STATUS_LABEL[r.status]}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
