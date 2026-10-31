import { supabase } from '../../lib/supabase';

export const card: React.CSSProperties = {
  background: 'linear-gradient(160deg,#131a30,#0e1428)',
  border: '1px solid #ffffff12', borderRadius: 14, padding: 14, marginBottom: 12,
  boxShadow: '0 8px 32px #0008',
};
export const h3: React.CSSProperties = { margin: '0 0 10px', fontSize: 15, fontWeight: 700 };
export const mut: React.CSSProperties = { color: 'var(--mut)', fontSize: 12.5 };
export const rowBtn: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 };

export async function alog(action: string, detail: unknown) {
  try {
    await supabase.rpc('log_admin_action', { p_action: action, p_detail: JSON.stringify(detail) });
  } catch {
    // Audit logging must not interrupt the primary admin action.
  }
}

export function timeAgo(s: string) {
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(s).toLocaleDateString();
}

export function bucket14(rows: { created_at: string }[]) {
  const days: number[] = Array(14).fill(0);
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 13);
  rows.forEach(r => {
    const d = new Date(r.created_at); d.setHours(0, 0, 0, 0);
    const i = Math.round((d.getTime() - start.getTime()) / 864e5);
    if (i >= 0 && i < 14) days[i]++;
  });
  return days;
}
