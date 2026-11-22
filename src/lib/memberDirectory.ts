import { supabase } from './supabase';
import type { MemberListItem } from '../types/profile';

/**
 * R1：普通成员直读他人 profiles 整行会被 RLS 静默过滤（p_sel 只放行本人/管理员），
 * 需要他人名字/头像时一律走 member_directory RPC，服务端按隐私开关裁剪字段，
 * 绝不放宽 p_sel（会暴露 real_name 等整行）。
 *
 * 注意：服务端是 limit least(lim, 50)，单页最多 50 条，这里按 skip 翻页直到找齐或取完。
 */
const DIRECTORY_PAGE_SIZE = 50;
const MAX_DIRECTORY_PAGES = 20;

async function fetchDirectoryPage(skip: number): Promise<MemberListItem[]> {
  const { data, error } = await supabase.rpc('member_directory', { q: '', lim: DIRECTORY_PAGE_SIZE, skip });
  if (error) {
    console.error('member_directory failed', error);
    return [];
  }
  return ((data ?? []) as MemberListItem[]);
}

/** 按 id 批量取成员公开资料；不在结果里的 id 表示对方不存在、未入班或隐私开关藏起了名字。 */
export async function fetchMembersByIds(ids: string[]): Promise<Record<string, MemberListItem>> {
  const wanted = new Set(ids.filter(Boolean));
  const found: Record<string, MemberListItem> = {};
  if (!wanted.size) return found;
  for (let page = 0; page < MAX_DIRECTORY_PAGES; page++) {
    const rows = await fetchDirectoryPage(page * DIRECTORY_PAGE_SIZE);
    rows.forEach(row => { if (wanted.has(row.id)) found[row.id] = row; });
    if (Object.keys(found).length >= wanted.size) break;
    if (rows.length < DIRECTORY_PAGE_SIZE) break;
  }
  return found;
}

/** 取全部已入班成员，最新入班的在前（与旧的 profiles 直读排序一致）。 */
export async function fetchAllMembers(limit = 200): Promise<MemberListItem[]> {
  const all: MemberListItem[] = [];
  for (let page = 0; page < MAX_DIRECTORY_PAGES && all.length < limit; page++) {
    const rows = await fetchDirectoryPage(page * DIRECTORY_PAGE_SIZE);
    all.push(...rows);
    if (rows.length < DIRECTORY_PAGE_SIZE) break;
  }
  return all.slice(0, limit).reverse();
}
