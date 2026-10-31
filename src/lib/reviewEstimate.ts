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
    const byId = new Map<string, ReviewEstimateItem>();
    let game: ReviewEstimateItem | null = null;
    for (const it of data.items || []) {
      byId.set(it.id, it);
      if (it.kind === 'game') game = it;
    }
    return { adminActive: !!data.admin_active, byId, game };
  } catch {
    return null;
  }
}

// 预计文案只给范围、不承诺具体时刻：管理员在线时按前方条数分档，不在线时给兜底说法。
export function estimateText(item: ReviewEstimateItem, adminActive: boolean): string {
  const pos = item.ahead + 1;
  if (!adminActive) return `排队第 ${pos} 位 · 管理员暂时不在线，预计今晚睡前处理`;
  if (item.ahead <= 1) return `排队第 ${pos} 位 · 预计 10 分钟左右审核`;
  if (item.ahead <= 4) return `排队第 ${pos} 位 · 预计 30 分钟左右审核`;
  return `排队第 ${pos} 位 · 预计 1 小时左右审核`;
}
