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
type LayoutOrientation = 'portrait' | 'landscape';
type FpsLimit = 30 | 60 | 90 | 120 | 0;

const HAND_CONNECTIONS: number[][] = [
  [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
];
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands';

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function distance(a: any, b: any) { return Math.hypot(a.x - b.x, a.y - b.y); }
function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-bloom-src="' + src + '"]') as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).dataset.loaded === '1') resolve();
      else { existing.addEventListener('load', () => resolve(), { once: true }); existing.addEventListener('error', () => reject(new Error('模型脚本加载失败')), { once: true }); }
      return;
    }
    const script = document.createElement('script');
    script.src = src; script.async = true; script.crossOrigin = 'anonymous';
    script.dataset.bloomSrc = src;
    script.onload = () => { script.dataset.loaded = '1'; resolve(); };
    script.onerror = () => reject(new Error('无法加载 MediaPipe 手部模型，请检查网络后重试'));
    document.head.appendChild(script);
  });
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

    // 粒子花冠：每个点随机落在一片粒子花瓣的内部，瓣与瓣之间保留细缝。
    // 三层分别采用 7/6/5 瓣，错位叠放；所有花瓣均由独立粒子组成。
    const layerRoll = Math.random();
    const layer = layerRoll < 0.48 ? 0 : layerRoll < 0.82 ? 1 : 2;
    const layerScale = layer === 0 ? 1 : layer === 1 ? 0.91 : 0.82;
    const petalCount = layer === 0 ? 7 : layer === 1 ? 6 : 5;
    const petalPhase = layer * 0.86 + (layer === 1 ? Math.PI / 6 : layer === 2 ? Math.PI / 5 : 0);
    const wave = Math.cos(angle * petalCount + petalPhase);
    const petalRidge = Math.pow(Math.max(0, (wave + 1) * 0.5), 1.55);
    const scallopedEdge = 0.73 + 0.27 * petalRidge;
    const radial = Math.pow(Math.random(), 0.72);
    const petalR = radial * scallopedEdge * layerScale;
    const fold = Math.sin(angle * petalCount + petalPhase) * 0.035 * radial;
    const warpedAngle = angle + fold;

    // 伞形花冠由上层、主层、下垂外层构成，外围少量粒子向下飘散。
    const drift = Math.random() < 0.13 ? 0.06 + Math.random() * 0.18 : 0;
    const layerLift = layer === 0 ? 0.072 : layer === 1 ? 0.012 : -0.052;
    const dome = Math.sqrt(Math.max(0, 1 - radial * radial));
    const bloomX = Math.cos(warpedAngle) * petalR * 0.56
      + Math.cos(angle) * drift * 0.18;
    const bloomY = Math.sin(warpedAngle) * petalR * 0.39
      + radial * radial * 0.052 + layerLift + drift;
    const bloomZ = dome * 0.19 + (2 - layer) * 0.018 + depth * 0.014;

    out.push({
      seed, angle, depth, size: 0.34 + Math.random() * 0.72, phase: Math.random() * Math.PI * 2,
      budX, budY, budZ, bloomX, bloomY, bloomZ,
      x: 0, y: 0, vx: 0, vy: 0
    });
  }

  return out;
}
function drawGlowSprite(): HTMLCanvasElement {
  const sprite = document.createElement('canvas'); sprite.width = 64; sprite.height = 64;
  const c = sprite.getContext('2d')!;
  const g = c.createRadialGradient(32,32,1,32,32,32);
  g.addColorStop(0, 'rgba(255,226,226,.62)');
  g.addColorStop(0.18, 'rgba(255,190,207,.42)');
  g.addColorStop(0.48, 'rgba(239,122,171,.15)');
  g.addColorStop(1, 'rgba(231,84,154,0)');
  c.fillStyle = g; c.fillRect(0,0,64,64);
  return sprite;
}
function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: any[], w: number, h: number) {
  ctx.save(); ctx.lineWidth = 1.15; ctx.strokeStyle = 'rgba(255,255,255,.52)';
  ctx.fillStyle = 'rgba(255,255,255,.72)';
  for (const [a,b] of HAND_CONNECTIONS) {
    const p = landmarks[a], q = landmarks[b];
    ctx.beginPath(); ctx.moveTo((1-p.x)*w,p.y*h); ctx.lineTo((1-q.x)*w,q.y*h); ctx.stroke();
  }
  for (const p of landmarks) {
    ctx.beginPath(); ctx.arc((1-p.x)*w,p.y*h,2.1,0,Math.PI*2); ctx.fill();
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
  const fpsLimitRef = useRef<FpsLimit>(0);
  const startGuardRef = useRef(false);
  const cameraRafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const targetRef = useRef(0.18);
  const currentRef = useRef(0.18);
  const velocityRef = useRef(0);
  const fingerRef = useRef<Point | null>(null);
  const landmarksRef = useRef<any[] | null>(null);
  const hasHandRef = useRef(false);
  const experienceStartedRef = useRef(false);
  const pointerRef = useRef<Point | null>(null);
  const pointerDownRef = useRef(false);
  const modeRef = useRef<Mode>('demo');
  const [mode, setMode] = useState<Mode>('demo');
  const [layoutOrientation, setLayoutOrientation] = useState<LayoutOrientation>(() => window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait');
  const [fpsLimit, setFpsLimit] = useState<FpsLimit>(0);
  const [actualFps, setActualFps] = useState(0);
  const [openness, setOpenness] = useState(18);
  const [status, setStatus] = useState('等待手掌');
  const [cameraLive, setCameraLive] = useState(false);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('准备手势模型');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingElapsed, setLoadingElapsed] = useState(0);
  const loadingStartedAtRef = useRef(0);
  const [orientationFallback, setOrientationFallback] = useState(false);
  const layoutOrientationRef = useRef<LayoutOrientation>(layoutOrientation);
  const orientationFullscreenRef = useRef(false);
  const viewportRef = useRef({ width: window.innerWidth, height: window.innerHeight });
  const [error, setError] = useState('');
  const [particleCount, setParticleCount] = useState(3000);
  const [hasHand, setHasHand] = useState(false);
  const lastHudRef = useRef(0);

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
    setCameraLive(false);
    setHasHand(false); hasHandRef.current = false;
    landmarksRef.current = null;
    fingerRef.current = null;
  }, []);

  const setExperienceMode = useCallback((next: Mode) => {
    experienceStartedRef.current = true;
    setExperienceStarted(true);
    modeRef.current = next; setMode(next);
    if (next === 'demo') {
      stopCamera();
      targetRef.current = 0.18;
      setStatus('演示模式');
    } else {
      targetRef.current = 0.18;
      setStatus('等待手掌');
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    if (loading || startGuardRef.current) return;
    startGuardRef.current = true;
    loadingStartedAtRef.current = Date.now();
    setLoadingElapsed(0);
    setLoadingStage('准备手势识别');
    setLoadingProgress(8);
    setError(''); setLoading(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头，或页面不是 HTTPS 安全连接。');
      const w = window as any;
      if (!w.Hands) {
        setLoadingStage('正在下载手势识别脚本');
        setLoadingProgress(22);
        await loadScript(CDN + '/hands.js');
      }
      const HandsCtor = (window as any).Hands;
      if (!HandsCtor) throw new Error('手部模型未能初始化，请刷新页面重试。');
      setLoadingStage('等待摄像头授权');
      setLoadingProgress(42);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60, max: 60 } }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('摄像头画面容器尚未准备好。');
      setLoadingStage('正在启动摄像头');
      setLoadingProgress(62);
      video.srcObject = stream;
      await video.play();
      const hands = new HandsCtor({ locateFile: (file: string) => CDN + '/' + file });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.62, minTrackingConfidence: 0.58 });
      setLoadingStage('正在初始化手势模型');
      setLoadingProgress(82);
      hands.onResults((results: any) => {
        const hand = results.multiHandLandmarks?.[0];
        if (!hand) {
          landmarksRef.current = null; fingerRef.current = null;
          targetRef.current = 0.18; hasHandRef.current = false; setHasHand(false); return;
        }
        landmarksRef.current = hand;
        const wrist = hand[0], middleBase = hand[9];
        const tips = [4,8,12,16,20].map(i => hand[i]);
        const base = Math.max(0.001, distance(wrist, middleBase));
        const ratio = tips.reduce((sum, p) => sum + distance(wrist,p), 0) / tips.length / base;
        const raw = clamp((ratio - 1.02) / 1.12, 0, 1);
        targetRef.current = lerp(targetRef.current, raw, 0.2);
        const index = hand[8];
        fingerRef.current = { x: (1-index.x) * viewportRef.current.width, y: index.y * viewportRef.current.height, z: index.z || 0 };
        hasHandRef.current = true; setHasHand(true);
      });
      handsRef.current = hands;
      // 首帧 send 会触发 MediaPipe 的 WASM/模型初始化；完成后才撤下唤醒遮罩。
      await hands.send({ image: video });
      setLoadingStage('手势识别已就绪');
      setLoadingProgress(100);
      modeRef.current = 'gesture'; setMode('gesture');
      setCameraLive(true); setStatus('等待手掌');
      experienceStartedRef.current = true;
      setExperienceStarted(true);
      setLoading(false);
      startGuardRef.current = false;
      let busy = false;
      let lastVideoTime = -1;
      const process = async () => {
        const currentVideo = videoRef.current;
        if (!streamRef.current || !currentVideo || !handsRef.current) return;
        if (!busy && currentVideo.readyState >= 2 && currentVideo.currentTime !== lastVideoTime) {
          lastVideoTime = currentVideo.currentTime;
          busy = true;
          try { await handsRef.current.send({ image: currentVideo }); } catch {}
          finally { busy = false; }
        }
        if (streamRef.current) cameraRafRef.current = requestAnimationFrame(process);
      };
      cameraRafRef.current = requestAnimationFrame(process);
    } catch (e: any) {
      stopCamera();
      setError(e?.message || '摄像头启动失败。请检查浏览器权限。');
      setLoading(false);
      startGuardRef.current = false;
    }
  }, [loading, stopCamera]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => {
      setLoadingElapsed(Math.max(0, (Date.now() - loadingStartedAtRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => window.cancelAnimationFrame(frame);
  }, [layoutOrientation, orientationFallback]);

  const changeOrientation = useCallback(async (next: LayoutOrientation) => {
    layoutOrientationRef.current = next;
    setLayoutOrientation(next);
    if (next === 'portrait') {
      setOrientationFallback(false);
      try { (screen as any).orientation?.unlock?.(); } catch {}
      if (orientationFullscreenRef.current && document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch {}
      }
      orientationFullscreenRef.current = false;
      return;
    }

    let enteredFullscreen = !!document.fullscreenElement;
    if (!enteredFullscreen && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        enteredFullscreen = true;
        orientationFullscreenRef.current = true;
      } catch { /* 部分浏览器禁止网页请求全屏，继续尝试方向锁定并提供旋转布局回退。 */ }
    }
    let locked = false;
    try {
      const orientation = (screen as any).orientation;
      if (orientation?.lock) {
        await orientation.lock('landscape');
        locked = true;
      }
    } catch { /* 浏览器或系统可能不允许网页锁定方向。 */ }
    setOrientationFallback(!locked && !window.matchMedia('(orientation: landscape)').matches);
  }, []);

  const exitExperience = useCallback(async () => {
    stopCamera();
    try { (screen as any).orientation?.unlock?.(); } catch {}
    if (orientationFullscreenRef.current && document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch {}
    }
    orientationFullscreenRef.current = false;
    navigate('/explore');
  }, [navigate, stopCamera]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;
    let width = 0, height = 0, dpr = 1, lastTime = 0, lastRenderedTime = 0, fpsWindowStart = 0, fpsFrames = 0;
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    const lowEnd = cores <= 4 || memory <= 4;
    const count = mobile ? (lowEnd ? 1400 : 1900) : (lowEnd ? 2200 : 3000);
    particlesRef.current = makeParticles(count);
    setParticleCount(count);
    const sprite = drawGlowSprite();
    const resize = () => {
      const forcedLandscape = layoutOrientationRef.current === 'landscape' && window.innerWidth < window.innerHeight;
      width = forcedLandscape ? window.innerHeight : window.innerWidth;
      height = forcedLandscape ? window.innerWidth : window.innerHeight;
      viewportRef.current = { width, height };
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? (lowEnd ? 1 : 1.25) : 1.6);
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    resize();
    const render = (time: number) => {
      rafRef.current = requestAnimationFrame(render);
      const targetFps = fpsLimitRef.current;
      const frameInterval = targetFps > 0 ? 1000 / targetFps : 0;
      if (frameInterval && time - lastRenderedTime < frameInterval - 0.5) return;
      const elapsed = lastTime ? (time-lastTime)/1000 : 1/60;
      const dt = Math.min(0.05, Math.max(0.001, elapsed));
      lastRenderedTime = time;
      lastTime = time;
      const spring = 18, damping = 8.5;
      const accel = (targetRef.current-currentRef.current)*spring - velocityRef.current*damping;
      velocityRef.current += accel*dt;
      currentRef.current = clamp(currentRef.current + velocityRef.current*dt, 0, 1);
      const opennessNow = currentRef.current;
      const now = time * 0.001;
      const cx = width * 0.5;
      const cy = height * (!experienceStartedRef.current && mobile ? 0.53 : 0.5);
      const scale = Math.min(width * 0.88, height * 1.05);

      const finger = modeRef.current === 'gesture' ? fingerRef.current : pointerRef.current;
      // 每帧清理画布，避免半透明花瓣在 60/120Hz 下反复叠加而再次过曝。
      // 光尘本身持续移动，不依赖残影也能保持流动感。
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation='source-over';
      // 柔和的环境光晕。
      const halo = ctx.createRadialGradient(cx,cy,scale*0.04,cx,cy,scale*0.78);
      halo.addColorStop(0,'rgba(226,105,161,'+(0.07+opennessNow*0.08)+')');
      halo.addColorStop(1,'rgba(120,50,105,0)');
      ctx.fillStyle = halo; ctx.fillRect(0,0,width,height);
      // 花朵完全由粒子构成：不绘制任何实体花瓣或实心花冠。
      // 三层粒子通过不同的花瓣瓣数、半径和高度形成层叠伞形轮廓。
      ctx.globalCompositeOperation = 'source-over';
      const ps = particlesRef.current;
      for (let i=0;i<ps.length;i++) {
        const p=ps[i];
        const breath = 1 + Math.sin(now*1.35+p.phase)*0.014;
        let nx = lerp(p.budX,p.bloomX,opennessNow)*scale*breath;
        let ny = lerp(p.budY,p.bloomY,opennessNow)*scale*breath;
        let nz = lerp(p.budZ,p.bloomZ,opennessNow)*scale;
        const wander = Math.sin(now*0.7+p.seed)*1.8 + Math.cos(now*0.43+p.phase)*1.2;
        nx += Math.cos(p.angle+now*0.16)*wander;
        ny += Math.sin(p.angle+now*0.16)*wander;
        if (finger && opennessNow > 0.25) {
          const dx=finger.x-(cx+nx), dy=finger.y-(cy+ny);
          const d2=dx*dx+dy*dy, radius=scale*0.31;
          if (d2<radius*radius) {
            const pull=(1-Math.sqrt(d2)/radius)*0.16*opennessNow;
            nx += dx*pull; ny += dy*pull;
          }
        }
        const x=cx+nx, y=cy+ny+nz*0.2;
        p.x=x; p.y=y;
        const normalized=clamp(Math.hypot(nx,ny)/(scale*0.58),0,1);
        // 中心香槟金 -> 花瓣粉 -> 外缘玫瑰粉，避免白色高亮芯。
        const r=Math.round(246-normalized*18);
        const g=Math.round(205-normalized*91);
        const b=Math.round(177+normalized*31);
        const centerWarmth=1-normalized;
        const alpha=(0.24+normalized*0.18)*(0.82+Math.sin(p.phase+now*1.1)*0.12);
        const size=p.size*(0.82+opennessNow*0.32);
        ctx.globalAlpha=alpha;
        ctx.drawImage(sprite,x-size*1.75,y-size*1.75,size*3.5,size*3.5);
        ctx.globalAlpha=alpha*0.82;
        ctx.fillStyle='rgba('+r+','+g+','+b+',.78)';
        ctx.beginPath(); ctx.arc(x,y,Math.max(.42,size*(0.52+centerWarmth*.12)),0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
      if (landmarksRef.current && modeRef.current==='gesture') drawSkeleton(ctx,landmarksRef.current,width,height);
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
      if (modeRef.current==='demo') {
        const p=pointerRef.current || {x:cx,y:cy};
        ctx.save(); ctx.strokeStyle='rgba(255,244,235,.75)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(p.x-8,p.y); ctx.lineTo(p.x+8,p.y); ctx.moveTo(p.x,p.y-8); ctx.lineTo(p.x,p.y+8); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x,p.y,13,0,Math.PI*2); ctx.strokeStyle='rgba(255,244,235,.22)'; ctx.stroke(); ctx.restore();
      }
      fpsFrames++;
      if (!fpsWindowStart) fpsWindowStart = time;
      if (time - fpsWindowStart >= 500) {
        setActualFps(Math.round(fpsFrames * 1000 / (time - fpsWindowStart)));
        fpsFrames = 0; fpsWindowStart = time;
      }
      if (time-lastHudRef.current>250) {
        lastHudRef.current=time;
        const percent=Math.round(opennessNow*100);
        setOpenness(percent);
        if (modeRef.current==='gesture') setStatus(!hasHandRef.current ? '等待手掌' : percent<28 ? '花苞' : percent>68 ? '绽放' : '舒展中');
        else setStatus('演示模式');
      }
    };
    rafRef.current=requestAnimationFrame(render);
    window.addEventListener('resize',resize);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener('resize',resize); };
  }, []);

  useEffect(() => {
    modeRef.current=mode;
    if (mode==='demo') {
      targetRef.current=0.18;
      setStatus('演示模式');
    }
  }, [mode]);

  const getLocalPointer = (clientX: number, clientY: number): Point => {
    const forcedLandscape = layoutOrientationRef.current === 'landscape' && window.innerWidth < window.innerHeight;
    return forcedLandscape
      ? { x: clientY, y: window.innerWidth - clientX, z: 0 }
      : { x: clientX, y: clientY, z: 0 };
  };
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current!=='demo' || (e.target as HTMLElement).closest('button')) return;
    pointerDownRef.current=true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const point = getLocalPointer(e.clientX, e.clientY);
    pointerRef.current=point;
    targetRef.current=clamp(1-(point.y/viewportRef.current.height),0,1);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current!=='demo' || (e.target as HTMLElement).closest('button')) return;
    const point = getLocalPointer(e.clientX, e.clientY);
    pointerRef.current=point;
    if (pointerDownRef.current) targetRef.current=clamp(1-(point.y/viewportRef.current.height),0,1);
  };
  const handlePointerUp = () => {
    if (modeRef.current!=='demo') return;
    pointerDownRef.current=false;
    targetRef.current=0.18;
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  const statusEnglish = mode==='demo' ? 'DEMO EXPERIENCE' : !hasHand ? 'WAITING FOR HAND' : openness<28 ? 'CLOSED · FIST' : openness>68 ? 'BLOOM · OPEN' : 'OPENING · FLOW';
  const statusChinese = mode==='demo' ? '演示模式' : !hasHand ? '等待手掌' : openness<28 ? '花苞' : openness>68 ? '绽放' : '舒展中';

  return (
    <main className={'bloom-page ' + (layoutOrientation === 'landscape' ? 'orientation-landscape ' : 'orientation-portrait ') + (orientationFallback ? 'orientation-fallback ' : '') + (experienceStarted ? 'is-active' : '')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      <video ref={videoRef} className={'bloom-camera' + (cameraLive ? ' is-live' : '')} playsInline muted />
      <button type="button" className="bloom-exit" onClick={() => void exitExperience()} aria-label="退出指尖生花体验">× <span>退出</span></button>
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
        <div className="bloom-hud-state">{statusChinese}</div>
        <div className="bloom-hud-en">{statusEnglish}</div>
        <div className="bloom-hud-number">{openness}<small>%</small></div>
        <div className="bloom-progress"><span style={{width:openness+'%'}} /></div>
        <div className="bloom-hud-meta">{particleCount.toLocaleString()} LIGHT PARTICLES</div>
      </aside>
      <div className="bloom-fps-switch" role="group" aria-label="动画帧率上限">
        <span>FPS</span>
        {([30, 60, 90, 120, 0] as FpsLimit[]).map(value => <button key={value} className={fpsLimit === value ? 'active' : ''} onClick={() => { fpsLimitRef.current = value; setFpsLimit(value); }} aria-pressed={fpsLimit === value}>{value === 0 ? '自动' : value}</button>)}
        <small>{actualFps}</small>
      </div>
      <div className="bloom-orientation-switch" role="group" aria-label="画面布局方向">
        <span>布局</span>
        <button className={layoutOrientation === 'portrait' ? 'active' : ''} onClick={() => void changeOrientation('portrait')} aria-pressed={layoutOrientation === 'portrait'}>竖屏</button>
        <button className={layoutOrientation === 'landscape' ? 'active' : ''} onClick={() => void changeOrientation('landscape')} aria-pressed={layoutOrientation === 'landscape'}>横屏</button>
      </div>
      <div className="bloom-mode-switch">
        <button className={mode==='gesture'?'active':''} onClick={() => cameraLive ? setExperienceMode('gesture') : void startCamera()}>手势</button>
        <button className={mode==='demo'?'active':''} onClick={() => setExperienceMode('demo')}>演示</button>
      </div>
      {loading && (
        <div className="bloom-loading" role="status" aria-live="polite">
          <div className="bloom-loader-flower">✿</div>
          <span>{loadingStage}</span>
          <div className="bloom-load-track" role="progressbar" aria-label="手势模型加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loadingProgress}>
            <span style={{ width: loadingProgress + '%' }} />
          </div>
          <small>
            {loadingStage === '等待摄像头授权'
              ? '请在浏览器弹窗中选择允许'
              : loadingStage === '正在初始化手势模型'
                ? '预计剩余约 2–6 秒 · 设备不同会有差异'
                : loadingStage === '正在下载手势识别脚本'
                  ? '预计剩余约 1–3 秒'
                  : '已用时 ' + loadingElapsed.toFixed(1) + ' 秒'}
          </small>
          <em>首次加载需要准备识别模型，请保持页面打开</em>
        </div>
      )}
    </main>
  );
}
