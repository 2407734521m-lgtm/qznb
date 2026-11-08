import type { ReactNode } from 'react';

/**
 * 浮动标签字段：标签平时停在输入框内，聚焦或有内容后缩小上移到框内上方并一直显示，
 * 不再只靠占位符说明字段含义。children 放实际的输入控件（input 或 PasswordField）。
 * value 用于判断是否有内容（也可以只靠 :focus-within 处理聚焦态）。
 * hint 是框下方常驻的一行灰色帮助字，提前说明填写要求，输入时不消失。
 */
export default function FloatField({ label, value, hint, error, children }: {
  label: string;
  value?: string;
  hint?: string;
  /** 框正下方的报错文案（失焦校验后显示），有报错时盖过帮助字 */
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={`float-field${value ? ' has-value' : ''}${error ? ' has-error' : ''}`}>
      {children}
      <span className="float-tag" aria-hidden="true">{label}</span>
      {error ? <span className="float-error" role="alert">{error}</span>
        : hint ? <span className="float-hint">{hint}</span> : null}
    </div>
  );
}
