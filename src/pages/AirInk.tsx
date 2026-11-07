import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PrimeAskCard, { CameraIcon, CameraPrimePreview } from '../components/PrimeAskCard';
import '../styles-air-ink.css';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; liftedAt?: number };
type Candidate = { hanzi: string; score?: number };
type ManagedWorker = Worker & { revokeObjectUrl?: () => void };

// 新版 MediaPipe（Tasks Vision / HandLandmarker），与指尖生花（PR #260）同一套识别层，版本写死避免 CDN 漂移。
// 旧版 @mediapipe/hands 必须靠 WebGL 送帧，部分浏览器建不出 WebGL 就直接崩；
// 新版支持 CPU 推理兜底，建不出 GPU 管线时自动降级，不再报错退出。
const VISION_VERSION = '0.10.14';
const VISION_CDNS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + VISION_VERSION,
  'https://unpkg.com/@mediapipe/tasks-vision@' + VISION_VERSION,
];
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms))]);
}
async function loadVision(base: string) {
  const mod: any = await import(/* @vite-ignore */ base + '/vision_bundle.mjs');
  const fileset = await mod.FilesetResolver.forVisionTasks(base + '/wasm');
  return { HandLandmarker: mod.HandLandmarker, fileset };
}
const HANZI_BASE = 'https://cdn.jsdelivr.net/gh/gugray/hanzi_lookup@01f90c3ab99a8fadf0696c28e5eb097223c500db/web_demo';
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function createWorker(): ManagedWorker {
  const source = [
    "const base = '" + HANZI_BASE + "';",
    "self.onmessage = async (event) => {",
    " const data = event.data || {};",
    " try {",
    "  if (data.type === 'init') { importScripts(base + '/hanzi_lookup.js'); await self.wasm_bindgen(base + '/hanzi_lookup_bg.wasm'); self.postMessage({ type: 'ready' }); }",
    "  else if (data.type === 'lookup') { const raw = self.wasm_bindgen.lookup(data.strokes, 8); self.postMessage({ type: 'matches', requestId: data.requestId, candidates: JSON.parse(raw) }); }",
    " } catch (error) { self.postMessage({ type: 'error', message: String(error && error.message || error) }); }",
    "};"
  ].join('\n');
  const url = URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
  const worker = new Worker(url) as ManagedWorker;
  let revoked = false;
  worker.revokeObjectUrl = () => { if (!revoked) { URL.revokeObjectURL(url); revoked = true; } };
  worker.addEventListener('message', event => {
    if (event.data?.type === 'ready' || event.data?.type === 'error') worker.revokeObjectUrl?.();
  });
  worker.addEventListener('error', () => worker.revokeObjectUrl?.(), { once: true });
  return worker;
}
function disposeWorker(worker: Worker | null) {
  if (!worker) return;
  (worker as ManagedWorker).revokeObjectUrl?.();
  worker.terminate();
}
function normalizeStrokes(strokes: Stroke[]) {
  const points = strokes.flatMap(stroke => stroke.points);
  if (points.length < 3) return [];
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const scale = 220 / Math.max(1, maxX - minX, maxY - minY);
  const offsetX = (256 - (maxX - minX) * scale) * .5;
  const offsetY = (256 - (maxY - minY) * scale) * .5;
  return strokes.filter(stroke => stroke.points.length > 1).map(stroke =>
    stroke.points.map(p => [Math.round(offsetX + (p.x - minX) * scale), Math.round(offsetY + (p.y - minY) * scale)])
  );
}
function mapPoint(point: any, video: HTMLVideoElement, width: number, height: number): Point {
  const vw = video.videoWidth || width, vh = video.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const dw = vw * scale, dh = vh * scale;
  return { x: (width - dw) / 2 + (1 - point.x) * dw, y: (height - dh) / 2 + point.y * dh };
}
function drawHandPreview(canvas: HTMLCanvasElement | null, landmarks: any[] | null) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks || landmarks.length < 21) return;
  const pts = landmarks.map(p => ({ x: 1 - p.x, y: p.y }));
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
  const rx = Math.max(.08, maxX - minX), ry = Math.max(.08, maxY - minY);
  const scale = Math.min((w - 44) / rx, (h - 34) / ry);
  const ox = (w - rx * scale) / 2 - minX * scale, oy = (h - ry * scale) / 2 - minY * scale;
  const project = (p: Point) => ({ x: ox + p.x * scale, y: oy + p.y * scale });
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,220,236,.72)'; ctx.lineWidth = Math.max(2, w * .009);
  ctx.shadowColor = 'rgba(240,151,194,.45)'; ctx.shadowBlur = 7;
  for (const [a,b] of CONNECTIONS) {
    const p = project(pts[a]), q = project(pts[b]);
    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  pts.forEach((p,i) => {
    const q = project(p); ctx.beginPath(); ctx.arc(q.x,q.y,i===8?4.3:2.6,0,Math.PI*2);
    ctx.fillStyle = i===8 ? '#f5b3d0' : 'rgba(255,245,249,.92)'; ctx.fill();
  });
  ctx.restore();
}
function drawHandSkeleton(ctx: CanvasRenderingContext2D, landmarks: any[] | null, video: HTMLVideoElement | null, width: number, height: number) {
  if (!landmarks || landmarks.length < 21 || !video) return;
  // 主画面骨骼贴手（用户定 2026-11-08）：与笔尖轨迹共用 mapPoint 映射
  // （同一套 cover 对齐 + 镜像），21 个关节点正好落在真手上。
  const pts = landmarks.map(p => mapPoint(p, video, width, height));
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255,220,236,.55)'; ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(240,151,194,.45)'; ctx.shadowBlur = 7;
  for (const [a,b] of CONNECTIONS) {
    const p = pts[a], q = pts[b];
    ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(q.x,q.y); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  pts.forEach((p,i) => {
    ctx.beginPath(); ctx.arc(p.x,p.y,i===8?4:2.4,0,Math.PI*2);
    ctx.fillStyle = i===8 ? '#f5b3d0' : 'rgba(255,245,249,.9)'; ctx.fill();
  });
  ctx.restore();
}

