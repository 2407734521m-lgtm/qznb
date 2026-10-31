import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return response({ error: '请先登录。' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!url || !anonKey || !serviceKey) return response({ error: 'Supabase 函数环境变量未配置。' }, 500);
  if (!resendKey || !from) return response({ error: '邮件服务尚未配置：请设置 RESEND_API_KEY 和 EMAIL_FROM。' }, 503);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return response({ error: '登录已失效，请重新登录。' }, 401);
  const { data: role, error: roleError } = await caller.rpc('my_role');
  if (roleError || !['admin', 'super_admin'].includes(role || '')) return response({ error: '仅管理员可以发送恢复通知。' }, 403);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: rows, error: readError } = await admin
    .from('maintenance_notify_emails')
    .select('id, email')
    .order('created_at', { ascending: true })
    .limit(500);
  if (readError) return response({ error: '读取登记名单失败。' }, 500);
  const list = rows ?? [];
  if (!list.length) return response({ sent: 0, failed: 0, total: 0 });

  const subject = '我们的班级 · 青春档案 — 网站已恢复';
  const text = '你好！\n\n我们的班级 · 青春档案的维护已经结束，网站恢复正常，现在可以回来啦。\n\n打开网站：https://qianzhi.pw/\n\n（你曾在维护期间留下这个邮箱接收恢复通知，本邮件只发送这一次。）';

  let sent = 0;
  let firstError = '';
  for (const row of list) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [row.email], subject, text }),
      });
      if (r.ok) {
        sent++;
        await admin.from('maintenance_notify_emails').delete().eq('id', row.id);
      } else if (!firstError) {
        const t = await r.text().catch(() => '');
        firstError = `Resend 返回 ${r.status}：${t.slice(0, 200)}`;
      }
    } catch (e) {
      if (!firstError) firstError = '调用 Resend 失败：' + (e instanceof Error ? e.message : String(e));
    }
  }
  if (firstError) console.error('maintenance-notify send failed:', firstError);
  return response({ sent, failed: list.length - sent, total: list.length, ...(firstError ? { detail: firstError } : {}) });
});
