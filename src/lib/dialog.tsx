import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

// 站内弹窗：替代浏览器原生 confirm / alert / prompt（原生弹窗样式不受控、与站点风格不符）。
// 用法：import { confirmDialog, alertDialog, promptDialog } from '.../lib/dialog';
//   if (!(await confirmDialog('删除这条？'))) return;
// 并在 main.tsx 根部挂一次 <DialogHost />（主站与管理后台共用）。

type ConfirmReq = {
  kind: 'confirm'; id: number; message: string;
  confirmText: string; cancelText: string; danger: boolean;
  resolve: (v: boolean) => void;
};
type AlertReq = {
  kind: 'alert'; id: number; message: string; confirmText: string;
  resolve: () => void;
};
type PromptReq = {
  kind: 'prompt'; id: number; title: string; placeholder: string;
  confirmText: string; cancelText: string;
  resolve: (v: string | null) => void;
};
type Req = ConfirmReq | AlertReq | PromptReq;

let seq = 0;
let current: Req | null = null;
const queue: Req[] = [];
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }
function enqueue(req: Req) {
  if (current) queue.push(req);
  else current = req;
  emit();
}
function advance() {
  current = queue.shift() ?? null;
  emit();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot() { return current; }

export function confirmDialog(message: string, opts?: {
  confirmText?: string; cancelText?: string; danger?: boolean;
}): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    enqueue({
      kind: 'confirm', id: ++seq, message,
      confirmText: opts?.confirmText ?? '确定',
      cancelText: opts?.cancelText ?? '取消',
      danger: opts?.danger ?? false,
      resolve,
    });
  });
}

export function alertDialog(message: string, opts?: { confirmText?: string }): Promise<void> {
  return new Promise<void>(resolve => {
    enqueue({
      kind: 'alert', id: ++seq, message,
      confirmText: opts?.confirmText ?? '好的',
      resolve,
    });
  });
}

export function promptDialog(title: string, opts?: {
  placeholder?: string; confirmText?: string; cancelText?: string;
}): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    enqueue({
      kind: 'prompt', id: ++seq, title,
      placeholder: opts?.placeholder ?? '',
      confirmText: opts?.confirmText ?? '确定',
      cancelText: opts?.cancelText ?? '取消',
      resolve,
    });
  });
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1000,
  background: 'rgba(4,6,12,.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
};
const cardStyle: React.CSSProperties = {
  width: 'min(92vw, 400px)', borderRadius: 18, padding: '20px 18px 16px',
  background: 'var(--qz-surface, #ffffff)', border: '1px solid var(--qz-line, #e7eaee)',
  boxShadow: 'var(--qz-shadow-float, 0 12px 34px rgba(28,39,55,.12))', color: 'var(--qz-ink, #202733)',
};
const msgStyle: React.CSSProperties = {
  fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};
const rowStyle: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 18 };
const cancelBtn: React.CSSProperties = {
  flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer', font: 'inherit', fontSize: 14.5,
  background: '#ffffff', border: '1px solid var(--qz-line-strong, #d9dee5)', color: 'var(--qz-ink, #202733)',
};
const okBtn: React.CSSProperties = {
  flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer', font: 'inherit', fontSize: 14.5,
  fontWeight: 650, border: '1px solid var(--qz-accent, #526b8c)', color: '#ffffff',
  background: 'var(--qz-accent, #526b8c)',
};
const dangerBtn: React.CSSProperties = {
  ...okBtn, color: '#fff',
  background: 'var(--qz-danger, #bd5d68)', borderColor: 'var(--qz-danger, #bd5d68)',
};

function PromptBody({ req }: { req: PromptReq }) {
  const [text, setText] = useState('');
  function done(v: string | null) { req.resolve(v); advance(); }
  return (
    <>
      <div style={msgStyle}>{req.title}</div>
      <textarea
        autoFocus value={text} rows={3} maxLength={500} placeholder={req.placeholder}
        onChange={e => setText(e.target.value)}
        style={{
          width: '100%', marginTop: 12, padding: '10px 12px', borderRadius: 12, resize: 'vertical',
          border: '1px solid var(--qz-line-strong, #d9dee5)', background: '#ffffff',
          color: 'var(--qz-ink, #202733)', font: 'inherit', fontSize: 16, boxSizing: 'border-box',
        }}
      />
      <div style={rowStyle}>
        <button type="button" className="admin-dialog-cancel" style={cancelBtn} onClick={() => done(null)}>{req.cancelText}</button>
        <button type="button" className="admin-dialog-primary" style={okBtn} onClick={() => done(text)}>{req.confirmText}</button>
      </div>
    </>
  );
}

export function DialogHost() {
  const req = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    if (!req) return;
    const r = req;
    function dismiss() {
      if (r.kind === 'confirm') r.resolve(false);
      else if (r.kind === 'prompt') r.resolve(null);
      else r.resolve();
      advance();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && r.kind !== 'prompt') dismiss(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);
  const r = req;
  const reduceMotion = Boolean(useReducedMotion());

  function backdrop() {
    if (!r || r.kind === 'prompt') return; // 输入型弹窗：点蒙层不丢已输入内容，只能点取消/确认
    if (r.kind === 'confirm') r.resolve(false);
    else r.resolve();
    advance();
  }

  const isAdminHost = window.location.hostname.toLowerCase() === 'admin.qianzhi.pw';

  return (
    <AnimatePresence initial={false}>
      {r && (
        <motion.div
          key={r.id}
          className={isAdminHost ? 'admin-dialog-overlay qz-ios26-dialog-overlay' : 'qz-ios26-dialog-overlay'}
          style={overlayStyle}
          onClick={backdrop}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className={isAdminHost ? 'admin-dialog-card qz-ios26-dialog-card' : 'qz-ios26-dialog-card'}
            style={cardStyle}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
            transition={reduceMotion
              ? { duration: 0.01 }
              : { type: 'spring', stiffness: 360, damping: 30, mass: 0.78 }}
          >
            {r.kind === 'prompt' ? (
              <PromptBody key={r.id} req={r} />
            ) : r.kind === 'confirm' ? (
              <>
                <div style={msgStyle}>{r.message}</div>
                <div style={rowStyle}>
                  <button type="button" className="admin-dialog-cancel" style={cancelBtn}
                    onClick={() => { r.resolve(false); advance(); }}>{r.cancelText}</button>
                  <button type="button" className={r.danger ? 'admin-dialog-danger' : 'admin-dialog-primary'} style={r.danger ? dangerBtn : okBtn}
                    onClick={() => { r.resolve(true); advance(); }}>{r.confirmText}</button>
                </div>
              </>
            ) : (
              <>
                <div style={msgStyle}>{r.message}</div>
                <div style={rowStyle}>
                  <button type="button" className="admin-dialog-primary" style={okBtn}
                    onClick={() => { r.resolve(); advance(); }}>{r.confirmText}</button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
