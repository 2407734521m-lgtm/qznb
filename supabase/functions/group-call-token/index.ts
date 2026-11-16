import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken, LiveKitAPI } from 'npm:livekit-server-sdk@2.20.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function normalizedLiveKitUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^wss?:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}

function serverLiveKitUrl(value: string) {
  return value.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

function safeConversationId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d{0,17}$/.test(value)) return value;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, code: 'method_not_allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.match(/^Bearer\s+\S+$/i)) {
    return json({ ok: false, code: 'unauthorized' }, 401);
  }

  let payload: { conversation_id?: unknown; action?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, code: 'invalid_request' }, 400);
  }

  const conversationId = safeConversationId(payload?.conversation_id);
  const action = payload?.action === undefined ? 'token' : payload.action;
  if (!conversationId || (action !== 'token' && action !== 'status')) {
    return json({ ok: false, code: 'invalid_request' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ ok: false, code: 'service_unavailable' }, 503);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return json({ ok: false, code: 'unauthorized' }, 401);
  }

  // This RPC returns a row only for a current member of an enabled group chat.
  // The LiveKit room name is never treated as an authorization secret.
  const { data: detailsData, error: detailsError } = await userClient
    .rpc('get_group_conversation_details', { p_conversation_id: conversationId });
  if (detailsError) {
    console.error('[group-call-token] membership lookup failed:', detailsError.message);
    return json({ ok: false, code: 'membership_check_failed' }, 503);
  }
  const details = Array.isArray(detailsData) ? detailsData[0] : detailsData;
  if (!details || String(details.conversation_id) !== conversationId) {
    return json({ ok: false, code: 'group_access_denied' }, 403);
  }

  const rawUrl = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!rawUrl || !apiKey || !apiSecret) {
    return json({ ok: false, code: 'voice_not_configured' }, 503);
  }

  const liveKitUrl = normalizedLiveKitUrl(rawUrl);
  if (!liveKitUrl) return json({ ok: false, code: 'voice_service_invalid' }, 503);

  const roomName = 'qz-group-' + conversationId;
  const api = new LiveKitAPI({
    host: serverLiveKitUrl(liveKitUrl),
    apiKey,
    secret: apiSecret,
  });

  try {
    let rooms = await api.room.listRooms([roomName]);
    if (action === 'status') {
      const room = rooms[0];
      return json({
        ok: true,
        active: Boolean(room && Number(room.numParticipants) > 0),
        participant_count: room ? Number(room.numParticipants) || 0 : 0,
        group_name: details.group_name || '群聊',
      });
    }

    if (!rooms.length) {
      try {
        await api.room.createRoom({
          name: roomName,
          emptyTimeout: 120,
          maxParticipants: 50,
        });
      } catch (createError) {
        // A concurrent first join may create the room between list and create.
        rooms = await api.room.listRooms([roomName]);
        if (!rooms.length) throw createError;
      }
    }

    const members = Array.isArray(details.members) ? details.members : [];
    const self = members.find((member: Record<string, unknown>) => member.id === authData.user.id);
    const participantName = String(self?.display_name || self?.username || '群成员').slice(0, 64);
    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity: authData.user.id,
      name: participantName,
      ttl: '6h',
      metadata: JSON.stringify({ conversation_id: conversationId }),
    });

    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });

    const token = await accessToken.toJwt();
    return json({
      ok: true,
      url: liveKitUrl,
      token,
      group_name: details.group_name || '群聊',
    });
  } catch (error) {
    console.error('[group-call-token] LiveKit request failed:', error);
    return json({ ok: false, code: 'voice_service_error' }, 502);
  }
});
