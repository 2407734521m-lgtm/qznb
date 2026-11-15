import { afterEach, describe, expect, it, vi } from 'vitest';
import { haptic, setHapticsEnabled } from './haptics';

afterEach(() => {
  vi.unstubAllGlobals();
  setHapticsEnabled(true);
});

describe('haptic', () => {
  it('vibrates with a short pulse when supported', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate, userActivation: { hasBeenActive: true } });
    expect(haptic('tick')).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(8);
    haptic('alert');
    expect(vibrate).toHaveBeenLastCalledWith([14, 70, 14]);
  });

  it('does nothing when switched off', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate, userActivation: { hasBeenActive: true } });
    setHapticsEnabled(false);
    expect(haptic('tick')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('waits for the first tap and tolerates missing support', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate, userActivation: { hasBeenActive: false } });
    expect(haptic('tick')).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', {});
    expect(haptic('tick')).toBe(false);
  });
});
