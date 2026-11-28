// Unit tests for mrSessionFromSetCookie (music/worker/netease-sync-proxy.mjs).
// Run with: node --test music/worker/netease-sync-proxy.test.mjs
// The radio Worker returns the restored NetEase session as chunked cookies
// (mr_session_parts=N plus mr_session_0..N-1); the leading mr_session= header
// only clears the legacy single cookie and is always empty.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mrSessionFromSetCookie } from './netease-sync-proxy.mjs';

const COOKIE =
  'MUSIC_U=abc123def456ghi789jkl012mno345pqr678stu901vwx234yzab567cd890ef123gh456ij789kl012mn345op678qr901st234uv567wx890yz123ab456cd789ef012gh345ij678kl901mn234op567qr890st123uv456wx789yz012ab345cd678ef901gh234ij567kl890mn123op456qr789st012uv345wx678yz901ab234cd567ef890gh123ij456kl789mn012op345qr678st901uv234wx567yz890; __csrf=abcdef1234567890abcdef1234567890; __remember_me=true';

function chunkedHeaders(cookie, partSize = 2800) {
  const encoded = encodeURIComponent(cookie);
  const chunks = encoded.match(new RegExp('[\\s\\S]{1,' + partSize + '}', 'g')) || [''];
  const attrs = 'Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000';
  const values = [
    `mr_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `mr_session_parts=${chunks.length}; ${attrs}`,
    ...chunks.map((chunk, i) => `mr_session_${i}=${chunk}; ${attrs}`),
  ];
  return { getSetCookie: () => values, get: () => null };
}

describe('mrSessionFromSetCookie', () => {
  it('reassembles chunked session cookies and ignores the empty clearing cookie', () => {
    assert.equal(mrSessionFromSetCookie(chunkedHeaders(COOKIE)), COOKIE);
  });

  it('reassembles multi-part chunked cookies', () => {
    assert.equal(mrSessionFromSetCookie(chunkedHeaders(COOKIE, 100)), COOKIE);
  });

  it('reads a legacy single mr_session cookie', () => {
    const headers = {
      getSetCookie: () => [`mr_session=${encodeURIComponent(COOKIE)}; Path=/; HttpOnly`],
      get: () => null,
    };
    assert.equal(mrSessionFromSetCookie(headers), COOKIE);
  });

  it('returns empty when only the clearing cookie is present', () => {
    const headers = {
      getSetCookie: () => ['mr_session=; Path=/; HttpOnly; Max-Age=0'],
      get: () => null,
    };
    assert.equal(mrSessionFromSetCookie(headers), '');
  });

  it('works with the comma-joined single-header fallback', () => {
    const headers = {
      getSetCookie: undefined,
      get: () => chunkedHeaders(COOKIE).getSetCookie().join(', '),
    };
    assert.equal(mrSessionFromSetCookie(headers), COOKIE);
  });

  it('returns empty when no session cookie is present', () => {
    const headers = { getSetCookie: () => [], get: () => null };
    assert.equal(mrSessionFromSetCookie(headers), '');
  });
});
