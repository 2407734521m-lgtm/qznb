import { useCallback, useEffect, useMemo, useState } from 'react';
import DateTimeField from './DateTimeField';
import OptionSheet from './OptionSheet';
import { confirmDialog, promptDialog } from '../lib/dialog';
import { alog, card, h3, mut, rowBtn } from '../pages/admin/shared';
import {
  POSITION_REQUEST_STATUS_LABEL,
  STATUS_LABEL,
  adminListApplications,
  adminListPositions,
  adminListPositionRequests,
  adminRecruitStats,
  adminReviewApplication,
  adminReviewApplicationsBatch,
  adminReviewPositionRequest,
  adminSetRecruitCloseAt,
  adminSetRecruitInterview,
  adminUpsertPosition,
  describeBatchReviewError,
  describeCloseAtError,
  describeInterviewError,
  describePositionRequestReviewError,
  describeReviewError,
  describeUpsertPositionError,
  formatDate,
  formatDateTime,
  formatHolderNames,
  getRecruitCloseAt,
  isRecruitClosed,
  parseHolderNames,
  salaryText,
  sendRecruitEmail,
  type RecruitApplication,
  type RecruitPositionAdmin,
  type RecruitPositionRequest,
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
  /** 任职人输入框文本：多个名字用顿号隔开。 */
  holders: string;
}

const EMPTY_FORM: PositionForm = {
  id: null, title: '', department: '', quota: '1',
  salaryMin: '', salaryMax: '', description: '', requirements: '',
  isOpen: true, sortOrder: '0', holders: '',
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
    holders: formatHolderNames(p.holder_names),
  };
}

