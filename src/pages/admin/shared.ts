import { supabase } from '../../lib/supabase';

export const card: React.CSSProperties = {
  background: 'var(--admin-surface, #ffffff)',
  border: '1px solid var(--admin-border, #e2e8f0)', borderRadius: 16, padding: 15, marginBottom: 12,
  boxShadow: 'var(--admin-shadow-card, 0 8px 24px rgba(15,23,42,.045))',
};
export const h3: React.CSSProperties = { margin: '0 0 10px', fontSize: 15, fontWeight: 700 };
export const mut: React.CSSProperties = { color: 'var(--admin-muted, #64748b)', fontSize: 12.5, lineHeight: 1.6 };
export const rowBtn: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 };

export async function alog(action: string, detail: unknown) {
  try {
    await supabase.rpc('log_admin_action', { p_action: action, p_detail: JSON.stringify(detail) });
  } catch {
    // Audit logging must not interrupt the primary admin action.
  }
}

export { timeAgo } from '../../lib/time';

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

