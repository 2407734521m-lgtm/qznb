import { createClient} from 'https://esm.sh/@supabase/supabase-js@2';

// 瑞氏集团招聘：审核后给应聘者发录用通知 / 婉拒邮件。
// 只复用站内已有的 email-dispatch 链路（Resend），不另起发信服务。
// 调用方必须是超管；邮件内容只取数据库里的申请与职位，不信任客户端传的收件人。

const corsHeaders = {
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const COMPANY = '瑞氏集团有限公司';

function response(body: unknown, status = 200) {
return new Response(JSON.stringify(body), { status, headers: {...corsHeaders, 'Content-Type': 'application/json'}});
}

Deno.serve(async (req: Request) => {
if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders});
if (req.method!== 'POST') return response({ error: 'Method not allowed'}, 405);
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) return response({ error: '请先登录。'}, 401);

const url = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!url ||!anonKey ||!serviceKey) return response({ error: 'Supabase 函数环境变量未配置。'}, 500);

const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader}}, auth: { persistSession: false}});
const { data: userData, error: userError} = await caller.auth.getUser();
if (userError ||!userData.user) return response({ error: '登录已失效，请重新登录。'}, 401);
const { data: role, error: roleError} = await caller.rpc('my_role');
if (roleError || role!== 'super_admin') return response({ error: '仅超级管理员可以发送招聘邮件。'}, 403);

let payload: { applicationId?: unknown; kind?: unknown};
try { payload = await req.json();} catch { return response({ error: '请求内容格式不正确。'}, 400);}
const applicationId = typeof payload.applicationId === 'number' && Number.isInteger(payload.applicationId)? payload.applicationId: null;
const kind = payload.kind === 'offer' || payload.kind === 'rejection'? payload.kind: null;
if (!applicationId ||!kind) return response({ error: '参数不正确。'}, 400);

const admin = createClient(url, serviceKey, { auth: { persistSession: false}});
const { data: application, error: appError} = await admin
.from('recruit_applications')
.select('id, name, qq_email, status, position_id')
.eq('id', applicationId)
.maybeSingle();
if (appError ||!application) return response({ error: '找不到这条申请。'}, 404);
const expectedStatus = kind === 'offer'? 'approved': 'rejected';
if (application.status!== expectedStatus) {
return response({ error: kind === 'offer'? '这条申请尚未通过，无法发送录用通知。': '这条申请尚未驳回，无法发送婉拒邮件。'}, 409);
}
const { data: position, error: posError} = await admin
.from('recruit_positions')
.select('title')
.eq('id', application.position_id)
.maybeSingle();
if (posError ||!position) return response({ error: '找不到这个职位。'}, 404);

const name = application.name as string;
const to = application.qq_email as string;
const title = position.title as string;
const subject = kind === 'offer'
? `录用通知——${title}`
: `应聘反馈——${title}`;
const text = kind === 'offer'
? `${name} 您好：\n\n感谢您应聘${COMPANY}「${title}」一职。经审核，您已被录用。\n\n请在收到本邮件后 3 个工作日内回复本邮件，确认入职意向；具体入职时间、地点与所需材料，人事部将通过电话或邮件另行通知。\n\n${COMPANY} 人事部`
: `${name} 您好：\n\n感谢您应聘${COMPANY}「${title}」一职。经综合评估，本次未能录用，感谢您的关注与付出。\n\n欢迎您继续关注我司后续招聘信息，期待未来有机会合作。\n\n${COMPANY} 人事部`;

const eventKey = `recruit:${kind}:${application.id}`;
let dispatchResult: Record<string, unknown> = {};
let dispatchOk = false;
try {
const r = await fetch(`${url}/functions/v1/email-dispatch`, {
method: 'POST',
headers: {
Authorization: `Bearer ${serviceKey}`,
apikey: serviceKey,
'Content-Type': 'application/json',
},
body: JSON.stringify({
to,
subject,
text,
category: 'recruit_notice',
source: 'recruit-notify',
eventKey,
actorId: userData.user.id,
referenceId: String(application.id),
}),
});
dispatchResult = await r.json().catch(() => ({}));
dispatchOk = r.ok && dispatchResult?.ok === true;
} catch {
dispatchOk = false;
}

const emailStatus = dispatchOk? 'sent': 'failed';
await admin.from('recruit_applications').update({
email_sent_at: new Date().toISOString(),
email_status: emailStatus,
}).eq('id', application.id);

if (!dispatchOk) {
const errorCode = typeof dispatchResult?.errorCode === 'string'? dispatchResult.errorCode: 'email_dispatch_failed';
return response({ error: '邮件发送失败，请稍后重试。', errorCode}, 502);
}
return response({ ok: true, status: 'sent', providerMessageId: dispatchResult.providerMessageId?? null});
});
