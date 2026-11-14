import { BRAND_NAME } from '../lib/brand';
import BrandMark from './BrandMark';
import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type LoginSuccessOverlayProps = {
  realName: string;
  durationMs: number;
  onDone: () => void;
};

// 登录后自动进入的等待时长（毫秒）：让人看一眼欢迎语，不必每次都点一下。
const AUTO_ENTER_MS = 1600;

/**
 * Post-login welcome screen.
 * The real name is never exposed in full: only its first character is shown.
 * The visual language follows the warm paper / ink / restrained clay palette.
 */
export default function LoginSuccessOverlay({ realName, durationMs, onDone }: LoginSuccessOverlayProps) {
  const reduce = useReducedMotion();
  const [entering, setEntering] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const entranceDuration = reduce
    ? 0
    : Math.min(1.25, Math.max(0.65, 0.65 + Math.max(0, durationMs) / 1000 * 0.06));
  const nameChars = Array.from(realName.trim());
  const maskedName = nameChars.length
    ? nameChars[0] + '*'.repeat(Math.max(0, nameChars.length - 1))
    : '';

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  // 登录后自动进入；点按钮可以立即进入。
  const autoRef = useRef<number | null>(null);
  useEffect(() => {
    autoRef.current = window.setTimeout(() => enterArchive(), reduce ? 400 : AUTO_ENTER_MS);
    return () => {
      if (autoRef.current !== null) window.clearTimeout(autoRef.current);
    };
  }, []);

  function enterArchive() {
    if (entering) return;
    if (autoRef.current !== null) {
      window.clearTimeout(autoRef.current);
      autoRef.current = null;
    }
    setEntering(true);
    timeoutRef.current = window.setTimeout(onDone, reduce ? 0 : 820);
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="登录成功"
      initial={reduce ? false : { opacity: 0 }}
      animate={entering
        ? { opacity: 0, scale: 1.018, filter: 'blur(6px)' }
        : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: entering ? (reduce ? 0 : 0.78) : entranceDuration, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, display: 'grid', placeItems: 'center',
        overflow: 'hidden',
        padding: 'calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px)',
        pointerEvents: 'auto', isolation: 'isolate', color: '#302d29',
        background: 'radial-gradient(ellipse at 50% 43%, rgba(174, 126, 96, .12), transparent 38%), radial-gradient(ellipse at 82% 16%, rgba(196, 177, 151, .13), transparent 42%), rgba(248, 246, 241, .97)',
        backdropFilter: 'blur(22px) saturate(1.08)', WebkitBackdropFilter: 'blur(22px) saturate(1.08)',
      }}
    >
      {!reduce && (
        <>
          <motion.div aria-hidden="true"
            animate={entering ? { opacity: 0, scale: 1.65 } : { opacity: [0.12, 0.27, 0.12], scale: [0.96, 1.12, 0.96] }}
            transition={{ duration: entering ? 0.72 : 5.5, repeat: entering ? 0 : Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', width: 230, height: 230, borderRadius: '50%',
              border: '1px solid rgba(164, 111, 83, .20)',
              boxShadow: '0 0 54px rgba(164, 111, 83, .08)', pointerEvents: 'none',
            }} />
          <motion.div aria-hidden="true"
            animate={entering ? { opacity: 0, scale: 1.85 } : { opacity: [0.07, 0.18, 0.07], scale: [1.08, 1.28, 1.08] }}
            transition={{ duration: entering ? 0.78 : 7, repeat: entering ? 0 : Infinity, ease: 'easeInOut', delay: 0.4 }}
            style={{
              position: 'absolute', width: 230, height: 230, borderRadius: '50%',
              border: '1px solid rgba(135, 119, 99, .16)', pointerEvents: 'none',
            }} />
        </>
      )}

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 20, scale: 0.94 }}
        animate={entering
          ? { opacity: 0, y: -16, scale: 0.96 }
          : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: entering ? (reduce ? 0 : 0.62) : entranceDuration, delay: reduce ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative', zIndex: 1, width: 'min(100%, 340px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        }}
      >
        <motion.div
          animate={reduce || entering ? undefined : { y: [0, -4, 0], rotate: [0, 1.2, 0, -1.2, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: 76, height: 76, display: 'grid', placeItems: 'center', marginBottom: 22,
            borderRadius: 19,
            boxShadow: '0 18px 42px rgba(94, 69, 52, .16)',
          }}
        ><BrandMark size={76} title={BRAND_NAME} /></motion.div>

        <div style={{ marginBottom: 9, color: 'rgba(105, 91, 77, .66)', fontSize: 9, fontWeight: 800, letterSpacing: '.28em' }}>
          YOUR SPACE, RECONNECTED
        </div>
        <div style={{ color: '#302d29', fontSize: 'clamp(25px, 6vw, 29px)', fontWeight: 850, letterSpacing: '-.045em', lineHeight: 1.2 }}>
          欢迎回来
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          maxWidth: '100%', marginTop: 16, padding: '10px 16px', borderRadius: 999,
          border: '1px solid rgba(112, 94, 77, .15)', background: 'rgba(255,255,255,.72)',
          boxShadow: '0 8px 24px rgba(65, 52, 40, .055)',
        }}>
          <span style={{
            maxWidth: 230, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: '#39332d', fontSize: 17, fontWeight: 800, letterSpacing: '.04em',
          }}>
            {maskedName ? maskedName + '同学' : '同学'}
          </span>
          <motion.span
            title="隐私保护" aria-label="隐私保护"
            animate={reduce ? undefined : { scaleY: [1, 0.06, 1, 1] }}
            transition={reduce ? undefined : {
              duration: 3.8, repeat: Infinity, repeatDelay: 0.45,
              times: [0, 0.045, 0.09, 1], ease: 'easeInOut',
            }}
            style={{ display: 'inline-flex', alignItems: 'center', color: '#9b6d54', transformOrigin: 'center' }}
          >
            <svg width="23" height="23" viewBox="0 0 28 24" fill="none" aria-hidden="true">
              <path d="M2.5 12c2.5-4.1 6.2-6.2 11.5-6.2s9 2.1 11.5 6.2c-2.5 4.1-6.2 6.2-11.5 6.2S5 16.1 2.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx="14" cy="12" r="3" fill="currentColor" />
              <path d="M2.5 12c2.5 4.1 6.2 6.2 11.5 6.2s9-2.1 11.5-6.2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </motion.span>
        </div>
        <div style={{ marginTop: 9, color: 'rgba(82, 72, 61, .68)', fontSize: 11, fontWeight: 600 }}>
          仅自己与管理员可见 · 不向其他成员公开
        </div>

        <div aria-live="polite" style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 24,
          color: '#8f6049', fontSize: 12, fontWeight: 700, letterSpacing: '.08em',
        }}>
          <span aria-hidden="true" style={{
            width: 7, height: 7, borderRadius: '50%', background: '#a87558',
            boxShadow: '0 0 0 4px rgba(168,117,88,.12)',
          }} />
          登录成功 · 已为你准备就绪
        </div>

        <motion.button
          type="button"
          onClick={enterArchive}
          disabled={entering}
          whileTap={reduce || entering ? undefined : { scale: 0.97 }}
          whileHover={reduce || entering ? undefined : { y: -2, boxShadow: '0 16px 34px rgba(128,88,64,.22)' }}
          animate={entering ? { scale: 0.97, opacity: 0.76 } : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.25 }}
          style={{
            width: '100%', marginTop: 30, padding: '15px 22px',
            border: '1px solid rgba(255,255,255,.72)', borderRadius: 16,
            color: '#fffaf5', fontSize: 15, fontWeight: 800, letterSpacing: '.08em',
            background: '#94664f', boxShadow: '0 12px 28px rgba(128,88,64,.18)',
            cursor: entering ? 'default' : 'pointer',
          }}
        >
          {entering ? '正在进入…' : '立即进入'}
        </motion.button>
        <div style={{ marginTop: 12, color: 'rgba(82, 72, 61, .54)', fontSize: 11 }}>
          {entering ? `正在为你打开 ${BRAND_NAME}` : '稍后自动进入，也可以直接点击'}
        </div>
      </motion.div>
    </motion.div>
  );
}
