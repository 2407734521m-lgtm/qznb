import type { ReactNode } from 'react';

/**
 * 浮动标签字段：标签平时停在输入框内，聚焦或有内容后缩小上移到框内上方并一直显示，
 * 不再只靠占位符说明字段含义。children 放实际的输入控件（input 或 PasswordField）。
 * value 用于判断是否有内容（也可以只靠 :focus-within 处理聚焦态）。
 */
export default function FloatField({ label, value, children }: {
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className={`float-field${value ? ' has-value' : ''}`}>
      {children}
      <span className="float-tag" aria-hidden="true">{label}</span>
    </div>
  );
}
