import { motion, useReducedMotion } from 'framer-motion';

type LoginSuccessOverlayProps = {
  realName: string;
  durationMs: number;
  onDone: () => void;
};

/**
 * Persistent post-login welcome screen.
 * The entrance animation is finite, but the screen stays visible until the
 * user explicitly presses the CTA. This avoids an automatic flash-and-dismiss.
 */
export default function LoginSuccessOverlay({ realName, durationMs, onDone }: LoginSuccessOverlayProps) {
  const reduce = useReducedMotion();
  const entranceDuration = reduce
    ? 0
    : Math.min(1.25, Math.max(0.65, 0.65 + Math.max(0, durationMs) / 1000 * 0.06));
  const nameChars = Array.from(realName.trim());
  const maskedName = nameChars.length
    ? `${nameChars[0]}${'*'.repeat(Math.max(0, nameChars.length - 1))}`
    : '同学';

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="登录成功"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: entranceDuration, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center',
        overflow: 'hidden',
        padding: 'calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px)',
        pointerEvents: 'auto', isolation: 'isolate', color: '#173d4b',
        background: 'radial-gradient(ellipse at 50% 42%, rgba(72, 202, 190, .24), transparent 36%), radial-gradient(ellipse at 82% 14%, rgba(128, 188, 232, .20), transparent 38%), rgba(242, 249, 249, .94)',
        backdropFilter: 'blur(22px) saturate(1.3)', WebkitBackdropFilter: 'blur(22px) saturate(1.3)',
      }}
    >
      {!reduce && (
        <>
          <motion.div aria-hidden="true"
            animate={{ opacity: [0.12, 0.34, 0.12], scale: [0.96, 1.12, 0.96] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', width: 230, height: 230, borderRadius: '50%', border: '1px solid rgba(59, 177, 171, .28)', boxShadow: '0 0 54px rgba(74, 193, 184, .12)', pointerEvents: 'none' }} />
          <motion.div aria-hidden="true"
            animate={{ opacity: [0.08, 0.22, 0.08], scale: [1.08, 1.28, 1.08] }}
            transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            style={{ position: 'absolute', width: 230, height: 230, borderRadius: '50%', border: '1px solid rgba(106, 164, 207, .20)', pointerEvents: 'none' }} />
        </>
      )}

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: entranceDuration, delay: reduce ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative', zIndex: 1, width: 'min(100%, 340px)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
      >
        <motion.div
          animate={reduce ? undefined : { y: [0, -5, 0], rotate: [0, 1.5, 0, -1.5, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: 76, height: 76, display: 'grid', placeItems: 'center', marginBottom: 22,
            borderRadius: 25, color: '#f6ffff', fontSize: 31, fontWeight: 850, letterSpacing: '-.08em',
            background: 'linear-gradient(145deg, #55cbbd 0%, #359caa 52%, #478fc1 100%)',
            border: '1px solid rgba(255,255,255,.78)',
            boxShadow: '0 18px 46px rgba(39, 144, 151, .26), inset 0 1px 0 rgba(255,255,255,.6)',
          }}
        >青</motion.div>

        <div style={{ marginBottom: 9, color: 'rgba(34, 111, 119, .72)', fontSize: 9, fontWeight: 800, letterSpacing: '.28em' }}>
          YOUR SPACE, RECONNECTED
        </div>
        <div style={{ color: '#173d4b', fontSize: 'clamp(25px, 6vw, 29px)', fontWeight: 850, letterSpacing: '-.045em', lineHeight: 1.2 }}>
          欢迎回来
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          maxWidth: '100%', marginTop: 16, padding: '10px 16px', borderRadius: 999,
          border: '1px solid rgba(69, 157, 159, .2)', background: 'rgba(255,255,255,.62)',
          boxShadow: '0 8px 24px rgba(44,112,119,.08)',
        }}>
          <span style={{ maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#245d68', fontSize: 17, fontWeight: 800, letterSpacing: '.04em' }}>
            {maskedName}
          </span>
          <span title="隐私保护" aria-label="隐私保护" style={{ display: 'inline-flex', alignItems: 'center', color: '#438d91' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 12c2.4 2.7 5.4 4 9 4s6.6-1.3 9-4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="m7 8-1.2-1.5M12 7V5M17 8l1.2-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        </div>
        <div style={{ marginTop: 9, color: 'rgba(39, 82, 96, .66)', fontSize: 11, fontWeight: 600 }}>
          仅自己与管理员可见 · 不向其他成员公开
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 24, color: '#328b88', fontSize: 12, fontWeight: 700, letterSpacing: '.08em' }}>
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#43b9a8', boxShadow: '0 0 0 4px rgba(67,185,168,.12)' }} />
          登录成功 · 已为你准备就绪
        </div>

        <motion.button
          type="button"
          onClick={onDone}
          whileTap={reduce ? undefined : { scale: 0.97 }}
          whileHover={reduce ? undefined : { y: -2, boxShadow: '0 16px 34px rgba(39,144,151,.28)' }}
          style={{
            width: '100%', marginTop: 30, padding: '15px 22px', border: '1px solid rgba(255,255,255,.72)',
            borderRadius: 16, color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: '.08em',
            background: 'linear-gradient(110deg, #36b7a9 0%, #329eac 52%, #478fc1 100%)',
            boxShadow: '0 12px 28px rgba(39,144,151,.22)', cursor: 'pointer',
          }}
        >
          立即登录
        </motion.button>
        <div style={{ marginTop: 12, color: 'rgba(39, 82, 96, .52)', fontSize: 11 }}>
          点击后进入青春档案
        </div>
      </motion.div>
    </motion.div>
  );
}
