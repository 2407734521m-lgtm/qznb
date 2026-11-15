import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 回归：扫码登录 803 拿到的 body.cookie 是 "MUSIC_U=..; __csrf=..; MUSIC_A=.."
// 整串，归一化必须保留全部 cookie 对，不能只留第一对——
// 以前只留 MUSIC_U，网易云 weapi 的 csrf_token 为空，/login/status 随即
// 认不出这次登录，页面刚扫完码就弹回“未登录”。
// 另：Set-Cookie 行里的 Expires/Max-Age/Path/HttpOnly/Secure 等属性要丢掉。
const workerSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'worker', 'index.mjs'),
  'utf8',
);

function grab(name) {
  const start = workerSrc.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  let i = workerSrc.indexOf('{', start);
  let depth = 0;
  for (; i < workerSrc.length; i++) {
    if (workerSrc[i] === '{') depth++;
    else if (workerSrc[i] === '}') {
      depth--;
      if (!depth) break;
    }
  }
  return workerSrc.slice(start, i + 1);
}

const constStart = workerSrc.indexOf('const SET_COOKIE_ATTRS');
const constEnd = workerSrc.indexOf(';', constStart) + 1;
const { normalizeCookieHeader, extractUpstreamCookie, parseCookieString } = new Function(
  `${workerSrc.slice(constStart, constEnd)}\n${grab('parseCookieString')}\n${grab('normalizeCookieHeader')}\n${grab('extractUpstreamCookie')}\nreturn { normalizeCookieHeader, extractUpstreamCookie, parseCookieString };`,
)();

test('扫码 body.cookie 整串保留全部 cookie 对', () => {
  const qrCookie =
    'MUSIC_U=abc123; Max-Age=2592000; Path=/; Domain=.music.163.com; __csrf=def456; Max-Age=2592000; Path=/; MUSIC_A=ghi789; Path=/';
  const out = normalizeCookieHeader(qrCookie);
  const parsed = parseCookieString(out);
  assert.equal(parsed.MUSIC_U, 'abc123');
  assert.equal(parsed.__csrf, 'def456');
  assert.equal(parsed.MUSIC_A, 'ghi789');
  assert.ok(!('Max-Age' in parsed) && !('Path' in parsed) && !('Domain' in parsed));
});

test('单条 Set-Cookie 行只留第一对', () => {
  assert.equal(
    normalizeCookieHeader('MUSIC_U=abc123; Max-Age=2592000; Path=/; HttpOnly; Secure'),
    'MUSIC_U=abc123',
  );
});

test('Expires 里的逗号不误拆', () => {
  assert.equal(
    normalizeCookieHeader('MUSIC_U=abc123; Expires=Thu, 01 Jan 2027 00:00:00 GMT; Path=/'),
    'MUSIC_U=abc123',
  );
});

test('803 响应经 extractUpstreamCookie 后仍带 __csrf', () => {
  const out = extractUpstreamCookie({
    body: {
      code: 803,
      message: '授权登录成功',
      cookie: 'MUSIC_U=abc123; Max-Age=2592000; Path=/; __csrf=def456; Path=/',
    },
    setCookies: ['MUSIC_U=abc123; Path=/'],
  });
  const parsed = parseCookieString(out);
  assert.equal(parsed.MUSIC_U, 'abc123');
  assert.equal(parsed.__csrf, 'def456');
});
