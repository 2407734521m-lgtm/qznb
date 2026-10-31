import { useState } from 'react';
import type { KeyboardEventHandler } from 'react';

type PasswordFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  disabled?: boolean;
  ariaLabel?: string;
};

/** Accessible password input with an explicit show/hide control. */
export default function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  onKeyDown,
  disabled = false,
  ariaLabel = '密码',
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
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
    </div>
  );
}
