import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles-particle-flower.css';

type Point = { x: number; y: number; z: number };
type Particle = {
  seed: number; angle: number; depth: number; size: number; phase: number; tone: number; petalId: number;
  budX: number; budY: number; budZ: number; bloomX: number; bloomY: number; bloomZ: number;
  x: number; y: number; vx: number; vy: number; projectionScale: number; rim: boolean;
};
type Mode = 'gesture' | 'demo';
type ExperienceTool = 'flower' | 'write';
type InkPoint = { x: number; y: number };
type InkStroke = { points: InkPoint[]; liftedAt?: number; particleCanvas?: HTMLCanvasElement; particleLeft?: number; particleTop?: number };
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
  const out: Particle[] = [], TAU = Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const seed = Math.random() * 1000, angle = Math.random() * TAU, depth = Math.random() * 2 - 1;
    const budR = Math.pow(Math.random(), 1.55), budTheta = Math.acos(2 * Math.random() - 1);
    const budX = Math.sin(budTheta) * Math.cos(angle) * budR * 0.22;
    const budY = Math.cos(budTheta) * budR * 0.34;
    const budZ = Math.sin(budTheta) * Math.sin(angle) * budR * 0.18;

    // Three interleaved petal layers. Points fill individual petal surfaces,
    // rather than a uniform circular disk.
    const layerRoll = Math.random();
    const layer = layerRoll < 0.44 ? 0 : layerRoll < 0.8 ? 1 : 2;
    const layerScale = layer === 0 ? 1 : layer === 1 ? 0.88 : 0.76;
    const petalCount = layer === 0 ? 7 : layer === 1 ? 6 : 5;
    const petalIndex = Math.floor(Math.random() * petalCount);
    const petalPhase = layer === 0 ? 0 : layer === 1 ? Math.PI / 6 : Math.PI / 5;
    const along = 0.10 + Math.pow(Math.random(), 0.78) * 0.9;
    const widthProfile = Math.pow(Math.max(0, Math.sin(along * Math.PI)), 0.72);
    const across = (Math.random() * 2 - 1) * widthProfile * 0.105 * layerScale;
    const petalAngle = petalIndex * TAU / petalCount + petalPhase;
    const warpedAngle = petalAngle + (along - 0.5) * 0.12 + across * 0.24;
    const petalR = (0.13 + along * 0.78) * layerScale;
    const hanging = along > 0.82 && Math.random() < 0.12 ? Math.random() * 0.055 : 0;
    const layerLift = layer === 0 ? -0.035 : layer === 1 ? 0.008 : 0.052;
    const dome = Math.sin(along * Math.PI);
    const bloomX = Math.cos(warpedAngle) * petalR * 0.56 - Math.sin(warpedAngle) * across * 1.55;
    const bloomY = -dome * 0.095 + along * along * 0.11 + layerLift + hanging + across * 0.12;
    const bloomZ = Math.sin(warpedAngle) * petalR * 0.39 + Math.cos(warpedAngle) * across * 1.25
      + depth * 0.025 + (layer - 1) * 0.018;
    out.push({
      seed, angle: petalAngle, depth,
      size: 0.62 + Math.pow(Math.random(), 1.6) * 1.18,
      phase: Math.random() * TAU,
      tone: along < 0.35 ? 0 : layer === 0 ? 1 : layer === 1 ? 2 : 3,
      petalId: layer * 8 + petalIndex,
      budX, budY, budZ, bloomX, bloomY, bloomZ, x: 0, y: 0, vx: 0, vy: 0, projectionScale: 1,
      rim: Math.abs(across) > widthProfile * 0.105 * layerScale * 0.68
    });
  }
  return out;
}

