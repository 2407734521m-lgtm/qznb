/**
 * Cover art for the island: the station reports full-size art, but the
 * island only ever shows it at 22px (compact pill), 52px (expanded card)
 * and as a blurred wash behind the expanded card. Asking the NetEase image
 * CDN for a small variant keeps the decode — and the blur input — tiny, so
 * opening the card does not pay to decode a large image first.
 *
 * Only NetEase CDN hosts are rewritten (they serve `?param=WxH`); every
 * other URL is passed through untouched, and a URL that already carries a
 * query is never touched either.
 */

const NETEASE_COVER_HOST = 'music.126.net';
const NETEASE_COVER_HOST_SUFFIX = '.music.126.net';

/** A small variant of a cover URL for island use, or the URL unchanged. */
export function smallMusicCoverUrl(url: string | null, size = 120): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.search) return url;
  const host = parsed.hostname;
  if (host !== NETEASE_COVER_HOST && !host.endsWith(NETEASE_COVER_HOST_SUFFIX)) return url;
  parsed.searchParams.set('param', `${size}y${size}`);
  return parsed.href;
}
