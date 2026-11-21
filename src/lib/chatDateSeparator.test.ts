import { describe, expect, it } from 'vitest';
import { parseChatDateOnlyLabel } from './chatDateSeparator';

describe('parseChatDateOnlyLabel', () => {
  const now = new Date(2026, 10, 21, 12, 0);

  it('turns a legacy date-only body into a centered date/time label', () => {
    expect(parseChatDateOnlyLabel('2026年11月17日', '2026-11-17T09:54:00', now))
      .toBe('11月17日周二 · 09:54');
  });

  it('uses relative wording for today and yesterday', () => {
    expect(parseChatDateOnlyLabel('2026年11月21日', '2026-11-21T09:37:00', now))
      .toBe('今天 · 09:37');
    expect(parseChatDateOnlyLabel('2026年11月20日', '2026-11-20T09:37:00', now))
      .toBe('昨天 · 09:37');
  });

  it('accepts an explicit time embedded in the legacy date body', () => {
    expect(parseChatDateOnlyLabel('2026年11月17日 10:08', '2026-11-17T09:54:00', now))
      .toBe('11月17日周二 · 10:08');
  });

  it('does not convert ordinary text or impossible dates', () => {
    expect(parseChatDateOnlyLabel('2026年11月17日到了', '2026-11-17T09:54:00', now)).toBeNull();
    expect(parseChatDateOnlyLabel('2026年2月30日', '2026-02-28T09:54:00', now)).toBeNull();
    expect(parseChatDateOnlyLabel('你好', '2026-11-17T09:54:00', now)).toBeNull();
  });
});
