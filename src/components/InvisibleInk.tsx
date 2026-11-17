import { useEffect, useRef } from 'react';

// iMessage 式隐形墨水：文字先被粒子盖住，手指滑过就擦掉、露出底下的字；
// 停 5 秒没碰自动盖回去；点一下（或按回车/空格）直接全显。
// 做法：字拆成单字 span（opacity 0 盖住），上面盖一层粒子画布；滑动时同时
// 做两件事——擦掉手指附近的粒子、把附近的字拨回 opacity 1。
// 粒子只布在字的位置上（按单字 rect 布点），不铺满整个气泡；
// 减动效时粒子静止、盖回不做淡入淡出。
// 之前用的是 GitHub 的 spoiled（点按显现），用户 2026-11-17 01:16 令改滑动版，
// spoiled 的粒子是 paint worklet 画的、没法按区域擦掉，所以改成自写组件。

const WIPE_RADIUS = 44;
const RECOVER_DELAY = 5000;
const RECOVER_FADE_MS = 900;
const WIPE_FADE_MS = 180;

type Particle = { x: number; y: number; r: number; color: string; charIndex: number };

// Small deterministic noise avoids random reshuffling when the component is resized.
function particleRandom(seed: number): number {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
type Point = { x: number; y: number };
type InkRect = { left: number; top: number; right: number; bottom: number };

const pointToSegmentDistanceSquared = (point: Point, start: Point, end: Point) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    const px = point.x - start.x;
    const py = point.y - start.y;
    return px * px + py * py;
  }
  const projection = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  const closestX = start.x + projection * dx;
  const closestY = start.y + projection * dy;
  const px = point.x - closestX;
  const py = point.y - closestY;
  return px * px + py * py;
};

const segmentsIntersect = (a: Point, b: Point, c: Point, d: Point) => {
  const cross = (p1: Point, p2: Point, p3: Point) =>
    (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
  const onSegment = (p1: Point, p2: Point, point: Point) =>
    point.x >= Math.min(p1.x, p2.x) - 1e-8 &&
    point.x <= Math.max(p1.x, p2.x) + 1e-8 &&
    point.y >= Math.min(p1.y, p2.y) - 1e-8 &&
    point.y <= Math.max(p1.y, p2.y) + 1e-8;

  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  const epsilon = 1e-8;

  if (
    ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
    ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))
  ) return true;

  return (
    (Math.abs(abC) <= epsilon && onSegment(a, b, c)) ||
    (Math.abs(abD) <= epsilon && onSegment(a, b, d)) ||
    (Math.abs(cdA) <= epsilon && onSegment(c, d, a)) ||
    (Math.abs(cdB) <= epsilon && onSegment(c, d, b))
  );
};

const segmentToSegmentDistanceSquared = (a: Point, b: Point, c: Point, d: Point) => {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(
    pointToSegmentDistanceSquared(a, c, d),
    pointToSegmentDistanceSquared(b, c, d),
    pointToSegmentDistanceSquared(c, a, b),
    pointToSegmentDistanceSquared(d, a, b),
  );
};

