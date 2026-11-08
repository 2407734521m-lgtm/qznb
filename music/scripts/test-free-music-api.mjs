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

    const jamendoTrack = {
        id: '123456',
        name: 'Ambient Guitar Test',
        artist_name: 'Test Artist',
        album_name: 'Test Album',
        album_id: '9876',
        duration: '97',
        license_ccurl: 'http://creativecommons.org/licenses/by-nc-sa/4.0/',
        album_image: 'https://usercontent.jamendo.com/test-cover.jpg',
        audio: 'https://prod-1.storage.jamendo.com/?trackid=123456&format=mp32',
        audiodownload: 'https://prod-1.storage.jamendo.com/download/track/123456/mp32/',
        audiodownload_allowed: false,
        shareurl: 'https://www.jamendo.com/track/123456',
    };
    let jamendoSearchCalls = 0;
    globalThis.fetch = async input => {
        const url = new URL(String(input));
        if (url.hostname !== 'api.jamendo.com' || url.pathname !== '/v3.0/tracks/') {
            throw new Error('Unexpected request during Jamendo test: ' + url.toString());
        }
        assert.equal(url.searchParams.get('client_id'), 'test-client-id');
        assert.equal(url.searchParams.get('format'), 'json');
        assert.equal(url.searchParams.get('include'), 'licenses');
        assert.equal(url.searchParams.get('ccnc'), 'true');
        if (url.searchParams.has('id')) {
            assert.equal(url.searchParams.get('id'), '123456');
        } else {
            jamendoSearchCalls += 1;
            assert.equal(url.searchParams.get('search'), 'ambient guitar');
            assert.equal(url.searchParams.has('namesearch'), false);
        }
        return json({ headers: { status: 'success', code: 0, results_count: 1 }, results: [jamendoTrack] });
    };
    const jamendoSearch = await handleFreeMusicApi(new Request(
        'https://music.example/api/free-music/search?q=ambient%20guitar&limit=5',
        { headers: { origin: 'https://music.example', 'sec-fetch-site': 'same-origin' } },
    ), { JAMENDO_CLIENT_ID: 'test-client-id' });
    const jamendoBody = await jamendoSearch.json();
    assert.equal(jamendoSearch.status, 200);
    assert.equal(jamendoBody.sources.jamendo.available, true);
    assert.equal(jamendoBody.songs.length, 1);
    assert.equal(jamendoBody.songs[0].id, 'jamendo:123456');
    assert.equal(jamendoBody.songs[0].licenseLabel, 'CC BY-NC-SA 4.0');
    assert.equal(jamendoBody.songs[0].durationMs, 97000);
    assert.equal(jamendoBody.songs[0].audioUrl, jamendoTrack.audio);
    assert.equal(jamendoBody.songs[0].audioUrl.includes('/download/'), false);
    assert.equal(jamendoSearchCalls, 1);

    const jamendoDetail = await handleFreeMusicApi(new Request(
        'https://music.example/api/free-music/track?source=jamendo&id=123456',
        { headers: { origin: 'https://music.example', 'sec-fetch-site': 'same-origin' } },
    ), { JAMENDO_CLIENT_ID: 'test-client-id' });
    const jamendoDetailBody = await jamendoDetail.json();
    assert.equal(jamendoDetail.status, 200);
    assert.equal(jamendoDetailBody.track.id, 'jamendo:123456');
    assert.equal(jamendoDetailBody.track.licenseUrl, 'https://creativecommons.org/licenses/by-nc-sa/4.0/');

    const missingJamendoKey = await handleFreeMusicApi(new Request(
        'https://music.example/api/free-music/track?source=jamendo&id=123456',
        { headers: { origin: 'https://music.example', 'sec-fetch-site': 'same-origin' } },
    ), {});
    assert.equal(missingJamendoKey.status, 503);

    globalThis.fetch = originalFetch;
        console.log('Free music API tests passed: archive and Jamendo search/detail, full-text search, CC filtering, audio URL mapping, attribution, same-origin guard and validation.');
} finally {
    globalThis.fetch = originalFetch;
}
