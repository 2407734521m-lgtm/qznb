import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

// 悬浮 Dock：版式借 Aceternity Floating Dock（GitHub aceternity/ui，
// 居中悬浮胶囊、玻璃底、弹簧按压），按用户要求去掉图标放大：
// 本站四栏图标+文字不变，选中态用滑动底片表示；手机与桌面同一套。
// 不用 liquid-glass-react：它的行内 transform 自居中会跟悬浮定位打架
// （2026-11-08 曾因此把栏目推出屏幕），这里用 left/right + margin
// auto 居中，不写 transform。
export interface FloatingDockItem {
  id: string;
  label: string;
  icon: ReactNode;
}

const TAB_CLASS = 'qz-floating-dock-tab';
// :focus-visible 写不进内联样式，随组件带一小段 <style>。
const TAB_CSS = `
.${TAB_CLASS}:focus-visible {
  outline: none;
  border-radius: 22px;
  box-shadow: inset 0 0 0 1.5px rgba(38, 59, 79, 0.55), 0 0 0 3px rgba(255, 255, 255, 0.65);
}
@media (forced-colors: active) {
  .${TAB_CLASS}:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
`;

export default function FloatingDock({ items, activeItem, onItemChange, reducedMotion = false }: {
  items: FloatingDockItem[];
  activeItem: string;
  onItemChange: (id: string) => void;
  reducedMotion?: boolean;
}) {
  return (
    <nav
      className="qz-floating-dock"
      aria-label="主导航"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 'calc(16px + env(safe-area-inset-bottom))',
        margin: '0 auto',
        width: 'min(360px, calc(100vw - 24px))',
        height: 56,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        padding: '0 7px',
        borderRadius: 28,
        border: '1px solid rgba(255,255,255,.9)',
        background: 'rgba(255,255,255,.82)',
        backdropFilter: 'blur(24px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(24px) saturate(1.4)',
        boxShadow:
          '0 12px 34px rgba(25,43,66,.16), inset 0 1px 0 rgba(255,255,255,.96), inset 0 -1px 0 rgba(170,190,210,.14)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <style>{TAB_CSS}</style>
      {items.map((item) => {
        const active = item.id === activeItem;
        return (
          <motion.button
            key={item.id}
            type="button"
            className={TAB_CLASS}
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            onClick={() => onItemChange(item.id)}
            whileTap={reducedMotion ? undefined : { scale: 0.92 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'relative',
              flex: '1 1 0',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: '6px 8px',
              border: 'none',
              background: 'none',
              fontSize: 11,
              lineHeight: 1.1,
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
              color: active ? '#263b4f' : 'rgba(58,78,96,.78)',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {active && (
              <motion.span
                layoutId="qz-floating-dock-pill"
                aria-hidden="true"
                transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 22,
                  background: 'rgba(38,59,79,.09)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), inset 0 -1px 0 rgba(38,59,79,.06)',
                }}
              />
            )}
            <span style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              {item.icon}
              <span>{item.label}</span>
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
}
