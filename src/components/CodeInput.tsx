import { useRef } from 'react';

/**
 * 6 位验证码分格输入：逐格输入自动跳下一格，删除退回上一格，
 * 支持一次粘贴整串验证码，第一格带 one-time-code 以便系统自动填入短信/邮件验证码。
 * 受控组件：value 是纯数字字符串（可短于 length），onChange 回传新值。
 */
export default function CodeInput({ value, onChange, onEnter, autoFocus = false, disabled = false, length = 6 }: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
  length?: number;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  const focusBox = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(i, length - 1))];
    el?.focus();
    el?.select();
  };

  const writeFrom = (start: number, text: string) => {
    const d = text.replace(/\D/g, '');
    const next = digits.slice();
    if (!d) {
      next[start] = '';
      onChange(next.join(''));
      return;
    }
    let idx = start;
    for (const ch of d) {
      if (idx >= length) break;
      next[idx] = ch;
      idx += 1;
    }
    onChange(next.join('').slice(0, length));
    focusBox(Math.min(idx, length - 1));
  };

  return (
    <div
      className="code-input"
      role="group"
      aria-label="验证码"
      onPaste={e => {
        e.preventDefault();
        writeFrom(0, e.clipboardData.getData('text'));
      }}
    >
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`验证码第 ${i + 1} 位`}
          maxLength={1}
          value={digit}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          onChange={e => writeFrom(i, e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => {
            if (e.key === 'Enter') { onEnter?.(); return; }
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (digits[i]) {
                const next = digits.slice();
                next[i] = '';
                onChange(next.join(''));
              } else if (i > 0) {
                const next = digits.slice();
                next[i - 1] = '';
                onChange(next.join(''));
                focusBox(i - 1);
              }
              return;
            }
            if (e.key === 'ArrowLeft') { e.preventDefault(); focusBox(i - 1); }
            if (e.key === 'ArrowRight') { e.preventDefault(); focusBox(i + 1); }
          }}
        />
      ))}
    </div>
  );
}
