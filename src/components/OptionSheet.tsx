import { useState, type CSSProperties } from 'react';

export type SheetOption = { value: string; label: string };

// 站内选项弹层：替代原生 <select>（手机浏览器会弹系统单选层）。
// 触发按钮显示当前值，点击从底部升起站内列表，点选即生效并关闭。
export default function OptionSheet({ value, options, onChange, buttonText, title, buttonStyle }: {
  value: string;
  options: SheetOption[];
  onChange: (v: string) => void;
  buttonText: string;
  title: string;
  buttonStyle?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...buttonStyle }}>
        <span>{buttonText}</span>
        <span aria-hidden="true" style={{ fontSize: 10, color: '#8a93a1' }}>▾</span>
      </button>
      {open && (
        <div role="presentation" onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(16,20,28,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <section role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 620, maxHeight: '70dvh', overflowY: 'auto', background: '#fff', borderRadius: '22px 22px 0 0', padding: '16px 16px calc(16px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <b style={{ fontSize: 15 }}>{title}</b>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭"
                style={{ border: 0, background: '#f2f4f7', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 13, color: '#333946' }}>✕</button>
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
          </section>
        </div>
      )}
    </>
  );
}
