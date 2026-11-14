import { useEffect, useRef, useState } from 'react';
import './toast.css';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

let toastSequence = 0;

/** Non-blocking feedback. Destructive confirmations and text input remain in DialogHost. */
export function showToast(message: string, kind: ToastKind = 'info') {
  const value = message.trim();
  if (typeof window === 'undefined' || !value) return;

  window.dispatchEvent(new CustomEvent<ToastItem>('qznb:toast', {
    detail: {
      id: ++toastSequence,
      message: value.slice(0, 240),
      kind,
    },
  }));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, number>>(new Map());

  function dismiss(id: number) {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems(current => current.filter(item => item.id !== id));
  }

  useEffect(() => {
    function onToast(event: Event) {
      const item = (event as CustomEvent<ToastItem>).detail;
      if (!item?.message) return;

      setItems(current => [...current, item].slice(-3));
      const timer = window.setTimeout(() => {
        timers.current.delete(item.id);
        setItems(current => current.filter(existing => existing.id !== item.id));
      }, 3600);
      timers.current.set(item.id, timer);
    }

    window.addEventListener('qznb:toast', onToast);
    return () => {
      window.removeEventListener('qznb:toast', onToast);
      timers.current.forEach(timer => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  return (
    <div className="qz-toast-host" aria-live="polite" aria-relevant="additions text">
      {items.map(item => (
        <div
          className={`qz-toast qz-toast--${item.kind}`}
          key={item.id}
          role={item.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="qz-toast-mark" aria-hidden="true">
            {item.kind === 'success' ? '✓' : item.kind === 'error' ? '!' : 'i'}
          </span>
          <span className="qz-toast-message">{item.message}</span>
          <button
            type="button"
            className="qz-toast-close"
            aria-label="关闭提示"
            onClick={() => dismiss(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