function drawParticleSprites(): HTMLCanvasElement[] {
  const colors = [[255,246,224],[255,215,224],[250,167,198],[238,126,177]];
  return colors.map(([r,g,b], index) => {
    const sprite = document.createElement('canvas'); sprite.width = 48; sprite.height = 48;
    const ctx = sprite.getContext('2d')!;
    const glow = ctx.createRadialGradient(24,24,0.5,24,24,23);
    glow.addColorStop(0,'rgba(255,255,246,.98)');
    glow.addColorStop(0.09,'rgba('+r+','+g+','+b+',.92)');
    glow.addColorStop(0.28,'rgba('+r+','+g+','+b+',.42)');
    glow.addColorStop(0.62,'rgba('+r+','+g+','+b+',.12)');
    glow.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
    ctx.fillStyle=glow; ctx.fillRect(0,0,48,48);
    ctx.globalCompositeOperation='lighter';
    const core=ctx.createRadialGradient(24,24,0,24,24,index===0?4.8:3.8);
    core.addColorStop(0,'rgba(255,255,248,.98)');
    core.addColorStop(0.45,'rgba('+r+','+g+','+b+',.72)');
    core.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
    ctx.fillStyle=core; ctx.beginPath(); ctx.arc(24,24,5,0,Math.PI*2); ctx.fill();
    if(index===0||index===2){ctx.globalAlpha=.24;ctx.fillStyle='rgba(255,245,231,.9)';ctx.fillRect(23.6,10,.8,28);ctx.fillRect(10,23.6,28,.8)}
    return sprite;
  });
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

let inkParticleStamp: HTMLCanvasElement | null = null;
function getInkParticleStamp(): HTMLCanvasElement {
  if (inkParticleStamp) return inkParticleStamp;
  const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
  const ctx=canvas.getContext('2d')!;
  const glow=ctx.createRadialGradient(16,16,.2,16,16,15);
  glow.addColorStop(0,'rgba(255,255,247,1)');
  glow.addColorStop(.12,'rgba(255,229,212,.94)');
  glow.addColorStop(.3,'rgba(250,172,203,.58)');
  glow.addColorStop(.66,'rgba(239,116,174,.15)');
  glow.addColorStop(1,'rgba(239,116,174,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,32,32);inkParticleStamp=canvas;return canvas;
}
function cacheInkStrokeParticles(stroke: InkStroke, density: number) {
  if(stroke.particleCanvas||stroke.points.length<2)return;
  const points=stroke.points;
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  const padding=18,left=Math.floor(minX-padding),top=Math.floor(minY-padding);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(24,Math.ceil(maxX-minX+padding*2));
  canvas.height=Math.max(24,Math.ceil(maxY-minY+padding*2));
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const stamp=getInkParticleStamp();ctx.globalCompositeOperation='lighter';
  let particleIndex=0;
  const add=(x:number,y:number)=>{
    const index=particleIndex++;
    const jitterX=Math.sin(index*12.9898+points.length)*1.1;
    const jitterY=Math.cos(index*7.233+points.length*.7)*1.1;
    const size=4.2+(0.5+0.5*Math.sin(index*2.17))*3.7;
    ctx.globalAlpha=.48+(0.5+0.5*Math.sin(index*1.71))*.4;
    ctx.drawImage(stamp,x+jitterX-size*.5,y+jitterY-size*.5,size,size);
    if(index%3===0){
      const satellite=2.2+(index%5)*.42;
      ctx.globalAlpha=.22+(index%4)*.07;
      ctx.drawImage(stamp,x-jitterY*1.8-satellite*.5,y+jitterX*1.8-satellite*.5,satellite,satellite);
    }
  };
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y);
    const spacing=clamp(5.8*(3200/density),2.3,12);
    const steps=Math.max(1,Math.ceil(length/spacing));
    for(let step=0;step<=steps;step++){const t=step/steps;add(a.x+(b.x-a.x)*t-left,a.y+(b.y-a.y)*t-top)}
  }
  stroke.particleCanvas=canvas;stroke.particleLeft=left;stroke.particleTop=top;
}
function drawAirInkScene(ctx:CanvasRenderingContext2D,strokes:InkStroke[],committed:InkGlyph[],time:number,density:number,sizeMultiplier:number,glowMultiplier:number){
  ctx.save();ctx.globalCompositeOperation='lighter';
  const drawStroke=(stroke:InkStroke,phase:number)=>{
    const points=stroke.points;if(!points.length)return;
    if(stroke.liftedAt===undefined){
      if(points.length>1){
        const first=points[0],last=points[points.length-1];
        const gradient=ctx.createLinearGradient(first.x,first.y,last.x,last.y);
        gradient.addColorStop(0,'rgba(255,229,205,.28)');
        gradient.addColorStop(.52,'rgba(247,173,206,.48)');
        gradient.addColorStop(1,'rgba(240,128,179,.26)');
        ctx.strokeStyle=gradient;ctx.lineWidth=Math.max(1.1,1.7*sizeMultiplier);
        ctx.shadowColor='rgba(244,145,190,.36)';ctx.shadowBlur=8*glowMultiplier;
        ctx.beginPath();ctx.moveTo(first.x,first.y);
        for(let i=1;i<points.length-1;i++){const p=points[i],n=points[i+1];ctx.quadraticCurveTo(p.x,p.y,(p.x+n.x)*.5,(p.y+n.y)*.5)}
        ctx.lineTo(last.x,last.y);ctx.stroke();ctx.shadowBlur=0;
      }
      return;
    }
    cacheInkStrokeParticles(stroke,density);
    if(!stroke.particleCanvas||stroke.particleLeft===undefined||stroke.particleTop===undefined)return;
    const progress=clamp((time-stroke.liftedAt)/1.35,0,1),eased=progress*progress*(3-2*progress);
    const drift=Math.sin(time*.72+phase)*eased*.8,rise=eased*10,canvas=stroke.particleCanvas;
    const drawWidth=canvas.width*sizeMultiplier,drawHeight=canvas.height*sizeMultiplier;
    const centerX=stroke.particleLeft+canvas.width*.5,centerY=stroke.particleTop+canvas.height*.5;
    ctx.globalAlpha=clamp((.72+eased*.16)*glowMultiplier,.15,1);
    ctx.drawImage(canvas,centerX-drawWidth*.5+drift,centerY-drawHeight*.5-rise,drawWidth,drawHeight);
    if(progress>.78){
      for(let mote=0;mote<3;mote++){
        const x=centerX+Math.sin(time*.38+phase+mote*2.1)*(18+mote*5);
        const y=centerY-rise-8-((time*7+mote*13)%20);
        ctx.globalAlpha=.16*glowMultiplier;ctx.fillStyle='rgba(255,226,238,.85)';
        ctx.beginPath();ctx.arc(x,y,.7+mote*.22,0,Math.PI*2);ctx.fill();
      }
    }
  };
  committed.forEach((glyph,index)=>glyph.strokes.forEach((stroke,strokeIndex)=>drawStroke(stroke,index*7+strokeIndex*1.7)));
  strokes.forEach((stroke,index)=>drawStroke(stroke,index*1.7+.4));
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.restore();
}




