import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 瑞氏集团招聘：应聘提交入口（公开，申请人不用登录）。
// 先做 QQ 头像校验：QQ 邮箱必须是真实的——拉 https://q1.qlogo.cn/g?b=qq&nk={QQ号}&s=100
// 的头像算哈希，和腾讯默认头像比；一样就是没换过头像，大概率是假号，直接拒绝申请并附原因。
// 校验只在服务端做，前端不参与判断，防止绕过。
// 注意：本函数是公开入口，部署时 verify_jwt 必须为 false（申请人没有登录态）。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const COMPANY = '瑞氏集团有限公司';

// 腾讯默认头像（未设置头像的 QQ 返回的同一张图），SHA-256，2026-11-28 实测。
// 对应 md5 4700116072a9eba9330a81fbbe49b7d5，PNG 100x100，5894 字节。
// Deno 的 Web Crypto 不支持 MD5，所以用 SHA-256 比对。
const DEFAULT_AVATAR_SHA256 =
  '2d2cf213888d3bd322be7e5a819e248eebab9c48d482b9dcf1ea1d5db85ac4a3';
const AVATAR_TIMEOUT_MS = 8000;
const AVATAR_URL = (qq: string) => `https://q1.qlogo.cn/g?b=qq&nk=${qq}&s=100`;

const AUTO_REJECT_NOTE = '系统自动拒绝：该 QQ 邮箱未设置头像，无法验证为真实 QQ 邮箱';
const AVATAR_UNAVAILABLE_NOTE = '头像验证未完成（服务暂不可达），请人工核对';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QQ_NUMBER_RE = /^\d{5,12}$/;

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 查 QQ 有没有换过头像：yes 有头像 / no 还是默认头像 / unknown 腾讯那边拉不到。 */
async function checkAvatar(qq: string): Promise<'yes' | 'no' | 'unknown'> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AVATAR_TIMEOUT_MS);
  try {
    const res = await fetch(AVATAR_URL(qq), { signal: controller.signal });
    if (!res.ok) return 'unknown';
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return 'unknown';
    const hash = await sha256Hex(buf);
    return hash === DEFAULT_AVATAR_SHA256 ? 'no' : 'yes';
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return response({ error: 'Method not allowed' }, 405);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return response({ ok: false, reason: '请求内容格式不正确。' }, 400);
  }

  const positionId =
    typeof payload.positionId === 'number' && Number.isInteger(payload.positionId)
      ? payload.positionId
      : null;
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const qqEmail = typeof payload.qqEmail === 'string' ? payload.qqEmail.trim().toLowerCase() : '';
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  const intro = typeof payload.intro === 'string' ? payload.intro.trim() : '';
  const experience = typeof payload.experience === 'string' ? payload.experience.trim() : '';

  if (!positionId || positionId <= 0) {
    return response({ ok: false, reason: '职位不正确。' }, 400);
  }
  if (!name || name.length > 20) {
    return response({ ok: false, reason: 'bad name' }, 400);
  }
  if (!EMAIL_RE.test(qqEmail) || qqEmail.length > 254) {
    return response({ ok: false, reason: 'bad email' }, 400);
  }
  const qqNumber = qqEmail.split('@')[0];
  if (!QQ_NUMBER_RE.test(qqNumber)) {
    return response({ ok: false, reason: '请填写 QQ 邮箱（QQ 号@qq.com），例如：123456@qq.com。' }, 400);
  }
  if (phone.length > 20 || intro.length > 2000 || experience.length > 2000) {
    return response({ ok: false, reason: '填写的内容太长了，请精简一下。' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return response({ ok: false, reason: '服务暂时不可用，请稍后重试。' }, 500);
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 先看职位还在不在招。没头像的直接拒绝不走 RPC，所以这里自己查一次。
  const { data: position } = await admin
    .from('recruit_positions')
    .select('id, title, is_open')
    .eq('id', positionId)
    .maybeSingle();
  if (!position || !position.is_open) {
    return response({ ok: false, reason: 'position closed' }, 400);
  }

  // 招聘关闭时间：到了时间整个板块关闭，不再接受新申请。
  // 服务端强制执行，前端只做展示，绕过前端也提交不进来。
  const { data: closeRow } = await admin
    .from('site_settings')
    .select('value')
    .eq('key', 'recruit_close_at')
    .maybeSingle();
  const closeAt = closeRow?.value ? new Date(closeRow.value as string) : null;
  if (closeAt && !Number.isNaN(closeAt.getTime()) && Date.now() >= closeAt.getTime()) {
    return response({ ok: false, reason: 'recruit closed' }, 400);
  }

  const avatar = await checkAvatar(qqNumber);

  if (avatar === 'no') {
    // 没换过头像：大概率是假号。直接拒绝并写清原因，不重复写同一条。
    const { data: existing } = await admin
      .from('recruit_applications')
      .select('id, status')
      .eq('position_id', positionId)
      .eq('qq_email', qqEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
      return response({ ok: false, reason: 'already applied' }, 200);
    }
    if (!existing) {
      const { error: insertError } = await admin.from('recruit_applications').insert({
        position_id: positionId,
        name,
        qq_email: qqEmail,
        phone,
        intro,
        experience,
        status: 'rejected',
        admin_note: AUTO_REJECT_NOTE,
      });
      if (insertError) {
        return response({ ok: false, reason: '提交失败，请稍后重试。' }, 500);
      }
    }
    return response({
      ok: false,
      avatarCheck: 'missing',
      reason: '该 QQ 邮箱未设置头像，无法验证为真实 QQ 邮箱，请更换已设置头像的 QQ 邮箱后重新申请。',
    });
  }

  // 有头像，或腾讯那边拉不到（放行，但留备注给后台人工核对）。
  const { data: applicationId, error: rpcError } = await admin.rpc('submit_recruit_application', {
    p_position_id: positionId,
    p_name: name,
    p_qq_email: qqEmail,
    p_phone: phone,
    p_intro: intro,
    p_experience: experience,
  });
  if (rpcError) {
    return response({ ok: false, reason: rpcError.message || '提交失败，请稍后重试。' }, 200);
  }
  if (avatar === 'unknown') {
    await admin
      .from('recruit_applications')
      .update({ admin_note: AVATAR_UNAVAILABLE_NOTE })
      .eq('id', applicationId);
  }

  // 提交成功：给应聘者发一封“已收到申请”的确认信（走已有的 email-dispatch，
  // 类别 recruit_notice / 来源 recruit-notify 已在白名单里，不用另加类别）。
  // 事件 key 带申请 id，重复调用不会重复发信。发信失败也不影响提交结果。
  let confirmationEmailSent = false;
  try {
    const r = await fetch(`${url}/functions/v1/email-dispatch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: qqEmail,
        subject: `已收到您的应聘申请——${position.title}`,
        text:
          `${name} 您好：\n\n我们已收到您应聘${COMPANY}「${position.title}」一职的申请，正在审核中。\n\n` +
          `审核结果会发到这个 QQ 邮箱，请留意查收；也可以随时在招聘页“查询申请进度”里凭这个邮箱查看进度。\n\n${COMPANY} 人事部`,
        category: 'recruit_notice',
        source: 'recruit-notify',
        eventKey: `recruit:received:${applicationId}`,
        referenceId: String(applicationId),
      }),
    });
    const dispatchResult = await r.json().catch(() => ({}));
    confirmationEmailSent = r.ok && dispatchResult?.ok === true;
  } catch {
    confirmationEmailSent = false;
  }
  return response({ ok: true, id: applicationId, avatarCheck: avatar, confirmationEmailSent });
});
