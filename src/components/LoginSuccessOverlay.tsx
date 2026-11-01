import { motion, useReducedMotion } from 'framer-motion';

type LoginSuccessOverlayProps = {
  realName: string;
  durationMs: number;
  onDone: () => void;
};

/** A private login bridge whose pacing follows the measured authentication time. */
export default function LoginSuccessOverlay({ realName, durationMs, onDone }: LoginSuccessOverlayProps) {
  const reduce = useReducedMotion();
  const duration = reduce ? 0.16 : Math.min(3.4, Math.max(1.35, 0.9 + Math.max(0, durationMs) / 1000 * 0.35));
  const fadeAt = 0.76;
  const nameChars = Array.from(realName.trim());
  const maskedName = nameChars.length ? `${nameChars[0]}${'*'.repeat(Math.max(0, nameChars.length - 1))}` : '同学';

  return (
    <motion.div
      role="status"
      aria-label="登录成功，正在进入青春档案"
      initial={{ opacity: 1 }}
      animate={reduce ? { opacity: 0 } : { opacity: [1, 1, 0] }}
      transition={reduce ? { duration, ease: [0.22, 1, 0.36, 1] } : { duration, times: [0, fadeAt, 1], ease: 'easeInOut' }}
      onAnimationComplete={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center',
        overflow: 'hidden',
        padding: 'calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px)',
        pointerEvents: 'auto', isolation: 'isolate', color: '#173d4b',
        background: 'radial-gradient(ellipse at 50% 42%, rgba(72, 202, 190, .20), transparent 34%), radial-gradient(ellipse at 82% 14%, rgba(128, 188, 232, .18), transparent 38%), rgba(242, 249, 249, .78)',
        backdropFilter: 'blur(18px) saturate(1.28)', WebkitBackdropFilter: 'blur(18px) saturate(1.28)',
      }}
    >
      {!reduce && (
        <>
          <motion.div aria-hidden="true" initial={{ opacity: 0.34, scale: 0.62 }} animate={{ opacity: 0, scale: 1.62 }}
            transition={{ duration: duration * 0.72, ease: 'easeOut', delay: duration * 0.05 }}
            style={{ position: 'absolute', width: 190, height: 190, borderRadius: '50%', border: '1px solid rgba(59, 177, 171, .28)', boxShadow: '0 0 44px rgba(74, 193, 184, .10)', pointerEvents: 'none' }} />
          <motion.div aria-hidden="true" initial={{ opacity: 0.22, scale: 0.72 }} animate={{ opacity: 0, scale: 2.08 }}
            transition={{ duration: duration * 0.8, ease: 'easeOut', delay: duration * 0.12 }}
            style={{ position: 'absolute', width: 190, height: 190, borderRadius: '50%', border: '1px solid rgba(106, 164, 207, .20)', pointerEvents: 'none' }} />
        </>
      )}

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 18, scale: 0.86 }}
        animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: [18, 0, 0, -8], scale: [0.86, 1, 1.015, 1.06] }}
        transition={reduce ? { duration: 0.12 } : { duration, times: [0, 0.2, fadeAt, 1], ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative', zIndex: 1, width: 'min(100%, 340px)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', willChange: reduce ? 'auto' : 'transform, opacity' }}
      >
        <div style={{
          width: 72, height: 72, display: 'grid', placeItems: 'center', marginBottom: 20,
          borderRadius: 24, color: '#f6ffff', fontSize: 30, fontWeight: 850, letterSpacing: '-.08em',
          background: 'linear-gradient(145deg, #55cbbd 0%, #359caa 52%, #478fc1 100%)',
          border: '1px solid rgba(255,255,255,.72)',
          boxShadow: '0 16px 40px rgba(39, 144, 151, .24), inset 0 1px 0 rgba(255,255,255,.55)',
        }}>青</div>

        <div style={{ marginBottom: 9, color: 'rgba(34, 111, 119, .72)', fontSize: 9, fontWeight: 800, letterSpacing: '.28em' }}>
          YOUR SPACE, RECONNECTED
        </div>
        <div style={{ color: '#173d4b', fontSize: 'clamp(23px, 6vw, 27px)', fontWeight: 850, letterSpacing: '-.045em', lineHeight: 1.2 }}>
          欢迎回来
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8, filter: 'blur(7px)' }}
          animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: [8, 0, 0, -4], filter: ['blur(7px)', 'blur(0px)', 'blur(0px)', 'blur(3px)'] }}
          transition={reduce ? { duration: 0.12 } : { duration: duration * 0.78, delay: duration * 0.12, times: [0, 0.28, 0.82, 1], ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            maxWidth: '100%', marginTop: 14, padding: '9px 15px', borderRadius: 999,
            border: '1px solid rgba(69, 157, 159, .18)', background: 'rgba(255,255,255,.48)',
            boxShadow: '0 8px 24px rgba(44,112,119,.08)',
          }}
        >
          <span style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#245d68', fontSize: 17, fontWeight: 800, letterSpacing: '.04em' }}>
            {maskedName}
          </span>
          <span title="隐私保护" aria-label="隐私保护" style={{ display: 'inline-flex', alignItems: 'center', color: '#438d91' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 12c2.4 2.7 5.4 4 9 4s6.6-1.3 9-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="m7 8-1.2-1.5M12 7V5M17 8l1.2-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </motion.div>
        <div style={{ marginTop: 8, color: 'rgba(39, 82, 96, .62)', fontSize: 11, fontWeight: 600, letterSpacing: '.06em' }}>
          仅自己与管理员可见 · 不向其他成员公开
        </div>
        <div style={{ marginTop: 10, color: 'rgba(39, 82, 96, .70)', fontSize: 12, fontWeight: 600, letterSpacing: '.08em' }}>
          正在进入青春档案
        </div>

        <div aria-hidden="true" style={{ width: 112, height: 3, marginTop: 25, overflow: 'hidden', borderRadius: 999, background: 'rgba(37, 105, 116, .12)' }}>
          <motion.div initial={{ width: '0%' }} animate={{ width: '100%' }}
            transition={reduce ? { duration: 0.08 } : { duration: duration * 0.72, delay: duration * 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #4cc9b8, #61a9d8)', boxShadow: '0 0 12px rgba(73, 191, 183, .34)' }} />
        </div>
      </motion.div>
    </motion.div>
  );
}
