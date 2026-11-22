import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.mjs';

const origin = 'https://radio.qianzhi.pw';

async function request(path, init, env = {}) {
  return worker.fetch(new Request(new URL(path, origin), init), env);
}

async function jsonResponse(response) {
  assert.match(response.headers.get('content-type') || '', /application\/json/i);
  return response.json();
}

test('static requests delegate to the configured Cloudflare asset binding', async () => {
  let receivedUrl = '';
  const response = await request('/', undefined, {
    ASSETS: {
      async fetch(req) {
        receivedUrl = req.url;
        return new Response('asset-ok', { status: 200 });
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'asset-ok');
  assert.equal(receivedUrl, origin + '/');
});

test('static requests fail closed when the asset binding is absent', async () => {
  const response = await request('/');
  assert.equal(response.status, 404);
  assert.equal(await response.text(), 'Not found');
});

test('site-login proxy rejects unsupported methods before any upstream request', async () => {
  const response = await request('/api/dl/site-login', { method: 'GET' });
  assert.equal(response.status, 405);
  assert.deepEqual(await jsonResponse(response), { error: 'METHOD_NOT_ALLOWED' });
});

test('download account routes require a valid site session before exposing data', async () => {
  const response = await request('/api/dl/netease/status');
  assert.equal(response.status, 401);
  assert.deepEqual(await jsonResponse(response), {
    error: 'SITE_LOGIN_REQUIRED',
    siteLoggedIn: false,
  });
});

test('unsupported providers return an explicit empty shape instead of false playback success', async () => {
  const response = await request('/api/qq/search?keywords=example');
  assert.equal(response.status, 200);
  const body = await jsonResponse(response);
  assert.equal(body.provider, 'qq');
  assert.equal(body.error, 'PROVIDER_NOT_AVAILABLE_ON_WEB');
  assert.deepEqual(body.songs, []);
  assert.deepEqual(body.podcasts, []);
});

test('song comments are explicitly read-only/unavailable on the web edition', async () => {
  const missingId = await request('/api/song/comments');
  assert.equal(missingId.status, 400);
  assert.deepEqual((await jsonResponse(missingId)).comments, []);

  const read = await request('/api/song/comments?id=123');
  assert.equal(read.status, 200);
  assert.deepEqual((await jsonResponse(read)).comments, []);

  const write = await request('/api/song/comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: '123', content: 'test' }),
  });
  assert.equal(write.status, 200);
  const result = await jsonResponse(write);
  assert.equal(result.success, false);
  assert.equal(result.error, 'COMMENTS_UNAVAILABLE_ON_WEB');
});

test('unsupported podcast routes return documented empty shapes', async () => {
  const hot = await request('/api/podcast/hot');
  assert.equal(hot.status, 200);
  const result = await jsonResponse(hot);
  assert.deepEqual(result.podcasts, []);
  assert.equal(result.error, 'PODCAST_HOT_UNAVAILABLE_ON_WEB');
});

test('listen totals advertise unsupported sync instead of fabricated counts', async () => {
  const response = await request('/api/listen/total');
  assert.equal(response.status, 200);
  assert.deepEqual(await jsonResponse(response), {
    provider: 'netease',
    supported: false,
    accountDurationSync: 'unsupported',
  });
});

test('QR login retries 502 with noCookie=true and persists a long session across requests', async () => {
  const originalFetch = globalThis.fetch;
  const qrRequests = [];
  const upstreamCookie = 'MUSIC_U=qr-user-cookie; __csrf=qr-csrf; NMTID=' + 'x'.repeat(7200);
  let statusCookie = '';
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (url.pathname === '/api/netease/login/qr/check') {
      qrRequests.push(url);
      if (url.searchParams.get('noCookie') !== 'true') {
        return new Response(JSON.stringify({ code: 502, message: 'cookie headers too large' }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({
        code: 803,
        message: '授权登录成功',
        cookie: upstreamCookie,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/api/netease/login/status') {
      statusCookie = url.searchParams.get('cookie') || '';
      return new Response(JSON.stringify({
        data: {
          profile: { userId: '163-user-1', nickname: '测试用户' },
          account: { id: '163-user-1' },
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error('Unexpected upstream request: ' + url.pathname);
  };

  try {
    const response = await request('/api/login/qr/check?key=qr-test-key');
    const body = await jsonResponse(response);
    assert.equal(response.status, 200);
    assert.equal(body.code, 803);
    assert.equal(body.loggedIn, true);
    assert.equal(body.hasCookie, true);
    assert.equal(body.userId, '163-user-1');
    assert.equal(qrRequests.length, 2);
    assert.equal(qrRequests[0].searchParams.has('noCookie'), false);
    assert.equal(qrRequests[1].searchParams.get('noCookie'), 'true');
    assert.equal(statusCookie, upstreamCookie);

    const setCookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie') || ''];
    const cookiePairs = setCookies.map(value => value.split(';', 1)[0]).filter(Boolean);
    assert.ok(cookiePairs.some(value => value.startsWith('mr_session_parts=')));
    assert.ok(cookiePairs.length >= 4, 'large sessions are split into multiple browser cookies');
    const cookieHeader = cookiePairs.join('; ');
    const restored = await request('/api/login/status', { headers: { cookie: cookieHeader } });
    const restoredBody = await jsonResponse(restored);
    assert.equal(restored.status, 200, 'restored session route failed: ' + JSON.stringify(restoredBody));
    assert.equal(restoredBody.loggedIn, true);
    assert.equal(statusCookie, upstreamCookie);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('download log forwards the verified site-user token and ignores client-supplied identity', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push({ url, init });
    if (url.pathname === '/auth/v1/user') {
      assert.equal(init.headers.Authorization, 'Bearer verified-site-token');
      return new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', email: 'member@example.test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/rest/v1/rpc/log_music_download') {
      return new Response('42', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('Unexpected upstream request: ' + url.pathname);
  };

  try {
    const response = await request('/api/dl/log-download', {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-site-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_song_id: 'song-1',
        p_song_name: 'Test song',
        p_artist: 'Test artist',
        p_status: 'success',
        p_file_size: 12345,
        p_error: '',
        p_device_label: 'Android',
        p_site_user_id: '22222222-2222-4222-8222-222222222222',
        p_site_username: 'forged@example.test',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), '42');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.pathname, '/rest/v1/rpc/log_music_download');
    assert.equal(calls[1].init.headers.Authorization, 'Bearer verified-site-token');
    const rpc = JSON.parse(calls[1].init.body);
    assert.equal(rpc.p_site_user_id, '11111111-1111-4111-8111-111111111111');
    assert.equal(rpc.p_site_username, 'member@example.test');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('app click log forwards the verified site-user token to log_app_click', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    calls.push({ url, init });
    if (url.pathname === '/auth/v1/user') {
      return new Response(JSON.stringify({ id: '11111111-1111-4111-8111-111111111111', email: 'member@example.test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.pathname === '/rest/v1/rpc/log_app_click') {
      return new Response('7', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('Unexpected upstream request: ' + url.pathname);
  };

  try {
    const response = await request('/api/dl/log-app-click', {
      method: 'POST',
      headers: {
        authorization: 'Bearer verified-site-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_app: 'musicdl',
        p_event: 'update_click',
        p_source: 'update_dialog',
        p_app_version_name: '1.2.2',
        p_app_version_code: 5,
        p_client_platform: 'musicdl',
        p_device_label: 'Android',
        p_user_agent: 'test-agent',
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), '7');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url.pathname, '/rest/v1/rpc/log_app_click');
    assert.equal(calls[1].init.headers.Authorization, 'Bearer verified-site-token');
    const rpc = JSON.parse(calls[1].init.body);
    assert.equal(rpc.p_app, 'musicdl');
    assert.equal(rpc.p_event, 'update_click');
    assert.equal('p_site_user_id' in rpc, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unknown API routes return a JSON 404 with the requested path', async () => {
  const response = await request('/api/__unknown_contract_test__');
  assert.equal(response.status, 404);
  assert.deepEqual(await jsonResponse(response), {
    error: 'NOT_FOUND',
    path: '/api/__unknown_contract_test__',
  });
});
