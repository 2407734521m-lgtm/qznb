import { describe, expect, it } from 'vitest';
import { createCallActionThrottle, isCurrentCallSession } from './callActionThrottle';

describe('createCallActionThrottle', () => {
  it('lets the first phase-changing action through', () => {
    const throttle = createCallActionThrottle(300);
    expect(throttle.tryRun(1000)).toBe(true);
  });

  it('drops a second action inside the window, even for a different button', () => {
    const throttle = createCallActionThrottle(300);
    expect(throttle.tryRun(1000)).toBe(true);
    // A fast double-tap: the second tap lands on the new phase's button.
    expect(throttle.tryRun(1150)).toBe(false);
    expect(throttle.tryRun(1299)).toBe(false);
  });

  it('lets actions through again once the window has passed', () => {
    const throttle = createCallActionThrottle(300);
    expect(throttle.tryRun(1000)).toBe(true);
    expect(throttle.tryRun(1300)).toBe(true);
  });

  it('drops only the repeats: a blocked tap does not extend the window', () => {
    const throttle = createCallActionThrottle(300);
    expect(throttle.tryRun(1000)).toBe(true);
    expect(throttle.tryRun(1100)).toBe(false);
    expect(throttle.tryRun(1299)).toBe(false);
    expect(throttle.tryRun(1300)).toBe(true);
  });
});

describe('isCurrentCallSession', () => {
  it('rejects late session events once teardown starts', () => {
    expect(isCurrentCallSession('call-1', 'call-1', false)).toBe(true);
    expect(isCurrentCallSession('call-1', 'call-1', true)).toBe(false);
    expect(isCurrentCallSession('call-1', 'call-2', false)).toBe(false);
  });
});
