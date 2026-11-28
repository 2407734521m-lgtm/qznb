import { supabase } from './supabase';

// 纯函数（日期、收藏、时间线、部门配色）放在 recruitHelpers 里，不依赖 supabase，
// 这样 node 单测环境也能跑；这里 re-export，页面照旧从本文件引用。
export {
  applicationTimelineSteps,
  departmentColor,
  FILLED_POSITIONS,
  filledHolders,
  formatCloseDeadline,
  formatDateTime,
  isFavoritePositionId,
  isRecruitClosed,
  loadFavoritePositionIds,
  parseSalaryRange,
  toggleFavoritePositionId,
} from './recruitHelpers';
export type { ParsedSalaryRange, TimelineApplicationInput, TimelineStep } from './recruitHelpers';

export const RECRUIT_COMPANY = '瑞氏集团有限公司';

// 新表不在生成的 Database 类型里，与站内已有新表的做法一致，用 any 调用。
const db = supabase as any;

export interface RecruitPosition {
  id: number;
  created_at: string;
  title: string;
  department: string;
  quota: number;
  salary_min: number | null;
  salary_max: number | null;
  description: string;
  requirements: string;
  is_open: boolean;
  sort_order: number;
}

export interface RecruitPositionAdmin extends RecruitPosition {
  approved_count: number;
  pending_count: number;
  total_count: number;
}

export interface RecruitApplication {
  id: number;
  created_at: string;
  position_id: number;
  position_title: string;
  name: string;
  qq_email: string;
  phone: string;
  intro: string;
  experience: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string;
  reviewed_at: string | null;
  email_sent_at: string | null;
  email_status: string;
  interview_at: string | null;
  interview_note: string;
}

export interface RecruitMyApplication {
  id: number;
  position_id: number;
  position_title: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  admin_note: string;
  interview_at: string | null;
  interview_note: string;
}

export interface RecruitStats {
  total_positions: number;
  open_positions: number;
  total_applications: number;
  pending: number;
  approved: number;
  rejected: number;
  by_position: {
    position_id: number;
    title: string;
    quota: number;
    approved: number;
    pending: number;
    total: number;
  }[];
}

export const QQ_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const STATUS_LABEL: Record<RecruitApplication['status'], string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
};