// 判断整条擦除线段与字符矩形之间的最短距离，命中字符任意边缘即可露出整字。
const segmentTouchesRect = (start: Point, end: Point, rect: InkRect, radius: number) => {
  const contains = (point: Point) =>
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom;
  if (contains(start) || contains(end)) return true;

  const topLeft = { x: rect.left, y: rect.top };
  const topRight = { x: rect.right, y: rect.top };
  const bottomRight = { x: rect.right, y: rect.bottom };
  const bottomLeft = { x: rect.left, y: rect.bottom };
  const edges: Array<[Point, Point]> = [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ];
  const radiusSquared = radius * radius;
  return edges.some(
    ([edgeStart, edgeEnd]) =>
      segmentToSegmentDistanceSquared(start, end, edgeStart, edgeEnd) <= radiusSquared,
  );
};

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
  const downRef = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    t: number;
    mode: 'pending' | 'wipe' | 'scroll';
  } | null>(null);
  const pendingScrollRecoverRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const inViewRef = useRef(true);

  // 从浏览器真实字形的 alpha 蒙版取样，而不是在每个字符的矩形里撒点。
  // 旧算法把粒子随机放在字框里，视觉上就会变成每个字一团；模糊阴影又把小点粘在一起。
  const seedParticles = () => {
    const root = rootRef.current;
    if (!root) return;
    const rootRect = root.getBoundingClientRect();
    const particles: Particle[] = [];
    const scale = 2;
    const sampleStep = 3;

    chars.forEach((ch, i) => {
      if (!ch.trim()) return;
      const el = charRefs.current[i];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = rect.left - rootRect.left;
      const y = rect.top - rootRect.top;
      const w = rect.width;
      const h = rect.height;
      if (w <= 0 || h <= 0) return;

      const raster = document.createElement('canvas');
      raster.width = Math.max(1, Math.ceil(w * scale));
      raster.height = Math.max(1, Math.ceil(h * scale));
      const rasterContext = raster.getContext('2d', { willReadFrequently: true });
      if (!rasterContext) return;

      const style = window.getComputedStyle(el);
      rasterContext.scale(scale, scale);
      rasterContext.font = [
        style.fontStyle,
        style.fontVariant,
        style.fontWeight,
        style.fontSize,
        style.fontFamily,
      ].join(' ');
      rasterContext.textAlign = 'center';
      rasterContext.textBaseline = 'alphabetic';
      rasterContext.fillStyle = '#ffffff';

      const metrics = rasterContext.measureText(ch);
      const ascent = metrics.actualBoundingBoxAscent || parseFloat(style.fontSize) * 0.75;
      const descent = metrics.actualBoundingBoxDescent || parseFloat(style.fontSize) * 0.25;
      const glyphHeight = ascent + descent;
      const baseline = (h - glyphHeight) / 2 + ascent;
      rasterContext.fillText(ch, w / 2, baseline);

      const pixels = rasterContext.getImageData(0, 0, raster.width, raster.height).data;
      for (let py = 1; py < raster.height; py += sampleStep) {
        for (let px = 1; px < raster.width; px += sampleStep) {
          const alpha = pixels[(py * raster.width + px) * 4 + 3] / 255;
          if (alpha < 0.28) continue;

          const seed = Math.imul(i + 1, 73856093) ^ Math.imul(px + 1, 19349663) ^ Math.imul(py + 1, 83492791);
          if (particleRandom(seed) > alpha * 0.88) continue;

          const shade = 78 + Math.round(particleRandom(seed ^ 0x51ed270b) * 16);
          particles.push({
            x: x + (px + particleRandom(seed ^ 0x68bc21eb) * sampleStep) / scale,
            y: y + (py + particleRandom(seed ^ 0x02e5be93) * sampleStep) / scale,
            r: 0.42 + particleRandom(seed ^ 0x967a889b) * 0.42,
            color: `hsl(212 76% ${shade}%)`,
            charIndex: i,
          });
        }
      }
    });

    // Keep the cloud detailed without allowing very long messages to create an excessive canvas workload.
    if (particles.length > 1800) {
      const stride = Math.ceil(particles.length / 1800);
      particlesRef.current = particles.filter((_, index) => index % stride === 0).slice(0, 1800);
    } else {
      particlesRef.current = particles;
    }
  };
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
      // 整个字符被路径命中后，移除该字符对应的全部粒子，避免字已露出却仍被粒子遮挡。
      if (revealedRef.current[p.charIndex]) continue;
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

  // 粒子遮罩沿触点线段擦除，圆头线宽与字符命中半径完全一致。
  const eraseMaskAlongPath = (start: Point, end: Point) => {
    const mask = maskRef.current;
    if (!mask) return;
    const ctx = mask.getContext('2d');
    if (!ctx) return;
    const { dpr } = sizeRef.current;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = WIPE_RADIUS * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
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
    const rootRect = root.getBoundingClientRect();
    const start = {
      x: clientStartX - rootRect.left,
      y: clientStartY - rootRect.top,
    };
    const end = {
      x: clientEndX - rootRect.left,
      y: clientEndY - rootRect.top,
    };

    // 遮罩和字符检测使用同一条线段、同一个 WIPE_RADIUS。
    eraseMaskAlongPath(start, end);
    let revealedAny = false;
    chars.forEach((_, i) => {
      if (revealedRef.current[i]) return;
      const el = charRefs.current[i];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const localRect = {
        left: rect.left - rootRect.left,
        top: rect.top - rootRect.top,
        right: rect.right - rootRect.left,
        bottom: rect.bottom - rootRect.top,
      };
      if (segmentTouchesRect(start, end, localRect, WIPE_RADIUS)) {
        revealedRef.current[i] = true;
        setCharOpacity(i, 1, WIPE_FADE_MS);
        revealedAny = true;
      }
    });

    // 字符按整字显现，因此同步从粒子底图移除该字符的所有粒子。
    if (revealedAny) paintField();
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
    paintField();
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
        paintField();
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
      paintField();
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
    // Keep the micro-particles pixel-sharp; shifting the whole layer every frame made them blur into clumps.
    ctx.drawImage(field, 0, 0, w, h);
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
    ctx.drawImage(mask, 0, 0, w, h);
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
    const recoverAfterScroll = () => {
      if (!pendingScrollRecoverRef.current) return;
      pendingScrollRecoverRef.current = false;
      scheduleRecover();
    };
    // 触摸纵向滚动会收到 pointercancel；等浏览器确认滚动结束后才启动恢复计时。
    document.addEventListener('scrollend', recoverAfterScroll, true);
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
      document.removeEventListener('scrollend', recoverAfterScroll, true);
      if (regenTimerRef.current !== null) window.clearTimeout(regenTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
    pendingScrollRecoverRef.current = false;
    downRef.current = {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      t: performance.now(),
      // 触摸先判断方向；纵向交给页面滚动，横向才启动擦除。
      mode: event.pointerType === 'touch' ? 'pending' : 'wipe',
    };
    if (regenTimerRef.current !== null) {
      window.clearTimeout(regenTimerRef.current);
      regenTimerRef.current = null;
    }
    regeneratingRef.current = false;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  };

  const onPointerMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    const previous = downRef.current;
    if (!previous) return;
    const next = { ...previous, x: event.clientX, y: event.clientY };

    if (previous.mode === 'pending') {
      const deltaX = event.clientX - previous.startX;
      const deltaY = event.clientY - previous.startY;
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 8) {
        downRef.current = next;
        return;
      }
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        downRef.current = { ...next, mode: 'scroll' };
        return;
      }
      downRef.current = { ...next, mode: 'wipe' };
      wipeBetween(previous.startX, previous.startY, event.clientX, event.clientY);
      return;
    }

    if (previous.mode === 'scroll') {
      downRef.current = next;
      return;
    }

    wipeBetween(previous.x, previous.y, event.clientX, event.clientY);
    // 保存上一触点，使下一次采样与它相连，而不是只擦一个孤立圆点。
    downRef.current = next;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLSpanElement>) => {
    const down = downRef.current;
    downRef.current = null;
    pendingScrollRecoverRef.current = false;
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.startX, event.clientY - down.startY);
    const dt = performance.now() - down.t;
    if (moved < 10 && dt < 400) {
      // 点一下：直接全显（和 iOS 点按隐形墨水一样）。
      revealAll();
    } else {
      // 包括实际收到 pointerup 的纵向手势，均从触点结束后开始计时。
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
      onPointerCancel={(event) => {
        downRef.current = null;
        if (event.pointerType === 'touch') {
          // 浏览器接管纵向滚动时手指仍可能按着屏幕，不能把 pointercancel 当作抬手。
          pendingScrollRecoverRef.current = true;
        } else {
          scheduleRecover();
        }
      }}
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
