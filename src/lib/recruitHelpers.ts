// 招聘纯函数：不依赖 supabase / window，可在 node 单测环境里跑。
// recruit.ts 会 re-export 它们，页面照旧从 ../lib/recruit 引用。

// ---------- 日期 ----------

/** 带时间的日期，如“2026年11月30日 14:30”，供面试时间显示。 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- 招聘关闭时间 ----------

/** 关闭时间到了没有：没设 / 非法值都算未关闭。 */
export function isRecruitClosed(closeAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!closeAt) return false;
  const d = new Date(closeAt);
  if (Number.isNaN(d.getTime())) return false;
  return now.getTime() >= d.getTime();
}

/** 报名截止时间，如“12月1日 14:30”，按北京时间显示（服务器与用户都在东八区口径）。 */
export function formatCloseDeadline(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')}月${get('day')}日 ${get('hour')}:${get('minute')}`;
}

// ---------- 收藏（只存本机 localStorage，不用登录、不用建表） ----------

const FAVORITE_KEY = 'rj_fav_positions_v1';

type FavoriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

function favoriteStorage(storage?: FavoriteStorage | null): FavoriteStorage | null {
  if (storage) return storage;
  try {
    const ls = (globalThis as unknown as { localStorage?: FavoriteStorage }).localStorage;
    return ls ?? null;
  } catch {
    return null;
  }
}

export function loadFavoritePositionIds(storage?: FavoriteStorage | null): number[] {
  const store = favoriteStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(FAVORITE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
  } catch {
    return [];
  }
}

export function isFavoritePositionId(id: number, storage?: FavoriteStorage | null): boolean {
  return loadFavoritePositionIds(storage).includes(id);
}

/** 切换收藏，返回切换后是否已收藏。 */
export function toggleFavoritePositionId(id: number, storage?: FavoriteStorage | null): boolean {
  const store = favoriteStorage(storage);
  const current = loadFavoritePositionIds(store);
  const next = current.includes(id) ? current.filter(v => v !== id) : [...current, id];
  try {
    store?.setItem(FAVORITE_KEY, JSON.stringify(next));
  } catch {
    // 本机存不下也不影响浏览，只是不记收藏。
  }
  return next.includes(id);
}

// ---------- 进度时间线 ----------

export interface TimelineStep {
  key: string;
  label: string;
  time: string | null;
  state: 'done' | 'current' | 'todo' | 'bad';
  note?: string;
}

export interface TimelineApplicationInput {
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  admin_note: string;
  interview_at: string | null;
  interview_note: string;
}

/** 把一条申请转成时间线：已提交 → 审核中/通过/未通过 → 面试安排（有才显示）。 */
export function applicationTimelineSteps(app: TimelineApplicationInput): TimelineStep[] {
  const steps: TimelineStep[] = [
    { key: 'submitted', label: '已提交申请', time: app.created_at, state: 'done' },
  ];
  if (app.status === 'pending') {
    steps.push({ key: 'reviewing', label: '审核中', time: null, state: 'current' });
    steps.push({ key: 'result', label: '等待审核结果', time: null, state: 'todo' });
  } else if (app.status === 'approved') {
    steps.push({ key: 'reviewing', label: '审核通过', time: app.reviewed_at, state: 'done' });
    if (app.interview_at) {
      steps.push({
        key: 'interview',
        label: '面试安排',
        time: app.interview_at,
        state: 'done',
        note: app.interview_note || undefined,
      });
    }
  } else {
    steps.push({
      key: 'reviewing',
      label: '未通过',
      time: app.reviewed_at,
      state: 'bad',
      note: app.admin_note || undefined,
    });
  }
  return steps;
}

// ---------- 部门配色 ----------

/** 部门配色：按部门名稳定取一个暖色，用于卡片上的部门圆点。 */
const DEPARTMENT_COLORS = ['#b0404f', '#a96f19', '#23845b', '#4776b8', '#7a5ea8', '#c47a3a'];

export function departmentColor(department: string): string {
  let hash = 0;
  for (let i = 0; i < department.length; i++) {
    hash = (hash * 31 + department.charCodeAt(i)) >>> 0;
  }
  return DEPARTMENT_COLORS[hash % DEPARTMENT_COLORS.length];
}
