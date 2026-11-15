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

test('unknown API routes return a JSON 404 with the requested path', async () => {
  const response = await request('/api/__unknown_contract_test__');
  assert.equal(response.status, 404);
  assert.deepEqual(await jsonResponse(response), {
    error: 'NOT_FOUND',
    path: '/api/__unknown_contract_test__',
  });
});
