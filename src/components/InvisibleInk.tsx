import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

// iMessage-style invisible ink: a uniform, fine-grain particle veil covers the whole
// message area. Dragging a finger removes only the veil beneath the gesture; the
// original text is revealed in place. A tap reveals everything temporarily.
const WIPE_RADIUS = 26;
const RECOVER_DELAY = 5000;
const RECOVER_FADE_MS = 900;
const FRAME_INTERVAL_MS = 42;
const MAX_PARTICLES = 5200;

type Particle = {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  phase: number;
  speed: number;
  drift: number;
  light: boolean;
};

type Point = { x: number; y: number };

type InkPalette = {
  background: string;
  light: string;
  shade: string;
};

function seededRandom(seed: number): number {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function isTransparentColor(color: string): boolean {
  return !color || color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)/.test(color);
}

export default function InvisibleInk({ text }: { text: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const paletteRef = useRef<InkPalette>({
    background: 'rgb(233, 233, 235)',
    light: 'rgba(255, 255, 255, 0.82)',
    shade: 'rgba(75, 85, 99, 0.3)',
  });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const recoveryTimerRef = useRef<number | null>(null);
  const recoveringRef = useRef(false);
  const recoveryStartedRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const inViewRef = useRef(true);
  const pendingScrollRecoverRef = useRef(false);
  const pointerRef = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    startedAt: number;
    mode: 'pending' | 'wipe' | 'scroll';
  } | null>(null);

  // Sample one jittered point per small grid cell. The grid prevents random clumps,
  // while deterministic jitter keeps the texture stable after resize and rerender.
  const seedParticles = () => {
    const { width, height } = sizeRef.current;
    if (!width || !height) return;

    const area = width * height;
    const spacing = Math.max(2.15, Math.sqrt(area / MAX_PARTICLES));
    const particles: Particle[] = [];
    const columns = Math.ceil(width / spacing);
    let index = 0;

    for (let y = spacing * 0.5; y < height; y += spacing) {
      for (let x = spacing * 0.5; x < width; x += spacing) {
        const seed = Math.imul(index + 1, 0x45d9f3b);
        const rx = seededRandom(seed ^ 0x68bc21eb);
        const ry = seededRandom(seed ^ 0x02e5be93);
        const size = seededRandom(seed ^ 0x967a889b);
        particles.push({
          x: Math.min(width, x + (rx - 0.5) * spacing * 0.72),
          y: Math.min(height, y + (ry - 0.5) * spacing * 0.72),
          radius: 0.48 + size * 0.43,
          opacity: 0.2 + seededRandom(seed ^ 0x51ed270b) * 0.34,
          phase: seededRandom(seed ^ 0x165667b1) * Math.PI * 2,
          speed: 0.6 + seededRandom(seed ^ 0x7f4a7c15) * 0.8,
          drift: 0.08 + seededRandom(seed ^ 0x94d049bb) * 0.2,
          light: seededRandom(seed ^ 0x27d4eb2f) > 0.34,
        });
        index += 1;
        if (index >= MAX_PARTICLES) break;
      }
      if (index >= MAX_PARTICLES) break;
    }

    // A sparse second grain adds depth without creating large circles or bright blobs.
    const fineSpacing = spacing * 0.72;
    const fineCount = Math.min(1100, Math.floor(area / (fineSpacing * fineSpacing) * 0.18));
    for (let i = 0; i < fineCount; i += 1) {
      const seed = Math.imul(i + 1, 0x27d4eb2d) ^ 0x165667b1;
      particles.push({
        x: seededRandom(seed ^ 0x68bc21eb) * width,
        y: seededRandom(seed ^ 0x02e5be93) * height,
        radius: 0.34 + seededRandom(seed ^ 0x967a889b) * 0.28,
        opacity: 0.12 + seededRandom(seed ^ 0x51ed270b) * 0.2,
        phase: seededRandom(seed ^ 0x165667b1) * Math.PI * 2,
        speed: 0.5 + seededRandom(seed ^ 0x7f4a7c15) * 0.7,
        drift: 0.05 + seededRandom(seed ^ 0x94d049bb) * 0.12,
        light: seededRandom(seed ^ 0x27d4eb2f) > 0.28,
      });
    }

    particlesRef.current = particles;
    void columns;
  };

  const resolvePalette = () => {
    const root = rootRef.current;
    if (!root) return;
    const bubble = root.closest<HTMLElement>('.im-bubble');
    const isMine = bubble?.classList.contains('mine') ?? false;
    const computedBackground = bubble ? window.getComputedStyle(bubble).backgroundColor : '';
    const background = isTransparentColor(computedBackground)
      ? (isMine ? 'rgb(10, 132, 255)' : 'rgb(233, 233, 235)')
      : computedBackground;

    paletteRef.current = {
      background,
      light: isMine ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.88)',
      shade: isMine ? 'rgba(0, 42, 112, 0.42)' : 'rgba(75, 85, 99, 0.32)',
    };
  };

  const paintField = (now = performance.now()) => {
    const field = fieldRef.current;
    if (!field) return;
    const { width, height, dpr } = sizeRef.current;
    const ctx = field.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = paletteRef.current.background;
    ctx.fillRect(0, 0, width, height);

    const time = now / 1000;
    for (const particle of particlesRef.current) {
      const phase = time * particle.speed + particle.phase;
      const driftX = reducedMotionRef.current ? 0 : Math.sin(phase) * particle.drift;
      const driftY = reducedMotionRef.current ? 0 : Math.cos(phase * 0.83) * particle.drift;
      const shimmer = reducedMotionRef.current ? 1 : 0.78 + (Math.sin(phase * 1.7) + 1) * 0.11;

      ctx.globalAlpha = particle.opacity * shimmer;
      ctx.fillStyle = particle.light ? paletteRef.current.light : paletteRef.current.shade;
      ctx.beginPath();
      ctx.arc(particle.x + driftX, particle.y + driftY, particle.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const drawFrame = (now: number) => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    const mask = maskRef.current;
    if (!canvas || !field || !mask) return;

    const { width, height, dpr } = sizeRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    paintField(now);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(field, 0, 0, width, height);

    ctx.globalCompositeOperation = 'destination-out';
    if (recoveringRef.current) {
      const progress = Math.min(1, (now - recoveryStartedRef.current) / RECOVER_FADE_MS);
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(mask, 0, 0, width, height);
      ctx.globalAlpha = 1;
      if (progress >= 1) {
        recoveringRef.current = false;
        mask.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);
      }
    } else {
      ctx.drawImage(mask, 0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const eraseMaskAlongPath = (start: Point, end: Point) => {
    const mask = maskRef.current;
    if (!mask) return;
    const ctx = mask.getContext('2d');
    if (!ctx) return;

    const { dpr } = sizeRef.current;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = WIPE_RADIUS * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    if (start.x === end.x && start.y === end.y) {
      ctx.arc(start.x, start.y, WIPE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.restore();
  };

  const wipeBetween = (
    clientStartX: number,
    clientStartY: number,
    clientEndX: number,
    clientEndY: number,
  ) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    eraseMaskAlongPath(
      { x: clientStartX - rect.left, y: clientStartY - rect.top },
      { x: clientEndX - rect.left, y: clientEndY - rect.top },
    );
  };

  const revealAll = () => {
    const mask = maskRef.current;
    if (!mask) return;
    const { width, height, dpr } = sizeRef.current;
    const ctx = mask.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    recoveringRef.current = false;
    scheduleRecover();
  };

  const scheduleRecover = () => {
    if (recoveryTimerRef.current !== null) {
      window.clearTimeout(recoveryTimerRef.current);
    }
    recoveringRef.current = false;
    recoveryTimerRef.current = window.setTimeout(() => {
      recoveryTimerRef.current = null;
      if (reducedMotionRef.current) {
        const mask = maskRef.current;
        mask?.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);
        drawFrame(performance.now());
        return;
      }
      recoveringRef.current = true;
      recoveryStartedRef.current = performance.now();
    }, RECOVER_DELAY);
  };

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => {
      reducedMotionRef.current = motionQuery.matches;
      if (reducedMotionRef.current) drawFrame(performance.now());
    };
    syncMotionPreference();

    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    fieldRef.current = document.createElement('canvas');
    maskRef.current = document.createElement('canvas');

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.ceil(rect.width));
      const height = Math.max(1, Math.ceil(rect.height));
      if (width === sizeRef.current.width && height === sizeRef.current.height && dpr === sizeRef.current.dpr) {
        return;
      }

      sizeRef.current = { width, height, dpr };
      for (const surface of [canvas, fieldRef.current, maskRef.current]) {
        if (!surface) continue;
        surface.width = Math.ceil(width * dpr);
        surface.height = Math.ceil(height * dpr);
      }

      resolvePalette();
      recoveringRef.current = false;
      const mask = maskRef.current;
      mask?.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);
      seedParticles();
      drawFrame(performance.now());
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);

    const visibilityObserver = new IntersectionObserver(
      entries => { inViewRef.current = entries[0]?.isIntersecting ?? true; },
      { threshold: 0 },
    );
    visibilityObserver.observe(root);

    const recoverAfterScroll = () => {
      if (!pendingScrollRecoverRef.current) return;
      pendingScrollRecoverRef.current = false;
      scheduleRecover();
    };
    document.addEventListener('scrollend', recoverAfterScroll, true);
    motionQuery.addEventListener('change', syncMotionPreference);

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!inViewRef.current || reducedMotionRef.current) return;
      if (now - lastFrameRef.current < FRAME_INTERVAL_MS) return;
      lastFrameRef.current = now;
      drawFrame(now);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('scrollend', recoverAfterScroll, true);
      motionQuery.removeEventListener('change', syncMotionPreference);
      if (recoveryTimerRef.current !== null) {
        window.clearTimeout(recoveryTimerRef.current);
      }
    };
    // The text is immutable for a mounted spoiler node; resize observes line wrapping and font changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    pendingScrollRecoverRef.current = false;
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      mode: event.pointerType === 'touch' ? 'pending' : 'wipe',
    };
    if (recoveryTimerRef.current !== null) {
      window.clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    recoveringRef.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable in embedded webviews; normal pointer events still work.
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const previous = pointerRef.current;
    if (!previous) return;
    const next = { ...previous, x: event.clientX, y: event.clientY };

    if (previous.mode === 'pending') {
      const deltaX = event.clientX - previous.startX;
      const deltaY = event.clientY - previous.startY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) {
        pointerRef.current = next;
        return;
      }
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        pointerRef.current = { ...next, mode: 'scroll' };
        return;
      }
      pointerRef.current = { ...next, mode: 'wipe' };
      wipeBetween(previous.startX, previous.startY, event.clientX, event.clientY);
      return;
    }

    if (previous.mode === 'scroll') {
      pointerRef.current = next;
      return;
    }

    wipeBetween(previous.x, previous.y, event.clientX, event.clientY);
    pointerRef.current = next;
  };

  const onPointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    const pointer = pointerRef.current;
    pointerRef.current = null;
    pendingScrollRecoverRef.current = false;
    if (!pointer) return;

    const moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    const elapsed = performance.now() - pointer.startedAt;
    if (moved < 10 && elapsed < 400) {
      revealAll();
    } else {
      scheduleRecover();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      revealAll();
    }
  };

  return (
    <span
      ref={rootRef}
      className="im-ink"
      role="button"
      tabIndex={0}
      aria-label="隐形消息，滑动擦除或点按显示内容"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(event) => {
        pointerRef.current = null;
        if (event.pointerType === 'touch') {
          // Let native vertical scrolling finish before starting the reveal recovery timer.
          pendingScrollRecoverRef.current = true;
        } else {
          scheduleRecover();
        }
      }}
      onKeyDown={onKeyDown}
      style={{
        position: 'relative',
        display: 'inline-block',
        maxWidth: '100%',
        overflow: 'hidden',
        verticalAlign: 'baseline',
        borderRadius: '4px',
        isolation: 'isolate',
        lineHeight: 'inherit',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        touchAction: 'pan-y',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'pointer',
      }}
    >
      <span className="im-ink-content" style={{ position: 'relative', zIndex: 0 }}>
        {text}
      </span>
      <canvas
        ref={canvasRef}
        className="im-ink-canvas"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          display: 'block',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
    </span>
  );
}