export function salaryText(p: Pick<RecruitPosition, 'salary_min' | 'salary_max'>): string {
  if (p.salary_min == null && p.salary_max == null) return '面议';
  if (p.salary_min != null && p.salary_max != null) return `${p.salary_min}–${p.salary_max}元/月`;
  if (p.salary_min != null) return `${p.salary_min}元/月起`;
  return `最高${p.salary_max}元/月`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 公开职位列表（只读开放中的职位）。 */
export async function listOpenPositions(): Promise<RecruitPosition[]> {
  const { data, error } = await db
    .from('recruit_positions')
    .select('id,created_at,title,department,quota,salary_min,salary_max,description,requirements,is_open,sort_order')
    .eq('is_open', true)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecruitPosition[];
}

/** 各职位已通过（已招）人数。 */
export async function getPositionCounts(): Promise<Record<number, number>> {
  const { data, error } = await db.rpc('recruit_position_counts');
  if (error) throw new Error(error.message);
  const map: Record<number, number> = {};
  for (const row of (data ?? []) as { position_id: number; approved_count: number }[]) {
    map[row.position_id] = Number(row.approved_count || 0);
  }
  return map;
}

export async function getOpenPosition(id: number): Promise<RecruitPosition | null> {
  const { data, error } = await db
    .from('recruit_positions')
    .select('id,created_at,title,department,quota,salary_min,salary_max,description,requirements,is_open,sort_order')
    .eq('id', id)
    .eq('is_open', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as RecruitPosition | null;
}

export interface SubmitApplicationInput {
  positionId: number;
  name: string;
  qqEmail: string;
  phone: string;
  intro: string;
  experience: string;
}

export interface SubmitApplicationResult {
  ok: boolean;
  id?: number;
  reason?: string;
  avatarCheck?: 'ok' | 'missing' | 'unavailable';
  confirmationEmailSent?: boolean;
}

/**
 * 提交申请：走服务端 recruit-apply 函数，先校验 QQ 有没有头像。
 * 没头像直接拒绝并返回原因；名额与重复投递校验仍在 submit_recruit_application RPC 里。
 */
export async function submitApplicationChecked(input: SubmitApplicationInput): Promise<SubmitApplicationResult> {
  const { data, error } = await supabase.functions.invoke('recruit-apply', {
    body: {
      positionId: input.positionId,
      name: input.name,
      qqEmail: input.qqEmail,
      phone: input.phone,
      intro: input.intro,
      experience: input.experience,
    },
  });
  if (error) throw new Error(error.message);
  return data as SubmitApplicationResult;
}

export function describeSubmitError(message: string): string {
  if (message.includes('position full')) return '这个职位已经招满了，暂时不能再报名。';
  if (message.includes('position closed')) return '这个职位已经关闭报名了。';
  if (message.includes('recruit closed')) return '招聘已结束，不能再报名。';
  if (message.includes('already applied')) return '这个 QQ 邮箱已经投过这个职位了，请等待审核结果。';
  if (message.includes('bad email')) return 'QQ 邮箱格式不对，请检查一下。';
  if (message.includes('bad name')) return '请填写姓名（20 字以内）。';
  return '提交失败，请稍后重试。';
}

/** recruit-apply 返回的原因：RPC 原样错误走上面的映射，没头像那句中文直接显示。 */
export function describeApplyResultError(reason: string): string {
  if (!reason) return '提交失败，请稍后重试。';
  if (
    reason.includes('position full') ||
    reason.includes('position closed') ||
    reason.includes('recruit closed') ||
    reason.includes('already applied') ||
    reason.includes('bad email') ||
    reason.includes('bad name')
  ) {
    return describeSubmitError(reason);
  }
  return reason;
}

/** 公开读招聘关闭时间：没设返回 null。 */
export async function getRecruitCloseAt(): Promise<string | null> {
  const { data, error } = await db.rpc('public_recruit_close_at');
  if (error) throw new Error(error.message);
  return (data ?? null) as string | null;
}

/** 管理端：设定 / 清除招聘关闭时间（传 null 清除、重新开放）。返回设定后的值。 */
export async function adminSetRecruitCloseAt(closeAt: string | null): Promise<string | null> {
  const { data, error } = await db.rpc('admin_set_recruit_close_at', {
    p_close_at: closeAt,
  });
  if (error) throw new Error(error.message);
  return (data ?? null) as string | null;
}

export function describeCloseAtError(message: string): string {
  if (message.includes('forbidden')) return '需要超级管理员权限。';
  return '保存关闭时间失败，请稍后重试。';
}

/** 凭 QQ 邮箱查自己的申请进度。 */
export async function myApplications(qqEmail: string): Promise<RecruitMyApplication[]> {
  const { data, error } = await db.rpc('recruit_my_applications', { p_qq_email: qqEmail });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecruitMyApplication[];
}

/** 管理端：统计。 */
export async function adminRecruitStats(): Promise<RecruitStats> {
  const { data, error } = await db.rpc('admin_recruit_stats');
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as RecruitStats;
}

/** 管理端：全部职位（含关闭的）与各状态人数。 */
export async function adminListPositions(): Promise<RecruitPositionAdmin[]> {
  const { data, error } = await db.rpc('admin_list_recruit_positions');
  if (error) throw new Error(error.message);
  return (data ?? []) as RecruitPositionAdmin[];
}

export interface UpsertPositionInput {
  id: number | null;
  title: string;
  department: string;
  quota: number;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  requirements: string;
  isOpen: boolean;
  sortOrder: number;
}

/** 管理端：新增 / 编辑职位。 */
export async function adminUpsertPosition(input: UpsertPositionInput): Promise<number> {
  const { data, error } = await db.rpc('admin_upsert_recruit_position', {
    p_id: input.id,
    p_title: input.title,
    p_department: input.department,
    p_quota: input.quota,
    p_salary_min: input.salaryMin,
    p_salary_max: input.salaryMax,
    p_description: input.description,
    p_requirements: input.requirements,
    p_is_open: input.isOpen,
    p_sort_order: input.sortOrder,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

/** 管理端：申请列表。 */
export async function adminListApplications(
  positionId: number | null,
  status: string,
): Promise<RecruitApplication[]> {
  const { data, error } = await db.rpc('admin_list_recruit_applications', {
    p_position_id: positionId,
    p_status: status === 'all' ? null : status,
    p_limit: 100,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecruitApplication[];
}

export interface ReviewResult {
  id: number;
  position_id: number;
  position_title: string;
  name: string;
  qq_email: string;
  status: 'approved' | 'rejected';
}

/** 管理端：审核通过 / 驳回。满员时服务端拒绝通过。通过时可一并记面试时间与说明。 */
export async function adminReviewApplication(
  id: number,
  status: 'approved' | 'rejected',
  note: string,
  interviewAt: string | null = null,
  interviewNote = '',
): Promise<ReviewResult> {
  const { data, error } = await db.rpc('admin_review_recruit_application', {
    p_id: id,
    p_status: status,
    p_note: note,
    p_interview_at: interviewAt,
    p_interview_note: interviewNote,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as ReviewResult;
}

export interface BatchReviewResult {
  processed: number;
  skipped: number;
  stopped_full: boolean;
  results: { id: number; result: 'done' | 'skipped' | 'full' }[];
}

/** 管理端：批量审核多份申请。名额满了的那份及之后同职位的份会被跳过，不超员。 */
export async function adminReviewApplicationsBatch(
  ids: number[],
  status: 'approved' | 'rejected',
  note: string,
): Promise<BatchReviewResult> {
  const { data, error } = await db.rpc('admin_review_recruit_applications_batch', {
    p_ids: ids,
    p_status: status,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  return data as BatchReviewResult;
}

export function describeBatchReviewError(message: string): string {
  if (message.includes('forbidden')) return '需要超级管理员权限。';
  if (message.includes('bad ids')) return '请选择要审核的申请。';
  if (message.includes('bad status')) return '审核状态不正确。';
  return '批量审核失败，请稍后重试。';
}

/** 管理端：通过后补填 / 修改面试时间（传 null 可清除）。 */
export async function adminSetRecruitInterview(
  id: number,
  interviewAt: string | null,
  interviewNote: string,
): Promise<{ id: number; interview_at: string | null; interview_note: string }> {
  const { data, error } = await db.rpc('admin_set_recruit_interview', {
    p_id: id,
    p_interview_at: interviewAt,
    p_interview_note: interviewNote,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { id: number; interview_at: string | null; interview_note: string };
}

export function describeInterviewError(message: string): string {
  if (message.includes('not approved')) return '只有已通过的申请才能安排面试。';
  if (message.includes('forbidden')) return '需要超级管理员权限。';
  return '保存面试时间失败，请稍后重试。';
}

export function describeReviewError(message: string): string {
  if (message.includes('position full')) return '这个职位已经招满了，无法再通过。';
  if (message.includes('already reviewed')) return '这条申请已经审核过了。';
  if (message.includes('forbidden')) return '需要超级管理员权限。';
  return '审核失败，请稍后重试。';
}

// ---------- 申请新增岗位 ----------

export type PositionRequestStatus = 'pending' | 'approved' | 'rejected';

export interface RecruitPositionRequest {
  id: number;
  created_at: string;
  title: string;
  department: string;
  salary_min: number | null;
  salary_max: number | null;
  description: string;
  qq_email: string;
  status: PositionRequestStatus;
  admin_note: string;
  reviewed_at: string | null;
  created_position_id: number | null;
}

export const POSITION_REQUEST_STATUS_LABEL: Record<PositionRequestStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
};

export interface SubmitPositionRequestInput {
  title: string;
  department: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  qqEmail: string;
}

/** 游客申请新增岗位：同名岗位已在招、或同名申请还在待审，服务端直接拒绝。 */
export async function submitPositionRequest(input: SubmitPositionRequestInput): Promise<number> {
  const { data, error } = await db.rpc('submit_recruit_position_request', {
    p_title: input.title,
    p_department: input.department,
    p_salary_min: input.salaryMin,
    p_salary_max: input.salaryMax,
    p_description: input.description,
    p_qq_email: input.qqEmail,
  });
  if (error) throw new Error(error.message);
  return data as number;
}

export function describePositionRequestError(message: string): string {
  if (message.includes('position exists')) return '这个岗位已经在招聘了，不用再申请。';
  if (message.includes('already requested')) return '这个岗位已经有人申请过了，正在审核中，请耐心等一下。';
  if (message.includes('bad email')) return 'QQ 邮箱格式不对，请检查一下。';
  if (message.includes('bad title')) return '请填写岗位名称（30 字以内）。';
  if (message.includes('bad department')) return '部门名称不对（20 字以内）。';
  if (message.includes('bad salary')) return '薪资范围格式不对，例如 6000–9000。';
  if (message.includes('bad text')) return '岗位描述太长了（2000 字以内）。';
  return '提交失败，请稍后重试。';
}

/** 管理端：新增岗位申请列表（status 传 'all' 查全部）。 */
export async function adminListPositionRequests(status: string): Promise<RecruitPositionRequest[]> {
  const { data, error } = await db.rpc('admin_list_recruit_position_requests', {
    p_status: status === 'all' ? null : status,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RecruitPositionRequest[];
}

export interface ReviewPositionRequestResult {
  id: number;
  title: string;
  status: PositionRequestStatus;
  created_position_id: number | null;
}

/** 管理端：审核新增岗位申请。通过时服务端自动新建该职位（名额 1 人）。 */
export async function adminReviewPositionRequest(
  id: number,
  status: 'approved' | 'rejected',
  note: string,
): Promise<ReviewPositionRequestResult> {
  const { data, error } = await db.rpc('admin_review_recruit_position_request', {
    p_id: id,
    p_status: status,
    p_note: note,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as ReviewPositionRequestResult;
}

export function describePositionRequestReviewError(message: string): string {
  if (message.includes('already reviewed')) return '这条申请已经审核过了。';
  if (message.includes('request not found')) return '这条申请找不到了。';
  if (message.includes('position exists')) return '这个岗位已经在职位列表里了。';
  if (message.includes('forbidden')) return '需要超级管理员权限。';
  return '审核失败，请稍后重试。';
}

/** 管理端：审核后发邮件（录用通知 / 婉拒）。 */
export async function sendRecruitEmail(
  applicationId: number,
  kind: 'offer' | 'rejection',
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('recruit-notify', {
    body: { applicationId, kind },
  });
  if (error) return { ok: false, error: error.message };
  if (data && typeof data === 'object' && 'error' in data) {
    return { ok: false, error: String((data as { error: unknown }).error) };
  }
  return { ok: true };
}

// ---------- 分享 ----------

/** 分享职位：优先调系统分享，不支持时复制链接。返回分享 / 已复制 / 失败。 */
export async function sharePosition(
  title: string,
  positionId: number,
): Promise<'shared' | 'copied' | 'failed'> {
  const url = `${window.location.origin}/#/jobs/${positionId}`;
  const text = `${RECRUIT_COMPANY}正在招聘「${title}」，来看看。`;
  try {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === 'function') {
      await nav.share({ title: `${RECRUIT_COMPANY}招聘：${title}`, text, url });
      return 'shared';
    }
  } catch {
    // 用户在系统分享里点了取消，也按失败处理，不报错。
    return 'failed';
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return 'copied';
    }
  } catch {
    // 走下面的兜底复制。
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return 'copied';
  } catch {
    return 'failed';
  }
}
