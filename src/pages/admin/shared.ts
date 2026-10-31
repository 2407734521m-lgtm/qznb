import { supabase } from '../../lib/supabase';

const card: React.CSSProperties = {
  background: 'linear-gradient(160deg,#131a30,#0e1428)',
  border: '1px solid #ffffff12', borderRadius: 14, padding: 14, marginBottom: 12,
  boxShadow: '0 8px 32px #0008',
};
const h3: React.CSSProperties = { margin: '0 0 10px', fontSize: 15, fontWeight: 700 };
const mut: React.CSSProperties = { color: 'var(--mut)', fontSize: 12.5 };
const rowBtn: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 };

export async function alog(action: string, detail: unknown) {
  try {
    await supabase.rpc('log_admin_action', { p_action: action, p_detail: JSON.stringify(detail) });
  } catch {
    // Audit logging must not interrupt the primary admin action.
  }
}
