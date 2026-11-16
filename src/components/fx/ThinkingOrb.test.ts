import { describe, expect, it } from 'vitest';
import { resolveThinkingOrbMotion } from './ThinkingOrb';
import { resolveVoiceGlow } from './VoiceGlow';

describe('resolveThinkingOrbMotion', () => {
  it('系统开了减少动态效果时小球静止，只留状态', () => {
    expect(resolveThinkingOrbMotion(true)).toEqual({ animate: false });
    expect(resolveThinkingOrbMotion(false)).toEqual({ animate: true });
  });
});

describe('resolveVoiceGlow', () => {
  it('平时不亮', () => {
    expect(resolveVoiceGlow({ recording: false, focused: false })).toBe('off');
  });

  it('输入框聚焦时淡淡一层', () => {
    expect(resolveVoiceGlow({ recording: false, focused: true })).toBe('focused');
  });

  it('录音时最亮，录音优先于聚焦', () => {
    expect(resolveVoiceGlow({ recording: true, focused: false })).toBe('recording');
    expect(resolveVoiceGlow({ recording: true, focused: true })).toBe('recording');
  });

  it('松开焦点、停掉录音就熄掉', () => {
    expect(resolveVoiceGlow({ recording: false, focused: true })).toBe('focused');
    expect(resolveVoiceGlow({ recording: false, focused: false })).toBe('off');
  });
});
