// Adapted from https://github.com/clayharmon/webgl-liquid-glass (MIT).
// See THIRD_PARTY_NOTICES.md for the upstream license.
import { useRef, useEffect, useCallback, useId } from 'react';
import type { PointerEvent, MouseEvent, KeyboardEvent } from 'react';
import { LiquidGlassRenderer } from './renderer';
import { createSpring, updateSpring } from './spring';
import { createMotionTracker } from './motion';
import type { LiquidGlassNavProps, SpringState } from './types';

const NAV_HEIGHT = 56;
const NAV_RADIUS = 28;
const PILL_HEIGHT = 44;
const DRAG_THRESHOLD = 4;
const VEL_SMOOTHING = 0.25;
// A click follows every pointerup, so clicks this soon after one are ignored
const CLICK_DEDUPE_MS = 500;
// Light direction under prefers-reduced-motion — dead centre, so the specular
// stops following the pointer and the gyroscope
const STATIC_LIGHT: [number, number] = [0, 0];

const TAB_CLASS = 'webgl-liquid-glass-tab';
// :focus-visible can't be written inline, so the ring ships as a <style>
const TAB_CSS = `
.${TAB_CLASS}:focus-visible {
  outline: none;
  border-radius: ${PILL_HEIGHT / 2}px;
  box-shadow:
    inset 0 0 0 1.5px rgba(255, 255, 255, 0.9),
    0 0 12px rgba(255, 255, 255, 0.28);
}
@media (forced-colors: active) {
  .${TAB_CLASS}:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
`;

function noop() {}

interface DragState {
  active: boolean;
  moved: boolean;
  pointerId: number;
  startPointerX: number;
  pillStartX: number;
  currentX: number;
  velocity: number;
  prevX: number;
}

function emptyDrag(): DragState {
  return {
    active: false,
    moved: false,
    pointerId: -1,
    startPointerX: 0,
    pillStartX: 0,
    currentX: 0,
    velocity: 0,
    prevX: 0,
  };
}

function isSettled(s: SpringState): boolean {
  return s.current === s.target && s.velocity === 0;
}

/** Jump a spring straight to a value. Used for prefers-reduced-motion. */
function snapSpring(s: SpringState, target = s.target): void {
  s.target = target;
  s.current = target;
  s.velocity = 0;
}

// Color parsing goes through a 2D canvas, so it needs a document. On a server
// render there isn't one. The tint is a shader uniform that never reaches the
// DOM, so white stands in until hydration.
let _parseCtx: CanvasRenderingContext2D | null = null;
let _parseCtxTried = false;

function parseColor(color: string): [number, number, number] {
  if (!_parseCtxTried && typeof document !== 'undefined') {
    _parseCtx = document.createElement('canvas').getContext('2d');
    _parseCtxTried = true;
  }
  if (!_parseCtx) return [1, 1, 1];

  _parseCtx.fillStyle = '#000';
  _parseCtx.fillStyle = color;
  const c = _parseCtx.fillStyle;
  if (c.startsWith('#')) {
    return [
      parseInt(c.slice(1, 3), 16) / 255,
      parseInt(c.slice(3, 5), 16) / 255,
      parseInt(c.slice(5, 7), 16) / 255,
    ];
  }
  const m = c.match(/[\d.]+/g);
  if (m && m.length >= 3) {
    return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
  }
  return [1, 1, 1];
}

const BUTTON_STYLE = {
  display: 'flex' as const,
  flexDirection: 'column' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 2,
  padding: '6px 20px',
  border: 'none',
  background: 'none',
  fontSize: 10,
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  WebkitUserSelect: 'none' as const,
  userSelect: 'none' as const,
  lineHeight: 1,
};

