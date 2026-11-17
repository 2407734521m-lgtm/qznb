import { describe, expect, it } from 'vitest';
import {
  getChatBubbleEffect,
  stripChatBubbleEffect,
  withChatBubbleEffect,
  getScreenEffectKind,
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

  it('recognizes screen effects separately from bubble effects', () => {
    const body = withChatBubbleEffect('celebrate', 'screen-fireworks');
    expect(getChatBubbleEffect(body)).toBe('screen-fireworks');
    expect(getScreenEffectKind(body)).toBe('fireworks');
    expect(stripChatBubbleEffect(body)).toBe('celebrate');
    expect(getScreenEffectKind(withChatBubbleEffect('hello', 'slam'))).toBeNull();
  });
});
