import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion';
import './OptionSheet.css';

export type SheetOption = { value: string; label: string };
export type SheetOptionGroup = { label: string; options: SheetOption[] };

// 站内选项弹层：替代原生 <select>（手机浏览器会弹系统单选层）。
// 底部弹窗物理（2026-11-07 按用户给的交互规格）：弹簧升起；打开时背后页面缩 0.92、
// 圆角、略暗「退后一步」，关闭同步恢复；顶部抓手可拖——上拖有阻力，下拖超过
// 面板 1/3 或快速下甩就关闭，否则弹回原位。
// 2026-11-14 升级（只借 shadcn/ui 与 Mantine 的交互形态，不引依赖）：
// - 搜索：选项总数 ≥ 8 时自动出现搜索框（searchable 可强制开/关），按 label 子串过滤；
// - 分组：传 groups 即按组渲染、带分组标题，搜索时空组自动隐藏；
// - 键盘：↑/↓ 移动、回车确认、Esc 关闭，当前项用 aria-activedescendant 标出；
// - 配色按冷白纸面（底 #f7f8f8、卡片 #ffffff、墨色 #1f2a3a、灰字 #7a8894、描边 #e5e8ea、印泥红 #b0404f）；
// - 尊重 prefers-reduced-motion（无弹簧、无位移，只有淡入淡出）。
// 现有 props 与调用点接口不变：value / options / onChange / buttonText / title / buttonStyle。

type FlatEntry = { key: string; group: string | null; option: SheetOption; index: number };

const SEARCH_THRESHOLD = 8;

