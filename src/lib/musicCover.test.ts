import { describe, expect, it } from 'vitest';
import { smallMusicCoverUrl } from './musicCover';

describe('smallMusicCoverUrl', () => {
  it('returns null for a missing cover', () => {
    expect(smallMusicCoverUrl(null)).toBeNull();
  });

  it('asks the NetEase CDN for a small variant', () => {
    expect(smallMusicCoverUrl('https://p1.music.126.net/abc123/def.jpg')).toBe(
      'https://p1.music.126.net/abc123/def.jpg?param=120y120',
    );
    expect(smallMusicCoverUrl('https://p2.music.126.net/abc123/def.jpg', 160)).toBe(
      'https://p2.music.126.net/abc123/def.jpg?param=160y160',
    );
  });

  it('leaves other hosts untouched', () => {
    expect(smallMusicCoverUrl('https://example.com/y.jpg')).toBe('https://example.com/y.jpg');
    expect(smallMusicCoverUrl('https://p1.music.126.com/abc.jpg')).toBe('https://p1.music.126.com/abc.jpg');
  });

  it('never rewrites a URL that already carries a query', () => {
    expect(smallMusicCoverUrl('https://p1.music.126.net/abc.jpg?param=300y300')).toBe(
      'https://p1.music.126.net/abc.jpg?param=300y300',
    );
  });

  it('passes an unparseable value through', () => {
    expect(smallMusicCoverUrl('not a url')).toBe('not a url');
  });
});
