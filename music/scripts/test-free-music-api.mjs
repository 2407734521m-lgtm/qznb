import assert from 'node:assert/strict';
import { handleFreeMusicApi, isAllowedFreeMusicLicense, normalizeLicenseUrl } from '../worker/free-music-api.mjs';

const originalFetch = globalThis.fetch;
const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
try {
    assert.equal(normalizeLicenseUrl('http://creativecommons.org/licenses/by-nc-sa/4.0/'), 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
    assert.equal(isAllowedFreeMusicLicense('https://creativecommons.org/licenses/by-nc-sa/4.0/'), true);
    assert.equal(isAllowedFreeMusicLicense('https://example.com/license'), false);
    assert.equal(isAllowedFreeMusicLicense('https://creativecommons.org/licenses/by-nc-sa/4.0/../../'), false);

    let calls = 0;
    globalThis.fetch = async input => {
        calls += 1;
        const url = new URL(String(input));
        if (url.hostname === 'archive.org' && url.pathname === '/advancedsearch.php') {
            return json({ response: { numFound: 2, docs: [
                { identifier: 'allowed-audio', title: 'Allowed record', creator: 'Test Artist', runtime: '184' },
                { identifier: 'restricted-audio', title: 'Restricted record', creator: 'Test Artist', runtime: '120' },
            ] } });
        }
        if (url.hostname === 'archive.org' && url.pathname === '/metadata/allowed-audio') {
            return json({ metadata: { title: 'Allowed record', creator: 'Test Artist', licenseurl: 'http://creativecommons.org/licenses/by-nc-sa/4.0/', runtime: '184' },
                files: [{ name: 'track-one.mp3', format: 'MP3', length: '4000000' }, { name: 'cover.jpg', format: 'JPEG' }, { name: 'private.mp3', private: 1 }] });
        }
        if (url.hostname === 'archive.org' && url.pathname === '/metadata/restricted-audio') {
            return json({ metadata: { title: 'Restricted record', licenseurl: 'https://example.com/proprietary' }, files: [{ name: 'track.mp3' }] });
        }
        throw new Error('Unexpected upstream request: ' + url.toString());
    };
    const request = new Request('https://music.example/api/free-music/search?q=test', {
        headers: { origin: 'https://music.example', 'sec-fetch-site': 'same-origin' },
    });
    const result = await handleFreeMusicApi(request, {});
    const body = await result.json();
    assert.equal(result.status, 200);
    assert.equal(body.songs.length, 1);
    assert.equal(body.songs[0].source, 'archive');
    assert.equal(body.songs[0].licenseLabel, 'CC BY-NC-SA 4.0');
    assert.equal(body.songs[0].durationMs, 184000);
    assert.equal(body.songs[0].audioUrl, 'https://archive.org/download/allowed-audio/track-one.mp3');
    assert.equal(body.songs[0].licenseUrl, 'https://creativecommons.org/licenses/by-nc-sa/4.0/');
    assert.equal(calls, 3);

    const before = calls;
    const crossSite = await handleFreeMusicApi(new Request('https://music.example/api/free-music/search?q=test', {
        headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    }), {});
    assert.equal(crossSite.status, 403);
    assert.equal(calls, before);

    const invalid = await handleFreeMusicApi(new Request('https://music.example/api/free-music/search?q=x', {
        headers: { origin: 'https://music.example', 'sec-fetch-site': 'same-origin' },
    }), {});
    assert.equal(invalid.status, 400);

    console.log('Free music API tests passed: license allowlist, audio filtering, attribution, same-origin guard and validation.');
} finally {
    globalThis.fetch = originalFetch;
}
