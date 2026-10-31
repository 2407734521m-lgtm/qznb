import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// 同源接口（2026-10-24）：在 qianzhi.pw / www.qianzhi.pw / admin.qianzhi.pw 上时，
// 接口走本站的 /api（Cloudflare 路由到 qznb-api），和页面同源，不再发跨域预检请求，
// 微信内置浏览器和部分自带浏览器拦跨域 POST 的问题就不存在了。
// 其他域名（如 GitHub Pages 预览、workers.dev）没有 /api 路由，仍走环境变量里的地址；
// Worker 注入的 __SUPABASE_URL（如果有）优先级最高。
const host = window.location.hostname.toLowerCase();
const sameOriginApi =
  host === 'qianzhi.pw' || host === 'www.qianzhi.pw' || host === 'admin.qianzhi.pw'
    ? window.location.origin + '/api'
    : undefined;
export const supabaseBaseUrl = window.__SUPABASE_URL || sameOriginApi || envUrl;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const configured = Boolean(supabaseBaseUrl && key);
export const supabase = createClient<Database>(supabaseBaseUrl ?? 'http://localhost', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});
