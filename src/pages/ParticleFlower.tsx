import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles-particle-flower.css';

type Point = { x: number; y: number; z: number };
type Particle = {
  seed: number; angle: number; depth: number; size: number; phase: number;
  budX: number; budY: number; budZ: number; bloomX: number; bloomY: number; bloomZ: number;
  x: number; y: number; vx: number; vy: number;
  cameraDepth: number; projectionScale: number; radial: number;
};
type Mode = 'gesture' | 'demo';
type ExperienceTool = 'flower' | 'write';
type InkPoint = { x: number; y: number };
type InkStroke = { points: InkPoint[]; liftedAt?: number };
type HanziCandidate = { hanzi: string; score: number };
type InkGlyph = { character: string; strokes: InkStroke[] };
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

    // 花苞是有纵深的紧凑椭球，张掌后每颗粒子沿自己的空间轨迹展开。
    const budR = Math.pow(Math.random(), 1.55);
    const budTheta = Math.acos(2 * Math.random() - 1);
    const budX = Math.sin(budTheta) * Math.cos(angle) * budR * 0.22;
    const budY = Math.cos(budTheta) * budR * 0.34;
    const budZ = Math.sin(budTheta) * Math.sin(angle) * budR * 0.18;

    // 粒子花冠不是平面圆盘：7/6/5 瓣三层在 X-Z 平面错位铺开，
    // Y 轴形成穹顶与下垂外沿，Z 轴保留前后层次。
    const layerRoll = Math.random();
    const layer = layerRoll < 0.46 ? 0 : layerRoll < 0.82 ? 1 : 2;
    const layerScale = layer === 0 ? 1 : layer === 1 ? 0.88 : 0.76;
    const petalCount = layer === 0 ? 7 : layer === 1 ? 6 : 5;
    const petalPhase = layer === 0 ? 0 : layer === 1 ? Math.PI / 6 : Math.PI / 5;
    const wave = Math.cos(angle * petalCount + petalPhase + layer * 0.31);
    const petalRidge = Math.pow(Math.max(0, (wave + 1) * 0.5), 1.45);
    const scallopedEdge = 0.76 + 0.24 * petalRidge;
    const radial = Math.pow(Math.random(), 0.72);
    const petalR = radial * scallopedEdge * layerScale;
    const fold = Math.sin(angle * petalCount + petalPhase) * 0.032 * radial;
    const warpedAngle = angle + fold;

    // 外沿粒子形成自然下垂的粒子帘，不绘制实体花瓣。
    const isHanging = radial > 0.68 && Math.random() < 0.22;
    const hanging = isHanging ? 0.05 + Math.random() * 0.2 : 0;
    const layerLift = layer === 0 ? -0.035 : layer === 1 ? 0.008 : 0.052;
    const dome = Math.sqrt(Math.max(0, 1 - radial * radial));
    const bloomX = Math.cos(warpedAngle) * petalR * 0.62
      + Math.cos(angle) * hanging * 0.08;
    const bloomY = -dome * 0.145 + radial * radial * 0.145 + layerLift + hanging;
    const bloomZ = Math.sin(warpedAngle) * petalR * 0.43
      + depth * 0.026 + (layer - 1) * 0.018;

    out.push({
      seed, angle, depth, size: 0.38 + Math.random() * 0.64, phase: Math.random() * TAU,
      budX, budY, budZ, bloomX, bloomY, bloomZ,
      x: 0, y: 0, vx: 0, vy: 0,
      cameraDepth: 0, projectionScale: 1, radial: 0
    });
  }

  return out;
}
function drawGlowSprite(): HTMLCanvasElement {
  const sprite = document.createElement('canvas'); sprite.width = 64; sprite.height = 64;
  const c = sprite.getContext('2d')!;
  const g = c.createRadialGradient(32,32,1,32,32,32);
  g.addColorStop(0, 'rgba(255,228,190,.42)');
  g.addColorStop(0.18, 'rgba(255,187,205,.28)');
  g.addColorStop(0.48, 'rgba(239,122,171,.10)');
  g.addColorStop(1, 'rgba(231,84,154,0)');
  c.fillStyle = g; c.fillRect(0,0,64,64);
  return sprite;
}
function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: any[], w: number, h: number) {
  ctx.save(); ctx.lineWidth = 1.15; ctx.strokeStyle = 'rgba(255,255,255,.64)';
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  for (const [a,b] of HAND_CONNECTIONS) {
    const p = landmarks[a], q = landmarks[b];
    ctx.beginPath(); ctx.moveTo((1-p.x)*w,p.y*h); ctx.lineTo((1-q.x)*w,q.y*h); ctx.stroke();
  }
  for (const p of landmarks) {
    ctx.beginPath(); ctx.arc((1-p.x)*w,p.y*h,2.1,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}
function drawSkeletonPreview(canvas: HTMLCanvasElement | null, landmarks: any[] | null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const width = canvas.width, height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  if (!landmarks || landmarks.length < 21) return;

  // Fit the visible hand bounds into the small preview instead of showing a tiny full-camera coordinate map.
  const points = landmarks.map(point => ({ x: 1 - point.x, y: point.y }));
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const rangeX = Math.max(0.08, maxX - minX);
  const rangeY = Math.max(0.08, maxY - minY);
  const scale = Math.min((width - 44) / rangeX, (height - 34) / rangeY);
  const offsetX = (width - rangeX * scale) / 2 - minX * scale;
  const offsetY = (height - rangeY * scale) / 2 - minY * scale;
  const project = (point: { x: number; y: number }) => ({ x: offsetX + point.x * scale, y: offsetY + point.y * scale });

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,220,236,.66)';
  ctx.lineWidth = Math.max(2.2, width * 0.009);
  ctx.shadowColor = 'rgba(240,151,194,.45)';
  ctx.shadowBlur = 7;
  for (const [a, b] of HAND_CONNECTIONS) {
    const start = project(points[a]), end = project(points[b]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (let i = 0; i < points.length; i++) {
    const point = project(points[i]);
    const isIndexTip = i === 8;
    ctx.beginPath();
    ctx.arc(point.x, point.y, isIndexTip ? Math.max(4.2, width * 0.016) : Math.max(2.4, width * 0.009), 0, Math.PI * 2);
    ctx.fillStyle = isIndexTip ? '#f5b3d0' : 'rgba(255,245,249,.92)';
    ctx.shadowColor = isIndexTip ? 'rgba(245,157,197,.9)' : 'rgba(255,255,255,.25)';
    ctx.shadowBlur = isIndexTip ? 12 : 4;
    ctx.fill();
  }
  ctx.restore();
}


const HANZI_LOOKUP_BASE = 'https://cdn.jsdelivr.net/gh/gugray/hanzi_lookup@01f90c3ab99a8fadf0696c28e5eb097223c500db/web_demo';

function makeHanziLookupWorker(): Worker {
  const source = `
    const base = '${HANZI_LOOKUP_BASE}';
    self.onmessage = async (event) => {
      const data = event.data || {};
      try {
        if (data.type === 'init') {
          importScripts(base + '/hanzi_lookup.js');
          await self.wasm_bindgen(base + '/hanzi_lookup_bg.wasm');
          self.postMessage({ type: 'ready' });
        } else if (data.type === 'lookup') {
          const raw = self.wasm_bindgen.lookup(data.strokes, 8);
          self.postMessage({ type: 'matches', requestId: data.requestId, candidates: JSON.parse(raw) });
        }
      } catch (error) {
        self.postMessage({ type: 'error', message: String(error && error.message || error) });
      }
    };
  `;
  const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
  const worker = new Worker(url);
  worker.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
  return worker;
}

function normalizeInkForRecognition(strokes: InkStroke[]) {
  const points = strokes.flatMap(stroke => stroke.points);
  if (points.length < 3) return [];
  const minX = Math.min(...points.map(point => point.x));
  const maxX = Math.max(...points.map(point => point.x));
  const minY = Math.min(...points.map(point => point.y));
  const maxY = Math.max(...points.map(point => point.y));
  const span = Math.max(1, maxX - minX, maxY - minY);
  const scale = 220 / span;
  const offsetX = (256 - (maxX - minX) * scale) * 0.5;
  const offsetY = (256 - (maxY - minY) * scale) * 0.5;
  return strokes
    .filter(stroke => stroke.points.length > 1)
    .map(stroke => stroke.points.map(point => [
      Math.round(offsetX + (point.x - minX) * scale),
      Math.round(offsetY + (point.y - minY) * scale)
    ]));
}

function drawAirInkScene(ctx: CanvasRenderingContext2D, strokes: InkStroke[], committed: InkGlyph[], width: number, height: number, time: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  // Draw original handwritten strokes only; never replace them with a typeset glyph.
  const drawStrokeCollection = (items: InkStroke[], groupOffset: number) => {
    for (let strokeIndex = 0; strokeIndex < items.length; strokeIndex++) {
      const stroke = items[strokeIndex];
      const points = stroke.points;
      if (!points.length) continue;
      const rawProgress = stroke.liftedAt === undefined ? 0 : clamp((time - stroke.liftedAt) / 1.35, 0, 1);
      const liftProgress = rawProgress * rawProgress * (3 - 2 * rawProgress);
      let dotIndex = 0;
      const drawDot = (x: number, y: number) => {
        const phase = time * 1.15 + dotIndex++ * 0.19 + (strokeIndex + groupOffset) * 2.1;
        const depthWave = 0.5 + 0.5 * Math.sin(phase);
        const elevation = liftProgress * (4.5 + depthWave * 2.2);
        const drift = Math.sin(phase * 0.47) * liftProgress * 0.45;
        const tone = (dotIndex % 7) / 6;
        const r = Math.round(250 - tone * 18), g = Math.round(220 - tone * 70), b = Math.round(190 + tone * 18);
        ctx.globalAlpha = 0.12 + liftProgress * 0.12;
        ctx.fillStyle = 'rgba(20,10,24,.72)';
        ctx.beginPath(); ctx.arc(x + 0.4, y + elevation + 2.0, 1.25, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.72 + liftProgress * 0.12;
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',.94)';
        ctx.beginPath(); ctx.arc(x + drift, y - elevation * 0.58, 1.05 + liftProgress * 0.34, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.38 + liftProgress * 0.22;
        ctx.fillStyle = 'rgba(255,247,233,.96)';
        ctx.beginPath(); ctx.arc(x - 0.28, y - elevation - 0.65, 0.38 + liftProgress * 0.12, 0, Math.PI * 2); ctx.fill();
        if (liftProgress > 0.72 && dotIndex % 11 === 0) {
          ctx.globalAlpha = (liftProgress - 0.72) * 0.8;
          ctx.fillStyle = 'rgba(255,224,239,.9)';
          ctx.beginPath(); ctx.arc(x + Math.sin(phase) * 2.2, y - elevation - 3.2, 0.55, 0, Math.PI * 2); ctx.fill();
        }
      };
      if (points.length === 1) drawDot(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.ceil(length / 5.5));
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          drawDot(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        }
      }
    }
  };
  committed.forEach((glyph, index) => drawStrokeCollection(glyph.strokes, index * 17 + 11));
  drawStrokeCollection(strokes, committed.length * 17);
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = 'rgba(246,190,214,.28)';
  ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(width * 0.18, height * 0.84); ctx.lineTo(width * 0.82, height * 0.84); ctx.stroke();
  ctx.restore();
}
function renderInkLayer(canvas: HTMLCanvasElement | null, width: number, height: number, strokes: InkStroke[]) {
  if (!canvas || width <= 0 || height <= 0) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sx = canvas.width / width, sy = canvas.height / height;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    const points = stroke.points;
    if (!points.length) continue;
    const first = points[0], last = points[points.length - 1];
    const gradient = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    gradient.addColorStop(0, '#ffe4bd');
    gradient.addColorStop(0.46, '#f6b5d0');
    gradient.addColorStop(1, '#e879ad');
    ctx.save();
    ctx.strokeStyle = gradient;
    ctx.fillStyle = '#ffe8cf';
    ctx.lineWidth = 5.2;
    ctx.shadowColor = 'rgba(244,145,190,.68)';
    ctx.shadowBlur = 13;
    if (points.length === 1) {
      ctx.beginPath(); ctx.arc(first.x, first.y, 2.6, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length - 1; i++) {
        const current = points[i], next = points[i + 1];
        ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) * 0.5, (current.y + next.y) * 0.5);
      }
      ctx.lineTo(last.x, last.y); ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,247,237,.78)';
    ctx.lineWidth = 1.15;
    if (points.length > 1) {
      ctx.beginPath(); ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length - 1; i++) {
        const current = points[i], next = points[i + 1];
        ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) * 0.5, (current.y + next.y) * 0.5);
      }
      ctx.lineTo(last.x, last.y); ctx.stroke();
    }
    ctx.restore();
  }
}



