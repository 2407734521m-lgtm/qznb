import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export default function LoginSuccessOverlay({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const timer = window.setTimeout(onDone, reduce ? 500 : 1450);
    return () => window.clearTimeout(timer);
  }, [onDone, reduce]);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label="登录成功"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.28, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 550, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
        background: 'radial-gradient(ellipse at 50% 38%, rgba(45,61,94,.94) 0%, rgba(10,13,21,.97) 62%, rgba(5,6,10,.985) 100%)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        color: '#f5f7ff', textAlign: 'center',
      }}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12, scale: 0.975 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduce ? 0.12 : 0.38, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 360 }}
      >
        <div aria-hidden="true" style={{
          width: 76, height: 76, margin: '0 auto 22px', borderRadius: 25,
          display: 'grid', placeItems: 'center', position: 'relative',
          border: '1px solid rgba(196,218,255,.4)',
          background: 'linear-gradient(145deg,rgba(182,208,255,.2),rgba(83,110,163,.06))',
          boxShadow: '0 0 42px rgba(130,170,255,.14)', color: '#dce8ff',
          fontSize: 30,
        }}>
          <motion.span
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
            style={{ position: 'absolute', inset: -7, border: '1px solid rgba(169,199,255,.38)', borderRadius: 29 }}
          />
          <span style={{ position: 'relative' }}>✦</span>
        </div>
        <div style={{ fontSize: 10, letterSpacing: 4, color: '#aabfe8', marginBottom: 12 }}>CLASS MEMORY</div>
        <h1 style={{ fontSize: 27, lineHeight: 1.35, margin: '0 0 10px', fontWeight: 760 }}>欢迎回来</h1>
        <p style={{ color: '#c4cede', fontSize: 14, lineHeight: 1.8, margin: '0 0 25px' }}>
          我们的班级 · 青春档案
        </p>
        <button
          type="button"
          onClick={onDone}
          style={{
            padding: '10px 20px', borderRadius: 999,
            border: '1px solid rgba(205,222,255,.28)',
            background: 'rgba(255,255,255,.055)', color: '#dce8ff',
            fontSize: 12, cursor: 'pointer',
          }}
        >直接进入</button>
      </motion.div>
    </motion.div>
  );
}
