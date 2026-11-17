import { describe, expect, it } from 'vitest';
import { formatChatTypingLabel, parseChatTypingPayload } from './chatTyping';

describe('chat typing events', () => {
  it('parses identified typing signals', () => {
    expect(parseChatTypingPayload({ typing: true, profileId: 'member-1' })).toEqual({
      typing: true,
      profileId: 'member-1',
    });
  });

  it('keeps compatibility with older signals without a profile id', () => {
    expect(parseChatTypingPayload({ typing: false })).toEqual({
      typing: false,
      profileId: null,
    });
  });

  it('rejects malformed payloads', () => {
    expect(parseChatTypingPayload(null)).toBeNull();
    expect(parseChatTypingPayload({ typing: 'true' })).toBeNull();
    expect(parseChatTypingPayload('typing')).toBeNull();
  });

  it('uses a single-person label for direct chats', () => {
    expect(formatChatTypingLabel(['Alex'], false)).toBe('正在输入…');
    expect(formatChatTypingLabel([], false)).toBe('');
  });

  it('names one or two active group members and summarizes larger groups', () => {
    expect(formatChatTypingLabel(['小明'], true)).toBe('小明 正在输入…');
    expect(formatChatTypingLabel(['小明', '小红'], true)).toBe('小明、小红 正在输入…');
    expect(formatChatTypingLabel(['小明', '小红', '小刚'], true)).toBe('小明、小红 等 3 人正在输入…');
  });

  it('deduplicates and ignores empty display names', () => {
    expect(formatChatTypingLabel(['小明', '小明', '  '], true)).toBe('小明 正在输入…');
  });
});