export default function ParticleFlower() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const handPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkStrokesRef = useRef<InkStroke[]>([]);
  const currentInkStrokeRef = useRef<InkStroke | null>(null);
  const pinchingRef = useRef(false);
  const smoothedInkPointRef = useRef<InkPoint | null>(null);
  const experienceToolRef = useRef<ExperienceTool>('flower');
  const [experienceTool, setExperienceTool] = useState<ExperienceTool>('flower');
  const [isWriting, setIsWriting] = useState(false);
  const recognitionWorkerRef = useRef<Worker | null>(null);
  const recognitionTimerRef = useRef<number>(0);
  const recognitionReadyRef = useRef(false);
  const recognitionBusyRef = useRef(false);
  const recognitionRequestIdRef = useRef(0);
  const recognizedCandidateRef = useRef('');
  const committedGlyphsRef = useRef<InkGlyph[]>([]);
  const [recognitionStatus, setRecognitionStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [recognitionCandidates, setRecognitionCandidates] = useState<HanziCandidate[]>([]);
  const [recognizedCandidate, setRecognizedCandidate] = useState('');
  const [recognizedText, setRecognizedText] = useState('');
  const [inkPhase, setInkPhase] = useState<'idle' | 'drawing' | 'lifting' | 'recognizing' | 'candidate' | 'unmatched'>('idle');
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

  const scheduleInkRecognition = useCallback(() => {
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    setInkPhase('lifting');
    recognitionTimerRef.current = window.setTimeout(() => {
      if (!recognitionReadyRef.current || recognitionBusyRef.current) {
        if (!recognitionReadyRef.current) setInkPhase('unmatched');
        return;
      }
      const normalizedStrokes = normalizeInkForRecognition(inkStrokesRef.current);
      if (!normalizedStrokes.length) {
        setInkPhase('idle');
        return;
      }
      recognitionBusyRef.current = true;
      setInkPhase('recognizing');
      const requestId = ++recognitionRequestIdRef.current;
      recognitionWorkerRef.current?.postMessage({ type: 'lookup', requestId, strokes: normalizedStrokes, limit: 8 });
    }, 1550);
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraRafRef.current) cancelAnimationFrame(cameraRafRef.current);
    cameraRafRef.current = 0;
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (handsRef.current) {
      try { void handsRef.current.close(); } catch {}
      handsRef.current = null;
    }
    recognitionWorkerRef.current?.terminate();
    recognitionWorkerRef.current = null;
    recognitionReadyRef.current = false;
    recognitionBusyRef.current = false;
    setRecognitionStatus('idle');
    setInkPhase('idle');
    setCameraLive(false);
    setHasHand(false); hasHandRef.current = false;
    landmarksRef.current = null;
    fingerRef.current = null;
    pinchingRef.current = false;
    currentInkStrokeRef.current = null;
    smoothedInkPointRef.current = null;
    setIsWriting(false);
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

  const startCamera = useCallback(async (tool: ExperienceTool = 'flower') => {
    if (loading || startGuardRef.current) return;
    experienceToolRef.current = tool;
    setExperienceTool(tool);
    pinchingRef.current = false;
    currentInkStrokeRef.current = null;
    smoothedInkPointRef.current = null;
    setIsWriting(false);
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    recognitionWorkerRef.current?.terminate();
    recognitionWorkerRef.current = null;
    recognitionReadyRef.current = false;
    recognitionBusyRef.current = false;
    recognitionRequestIdRef.current += 1;
    recognizedCandidateRef.current = '';
    committedGlyphsRef.current = [];
    setRecognitionCandidates([]);
    setRecognizedCandidate('');
    setRecognizedText('');
    setInkPhase('idle');
    setRecognitionStatus(tool === 'write' ? 'loading' : 'idle');
    if (tool === 'write') {
      inkStrokesRef.current = [];
      try {
        const worker = makeHanziLookupWorker();
        recognitionWorkerRef.current = worker;
        worker.onmessage = (event: MessageEvent) => {
          const message = event.data || {};
          if (message.type === 'ready') {
            recognitionReadyRef.current = true;
            setRecognitionStatus('ready');
          } else if (message.type === 'matches') {
            recognitionBusyRef.current = false;
            if (message.requestId !== recognitionRequestIdRef.current) return;
            const matches = (message.candidates || [])
              .filter((item: any) => item && typeof item.hanzi === 'string')
              .slice(0, 5) as HanziCandidate[];
            setRecognitionCandidates(matches);
            const best = matches[0]?.hanzi || '';
            recognizedCandidateRef.current = best;
            setRecognizedCandidate(best);
            setInkPhase(best ? 'candidate' : 'unmatched');
          } else if (message.type === 'error') {
            recognitionBusyRef.current = false;
            recognitionReadyRef.current = false;
            setRecognitionStatus('error');
            setInkPhase('unmatched');
          }
        };
        worker.onerror = () => {
          recognitionReadyRef.current = false;
          recognitionBusyRef.current = false;
          setRecognitionStatus('error');
          setInkPhase('unmatched');
        };
        worker.postMessage({ type: 'init' });
      } catch {
        setRecognitionStatus('error');
      }
      renderInkLayer(inkCanvasRef.current, viewportRef.current.width, viewportRef.current.height, inkStrokesRef.current);
    }
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
          if (pinchingRef.current) {
            pinchingRef.current = false;
            if (currentInkStrokeRef.current) currentInkStrokeRef.current.liftedAt = performance.now() / 1000;
            currentInkStrokeRef.current = null;
            smoothedInkPointRef.current = null;
            setIsWriting(false);
            scheduleInkRecognition();
          }
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
        const screenPoint = { x: (1-index.x) * viewportRef.current.width, y: index.y * viewportRef.current.height };
        fingerRef.current = { ...screenPoint, z: index.z || 0 };

        if (experienceToolRef.current === 'write') {
          // 以掌宽归一化拇指与食指指尖距离；双阈值迟滞可减少笔尖临界抖动。
          const pinchRatio = distance(hand[4], hand[8]) / base;
          const drawNow = pinchingRef.current ? pinchRatio < 0.48 : pinchRatio < 0.34;
          if (drawNow) {
            // If the user adds another stroke, treat it as continuation of this character,
            // dismiss the provisional guess and recognize the combined original strokes again.
            if (recognizedCandidateRef.current) {
              recognizedCandidateRef.current = '';
              setRecognizedCandidate('');
              setRecognitionCandidates([]);
            }
            const previous = smoothedInkPointRef.current;
            const smooth = previous
              ? { x: lerp(previous.x, screenPoint.x, 0.48), y: lerp(previous.y, screenPoint.y, 0.48) }
              : screenPoint;
            if (!pinchingRef.current) {
              pinchingRef.current = true;
              recognitionRequestIdRef.current += 1;
              recognitionBusyRef.current = false;
              if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
              setInkPhase('drawing');
              setRecognitionCandidates([]);
              const stroke: InkStroke = { points: [smooth] };
              inkStrokesRef.current.push(stroke);
              currentInkStrokeRef.current = stroke;
              setIsWriting(true);
            } else if (currentInkStrokeRef.current) {
              const points = currentInkStrokeRef.current.points;
              const last = points[points.length - 1];
              if (!last || Math.hypot(smooth.x - last.x, smooth.y - last.y) > 1.2) points.push(smooth);
            }
            smoothedInkPointRef.current = smooth;
            renderInkLayer(inkCanvasRef.current, viewportRef.current.width, viewportRef.current.height, inkStrokesRef.current);
          } else if (pinchingRef.current) {
            pinchingRef.current = false;
            if (currentInkStrokeRef.current) currentInkStrokeRef.current.liftedAt = performance.now() / 1000;
            currentInkStrokeRef.current = null;
            smoothedInkPointRef.current = null;
            setIsWriting(false);
            scheduleInkRecognition();
          }
        }
        hasHandRef.current = true; setHasHand(true);
      });
      handsRef.current = hands;
      // 首帧 send 会触发 MediaPipe 的 WASM/模型初始化；完成后才撤下唤醒遮罩。
      await hands.send({ image: video });
      setLoadingStage('手势识别已就绪');
      setLoadingProgress(100);
      modeRef.current = 'gesture'; setMode('gesture');
      setCameraLive(true); setStatus(tool === 'write' ? '捏合拇指与食指开始书写' : '等待手掌');
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
  }, [loading, stopCamera, scheduleInkRecognition]);

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
      const inkCanvas = inkCanvasRef.current;
      if (inkCanvas) {
        inkCanvas.width = Math.round(width*dpr);
        inkCanvas.height = Math.round(height*dpr);
        inkCanvas.style.width = width + 'px';
        inkCanvas.style.height = height + 'px';
        renderInkLayer(inkCanvas, width, height, inkStrokesRef.current);
      }
      const previewCanvas = handPreviewCanvasRef.current;
      if (previewCanvas) {
        const previewWidth = Math.round(280 * Math.min(dpr, 2));
        const previewHeight = Math.round(190 * Math.min(dpr, 2));
        if (previewCanvas.width !== previewWidth || previewCanvas.height !== previewHeight) {
          previewCanvas.width = previewWidth;
          previewCanvas.height = previewHeight;
        }
      }
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
      // 清屏后重绘，保证高刷下没有叠帧过曝或拖影残留。
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation='source-over';

      if (experienceToolRef.current === 'flower') {
        const ps = particlesRef.current;
        // 轻微绕 Y 轴缓慢环绕，配合透视与前后景深，让花冠始终显出 3D 体积。
        const yaw = now * 0.085 + Math.sin(now * 0.17) * 0.025;
        const cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);
        const pitch = 0.2 + Math.sin(now * 0.13) * 0.018;
        const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
        const cameraDistance = 2.65;
        const breathing = 1 + Math.sin(now * 0.68) * 0.006;
  
        // 第一遍：在真正的三维空间中更新每个粒子，再投影到屏幕。
        // 旋转、轻微湍流和透视变化都是连续函数，不使用随机跳点，避免抖动。
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          let worldX = lerp(p.budX, p.bloomX, opennessNow) * breathing;
          let worldY = lerp(p.budY, p.bloomY, opennessNow) * breathing;
          let worldZ = lerp(p.budZ, p.bloomZ, opennessNow);
          const flow = Math.sin(now * 0.38 + p.seed * 0.013 + p.phase) * 0.0045
            + Math.cos(now * 0.23 + p.seed * 0.009) * 0.0025;
          worldX += Math.cos(p.angle + now * 0.12) * flow;
          worldY += Math.sin(now * 0.31 + p.phase) * 0.003;
          worldZ += Math.sin(p.angle * 1.4 + now * 0.29 + p.phase) * 0.004;
  
          const rotatedX = worldX * cosYaw - worldZ * sinYaw;
          const rotatedZ = worldX * sinYaw + worldZ * cosYaw;
          const cameraY = worldY * cosPitch - rotatedZ * sinPitch;
          const cameraZ = worldY * sinPitch + rotatedZ * cosPitch;
          const perspective = clamp(cameraDistance / (cameraDistance - cameraZ), 0.78, 1.28);
  
          p.x = cx + rotatedX * scale * perspective;
          p.y = cy + cameraY * scale * perspective;
          p.cameraDepth = cameraZ;
          p.projectionScale = perspective;
          p.radial = clamp(Math.hypot(worldX, worldZ) / 0.72, 0, 1);
        }
  
        // 先画远处粒子，后画靠近镜头的粒子；同一颗粒子的前后关系随花冠旋转自然变化。
        ps.sort((a, b) => a.cameraDepth - b.cameraDepth);
  
        // 柔和环境光只烘托花冠轮廓，不覆盖粒子中心。
        const halo = ctx.createRadialGradient(cx, cy, scale * 0.08, cx, cy, scale * 0.82);
        halo.addColorStop(0, 'rgba(226,105,161,' + (0.055 + opennessNow * 0.055) + ')');
        halo.addColorStop(1, 'rgba(120,50,105,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, width, height);
  
        // 第二遍：绘制体积粒子。中心偏香槟金，中层柔粉，外缘玫瑰色。
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i];
          let x = p.x, y = p.y;
          if (finger && opennessNow > 0.25) {
            const dx = finger.x - x, dy = finger.y - y;
            const d2 = dx * dx + dy * dy, radius = scale * 0.31;
            if (d2 < radius * radius) {
              const pull = (1 - Math.sqrt(d2) / radius) * 0.14 * opennessNow;
              x += dx * pull;
              y += dy * pull;
            }
          }
          p.x = x; p.y = y;
          const normalized = p.radial;
          const r = Math.round(250 - normalized * 27);
          const g = Math.round(218 - normalized * 111);
          const b = Math.round(174 + normalized * 31);
          const twinkle = 0.9 + Math.sin(p.phase + now * 1.15) * 0.08;
          const depthLight = clamp(0.92 + p.projectionScale * 0.09, 0.88, 1.08);
          const alpha = (0.105 + normalized * 0.105) * twinkle * depthLight;
          const size = p.size * (0.78 + opennessNow * 0.22) * (0.82 + p.projectionScale * 0.18);
  
          ctx.globalAlpha = alpha;
          ctx.drawImage(sprite, x - size * 1.45, y - size * 1.45, size * 2.9, size * 2.9);
          ctx.globalAlpha = alpha * 0.94;
          ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',.86)';
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.38, size * 0.46), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
      }
      if (experienceToolRef.current !== 'write' && landmarksRef.current && modeRef.current==='gesture') {
        drawSkeleton(ctx,landmarksRef.current,width,height);
      }
      if (experienceToolRef.current === 'write') {
        drawAirInkScene(
          ctx,
          inkStrokesRef.current,
          committedGlyphsRef.current,
          width,
          height,
          now
        );
        drawSkeletonPreview(handPreviewCanvasRef.current, landmarksRef.current && modeRef.current === 'gesture' ? landmarksRef.current : null);
      }
      // 花朵模式才在主画布显示食指牵引光点；书写模式把手势骨骼独立收纳到角落预览窗。
      if (experienceToolRef.current !== 'write' && finger && modeRef.current === 'gesture') {
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
    <main className={'bloom-page ' + (layoutOrientation === 'landscape' ? 'orientation-landscape ' : 'orientation-portrait ') + (orientationFallback ? 'orientation-fallback ' : '') + (experienceTool === 'write' ? 'tool-write ' : '') + (experienceStarted ? 'is-active' : '')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      <video ref={videoRef} className={'bloom-camera' + (cameraLive ? ' is-live' : '')} playsInline muted />
      <button type="button" className="bloom-exit" onClick={() => void exitExperience()} aria-label="退出指尖生花体验">× <span>退出</span></button>
      {experienceStarted && experienceTool === 'write' && (
        <div className="bloom-ink-tools">
          <div className={'bloom-ink-status' + (isWriting ? ' drawing' : '')}>
            <i />{isWriting ? '正在书写 · 松开让笔迹升起' : hasHand ? '捏合开始书写' : '请将手掌放入镜头'}
            <small>{inkPhase === 'drawing' ? '松开后，原始粒子笔迹会缓慢升起' : inkPhase === 'lifting' ? '粒子正在慢慢升起…' : inkPhase === 'recognizing' ? '正在根据笔迹整体形状推断…' : inkPhase === 'candidate' ? '请判断候选字是否符合你的笔迹' : inkPhase === 'unmatched' ? '暂时没有合适候选，可以重新书写' : recognitionStatus === 'ready' ? '粒子先成形，再分析字形' : recognitionStatus === 'loading' ? '识字模型准备中' : recognitionStatus === 'error' ? '识字暂不可用，仍可书写' : ''}</small>
          </div>
          {recognitionCandidates.length > 0 && (
            <div className="bloom-ink-candidates">
              <span>像是</span>
              {recognitionCandidates.slice(0, 4).map(item => (
                <button type="button" key={item.hanzi} className={recognizedCandidate === item.hanzi ? 'selected' : ''} onClick={() => {
                  recognizedCandidateRef.current = item.hanzi;
                  setRecognizedCandidate(item.hanzi);
                  setInkPhase('candidate');
                }}>{item.hanzi}</button>
              ))}
            </div>
          )}
          {(recognizedCandidate || inkPhase === 'unmatched') && (
            <>
              {recognizedCandidate && (
                <button type="button" className="bloom-ink-confirm" onClick={() => {
                  const confirmedStrokes = inkStrokesRef.current.map(stroke => ({
                    points: stroke.points.map(point => ({ ...point })),
                    liftedAt: stroke.liftedAt ?? performance.now() / 1000
                  }));
                  if (confirmedStrokes.length) {
                    committedGlyphsRef.current.push({ character: recognizedCandidate, strokes: confirmedStrokes });
                    setRecognizedText(committedGlyphsRef.current.map(glyph => glyph.character).join(''));
                    inkStrokesRef.current = [];
                    currentInkStrokeRef.current = null;
                    recognizedCandidateRef.current = '';
                    setRecognizedCandidate('');
                    setRecognitionCandidates([]);
                    setInkPhase('idle');
                  }
                }}>确认这个字</button>
              )}
              <button type="button" className="bloom-ink-rewrite" onClick={() => {
                if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
                recognitionRequestIdRef.current += 1;
                recognitionBusyRef.current = false;
                inkStrokesRef.current = [];
                recognizedCandidateRef.current = '';
                setRecognizedCandidate('');
                setRecognitionCandidates([]);
                currentInkStrokeRef.current = null;
                pinchingRef.current = false;
                smoothedInkPointRef.current = null;
                setIsWriting(false);
                setInkPhase('idle');
              }}>重新书写</button>
            </>
          )}
          {recognizedText && <span className="bloom-ink-word">{recognizedText}</span>}
          <button type="button" onClick={() => {
            if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
            recognitionRequestIdRef.current += 1;
            recognitionBusyRef.current = false;
            if (inkStrokesRef.current.length) inkStrokesRef.current.pop();
            else committedGlyphsRef.current.pop();
            setRecognizedText(committedGlyphsRef.current.map(glyph => glyph.character).join(''));
            recognizedCandidateRef.current = '';
            setRecognizedCandidate('');
            setRecognitionCandidates([]);
            setInkPhase('idle');
            currentInkStrokeRef.current = null;
            pinchingRef.current = false;
            smoothedInkPointRef.current = null;
            setIsWriting(false);
            renderInkLayer(inkCanvasRef.current, viewportRef.current.width, viewportRef.current.height, inkStrokesRef.current);
          }}>撤销</button>
          <button type="button" onClick={() => {
            if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
            recognitionRequestIdRef.current += 1;
            recognitionBusyRef.current = false;
            inkStrokesRef.current = [];
            committedGlyphsRef.current = [];
            recognizedCandidateRef.current = '';
            setRecognizedCandidate('');
            setRecognitionCandidates([]);
            setRecognizedText('');
            setInkPhase('idle');
            currentInkStrokeRef.current = null;
            pinchingRef.current = false;
            smoothedInkPointRef.current = null;
            setIsWriting(false);
            renderInkLayer(inkCanvasRef.current, viewportRef.current.width, viewportRef.current.height, inkStrokesRef.current);
          }}>清空</button>
        </div>
      )}
      <canvas ref={canvasRef} className="bloom-canvas" aria-label="互动粒子与手势画面" />
      <div className="bloom-vignette" />
      <canvas ref={inkCanvasRef} className="bloom-ink-canvas" aria-label="空中书写笔迹" />
      {experienceStarted && experienceTool === 'write' && (
        <section className="bloom-hand-preview" aria-label="手部骨骼预览">
          <div className="bloom-hand-preview-heading">
            <span>手势骨骼</span>
            <small>21 POINTS</small>
          </div>
          <canvas ref={handPreviewCanvasRef} className="bloom-hand-preview-canvas" aria-label="实时手部骨骼模型" />
          <div className={'bloom-hand-preview-state' + (hasHand ? ' detected' : '')}>
            <i />{hasHand ? '已识别 · 食指追踪中' : '等待手部进入画面'}
          </div>
        </section>
      )}
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
          <>
            <div className="bloom-actions">
              <button className="bloom-primary" onClick={() => void startCamera('flower')} disabled={loading}>
                {loading ? '正在唤醒…' : '开启手势'}
              </button>
              <button className="bloom-secondary" onClick={() => void startCamera('write')} disabled={loading}>空中书写</button>
              <button className="bloom-secondary" onClick={() => setExperienceMode('demo')}>无摄像头体验</button>
            </div>
            <div className="bloom-writing-note">AIR INK · 捏合拇指与食指开始书写，松开即可换笔画</div>
          </>
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
