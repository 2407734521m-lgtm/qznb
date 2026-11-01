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

const HAND_CONNECTIONS: number[][] = [
  [0,1],[1,2],[2,3],[3,4], [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12], [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]
];
// 新版 MediaPipe（Tasks Vision / HandLandmarker），版本写死避免 CDN 漂移。
// 旧版 @mediapipe/hands 必须靠 WebGL 送帧，部分浏览器建不出 WebGL 就直接崩；
// 新版支持 CPU 推理兜底，建不出 GPU 管线时自动降级，不再报错退回演示模式。
const VISION_VERSION = '0.10.14';
const VISION_CDNS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VISION_VERSION,
  'https://unpkg.com/@mediapipe/tasks-vision@' + VISION_VERSION,
];
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_TIMEOUT_MS = 20000;

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function distance(a: any, b: any) { return Math.hypot(a.x - b.x, a.y - b.y); }
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms))]);
}
async function loadVision(base: string) {
  const mod: any = await import(/* @vite-ignore */ base + '/vision_bundle.mjs');
  const fileset = await mod.FilesetResolver.forVisionTasks(base + '/wasm');
  return { HandLandmarker: mod.HandLandmarker, fileset };
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
    const layerScale = layer === 0 ? 1 : layer === 1 ? 0.93 : 0.85;
    const petalCount = layer === 0 ? 7 : layer === 1 ? 6 : 5;
    const petalWave = 0.5 + 0.5 * Math.cos(angle * petalCount + layer * 0.86 + seed * 0.008);
    const scallopedEdge = 0.79 + 0.21 * Math.pow(petalWave, 1.28);
    const radial = Math.pow(Math.random(), 0.70);
    const petalR = radial * scallopedEdge * layerScale;
    const fold = Math.sin(angle * petalCount + layer * 0.86) * 0.028 * radial;
    const warpedAngle = angle + fold;

    // 少量游离粒子从花冠边沿自然垂落，避免盛放状态看起来像实心几何圆盘。
    const drift = Math.random() < 0.17 ? 0.07 + Math.random() * 0.17 : 0;
    const layerLift = layer === 0 ? 0.058 : layer === 1 ? 0.018 : -0.026;
    const dome = Math.sqrt(Math.max(0, 1 - radial * radial));
    const bloomX = Math.cos(warpedAngle) * petalR * 0.55
      + Math.cos(angle) * drift * 0.26;
    const bloomY = Math.sin(warpedAngle) * petalR * 0.44
      + radial * radial * 0.042 + layerLift + drift * 1.08;
    const bloomZ = dome * 0.16 + (2 - layer) * 0.012 + depth * 0.018;

    out.push({
      seed, angle, depth, size: 0.55 + Math.random() * 1.35, phase: Math.random() * Math.PI * 2,
      budX, budY, budZ, bloomX, bloomY, bloomZ,
      x: 0, y: 0, vx: 0, vy: 0
    });
  }

  return out;
}
function mapCoverPoint(point: any, video: HTMLVideoElement, width: number, height: number) {
  const vw = video.videoWidth || width, vh = video.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const renderedWidth = vw * scale, renderedHeight = vh * scale;
  const offsetX = (width - renderedWidth) / 2, offsetY = (height - renderedHeight) / 2;
  return { x: (1 - point.x) * renderedWidth + offsetX, y: point.y * renderedHeight + offsetY };
}
// 骨骼直接叠在摄像头画面上：21 个关节点与视频共用同一套 cover 映射
// （mapCoverPoint，与指尖牵引同一个函数），骨骼点落在真手上、严丝合缝。
function drawSkeletonOverlay(ctx: CanvasRenderingContext2D, landmarks: any[] | null, video: HTMLVideoElement | null, w: number, h: number) {
  if (!landmarks || landmarks.length < 21 || !video) return;
  const pts = landmarks.map(p => mapCoverPoint(p, video, w, h));
  ctx.save();
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,239,246,.85)';
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[b].x, pts[b].y); ctx.stroke();
  }
  for (let i = 0; i < pts.length; i++) {
    ctx.beginPath();
    ctx.arc(pts[i].x, pts[i].y, i === 0 ? 3.4 : 2.6, 0, Math.PI * 2);
    ctx.fillStyle = [4, 8, 12, 16, 20].includes(i) ? 'rgba(255,190,215,.98)' : 'rgba(245,249,255,.94)';
    ctx.fill();
  }
  ctx.restore();
}

