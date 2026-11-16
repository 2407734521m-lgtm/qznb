import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * 浮动标签字段：标签平时停在输入框内，聚焦或有内容后缩小上移到框内上方并一直显示，
 * 不再只靠占位符说明字段含义。children 放实际的输入控件（input 或 PasswordField）。
 * value 用于判断是否有内容（也可以只靠 :focus-within 处理聚焦态）。
 * hint 是框下方常驻的一行灰色帮助字，提前说明填写要求，输入时不消失。
 *
 * 校验失败抖动：每次失焦校验失败都重新抖一次（见 styles-form-ux.css 的
 * .float-field.is-shaking）。报错文案只在 error 从无到有时才重新挂载，
 * 所以“改对了再改错”能靠挂载抖；但“一直错着、再次失焦”时 error 不变、
 * 元素不重挂——用 onBlurCapture 在失焦那一刻（此时 error 还是失焦前的值）
 * 判断：已经有错就再抖一次。两条路径同一事件只会走一条，不会一次失焦抖两次。
 * 抖动只动整格 transform，不重新挂载 children，不丢焦点与密码可见状态。
 */
export default function FloatField({ label, value, hint, error, children }: {
  label: string;
  value?: string;
  hint?: string;
  /** 框正下方的报错文案（失焦校验后显示），有报错时盖过帮助字 */
  error?: string;
  children: ReactNode;
}) {
  const [shakeTick, setShakeTick] = useState(0);
  const [shaking, setShaking] = useState(false);
  const prevErrorRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (error && !prevErrorRef.current) setShakeTick(t => t + 1);
    prevErrorRef.current = error;
  }, [error]);
  useEffect(() => {
    if (shakeTick === 0) return;
    // 先撤下 class、下一拍再挂上，否则 class 一直挂着动画不会重播；
    // 抖完（420ms 动画 + 余量）撤下，下一轮才能再触发。
    setShaking(false);
    const on = window.setTimeout(() => setShaking(true), 30);
    const off = window.setTimeout(() => setShaking(false), 520);
    return () => { window.clearTimeout(on); window.clearTimeout(off); };
  }, [shakeTick]);
  return (
    <div
      className={`float-field${value ? ' has-value' : ''}${error ? ' has-error' : ''}${shaking ? ' is-shaking' : ''}`}
      onBlurCapture={() => { if (error) setShakeTick(t => t + 1); }}
    >
      {children}
      <span className="float-tag" aria-hidden="true">{label}</span>
      {error ? <span key={shakeTick} className="float-error" role="alert">{error}</span>
        : hint ? <span className="float-hint">{hint}</span> : null}
    </div>
  );
}
