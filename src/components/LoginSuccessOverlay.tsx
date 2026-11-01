import { motion, useReducedMotion } from 'framer-motion';

type LoginSuccessOverlayProps = {
  onDone: () => void;
};

/**
 * A short visual bridge between the authenticated login screen and the app.
 * Framer Motion is already part of the app's stack, so this stays dependency-free.
 */
export default function LoginSuccessOverlay({ onDone }: LoginSuccessOverlayProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 1 }}
      animate={reduce ? { opacity: 0 } : { opacity: [1, 1, 0] }}
      transition={reduce
        ? { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
        : { duration: 1.48, times: [0, 0.64, 1], ease: 'easeInOut' }}
      onAnimationComplete={onDone}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        padding: 'calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px)',
        pointerEvents: 'auto',
        isolation: 'isolate',
        color: '#173d4b',
        background: 'radial-gradient(ellipse at 50% 42%, rgba(72, 202, 190, .20), transparent 34%), radial-gradient(ellipse at 82% 14%, rgba(128, 188, 232, .18), transparent 38%), rgba(242, 249, 249, .78)',
        backdropFilter: 'blur(18px) saturate(1.28)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.28)',
      }}
    >
      {!reduce && (
        <>
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0.34, scale: 0.62 }}
            animate={{ opacity: 0, scale: 1.62 }}
            transition={{ duration: 1.02, ease: 'easeOut', delay: 0.08 }}
            style={{
              position: 'absolute',
              width: 190,
              height: 190,
              borderRadius: '50%',
              border: '1px solid rgba(59, 177, 171, .28)',
              boxShadow: '0 0 44px rgba(74, 193, 184, .10)',
              pointerEvents: 'none',
            }}
          />
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0.22, scale: 0.72 }}
            animate={{ opacity: 0, scale: 2.08 }}
            transition={{ duration: 1.12, ease: 'easeOut', delay: 0.2 }}
            style={{
              position: 'absolute',
              width: 190,
              height: 190,
              borderRadius: '50%',
              border: '1px solid rgba(106, 164, 207, .20)',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18, scale: 0.86 }}
        animate={reduce
          ? { opacity: 1 }
          : { opacity: [0, 1, 1, 0], y: [18, 0, 0, -8], scale: [0.86, 1, 1.015, 1.06] }}
        transition={reduce
          ? { duration: 0.12 }
          : { duration: 1.28, times: [0, 0.24, 0.72, 1], ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(100%, 320px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          willChange: reduce ? 'auto' : 'transform, opacity',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            display: 'grid',
            placeItems: 'center',
            marginBottom: 20,
            borderRadius: 24,
            color: '#f6ffff',
            fontSize: 30,
            fontWeight: 850,
            letterSpacing: '-.08em',
            background: 'linear-gradient(145deg, #55cbbd 0%, #359caa 52%, #478fc1 100%)',
            border: '1px solid rgba(255,255,255,.72)',
            boxShadow: '0 16px 40px rgba(39, 144, 151, .24), inset 0 1px 0 rgba(255,255,255,.55)',
          }}
        >
          青
        </div>

        <div
          style={{
            marginBottom: 9,
            color: 'rgba(34, 111, 119, .72)',
            fontSize: 9,
            fontWeight: 800,
            letterSpacing: '.28em',
          }}
        >
          YOUR SPACE, RECONNECTED
        </div>
        <div
          style={{
            color: '#173d4b',
            fontSize: 'clamp(23px, 6vw, 27px)',
            fontWeight: 850,
            letterSpacing: '-.045em',
            lineHeight: 1.2,
          }}
        >
          欢迎回来
        </div>
        <div
          style={{
            marginTop: 10,
            color: 'rgba(39, 82, 96, .70)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '.08em',
          }}
        >
          正在进入青春档案
        </div>

        <div
          aria-hidden="true"
          style={{
            width: 112,
            height: 3,
            marginTop: 25,
            overflow: 'hidden',
            borderRadius: 999,
            background: 'rgba(37, 105, 116, .12)',
          }}
        >
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={reduce
              ? { duration: 0.08 }
              : { duration: 0.92, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, #4cc9b8, #61a9d8)',
              boxShadow: '0 0 12px rgba(73, 191, 183, .34)',
            }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
