import { describe, expect, it } from 'vitest';
import {
  findNextChatMediaMessageId,
  isChatAutoplayBlocked,
  isChatPlayableMediaBody,
} from './chatPlayback';

describe('chat media sequence', () => {
  it('recognizes audio and video, including messages with bubble effects', () => {
    expect(isChatPlayableMediaBody('[[im-audio:voice.webm]]')).toBe(true);
    expect(isChatPlayableMediaBody('[[im-video:clip.mp4|poster.jpg]]')).toBe(true);
    expect(isChatPlayableMediaBody('[[im-bubble-effect:gentle]][[im-audio:voice.m4a]]')).toBe(true);
  });

  it('does not queue text, images or files', () => {
    expect(isChatPlayableMediaBody('hello')).toBe(false);
    expect(isChatPlayableMediaBody('[[im-image:photo.jpg]]')).toBe(false);
    expect(isChatPlayableMediaBody('[[im-file:report.pdf|report.pdf|1200]]')).toBe(false);
  });

  it('continues in conversation order across mixed audio and video messages', () => {
    const messages = [
      { id: 1, body: '[[im-audio:first.webm]]' },
      { id: 2, body: 'text between media' },
      { id: 3, body: '[[im-video:clip.mp4]]' },
      { id: 4, body: '[[im-image:photo.jpg]]' },
      { id: 5, body: '[[im-audio:last.m4a]]' },
    ];
    expect(findNextChatMediaMessageId(messages, 1)).toBe(3);
    expect(findNextChatMediaMessageId(messages, 3)).toBe(5);
    expect(findNextChatMediaMessageId(messages, 5)).toBeNull();
  });

  it('skips deleted media messages', () => {
    const messages = [
      { id: 1, body: '[[im-audio:first.webm]]' },
      { id: 2, body: '[[im-video:deleted.mp4]]', deleted_at: '2026-11-18T00:00:00Z' },
      { id: 3, body: '[[im-audio:next.webm]]' },
    ];
    expect(findNextChatMediaMessageId(messages, 1)).toBe(3);
  });

  it('does not start a new sequence when the finished message is absent', () => {
    expect(findNextChatMediaMessageId([
      { id: 3, body: '[[im-audio:next.webm]]' },
    ], 2)).toBeNull();
  });
});

describe('chat media autoplay policy errors', () => {
  it('identifies browser autoplay restrictions', () => {
    expect(isChatAutoplayBlocked({ name: 'NotAllowedError' })).toBe(true);
  });

  it('does not confuse unrelated media failures with autoplay restrictions', () => {
    expect(isChatAutoplayBlocked({ name: 'AbortError' })).toBe(false);
    expect(isChatAutoplayBlocked(new Error('network failed'))).toBe(false);
    expect(isChatAutoplayBlocked(null)).toBe(false);
  });
});
