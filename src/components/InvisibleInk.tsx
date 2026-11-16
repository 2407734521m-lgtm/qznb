import { useEffect, useRef } from 'react';

// iMessage 式隐形墨水：文字先被粒子盖住，手指滑过就擦掉、露出底下的字；
// 停 5 秒没碰自动盖回去；点一下（或按回车/空格）直接全显。
// 做法：字拆成单字 span（opacity 0 盖住），上面盖一层粒子画布；滑动时同时
// 做两件事——擦掉手指附近的粒子、把附近的字拨回 opacity 1。
// 粒子只布在字的位置上（按单字 rect 布点），不铺满整个气泡；
// 减动效时粒子静止、盖回不做淡入淡出。
// 之前用的是 GitHub 的 spoiled（点按显现），用户 2026-11-17 01:16 令改滑动版，
// spoiled 的粒子是 paint worklet 画的、没法按区域擦掉，所以改成自写组件。

const WIPE_RADIUS = 28;
const RECOVER_DELAY = 5000;
const RECOVER_FADE_MS = 900;
const WIPE_FADE_MS = 180;

type Particle = { x: number; y: number; r: number; color: string };

export default function InvisibleInk({ text }: { text: string }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const charRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const chars = Array.from(text);
  const revealedRef = useRef<boolean[]>(chars.map(() => false));
  const particlesRef = useRef<Particle[]>([]);
  const fieldRef = useRef<HTMLCanvasElement | null>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);
  const regenTimerRef = useRef<number | null>(null);
  const regeneratingRef = useRef(false);
  const regenStartRef = useRef(0);
  const downRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const reducedMotionRef = useRef(false);
  const inViewRef = useRef(true);

  // 按单字位置布粒子点（只盖住字，不铺满气泡空白处）。
  const seedParticles = () => {
    const root = rootRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const particles: Particle[] = [];
    chars.forEach((_, i) => {
      const el = charRefs.current[i];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = rect.left - rootRect.left;
      const y = rect.top - rootRect.top;
      const w = rect.width;
      const h = rect.height;
      if (w <= 0 || h <= 0) return;
      const count = Math.max(2, Math.round((w * h) / 36));
      for (let j = 0; j < count; j++) {
        const light = 88 + Math.random() * 10;
        particles.push({
          x: x + Math.random() * w,
          y: y + Math.random() * h,
          r: 0.8 + Math.random() * 1.1,
          color: `hsl(210 100% ${light.toFixed(0)}%)`,
        });
      }
    });
    particlesRef.current = particles.slice(0, 800);
  };

  // 把粒子点画到 field 画布上（静态底图，每帧只做整体微移闪一下）。
  const paintField = () => {
    const field = fieldRef.current;
    if (!field) return;
    const { w, h, dpr } = sizeRef.current;
    const ctx = field.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const p of particlesRef.current) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const setCharOpacity = (index: number, value: number, durationMs: number) => {
    const el = charRefs.current[index];
    if (!el) return;
    el.style.transitionDuration = `${durationMs}ms`;
    el.style.opacity = String(value);
  };

  const eraseMaskAt = (x: number, y: number) => {
    const mask = maskRef.current;
    if (!mask) return;
    const ctx = mask.getContext('2d');
    if (!ctx) return;
    const { dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, WIPE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  };

  const wipeAt = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const x = clientX - rootRect.left;
    const y = clientY - rootRect.top;
    eraseMaskAt(x, y);
    chars.forEach((_, i) => {
      if (revealedRef.current[i]) return;
      const el = charRefs.current[i];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left - rootRect.left + rect.width / 2;
      const cy = rect.top - rootRect.top + rect.height / 2;
      if (Math.hypot(cx - x, cy - y) <= WIPE_RADIUS) {
        revealedRef.current[i] = true;
        setCharOpacity(i, 1, WIPE_FADE_MS);
      }
    });
    scheduleRecover();
  };

  const revealAll = () => {
    const mask = maskRef.current;
    if (mask) {
      const ctx = mask.getContext('2d');
      if (ctx) {
        const { w, h, dpr } = sizeRef.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
      }
    }
    chars.forEach((_, i) => {
      if (revealedRef.current[i]) return;
      revealedRef.current[i] = true;
      setCharOpacity(i, 1, WIPE_FADE_MS);
    });
    scheduleRecover();
  };

  const scheduleRecover = () => {
    regeneratingRef.current = false;
    if (regenTimerRef.current !== null) window.clearTimeout(regenTimerRef.current);
    regenTimerRef.current = window.setTimeout(() => {
      if (reducedMotionRef.current) {
        // 减动效：直接盖回，不淡入淡出。
        chars.forEach((_, i) => {
          revealedRef.current[i] = false;
          setCharOpacity(i, 0, 0);
        });
        const mask = maskRef.current;
        if (mask) mask.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);
        return;
      }
      regeneratingRef.current = true;
      regenStartRef.current = performance.now();
      chars.forEach((_, i) => {
        revealedRef.current[i] = false;
        setCharOpacity(i, 0, RECOVER_FADE_MS);
      });
    }, RECOVER_DELAY);
  };

  // 画一帧：底图微移闪一下，再用 mask 擦掉已滑过的区域；盖回时 mask 慢慢淡掉。
  const drawFrame = (now: number) => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    const mask = maskRef.current;
    if (!canvas || !field || !mask) return;
    const { w, h, dpr } = sizeRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const ox = reducedMotionRef.current ? 0 : (Math.random() - 0.5) * 1.4;
    const oy = reducedMotionRef.current ? 0 : (Math.random() - 0.5) * 1.4;
    ctx.drawImage(field, ox, oy);
    if (regeneratingRef.current) {
      const progress = (now - regenStartRef.current) / RECOVER_FADE_MS;
      if (progress >= 1) {
        regeneratingRef.current = false;
        mask.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);
      } else {
        const mctx = mask.getContext('2d');
        if (mctx) {
          mctx.setTransform(1, 0, 0, 1, 0, 0);
          mctx.globalCompositeOperation = 'destination-out';
          mctx.fillStyle = 'rgba(0,0,0,0.12)';
          mctx.fillRect(0, 0, mask.width, mask.height);
          mctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  };

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    fieldRef.current = document.createElement('canvas');
    maskRef.current = document.createElement('canvas');

    const resize = () => {
      const rect = root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      sizeRef.current = { w, h, dpr };
      for (const c of [canvas, fieldRef.current, maskRef.current]) {
        if (!c) continue;
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      // 尺寸变了（换行/转屏）就回到盖住状态，避免字和粒子错位。
      revealedRef.current = chars.map(() => false);
      charRefs.current.forEach((el, i) => {
        if (el) {
          el.style.transitionDuration = '0ms';
          el.style.opacity = '0';
        }
        void i;
      });
      maskRef.current?.getContext('2d')?.clearRect(0, 0, maskRef.current.width, maskRef.current.height);
      seedParticles();
      paintField();
      drawFrame(performance.now());
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);

    const inView = new IntersectionObserver(
      (entries) => { inViewRef.current = entries[0]?.isIntersecting ?? true; },
      { threshold: 0 },
    );
    inView.observe(root);

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      if (!inViewRef.current) return;
      if (now - lastFrameRef.current < 33) return;
      lastFrameRef.current = now;
      drawFrame(now);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      inView.disconnect();
      if (regenTimerRef.current !== null) window.clearTimeout(regenTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
    downRef.current = { x: event.clientX, y: event.clientY, t: performance.now() };
    if (regenTimerRef.current !== null) window.clearTimeout(regenTimerRef.current);
    regeneratingRef.current = false;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  };

  const onPointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!downRef.current) return;
    wipeAt(event.clientX, event.clientY);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLSpanElement>) => {
    const down = downRef.current;
    downRef.current = null;
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const dt = performance.now() - down.t;
    if (moved < 10 && dt < 400) {
      // 点一下：直接全显（和 iOS 点按隐形墨水一样）。
      revealAll();
    } else {
      scheduleRecover();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
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
      onPointerCancel={() => { downRef.current = null; scheduleRecover(); }}
      onKeyDown={onKeyDown}
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          ref={(el) => { charRefs.current[i] = el; }}
          className="im-ink-char"
        >
          {ch}
        </span>
      ))}
      <canvas ref={canvasRef} className="im-ink-canvas" aria-hidden="true" />
    </span>
  );
}
