import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SENDER = '堯 <notice@qianzhi.pw>';
const ALLOWED_CATEGORIES = new Set([
  'admin_broadcast',
  'maintenance_recovery',
  'support_feedback',
  'security_notice',
  'friend_notification',
  'product_update',
  'system_notice',
]);
const ALLOWED_SOURCES = new Set([
  'admin-bulk-email',
  'maintenance-notify',
  'dev-feedback',
  'friend-request-email',
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function defaultHtml(text: string) {
  const paragraphs = escapeHtml(text).split(/\r?\n/).map((line) =>
    line ? `<p style="margin:0 0 12px;line-height:1.75;color:#263244">${line}</p>` : '<div style="height:6px"></div>'
  ).join('');
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>堯</title></head>
<body style="margin:0;padding:24px 12px;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <main style="max-width:560px;margin:0 auto;padding:28px 24px;background:#fff;border:1px solid #e8edf4;border-radius:18px">
    <div style="font-size:18px;font-weight:700;letter-spacing:.08em;color:#172033;margin-bottom:20px">堯</div>
    ${paragraphs}
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #edf0f5;font-size:12px;line-height:1.6;color:#8993a5">这是一封由堯网站发送的通知邮件。</p>
  </main>
</body>
</html>`;
}

function validOptionalUuid(value: unknown): value is string | undefined {
  return value === undefined || value === null || (typeof value === 'string' && UUID_RE.test(value));
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const suppliedApiKey = req.headers.get('apikey') ?? '';

  // This endpoint is intentionally internal-only. The Edge Gateway JWT check is
  // disabled because the internal caller authenticates with the server-only key
  // in the apikey header. Do not send a different publishable key alongside it.
  if (!serviceKey || suppliedApiKey !== serviceKey) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!url || !resendKey) return json({ error: 'Mail service is not configured', errorCode: 'mail_not_configured' }, 503);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const to = typeof payload.to === 'string' ? payload.to.trim() : '';
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const text = typeof payload.text === 'string' ? payload.text : '';
  const html = typeof payload.html === 'string' ? payload.html : '';
  const category = typeof payload.category === 'string' ? payload.category : '';
  const source = typeof payload.source === 'string' ? payload.source : '';
  const eventKey = typeof payload.eventKey === 'string' ? payload.eventKey : '';
  const actorId = payload.actorId;
  const recipientUserId = payload.recipientUserId;
  const referenceId = typeof payload.referenceId === 'string' ? payload.referenceId : null;

  if (!EMAIL_RE.test(to) || to.length > 254) return json({ error: 'Invalid recipient', errorCode: 'invalid_recipient' }, 400);
  if (!subject || subject.length > 160) return json({ error: 'Invalid subject', errorCode: 'invalid_subject' }, 400);
  if (!text.trim() || text.length > 20000) return json({ error: 'Invalid message body', errorCode: 'invalid_body' }, 400);
  if (html.length > 40000) return json({ error: 'HTML body is too long', errorCode: 'invalid_html' }, 400);
  if (!ALLOWED_CATEGORIES.has(category) || !ALLOWED_SOURCES.has(source)) {
    return json({ error: 'Unsupported email category or source', errorCode: 'unsupported_email_type' }, 400);
  }
  if (!/^[A-Za-z0-9:_-]{8,256}$/.test(eventKey)) return json({ error: 'Invalid event key', errorCode: 'invalid_event_key' }, 400);
  if (!validOptionalUuid(actorId) || !validOptionalUuid(recipientUserId)) {
    return json({ error: 'Invalid account reference', errorCode: 'invalid_account_reference' }, 400);
  }
  if (referenceId && referenceId.length > 128) return json({ error: 'Invalid reference', errorCode: 'invalid_reference' }, 400);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: existing, error: lookupError } = await admin
    .from('email_delivery_logs')
    .select('id,status,attempt_count,updated_at,provider_message_id')
    .eq('event_key', eventKey)
    .maybeSingle();

  if (lookupError) {
    console.error('email log lookup failed');
    return json({ error: 'Email log is unavailable', errorCode: 'email_log_unavailable' }, 503);
  }

  if (existing && ['accepted', 'delivered', 'bounced', 'complained'].includes(existing.status)) {
    return json({
      ok: true,
      duplicate: true,
      status: existing.status,
      providerMessageId: existing.provider_message_id ?? null,
    });
  }

  const now = new Date().toISOString();
  if (existing?.status === 'pending' && Date.now() - Date.parse(existing.updated_at) < 120000) {
    return json({ error: 'A matching send is already being processed', errorCode: 'send_in_progress' }, 409);
  }

  const claimToken = crypto.randomUUID();
  if (existing) {
    // Compare-and-swap the exact snapshot we read. Concurrent retries may both
    // observe a failed/stale row, but only one can acquire this new lease token.
    const { data: claimed, error: resetError } = await admin
      .from('email_delivery_logs')
      .update({
        status: 'pending',
        attempt_count: (existing.attempt_count ?? 0) + 1,
        error_code: null,
        updated_at: now,
        claim_token: claimToken,
      })
      .eq('id', existing.id)
      .eq('status', existing.status)
      .eq('updated_at', existing.updated_at)
      .eq('attempt_count', existing.attempt_count ?? 0)
      .select('id')
      .maybeSingle();
    if (resetError) {
      console.error('email log retry state could not be saved');
      return json({ error: 'Email log is unavailable', errorCode: 'email_log_unavailable' }, 503);
    }
    if (!claimed) {
      return json({ error: 'A matching send was claimed by another request', errorCode: 'send_in_progress' }, 409);
    }
  } else {
    const { error: insertError } = await admin
      .from('email_delivery_logs')
      .insert({
        event_key: eventKey,
        category,
        source,
        actor_id: actorId ?? null,
        recipient_user_id: recipientUserId ?? null,
        reference_id: referenceId,
        provider: 'resend',
        status: 'pending',
        attempt_count: 1,
        claim_token: claimToken,
      });
    if (insertError) {
      // A concurrent request may have inserted the same event key.
      if (insertError.code === '23505') {
        const { data: raced } = await admin
          .from('email_delivery_logs')
          .select('status,provider_message_id')
          .eq('event_key', eventKey)
          .maybeSingle();
        if (raced && ['accepted', 'delivered', 'bounced', 'complained'].includes(raced.status)) {
          return json({ ok: true, duplicate: true, status: raced.status, providerMessageId: raced.provider_message_id ?? null });
        }
        return json({ error: 'A matching send is already being processed', errorCode: 'send_in_progress' }, 409);
      }
      console.error('email log insert failed');
      return json({ error: 'Email log is unavailable', errorCode: 'email_log_unavailable' }, 503);
    }
  }

  const htmlBody = html || defaultHtml(text);
  try {
    const providerResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': eventKey,
      },
      body: JSON.stringify({
        from: SENDER,
        to: [to],
        subject,
        text,
        html: htmlBody,
      }),
    });

    if (!providerResponse.ok) {
      const errorCode = providerResponse.status === 429
        ? 'resend_rate_limited'
        : providerResponse.status === 401 || providerResponse.status === 403
          ? 'resend_authentication_failed'
          : providerResponse.status >= 500
            ? 'resend_unavailable'
            : 'resend_rejected';
      await admin.from('email_delivery_logs').update({
        status: 'failed',
        error_code: errorCode,
        updated_at: new Date().toISOString(),
      }).eq('event_key', eventKey).eq('claim_token', claimToken).eq('status', 'pending');
      return json({ error: 'Email provider rejected the message', errorCode }, providerResponse.status === 429 ? 429 : 502);
    }

    const providerResult = await providerResponse.json().catch(() => ({}));
    const providerMessageId = typeof providerResult?.id === 'string' ? providerResult.id : null;
    const { error: updateError } = await admin.from('email_delivery_logs').update({
      status: 'accepted',
      provider_message_id: providerMessageId,
      error_code: null,
      updated_at: new Date().toISOString(),
    }).eq('event_key', eventKey).eq('claim_token', claimToken).eq('status', 'pending');
    if (updateError) console.error('accepted email log update failed');

    return json({ ok: true, status: 'accepted', providerMessageId });
  } catch {
    await admin.from('email_delivery_logs').update({
      status: 'failed',
      error_code: 'network_error',
      updated_at: new Date().toISOString(),
    }).eq('event_key', eventKey).eq('claim_token', claimToken).eq('status', 'pending');
    return json({ error: 'Email provider could not be reached', errorCode: 'network_error' }, 502);
  }
});