export default function ParticleFlower() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<any>(null);
  const delegateRef = useRef<'GPU' | 'CPU'>('GPU');
  const rafRef = useRef<number>(0);
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
  const [cameraLive, setCameraLive] = useState(false);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasHand, setHasHand] = useState(false);
  const [orientationMessage, setOrientationMessage] = useState('');
  const ownedFullscreenRef = useRef(false);
  const lastHudRef = useRef(0);
  const lastInferenceRef = useRef(0);
  const hudNumberRef = useRef<HTMLSpanElement>(null);
  const hudStateRef = useRef<HTMLDivElement>(null);
  const hudEnglishRef = useRef<HTMLDivElement>(null);
  const hudProgressRef = useRef<HTMLSpanElement>(null);
  const activeCdnRef = useRef(VISION_CDNS[0]);

  useEffect(() => {
    const syncCameraVisibility = () => {
      const enabled = !document.hidden;
      streamRef.current?.getVideoTracks().forEach(track => { track.enabled = enabled; });
    };
    document.addEventListener('visibilitychange', syncCameraVisibility);
    return () => document.removeEventListener('visibilitychange', syncCameraVisibility);
  }, []);

  useEffect(() => {
    const syncOrientation = () => {
      setLayoutOrientation(window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait');
    };
    const orientationApi = (window.screen as any).orientation;
    window.addEventListener('resize', syncOrientation);
    orientationApi?.addEventListener?.('change', syncOrientation);
    return () => {
      window.removeEventListener('resize', syncOrientation);
      orientationApi?.removeEventListener?.('change', syncOrientation);
      try { orientationApi?.unlock?.(); } catch {}
      if (ownedFullscreenRef.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
    cameraRafRef.current = 0;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (landmarkerRef.current) {
      try { landmarkerRef.current.close(); } catch {}
      landmarkerRef.current = null;
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
    } else {
      targetRef.current = 0.18;
    }
  }, [stopCamera]);

  const requestOrientation = async (next: LayoutOrientation) => {
    setOrientationMessage('');
    const isLandscape = window.matchMedia('(orientation: landscape)').matches;
    const alreadyCorrect = next === 'landscape' ? isLandscape : !isLandscape;
    if (alreadyCorrect) {
      setLayoutOrientation(next);
      return;
    }

    const orientationApi = (window.screen as any).orientation as
      | { lock?: (value: 'landscape' | 'portrait') => Promise<void>; unlock?: () => void }
      | undefined;
    try {
      if (!document.fullscreenElement) {
        const root = document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> };
        if (!root.requestFullscreen) throw new Error('fullscreen-unavailable');
        await root.requestFullscreen();
        ownedFullscreenRef.current = true;
      }
      if (!orientationApi?.lock) throw new Error('orientation-lock-unavailable');
      await orientationApi.lock(next);
      setLayoutOrientation(window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait');
    } catch {
      const actual = window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
      setLayoutOrientation(actual);
      if (ownedFullscreenRef.current && document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
        ownedFullscreenRef.current = false;
      }
      setOrientationMessage(next === 'landscape'
        ? '当前浏览器不支持网页自动横屏。请开启手机“自动旋转”，再将手机横过来。'
        : '当前浏览器不支持网页自动竖屏，请将手机转回竖向。');
    }
  };

  const startCamera = useCallback(async () => {
    if (loading || startGuardRef.current) return;
    startGuardRef.current = true;
    setError(''); setLoading(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头，或页面不是 HTTPS 安全连接。');
      // 先建识别器再开摄像头：两个资源源 × GPU/CPU 两种推理方式依次尝试，
      // GPU 建不出来（WebGL 不可用）时自动落到 CPU，不再直接失败。
      let landmarker: any = null;
      let lastError: any = null;
      for (const base of VISION_CDNS) {
        try {
          const vision = await withTimeout(loadVision(base), MODEL_TIMEOUT_MS, '识别库加载超时');
          for (const delegate of ['GPU', 'CPU'] as const) {
            try {
              landmarker = await withTimeout(vision.HandLandmarker.createFromOptions(vision.fileset, {
                baseOptions: { modelAssetPath: MODEL_URL, delegate },
                runningMode: 'VIDEO',
                numHands: 1,
                minHandDetectionConfidence: 0.6,
                minHandPresenceConfidence: 0.5,
                minTrackingConfidence: 0.55,
              }), MODEL_TIMEOUT_MS, '识别器初始化超时');
              delegateRef.current = delegate;
              break;
            } catch (e) { lastError = e; }
          }
          if (landmarker) { activeCdnRef.current = base; break; }
        } catch (e) { lastError = e; }
      }
      if (!landmarker) throw new Error('手部识别初始化失败' + (lastError?.message ? '：' + lastError.message : '') + '。请检查网络后重试。');
      landmarkerRef.current = landmarker;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640, max: 960 }, height: { ideal: 480, max: 540 }, frameRate: { ideal: 30, max: 30 } }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('摄像头画面容器尚未准备好。');
      video.srcObject = stream;
      await video.play();
      const handleLandmarks = (hand: any[] | null) => {
        if (!hand) {
          landmarksRef.current = null; fingerRef.current = null;
          targetRef.current = 0.18; hasHandRef.current = false; setHasHand(false); return;
        }
        landmarksRef.current = hand;
        const wrist = hand[0];
        const fingerPairs = [[5,6,8],[9,10,12],[13,14,16],[17,18,20]];
        const scores = fingerPairs.map(([mcp,pip,tip]) => {
          const direct = Math.max(0.001, distance(hand[mcp], hand[tip]));
          const path = distance(hand[mcp], hand[pip]) + distance(hand[pip], hand[tip]);
          const straight = direct / Math.max(0.001, path);
          const radial = distance(wrist, hand[tip]) / Math.max(0.001, distance(wrist, hand[mcp]));
          return clamp((straight - 0.70) / 0.27, 0, 1) * 0.72 + clamp((radial - 1.0) / 0.72, 0, 1) * 0.28;
        });
        const thumb = clamp((distance(hand[4],hand[5]) / Math.max(0.001,distance(hand[2],hand[5])*.9) - .25) / .8,0,1);
        const raw = clamp(scores.reduce((a,b)=>a+b,0)/scores.length*.88 + thumb*.12,0,1);
        targetRef.current = lerp(targetRef.current, raw, 0.24);
        const index = hand[8];
        const mapped = mapCoverPoint(index, video, window.innerWidth, window.innerHeight);
        fingerRef.current = { x: mapped.x, y: mapped.y, z: index.z || 0 };
        hasHandRef.current = true; setHasHand(true);
      };
      modeRef.current = 'gesture'; setMode('gesture');
      setCameraLive(true);
      experienceStartedRef.current = true;
      setExperienceStarted(true);
      setLoading(false);
      startGuardRef.current = false;
      let lastVideoTime = -1;
      let failures = 0;
      const process = () => {
        const currentVideo = videoRef.current;
        if (!streamRef.current || !currentVideo || !landmarkerRef.current) return;
        // CPU 推理更吃力，帧率放低一档；GPU 保持原节奏。
        const interval = delegateRef.current === 'CPU' ? 1000 / 20 : 1000 / 24;
        if (!document.hidden && currentVideo.readyState >= 2 && currentVideo.currentTime !== lastVideoTime && performance.now() - lastInferenceRef.current >= interval) {
          lastVideoTime = currentVideo.currentTime; lastInferenceRef.current = performance.now();
          try {
            const res = landmarkerRef.current.detectForVideo(currentVideo, performance.now());
            handleLandmarks(res?.landmarks?.[0] || null);
            failures = 0;
          } catch {
            failures++;
            if (failures >= 3) { setError('手部识别连续失败，请重新开启手势。'); stopCamera(); return; }
          }
        }
        if (streamRef.current) cameraRafRef.current = requestAnimationFrame(process);
      };
      cameraRafRef.current = requestAnimationFrame(process);
    } catch (e: any) {
      stopCamera();
      const inWeChat = /MicroMessenger/i.test(navigator.userAgent || '');
      setError(inWeChat ? '微信内置浏览器可能限制摄像头。请点右上角菜单，选择“在浏览器打开”，再允许摄像头权限。' : (e?.message || '摄像头启动失败。请检查浏览器权限。'));
      setLoading(false);
      startGuardRef.current = false;
    }
  }, [loading, stopCamera]);

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
    const palette = Array.from({length:64},(_,i)=>{
      const t=i/63;
      const r=Math.round(t<.5?lerp(255,247,t*2):lerp(247,231,(t-.5)*2));
      const g=Math.round(t<.5?lerp(243,168,t*2):lerp(168,84,(t-.5)*2));
      const b=Math.round(t<.5?lerp(214,196,t*2):lerp(196,154,(t-.5)*2));
      return 'rgb('+r+','+g+','+b+')';
    });
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? (lowEnd ? 1 : 1.25) : 1.6);
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    resize();
    const render = (time: number) => {
      rafRef.current = requestAnimationFrame(render);
      const elapsed = lastTime ? (time-lastTime)/1000 : 1/60;
      const dt = Math.min(0.05, Math.max(0.001, elapsed));
      lastTime = time;
      const spring = 18, damping = 8.5;
      const accel = (targetRef.current-currentRef.current)*spring - velocityRef.current*damping;
      velocityRef.current += accel*dt;
      currentRef.current = clamp(currentRef.current + velocityRef.current*dt, 0, 1);
      const opennessNow = currentRef.current;
      const now = time * 0.001;
      const cx = width * (!experienceStartedRef.current && !mobile ? 0.68 : 0.5), cy = height*0.49;
      const scale = Math.min(width,height) * (mobile ? 0.79 : 0.83);
      const finger = modeRef.current === 'gesture' ? fingerRef.current : pointerRef.current;
      // 轻量残影衰减：保留上一帧的光迹，形成指尖牵引的流动感。
      ctx.globalCompositeOperation='destination-out';
      ctx.fillStyle='rgba(0,0,0,.34)'; ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation='source-over';
      // 柔和的环境光晕。
      const halo = ctx.createRadialGradient(cx,cy,scale*0.04,cx,cy,scale*0.78);
      halo.addColorStop(0,'rgba(226,105,161,'+(0.025+opennessNow*0.035)+')');
      halo.addColorStop(1,'rgba(120,50,105,0)');
      ctx.fillStyle = halo; ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation = 'source-over';
      const ps = particlesRef.current;
      for (let i=0;i<ps.length;i++) {
        const p=ps[i];
        const breath = 1 + Math.sin(now*1.35+p.phase)*0.018;
        let nx = lerp(p.budX,p.bloomX,opennessNow)*scale*breath;
        let ny = lerp(p.budY,p.bloomY,opennessNow)*scale*breath;
        let nz = lerp(p.budZ,p.bloomZ,opennessNow)*scale;
        const wander = Math.sin(now*0.7+p.seed)*1.8 + Math.cos(now*0.43+p.phase)*1.2;
        nx += Math.cos(p.angle+now*0.16)*wander;
        ny += Math.sin(p.angle+now*0.16)*wander;
        // 食指指尖的局部牵引：随绽放程度增强，保留轻柔拖曳。
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
        const normalized=clamp(Math.hypot(nx,ny)/(scale*0.48),0,1);
        const cream=1-normalized, pink=clamp(1-Math.abs(normalized-0.53)*2.05,0,1);
        const alpha=0.42+cream*0.14+pink*0.08;
        const size=p.size*(0.62+opennessNow*0.34);
        ctx.globalAlpha=alpha;
        ctx.fillStyle=palette[Math.min(63,Math.round(normalized*63))];
        ctx.beginPath(); ctx.arc(x,y,Math.max(.45,size*.72),0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
      // 骨骼叠加层：直接画在主画布上，与真手对齐（见 drawSkeletonOverlay）。
      if (modeRef.current === 'gesture') {
        drawSkeletonOverlay(ctx, landmarksRef.current, videoRef.current, width, height);
      }
      // 食指尖端增加一圈柔和的玫瑰色光晕，让牵引点在暗背景中清晰可见。
      if (finger && modeRef.current === 'gesture') {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        const tipGlow = ctx.createRadialGradient(finger.x, finger.y, 0, finger.x, finger.y, 18);
        tipGlow.addColorStop(0, 'rgba(255,238,224,.52)');
        tipGlow.addColorStop(0.22, 'rgba(255,164,204,.18)');
        tipGlow.addColorStop(1, 'rgba(231,84,154,0)');
        ctx.fillStyle = tipGlow;
        ctx.beginPath();
        ctx.arc(finger.x, finger.y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,247,235,.95)';
        ctx.beginPath();
        ctx.arc(finger.x, finger.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (modeRef.current==='demo') {
        const p=pointerRef.current || {x:cx,y:cy};
        ctx.save(); ctx.strokeStyle='rgba(255,244,235,.75)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(p.x-8,p.y); ctx.lineTo(p.x+8,p.y); ctx.moveTo(p.x,p.y-8); ctx.lineTo(p.x,p.y+8); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x,p.y,13,0,Math.PI*2); ctx.strokeStyle='rgba(255,244,235,.22)'; ctx.stroke(); ctx.restore();
      }
      if (time-lastHudRef.current>50) {
        lastHudRef.current=time;
        const percent=opennessNow*100, rounded=Math.round(percent);
        const cn=modeRef.current==='demo' ? '演示模式' : !hasHandRef.current ? '等待手掌' : percent<28 ? '花苞' : percent>68 ? '绽放' : '舒展中';
        const en=modeRef.current==='demo' ? 'DEMO EXPERIENCE' : !hasHandRef.current ? 'WAITING FOR HAND' : percent<28 ? 'CLOSED · FIST' : percent>68 ? 'BLOOM · OPEN' : 'OPENING · FLOW';
        if (hudNumberRef.current) hudNumberRef.current.textContent=String(rounded);
        if (hudProgressRef.current) hudProgressRef.current.style.width=percent.toFixed(1)+'%';
        if (hudStateRef.current) hudStateRef.current.textContent=cn;
        if (hudEnglishRef.current) hudEnglishRef.current.textContent=en;
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
    }
  }, [mode]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current!=='demo' || (e.target as HTMLElement).closest('button')) return;
    pointerDownRef.current=true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointerRef.current={x:e.clientX,y:e.clientY,z:0};
    targetRef.current=clamp(1-(e.clientY/window.innerHeight),0,1);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (modeRef.current!=='demo' || (e.target as HTMLElement).closest('button')) return;
    pointerRef.current={x:e.clientX,y:e.clientY,z:0};
    if (pointerDownRef.current) targetRef.current=clamp(1-(e.clientY/window.innerHeight),0,1);
  };
  const handlePointerUp = () => {
    if (modeRef.current!=='demo') return;
    pointerDownRef.current=false;
    targetRef.current=0.18;
  };

  useEffect(() => () => stopCamera(), [stopCamera]);

  const statusEnglish = mode==='demo' ? 'DEMO EXPERIENCE' : !hasHand ? 'WAITING FOR HAND' : 'HAND TRACKING';
  const statusChinese = mode==='demo' ? '演示模式' : !hasHand ? '等待手掌' : '手势追踪';

  return (
    <main className={'bloom-page ' + (layoutOrientation === 'landscape' ? 'orientation-landscape ' : 'orientation-portrait ') + (experienceStarted ? 'is-active' : '')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
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
        <p>握拳，收拢成一颗花苞；张掌，让粒子花冠舒展。</p>
        {!cameraLive && (
          <div className="bloom-actions">
            <button className="bloom-primary" onClick={startCamera} disabled={loading}>
              {loading ? '正在唤醒…' : '开启手势'}
            </button>
            <button className="bloom-secondary" onClick={() => setExperienceMode('demo')}>无摄像头体验</button>
            <button className="bloom-secondary" onClick={() => navigate('/air-ink')}>独立空中书写</button>
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
        <div className="bloom-hud-state" ref={hudStateRef}>{statusChinese}</div>
        <div className="bloom-hud-en" ref={hudEnglishRef}>{statusEnglish}</div>
        <div className="bloom-hud-number"><span ref={hudNumberRef}>18</span><small>%</small></div>
        <div className="bloom-progress"><span ref={hudProgressRef} style={{width:'18%'}} /></div>
        <div className="bloom-hud-meta">PARTICLE FLOW · LIVE</div>
      </aside>
      <button className="bloom-landscape-toggle" onClick={() => void requestOrientation(layoutOrientation === 'landscape' ? 'portrait' : 'landscape')} aria-label="切换屏幕方向">{layoutOrientation === 'landscape' ? '退出横屏' : '横屏'}</button>
      {orientationMessage && <div className="bloom-orientation-note" role="status">{orientationMessage}</div>}
      <div className="bloom-mode-switch">
        <button className={mode==='gesture'?'active':''} onClick={() => cameraLive ? setExperienceMode('gesture') : void startCamera()}>手势</button>
        <button className={mode==='demo'?'active':''} onClick={() => setExperienceMode('demo')}>演示</button>
      </div>
      {loading && <div className="bloom-loading"><div className="bloom-loader-flower">✿</div><span>正在唤醒手部模型</span><small>INITIALIZING MEDIAPIPE HANDS</small></div>}
    </main>
  );
}
