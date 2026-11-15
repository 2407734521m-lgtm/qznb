import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE } from '../lib/motion';

// 开场动画（方向一：品牌浮现）：C+M 字母标逐笔描出、金点落下、
// 站名逐字浮现、副标题 OUR CLASS, OUR STORY 淡入，约 3 秒。
// 每次冷打开播一次（同一标签页会话内只播一次），点按任意处跳过；
// 减弱动效时直接跳过不播。手机与桌面同一套，不用 WebGL。
const TITLE = 'Class Memory';
const SUBTITLE = 'OUR CLASS, OUR STORY';
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
        background: '#f7f8f8', cursor: 'pointer', overflow: 'hidden',
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ display: 'grid', placeItems: 'center' }}
      >
        <svg width={108} height={108} viewBox="0 0 120 120" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
          <rect width="120" height="120" rx="30" fill="#94664f" />
          <motion.path
            d="M52.9 43.5A21 21 0 1 0 52.9 76.5"
            fill="none" stroke="#fff7ec" strokeWidth="10" strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.15, duration: 0.9, ease: EASE }}
          />
          <motion.circle
            cx="40" cy="60" r="5" fill="#f0c27b"
            style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            initial={{ scale: 0, y: -8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ delay: 1.05, duration: 0.4, ease: EASE }}
          />
          <motion.path
            d="M70 78V42L86 64L102 42V78"
            fill="none" stroke="#fff7ec" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.55, duration: 0.9, ease: EASE }}
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
        style={{ marginTop: 16, fontSize: 13, fontWeight: 600, letterSpacing: '0.42em', textIndent: '0.42em', whiteSpace: 'nowrap', color: '#94664f' }}
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
