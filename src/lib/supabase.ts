import { createClient } from '@supabase/supabase-js';
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Worker 反代注入（同源 /api，国内走 Cloudflare 线路）；没有注入时走环境变量直连
export const supabaseBaseUrl = (window as any).__SUPABASE_URL || envUrl;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = Boolean(supabaseBaseUrl && key);
export const supabase = createClient(supabaseBaseUrl ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});
