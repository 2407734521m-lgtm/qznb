import { useEffect, useState } from 'react';
import { normalizeLinkUrl } from '../lib/richText';

// 创建链接：给选中的文字贴一个网址（站内弹窗，不用原生 prompt）。
// 打开时显示选中的文字、让用户填网址；没写协议自动补 https://，
// javascript:/data: 等不接受。
export default function LinkDialog({ open, linkText, onClose, onConfirm }: {
  open: boolean;
  linkText: string;
  onClose: () => void;
  onConfirm: (url: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setUrl('');
    setError('');
  }, [open ]);

  if (!open) return null;

  function submit() {
    const normalized = normalizeLinkUrl(url);
    if (!normalized) {
      setError(url.trim() ? '这个网址打不开，换一个 http(s) 链接。' : '先填一个网址。');
      return;
    }
    onConfirm(normalized);
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, padding: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(20,28,40,.42)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-dialog-title"
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%', maxWidth: 390, padding: 24, borderRadius: 24,
          background: 'rgba(255,255,255,.96)', border: '1px solid rgba(255,255,255,.86)',
          boxShadow: '0 24px 80px rgba(20,35,55,.18)', color: '#202632',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#7b8492', fontWeight: 800 }}>CREATE LINK</div>
        <h2 id="link-dialog-title" style={{ margin: '8px 0', fontSize: 23 }}>创建链接</h2>
        <p style={{ margin: '0 0 18px', color: '#737b89', fontSize: 13, lineHeight: 1.7 }}>
          给「{linkText.length > 24 ? `${linkText.slice(0, 24)}…` : linkText}」贴一个网址，点开就跳过去。
        </p>
        <input
          aria-label="链接网址"
          autoFocus
          value={url}
          onChange={event => { setUrl(event.target.value); setError(''); }}
          onKeyDown={event => { if (event.key === 'Enter') submit(); }}
          inputMode="url"
          placeholder="https://…"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '13px 14px',
            border: '1px solid #dfe4ec', borderRadius: 13, outline: 'none',
            background: '#f9fafc', color: '#202632', font: 'inherit', fontSize: 16,
          }}
        />
        {error && <p role="alert" style={{ color: '#b3261e', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
        <p style={{ margin: '10px 0 18px', color: '#929aa6', fontSize: 11, lineHeight: 1.6 }}>
          只接受 http/https 链接；没写协议会自动补 https://。
        </p>
        <div style={{ display: 'flex', gap: 9 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: 12, borderRadius: 999, border: '1px solid #e1e5ec',
            background: '#fff', color: '#505967', fontSize: 13, fontWeight: 700,
          }}>取消</button>
          <button type="button" onClick={submit} style={{
            flex: 1, padding: 12, borderRadius: 999, border: 0,
            background: '#202632', color: '#fff', fontSize: 13, fontWeight: 800,
          }}>贴上链接</button>
        </div>
      </section>
    </div>
  );
}
