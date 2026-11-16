import { motion, useReducedMotion } from 'framer-motion';
import './ThinkingOrb.css';

/**
 * 思考小球（借 Libraries.dev thinking-orbs 的形态重写，未抄源码、不装包）：
 * 三颗小球依次起伏，表示“正在想 / 正在加载”；系统开了减少动态效果时
 * 小球静止不动，只留文字说明状态，状态本身不能丢。
 *
 * 形态来源：Libraries.dev（github.com/Jakubantalik/Libraries.dev，MIT），
 * 用现有 framer-motion + CSS 自己写，没装 thinking-orbs。
 */

/** 减动效时不播动画，返回静态态。useReducedMotion 可能返回 null，按未减动效算。 */
export function resolveThinkingOrbMotion(reduceMotion: boolean | null): { animate: boolean } {
  return { animate: !reduceMotion };
}

export interface ThinkingOrbProps {
  /** 读屏与可见文案，默认“正在加载…”。 */
  label?: string;
}

export default function ThinkingOrb({ label = '正在加载…' }: ThinkingOrbProps) {
  const reduceMotion = useReducedMotion();
  const { animate } = resolveThinkingOrbMotion(reduceMotion);
  return (
    <div className="fx-thinking-orb" role="status" aria-label={label}>
      <span className="fx-thinking-orb-dots" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            className="fx-thinking-orb-dot"
            initial={false}
            animate={animate ? { y: [0, -6, 0], opacity: [0.35, 1, 0.35] } : { y: 0, opacity: 0.6 }}
            transition={animate
              ? { duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }
              : { duration: 0.01 }}
          />
        ))}
      </span>
      <span className="fx-thinking-orb-label">{label}</span>
    </div>
  );
}
