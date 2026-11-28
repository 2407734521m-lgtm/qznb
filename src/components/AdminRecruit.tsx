import { useCallback, useEffect, useMemo, useState } from 'react';
import OptionSheet from './OptionSheet';
import { confirmDialog, promptDialog } from '../lib/dialog';
import { alog, card, h3, mut, rowBtn } from '../pages/admin/shared';
import {
  STATUS_LABEL,
  adminListApplications,
  adminListPositions,
  adminRecruitStats,
  adminReviewApplication,
  adminUpsertPosition,
  describeReviewError,
  formatDate,
  salaryText,
  sendRecruitEmail,
  type RecruitApplication,
  type RecruitPositionAdmin,
  type RecruitStats,
} from '../lib/recruit';

interface PositionForm {
  id: number | null;
  title: string;
  department: string;
  quota: string;
  salaryMin: string;
  salaryMax: string;
  description: string;
  requirements: string;
  isOpen: boolean;
  sortOrder: string;
}

const EMPTY_FORM: PositionForm = {
  id: null, title: '', department: '', quota: '1',
  salaryMin: '', salaryMax: '', description: '', requirements: '',
  isOpen: true, sortOrder: '0',
};

function toForm(p: RecruitPositionAdmin): PositionForm {
  return {
    id: p.id,
    title: p.title,
    department: p.department,
    quota: String(p.quota),
    salaryMin: p.salary_min == null ? '' : String(p.salary_min),
    salaryMax: p.salary_max == null ? '' : String(p.salary_max),
    description: p.description,
    requirements: p.requirements,
    isOpen: p.is_open,
    sortOrder: String(p.sort_order),
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', font: 'inherit', fontSize: 14, boxSizing: 'border-box',
  border: '1px solid #d5dae0', borderRadius: 10, background: '#fff', color: '#20242a',
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 5 };
const fieldStyle: React.CSSProperties = { marginBottom: 10 };
const btnStyle: React.CSSProperties = {
  border: '1px solid #e2e8f0', borderRadius: 999, padding: '7px 16px', fontSize: 13.5,
  background: '#fff', color: '#22314a', cursor: 'pointer',
};
const primaryBtnStyle: React.CSSProperties = {
  ...btnStyle, background: '#f6c453', borderColor: '#f6c453', color: '#4a3716', fontWeight: 600,
};
const dangerBtnStyle: React.CSSProperties = { ...btnStyle, color: '#c44747', borderColor: '#f0d4d4' };

export default function AdminRecruit({ setMsg }: { setMsg: (s: string) => void }) {
  const [stats, setStats] = useState<RecruitStats | null>(null);
  const [positions, setPositions] = useState<RecruitPositionAdmin[]>([]);
  const [applications, setApplications] = useState<RecruitApplication[]>([]);
  const [positionFilter, setPositionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState<PositionForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [mailBusyId, setMailBusyId] = useState<number | null>(null);

  const load = useCallback(async (posFilter: string, stFilter: string) => {
    setLoading(true);
    try {
      const [statData, posData, appData] = await Promise.all([
        adminRecruitStats(),
        adminListPositions(),
        adminListApplications(posFilter === 'all' ? null : Number(posFilter), stFilter),
      ]);
      setStats(statData);
      setPositions(posData);
      setApplications(appData);
      setErr('');
    } catch (e) {
      setErr('读取失败：' + (e instanceof Error ? e.message : '请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(positionFilter, statusFilter); }, [load, positionFilter, statusFilter]);

  const pendingCount = stats?.pending ?? 0;

  const positionOptions = useMemo(
    () => [
      { value: 'all', label: '全部职位' },
      ...positions.map(p => ({ value: String(p.id), label: `${p.title}（${p.department}）` })),
    ],
    [positions],
  );

  async function handleReview(app: RecruitApplication, status: 'approved' | 'rejected') {
    if (busyId !== null) return;
    let note = '';
    if (status === 'approved') {
      const ok = await confirmDialog(
        `通过「${app.name}」应聘「${app.position_title}」？\n通过后会发录用通知邮件到 ${app.qq_email}。`,
        { confirmText: '通过并发送邮件' },
      );
      if (!ok) return;
    } else {
      const input = await promptDialog('驳回备注（可选，只记在后台，不会发给应聘者）', {
        placeholder: '例如：经验与岗位要求不符',
        confirmText: '确认驳回',
      });
      if (input === null) return;
      note = input.trim();
    }
    setBusyId(app.id);
    setMsg('');
    try {
      const result = await adminReviewApplication(app.id, status, note);
      void alog('recruit_review', { application_id: app.id, position: result.position_title, name: result.name, status });
      if (status === 'approved') {
        const sent = await sendRecruitEmail(app.id, 'offer');
        if (sent.ok) {
          setMsg(`已通过「${app.name}」的申请，录用通知邮件已发到 ${app.qq_email}。`);
        } else {
          setMsg(`已通过「${app.name}」的申请，但录用邮件发送失败（${sent.error ?? '请稍后重试'}），可在列表里点“重发录用邮件”。`);
        }
      } else {
        setMsg(`已驳回「${app.name}」的申请。如需通知对方，可在列表里点“发送婉拒邮件”。`);
      }
      await load(positionFilter, statusFilter);
    } catch (e) {
      setMsg(describeReviewError(e instanceof Error ? e.message : ''));
    } finally {
      setBusyId(null);
    }
  }

  async function handleSendMail(app: RecruitApplication) {
    if (mailBusyId !== null) return;
    const kind = app.status === 'approved' ? 'offer' : 'rejection';
    const ok = await confirmDialog(
      kind === 'offer'
        ? `给 ${app.qq_email} 重发录用通知邮件？`
        : `给 ${app.qq_email} 发送婉拒邮件？`,
      { confirmText: '发送邮件' },
    );
    if (!ok) return;
    setMailBusyId(app.id);
    try {
      const sent = await sendRecruitEmail(app.id, kind);
      if (sent.ok) {
        setMsg(kind === 'offer' ? '录用通知邮件已发送。' : '婉拒邮件已发送。');
        await load(positionFilter, statusFilter);
      } else {
        setMsg(`邮件发送失败：${sent.error ?? '请稍后重试。'}`);
      }
    } finally {
      setMailBusyId(null);
    }
  }

  async function handleSavePosition() {
    if (!form || saving) return;
    const quota = Number(form.quota);
    const salaryMin = form.salaryMin.trim() === '' ? null : Number(form.salaryMin);
    const salaryMax = form.salaryMax.trim() === '' ? null : Number(form.salaryMax);
    if (!form.title.trim()) { setMsg('请填写职位名称。'); return; }
    if (!form.department.trim()) { setMsg('请填写部门。'); return; }
    if (!Number.isInteger(quota) || quota < 0 || quota > 100) { setMsg('名额必须是 0–100 的整数。'); return; }
    if (salaryMin !== null && (!Number.isInteger(salaryMin) || salaryMin < 0)) { setMsg('薪资下限格式不对。'); return; }
    if (salaryMax !== null && (!Number.isInteger(salaryMax) || salaryMax < 0)) { setMsg('薪资上限格式不对。'); return; }
    if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) { setMsg('薪资下限不能大于上限。'); return; }
    setSaving(true);
    try {
      const id = await adminUpsertPosition({
        id: form.id,
        title: form.title.trim(),
        department: form.department.trim(),
        quota,
        salaryMin,
        salaryMax,
        description: form.description.trim(),
        requirements: form.requirements.trim(),
        isOpen: form.isOpen,
        sortOrder: Number(form.sortOrder) || 0,
      });
      void alog('recruit_position_save', { position_id: id, title: form.title.trim(), quota });
      setMsg(form.id === null ? '职位已新增。' : '职位已保存。');
      setForm(null);
      await load(positionFilter, statusFilter);
    } catch (e) {
      setMsg('保存失败：' + (e instanceof Error ? e.message : '请稍后重试。'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={card}>
        <h3 style={h3}>招聘管理 · 瑞氏集团有限公司</h3>
        <p style={mut}>公开职位在 qianzhi.pw/jobs 上，游客不用登录就能看和应聘。名额满了的职位自动显示“已满”，不能再报名；审核通过后发录用通知邮件到应聘者的 QQ 邮箱。</p>
        {loading ? <p style={mut}>正在加载…</p> : null}
        {err ? <p style={{ ...mut, color: '#c44747' }}>{err}</p> : null}
        {stats && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 14 }}>
            <span>职位 <b>{stats.total_positions}</b> 个（开放 <b>{stats.open_positions}</b>）</span>
            <span>申请 <b>{stats.total_applications}</b> 条</span>
            <span>待审核 <b>{pendingCount}</b> 条</span>
            <span>已通过 <b>{stats.approved}</b> 人</span>
            <span>未通过 <b>{stats.rejected}</b> 人</span>
          </div>
        )}
        <div style={rowBtn}>
          <button type="button" style={btnStyle} onClick={() => { setMsg(''); void load(positionFilter, statusFilter); }}>刷新</button>
          <button type="button" style={primaryBtnStyle} onClick={() => setForm({ ...EMPTY_FORM })}>新增职位</button>
        </div>
      </div>

      {form && (
        <div style={card}>
          <h3 style={h3}>{form.id === null ? '新增职位' : `编辑职位：${form.title}`}</h3>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="rc-title">职位名称 *</label>
            <input id="rc-title" style={inputStyle} value={form.title} maxLength={30} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...fieldStyle, flex: '1 1 140px' }}>
              <label style={labelStyle} htmlFor="rc-dept">部门 *</label>
              <input id="rc-dept" style={inputStyle} value={form.department} maxLength={20} onChange={e => setForm({ ...form, department: e.target.value })} placeholder="例如：技术" />
            </div>
            <div style={{ ...fieldStyle, flex: '1 1 100px' }}>
              <label style={labelStyle} htmlFor="rc-quota">名额 *</label>
              <input id="rc-quota" style={inputStyle} type="number" min={0} max={100} value={form.quota} onChange={e => setForm({ ...form, quota: e.target.value })} />
            </div>
            <div style={{ ...fieldStyle, flex: '1 1 100px' }}>
              <label style={labelStyle} htmlFor="rc-order">排序</label>
              <input id="rc-order" style={inputStyle} type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ ...fieldStyle, flex: '1 1 140px' }}>
              <label style={labelStyle} htmlFor="rc-sal-min">薪资下限（元/月，可空）</label>
              <input id="rc-sal-min" style={inputStyle} type="number" min={0} value={form.salaryMin} onChange={e => setForm({ ...form, salaryMin: e.target.value })} placeholder="面议可留空" />
            </div>
            <div style={{ ...fieldStyle, flex: '1 1 140px' }}>
              <label style={labelStyle} htmlFor="rc-sal-max">薪资上限（元/月，可空）</label>
              <input id="rc-sal-max" style={inputStyle} type="number" min={0} value={form.salaryMax} onChange={e => setForm({ ...form, salaryMax: e.target.value })} placeholder="面议可留空" />
            </div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="rc-desc">职位描述</label>
            <textarea id="rc-desc" style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.description} maxLength={2000} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="rc-req">任职要求</label>
            <textarea id="rc-req" style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.requirements} maxLength={2000} onChange={e => setForm({ ...form, requirements: e.target.value })} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12 }}>
            <input type="checkbox" checked={form.isOpen} onChange={e => setForm({ ...form, isOpen: e.target.checked })} />
            对外开放招聘（关掉后游客看不到这个职位，也不能再报名）
          </label>
          <div style={rowBtn}>
            <button type="button" style={primaryBtnStyle} disabled={saving} onClick={() => void handleSavePosition()}>
              {saving ? '保存中…' : '保存职位'}
            </button>
            <button type="button" style={btnStyle} onClick={() => setForm(null)}>取消</button>
          </div>
        </div>
      )}

      <div style={card}>
        <h3 style={h3}>各职位招录情况</h3>
        {positions.length === 0 ? <p style={mut}>暂无职位，先新增一个。</p> : positions.map(p => {
          const remaining = Math.max(0, p.quota - p.approved_count);
          return (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13.5, lineHeight: 2, flexWrap: 'wrap' }}>
              <span>
                <b>{p.title}</b>（{p.department}）· {salaryText(p)} · 名额 {p.quota} · 已招 {p.approved_count} · 待审 {p.pending_count}
                {p.is_open ? (remaining === 0 ? ' · 已满' : ` · 还剩 ${remaining}`) : ' · 已关闭'}
              </span>
              <button type="button" style={btnStyle} onClick={() => setForm(toForm(p))}>编辑</button>
            </div>
          );
        })}
      </div>

      <div style={card}>
        <h3 style={h3}>应聘申请</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <OptionSheet title="选择职位" value={positionFilter} options={positionOptions} onChange={setPositionFilter}
            buttonText={positionFilter === 'all' ? '全部职位' : (positions.find(p => String(p.id) === positionFilter)?.title ?? '全部职位')} />
          <OptionSheet title="选择状态" value={statusFilter}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'pending', label: '待审核' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '未通过' },
            ]}
            onChange={setStatusFilter}
            buttonText={statusFilter === 'all' ? '全部状态' : STATUS_LABEL[statusFilter as 'pending' | 'approved' | 'rejected']} />
        </div>
        {applications.length === 0 ? (
          <p style={mut}>没有符合条件的申请。</p>
        ) : applications.map(app => (
          <div key={app.id} style={{ borderTop: '1px solid #eef2f7', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
              <span><b>{app.name}</b> · {app.position_title} · {app.qq_email}{app.phone ? ` · ${app.phone}` : ''}</span>
              <span style={{ fontSize: 13, color: app.status === 'approved' ? '#23845b' : app.status === 'rejected' ? '#737b86' : '#a96f19' }}>
                {STATUS_LABEL[app.status]}{app.reviewed_at ? ` · ${formatDate(app.reviewed_at)}` : ''}{app.email_status === 'sent' ? ' · 邮件已发' : app.email_status === 'failed' ? ' · 邮件发送失败' : ''}
              </span>
            </div>
            {app.intro ? <p style={{ ...mut, margin: '6px 0 0' }}>自我介绍：{app.intro}</p> : null}
            {app.experience ? <p style={{ ...mut, margin: '4px 0 0' }}>工作经历：{app.experience}</p> : null}
            {app.admin_note ? <p style={{ ...mut, margin: '4px 0 0' }}>备注：{app.admin_note}</p> : null}
            <p style={{ ...mut, margin: '4px 0 0' }}>申请于 {formatDate(app.created_at)}</p>
            <div style={rowBtn}>
              {app.status === 'pending' && (
                <>
                  <button type="button" style={primaryBtnStyle} disabled={busyId === app.id} onClick={() => void handleReview(app, 'approved')}>
                    {busyId === app.id ? '处理中…' : '通过并发送录用邮件'}
                  </button>
                  <button type="button" style={dangerBtnStyle} disabled={busyId === app.id} onClick={() => void handleReview(app, 'rejected')}>
                    驳回
                  </button>
                </>
              )}
              {app.status === 'approved' && app.email_status !== 'sent' && (
                <button type="button" style={btnStyle} disabled={mailBusyId === app.id} onClick={() => void handleSendMail(app)}>
                  {mailBusyId === app.id ? '发送中…' : '重发录用邮件'}
                </button>
              )}
              {app.status === 'rejected' && app.email_status !== 'sent' && (
                <button type="button" style={btnStyle} disabled={mailBusyId === app.id} onClick={() => void handleSendMail(app)}>
                  {mailBusyId === app.id ? '发送中…' : '发送婉拒邮件'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
