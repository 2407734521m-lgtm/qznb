import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from '../../lib/motion';

/**
 * BlurText（改编自 React Bits 的 BlurText 思路）：文字逐字从模糊中浮现。
 * 官方新版依赖 motion 包且实现较重，这里用项目已有的 framer-motion 复刻核心效果，
 * 避免引入第二个动画引擎。中文按字切分，英文按字（含空格）切分。
 * 系统开启「减少动态效果」时直接静态显示。
 */
export default function BlurText({ text, style, className }: {
  text: string;
  style?: React.CSSProperties;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pieces = useMemo(() => Array.from(text), [text]);
  if (reduce) return <span style={style} className={className}>{text}</span>;
  return (
    <span style={{ display: 'inline-block', ...style }} className={className} aria-label={text}>
      {pieces.map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden
          style={{ display: 'inline-block', willChange: 'transform, filter, opacity' }}
          initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.55, delay: 0.05 + i * 0.04, ease: EASE }}
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </span>
  );
}
