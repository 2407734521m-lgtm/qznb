import './VoiceGlow.css';

/**
 * 语音光晕（借 Libraries.dev voice-glow 的形态重写，未抄源码、不装包）：
 * 贴在私聊输入框底部的一道微光。录音时最亮、缓慢呼吸；输入框聚焦时
 * 淡淡一层；平时没有。只做视觉提示，不新造语音功能。
 *
 * 形态来源：Libraries.dev（github.com/Jakubantalik/Libraries.dev，MIT），
 * 用现有 CSS 自己写，没装 voice-glow。
 */

export type VoiceGlowState = 'off' | 'focused' | 'recording';

/**
 * 光晕只在聚焦或录音时出现：录音优先于聚焦，两者都没有就熄掉。
 */
export function resolveVoiceGlow(input: { recording: boolean; focused: boolean }): VoiceGlowState {
  if (input.recording) return 'recording';
  if (input.focused) return 'focused';
  return 'off';
}

export interface VoiceGlowProps {
  state: VoiceGlowState;
}

export default function VoiceGlow({ state }: VoiceGlowProps) {
  if (state === 'off') return null;
  return (
    <div
      className={`fx-voice-glow fx-voice-glow--${state}`}
      aria-hidden="true"
    />
  );
}