export default function ParticleFlower() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const initialFpsLimit: FpsLimit = window.matchMedia('(max-width: 700px)').matches ? 60 : 0;
  const fpsLimitRef = useRef<FpsLimit>(initialFpsLimit);
  const startGuardRef = useRef(false);
  const cameraRafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const targetRef = useRef(0.72);
  const currentRef = useRef(0.72);
  const velocityRef = useRef(0);
  const fingerRef = useRef<Point | null>(null);
  const gestureRotationRef = useRef(0);
  const fingerTrailRef = useRef<Array<{ x: number; y: number; t: number }>>([]);
  const landmarksRef = useRef<any[] | null>(null);
  const hasHandRef = useRef(false);
  const experienceStartedRef = useRef(false);
  const pointerRef = useRef<Point | null>(null);
  const pointerDownRef = useRef(false);
  const modeRef = useRef<Mode>('demo');
  const [mode, setMode] = useState<Mode>('demo');
  const [layoutOrientation, setLayoutOrientation] = useState<LayoutOrientation>(() => window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait');
  const [fpsLimit, setFpsLimit] = useState<FpsLimit>(initialFpsLimit);
  const [qualityPreset, setQualityPreset] = useState<'auto' | 'soft' | 'standard' | 'ultra' | 'custom'>('auto');
  const [focusMode, setFocusMode] = useState(false);
  const [performanceNotice, setPerformanceNotice] = useState('设备自适应已开启');
  const autoFpsLowSamplesRef = useRef(0);
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
  const [particleCount, setParticleCount] = useState(() => window.matchMedia('(max-width: 700px)').matches ? 1800 : 3200);
  const particleCountRef = useRef(particleCount);
  const particleRebuildTimerRef = useRef<number>(0);
  const [particleSize, setParticleSize] = useState(1);
  const particleSizeRef = useRef(1);
  const [glowIntensity, setGlowIntensity] = useState(1);
  const glowIntensityRef = useRef(1);
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
      experienceToolRef.current = 'flower';
      setExperienceTool('flower');
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
    setFocusMode(false);
    targetRef.current = 0.18;
    currentRef.current = 0.18;
    velocityRef.current = 0;
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
      const cameraTrack = stream.getVideoTracks()[0];
      cameraTrack?.addEventListener('ended', () => {
        if (streamRef.current !== stream) return;
        stopCamera();
        setStatus('摄像头已断开');
        setError('摄像头连接已中断。请检查系统摄像头权限后重新进入体验。');
      }, { once: true });
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
          targetRef.current = 0.18; hasHandRef.current = false; setHasHand(false);
          gestureRotationRef.current = lerp(gestureRotationRef.current, 0, 0.06);
          return;
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
        if (experienceToolRef.current === 'flower') {
          const horizontalOffset = screenPoint.x / Math.max(1, viewportRef.current.width) - 0.5;
          gestureRotationRef.current = lerp(gestureRotationRef.current, clamp(horizontalOffset * 0.3, -0.14, 0.14), 0.08);
          fingerTrailRef.current.push({ x: screenPoint.x, y: screenPoint.y, t: performance.now() });
          if (fingerTrailRef.current.length > 12) fingerTrailRef.current.shift();
        }

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

  const changeOrientation = useCallback((next: LayoutOrientation) => {
    // Choosing a layout in the settings panel must not enter fullscreen by itself.
    layoutOrientationRef.current = next;
    setLayoutOrientation(next);
    setOrientationFallback(next === 'landscape' && !window.matchMedia('(orientation: landscape)').matches);
  }, []);

  const applyQualityPreset = useCallback((preset: 'auto' | 'soft' | 'standard' | 'ultra') => {
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as any).deviceMemory || 4;
    const limitedDevice = mobile && (cores <= 4 || memory <= 4);
    const config = preset === 'soft'
      ? { count: mobile ? 1200 : 2200, size: 0.9, glow: 0.78, fps: (mobile ? 30 : 60) as FpsLimit }
      : preset === 'standard'
        ? { count: mobile ? 1800 : 3200, size: 1, glow: 1, fps: (mobile ? 60 : 0) as FpsLimit }
        : preset === 'ultra'
          ? { count: mobile ? 3000 : 5400, size: 1.1, glow: 1.22, fps: 0 as FpsLimit }
          : { count: limitedDevice ? 1400 : mobile ? 2200 : 3800, size: 1, glow: 1, fps: (mobile ? 60 : 0) as FpsLimit };
    setQualityPreset(preset);
    particleCountRef.current = config.count; setParticleCount(config.count);
    particleSizeRef.current = config.size; setParticleSize(config.size);
    glowIntensityRef.current = config.glow; setGlowIntensity(config.glow);
    fpsLimitRef.current = config.fps; setFpsLimit(config.fps);
    autoFpsLowSamplesRef.current = 0;
    setPerformanceNotice(preset === 'auto' ? '已按设备能力自动配置' : '已应用画质预设');
    if (particleRebuildTimerRef.current) window.clearTimeout(particleRebuildTimerRef.current);
    particleRebuildTimerRef.current = window.setTimeout(() => { particlesRef.current = makeParticles(config.count); }, 140);
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
    const count = particleCountRef.current;
    particlesRef.current = makeParticles(count);
    const particleSprites = drawParticleSprites();
    const petalTouchTargets = new Float32Array(24);
    const petalTouchCurrent = new Float32Array(24);
    const resize = () => {
      const forcedLandscape = layoutOrientationRef.current === 'landscape' && window.innerWidth < window.innerHeight;
      width = forcedLandscape ? window.innerHeight : window.innerWidth;
      height = forcedLandscape ? window.innerWidth : window.innerHeight;
      viewportRef.current = { width, height };
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? (lowEnd ? 1 : 1.25) : 1.6);
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
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
        const yaw = now*.085 + Math.sin(now*.17)*.025 + gestureRotationRef.current;
        const cosYaw=Math.cos(yaw),sinYaw=Math.sin(yaw);
        const pitch=.2+Math.sin(now*.13)*.018;
        const cosPitch=Math.cos(pitch),sinPitch=Math.sin(pitch);
        const cameraDistance=2.65,breathing=1+Math.sin(now*.68)*.006;
        const halo=ctx.createRadialGradient(cx,cy,scale*.08,cx,cy,scale*.82);
        halo.addColorStop(0,'rgba(226,105,161,'+(.075+opennessNow*.07)+')');
        halo.addColorStop(1,'rgba(120,50,105,0)');
        ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
        // A warm inner light gives the layered flower a visible centre and a gentle breathing pulse.
        const corePulse = 0.92 + Math.sin(now * 1.15) * 0.08;
        const coreRadius = scale * (0.025 + opennessNow * 0.012) * corePulse;
        const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius * 4.2);
        coreGlow.addColorStop(0, 'rgba(255,245,224,.42)');
        coreGlow.addColorStop(.18, 'rgba(255,205,205,.19)');
        coreGlow.addColorStop(1, 'rgba(244,144,190,0)');
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = coreGlow; ctx.beginPath(); ctx.arc(cx, cy, coreRadius * 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,242,219,.42)'; ctx.beginPath(); ctx.arc(cx, cy, coreRadius * .55, 0, Math.PI * 2); ctx.fill();
        ctx.restore();

        // Additive prebuilt sprites avoid per-frame sorting and per-particle canvas paths.
        // Detect the touched petal first; then pull that entire petal gently toward the bloom centre.
        petalTouchTargets.fill(0);
        const contactRadius = scale * 0.072;
        const contactRadiusSquared = contactRadius * contactRadius;
        for(let i=0;i<ps.length;i++){
          const p=ps[i];
          let worldX=lerp(p.budX,p.bloomX,opennessNow)*breathing;
          let worldY=lerp(p.budY,p.bloomY,opennessNow)*breathing;
          let worldZ=lerp(p.budZ,p.bloomZ,opennessNow);
          const flow=Math.sin(now*.38+p.seed*.013+p.phase)*.0058+Math.cos(now*.23+p.seed*.009)*.0034;
          worldX+=Math.cos(p.angle+now*.12)*flow;
          worldY+=Math.sin(now*.31+p.phase)*.004;
          worldZ+=Math.sin(p.angle*1.4+now*.29+p.phase)*.005;
          const rotatedX=worldX*cosYaw-worldZ*sinYaw,rotatedZ=worldX*sinYaw+worldZ*cosYaw;
          const cameraY=worldY*cosPitch-rotatedZ*sinPitch,cameraZ=worldY*sinPitch+rotatedZ*cosPitch;
          const perspective=clamp(cameraDistance/(cameraDistance-cameraZ),.78,1.28);
          p.x=cx+rotatedX*scale*perspective;
          p.y=cy+cameraY*scale*perspective;
          p.projectionScale=perspective;

          if(finger&&opennessNow>.25){
            const dx=finger.x-p.x,dy=finger.y-p.y,d2=dx*dx+dy*dy;
            if(d2<contactRadiusSquared){
              const touch=1-d2/contactRadiusSquared;
              const strength=touch*touch*(3-2*touch);
              if(strength>petalTouchTargets[p.petalId])petalTouchTargets[p.petalId]=strength;
            }
          }
        }
        // Fast response on contact, slower release for a soft elastic return.
        for(let petal=0;petal<petalTouchCurrent.length;petal++){
          const target=petalTouchTargets[petal];
          const speed = target > petalTouchCurrent[petal] ? 0.34 : 0.095;
          petalTouchCurrent[petal]=lerp(petalTouchCurrent[petal],target,speed);
        }

        ctx.globalCompositeOperation='lighter';
        for(let i=0;i<ps.length;i++){
          const p=ps[i];
          const touch=petalTouchCurrent[p.petalId];
          const contraction=touch*.48;
          // The petal folds radially toward its own flower centre, not toward the fingertip.
          const x=cx+(p.x-cx)*(1-contraction);
          const y=cy+(p.y-cy)*(1-contraction);
          const twinkle=.78+Math.sin(p.phase+now*(.75+p.tone*.08))*.12;
          const depthScale=.82+p.projectionScale*.2;
          const size=p.size*particleSizeRef.current*depthScale*(1+touch*.14);
          const alpha=clamp((.34+opennessNow*.16)*twinkle*glowIntensityRef.current*(1+touch*.42),0,.96);
          const sprite=particleSprites[p.tone],diameter=size*7.2;
          ctx.globalAlpha=alpha;
          ctx.drawImage(sprite,x-diameter*.5,y-diameter*.5,diameter,diameter);
          if (p.rim) {
            ctx.globalAlpha = Math.min(0.24, alpha * 0.26);
            ctx.fillStyle = 'rgba(255,242,231,.92)';
            ctx.beginPath(); ctx.arc(x, y, Math.max(0.45, diameter * 0.045), 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
      }
      if (experienceToolRef.current !== 'write' && landmarksRef.current && modeRef.current==='gesture') {
        drawSkeleton(ctx,landmarksRef.current,width,height);
      }
      if (experienceToolRef.current === 'write') {
        drawAirInkScene(
          ctx,
          inkStrokesRef.current,
          committedGlyphsRef.current,
          now,
          particleCountRef.current,
          particleSizeRef.current,
          glowIntensityRef.current
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
      if (experienceToolRef.current === 'flower' && fingerTrailRef.current.length > 1) {
        const trail = fingerTrailRef.current.filter(point => time - point.t < 260);
        fingerTrailRef.current = trail;
        if (trail.length > 1) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let i = 1; i < trail.length; i++) {
            const age = clamp(1 - (time - trail[i].t) / 260, 0, 1);
            ctx.strokeStyle = 'rgba(255,190,216,' + (age * 0.2) + ')';
            ctx.lineWidth = 1 + age * 2.2;
            ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
          }
          ctx.restore();
        }
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

  // Auto quality only steps down after several consecutive slow samples; it never
  // oscillates upward mid-session or overrides a manually selected preset.
  useEffect(() => {
    if (!experienceStarted || mode !== 'gesture' || qualityPreset !== 'auto' || actualFps <= 0) {
      autoFpsLowSamplesRef.current = 0;
      return;
    }
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const floor = fpsLimit === 0 ? (mobile ? 42 : 48) : Math.max(22, Math.min(48, fpsLimit * 0.68));
    if (actualFps < floor) autoFpsLowSamplesRef.current += 1;
    else autoFpsLowSamplesRef.current = 0;
    if (autoFpsLowSamplesRef.current >= 4 && particleCountRef.current > 800) {
      const next = Math.max(800, Math.round((particleCountRef.current * 0.82) / 200) * 200);
      autoFpsLowSamplesRef.current = 0;
      particleCountRef.current = next; setParticleCount(next);
      setPerformanceNotice('帧率偏低，已自动降低粒子密度');
      if (particleRebuildTimerRef.current) window.clearTimeout(particleRebuildTimerRef.current);
      particleRebuildTimerRef.current = window.setTimeout(() => { particlesRef.current = makeParticles(next); }, 160);
    }
  }, [actualFps, experienceStarted, mode, qualityPreset, fpsLimit]);

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

  useEffect(() => () => {
    stopCamera();
    if (particleRebuildTimerRef.current) window.clearTimeout(particleRebuildTimerRef.current);
  }, [stopCamera]);

  const statusEnglish = mode==='demo' ? 'DEMO EXPERIENCE' : !hasHand ? 'WAITING FOR HAND' : openness<28 ? 'CLOSED · FIST' : openness>68 ? 'BLOOM · OPEN' : 'OPENING · FLOW';
  const statusChinese = mode==='demo' ? '演示模式' : !hasHand ? '等待手掌' : openness<28 ? '花苞' : openness>68 ? '绽放' : '舒展中';

  return (
    <main className={'bloom-page ' + (layoutOrientation === 'landscape' ? 'orientation-landscape ' : 'orientation-portrait ') + (orientationFallback ? 'orientation-fallback ' : '') + (experienceTool === 'write' ? 'tool-write ' : '') + (experienceStarted ? 'is-active ' : '') + (focusMode ? 'is-focused' : '')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
      <video ref={videoRef} className={'bloom-camera' + (cameraLive ? ' is-live' : '')} playsInline muted />
      <button type="button" className="bloom-exit" onClick={() => void exitExperience()} aria-label="退出指尖生花体验">× <span>退出</span></button>
      {experienceStarted && <button type="button" className="bloom-focus-toggle" aria-pressed={focusMode} onClick={() => setFocusMode(value => !value)}>{focusMode ? '恢复界面' : '专注模式'}</button>}
      {experienceStarted && <aside className="bloom-telemetry" aria-live="off"><span>{actualFps} FPS</span><i /> <span>{particleCount.toLocaleString()} 粒子</span><i /> <span>{hasHand ? '手势已连接' : mode === 'demo' ? '触屏演示' : '等待手势'}</span></aside>}
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
          <button type="button" className="bloom-ink-save" onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = '指尖生花-空中书写作品.png';
            link.click();
          }}>保存作品</button>
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
                }}>清空</button>
        </div>
      )}
      <canvas ref={canvasRef} className="bloom-canvas" aria-label="互动粒子与手势画面" />
      <div className="bloom-vignette" />
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
      {!experienceStarted&&<header className="bloom-header">
        <button className="bloom-brand" onClick={() => navigate('/explore')} aria-label="返回探索空间">
          <span className="bloom-brand-cn">指尖生花</span><span className="bloom-brand-en">BLOOM AT YOUR FINGERTIPS</span>
        </button>
        <div className={'bloom-pill' + (cameraLive ? ' live' : '')}><i />{cameraLive ? 'CAMERA LIVE' : 'STANDBY ｜ NO.01'}</div>
      </header>}
      {!experienceStarted && (
        <section className="bloom-intro bloom-control-panel" aria-label="粒子效果设置">
          <div className="bloom-kicker">BLOOM STUDIO / 光粒子工作台</div>
          <h1>让花，在指尖醒来。</h1>
          <p>调节花冠粒子的密度、大小与光感，然后进入独立的沉浸式生花体验。</p>
          <div className="bloom-quality-presets" role="group" aria-label="画质预设">
            <span>画质方案</span>
            {([{ value: 'auto', label: '自动推荐' }, { value: 'soft', label: '柔和' }, { value: 'standard', label: '标准' }, { value: 'ultra', label: '极致' }] as const).map(item => (
              <button type="button" key={item.value} className={qualityPreset === item.value ? 'active' : ''} onClick={() => applyQualityPreset(item.value)}>{item.label}</button>
            ))}
          </div>
          <div className="bloom-settings-grid">
            <label className="bloom-setting">
              <span><b>粒子密度</b><output>{particleCount.toLocaleString()}</output></span>
              <input aria-label="粒子密度" type="range" min="800" max="6000" step="200" value={particleCount} onChange={event=>{
                const next=Number(event.target.value);particleCountRef.current=next;setParticleCount(next);setQualityPreset('custom');
                if(particleRebuildTimerRef.current)window.clearTimeout(particleRebuildTimerRef.current);
                particleRebuildTimerRef.current=window.setTimeout(()=>{particlesRef.current=makeParticles(next)},160);
              }}/>
              <small>同时影响花冠与书写粒子的密度</small>
            </label>
            <label className="bloom-setting">
              <span><b>粒子大小</b><output>{particleSize.toFixed(1)}×</output></span>
              <input aria-label="粒子大小" type="range" min="0.5" max="2.0" step="0.1" value={particleSize} onChange={event=>{
                const next=Number(event.target.value);particleSizeRef.current=next;setParticleSize(next);setQualityPreset('custom');
              }}/>
              <small>控制光点颗粒感和扩散范围</small>
            </label>
            <label className="bloom-setting">
              <span><b>光晕强度</b><output>{glowIntensity.toFixed(1)}×</output></span>
              <input aria-label="光晕强度" type="range" min="0.4" max="1.6" step="0.1" value={glowIntensity} onChange={event=>{
                const next=Number(event.target.value);glowIntensityRef.current=next;setGlowIntensity(next);setQualityPreset('custom');
              }}/>
              <small>调整柔光、亮点与层次感</small>
            </label>
          </div>
          <div className="bloom-settings-footer">
            <span>刷新上限</span>
            <div className="bloom-setting-fps" role="group" aria-label="刷新上限">
              {([30,60,90,120,0] as FpsLimit[]).map(value=><button type="button" key={value} className={fpsLimit===value?'active':''} onClick={()=>{fpsLimitRef.current=value;setFpsLimit(value);setQualityPreset('custom')}}>{value===0?'自动':value}</button>)}
            </div>
            <small>{actualFps} FPS</small>
          </div>
          <div className="bloom-settings-footer bloom-orientation-row">
            <span>画面构图</span>
            <div className="bloom-setting-fps" role="group" aria-label="画面构图">
              <button type="button" className={layoutOrientation==='portrait'?'active':''} onClick={()=>void changeOrientation('portrait')}>竖屏</button>
              <button type="button" className={layoutOrientation==='landscape'?'active':''} onClick={()=>void changeOrientation('landscape')}>横屏</button>
            </div>
          </div>
          <div className="bloom-start-actions">
            <button className="bloom-primary bloom-immersive-start" onClick={()=>void startCamera('flower')} disabled={loading}>
              {loading?'正在准备沉浸空间…':'沉浸式开始'}<span>进入全屏互动</span>
            </button>
            <button className="bloom-secondary bloom-preview-start" onClick={()=>setExperienceMode('demo')} disabled={loading}>先看粒子预览</button>
          </div>
          <button type="button" className="bloom-air-ink-launch" onClick={()=>void startCamera('write')} disabled={loading}>
            <span className="bloom-air-ink-icon">✧</span>
            <span><b>单独进入空中书写</b><small>独立书写空间 · 不与花苞动画联动</small></span>
            <span className="bloom-air-ink-arrow">↗</span>
          </button>
          <div className="bloom-privacy">摄像头与手势数据只在本地浏览器处理，不会上传</div>
          {error&&<div className="bloom-error" role="alert">{error}</div>}
        </section>
      )}
      {experienceStarted&&<div className="bloom-side-note">循光而行 · LET THE LIGHT BLOOM</div>}
      {experienceStarted&&<footer className="bloom-steps">
        <div><b>01</b><span>握拳·闭合</span></div><i />
        <div><b>02</b><span>张掌·绽放</span></div><i />
        <div><b>03</b><span>指尖·牵引</span></div>
      </footer>}
      {experienceStarted && experienceTool === 'flower' && <aside className="bloom-hud bloom-bloom-progress">
        <div className="bloom-hud-label">BLOOM PROGRESS <span>/ 花苞绽放</span></div>
        <div className="bloom-hud-state">{statusChinese}</div>
        <div className="bloom-hud-en">{statusEnglish}</div>
        <div className="bloom-hud-number">{openness}<small>%</small></div>
        <div className="bloom-progress"><span style={{width:openness+'%'}} /></div>
        <div className="bloom-hud-meta">{particleCount.toLocaleString()} LIGHT PARTICLES</div>
      </aside>}
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
