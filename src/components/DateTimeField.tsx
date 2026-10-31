import { useEffect, useRef, useState } from 'react';

// 站内日期/时间选择：替代浏览器原生 <input type="date"> / <input type="datetime-local">
// （原生滚轮弹窗样式不受控、与站点风格不符）。点开是底部弹层滚轮（年/月/日[/时/分]），
// 点「确定」才回写，值格式与原生 input 完全一致：date='YYYY-MM-DD'，datetime='YYYY-MM-DDTHH:mm'。

const ITEM = 42;
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function Wheel({ values, index, onPick, format }: {
  values: number[]; index: number; onPick: (i: number) => void; format: (v: number) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * ITEM;
    if (Math.abs(el.scrollTop - target) > 2) el.scrollTop = target;
  }, [index]);

  function onScroll() {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== index) onPick(i);
    }, 80);
  }

  return (
    <div
      ref={ref} className="dtf-wheel" onScroll={onScroll}
      style={{
        flex: 1, height: ITEM * 5, overflowY: 'auto', scrollSnapType: 'y mandatory',
        scrollbarWidth: 'none', position: 'relative', zIndex: 1,
      }}
    >
      <div style={{ height: ITEM * 2 }} />
      {values.map((v, i) => {
        const dist = Math.abs(i - index);
        return (
          <div
            key={v} onClick={() => onPick(i)}
            style={{
              height: ITEM, display: 'flex', alignItems: 'center', justifyContent: 'center',
              scrollSnapAlign: 'center', cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none',
              fontSize: dist === 0 ? 17 : 15, fontWeight: dist === 0 ? 700 : 400,
              color: dist === 0 ? '#ffffff' : dist === 1 ? 'rgba(240,244,255,.55)' : 'rgba(240,244,255,.3)',
            }}
          >{format(v)}</div>
        );
      })}
      <div style={{ height: ITEM * 2 }} />
    </div>
  );
}

type Parts = { y: number; mo: number; d: number; h: number; mi: number };

function parseValue(value: string, mode: 'date' | 'datetime'): Parts | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return {
    y: +m[1], mo: +m[2], d: +m[3],
    h: mode === 'datetime' ? +(m[4] ?? 0) : 0,
    mi: mode === 'datetime' ? +(m[5] ?? 0) : 0,
  };
}

function initialParts(value: string, mode: 'date' | 'datetime', min?: string): Parts {
  const p = parseValue(value, mode) ?? parseValue(min ?? '', mode);
  if (p) return { ...p, d: Math.min(p.d, daysIn(p.y, p.mo)) };
  const now = new Date();
  return {
    y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate(),
    h: mode === 'datetime' ? now.getHours() : 0, mi: mode === 'datetime' ? now.getMinutes() : 0,
  };
}

function toValue(p: Parts, mode: 'date' | 'datetime'): string {
  const date = `${p.y}-${pad(p.mo)}-${pad(Math.min(p.d, daysIn(p.y, p.mo)))}`;
  return mode === 'date' ? date : `${date}T${pad(p.h)}:${pad(p.mi)}`;
}

function displayText(value: string, mode: 'date' | 'datetime'): string {
  const p = parseValue(value, mode);
  if (!p) return '';
  const base = `${p.y}年${p.mo}月${p.d}日`;
  return mode === 'date' ? base : `${base} ${pad(p.h)}:${pad(p.mi)}`;
}

