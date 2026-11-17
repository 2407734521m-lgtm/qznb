import { describe, expect, it } from 'vitest';
import {
  getChatBubbleEffect,
  stripChatBubbleEffect,
  withChatBubbleEffect,
  getScreenEffectKind,
  type ScreenEffectKind,
} from './chatMessageEffect';

describe('chat bubble effect message markers', () => {
  it('adds, reads, and strips an effect marker', () => {
    const body = withChatBubbleEffect('hello', 'invisible-ink');
    expect(body).toBe('[[im-bubble-effect:invisible-ink]]hello');
    expect(getChatBubbleEffect(body)).toBe('invisible-ink');
    expect(stripChatBubbleEffect(body)).toBe('hello');
  });

  it('keeps plain text unchanged', () => {
    expect(getChatBubbleEffect('hello')).toBeNull();
    expect(stripChatBubbleEffect('hello')).toBe('hello');
    expect(withChatBubbleEffect('hello', null)).toBe('hello');
  });

  it('does not strip unknown or malformed marker-like text', () => {
    const invalid = '[[im-bubble-effect:unknown]]hello';
    expect(getChatBubbleEffect(invalid)).toBeNull();
    expect(stripChatBubbleEffect(invalid)).toBe(invalid);
  });

  it('preserves the full effect marker length for database payload limits', () => {
    expect(withChatBubbleEffect('', 'invisible-ink').length).toBe(34);
  });

  it('recognizes all eight screen effects separately from bubble effects', () => {
    const kinds: ScreenEffectKind[] = [
      'echo', 'spotlight', 'balloons', 'confetti',
      'love', 'lasers', 'fireworks', 'celebration',
    ];
    for (const kind of kinds) {
      const body = withChatBubbleEffect('celebrate', `screen-${kind}`);
      expect(getChatBubbleEffect(body)).toBe(`screen-${kind}`);
      expect(getScreenEffectKind(body)).toBe(kind);
      expect(stripChatBubbleEffect(body)).toBe('celebrate');
      expect(withChatBubbleEffect('', `screen-${kind}`).length).toBeLessThan(50);
    }
    expect(getScreenEffectKind(withChatBubbleEffect('hello', 'slam'))).toBeNull();
  });
});
