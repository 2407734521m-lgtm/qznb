import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return response({ error: '请先登录。' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return response({ error: 'Supabase 函数环境变量未配置。' }, 500);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return response({ error: '登录已失效，请重新登录。' }, 401);
  const { data: role, error: roleError } = await caller.rpc('my_role');
  if (roleError || !['admin', 'super_admin'].includes(role || '')) {
    return response({ error: '仅管理员可以发送恢复通知。' }, 403);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Do not announce recovery while either manual or scheduled maintenance is active.
  const { data: siteRows, error: settingsError } = await admin
    .from('site_settings')
    .select('key, value')
    .in('key', ['maintenance', 'maintenance_schedule']);
  if (settingsError) return response({ error: '读取网站维护状态失败，暂不能发送。' }, 500);
  const siteSettings = new Map<string, string | null>(
    (siteRows ?? []).map((row: { key: string; value: string | null }) => [row.key, row.value] as const)
  );
  let maintenanceActive = siteSettings.get('maintenance') === 'true';
  const rawSchedule = siteSettings.get('maintenance_schedule');
  if (rawSchedule) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawSchedule);
    } catch {
      return response({ error: '维护计划配置无法读取，暂不能发送。' }, 503);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return response({ error: '维护计划配置无效，暂不能发送。' }, 503);
    }
    const schedule = parsed as { enabled?: boolean | string; start_at?: string; end_at?: string };
    const scheduleEnabled = schedule.enabled === true || schedule.enabled === 'true';
    if (scheduleEnabled) {
      const start = Date.parse(schedule.start_at ?? '');
      const end = Date.parse(schedule.end_at ?? '');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return response({ error: '维护计划时间无效，暂不能发送。' }, 503);
      }
      const now = Date.now();
      // Match public_guest_landing_data(): an enabled schedule takes priority
      // over the manual switch, including after its end time.
      maintenanceActive = start <= now && now < end;
    }
  }
  if (maintenanceActive) {
    return response({ error: '网站仍处于维护状态，结束维护后才能发送恢复通知。' }, 409);
  }

  const { data: rows, error: readError } = await admin
    .from('maintenance_notify_emails')
    .select('id, email')
    .order('created_at', { ascending: true })
    .limit(500);
  if (readError) return response({ error: '读取登记名单失败。' }, 500);
  const list = rows ?? [];
  if (!list.length) return response({ sent: 0, failed: 0, total: 0 });

  const subject = 'Class Memory — 网站已恢复';
  const text = '你好！\n\nClass Memory 的维护已经结束，网站恢复正常，现在可以回来啦。\n\n打开网站：https://qianzhi.pw/\n\n（你曾在维护期间留下这个邮箱接收恢复通知，本邮件只发送这一次。）';

  let sent = 0;
  let firstErrorCode = '';
  for (const row of list) {
    try {
      const dispatchResponse = await fetch(`${url}/functions/v1/email-dispatch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: row.email,
          subject,
          text,
          category: 'maintenance_recovery',
          source: 'maintenance-notify',
          eventKey: `maintenance-recovery:${row.id}`,
          referenceId: `maintenance-notify:${row.id}`,
          actorId: userData.user.id,
        }),
      });
      const dispatchResult = await dispatchResponse.json().catch(() => ({}));
      if (dispatchResponse.ok && dispatchResult?.ok === true) {
        sent++;
        const { error: deleteError } = await admin
          .from('maintenance_notify_emails')
          .delete()
          .eq('id', row.id);
        if (deleteError) console.error('maintenance notification subscription cleanup failed');
      } else if (!firstErrorCode) {
        firstErrorCode = typeof dispatchResult?.errorCode === 'string'
          ? dispatchResult.errorCode
          : `email_dispatch_http_${dispatchResponse.status}`;
      }
    } catch {
      if (!firstErrorCode) firstErrorCode = 'email_dispatch_network_error';
    }
  }

  return response({
    sent,
    failed: list.length - sent,
    total: list.length,
    ...(firstErrorCode ? { detail: firstErrorCode } : {}),
  });
});
