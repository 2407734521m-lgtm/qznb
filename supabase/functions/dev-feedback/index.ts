import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 反馈邮件只发到开发者本人邮箱（固定收件人，调用方无法指定，避免被滥用发信）
const DEVELOPER_EMAIL = '2407734521@qq.com';

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
  if (!resendKey || !from) return response({ error: '邮件服务尚未配置。' }, 503);

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return response({ error: '登录已失效，请重新登录。' }, 401);

  let payload: { name?: unknown; contact?: unknown; content?: unknown };
  try {
    payload = await req.json();
  } catch {
    return response({ error: '请求内容不正确。' }, 400);
  }
  const content = typeof payload.content === 'string' ? payload.content.trim().slice(0, 1000) : '';
  const contact = typeof payload.contact === 'string' ? payload.contact.trim().slice(0, 100) : '';
  const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 30) : '';
  if (!content) return response({ error: '反馈内容不能为空。' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: feedbackAllowed, error: feedbackLimitError } = await admin.rpc('consume_dev_feedback_attempt', {
    p_profile_id: userData.user.id,
  });
  if (feedbackLimitError) return response({ error: '反馈服务暂不可用，请稍后重试。' }, 503);
  if (feedbackAllowed !== true) return response({ error: '每个账号每小时最多提交 3 次反馈，请稍后再试。' }, 429);

  const { data: profile } = await admin
    .from('profiles')
    .select('username, display_name')
    .eq('id', userData.user.id)
    .maybeSingle();
  const who = profile?.display_name || profile?.username || '站内同学';
  const username = profile?.username || '';

  const text = [
    `收到一条来自「我们的班级 · 青春档案」的用户反馈：`,
    '',
    `反馈人：${who}${username ? `（@${username}）` : ''}${name ? `，自称：${name}` : ''}`,
    `联系方式：${contact || '（未填写）'}`,
    '',
    '反馈内容：',
    content,
    '',
    '请通过上面的联系方式回复对方。',
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [DEVELOPER_EMAIL],
      subject: `我们的班级 · 青春档案 — 新反馈：${who}`,
      text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return response({ error: '邮件发送失败。', detail: detail.slice(0, 300) }, 502);
  }
  return response({ ok: true });
});
