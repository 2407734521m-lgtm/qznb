import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const SOURCE = 'friend-request-email';
const CATEGORY = 'friend_notification';
const DAY_MS = 24 * 60 * 60 * 1000;
const SENDER_LIMIT_PER_DAY = 10;
const RECIPIENT_LIMIT_PER_DAY = 3;

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
  if (!url || !anonKey || !serviceKey) return response({ error: '邮件服务暂不可用。' }, 503);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return response({ error: '登录已失效，请重新登录。' }, 401);

  let payload: { target?: unknown };
  try {
    payload = await req.json();
  } catch {
    return response({ error: '请求内容不正确。' }, 400);
  }
  const target = typeof payload.target === 'string' ? payload.target : '';
  if (!UUID_RE.test(target) || target === userData.user.id) {
    return response({ error: '好友申请对象无效。' }, 400);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    // Confirm that the caller is still a joined member and the exact request is pending.
    const [requesterResult, recipientResult, friendshipResult] = await Promise.all([
      admin.from('profiles').select('username, display_name, joined').eq('id', userData.user.id).maybeSingle(),
      admin.from('profiles').select('joined').eq('id', target).maybeSingle(),
      admin.from('friendships').select('id, created_at')
        .eq('requester', userData.user.id)
        .eq('addressee', target)
        .eq('status', 'pending')
        .maybeSingle(),
    ]);

    if (requesterResult.error || recipientResult.error || friendshipResult.error) {
      return response({ error: '好友申请状态暂时无法确认。' }, 503);
    }
    if (requesterResult.data?.joined !== true || recipientResult.data?.joined !== true) {
      return response({ error: '账号当前无法发送好友提醒。' }, 403);
    }
    const friendship = friendshipResult.data;
    if (!friendship) return response({ error: '没有找到这条待处理的好友申请。' }, 409);

    const { data: recipientAuth, error: recipientAuthError } = await admin.auth.admin.getUserById(target);
    if (recipientAuthError) return response({ error: '对方邮箱信息暂时无法读取。' }, 503);
    const recipientEmail = recipientAuth.user?.email?.trim() ?? '';
    const emailIsConfirmed = Boolean(recipientAuth.user?.email_confirmed_at || recipientAuth.user?.confirmed_at);
    if (!EMAIL_RE.test(recipientEmail) || !emailIsConfirmed) {
      return response({ ok: true, sent: false, reason: 'recipient_email_unavailable' });
    }

    // Respect the requester's existing profile-name privacy setting in the email copy.
    const [privacyResult, senderLimitResult, recipientLimitResult] = await Promise.all([
      admin.from('profile_privacy').select('show_name').eq('profile_id', userData.user.id).maybeSingle(),
      admin.from('email_delivery_logs').select('id', { count: 'exact', head: true })
        .eq('category', CATEGORY).eq('source', SOURCE).eq('actor_id', userData.user.id)
        .gte('created_at', new Date(Date.now() - DAY_MS).toISOString()),
      admin.from('email_delivery_logs').select('id', { count: 'exact', head: true })
        .eq('category', CATEGORY).eq('source', SOURCE).eq('recipient_user_id', target)
        .gte('created_at', new Date(Date.now() - DAY_MS).toISOString()),
    ]);
    if (senderLimitResult.error || recipientLimitResult.error) {
      return response({ error: '邮件频率限制暂时无法确认，请稍后重试。' }, 503);
    }
    if ((senderLimitResult.count ?? 0) >= SENDER_LIMIT_PER_DAY || (recipientLimitResult.count ?? 0) >= RECIPIENT_LIMIT_PER_DAY) {
      // Rate limiting is an expected delivery outcome, not a transport failure.
      // Return 200 so the client can display the specific reason from the JSON body.
      return response({ ok: true, sent: false, reason: 'rate_limited' });
    }

    const username = String(requesterResult.data?.username ?? '');
    const showName = privacyResult.data?.show_name === true;
    const displayName = showName ? requesterResult.data?.display_name?.trim() : '';
    const requesterLabel = displayName ? `${displayName}（@${username}）` : `@${username || '一位成员'}`;
    const text = [
      '你好！',
      '',
      `${requesterLabel} 在堯网站向你发送了一条好友申请。`,
      '登录网站后，进入「私信」中的「请求」即可查看，并选择接受或拒绝。',
      '',
      '查看好友申请：https://qianzhi.pw/friends?tab=reqs',
      '',
      '这封提醒邮件由申请人主动选择发送。如果你不认识对方或暂时不想添加，可以忽略此邮件。',
    ].join('\n');

    const requestTimestamp = Date.parse(friendship.created_at);
    const eventVersion = Number.isFinite(requestTimestamp) ? requestTimestamp : Date.now();
    const dispatchResponse = await fetch(`${url}/functions/v1/email-dispatch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: recipientEmail,
        subject: '你收到了一条来自堯的好友申请',
        text,
        category: CATEGORY,
        source: SOURCE,
        eventKey: `friend-request-${friendship.id}-${eventVersion}`,
        actorId: userData.user.id,
        recipientUserId: target,
        referenceId: `friendship:${friendship.id}`,
      }),
    });
    const dispatchResult = await dispatchResponse.json().catch(() => ({}));
    if (!dispatchResponse.ok || dispatchResult?.ok !== true) {
      return response({
        ok: false,
        sent: false,
        reason: 'dispatch_failed',
        errorCode: typeof dispatchResult?.errorCode === 'string' ? dispatchResult.errorCode : 'email_dispatch_failed',
      }, 502);
    }

    return response({ ok: true, sent: true, status: 'accepted' });
  } catch (error) {
    console.error('friend request email reminder failed', error);
    return response({ error: '邮件提醒发送失败，请稍后重试。' }, 500);
  }
});
