import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles-particle-flower.css';

type Point = { x: number; y: number; z: number };
type Particle = {
  seed: number; angle: number; depth: number; size: number; phase: number;
  budX: number; budY: number; budZ: number; bloomX: number; bloomY: number; bloomZ: number;
  x: number; y: number; vx: number; vy: number;
};
type Mode = 'gesture' | 'demo';

const HAND_CONNECTIONS: number[][] = [
  [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
];
// 模型脚本双源：一个 CDN 不通就换下一个，都带超时，不再无限转圈。
const HANDS_SOURCES = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
  'https://unpkg.com/@mediapipe/hands',
];
const IS_WECHAT = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent || '');

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function distance(a: any, b: any) { return Math.hypot(a.x - b.x, a.y - b.y); }

// 摄像头画面是 object-fit: cover 铺满屏幕的，关键点必须按同样的
// cover 变换（等比放大 + 居中裁剪 + 镜像）映射，骨骼才会和画面里的手重合。
function coverMap(x: number, y: number, vw: number, vh: number, w: number, h: number) {
  if (!vw || !vh) return { x: (1 - x) * w, y: y * h };
  const s = Math.max(w / vw, h / vh);
  const dw = vw * s, dh = vh * s;
  return { x: (w - dw) / 2 + (1 - x) * dw, y: (h - dh) / 2 + y * dh };
}

function loadScript(src: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-bloom-src="' + src + '"]') as HTMLScriptElement | null;
    if (existing && (existing as any).dataset.loaded === '1') { resolve(); return; }
    const script = existing || document.createElement('script');
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return; settled = true;
      reject(new Error('模型脚本加载超时'));
    }, timeoutMs);
    const done = (ok: boolean) => {
      if (settled) return; settled = true;
      window.clearTimeout(timer);
      if (ok) { script.dataset.loaded = '1'; resolve(); }
      else reject(new Error('模型脚本加载失败'));
    };
    script.addEventListener('load', () => done(true), { once: true });
    script.addEventListener('error', () => done(false), { once: true });
    if (!existing) {
      script.src = src; script.async = true; script.crossOrigin = 'anonymous';
      script.dataset.bloomSrc = src;
      document.head.appendChild(script);
    }
  });
}

async function loadHands(): Promise<string> {
  if ((window as any).Hands) return HANDS_SOURCES[0];
  for (const base of HANDS_SOURCES) {
    try {
      await loadScript(base + '/hands.js', 12000);
      if ((window as any).Hands) return base;
    } catch { /* 换下一个源 */ }
  }
  throw new Error('手部模型加载失败：当前网络连不上模型服务器，换个网络或稍后再试。');
}

function makeParticles(count: number): Particle[] {
  const out: Particle[] = [];
  const TAU = Math.PI * 2;

  for (let i = 0; i < count; i++) {
    const seed = Math.random() * 1000;
    const angle = Math.random() * TAU;
    const depth = Math.random() * 2 - 1;

    // 花苞保持紧凑的椭球体，绽放态改为多层花冠，而不是一张均匀的圆盘。
    const budR = Math.pow(Math.random(), 1.65);
    const budTheta = Math.acos(2 * Math.random() - 1);
    const budX = Math.sin(budTheta) * Math.cos(angle) * budR * 0.24;
    const budY = Math.cos(budTheta) * budR * 0.43;
    const budZ = Math.sin(budTheta) * Math.sin(angle) * budR * 0.12;

    // 三层花瓣以不同瓣数、半径和高度交叠，形成视频中蓬松的伞形花冠。
    const layerRoll = Math.random();
    const layer = layerRoll < 0.48 ? 0 : layerRoll < 0.82 ? 1 : 2;
    const layerScale = layer === 0 ? 1 : layer === 1 ? 0.91 : 0.82;
    const petalCount = layer === 0 ? 7 : layer === 1 ? 6 : 5;
    const petalWave = 0.5 + 0.5 * Math.cos(angle * petalCount + layer * 0.86 + seed * 0.008);
    const scallopedEdge = 0.79 + 0.21 * Math.pow(petalWave, 1.28);
    const radial = Math.pow(Math.random(), 0.76);
    const petalR = radial * scallopedEdge * layerScale;
    const fold = Math.sin(angle * petalCount + layer * 0.86) * 0.028 * radial;
    const warpedAngle = angle + fold;

    // 少量游离粒子从花冠边沿自然垂落，避免盛放状态看起来像实心几何圆盘。
    const drift = Math.random() < 0.17 ? 0.07 + Math.random() * 0.17 : 0;
    const layerLift = layer === 0 ? 0.058 : layer === 1 ? 0.018 : -0.026;
    const dome = Math.sqrt(Math.max(0, 1 - radial * radial));
    const bloomX = Math.cos(warpedAngle) * petalR * 0.53
      + Math.cos(angle) * drift * 0.22;
    const bloomY = Math.sin(warpedAngle) * petalR * 0.42
      + radial * radial * 0.035 + layerLift + drift;
    const bloomZ = dome * 0.16 + (2 - layer) * 0.012 + depth * 0.018;

    out.push({
      seed, angle, depth, size: 0.55 + Math.random() * 1.35, phase: Math.random() * Math.PI * 2,
      budX, budY, budZ, bloomX, bloomY, bloomZ,
      x: 0, y: 0, vx: 0, vy: 0
    });
  }

  return out;
}