export function LiquidGlassNav({
  items,
  activeItem,
  onItemChange,
  className,
  style,
  activeColor = 'rgba(255, 255, 255, 0.95)',
  inactiveColor = 'rgba(255, 255, 255, 0.5)',
  reducedMotion,
}: LiquidGlassNavProps) {
  const containerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const clipRectRef = useRef<SVGRectElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // clipPath is referenced by id, so every instance needs its own
  const clipId = `wlg-pill-clip-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const springX = useRef(createSpring(0));
  const springW = useRef(createSpring(0));
  const springSkew = useRef(createSpring(0));
  const springBulge = useRef(createSpring(0));

  const activeRef = useRef(activeItem);
  const initializedRef = useRef(false);
  const itemsRef = useRef(items);
  const onItemChangeRef = useRef(onItemChange);
  const visualTargetRef = useRef(activeItem);
  const tintColorRef = useRef<[number, number, number]>(parseColor(activeColor));
  const reducedMotionRef = useRef(false);
  // Restarts the animation loop after it idles out. Owned by the loop effect.
  const wakeRef = useRef<() => void>(noop);
  // Container rect, measured once per drag
  const containerRectRef = useRef<DOMRect | null>(null);
  const lastPointerUpRef = useRef(-Infinity);

  activeRef.current = activeItem;
  itemsRef.current = items;
  onItemChangeRef.current = onItemChange;
  tintColorRef.current = parseColor(activeColor);

  const drag = useRef<DragState>(emptyDrag());

  const targetTab = useCallback(
    (tabId: string) => {
      const container = containerRef.current;
      if (!container) return;
      const idx = items.findIndex((i) => i.id === tabId);
      const btn = itemRefs.current[idx];
      if (!btn) return;

      const cRect = container.getBoundingClientRect();
      const bRect = btn.getBoundingClientRect();
      const x = bRect.left - cRect.left + bRect.width / 2;
      const w = bRect.width;

      springX.current.target = x;
      springW.current.target = w;
      visualTargetRef.current = tabId;

      if (!initializedRef.current) {
        springX.current.current = x;
        springW.current.current = w;
        initializedRef.current = true;
      }

      wakeRef.current();
    },
    [items],
  );

  const findTabAt = useCallback((clientX: number, clientY: number): number => {
    for (let i = 0; i < itemRefs.current.length; i++) {
      const btn = itemRefs.current[i];
      if (!btn) continue;
      const r = btn.getBoundingClientRect();
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        return i;
      }
    }
    return -1;
  }, []);

  const findNearestTab = useCallback((): string | null => {
    // Measured fresh rather than reusing the drag cache: this runs once per
    // drag, and the nav can be scrolled out from under a stale rect.
    const container = containerRef.current;
    if (!container) return null;
    const cRect = container.getBoundingClientRect();
    const x = drag.current.currentX;

    let bestId: string | null = null;
    let bestDist = Infinity;

    itemRefs.current.forEach((btn, i) => {
      if (!btn) return;
      const bRect = btn.getBoundingClientRect();
      const center = bRect.left - cRect.left + bRect.width / 2;
      const dist = Math.abs(x - center);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = itemsRef.current[i]?.id ?? null;
      }
    });

    return bestId;
  }, []);

  const activate = useCallback((tabId: string) => {
    onItemChangeRef.current(tabId);
    const item = itemsRef.current.find((i) => i.id === tabId);
    item?.onClick?.();
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const tabIdx = findTabAt(e.clientX, e.clientY);
      if (tabIdx < 0) return;

      const pressedItem = itemsRef.current[tabIdx];
      if (!pressedItem) return;

      container.setPointerCapture(e.pointerId);

      // Measured once here and reused for the whole drag
      const cRect = container.getBoundingClientRect();
      containerRectRef.current = cRect;

      targetTab(pressedItem.id);

      const bRect = itemRefs.current[tabIdx]!.getBoundingClientRect();
      const tabCenterX = bRect.left - cRect.left + bRect.width / 2;

      drag.current = {
        active: true,
        moved: false,
        pointerId: e.pointerId,
        startPointerX: e.clientX,
        pillStartX: tabCenterX,
        currentX: tabCenterX,
        velocity: 0,
        prevX: e.clientX,
      };

      springBulge.current.target = 1;
    },
    [findTabAt, targetTab],
  );

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d.active || e.pointerId !== d.pointerId) return;

    // Measured at pointerdown. Refilled here only if a resize invalidated it.
    let cRect = containerRectRef.current;
    if (!cRect) {
      const container = containerRef.current;
      if (!container) return;
      cRect = container.getBoundingClientRect();
      containerRectRef.current = cRect;
    }

    const dx = e.clientX - d.startPointerX;

    if (!d.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      d.moved = true;
    }

    if (d.moved) {
      d.currentX = d.pillStartX + dx;
      const halfW = springW.current.current / 2;
      d.currentX = Math.max(halfW + 8, Math.min(cRect.width - halfW - 8, d.currentX));
    }

    const rawVel = e.clientX - d.prevX;
    d.velocity = d.velocity * (1 - VEL_SMOOTHING) + rawVel * VEL_SMOOTHING;
    d.prevX = e.clientX;
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active || e.pointerId !== d.pointerId) return;

      d.active = false;
      springBulge.current.target = 0;
      // The click that follows this is the one onTabClick has to drop
      lastPointerUpRef.current = e.timeStamp;

      let finalTab: string | null;
      if (d.moved) {
        finalTab = findNearestTab();
      } else {
        finalTab = visualTargetRef.current;
      }

      containerRectRef.current = null;

      if (finalTab) {
        activate(finalTab);
      }
    },
    [activate, findNearestTab],
  );

  const onTabClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>, tabId: string) => {
      // Pointer input already went through onPointerUp, and the browser sends
      // a click after every one of those. Keyboard and assistive-tech
      // activation arrives here as a click with detail 0 and no pointer
      // interaction behind it, which is the case worth acting on.
      if (e.detail !== 0) return;
      if (e.timeStamp - lastPointerUpRef.current < CLICK_DEDUPE_MS) return;

      targetTab(tabId);
      activate(tabId);
    },
    [activate, targetTab],
  );

  // Left/Right (plus Home/End) move focus. Activation stays on Enter/Space so
  // arrowing past a tab doesn't swap the view out from under you.
  const onTabKeyDown = useCallback((e: KeyboardEvent, index: number) => {
    const last = itemsRef.current.length - 1;
    let next: number;
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;

    e.preventDefault();
    itemRefs.current[next]?.focus();
  }, []);

  // Respect both the operating-system setting and the site's motion preference.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reducedMotionRef.current = reducedMotion ?? mq.matches;
      wakeRef.current();
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [reducedMotion]);

  // Main animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // WebGL is optional. The two backdrop-filter layers already read as glass,
    // so a missing context costs the overlay and nothing else.
    let renderer: LiquidGlassRenderer | null = null;
    try {
      // schedule() is hoisted; the renderer only ever calls it later, from a
      // context restore or a DPR change.
      renderer = new LiquidGlassRenderer(canvas, () => schedule());
    } catch (err) {
      console.warn(
        '[webgl-liquid-glass] WebGL unavailable, falling back to CSS-only glass:',
        err,
      );
    }
    canvas.style.display = renderer ? '' : 'none';

    // The tracker fires this on the settled -> moving edge, so a pointer sweep
    // is one wake rather than one per event.
    const motion = createMotionTracker(container, () => {
      if (!reducedMotionRef.current) schedule();
    });

    let lastTime = performance.now();
    let frame = 0;
    let running = true;

    // The loop only runs while something is moving. schedule() is the single
    // wake path. Anything that can change the picture goes through it.
    function schedule() {
      if (!running || frame) return;
      lastTime = performance.now();
      frame = requestAnimationFrame(loop);
    }
    wakeRef.current = schedule;

    function idle(): boolean {
      const d = drag.current;
      return (
        !d.active &&
        isSettled(springX.current) &&
        isSettled(springW.current) &&
        isSettled(springSkew.current) &&
        isSettled(springBulge.current) &&
        (reducedMotionRef.current || motion.isSettled())
      );
    }

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      // resize() reallocates the backing store, which clears it. The frame
      // scheduled below is what puts the overlay back.
      renderer?.resize(rect.width, rect.height);
      containerRectRef.current = null;
      targetTab(activeRef.current);
      schedule();
    });
    ro.observe(container);

    // The nav is centered, so the viewport can slide it sideways at an
    // unchanged width, which the ResizeObserver never sees.
    const onWindowResize = () => {
      containerRectRef.current = null;
    };
    window.addEventListener('resize', onWindowResize);

    const rect = container.getBoundingClientRect();
    renderer?.resize(rect.width, rect.height);
    const initFrame = requestAnimationFrame(() => targetTab(activeRef.current));

    function loop() {
      frame = 0;
      if (!running) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.064);
      lastTime = now;

      const d = drag.current;
      const sx = springX.current;
      const sw = springW.current;
      const sSkew = springSkew.current;
      const sBulge = springBulge.current;
      const reduced = reducedMotionRef.current;

      // --- Morph springs ---
      if (reduced) {
        // No bubble, no skew, no shimmer
        snapSpring(sBulge, 0);
        snapSpring(sSkew, 0);
      } else {
        updateSpring(sBulge, dt, 260, 16);

        if (d.active && d.moved) {
          sSkew.target = d.velocity * 0.6;
        } else {
          sSkew.target = 0;
        }
        updateSpring(sSkew, dt, 150, 7);
      }

      const bulge = sBulge.current;
      const skew = sSkew.current;

      // --- Position / width springs ---
      if (d.active && d.moved) {
        sx.current = d.currentX;
        if (reduced) {
          sx.velocity = 0;
        } else {
          const targetVel = d.velocity / Math.max(dt, 0.001);
          sx.velocity += (targetVel - sx.velocity) * 0.15;
        }
        sw.current = sw.target;
      } else if (reduced) {
        snapSpring(sx);
        snapSpring(sw);
      } else {
        updateSpring(sx, dt);
        updateSpring(sw, dt);
      }

      // --- Compute morph transforms ---
      const absSkew = Math.abs(skew);
      const morphScaleX = 1 + bulge * 0.12 + Math.min(absSkew * 0.005, 0.2);
      const morphScaleY = 1 + bulge * 0.55 - Math.min(absSkew * 0.003, 0.12);
      const morphSkewDeg = Math.max(-14, Math.min(14, skew * 0.35));

      const pillX = sx.current - sw.current / 2;

      // --- Update pill DOM ---
      if (pillRef.current) {
        pillRef.current.style.transform = `translateX(${pillX}px) scaleX(${morphScaleX}) scaleY(${morphScaleY}) skewX(${morphSkewDeg}deg)`;
        pillRef.current.style.width = `${sw.current}px`;
      }

      // --- Clip active layer to pill shape ---
      // Same rect, same transform, same origin as the pill above, so the hard
      // edge stays glued to it through skew and stretch.
      if (clipRectRef.current) {
        const ox = sw.current / 2;
        const oy = NAV_HEIGHT / 2;
        clipRectRef.current.setAttribute('width', `${Math.max(sw.current, 0)}`);
        clipRectRef.current.setAttribute(
          'transform',
          `translate(${pillX} 0) translate(${ox} ${oy}) scale(${morphScaleX} ${morphScaleY}) skewX(${morphSkewDeg}) translate(${-ox} ${-oy})`,
        );
      }

      // --- Render WebGL ---
      renderer?.render({
        lightPos: reduced ? STATIC_LIGHT : motion.lightPos,
        pillX: sx.current,
        pillWidth: sw.current * morphScaleX,
        pillHeight: PILL_HEIGHT * morphScaleY,
        navRadius: NAV_RADIUS,
        transitionVel: reduced ? 0 : sx.velocity,
        pressAmt: bulge,
        tintColor: tintColorRef.current,
      });

      // Everything has come to rest — stop until something wakes us
      if (idle()) return;

      frame = requestAnimationFrame(loop);
    }
    schedule();

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(initFrame);
      wakeRef.current = noop;
      ro.disconnect();
      window.removeEventListener('resize', onWindowResize);
      motion.destroy();
      renderer?.destroy();
    };
  }, [targetTab]);

  useEffect(() => {
    targetTab(activeItem);
  }, [activeItem, targetTab]);

  // The tint is a shader uniform, so a color change needs one more frame
  useEffect(() => {
    wakeRef.current();
  }, [activeColor]);

  // Shared tab content renderer
  const tabContent = (item: (typeof items)[number]) => (
    <>
      {item.icon && (
        <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>
          {item.icon}
        </span>
      )}
      <span style={{ display: 'grid' }}>
        <span style={{ gridArea: '1 / 1' }}>{item.label}</span>
        <span
          aria-hidden
          style={{
            gridArea: '1 / 1',
            fontWeight: 600,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {item.label}
        </span>
      </span>
    </>
  );

  return (
    <nav
      ref={containerRef}
      className={className}
      aria-label="Main"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        height: NAV_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        borderRadius: NAV_RADIUS,
        backdropFilter: 'blur(40px) saturate(170%)',
        WebkitBackdropFilter: 'blur(40px) saturate(170%)',
        background: 'rgba(255, 255, 255, 0.14)',
        boxShadow:
          '0 8px 32px rgba(0, 0, 0, 0.18), inset 0 0 0 0.5px rgba(255, 255, 255, 0.2)',
        overflow: 'visible',
        zIndex: 9999,
        WebkitUserSelect: 'none',
        userSelect: 'none',
        touchAction: 'none',
        cursor: 'pointer',
        ...style,
      }}
    >
      <style>{TAB_CSS}</style>

      {/* Pill */}
      <div
        ref={pillRef}
        style={{
          position: 'absolute',
          top: (NAV_HEIGHT - PILL_HEIGHT) / 2,
          left: 0,
          height: PILL_HEIGHT,
          borderRadius: PILL_HEIGHT / 2,
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'brightness(1.2) saturate(1.4)',
          WebkitBackdropFilter: 'brightness(1.2) saturate(1.4)',
          boxShadow:
            'inset 0 1px 1px rgba(255, 255, 255, 0.25), inset 0 -0.5px 1px rgba(255, 255, 255, 0.1), 0 4px 16px rgba(0, 0, 0, 0.1)',
          pointerEvents: 'none',
          willChange: 'transform, width',
          transformOrigin: 'center center',
        }}
      />

      {/* WebGL overlay */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          borderRadius: NAV_RADIUS,
          pointerEvents: 'none',
        }}
      />

      {/* Inactive layer (always visible, full width) */}
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          className={TAB_CLASS}
          aria-current={item.id === activeItem ? 'page' : undefined}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          onClick={(e) => onTabClick(e, item.id)}
          onKeyDown={(e) => onTabKeyDown(e, i)}
          style={{
            ...BUTTON_STYLE,
            position: 'relative',
            zIndex: 1,
            color: inactiveColor,
            fontWeight: 400,
          }}
        >
          {tabContent(item)}
        </button>
      ))}

      {/* Pill-shaped clip region for the active layer. Width and transform are
          driven from the animation loop; a zero width clips everything out. */}
      <svg
        aria-hidden
        focusable="false"
        width={0}
        height={0}
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect
              ref={clipRectRef}
              x={0}
              y={(NAV_HEIGHT - PILL_HEIGHT) / 2}
              width={0}
              height={PILL_HEIGHT}
              rx={PILL_HEIGHT / 2}
            />
          </clipPath>
        </defs>
      </svg>

      {/* Active layer (clipped to pill shape — hard edge) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          pointerEvents: 'none',
          zIndex: 2,
          clipPath: `url(#${clipId})`,
          WebkitClipPath: `url(#${clipId})`,
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              ...BUTTON_STYLE,
              color: activeColor,
              fontWeight: 600,
            }}
          >
            {tabContent(item)}
          </div>
        ))}
      </div>
    </nav>
  );
}
