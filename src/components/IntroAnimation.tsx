import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from '../lib/motion';
import { BRAND_NAME, BRAND_SUBTITLE } from '../lib/brand';

// 开场动画：Q 品牌标志描边、站名逐字浮现、副标题淡入，约 3 秒。
// 每次冷打开播一次（同一标签页会话内只播一次），点按任意处跳过；
// 减弱动效时直接跳过不播。手机与桌面同一套，不用 WebGL。
const TITLE = BRAND_NAME;
const SUBTITLE = BRAND_SUBTITLE.toUpperCase();
const AUTO_DONE_MS = 2900;
const EXIT_MS = 450;

export default function IntroAnimation({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  function finish(quick: boolean) {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    const t = window.setTimeout(onDone, quick ? 140 : EXIT_MS);
    timersRef.current.push(t);
  }

  useEffect(() => {
    if (reduce) {
      onDone();
      return;
    }
    const auto = window.setTimeout(() => finish(false), AUTO_DONE_MS);
    timersRef.current.push(auto);
    const onVis = () => {
      if (document.visibilityState === 'hidden') finish(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      document.removeEventListener('visibilitychange', onVis);
    };
    // onDone 在挂载后不变；finish 只走一次，由 doneRef 守住。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  if (reduce) return null;

  const letters = Array.from(TITLE);
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="开场动画，点击跳过"
      onClick={() => finish(true)}
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: leaving ? EXIT_MS / 1000 : 0.3, ease: EASE }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#ffffff', cursor: 'pointer', overflow: 'hidden',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <svg width={108} height={108} viewBox="0 0 120 120" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
          <rect width="120" height="120" rx="30" fill="#1f2a3a" />
          <motion.circle
            cx="56" cy="54" r="27"
            fill="none" stroke="#ffffff" strokeWidth="10"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.2, duration: 0.95, ease: EASE }}
          />
          <motion.path
            d="M75 74 94 94"
            fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.85, duration: 0.45, ease: EASE }}
          />
        </svg>
      </motion.div>

      <h1 aria-label={TITLE} style={{ margin: '26px 0 0', fontSize: 'clamp(30px, 8vw, 38px)', lineHeight: 1.15, fontWeight: 800, letterSpacing: '-0.02em', color: '#1f2a3a' }}>
        {letters.map((ch, i) =>
          ch === ' ' ? (
            <span key={i} style={{ display: 'inline-block', width: 10 }} />
          ) : (
            <motion.span key={i} aria-hidden="true"
              style={{ display: 'inline-block' }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.25 + i * 0.045, duration: 0.5, ease: EASE }}
            >
              {ch}
            </motion.span>
          ),
        )}
      </h1>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.95, duration: 0.6, ease: EASE }}
        style={{ marginTop: 16, fontSize: 13, fontWeight: 600, letterSpacing: '0.42em', textIndent: '0.42em', whiteSpace: 'nowrap', color: '#526b8c' }}
      >
        {SUBTITLE}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        style={{ position: 'absolute', bottom: 44, fontSize: 11, letterSpacing: '0.2em', color: '#9aa5ad' }}
      >
        轻触跳过
      </motion.div>
    </motion.div>
  );
}
