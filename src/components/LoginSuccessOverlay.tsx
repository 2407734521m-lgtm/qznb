import { motion, useReducedMotion } from 'framer-motion';

// 登录成功后保留轻量环境动效；它位于内容层下方，不拦截点击，也不遮挡页面。
export default function LoginSuccessOverlay({ onDone: _onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0.12 : 1.1, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        isolation: 'isolate',
      }}
    >
      <motion.div
        animate={reduce ? undefined : { rotate: 360, scale: [1, 1.035, 1] }}
        transition={reduce ? undefined : {
          rotate: { duration: 48, repeat: Infinity, ease: 'linear' },
          scale: { duration: 18, repeat: Infinity, ease: 'easeInOut' },
        }}
        style={{
          position: 'absolute',
          width: 'min(76vw, 760px)',
          aspectRatio: '1',
          top: '-28vw',
          right: '-25vw',
          borderRadius: '50%',
          border: '1px solid rgba(169,199,255,.12)',
          background: 'radial-gradient(circle, rgba(105,145,220,.12) 0%, rgba(105,145,220,.035) 42%, transparent 70%)',
          transform: 'translate3d(0,0,0)',
          willChange: reduce ? 'auto' : 'transform',
        }}
      >
        <span style={{
          position: 'absolute',
          inset: '12%',
          borderRadius: '50%',
          border: '1px solid rgba(196,218,255,.10)',
        }} />
      </motion.div>

      <motion.div
        animate={reduce ? undefined : { rotate: -360, scale: [1, 1.045, 1] }}
        transition={reduce ? undefined : {
          rotate: { duration: 62, repeat: Infinity, ease: 'linear' },
          scale: { duration: 23, repeat: Infinity, ease: 'easeInOut' },
        }}
        style={{
          position: 'absolute',
          width: 'min(64vw, 620px)',
          aspectRatio: '1',
          bottom: '-30vw',
          left: '-24vw',
          borderRadius: '50%',
          border: '1px solid rgba(130,190,190,.10)',
          background: 'radial-gradient(circle, rgba(66,170,165,.105) 0%, rgba(66,170,165,.025) 45%, transparent 72%)',
          transform: 'translate3d(0,0,0)',
          willChange: reduce ? 'auto' : 'transform',
        }}
      >
        <span style={{
          position: 'absolute',
          inset: '14%',
          borderRadius: '50%',
          border: '1px solid rgba(155,220,210,.09)',
        }} />
      </motion.div>
    </motion.div>
  );
}
