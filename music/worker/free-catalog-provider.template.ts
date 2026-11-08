import type { SongResult, UnifiedSong } from '../../../types';
import { OnlineProviderError } from '../../../types/onlineMusic';
import type { AudioQualityPreference, OnlineMusicProvider, ProviderAudioSource, ProviderPage } from '../../../types/onlineMusic';

type FreeTrack = {
    id: string;
    name: string;
    artists?: string[];
    albumName?: string;
    albumId?: string;
    durationMs?: number;
    coverUrl?: string;
    audioUrl?: string;
    source?: 'archive' | 'jamendo';
    sourceLabel?: string;
    licenseLabel?: string;
    licenseUrl?: string;
    sourceUrl?: string;
    archiveIdentifier?: string;
    fileName?: string;
};
const recentSongs = new Map<string, UnifiedSong>();
const text = (value: unknown): string => value == null ? '' : String(value);
const isTrustedAudioUrl = (value: string, source: string): boolean => {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return false;
        if (source === 'archive') return url.hostname === 'archive.org' || url.hostname === 'www.archive.org';
        if (source === 'jamendo') return url.hostname === 'storage.jamendo.com' || url.hostname.endsWith('.storage.jamendo.com');
        return false;
    } catch {
        return false;
    }
};
const toPage = (songs: UnifiedSong[], offset: number, hasMore: boolean): ProviderPage<UnifiedSong> => ({
    items: songs,
    total: undefined,
    hasMore,
    nextOffset: offset + songs.length,
});
const normalizeFreeTrack = (raw: FreeTrack): UnifiedSong => {
    const source = raw.source === 'jamendo' ? 'jamendo' : 'archive';
    const id = text(raw.id);
    if (!id) throw new OnlineProviderError('invalid-response', '免费曲库返回了没有 ID 的歌曲', 'freecatalog');
    const audioUrl = text(raw.audioUrl);
    const licenseUrl = text(raw.licenseUrl);
    if (!isTrustedAudioUrl(audioUrl, source) || !licenseUrl.startsWith('https://creativecommons.org/')) {
        throw new OnlineProviderError('not-playable', '曲库没有返回可验证的官方播放地址或许可', 'freecatalog');
    }
    const artists = (Array.isArray(raw.artists) ? raw.artists : [])
        .map(name => text(name).trim())
        .filter(Boolean)
        .slice(0, 5)
        .map((name, index) => ({ id: id + ':artist:' + index, name }));
    const providerData = {
        source,
        audioUrl,
        sourceLabel: text(raw.sourceLabel),
        licenseLabel: text(raw.licenseLabel),
        licenseUrl,
        sourceUrl: text(raw.sourceUrl),
        archiveIdentifier: text(raw.archiveIdentifier),
        fileName: text(raw.fileName),
    };
    const song: UnifiedSong = {
        id,
        name: text(raw.name) || 'Untitled track',
        artists,
        album: {
            id: text(raw.albumId) || id,
            name: text(raw.albumName) || 'Single',
            coverUrl: text(raw.coverUrl) || undefined,
        },
        durationMs: Math.max(0, Number(raw.durationMs) || 0),
        sourceRef: { kind: 'online', providerId: 'freecatalog', mediaId: id, providerData },
    };
    recentSongs.set(id, song);
    if (recentSongs.size > 300) recentSongs.delete(recentSongs.keys().next().value as string);
    return song;
};

const requestJson = async (url: string): Promise<any> => {
    let response: Response;
    try {
        response = await fetch(url, { headers: { accept: 'application/json' } });
    } catch (error) {
        throw new OnlineProviderError('network', '免费曲库暂时无法连接', 'freecatalog', error);
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new OnlineProviderError(
            response.status === 404 ? 'not-playable' : 'unavailable',
            text(body?.message) || '免费曲库请求失败（HTTP ' + response.status + '）',
            'freecatalog',
            body,
            response.status,
        );
    }
    return body;
};

export const freeCatalogProvider: OnlineMusicProvider = {
    id: 'freecatalog',
    displayName: '免费曲库',
    shortName: '免费曲库',
    mark: { letter: '免', color: '#15803d' },
    getAvailability: () => ({ configured: true }),
    capabilities: {
        search: true, playback: true, lyrics: false, auth: false,
        userLibrary: false, playlists: false, albums: false, artists: false,
        recommendations: false, mutations: false, wordByWordLyrics: false,
    },
    normalizeSong: raw => normalizeFreeTrack(raw as FreeTrack),
    search: {
        async searchSongs(query, limit, offset) {
            const cleanQuery = query.trim();
            if (cleanQuery.length < 2) return toPage([], offset, false);
            const params = new URLSearchParams({
                q: cleanQuery,
                limit: String(Math.max(1, Math.min(20, limit))),
                offset: String(Math.max(0, offset)),
            });
            const response = await requestJson('/api/free-music/search?' + params.toString());
            const rawSongs = Array.isArray(response?.songs) ? response.songs as FreeTrack[] : [];
            return toPage(rawSongs.map(normalizeFreeTrack), offset, Boolean(response?.hasMore));
        },
    },
    playback: {
        audioQualityLevels: ['standard'],
        async getSongDetail(id) {
            const key = String(id);
            const cached = recentSongs.get(key);
            if (cached) return cached;
            const parts = key.split(':');
            let url = '';
            if (parts[0] === 'archive' && parts.length >= 3) {
                const fileName = decodeURIComponent(parts.slice(2).join(':'));
                url = '/api/free-music/track?' + new URLSearchParams({
                    source: 'archive', identifier: parts[1], file: fileName,
                }).toString();
            } else if (parts[0] === 'jamendo' && /^[0-9]{1,20}$/.test(parts[1] || '')) {
                url = '/api/free-music/track?' + new URLSearchParams({ source: 'jamendo', id: parts[1] }).toString();
            } else {
                return null;
            }
            const response = await requestJson(url);
            return response?.track ? normalizeFreeTrack(response.track as FreeTrack) : null;
        },
        async getAudioSource(song: SongResult, quality: AudioQualityPreference): Promise<ProviderAudioSource | null> {
            const ref = song.sourceRef;
            if (!ref || ref.kind !== 'online' || ref.providerId !== 'freecatalog') return null;
            const data = ref.providerData || {};
            const source = text(data.source);
            const url = text(data.audioUrl);
            if (!isTrustedAudioUrl(url, source)) throw new OnlineProviderError('not-playable', '这首歌没有可验证的官方播放地址', 'freecatalog');
            return { url, fetchedAt: Date.now(), quality };
        },
    },
    getSongPageUrl(song) {
        const ref = song.sourceRef;
        if (!ref || ref.kind !== 'online' || ref.providerId !== 'freecatalog') return null;
        const url = ref.providerData?.sourceUrl;
        return typeof url === 'string' && url.startsWith('https://') ? url : null;
    },
};
