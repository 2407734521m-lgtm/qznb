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
  if (roleError || !['admin', 'super_admin'].includes(role || '')) return response({ error: '仅管理员可以发送邮件。' }, 403);

  let payload: { userIds?: unknown; subject?: unknown; text?: unknown };
  try { payload = await req.json(); } catch { return response({ error: '请求内容格式不正确。' }, 400); }
  const userIds = Array.isArray(payload.userIds) ? [...new Set(payload.userIds.filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)))] : [];
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const bodyText = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!userIds.length || userIds.length > 100) return response({ error: '收件账号数量必须为 1–100 个。' }, 400);
  if (!subject || subject.length > 160 || !bodyText || bodyText.length > 10000) return response({ error: '邮件标题或正文长度不符合要求。' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const recipients: { id: string; email: string }[] = [];
  const wanted = new Set(userIds);
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return response({ error: '无法读取收件账号。' }, 500);
    for (const u of data.users) if (wanted.has(u.id) && u.email) recipients.push({ id: u.id, email: u.email });
    if (recipients.length >= wanted.size || data.users.length < 1000) break;
  }
  if (!recipients.length) return response({ error: '所选账号没有可用邮箱。' }, 400);

  let sent = 0;
  let firstError = '';
  const failed = userIds.length - recipients.length;
  for (const recipient of recipients) {
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [recipient.email], subject, text: bodyText }),
      });
      if (r.ok) sent++;
      else if (!firstError) {
        const t = await r.text().catch(() => '');
        firstError = `Resend 返回 ${r.status}：${t.slice(0, 200)}`;
      }
    } catch (e) {
      if (!firstError) firstError = '调用 Resend 失败：' + (e instanceof Error ? e.message : String(e));
    }
  }
  if (firstError) console.error('bulk-email send failed:', firstError);
  const attempted = recipients.length;
  return response({ sent, failed: failed + attempted - sent, selected: userIds.length, ...(firstError ? { detail: firstError } : {}) });
});
