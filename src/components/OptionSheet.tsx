import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import './OptionSheet.css';

export type SheetOption = { value: string; label: string };

// 站内选项弹层：替代原生 <select>（手机浏览器会弹系统单选层）。
// 底部弹窗物理（2026-11-07 按用户给的交互规格）：弹簧升起；打开时背后页面缩 0.92、
// 圆角、略暗「退后一步」，关闭同步恢复；顶部抓手可拖——上拖有阻力，下拖超过
// 面板 1/3 或快速下甩就关闭，否则弹回原位。
export default function OptionSheet({ value, options, onChange, buttonText, title, buttonStyle }: {
  value: string;
  options: SheetOption[];
  onChange: (v: string) => void;
  buttonText: string;
  title: string;
  buttonStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const controls = useDragControls();
  const sheetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add('qz-sheet-bg');
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.classList.remove('qz-sheet-bg');
      document.body.style.overflow = prevOverflow;
    };
  }, [open ]);

  function onDragEnd(_e: unknown, info: { offset: { y: number }; velocity: { y: number } }) {
    const h = sheetRef.current?.offsetHeight ?? 300;
    if (info.offset.y > h / 3 || info.velocity.y > 450) setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...buttonStyle }}>
        <span>{buttonText}</span>
        <span aria-hidden="true" style={{ fontSize: 10, color: '#8a93a1' }}>▾</span>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <>
              <motion.div key="qz-sheet-mask"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                onClick={() => setOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(16,20,28,.45)' }} />
              <motion.section key="qz-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={title}
                drag="y" dragListener={false} dragControls={controls}
                dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.1, bottom: 0.55 }}
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                onDragEnd={onDragEnd}
                style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', width: '100%', maxWidth: 620, maxHeight: 'calc(100dvh - 12px)', overflowY: 'auto', background: '#fff', borderRadius: '22px 22px 0 0', padding: '8px 16px calc(16px + env(safe-area-inset-bottom))', boxSizing: 'border-box', zIndex: 601 }}>
                <div onPointerDown={e => controls.start(e)} style={{ touchAction: 'none', cursor: 'grab' }}>
                  <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: '#dfe3e9', margin: '2px auto 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b style={{ fontSize: 15 }}>{title}</b>
                    <button type="button" onClick={() => setOpen(false)}
                      onPointerDown={e => e.stopPropagation()} aria-label="关闭"
                      style={{ border: 0, background: '#f2f4f7', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 13, color: '#333946' }}>✕</button>
                  </div>
                </div>
                <div role="listbox" aria-label={title}>
                  {options.map(o => {
                    const on = o.value === value;
                    return (
                      <button key={o.value || '__empty'} type="button" role="option" aria-selected={on}
                        onClick={() => { onChange(o.value); setOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', padding: '12px 10px', border: 0, borderBottom: '1px solid #eef1f5', background: on ? 'rgba(88,174,176,.08)' : '#fff', color: '#202632', fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                        <span>{o.label}</span>
                        {on && <span aria-hidden="true" style={{ color: '#2a9d9f', fontWeight: 700 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </motion.section>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