export default function DateTimeField({ value, onChange, mode = 'datetime', min, placeholder, clearable = true, style }: {
  value: string;
  onChange: (v: string) => void;
  mode?: 'date' | 'datetime';
  min?: string;
  placeholder?: string;
  clearable?: boolean;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Parts>(() => initialParts(value, mode, min));

  function openSheet() {
    setDraft(initialParts(value, mode, min));
    setOpen(true);
  }
  function set(part: Partial<Parts>) {
    setDraft(prev => {
      const next = { ...prev, ...part };
      next.d = Math.min(next.d, daysIn(next.y, next.mo));
      return next;
    });
  }
  function confirm() {
    let v = toValue(draft, mode);
    if (min && v < min) v = min.slice(0, v.length);
    onChange(v);
    setOpen(false);
  }

  const nowYear = new Date().getFullYear();
  const yLo = Math.min(nowYear - 5, draft.y);
  const yHi = Math.max(nowYear + 3, draft.y);
  const years = range(yLo, yHi);
  const months = range(1, 12);
  const days = range(1, daysIn(draft.y, draft.mo));
  const hours = range(0, 23);
  const minutes = range(0, 59);

  const text = displayText(value, mode);

  return (
    <>
      <button
        type="button" onClick={openSheet}
        style={{
          width: '100%', textAlign: 'left', padding: '12px', margin: '6px 0 12px',
          borderRadius: 12, border: '1px solid rgba(255,255,255,.13)',
          background: 'rgba(255,255,255,.05)', color: text ? '#f2f5ff' : 'rgba(235,240,255,.45)',
          font: 'inherit', fontSize: 14.5, cursor: 'pointer', boxSizing: 'border-box',
          ...style,
        }}
      >{text || placeholder || (mode === 'date' ? '选择日期' : '选择日期和时间')}</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(4,6,12,.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <style>{'.dtf-wheel::-webkit-scrollbar{display:none}@keyframes dtf-up{from{transform:translateY(28px);opacity:.5}to{transform:none;opacity:1}}'}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(100vw, 480px)', borderRadius: '20px 20px 0 0',
              background: 'rgba(31,36,52,.98)', border: '1px solid rgba(255,255,255,.12)', borderBottom: 0,
              boxShadow: '0 -18px 50px rgba(0,0,0,.5)', color: '#f2f5ff',
              padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
              animation: 'dtf-up .2s ease-out', boxSizing: 'border-box',
            }}
          >
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
              {mode === 'date' ? '设置日期' : '设置日期和时间'}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['年', '月', '日', ...(mode === 'datetime' ? ['时', '分'] : [])] as string[]).map(u => (
                <div key={u} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'rgba(235,240,255,.45)' }}>{u}</div>
              ))}
            </div>
            <div style={{ position: 'relative', marginTop: 2 }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, top: ITEM * 2, height: ITEM,
                borderTop: '1px solid rgba(255,255,255,.14)', borderBottom: '1px solid rgba(255,255,255,.14)',
                background: 'rgba(255,255,255,.05)', borderRadius: 8, pointerEvents: 'none',
              }} />
              <div style={{ display: 'flex', gap: 4 }}>
                <Wheel values={years} index={years.indexOf(draft.y)} onPick={i => set({ y: years[i] })} format={v => String(v)} />
                <Wheel values={months} index={draft.mo - 1} onPick={i => set({ mo: months[i] })} format={v => pad(v)} />
                <Wheel values={days} index={Math.min(draft.d, days.length) - 1} onPick={i => set({ d: days[i] })} format={v => pad(v)} />
                {mode === 'datetime' && (
                  <Wheel values={hours} index={draft.h} onPick={i => set({ h: hours[i] })} format={v => pad(v)} />
                )}
                {mode === 'datetime' && (
                  <Wheel values={minutes} index={draft.mi} onPick={i => set({ mi: minutes[i] })} format={v => pad(v)} />
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
              {clearable && value ? (
                <button type="button"
                  onClick={() => { onChange(''); setOpen(false); }}
                  style={{ background: 'none', border: 0, color: '#7dd3fc', font: 'inherit', fontSize: 14.5, cursor: 'pointer', padding: '10px 6px' }}
                >清除</button>
              ) : <span />}
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setOpen(false)}
                style={{ background: 'none', border: 0, color: '#7dd3fc', font: 'inherit', fontSize: 14.5, cursor: 'pointer', padding: '10px 10px' }}
              >取消</button>
              <button type="button" onClick={confirm}
                style={{
                  marginLeft: 6, padding: '10px 22px', borderRadius: 12, border: 0, cursor: 'pointer',
                  font: 'inherit', fontSize: 14.5, fontWeight: 700, color: '#1c2030',
                  background: 'linear-gradient(135deg, var(--a), var(--b))',
                }}
              >确定</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
