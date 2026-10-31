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

  // Server-side per-admin throttle; the browser's confirmation dialog is not a security boundary.
  const rateLimitSince = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCampaigns, error: rateLimitError } = await admin
    .from('admin_email_campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', userData.user.id)
    .gte('created_at', rateLimitSince);
  if (rateLimitError) return response({ error: '无法检查邮件发送频率，请稍后重试。' }, 503);
  if ((recentCampaigns ?? 0) >= 5) {
    return response({ error: '单个管理员每小时最多发起 5 次批量邮件任务，请稍后再试。' }, 429);
  }

  const recipients: { id: string; email: string }[] = [];
  const wanted = new Set(userIds);
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return response({ error: '无法读取收件账号。' }, 500);
    for (const u of data.users) if (wanted.has(u.id) && u.email) recipients.push({ id: u.id, email: u.email });
    if (recipients.length >= wanted.size || data.users.length < 1000) break;
  }

  // Create a metadata-only campaign record before any provider request.
  const { data: campaign, error: campaignError } = await admin
    .from('admin_email_campaigns')
    .insert({
      actor_id: userData.user.id,
      subject,
      selected_count: userIds.length,
      status: 'processing',
    })
    .select('id')
    .single();
  if (campaignError || !campaign) {
    console.error('bulk-email campaign record could not be created');
    return response({ error: '无法建立邮件发送记录，邮件未发送。' }, 500);
  }

  const emailById = new Map(recipients.map(item => [item.id, item.email]));
  const recipientRows = userIds.map(id => ({
    campaign_id: campaign.id,
    profile_id: id,
    status: emailById.has(id) ? 'queued' : 'no_email',
    error_code: emailById.has(id) ? null : 'missing_email_or_account',
  }));
  const { error: recipientLogError } = await admin
    .from('admin_email_campaign_recipients')
    .insert(recipientRows);
  if (recipientLogError) {
    await admin.from('admin_email_campaigns')
      .update({ status: 'failed', failed_count: userIds.length, completed_at: new Date().toISOString() })
      .eq('id', campaign.id);
    console.error('bulk-email recipient log could not be created');
    return response({ error: '无法建立收件记录，邮件未发送。' }, 500);
  }

  let sent = 0;
  let providerFailed = 0;
  for (const recipient of recipients) {
    let status: 'sent' | 'failed' = 'failed';
    let errorCode: string | null = null;
    let providerMessageId: string | null = null;

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [recipient.email], subject, text: bodyText }),
      });
      if (r.ok) {
        status = 'sent';
        sent++;
        try {
          const result = await r.json();
          if (typeof result?.id === 'string') providerMessageId = result.id;
        } catch { /* Provider accepted the request; message id is optional. */ }
      } else {
        providerFailed++;
        errorCode = `resend_http_${r.status}`;
      }
    } catch {
      providerFailed++;
      errorCode = 'network_error';
    }

    const { error: updateError } = await admin
      .from('admin_email_campaign_recipients')
      .update({
        status,
        error_code: errorCode,
        provider_message_id: providerMessageId,
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaign.id)
      .eq('profile_id', recipient.id);
    if (updateError) console.error('bulk-email recipient status could not be recorded');
  }

  const noEmail = userIds.length - recipients.length;
  const failed = noEmail + providerFailed;
  const finalStatus = failed === 0 ? 'completed' : sent > 0 ? 'partial' : 'failed';
  const { error: campaignUpdateError } = await admin
    .from('admin_email_campaigns')
    .update({
      sent_count: sent,
      failed_count: failed,
      status: finalStatus,
      completed_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);
  if (campaignUpdateError) console.error('bulk-email campaign summary could not be updated');

  return response({
    campaignId: campaign.id,
    sent,
    failed,
    selected: userIds.length,
    ...(failed ? { detail: '部分收件人发送失败或没有可用邮箱，请在邮件记录中查看失败分类。' } : {}),
  });
});
