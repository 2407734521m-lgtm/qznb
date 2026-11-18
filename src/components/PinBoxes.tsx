import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from 'react';

interface PinBoxesProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** 满 6 位时回调，参数为完整 6 位数字；只在用户输入/粘贴凑满时触发一次。 */
  onComplete?: (value: string) => void;
  onEnterKey?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
  /** 无障碍读屏前缀，默认“二级密码”。 */
  label?: string;
}

const BOX_COUNT = 6;

// 设计 token（DESIGN.md §3.1）：边框 #E7EAEE、加粗边框 #D5DAE0、
// 焦点 #4776B8、主文字 #20242A、次级表面 #F6F7F8；圆角 8px 为紧凑输入刻度。
const BOX_BASE: React.CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  height: 52,
  padding: 0,
  textAlign: 'center',
  fontSize: 20,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  color: '#20242A',
  background: '#ffffff',
  border: '1px solid #E7EAEE',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
};

export default function PinBoxes({
  id,
  value,
  onChange,
  onComplete,
  onEnterKey,
  disabled = false,
  autoFocus = false,
  autoComplete = 'one-time-code',
  label = '二级密码',
}: PinBoxesProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const completedRef = useRef('');

  const digits = value.replace(/\D/g, '').slice(0, BOX_COUNT);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const target = digits.length < BOX_COUNT ? digits.length : BOX_COUNT - 1;
    inputsRef.current[target]?.focus();
    // 只在挂载时自动聚焦一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function focusBox(index: number) {
    const target = Math.max(0, Math.min(BOX_COUNT - 1, index));
    inputsRef.current[target]?.focus();
  }

  function emit(next: string) {
    const clean = next.replace(/\D/g, '').slice(0, BOX_COUNT);
    onChange(clean);
    if (clean.length === BOX_COUNT) {
      if (completedRef.current !== clean) {
        completedRef.current = clean;
        onComplete?.(clean);
      }
    } else {
      completedRef.current = '';
    }
  }

  function handleChange(index: number, event: ChangeEvent<HTMLInputElement>) {
    if (disabled) return;
    const typed = event.target.value.replace(/\D/g, '');
    if (!typed) return;
    // 取最后一位：覆盖已有数字、或输入法一次送入多位时都只取一位。
    const digit = typed.slice(-1);
    const next = digits.split('');
    while (next.length < BOX_COUNT) next.push('');
    next[index] = digit;
    emit(next.join(''));
    if (index < BOX_COUNT - 1) focusBox(index + 1);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = digits.split('');
      while (next.length < BOX_COUNT) next.push('');
      if (next[index]) {
        next[index] = '';
        emit(next.join(''));
      } else if (index > 0) {
        next[index - 1] = '';
        emit(next.join(''));
        focusBox(index - 1);
      }
    } else if (event.key === 'Delete') {
      event.preventDefault();
      const next = digits.split('');
      while (next.length < BOX_COUNT) next.push('');
      if (next[index]) {
        next[index] = '';
        emit(next.join(''));
      }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (index > 0) focusBox(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (index < BOX_COUNT - 1) focusBox(index + 1);
    } else if (event.key === 'Enter') {
      onEnterKey?.();
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    if (disabled) return;
    const pasted = (event.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    if (!pasted) return;
    event.preventDefault();
    const next = digits.split('');
    while (next.length < BOX_COUNT) next.push('');
    const room = BOX_COUNT - index;
    const chunk = pasted.slice(0, room);
    for (let i = 0; i < chunk.length; i += 1) next[index + i] = chunk[i];
    emit(next.join(''));
    const filled = next.join('').length;
    focusBox(filled < BOX_COUNT ? filled : BOX_COUNT - 1);
  }

  function handleFocus(index: number) {
    setFocusIndex(index);
    const input = inputsRef.current[index];
    if (input && input.value) {
      try { input.select(); } catch { /* 旧设备可能不支持 select */ }
    }
  }

  return (
    <div
      role="group"
      aria-label={label}
      style={{ display: 'flex', gap: 8, width: '100%' }}
    >
      {Array.from({ length: BOX_COUNT }, (_, index) => {
        const filled = Boolean(digits[index]);
        const focused = focusIndex === index;
        return (
          <input
            key={index}
            ref={(element) => { inputsRef.current[index] = element; }}
            id={index === 0 ? id : `${id}-${index + 1}`}
            type="password"
            inputMode="numeric"
            autoComplete={index === 0 ? autoComplete : 'off'}
            aria-label={`${label}第 ${index + 1} 位数字`}
            value={digits[index] ?? ''}
            disabled={disabled}
            onChange={(event) => handleChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={() => handleFocus(index)}
            onBlur={() => setFocusIndex((current) => (current === index ? null : current))}
            style={{
              ...BOX_BASE,
              borderColor: focused ? '#4776B8' : filled ? '#D5DAE0' : '#E7EAEE',
              boxShadow: focused ? '0 0 0 3px rgba(71, 118, 184, 0.15)' : 'none',
              background: disabled ? '#F6F7F8' : '#ffffff',
              opacity: disabled ? 0.6 : 1,
            }}
          />
        );
      })}
    </div>
  );
}