export default function AirInk() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<any>(null);
  const delegateRef = useRef<'GPU' | 'CPU'>('GPU');
  const lastInferenceRef = useRef(0);
  const workerRef = useRef<Worker | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const landmarksRef = useRef<any[] | null>(null);
  const pinchRef = useRef(false);
  const smoothRef = useRef<Point | null>(null);
  const cameraFrameRef = useRef(0);
  const paintFrameRef = useRef(0);
  const recognitionTimerRef = useRef(0);
  const recognitionRequestRef = useRef(0);
  const workerReadyRef = useRef(false);
  const recognitionBusyRef = useRef(false);
  const runningRef = useRef(false);
  const startGuardRef = useRef(false);
  const candidatesRef = useRef<Candidate[]>([]);
  const recognizedTextRef = useRef('');
  const candidatePageRef = useRef(0);
  const gestureTrackRef = useRef<{ finger: number; since: number; fired: boolean }>({ finger: -1, since: 0, fired: false });
  const gestureHintTimerRef = useRef(0);

  const [active, setActive] = useState(false);
  const [primeOpen, setPrimeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('准备手势识别');
  const [error, setError] = useState('');
  const [hasHand, setHasHand] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [recognitionStatus, setRecognitionStatus] = useState<'idle'|'loading'|'ready'|'error'>('idle');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState('');
  const [recognizedText, setRecognizedText] = useState('');
  const [phase, setPhase] = useState<'idle'|'drawing'|'lifting'|'recognizing'|'candidate'|'unmatched'>('idle');
  const [candidatePage, setCandidatePage] = useState(0);
  const [gestureHint, setGestureHint] = useState('');

  useEffect(() => { candidatesRef.current = candidates; }, [candidates]);
  useEffect(() => { recognizedTextRef.current = recognizedText; }, [recognizedText]);

  const scheduleRecognition = useCallback(() => {
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    setPhase('lifting');
    recognitionTimerRef.current = window.setTimeout(() => {
      if (!workerReadyRef.current || recognitionBusyRef.current) {
        if (!workerReadyRef.current) setPhase('unmatched');
        return;
      }
      const normalized = normalizeStrokes(strokesRef.current);
      if (!normalized.length) { setPhase('idle'); return; }
      recognitionBusyRef.current = true;
      setPhase('recognizing');
      const requestId = ++recognitionRequestRef.current;
      workerRef.current?.postMessage({ type: 'lookup', requestId, strokes: normalized, limit: 8 });
    }, 1250);
  }, []);

  const stopCamera = useCallback(() => {
    runningRef.current = false;
    if (cameraFrameRef.current) cancelAnimationFrame(cameraFrameRef.current);
    cameraFrameRef.current = 0;
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    recognitionTimerRef.current = 0;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (landmarkerRef.current) { try { landmarkerRef.current.close(); } catch { /* shutdown */ } landmarkerRef.current = null; }
    disposeWorker(workerRef.current);
    workerRef.current = null;
    workerReadyRef.current = false;
    recognitionBusyRef.current = false;
    pinchRef.current = false;
    currentStrokeRef.current = null;
    smoothRef.current = null;
    landmarksRef.current = null;
    setIsWriting(false);
    setHasHand(false);
    setRecognitionStatus('idle');
    setActive(false);
  }, []);

  const flashGestureHint = useCallback((text: string) => {
    setGestureHint(text);
    if (gestureHintTimerRef.current) window.clearTimeout(gestureHintTimerRef.current);
    gestureHintTimerRef.current = window.setTimeout(() => setGestureHint(''), 1600);
  }, []);
  // 手势开关（用户定 2026-11-08）：拇指碰中指=撤销、碰无名指=换一批候选字、碰小指=清空。
  // 三个动作都只走 ref + 函数式 setState，不依赖渲染闭包，推理循环里调用也安全。
  const gestureUndo = useCallback(() => {
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    recognitionRequestRef.current += 1; recognitionBusyRef.current = false;
    if (strokesRef.current.length) { strokesRef.current.pop(); flashGestureHint('已撤销一笔'); }
    else if (recognizedTextRef.current) { setRecognizedText(value => value.slice(0, -1)); flashGestureHint('已删掉一个字'); }
    else { flashGestureHint('没有可撤销的了'); return; }
    currentStrokeRef.current = null; pinchRef.current = false; smoothRef.current = null;
    setIsWriting(false); setSelected(''); setCandidates([]); setCandidatePage(0); candidatePageRef.current = 0; setPhase('idle');
  }, [flashGestureHint]);
  const gestureClear = useCallback(() => {
    if (!strokesRef.current.length && !candidatesRef.current.length && !recognizedTextRef.current) { flashGestureHint('已经是空的了'); return; }
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    recognitionRequestRef.current += 1; recognitionBusyRef.current = false;
    strokesRef.current = []; currentStrokeRef.current = null; pinchRef.current = false; smoothRef.current = null;
    setIsWriting(false); setSelected(''); setCandidates([]); setCandidatePage(0); candidatePageRef.current = 0; setPhase('idle'); setRecognizedText('');
    flashGestureHint('已清空');
  }, [flashGestureHint]);
  const nextCandidateBatch = useCallback(() => {
    const total = candidatesRef.current.length;
    if (total <= 4) { flashGestureHint(total ? '没有更多候选字了' : '先写个字，识别后能换一批'); return; }
    const pages = Math.ceil(total / 4);
    candidatePageRef.current = (candidatePageRef.current + 1) % pages;
    setCandidatePage(candidatePageRef.current);
    flashGestureHint(`已换一批候选字 · 第 ${candidatePageRef.current + 1} 批`);
  }, [flashGestureHint]);

  const startCamera = useCallback(async () => {
    if (startGuardRef.current || loading) return;
    startGuardRef.current = true;
    setLoading(true); setProgress(5); setStage('准备手势识别'); setError('');
    setRecognitionStatus('loading'); setCandidates([]); setCandidatePage(0); candidatePageRef.current = 0; setSelected(''); setRecognizedText('');
    strokesRef.current = []; currentStrokeRef.current = null; pinchRef.current = false; smoothRef.current = null;
    try {
      // 先建识别器再开摄像头：两个资源源 × GPU/CPU 两种推理方式依次尝试，
      // GPU 建不出来（WebGL 不可用）时自动落到 CPU，不再直接失败（同指尖生花 #260）。
      setStage('正在加载手部识别库'); setProgress(14);
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
                minHandDetectionConfidence: .62,
                minHandPresenceConfidence: .5,
                minTrackingConfidence: .58,
              }), MODEL_TIMEOUT_MS, '识别器初始化超时');
              delegateRef.current = delegate;
              break;
            } catch (e) { lastError = e; }
          }
          if (landmarker) break;
        } catch (e) { lastError = e; }
      }
      if (!landmarker) throw new Error('手部识别初始化失败' + (lastError?.message ? '：' + lastError.message : '') + '。请检查网络后重试。');
      landmarkerRef.current = landmarker;
      setProgress(32);
      try {
        const worker = createWorker();
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent) => {
          const message = event.data || {};
          if (message.type === 'ready') { workerReadyRef.current = true; setRecognitionStatus('ready'); }
          else if (message.type === 'matches') {
            recognitionBusyRef.current = false;
            if (message.requestId !== recognitionRequestRef.current) return;
            const matches = (message.candidates || []).filter((item: any) => item && typeof item.hanzi === 'string').slice(0,8) as Candidate[];
            setCandidates(matches); setCandidatePage(0); candidatePageRef.current = 0; setSelected(matches[0]?.hanzi || '');
            setPhase(matches.length ? 'candidate' : 'unmatched');
          } else if (message.type === 'error') {
            recognitionBusyRef.current = false; workerReadyRef.current = false;
            setRecognitionStatus('error'); setPhase('unmatched');
          }
        };
        worker.onerror = () => { workerReadyRef.current = false; recognitionBusyRef.current = false; setRecognitionStatus('error'); setPhase('unmatched'); };
        worker.postMessage({ type: 'init' });
      } catch { setRecognitionStatus('error'); }

      setStage('等待摄像头授权'); setProgress(48);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头，或页面不是 HTTPS 安全连接。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:'user', width:{ideal:640, max:960}, height:{ideal:480, max:540}, frameRate:{ideal:30, max:30} } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('摄像头画面容器尚未准备好。');
      setStage('正在启动摄像头'); setProgress(68);
      video.srcObject = stream; await video.play();

      const releaseStroke = () => {
        if (!pinchRef.current) return;
        pinchRef.current = false;
        if (currentStrokeRef.current) currentStrokeRef.current.liftedAt = performance.now()/1000;
        currentStrokeRef.current = null; smoothRef.current = null; setIsWriting(false); scheduleRecognition();
      };
      const handleHand = (hand: any[] | null) => {
        if (!hand || hand.length < 21) { landmarksRef.current = null; releaseStroke(); setHasHand(false); gestureTrackRef.current.finger = -1; gestureTrackRef.current.fired = false; return; }
        landmarksRef.current = hand; setHasHand(true);
        const palm = Math.max(.001, distance(hand[0],hand[9]));
        const point = mapPoint(hand[8],video,window.innerWidth,window.innerHeight);
        const pinchRatio = distance(hand[4],hand[8])/palm;
        const drawing = pinchRef.current ? pinchRatio < .48 : pinchRatio < .34;
        if (!drawing) {
          releaseStroke();
          // 手势开关：没在写字时，拇指贴住中指/无名指/小指并保持约 0.22 秒触发一次；
          // 触发后必须三根手指都松开（比值回到 .48 以上）才重新待命，防连发与误触；
          // 两根手指同时贴近（分不出是哪根）时不触发。
          const now = performance.now();
          const ratios = [distance(hand[4],hand[12])/palm, distance(hand[4],hand[16])/palm, distance(hand[4],hand[20])/palm];
          const track = gestureTrackRef.current;
          if (ratios.every(r => r > .48)) { track.finger = -1; track.fired = false; }
          else if (!track.fired) {
            let best = -1, bestRatio = .34;
            ratios.forEach((r, i) => { if (r < bestRatio) { bestRatio = r; best = i; } });
            const ambiguous = best >= 0 && ratios.some((r, i) => i !== best && r < bestRatio + .06);
            if (best < 0 || ambiguous) track.finger = -1;
            else if (track.finger !== best) { track.finger = best; track.since = now; }
            else if (now - track.since >= 220) {
              track.fired = true;
              if (best === 0) gestureUndo(); else if (best === 1) nextCandidateBatch(); else gestureClear();
            }
          }
          return;
        }
        gestureTrackRef.current.finger = -1;
        const previous = smoothRef.current;
        const smooth = previous ? { x:previous.x+(point.x-previous.x)*.48, y:previous.y+(point.y-previous.y)*.48 } : point;
        if (!pinchRef.current) {
          setSelected(''); setCandidates([]);
          pinchRef.current = true; recognitionRequestRef.current += 1; recognitionBusyRef.current = false;
          if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
          setPhase('drawing'); setCandidates([]); setCandidatePage(0); candidatePageRef.current = 0;
          const stroke:Stroke = { points:[smooth] }; strokesRef.current.push(stroke); currentStrokeRef.current = stroke; setIsWriting(true);
        } else if (currentStrokeRef.current) {
          const points = currentStrokeRef.current.points;
          if (!points.length || distance(smooth,points[points.length-1]) > 1.2) points.push(smooth);
        }
        smoothRef.current = smooth;
      };
      setStage('正在初始化手势模型'); setProgress(86);
      if (video.readyState >= 2) {
        try { landmarker.detectForVideo(video, performance.now()); } catch { /* 首帧失败不拦截，交给循环里的连续失败计数处理 */ }
      }
      setStage('手势识别已就绪'); setProgress(100); setActive(true); setLoading(false);
      runningRef.current = true;
      let lastVideoTime = -1;
      let failures = 0;
      const process = () => {
        const currentVideo = videoRef.current;
        if (!runningRef.current || !currentVideo || !landmarkerRef.current) return;
        // CPU 推理更吃力，帧率放低一档；GPU 保持原节奏（同指尖生花 #260）。
        const interval = delegateRef.current === 'CPU' ? 1000 / 20 : 1000 / 24;
        if (!document.hidden && currentVideo.readyState >= 2 && currentVideo.currentTime !== lastVideoTime && performance.now() - lastInferenceRef.current >= interval) {
          lastVideoTime = currentVideo.currentTime; lastInferenceRef.current = performance.now();
          try {
            const res = landmarkerRef.current.detectForVideo(currentVideo, performance.now());
            handleHand(res?.landmarks?.[0] || null);
            failures = 0;
          } catch {
            failures++;
            if (failures >= 3) { setError('手部识别连续失败，请重新开启空中书写。'); stopCamera(); return; }
          }
        }
        if (runningRef.current) cameraFrameRef.current = requestAnimationFrame(process);
      };
      cameraFrameRef.current = requestAnimationFrame(process);
    } catch (cause:any) {
      stopCamera();
      setError(cause?.message || '摄像头启动失败，请检查浏览器权限。');
      setLoading(false);
    } finally { startGuardRef.current = false; }
  }, [loading, scheduleRecognition, stopCamera]);

  const clearCharacter = useCallback(() => {
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    recognitionRequestRef.current += 1; recognitionBusyRef.current = false;
    strokesRef.current = []; currentStrokeRef.current = null; pinchRef.current = false; smoothRef.current = null;
    setIsWriting(false); setSelected(''); setCandidates([]); setCandidatePage(0); candidatePageRef.current = 0; setPhase('idle');
  }, []);
  const confirmCharacter = () => { if (selected) { setRecognizedText(value=>value+selected); clearCharacter(); } };
  const undo = () => {
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    recognitionRequestRef.current += 1; recognitionBusyRef.current = false;
    if (strokesRef.current.length) strokesRef.current.pop();
    else if (recognizedText) setRecognizedText(value=>value.slice(0,-1));
    currentStrokeRef.current = null; pinchRef.current = false; smoothRef.current = null;
    setIsWriting(false); setSelected(''); setCandidates([]); setCandidatePage(0); candidatePageRef.current = 0; setPhase('idle');
  };
  const savePng = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png');
    link.download = '指尖生花-空中书写作品.png'; link.click();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    let width = window.innerWidth, height = window.innerHeight, ratio = Math.min(window.devicePixelRatio||1,2);
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight; ratio = Math.min(window.devicePixelRatio||1,2);
      if (canvas) { canvas.width=Math.round(width*ratio); canvas.height=Math.round(height*ratio); canvas.style.width=width+'px'; canvas.style.height=height+'px'; }
    };
    resize();
    const render = () => {
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,width,height);
        const time = performance.now()/1000;
        drawHandSkeleton(ctx, landmarksRef.current, videoRef.current, width, height);
        strokesRef.current.forEach((stroke) => {
          const points = stroke.points; if (!points.length) return;
          const lifted = stroke.liftedAt !== undefined;
          ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=lifted?.88:1;
          ctx.lineCap='round'; ctx.lineJoin='round';
          const first=points[0],last=points[points.length-1];
          const gradient=ctx.createLinearGradient(first.x,first.y,last.x,last.y);
          gradient.addColorStop(0,'rgba(255,229,205,.92)'); gradient.addColorStop(.52,'rgba(247,173,206,.96)'); gradient.addColorStop(1,'rgba(240,128,179,.9)');
          ctx.strokeStyle=gradient; ctx.lineWidth=2.4; ctx.shadowColor='rgba(244,145,190,.72)'; ctx.shadowBlur=13;
          ctx.beginPath(); ctx.moveTo(first.x,first.y);
          for(let i=1;i<points.length-1;i++){const p=points[i],n=points[i+1];ctx.quadraticCurveTo(p.x,p.y,(p.x+n.x)*.5,(p.y+n.y)*.5);}
          ctx.lineTo(last.x,last.y); ctx.stroke(); ctx.shadowBlur=0;
          // 笔迹定在原地（用户定：写出的字不要飘）：亮点只在笔画原位置闪烁，
          // 不再整体上升、也不再上下左右飘移。
          if(lifted) for(let i=0;i<points.length;i+=3){
            const p=points[i],phase=time*1.2+i*.37;
            ctx.globalAlpha=.25+(0.5+0.5*Math.sin(phase))*.42;
            ctx.fillStyle='rgba(255,231,241,.95)'; ctx.beginPath();
            ctx.arc(p.x,p.y,.7+(i%4)*.15,0,Math.PI*2); ctx.fill();
          }
          ctx.restore();
        });
      }
      drawHandPreview(previewRef.current,landmarksRef.current);
      paintFrameRef.current=requestAnimationFrame(render);
    };
    paintFrameRef.current=requestAnimationFrame(render);
    window.addEventListener('resize',resize);
    return () => { cancelAnimationFrame(paintFrameRef.current); window.removeEventListener('resize',resize); };
  }, []);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const exit = () => { stopCamera(); navigate('/particle-flower'); };

  // 先弹说明卡讲清用途，点「好的」才真正调起系统摄像头询问；已授权过则直接开
  async function askStart() {
    try {
      const p = await navigator.permissions?.query({ name: 'camera' as PermissionName });
      if (p?.state === 'granted') { void startCamera(); return; }
    } catch { /* 查不到权限状态就走说明卡 */ }
    setPrimeOpen(true);
  }

  return <main className="air-ink-page">
    <video ref={videoRef} className="air-ink-camera" playsInline muted />
    <canvas ref={canvasRef} className="air-ink-canvas" aria-label="粒子空中笔迹" />
    <div className="air-ink-vignette" />
    <header className="air-ink-header">
      <div><h1>空中书写</h1><p>捏合拇指与食指开始书写；拇指碰中指撤销、碰无名指换一批候选字、碰小指清空（贴住约半秒生效）。</p></div>
      <button type="button" className="air-ink-exit" onClick={exit}>× <span>退出</span></button>
    </header>
    {!active && !loading && <section className="air-ink-start">
      <div className="air-ink-start-mark">✧</div><h2>让笔迹，留在光里。</h2>
      <p>摄像头与笔迹识别仅在当前浏览器本地运行，不会把手写轨迹上传到网站。</p>
      <button type="button" className="air-ink-primary" onClick={() => void askStart()}>开启空中书写</button>
      {error && <div className="air-ink-error" role="alert">{error}</div>}
      <div className="air-ink-hint">需要允许摄像头权限 · 建议使用系统浏览器</div>
    </section>}
    {loading && <section className="air-ink-loading" role="status" aria-live="polite">
      <div className="air-ink-loader">✧</div><b>{stage}</b><div className="air-ink-load-track"><span style={{width:progress+'%'}} /></div><small>{progress}%</small>
    </section>}
    {active && <>
      <section className="air-ink-toolbar" aria-label="手写工具栏">
        <div className={'air-ink-status'+(isWriting?' drawing':'')}><i/><span>{isWriting?'正在书写 · 松开让笔迹定住':!hasHand?'等待手部进入画面':'捏合开始书写'}</span>
          <small>{phase==='drawing'?'保持捏合，连续写完当前笔画':phase==='lifting'?'笔迹正在定形…':phase==='recognizing'?'正在分析手写字形…':phase==='candidate'?'选择正确候选字并确认':phase==='unmatched'?'暂未匹配，请继续书写或重写':recognitionStatus==='ready'?'识字已就绪 · 支持多笔画':recognitionStatus==='error'?'识字暂不可用，粒子手写仍可使用':'识字模型准备中'}</small>
        </div>
        {gestureHint&&<div className="air-ink-gesture-hint" role="status">{gestureHint}</div>}
        {candidates.length>0&&<div className="air-ink-candidates"><span>候选</span>{candidates.slice(candidatePage*4,candidatePage*4+4).map(item=><button type="button" key={item.hanzi} className={selected===item.hanzi?'selected':''} onClick={()=>setSelected(item.hanzi)}>{item.hanzi}</button>)}{candidates.length>4&&<button type="button" className="air-ink-more" onClick={nextCandidateBatch}>换一批</button>}</div>}
        {selected&&<button type="button" className="air-ink-confirm" onClick={confirmCharacter}>确认这个字</button>}
        <button type="button" onClick={clearCharacter}>重新书写</button><button type="button" onClick={undo}>撤销</button>
        <button type="button" onClick={()=>{clearCharacter();setRecognizedText('');}}>清空</button>
        <button type="button" className="air-ink-save" onClick={savePng}>保存 PNG</button>
        {recognizedText&&<div className="air-ink-result"><small>已确认</small><strong>{recognizedText}</strong></div>}
      </section>
      <aside className="air-ink-hand-card" aria-label="实时手势识别">
        <div className="air-ink-hand-heading"><b>手势模型</b><small>21 POINTS</small></div>
        <canvas ref={previewRef} className="air-ink-hand-canvas" width={220} height={190} aria-label="实时手部骨骼"/>
        <div className={'air-ink-hand-state'+(hasHand?' detected':'')}><i/>{hasHand?'已识别 · 食指追踪中':'等待识别手部'}</div>
      </aside>
      <div className="air-ink-bottom-note">原始手写轨迹保持不变 · 粒子仅作为视觉效果</div>
    </>}
    <PrimeAskCard
      open={primeOpen}
      icon={<CameraIcon />}
      title="空中书写要用一下摄像头"
      desc="摄像头只用来认你的手势，画面就在这台手机上处理——不录像、不上传。点「好的」之后，浏览器会再正式问你一次。"
      preview={<CameraPrimePreview />}
      confirmText="好的，开启摄像头"
      onConfirm={() => { setPrimeOpen(false); void startCamera(); }}
      onCancel={() => setPrimeOpen(false)}
    />
  </main>;
}