export default function OptionSheet({ value, options, onChange, buttonText, title, buttonStyle, groups, searchable }: {
  value: string;
  options: SheetOption[];
  onChange: (v: string) => void;
  buttonText: string;
  title: string;
  buttonStyle?: CSSProperties;
  groups?: SheetOptionGroup[];
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const controls = useDragControls();
  const sheetRef = useRef<HTMLElement | null>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const reduceMotion = useReducedMotion();

  // 拍平：有 groups 时按组展开（组内顺序不变），否则沿用原 flat options。
  const entries: FlatEntry[] = useMemo(() => {
    const flat: Omit<FlatEntry, 'index'>[] =
      groups && groups.length > 0
        ? groups.flatMap((g, gi) => g.options.map((o, oi) => ({ key: `g${gi}-${oi}-${o.value}`, group: g.label, option: o })))
        : options.map((o, i) => ({ key: `f${i}-${o.value}`, group: null, option: o }));
    return flat.map((e, index) => ({ ...e, index }));
  }, [groups, options]);

  const showSearch = searchable === true || (searchable !== false && entries.length >= SEARCH_THRESHOLD);

  const q = query.trim().toLowerCase();
  const visible: FlatEntry[] = useMemo(
    () => (q ? entries.filter(e => e.option.label.toLowerCase().includes(q)) : entries),
    [entries, q],
  );

  // 按组分段（同一组连续出现时合并一段；搜索后空组自然消失）。
  const sections: { label: string | null; items: FlatEntry[] }[] = useMemo(() => {
    const out: { label: string | null; items: FlatEntry[] }[] = [];
    for (const e of visible) {
      const last = out[out.length - 1];
      if (last && last.label === e.group) last.items.push(e);
      else out.push({ label: e.group, items: [e] });
    }
    return out;
  }, [visible]);

  // 当前高亮项：activeKey 仍在可见列表里就用它，否则落到第一项（打开/过滤后默认选中首项）。
  const activeEntry = visible.find(e => e.key === activeKey) ?? visible[0] ?? null;

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

  // 打开时清空搜索与高亮、把焦点收到抽屉本体（不直接聚焦搜索框，避免手机一打开就弹键盘）；
  // ↑/↓/回车/Esc 都挂在抽屉上，焦点在搜索框里时事件冒泡上来同样生效。
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveKey(null);
    sheetRef.current?.focus({ preventScroll: true });
  }, [open ]);

  // 键盘移动后把高亮项滚进视野（只滚抽屉内部，不动背后页面）。
  useEffect(() => {
    if (!open || !activeEntry) return;
    optionRefs.current.get(activeEntry.key)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeEntry]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onSheetKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (visible.length === 0) return;
    const idx = activeEntry ? visible.findIndex(v => v.key === activeEntry.key) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveKey(visible[(idx + 1) % visible.length].key);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveKey(visible[(idx - 1 + visible.length) % visible.length].key);
    } else if (e.key === 'Enter') {
      if (activeEntry) {
        e.preventDefault();
        choose(activeEntry.option.value);
      }
    }
  }

  function onDragEnd(_e: unknown, info: { offset: { y: number }; velocity: { y: number } }) {
    const h = sheetRef.current?.offsetHeight ?? 300;
    if (info.offset.y > h / 3 || info.velocity.y > 450) setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
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
                transition={{ duration: reduceMotion ? 0 : 0.25 }}
                onClick={() => setOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(16,20,28,.45)' }} />
              <motion.section key="qz-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={title}
                tabIndex={-1} onKeyDown={onSheetKeyDown} className="qz-optionsheet"
                drag="y" dragListener={false} dragControls={controls}
                dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0.1, bottom: 0.55 }}
                initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 40 }}
                onDragEnd={onDragEnd}
                style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', width: '100%', maxWidth: 620, maxHeight: 'calc(100dvh - 12px)', overflowY: 'auto', background: '#ffffff', borderRadius: '22px 22px 0 0', padding: '8px 16px calc(16px + env(safe-area-inset-bottom))', boxSizing: 'border-box', zIndex: 601, color: '#1f2a3a' }}>
                <div onPointerDown={e => controls.start(e)} style={{ touchAction: 'none', cursor: 'grab' }}>
                  <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: '#e5e8ea', margin: '2px auto 10px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b style={{ fontSize: 15 }}>{title}</b>
                    <button type="button" onClick={() => setOpen(false)}
                      onPointerDown={e => e.stopPropagation()} aria-label="关闭"
                      style={{ border: '1px solid #e5e8ea', background: '#f7f8f8', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 13, color: '#1f2a3a' }}>✕</button>
                  </div>
                </div>
                {showSearch && (
                  <div className="qz-sheet-search">
                    <span aria-hidden="true" className="qz-sheet-search-icon">⌕</span>
                    <input type="search" value={query} placeholder="搜索选项…"
                      aria-label="搜索选项" aria-controls="qz-optionsheet-listbox"
                      onChange={e => { setQuery(e.target.value); setActiveKey(null); }}
                      className="qz-sheet-search-input" />
                    {query !== '' && (
                      <button type="button" aria-label="清除搜索" className="qz-sheet-search-clear"
                        onClick={() => { setQuery(''); setActiveKey(null); }}>✕</button>
                    )}
                  </div>
                )}
                <div role="listbox" aria-label={title} id="qz-optionsheet-listbox"
                  aria-activedescendant={activeEntry ? `qz-opt-${activeEntry.index}` : undefined}>
                  {visible.length === 0 ? (
                    <div role="status" className="qz-sheet-empty">没有匹配的选项，换个关键词试试</div>
                  ) : sections.map((sec, si) => (
                    <div key={sec.label ?? `__flat-${si}`}>
                      {sec.label !== null && <div className="qz-sheet-group" aria-hidden="true">{sec.label}</div>}
                      {sec.items.map(e => {
                        const o = e.option;
                        const on = o.value === value;
                        const active = activeEntry?.key === e.key;
                        return (
                          <button key={e.key} id={`qz-opt-${e.index}`} type="button" role="option" aria-selected={on}
                            ref={el => { if (el) optionRefs.current.set(e.key, el); else optionRefs.current.delete(e.key); }}
                            onClick={() => choose(o.value)}
                            onMouseEnter={() => setActiveKey(e.key)}
                            className={`qz-sheet-opt${on ? ' qz-sheet-opt--on' : ''}${active ? ' qz-sheet-opt--active' : ''}`}>
                            <span>{o.label}</span>
                            {on && <span aria-hidden="true" className="qz-sheet-check">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
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
