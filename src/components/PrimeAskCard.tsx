import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

// 说明卡（2026-11-07 按用户给的交互规格）：在真正触发系统请求之前，先从底部
// 弹起一张带回弹的圆角卡——图标轻轻晃、标题、一句好处说明、一张预览；
// 点「好的…」才继续（随后才出现系统自己的询问），点「以后再说」只收卡片。
export default function PrimeAskCard({ open, icon, title, desc, preview, confirmText, cancelText = '以后再说', onConfirm, onCancel }: {
  open: boolean;
  icon: ReactNode;
  title: string;
  desc: string;
  preview?: ReactNode;
  confirmText: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 700, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div key="prime-mask" onClick={onCancel}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ position: 'absolute', inset: 0, background: 'rgba(10,14,22,.48)' }} />
          <motion.section key="prime-card" role="dialog" aria-modal="true" aria-label={title}
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 64, opacity: 0, transition: { duration: 0.2 } }}
            transition={reduce ? { duration: 0.18 } : { type: 'spring', stiffness: 320, damping: 25 }}
            style={{ position: 'relative', width: 'calc(100% - 28px)', maxWidth: 430, marginBottom: 'calc(14px + env(safe-area-inset-bottom))', background: '#fff', borderRadius: 26, padding: '22px 20px 18px', boxSizing: 'border-box', boxShadow: '0 24px 60px rgba(6,10,20,.35)', textAlign: 'center' }}>
            <motion.div aria-hidden="true"
              animate={reduce ? undefined : { rotate: [0, -10, 7, -5, 2, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
              style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: 18, background: '#eef4ff', display: 'grid', placeItems: 'center', transformOrigin: '50% 12%' }}>
              {icon}
            </motion.div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#1d2534' }}>{title}</h3>
            <p style={{ margin: '0 auto 14px', fontSize: 13.5, lineHeight: 1.75, color: '#5a6474', maxWidth: 320 }}>{desc}</p>
            {preview}
            <button type="button" onClick={onConfirm}
              style={{ width: '100%', padding: 14, border: 0, borderRadius: 999, background: '#2456c8', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 14 }}>
              {confirmText}
            </button>
            <button type="button" onClick={onCancel}
              style={{ width: '100%', padding: 11, border: 0, background: 'transparent', color: '#8a93a1', fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              {cancelText}
            </button>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}

// 摄像头说明卡的预览：一个小取景框，示意「只认手势、本机处理」
export function CameraPrimePreview() {
  return (
    <div aria-hidden="true" style={{ position: 'relative', height: 104, borderRadius: 16, background: '#101827', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', top: 10, left: 10, width: 18, height: 18, borderTop: '2px solid #a9c7ff', borderLeft: '2px solid #a9c7ff', borderTopLeftRadius: 6 }} />
      <span style={{ position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderTop: '2px solid #a9c7ff', borderRight: '2px solid #a9c7ff', borderTopRightRadius: 6 }} />
      <span style={{ position: 'absolute', bottom: 10, left: 10, width: 18, height: 18, borderBottom: '2px solid #a9c7ff', borderLeft: '2px solid #a9c7ff', borderBottomLeftRadius: 6 }} />
      <span style={{ position: 'absolute', bottom: 10, right: 10, width: 18, height: 18, borderBottom: '2px solid #a9c7ff', borderRight: '2px solid #a9c7ff', borderBottomRightRadius: 6 }} />
      <svg width="150" height="60" viewBox="0 0 150 60" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-58%)' }}>
        <polyline points="8,44 34,26 58,34 82,16 108,24 140,10" fill="none" stroke="#dce8ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 7" />
        <circle cx="140" cy="10" r="4.5" fill="#ffd98a" />
      </svg>
      <span style={{ position: 'absolute', left: '50%', bottom: 9, transform: 'translateX(-50%)', fontSize: 11, color: '#aebedd', letterSpacing: 1, whiteSpace: 'nowrap' }}>
        画面只在本机识别 · 不录像
      </span>
    </div>
  );
}

export function CameraIcon() {
  return (
    <svg width="27" height="27" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="13" height="12" rx="3" stroke="#2456c8" strokeWidth="1.8" />
      <path d="M15.5 10.2 21 7v10l-5.5-3.2" stroke="#2456c8" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="9" cy="12" r="2.6" fill="#2456c8" opacity="0.85" />
    </svg>
  );
}
