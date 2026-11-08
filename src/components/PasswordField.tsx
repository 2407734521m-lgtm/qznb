import { useState } from 'react';
import type { FocusEventHandler, KeyboardEventHandler } from 'react';

type PasswordFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  disabled?: boolean;
  ariaLabel?: string;
  /** 显示密码强度条（注册/重设密码时用） */
  strength?: boolean;
};

export function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { score, label: '弱', color: '#d9534f' };
  if (score <= 3) return { score, label: '中', color: '#e0a458' };
  return { score, label: '强', color: '#4caf7d' };
}

/** Accessible password input with an explicit show/hide control. */
export default function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  onKeyDown,
  onBlur,
  disabled = false,
  ariaLabel = '密码',
  strength = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const s = strength && value ? passwordStrength(value) : null;

  return (
    <div className="password-field">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="password-reveal"
        onClick={() => setVisible(current => !current)}
        aria-label={visible ? '隐藏密码' : '显示密码'}
        aria-pressed={visible}
        disabled={disabled}
      >
        {visible ? '隐藏' : '显示'}
      </button>
      {s && (
        <div className="pw-strength" aria-live="polite">
          <span className="pw-strength-bar">
            <span style={{ width: `${(s.score / 5) * 100}%`, background: s.color }} />
          </span>
          <span className="pw-strength-txt" style={{ color: s.color }}>强度：{s.label}</span>
        </div>
      )}
    </div>
  );
}
