import { useEffect, useState, useSyncExternalStore } from 'react';

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
  background: 'rgba(31,36,52,.96)', border: '1px solid rgba(255,255,255,.14)',
  boxShadow: '0 24px 60px rgba(0,0,0,.5)', color: '#f2f5ff',
  animation: 'dlg-in .18s ease-out',
};
const msgStyle: React.CSSProperties = {
  fontSize: 15, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};
const rowStyle: React.CSSProperties = { display: 'flex', gap: 10, marginTop: 18 };
const cancelBtn: React.CSSProperties = {
  flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer', font: 'inherit', fontSize: 14.5,
  background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: '#eef2ff',
};
const okBtn: React.CSSProperties = {
  flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer', font: 'inherit', fontSize: 14.5,
  fontWeight: 700, border: 0, color: '#1c2030',
  background: 'linear-gradient(135deg, var(--a), var(--b))',
};
const dangerBtn: React.CSSProperties = {
  ...okBtn, color: '#fff',
  background: 'linear-gradient(135deg, #ff8a7a, #f43f5e)',
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
          border: '1px solid rgba(255,255,255,.16)', background: 'rgba(255,255,255,.07)',
          color: '#f2f5ff', font: 'inherit', fontSize: 14.5, boxSizing: 'border-box',
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
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') dismiss(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);
  if (!req) return null;
  const r = req;

  function backdrop() {
    if (r.kind === 'confirm') r.resolve(false);
    else if (r.kind === 'prompt') r.resolve(null);
    else r.resolve();
    advance();
  }

  const isAdminHost = window.location.hostname.toLowerCase() === 'admin.qianzhi.pw';

  return (
    <div className={isAdminHost ? 'admin-dialog-overlay' : undefined} style={overlayStyle} onClick={backdrop}>
      <style>{'@keyframes dlg-in{from{transform:translateY(10px) scale(.98);opacity:0}to{transform:none;opacity:1}}'}</style>
      <div className={isAdminHost ? 'admin-dialog-card' : undefined} style={cardStyle} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
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
      </div>
    </div>
  );
}