/** ISO 时间转 DateTimeField 的值格式（YYYY-MM-DDTHH:mm，本地时间）。 */
function toDateTimeLocal(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
const fullBannerStyle: React.CSSProperties = {
  marginTop: 10, padding: '10px 14px', fontSize: 13.5, lineHeight: 1.6, color: '#4a3716',
  background: '#fdf6e7', border: '1px solid #f0dfae', borderRadius: 12,
};

interface InterviewDraft { at: string; note: string; }

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const [interviewDrafts, setInterviewDrafts] = useState<Record<number, InterviewDraft>>({});
  const [interviewOpen, setInterviewOpen] = useState<Record<number, boolean>>({});
  const [interviewBusyId, setInterviewBusyId] = useState<number | null>(null);
  const [closeAt, setCloseAt] = useState<string | null>(null);
  const [closeDraft, setCloseDraft] = useState('');
  const [closeBusy, setCloseBusy] = useState(false);
  const [requests, setRequests] = useState<RecruitPositionRequest[]>([]);
  const [requestFilter, setRequestFilter] = useState('all');
  const [requestBusyId, setRequestBusyId] = useState<number | null>(null);

  const load = useCallback(async (posFilter: string, stFilter: string, reqFilter: string) => {
    setLoading(true);
    try {
      const [statData, posData, appData, closeData, reqData] = await Promise.all([
        adminRecruitStats(),
        adminListPositions(),
        adminListApplications(posFilter === 'all' ? null : Number(posFilter), stFilter),
        // 关闭时间读不到也不影响列表，按未设置处理。
        getRecruitCloseAt().catch(() => null),
        adminListPositionRequests(reqFilter),
      ]);
      setStats(statData);
      setPositions(posData);
      setApplications(appData);
      setCloseAt(closeData);
      setCloseDraft(toDateTimeLocal(closeData));
      setRequests(reqData);
      setErr('');
    } catch (e) {
      setErr('读取失败：' + (e instanceof Error ? e.message : '请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(positionFilter, statusFilter, requestFilter); }, [load, positionFilter, statusFilter, requestFilter]);

  const pendingCount = stats?.pending ?? 0;

  const fullPositions = useMemo(
    () => positions.filter(p => p.is_open && (p.approved_count + (p.holder_names ?? []).length) >= p.quota),
    [positions],
  );

  const pendingVisible = useMemo(
    () => applications.filter(a => a.status === 'pending'),
    [applications],
  );

  const positionOptions = useMemo(
    () => [
      { value: 'all', label: '全部职位' },
      ...positions.map(p => ({ value: String(p.id), label: `${p.title}（${p.department}）` })),
    ],
    [positions],
  );

  function openInterviewEditor(app: RecruitApplication) {
    setInterviewDrafts(prev => prev[app.id] ? prev : {
      ...prev,
      [app.id]: { at: toDateTimeLocal(app.interview_at), note: app.interview_note ?? '' },
    });
    setInterviewOpen(prev => ({ ...prev, [app.id]: !(prev[app.id] ?? false) }));
  }

  function setInterviewDraft(id: number, patch: Partial<InterviewDraft>) {
    setInterviewDrafts(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? { at: '', note: '' }), ...patch },
    }));
  }

  async function handleReview(app: RecruitApplication, status: 'approved' | 'rejected') {
    if (busyId !== null) return;
    let note = '';
    const draft = interviewDrafts[app.id];
    const interviewAt = status === 'approved' && draft?.at ? new Date(draft.at).toISOString() : null;
    const interviewNote = status === 'approved' ? (draft?.note ?? '').trim() : '';
    if (status === 'approved') {
      const ok = await confirmDialog(
        `通过「${app.name}」应聘「${app.position_title}」？\n通过后会发录用通知邮件到 ${app.qq_email}。` +
        (interviewAt ? `\n面试时间：${formatDateTime(interviewAt)}${interviewNote ? `（${interviewNote}）` : ''}，也会写进录用通知里。` : ''),
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
      const result = await adminReviewApplication(app.id, status, note, interviewAt, interviewNote);
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
      await load(positionFilter, statusFilter, requestFilter);
    } catch (e) {
      setMsg(describeReviewError(e instanceof Error ? e.message : ''));
    } finally {
      setBusyId(null);
    }
  }

  async function handleBatchReview(status: 'approved' | 'rejected') {
    if (batchBusy || selectedIds.length === 0) return;
    let note = '';
    if (status === 'approved') {
      const ok = await confirmDialog(
        `通过选中的 ${selectedIds.length} 份申请？\n通过后会逐份发送录用通知邮件。名额满了的职位会自动跳过，不会超员。`,
        { confirmText: '批量通过' },
      );
      if (!ok) return;
    } else {
      const input = await promptDialog('批量驳回备注（可选，只记在后台）', {
        placeholder: '例如：经验与岗位要求不符',
        confirmText: '确认批量驳回',
      });
      if (input === null) return;
      note = input.trim();
    }
    setBatchBusy(true);
    setMsg('');
    try {
      const result = await adminReviewApplicationsBatch(selectedIds, status, note);
      let mailOk = 0;
      let mailFail = 0;
      if (status === 'approved') {
        const doneIds = result.results.filter(r => r.result === 'done').map(r => r.id);
        for (const appId of doneIds) {
          const sent = await sendRecruitEmail(appId, 'offer');
          if (sent.ok) mailOk += 1; else mailFail += 1;
        }
      }
      const parts = [`已处理 ${result.processed} 份${result.skipped > 0 ? `，跳过 ${result.skipped} 份` : ''}${result.stopped_full ? '（有职位已满员）' : ''}。`];
      if (status === 'approved') {
        parts.push(`录用邮件已发 ${mailOk} 封${mailFail > 0 ? `，${mailFail} 封发送失败，可在列表里重发` : ''}。`);
      }
      setMsg(parts.join(''));
      void alog('recruit_batch_review', {
        count: selectedIds.length, status,
        processed: result.processed, skipped: result.skipped,
      });
      setSelectedIds([]);
      await load(positionFilter, statusFilter, requestFilter);
    } catch (e) {
      setMsg(describeBatchReviewError(e instanceof Error ? e.message : ''));
    } finally {
      setBatchBusy(false);
    }
  }

  async function handleSaveInterview(app: RecruitApplication, override?: InterviewDraft) {
    const draft = override ?? interviewDrafts[app.id];
    if (!draft || interviewBusyId !== null) return;
    setInterviewBusyId(app.id);
    try {
      const at = draft.at ? new Date(draft.at).toISOString() : null;
      await adminSetRecruitInterview(app.id, at, draft.note.trim());
      void alog('recruit_interview', { application_id: app.id, name: app.name, interview_at: at });
      setMsg(at
        ? '面试时间已保存。如需把面试时间发给对方，可点“重发录用邮件”。'
        : '面试时间已清除。');
      setInterviewOpen(prev => ({ ...prev, [app.id]: false }));
      await load(positionFilter, statusFilter, requestFilter);
    } catch (e) {
      setMsg(describeInterviewError(e instanceof Error ? e.message : ''));
    } finally {
      setInterviewBusyId(null);
    }
  }

  async function handleSaveCloseAt() {
    if (closeBusy) return;
    if (!closeDraft) { setMsg('请先选择关闭时间。'); return; }
    const at = new Date(closeDraft);
    if (Number.isNaN(at.getTime())) { setMsg('关闭时间格式不对，请重新选择。'); return; }
    setCloseBusy(true);
    try {
      const saved = await adminSetRecruitCloseAt(at.toISOString());
      void alog('recruit_close_at', { close_at: saved });
      setCloseAt(saved);
      setCloseDraft(toDateTimeLocal(saved));
      setMsg(`关闭时间已保存：${formatDateTime(saved)}（北京时间）。到了时间，招聘板块自动关闭，不再接受新申请。`);
    } catch (e) {
      setMsg(describeCloseAtError(e instanceof Error ? e.message : ''));
    } finally {
      setCloseBusy(false);
    }
  }

  async function handleClearCloseAt() {
    if (closeBusy) return;
    const ok = await confirmDialog('清除关闭时间，重新开放招聘？', { confirmText: '重新开放' });
    if (!ok) return;
    setCloseBusy(true);
    try {
      await adminSetRecruitCloseAt(null);
      void alog('recruit_close_at', { close_at: null });
      setCloseAt(null);
      setCloseDraft('');
      setMsg('关闭时间已清除，招聘已重新开放。');
    } catch (e) {
      setMsg(describeCloseAtError(e instanceof Error ? e.message : ''));
    } finally {
      setCloseBusy(false);
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
        await load(positionFilter, statusFilter, requestFilter);
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
    const holderNames = parseHolderNames(form.holders);
    if (holderNames.some(n => n.length > 20)) { setMsg('任职人名字不能超过 20 个字。'); return; }
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
        holderNames,
      });
      void alog('recruit_position_save', { position_id: id, title: form.title.trim(), quota });
      setMsg(form.id === null ? '职位已新增。' : '职位已保存。');
      setForm(null);
      await load(positionFilter, statusFilter, requestFilter);
    } catch (e) {
      setMsg(describeUpsertPositionError(e instanceof Error ? e.message : ''));
    } finally {
      setSaving(false);
    }
  }

  async function handleReviewRequest(req: RecruitPositionRequest, status: 'approved' | 'rejected') {
    if (requestBusyId !== null) return;
    let note = '';
    if (status === 'approved') {
      const ok = await confirmDialog(
        `通过「${req.title}」的新增岗位申请？\n通过后会在职位列表里新增「${req.title}」这个职位，名额 1 人，开放招聘。`,
        { confirmText: '通过并新增职位' },
      );
      if (!ok) return;
    } else {
      const input = await promptDialog('驳回备注（可选，只记在后台，不会通知申请人）', {
        placeholder: '例如：已有相同职位',
        confirmText: '确认驳回',
      });
      if (input === null) return;
      note = input.trim();
    }
    setRequestBusyId(req.id);
    setMsg('');
    try {
      const result = await adminReviewPositionRequest(req.id, status, note);
      void alog('recruit_position_request_review', { request_id: req.id, title: result.title, status });
      setMsg(status === 'approved'
        ? `已通过「${result.title}」的新增岗位申请，职位已加到列表里（名额 1 人）。`
        : `已驳回「${result.title}」的新增岗位申请。`);
      await load(positionFilter, statusFilter, requestFilter);
    } catch (e) {
      setMsg(describePositionRequestReviewError(e instanceof Error ? e.message : ''));
    } finally {
      setRequestBusyId(null);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  }

  function toggleSelectAllPending() {
    const ids = pendingVisible.map(a => a.id);
    setSelectedIds(prev => (ids.length > 0 && ids.every(id => prev.includes(id)) ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
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
        {fullPositions.length > 0 && (
          <div style={fullBannerStyle}>
            以下职位已招满，前台已显示“已满”，不能再报名：{fullPositions.map(p => p.title).join('、')}。
          </div>
        )}
        <div style={rowBtn}>
          <button type="button" style={btnStyle} onClick={() => { setMsg(''); void load(positionFilter, statusFilter, requestFilter); }}>刷新</button>
          <button type="button" style={primaryBtnStyle} onClick={() => setForm({ ...EMPTY_FORM })}>新增职位</button>
        </div>
      </div>

      <div style={card}>
        <h3 style={h3}>关闭时间</h3>
        <p style={mut}>
          {closeAt
            ? isRecruitClosed(closeAt)
              ? `当前：已结束（关闭时间 ${formatDateTime(closeAt)}，北京时间），前台不再接受新申请。`
              : `当前：将于 ${formatDateTime(closeAt)}（北京时间）截止报名，前台正在显示截止时间。`
            : '当前：未设置关闭时间，正常开放招聘。'}
        </p>
        <div style={fieldStyle}>
          <label style={labelStyle}>关闭时间</label>
          <DateTimeField
            value={closeDraft}
            onChange={setCloseDraft}
            mode="datetime"
            placeholder="选择关闭日期和时间"
          />
        </div>
        <p style={mut}>到了关闭时间，招聘板块自动关闭，不再接受新申请；已提交的申请照常审核，进度查询不受影响。</p>
        <div style={rowBtn}>
          <button type="button" style={primaryBtnStyle} disabled={closeBusy} onClick={() => void handleSaveCloseAt()}>
            {closeBusy ? '保存中…' : '保存关闭时间'}
          </button>
          {closeAt && (
            <button type="button" style={dangerBtnStyle} disabled={closeBusy} onClick={() => void handleClearCloseAt()}>
              清除（重新开放）
            </button>
          )}
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
          <div style={fieldStyle}>
            <label style={labelStyle} htmlFor="rc-holders">任职人（已入职人员）</label>
            <input id="rc-holders" style={inputStyle} value={form.holders} maxLength={500} onChange={e => setForm({ ...form, holders: e.target.value })} placeholder="例如：王瑞、李柯，多个名字用顿号隔开" />
            <p style={{ ...mut, margin: '4px 0 0' }}>任职人会算进已占名额：名额占满后前台显示“已满员”，不能再报名；留空表示暂无任职人员。</p>
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
          const holders = p.holder_names ?? [];
          const occupied = p.approved_count + holders.length;
          const remaining = Math.max(0, p.quota - occupied);
          const rate = p.total_count > 0 ? `${Math.round((p.approved_count / p.total_count) * 100)}%` : '—';
          return (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13.5, lineHeight: 2, flexWrap: 'wrap' }}>
              <span>
                <b>{p.title}</b>（{p.department}）· {salaryText(p)} · 名额 {p.quota} · 已招 {occupied}{holders.length > 0 ? `（通过 ${p.approved_count} + 任职 ${holders.length}）` : ''} · 待审 {p.pending_count} · 收到 {p.total_count} 份 · 通过率 {rate}
                {holders.length > 0 ? ` · 任职：${holders.join('、')}` : ''}
                {p.is_open ? (remaining === 0 ? ' · 已满' : ` · 还剩 ${remaining}`) : ' · 已关闭'}
              </span>
              <button type="button" style={btnStyle} onClick={() => setForm(toForm(p))}>编辑</button>
            </div>
          );
        })}
      </div>

      <div style={card}>
        <h3 style={h3}>新增岗位申请</h3>
        <p style={mut}>访客在招聘页“申请新增岗位”提交的都在这里审核。通过后自动在职位列表里新增该职位（名额 1 人，开放招聘）；驳回只记在后台，不通知申请人。</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <OptionSheet title="选择状态" value={requestFilter}
            options={[
              { value: 'all', label: '全部状态' },
              { value: 'pending', label: '待审核' },
              { value: 'approved', label: '已通过' },
              { value: 'rejected', label: '未通过' },
            ]}
            onChange={setRequestFilter}
            buttonText={requestFilter === 'all' ? '全部状态' : POSITION_REQUEST_STATUS_LABEL[requestFilter as 'pending' | 'approved' | 'rejected']} />
        </div>
        {requests.length === 0 ? (
          <p style={mut}>没有符合条件的申请。</p>
        ) : requests.map(req => (
          <div key={req.id} style={{ borderTop: '1px solid #eef2f7', padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
              <span><b>{req.title}</b> · {req.department} · {salaryText(req)} · {req.qq_email}</span>
              <span style={{ fontSize: 13, color: req.status === 'approved' ? '#23845b' : req.status === 'rejected' ? '#737b86' : '#a96f19' }}>
                {POSITION_REQUEST_STATUS_LABEL[req.status]}{req.reviewed_at ? ` · ${formatDate(req.reviewed_at)}` : ''}
              </span>
            </div>
            {req.description ? <p style={{ ...mut, margin: '6px 0 0' }}>岗位描述：{req.description}</p> : null}
            {req.admin_note ? <p style={{ ...mut, margin: '4px 0 0' }}>备注：{req.admin_note}</p> : null}
            <p style={{ ...mut, margin: '4px 0 0' }}>
              申请于 {formatDate(req.created_at)}
              {req.status === 'approved' && req.created_position_id !== null ? (
                <> · 已加上：<a href={`https://qianzhi.pw/#/jobs/${req.created_position_id}`} target="_blank" rel="noreferrer">在前台查看这个职位</a></>
              ) : null}
            </p>
            {req.status === 'pending' && (
              <div style={rowBtn}>
                <button type="button" style={primaryBtnStyle} disabled={requestBusyId === req.id} onClick={() => void handleReviewRequest(req, 'approved')}>
                  {requestBusyId === req.id ? '处理中…' : '通过并新增职位'}
                </button>
                <button type="button" style={dangerBtnStyle} disabled={requestBusyId === req.id} onClick={() => void handleReviewRequest(req, 'rejected')}>
                  驳回
                </button>
              </div>
            )}
          </div>
        ))}
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
        {pendingVisible.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={pendingVisible.length > 0 && pendingVisible.every(a => selectedIds.includes(a.id))}
              onChange={() => toggleSelectAllPending()}
            />
            全选待审核（{pendingVisible.length} 份）
          </label>
        )}
        {selectedIds.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, padding: '10px 12px', background: '#fdf6e7', border: '1px solid #f0dfae', borderRadius: 12, fontSize: 13.5 }}>
            <span>已选 <b>{selectedIds.length}</b> 份</span>
            <button type="button" style={primaryBtnStyle} disabled={batchBusy} onClick={() => void handleBatchReview('approved')}>
              {batchBusy ? '处理中…' : '批量通过'}
            </button>
            <button type="button" style={dangerBtnStyle} disabled={batchBusy} onClick={() => void handleBatchReview('rejected')}>
              批量驳回
            </button>
            <button type="button" style={btnStyle} onClick={() => setSelectedIds([])}>取消选择</button>
          </div>
        )}
        {applications.length === 0 ? (
          <p style={mut}>没有符合条件的申请。</p>
        ) : applications.map(app => {
          const draft = interviewDrafts[app.id] ?? { at: toDateTimeLocal(app.interview_at), note: app.interview_note ?? '' };
          const interviewEditorOpen = interviewOpen[app.id] ?? false;
          return (
            <div key={app.id} style={{ borderTop: '1px solid #eef2f7', padding: '12px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {app.status === 'pending' && (
                    <input
                      type="checkbox"
                      aria-label={`选择${app.name}的申请`}
                      checked={selectedIds.includes(app.id)}
                      onChange={() => toggleSelect(app.id)}
                      style={{ marginTop: 3 }}
                    />
                  )}
                  <span><b>{app.name}</b> · {app.position_title} · {app.qq_email}{app.phone ? ` · ${app.phone}` : ''}</span>
                </span>
                <span style={{ fontSize: 13, color: app.status === 'approved' ? '#23845b' : app.status === 'rejected' ? '#737b86' : '#a96f19' }}>
                  {STATUS_LABEL[app.status]}{app.reviewed_at ? ` · ${formatDate(app.reviewed_at)}` : ''}{app.email_status === 'sent' ? ' · 邮件已发' : app.email_status === 'failed' ? ' · 邮件发送失败' : ''}
                </span>
              </div>
              {app.intro ? <p style={{ ...mut, margin: '6px 0 0' }}>自我介绍：{app.intro}</p> : null}
              {app.experience ? <p style={{ ...mut, margin: '4px 0 0' }}>工作经历：{app.experience}</p> : null}
              {app.admin_note ? <p style={{ ...mut, margin: '4px 0 0' }}>备注：{app.admin_note}</p> : null}
              <p style={{ ...mut, margin: '4px 0 0' }}>申请于 {formatDate(app.created_at)}</p>
              {app.status === 'approved' && (
                <p style={{ ...mut, margin: '4px 0 0' }}>
                  {app.interview_at
                    ? <>面试时间：{formatDateTime(app.interview_at)}{app.interview_note ? `（${app.interview_note}）` : ''}</>
                    : '尚未安排面试。'}
                </p>
              )}
              {app.status !== 'rejected' && (
                <div style={{ marginTop: 8 }}>
                  <button type="button" style={btnStyle} onClick={() => openInterviewEditor(app)}>
                    {app.status === 'approved'
                      ? (interviewEditorOpen ? '收起面试设置' : '修改面试时间')
                      : (interviewEditorOpen ? '收起面试设置' : '设置面试时间（通过时一并保存）')}
                  </button>
                  {interviewEditorOpen && (
                    <div style={{ marginTop: 8 }}>
                      <label style={labelStyle}>面试时间</label>
                      <DateTimeField
                        value={draft.at}
                        onChange={v => setInterviewDraft(app.id, { at: v })}
                        mode="datetime"
                        placeholder="选择面试日期和时间"
                      />
                      <div style={fieldStyle}>
                        <label style={labelStyle} htmlFor={`rc-iv-note-${app.id}`}>面试说明（可选）</label>
                        <input
                          id={`rc-iv-note-${app.id}`}
                          style={inputStyle}
                          value={draft.note}
                          maxLength={500}
                          onChange={e => setInterviewDraft(app.id, { note: e.target.value })}
                          placeholder="例如：带身份证到公司前台"
                        />
                      </div>
                      {app.status === 'approved' && (
                        <div style={rowBtn}>
                          <button
                            type="button"
                            style={primaryBtnStyle}
                            disabled={interviewBusyId === app.id}
                            onClick={() => void handleSaveInterview(app)}
                          >
                            {interviewBusyId === app.id ? '保存中…' : '保存面试时间'}
                          </button>
                          {app.interview_at && (
                            <button
                              type="button"
                              style={dangerBtnStyle}
                              disabled={interviewBusyId === app.id}
                              onClick={() => {
                                const cleared: InterviewDraft = { at: '', note: '' };
                                setInterviewDraft(app.id, cleared);
                                void handleSaveInterview(app, cleared);
                              }}
                            >
                              清除面试时间
                            </button>
                          )}
                        </div>
                      )}
                      {app.status === 'pending' && (
                        <p style={{ ...mut, margin: '4px 0 0' }}>面试时间会在点“通过”时一并保存，并写进录用通知邮件里。</p>
                      )}
                    </div>
                  )}
                </div>
              )}
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
          );
        })}
      </div>
    </div>
  );
}
