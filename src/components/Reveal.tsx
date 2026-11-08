import { motion, useReducedMotion } from 'framer-motion';
import { EASE, DUR } from '../lib/motion';

// 通用分段揭示：首屏用 enter（挂载即播），下方内容用 inview（滚到才播一次）。
export default function Reveal({ children, delay = 0, y = 18, enter = false, className, style }: {
  children: React.ReactNode; delay?: number; y?: number; enter?: boolean;
  className?: string; style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  const initial = reduce ? false : { opacity: 0, y };
  const animate = reduce ? {} : { opacity: 1, y: 0 };
  const transition = { duration: DUR.slow, delay, ease: EASE };
  if (enter) {
    return <motion.div className={className} style={style} initial={initial} animate={animate} transition={transition}>{children}</motion.div>;
  }
  return (
    <motion.div className={className} style={style} initial={initial} whileInView={animate}
      viewport={{ once: true, margin: '-40px' }} transition={transition}>{children}</motion.div>
  );
}
