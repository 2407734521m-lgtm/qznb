import { supabase } from './supabase';

// 审核预计时间：数据来自 my_review_estimates()——只返回本人待审条目的排队聚合数字
// （前方条数/队列总数/是否有管理员近5分钟活跃），不含任何他人信息。
// 函数未部署或调用失败时返回 null，界面保持原样、不显示预计行。

export type ReviewEstimateItem = {
  kind: string;
  id: string;
  created_at: string;
  ahead: number;
  total: number;
};

export type ReviewEstimates = {
  adminActive: boolean;
  byId: Map<string, ReviewEstimateItem>;
  game: ReviewEstimateItem | null;
};

export async function fetchReviewEstimates(): Promise<ReviewEstimates | null> {
  try {
    const { data, error } = await supabase.rpc('my_review_estimates');
    if (error || !data) return null;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
    const payload = data as Record<string, unknown>;
    const byId = new Map<string, ReviewEstimateItem>();
    let game: ReviewEstimateItem | null = null;
    const items = Array.isArray(payload.items) ? payload.items : [];
    for (const value of items) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
      const item = value as Record<string, unknown>;
      if (typeof item.kind !== 'string' || typeof item.id !== 'string'
        || typeof item.created_at !== 'string' || typeof item.ahead !== 'number'
        || typeof item.total !== 'number') continue;
      const estimate: ReviewEstimateItem = {
        kind: item.kind, id: item.id, created_at: item.created_at,
        ahead: item.ahead, total: item.total,
      };
      byId.set(estimate.id, estimate);
      if (estimate.kind === 'game') game = estimate;
    }
    return { adminActive: payload.admin_active === true, byId, game };
  } catch {
    return null;
  }
}

// 预计文案只给范围、不承诺具体时刻：管理员在线时按前方条数分档，不在线时给兜底说法。
export function estimateText(item: ReviewEstimateItem, adminActive: boolean): string {
  const pos = item.ahead + 1;
  if (!adminActive) return `排队第 ${pos} 位 · 管理员暂时不在线，预计今晚睡前处理`;
  if (item.ahead <= 2) return `排队第 ${pos} 位 · 预计 10 分钟左右审核`;
  if (item.ahead <= 5) return `排队第 ${pos} 位 · 预计 30 分钟左右审核`;
  return `排队第 ${pos} 位 · 预计 1 小时左右审核`;
}