// 三档颜色各预渲染一张光点贴图，逐粒子只选贴图、不再逐帧拼颜色字符串，
// 也不再每粒画两遍（旧版是贴图 + 实心圆各一次）。
function makeSprite(stops: [number, string][]): HTMLCanvasElement {
  const sprite = document.createElement('canvas'); sprite.width = 64; sprite.height = 64;
  const c = sprite.getContext('2d')!;
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, color] of stops) g.addColorStop(at, color);
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return sprite;
}

function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: any[], vw: number, vh: number, w: number, h: number) {
  ctx.save(); ctx.lineWidth = 1.15; ctx.strokeStyle = 'rgba(255,255,255,.52)';
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  for (const [a, b] of HAND_CONNECTIONS) {
    const p = coverMap(landmarks[a].x, landmarks[a].y, vw, vh, w, h);
    const q = coverMap(landmarks[b].x, landmarks[b].y, vw, vh, w, h);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  }
  for (const lm of landmarks) {
    const p = coverMap(lm.x, lm.y, vw, vh, w, h);
    ctx.beginPath(); ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export default function ParticleFlower() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handsRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const startGuardRef = useRef(false);
  const cameraRafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const targetRef = useRef(0.18);
  const currentRef = useRef(0.18);
  const velocityRef = useRef(0);
  const fingerRawRef = useRef<{ x: number; y: number } | null>(null);
  const landmarksRef = useRef<any[] | null>(null);
  const hasHandRef = useRef(false);
  const experienceStartedRef = useRef(false);
  const pointerRef = useRef<Point | null>(null);
  const pointerDownRef = useRef(false);
  const modeRef = useRef<Mode>('demo');
  const videoSizeRef = useRef({ w: 0, h: 0 });
  const failStreakRef = useRef(0);
  const lastResultAtRef = useRef(0);
  const hudCacheRef = useRef({ pct: -1, state: '', en: '' });
  const hudNumRef = useRef<HTMLSpanElement>(null);
  const hudStateRef = useRef<HTMLDivElement>(null);
  const hudEnRef = useRef<HTMLDivElement>(null);
  const hudBarRef = useRef<HTMLSpanElement>(null);
  const [mode, setMode] = useState<Mode>('demo');
  const [cameraLive, setCameraLive] = useState(false);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
    cameraRafRef.current = 0;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (handsRef.current) {
      try { void handsRef.current.close(); } catch {}
      handsRef.current = null;
    }
    failStreakRef.current = 0;
    setCameraLive(false);
    hasHandRef.current = false;
    landmarksRef.current = null;
    fingerRawRef.current = null;
    videoSizeRef.current = { w: 0, h: 0 };
  }, []);

  const setExperienceMode = useCallback((next: Mode) => {
    experienceStartedRef.current = true;
    setExperienceStarted(true);
    modeRef.current = next; setMode(next);
    if (next === 'demo') stopCamera();
    targetRef.current = 0.18;
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (loading || startGuardRef.current) return;
    if (IS_WECHAT) {
      setError('微信里无法调用摄像头。请点右上角「···」，选「在浏览器打开」，再回来开启手势。');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持摄像头，或页面不是 HTTPS 安全连接。建议用 Chrome / Safari 打开本站再试。');
      return;
    }
    startGuardRef.current = true;
    setError(''); setLoading(true);
    try {
      const base = await loadHands();
      const HandsCtor = (window as any).Hands;
      if (!HandsCtor) throw new Error('手部模型未能初始化，请刷新页面重试。');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640, max: 960 }, height: { ideal: 480, max: 540 }, frameRate: { ideal: 30, max: 30 } }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('摄像头画面容器尚未准备好。');
      video.srcObject = stream;
      await video.play();
      const makeHands = (cdnBase: string) => {
        const h = new HandsCtor({ locateFile: (file: string) => cdnBase + '/' + file });
        h.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.62, minTrackingConfidence: 0.58 });
        h.onResults(handleResults);
        return h;
      };
      const handleResults = (results: any) => {
        lastResultAtRef.current = performance.now();
        failStreakRef.current = 0;
        const hand = results.multiHandLandmarks?.[0];
        if (!hand) {
          landmarksRef.current = null; fingerRawRef.current = null;
          targetRef.current = 0.18; hasHandRef.current = false; return;
        }
        landmarksRef.current = hand;
        // 开合度按「手指伸直度」算（GPT 版的算法）：每根手指 MCP→指尖的直线距离
        // 除以经 PIP 的折线长——弯曲时折线明显更长，这个比值与手大小、离镜头
        // 远近无关，握拳必然低、张掌必然高，不需要标定。再混一点指尖外张程度
        // 和大拇指张开度，避免手指并拢伸直时读数偏低。
        const wrist = hand[0];
        const fingerPairs = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];
        const scores = fingerPairs.map(([mcp, pip, tip]) => {
          const direct = Math.max(0.001, distance(hand[mcp], hand[tip]));
          const path = distance(hand[mcp], hand[pip]) + distance(hand[pip], hand[tip]);
          const straight = direct / Math.max(0.001, path);
          const radial = distance(wrist, hand[tip]) / Math.max(0.001, distance(wrist, hand[mcp]));
          return clamp((straight - 0.70) / 0.27, 0, 1) * 0.72 + clamp((radial - 1.0) / 0.72, 0, 1) * 0.28;
        });
        const thumb = clamp((distance(hand[4], hand[5]) / Math.max(0.001, distance(hand[2], hand[5]) * 0.9) - 0.25) / 0.8, 0, 1);
        const raw = clamp(scores.reduce((a, b) => a + b, 0) / scores.length * 0.88 + thumb * 0.12, 0, 1);
        targetRef.current = lerp(targetRef.current, raw, 0.24);
        fingerRawRef.current = { x: hand[8].x, y: hand[8].y };
        hasHandRef.current = true;
      };
      let hands = makeHands(base);
      handsRef.current = hands;
      lastResultAtRef.current = performance.now();
      // 首帧 send 只为预热模型；第一个源的模型文件坏掉时，换第二个源整套重建
      // 再试一次（GPT 版的容灾）；仍失败不致命，主循环有失败计数和看门狗兜底。
      const warmup = async (h: any) => {
        await Promise.race([
          h.send({ image: video }),
          new Promise((_, reject) => window.setTimeout(() => reject(new Error('warmup timeout')), 15000)),
        ]);
      };
      try {
        await warmup(hands);
      } catch {
        if (base === HANDS_SOURCES[0]) {
          try { await hands.close(); } catch {}
          hands = makeHands(HANDS_SOURCES[1]);
          handsRef.current = hands;
          lastResultAtRef.current = performance.now();
          try { await warmup(hands); } catch { /* 交给主循环兜底 */ }
        }
      }
      modeRef.current = 'gesture'; setMode('gesture');
      setCameraLive(true);
      experienceStartedRef.current = true;
      setExperienceStarted(true);
      setLoading(false);
      startGuardRef.current = false;
      let busy = false;
      let lastVideoTime = -1;
      let lastSendAt = 0;
      const process = async () => {
        const currentVideo = videoRef.current;
        if (!streamRef.current || !currentVideo || !handsRef.current) return;
        cameraRafRef.current = requestAnimationFrame(process);
        if (document.hidden) return;
        const now = performance.now();
        // 识别限到约 30 次/秒：再密对开合度没有帮助，只烧 CPU 和电。
        if (busy || now - lastSendAt < 33) return;
        if (currentVideo.readyState < 2 || currentVideo.currentTime === lastVideoTime) return;
        // 看门狗：摄像头开着却长时间没有任何识别回信，说明模型坏了，别装作在等手。
        if (now - lastResultAtRef.current > 6000) {
          setExperienceMode('demo');
          setError('摄像头已打开，但手部识别没有响应。可能是模型文件被网络拦截，换个网络后重试。');
          return;
        }
        lastVideoTime = currentVideo.currentTime;
        lastSendAt = now;
        busy = true;
        try {
          await handsRef.current.send({ image: currentVideo });
          if (currentVideo.videoWidth) videoSizeRef.current = { w: currentVideo.videoWidth, h: currentVideo.videoHeight };
        } catch {
          failStreakRef.current += 1;
          if (failStreakRef.current >= 6) {
            setExperienceMode('demo');
            setError('手部识别连续失败，已切回演示模式。检查网络后可重新开启手势。');
            return;
          }
        } finally { busy = false; }
      };
      cameraRafRef.current = requestAnimationFrame(process);
    } catch (e: any) {
      stopCamera();
      setError(e?.message || '摄像头启动失败。请检查浏览器权限。');
      setLoading(false);
      startGuardRef.current = false;
    }
  }, [loading, stopCamera, setExperienceMode]);

  // 页面切到后台时直接停掉摄像头轨道，比只在循环里跳过更省电（GPT 版的做法）。
  useEffect(() => {
    const sync = () => {
      const enabled = !document.hidden;
      streamRef.current?.getVideoTracks().forEach(track => { track.enabled = enabled; });
    };
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;
    let width = 0, height = 0, dpr = 1, lastTime = 0;
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    const lowEnd = cores <= 4 || memory <= 4;
    const count = mobile ? (lowEnd ? 1400 : 1900) : (lowEnd ? 2200 : 3000);
    particlesRef.current = makeParticles(count);
    const sprites = [
      makeSprite([[0, 'rgba(255,248,232,1)'], [0.25, 'rgba(255,240,214,.55)'], [1, 'rgba(255,240,214,0)']]),
      makeSprite([[0, 'rgba(255,228,240,1)'], [0.3, 'rgba(247,139,187,.5)'], [1, 'rgba(247,139,187,0)']]),
      makeSprite([[0, 'rgba(255,206,228,1)'], [0.3, 'rgba(231,84,154,.55)'], [1, 'rgba(231,84,154,0)']]),
    ];
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? (lowEnd ? 1 : 1.25) : 1.6);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const render = (time: number) => {
      rafRef.current = requestAnimationFrame(render);
      if (document.hidden) { lastTime = time; return; }
      const elapsed = lastTime ? (time - lastTime) / 1000 : 1 / 60;
      const dt = Math.min(0.05, Math.max(0.001, elapsed));
      lastTime = time;
      const spring = 18, damping = 8.5;
      const accel = (targetRef.current - currentRef.current) * spring - velocityRef.current * damping;
      velocityRef.current += accel * dt;
      currentRef.current = clamp(currentRef.current + velocityRef.current * dt, 0, 1);
      const opennessNow = currentRef.current;
      const now = time * 0.001;
      const cx = width * (!experienceStartedRef.current && !mobile ? 0.68 : 0.5), cy = height * 0.49;
      const scale = Math.min(width, height) * (mobile ? 0.79 : 0.83);
      const vs = videoSizeRef.current;
      const finger = modeRef.current === 'gesture' && fingerRawRef.current
        ? coverMap(fingerRawRef.current.x, fingerRawRef.current.y, vs.w, vs.h, width, height)
        : modeRef.current === 'demo' ? pointerRef.current : null;
      // 轻量残影衰减：保留上一帧的光迹，形成指尖牵引的流动感。
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,.17)'; ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      // 柔和的环境光晕。
      const halo = ctx.createRadialGradient(cx, cy, scale * 0.04, cx, cy, scale * 0.78);
      halo.addColorStop(0, 'rgba(226,105,161,' + (0.07 + opennessNow * 0.08) + ')');
      halo.addColorStop(1, 'rgba(120,50,105,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      const ps = particlesRef.current;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        const breath = 1 + Math.sin(now * 1.35 + p.phase) * 0.018;
        let nx = lerp(p.budX, p.bloomX, opennessNow) * scale * breath;
        let ny = lerp(p.budY, p.bloomY, opennessNow) * scale * breath;
        const nz = lerp(p.budZ, p.bloomZ, opennessNow) * scale;
        const wander = Math.sin(now * 0.7 + p.seed) * 1.8 + Math.cos(now * 0.43 + p.phase) * 1.2;
        nx += Math.cos(p.angle + now * 0.16) * wander;
        ny += Math.sin(p.angle + now * 0.16) * wander;
        // 食指指尖的局部牵引：随绽放程度增强，保留轻柔拖曳。
        if (finger && opennessNow > 0.25) {
          const dx = finger.x - (cx + nx), dy = finger.y - (cy + ny);
          const d2 = dx * dx + dy * dy, radius = scale * 0.31;
          if (d2 < radius * radius) {
            const pull = (1 - Math.sqrt(d2) / radius) * 0.16 * opennessNow;
            nx += dx * pull; ny += dy * pull;
          }
        }
        const x = cx + nx, y = cy + ny + nz * 0.2;
        p.x = x; p.y = y;
        const normalized = clamp(Math.hypot(nx, ny) / (scale * 0.48), 0, 1);
        const cream = 1 - normalized, pink = clamp(1 - Math.abs(normalized - 0.53) * 2.05, 0, 1);
        ctx.globalAlpha = 0.35 + cream * 0.42 + pink * 0.18;
        const size = p.size * (0.65 + opennessNow * 0.4) * 14;
        ctx.drawImage(normalized < 0.38 ? sprites[0] : normalized < 0.72 ? sprites[1] : sprites[2], x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (landmarksRef.current && modeRef.current === 'gesture') drawSkeleton(ctx, landmarksRef.current, vs.w, vs.h, width, height);
      // 食指尖端增加一圈柔和的玫瑰色光晕，让牵引点在暗背景中清晰可见。
      if (finger && modeRef.current === 'gesture') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const tipGlow = ctx.createRadialGradient(finger.x, finger.y, 0, finger.x, finger.y, 34);
        tipGlow.addColorStop(0, 'rgba(255,238,224,.92)');
        tipGlow.addColorStop(0.16, 'rgba(255,164,204,.48)');
        tipGlow.addColorStop(1, 'rgba(231,84,154,0)');
        ctx.fillStyle = tipGlow;
        ctx.beginPath();
        ctx.arc(finger.x, finger.y, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,247,235,.95)';
        ctx.beginPath();
        ctx.arc(finger.x, finger.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (modeRef.current === 'demo') {
        const p = pointerRef.current || { x: cx, y: cy };
        ctx.save(); ctx.strokeStyle = 'rgba(255,244,235,.75)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y); ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,244,235,.22)'; ctx.stroke(); ctx.restore();
      }
      // HUD 直接改 DOM：百分比跟弹簧同帧更新，不再每 250ms 触发整页 React 重渲染。
      const percent = Math.round(opennessNow * 100);
      const cache = hudCacheRef.current;
      if (percent !== cache.pct) {
        cache.pct = percent;
        if (hudNumRef.current) hudNumRef.current.textContent = String(percent);
        if (hudBarRef.current) hudBarRef.current.style.width = percent + '%';
      }
      const state = modeRef.current === 'demo' ? '演示模式' : !hasHandRef.current ? '等待手掌' : percent < 28 ? '花苞' : percent > 68 ? '绽放' : '舒展中';
      if (state !== cache.state) {
        cache.state = state;
        cache.en = modeRef.current === 'demo' ? 'DEMO EXPERIENCE' : !hasHandRef.current ? 'WAITING FOR HAND' : percent < 28 ? 'CLOSED · FIST' : percent > 68 ? 'BLOOM · OPEN' : 'OPENING · FLOW';
        if (hudStateRef.current) hudStateRef.current.textContent = state;
        if (hudEnRef.current) hudEnRef.current.textContent = cache.en;
      }
    };
    rafRef.current = requestAnimationFrame(render);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize', resize); };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'demo' || (e.target as HTMLElement).closest('button')) return;
    pointerDownRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointerRef.current = { x: e.clientX, y: e.clientY, z: 0 };
    targetRef.current = clamp(1 - (e.clientY / window.innerHeight), 0, 1);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current !== 'demo' || (e.target as HTMLElement).closest('button')) return;
    pointerRef.current = { x: e.clientX, y: e.clientY, z: 0 };
    if (pointerDownRef.current) targetRef.current = clamp(1 - (e.clientY / window.innerHeight), 0, 1);
  };
  const handlePointerUp = () => {
    if (modeRef.current !== 'demo') return;
    pointerDownRef.current = false;
    targetRef.current = 0.18;
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  return (
    <main className={'bloom-page ' + (experienceStarted ? 'is-active' : '')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      <video ref={videoRef} className={'bloom-camera' + (cameraLive ? ' is-live' : '')} playsInline muted />
      <canvas ref={canvasRef} className="bloom-canvas" aria-label="由粒子组成的互动花朵" />
      <div className="bloom-vignette" />
      <header className="bloom-header">
        <button className="bloom-brand" onClick={() => navigate('/explore')} aria-label="返回探索空间">
          <span className="bloom-brand-cn">指尖生花</span><span className="bloom-brand-en">BLOOM AT YOUR FINGERTIPS</span>
        </button>
        <div className={'bloom-pill' + (cameraLive ? ' live' : '')}><i />{cameraLive ? 'CAMERA LIVE' : 'STANDBY ｜ NO.01'}</div>
      </header>
      <section className="bloom-intro">
        <div className="bloom-kicker">AN INTERACTIVE LIGHT GARDEN</div>
        <h1>让花，在指尖醒来。</h1>
        <p>握拳，收拢成一颗花苞；张掌，让三千粒光一起舒展。</p>
        {!cameraLive && (
          <div className="bloom-actions">
            <button className="bloom-primary" onClick={startCamera} disabled={loading}>
              {loading ? '正在唤醒…' : '开启手势'}
            </button>
            <button className="bloom-secondary" onClick={() => setExperienceMode('demo')}>无摄像头体验</button>
          </div>
        )}
        <div className="bloom-privacy">画面仅在本地浏览器运算，不会上传</div>
        {error && <div className="bloom-error" role="alert">{error}</div>}
      </section>
      <div className="bloom-side-note">循光而行 · LET THE LIGHT BLOOM</div>
      <footer className="bloom-steps">
        <div><b>01</b><span>握拳·闭合</span></div><i />
        <div><b>02</b><span>张掌·绽放</span></div><i />
        <div><b>03</b><span>指尖·牵引</span></div>
      </footer>
      <aside className="bloom-hud">
        <div className="bloom-hud-label">GESTURE <span>/ 手势</span></div>
        <div className="bloom-hud-state" ref={hudStateRef}>等待手掌</div>
        <div className="bloom-hud-en" ref={hudEnRef}>WAITING FOR HAND</div>
        <div className="bloom-hud-number"><span ref={hudNumRef}>18</span><small>%</small></div>
        <div className="bloom-progress"><span ref={hudBarRef} style={{ width: '18%' }} /></div>
        <div className="bloom-hud-meta">LIGHT PARTICLES · 粒子花</div>
      </aside>
      <div className="bloom-mode-switch">
        <button className={mode === 'gesture' ? 'active' : ''} onClick={() => cameraLive ? setExperienceMode('gesture') : void startCamera()}>手势</button>
        <button className={mode === 'demo' ? 'active' : ''} onClick={() => setExperienceMode('demo')}>演示</button>
      </div>
      {loading && <div className="bloom-loading"><div className="bloom-loader-flower">✿</div><span>正在唤醒手部模型</span><small>INITIALIZING MEDIAPIPE HANDS</small></div>}
    </main>
  );
}
