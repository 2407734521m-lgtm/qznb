import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles-air-ink.css';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; liftedAt?: number };
type Candidate = { hanzi: string; score?: number };
type ManagedWorker = Worker & { revokeObjectUrl?: () => void };

const HANDS_CDNS = ['https://cdn.jsdelivr.net/npm/@mediapipe/hands', 'https://unpkg.com/@mediapipe/hands'];
const HANZI_BASE = 'https://cdn.jsdelivr.net/gh/gugray/hanzi_lookup@01f90c3ab99a8fadf0696c28e5eb097223c500db/web_demo';
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function loadScript(src: string, timeoutMs = 12000) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-air-ink-src="' + src + '"]') as HTMLScriptElement | null;
    if (existing?.dataset.loaded === '1') { resolve(); return; }
    const script = existing || document.createElement('script');
    let settled = false;
    let timer = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (error) reject(error); else resolve();
    };
    const onLoad = () => { script.dataset.loaded = '1'; finish(); };
    const onError = () => finish(new Error('手势识别脚本加载失败'));
    timer = window.setTimeout(() => {
      if (!existing) script.remove();
      finish(new Error('手势识别脚本加载超时'));
    }, timeoutMs);
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!existing) {
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.airInkSrc = src;
      document.head.appendChild(script);
    }
  });
}

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

export default function AirInk() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handsRef = useRef<any>(null);
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

  const [active, setActive] = useState(false);
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
    if (handsRef.current) { try { void handsRef.current.close(); } catch { /* shutdown */ } handsRef.current = null; }
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

  const startCamera = useCallback(async () => {
    if (startGuardRef.current || loading) return;
    startGuardRef.current = true;
    setLoading(true); setProgress(5); setStage('准备手势识别'); setError('');
    setRecognitionStatus('loading'); setCandidates([]); setSelected(''); setRecognizedText('');
    strokesRef.current = []; currentStrokeRef.current = null; pinchRef.current = false; smoothRef.current = null;
    try {
      let activeCdn = HANDS_CDNS[0];
      if (!(window as any).Hands) {
        setStage('正在下载手势识别脚本'); setProgress(14);
        let loaded = false;
        for (const cdn of HANDS_CDNS) {
          try { await loadScript(cdn + '/hands.js'); activeCdn = cdn; loaded = true; break; }
          catch { /* fallback CDN */ }
        }
        if (!loaded) throw new Error('手势模型加载失败。请检查网络，或使用系统浏览器重新打开。');
      }
      setProgress(28);
      try {
        const worker = createWorker();
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent) => {
          const message = event.data || {};
          if (message.type === 'ready') { workerReadyRef.current = true; setRecognitionStatus('ready'); }
          else if (message.type === 'matches') {
            recognitionBusyRef.current = false;
            if (message.requestId !== recognitionRequestRef.current) return;
            const matches = (message.candidates || []).filter((item: any) => item && typeof item.hanzi === 'string').slice(0,5) as Candidate[];
            setCandidates(matches); setSelected(matches[0]?.hanzi || '');
            setPhase(matches.length ? 'candidate' : 'unmatched');
          } else if (message.type === 'error') {
            recognitionBusyRef.current = false; workerReadyRef.current = false;
            setRecognitionStatus('error'); setPhase('unmatched');
          }
        };
        worker.onerror = () => { workerReadyRef.current = false; recognitionBusyRef.current = false; setRecognitionStatus('error'); setPhase('unmatched'); };
        worker.postMessage({ type: 'init' });
      } catch { setRecognitionStatus('error'); }

      setStage('等待摄像头授权'); setProgress(42);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头，或页面不是 HTTPS 安全连接。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio:false, video:{ facingMode:'user', width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30,max:30} } });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('摄像头画面容器尚未准备好。');
      setStage('正在启动摄像头'); setProgress(62);
      video.srcObject = stream; await video.play();
      const HandsCtor = (window as any).Hands;
      if (!HandsCtor) throw new Error('手部模型加载完成，但初始化失败。');
      const hands = new HandsCtor({ locateFile:(file:string)=>activeCdn+'/'+file });
      hands.setOptions({ maxNumHands:1, modelComplexity:1, minDetectionConfidence:.62, minTrackingConfidence:.58 });

      const releaseStroke = () => {
        if (!pinchRef.current) return;
        pinchRef.current = false;
        if (currentStrokeRef.current) currentStrokeRef.current.liftedAt = performance.now()/1000;
        currentStrokeRef.current = null; smoothRef.current = null; setIsWriting(false); scheduleRecognition();
      };
      hands.onResults((results:any) => {
        const hand = results.multiHandLandmarks?.[0];
        if (!hand || hand.length < 21) { landmarksRef.current = null; releaseStroke(); setHasHand(false); return; }
        landmarksRef.current = hand; setHasHand(true);
        const palm = Math.max(.001, distance(hand[0],hand[9]));
        const point = mapPoint(hand[8],video,window.innerWidth,window.innerHeight);
        const pinchRatio = distance(hand[4],hand[8])/palm;
        const drawing = pinchRef.current ? pinchRatio < .48 : pinchRatio < .34;
        if (!drawing) { releaseStroke(); return; }
        const previous = smoothRef.current;
        const smooth = previous ? { x:previous.x+(point.x-previous.x)*.48, y:previous.y+(point.y-previous.y)*.48 } : point;
        if (!pinchRef.current) {
          setSelected(''); setCandidates([]);
          pinchRef.current = true; recognitionRequestRef.current += 1; recognitionBusyRef.current = false;
          if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
          setPhase('drawing'); setCandidates([]);
          const stroke:Stroke = { points:[smooth] }; strokesRef.current.push(stroke); currentStrokeRef.current = stroke; setIsWriting(true);
        } else if (currentStrokeRef.current) {
          const points = currentStrokeRef.current.points;
          if (!points.length || distance(smooth,points[points.length-1]) > 1.2) points.push(smooth);
        }
        smoothRef.current = smooth;
      });
      handsRef.current = hands;
      setStage('正在初始化手势模型'); setProgress(82);
      await Promise.race([
        hands.send({image:video}),
        new Promise((_,reject)=>window.setTimeout(()=>reject(new Error('手部模型初始化超时，请重新进入。')),15000))
      ]);
      setStage('手势识别已就绪'); setProgress(100); setActive(true); setLoading(false);
      runningRef.current = true;
      let busy = false, lastVideoTime = -1;
      const process = async () => {
        const currentVideo = videoRef.current;
        if (!runningRef.current || !currentVideo || !handsRef.current) return;
        if (!busy && currentVideo.readyState >= 2 && currentVideo.currentTime !== lastVideoTime) {
          lastVideoTime = currentVideo.currentTime; busy = true;
          try { await handsRef.current.send({image:currentVideo}); } catch { /* transient frame */ }
          finally { busy = false; }
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
    setIsWriting(false); setSelected(''); setCandidates([]); setPhase('idle');
  }, []);
  const confirmCharacter = () => { if (selected) { setRecognizedText(value=>value+selected); clearCharacter(); } };
  const undo = () => {
    if (recognitionTimerRef.current) window.clearTimeout(recognitionTimerRef.current);
    recognitionRequestRef.current += 1; recognitionBusyRef.current = false;
    if (strokesRef.current.length) strokesRef.current.pop();
    else if (recognizedText) setRecognizedText(value=>value.slice(0,-1));
    currentStrokeRef.current = null; pinchRef.current = false; smoothRef.current = null;
    setIsWriting(false); setSelected(''); setCandidates([]); setPhase('idle');
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
        strokesRef.current.forEach((stroke,index) => {
          const points = stroke.points; if (!points.length) return;
          const lifted = stroke.liftedAt !== undefined;
          const elapsed = lifted ? Math.max(0,time-stroke.liftedAt!) : 0;
          const rise = Math.min(22,elapsed*7.5);
          ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=lifted?.88:1;
          ctx.lineCap='round'; ctx.lineJoin='round';
          const first=points[0],last=points[points.length-1];
          const gradient=ctx.createLinearGradient(first.x,first.y-rise,last.x,last.y-rise);
          gradient.addColorStop(0,'rgba(255,229,205,.92)'); gradient.addColorStop(.52,'rgba(247,173,206,.96)'); gradient.addColorStop(1,'rgba(240,128,179,.9)');
          ctx.strokeStyle=gradient; ctx.lineWidth=2.4; ctx.shadowColor='rgba(244,145,190,.72)'; ctx.shadowBlur=13;
          ctx.beginPath(); ctx.moveTo(first.x,first.y-rise);
          for(let i=1;i<points.length-1;i++){const p=points[i],n=points[i+1];ctx.quadraticCurveTo(p.x,p.y-rise,(p.x+n.x)*.5,(p.y+n.y)*.5-rise);}
          ctx.lineTo(last.x,last.y-rise); ctx.stroke(); ctx.shadowBlur=0;
          if(lifted) for(let i=0;i<points.length;i+=3){
            const p=points[i],phase=time*1.2+i*.37+index*1.9;
            ctx.globalAlpha=.25+(0.5+0.5*Math.sin(phase))*.42;
            ctx.fillStyle='rgba(255,231,241,.95)'; ctx.beginPath();
            ctx.arc(p.x+Math.sin(phase)*2.2,p.y-rise-(Math.sin(phase*.68)+1)*3.8,.7+(i%4)*.15,0,Math.PI*2); ctx.fill();
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

  return <main className="air-ink-page">
    <video ref={videoRef} className="air-ink-camera" playsInline muted />
    <canvas ref={canvasRef} className="air-ink-canvas" aria-label="粒子空中笔迹" />
    <div className="air-ink-vignette" />
    <header className="air-ink-header">
      <div><div className="air-ink-eyebrow">BLOOM AT YOUR FINGERTIPS · AIR INK</div><h1>空中书写</h1><p>捏合拇指与食指开始书写，松开后让笔迹化作上升的光粒子。</p></div>
      <button type="button" className="air-ink-exit" onClick={exit}>× <span>退出</span></button>
    </header>
    {!active && !loading && <section className="air-ink-start">
      <div className="air-ink-start-mark">✧</div><h2>让笔迹，留在光里。</h2>
      <p>摄像头与笔迹识别仅在当前浏览器本地运行，不会把手写轨迹上传到网站。</p>
      <button type="button" className="air-ink-primary" onClick={()=>void startCamera()}>开启空中书写</button>
      {error && <div className="air-ink-error" role="alert">{error}</div>}
      <div className="air-ink-hint">需要允许摄像头权限 · 建议使用系统浏览器</div>
    </section>}
    {loading && <section className="air-ink-loading" role="status" aria-live="polite">
      <div className="air-ink-loader">✧</div><b>{stage}</b><div className="air-ink-load-track"><span style={{width:progress+'%'}} /></div><small>{progress}%</small>
    </section>}
    {active && <>
      <section className="air-ink-toolbar" aria-label="手写工具栏">
        <div className={'air-ink-status'+(isWriting?' drawing':'')}><i/><span>{isWriting?'正在书写 · 松开让笔迹升起':!hasHand?'等待手部进入画面':'捏合开始书写'}</span>
          <small>{phase==='drawing'?'保持捏合，连续写完当前笔画':phase==='lifting'?'粒子正在升起…':phase==='recognizing'?'正在分析手写字形…':phase==='candidate'?'选择正确候选字并确认':phase==='unmatched'?'暂未匹配，请继续书写或重写':recognitionStatus==='ready'?'识字已就绪 · 支持多笔画':recognitionStatus==='error'?'识字暂不可用，粒子手写仍可使用':'识字模型准备中'}</small>
        </div>
        {candidates.length>0&&<div className="air-ink-candidates"><span>候选</span>{candidates.slice(0,4).map(item=><button type="button" key={item.hanzi} className={selected===item.hanzi?'selected':''} onClick={()=>setSelected(item.hanzi)}>{item.hanzi}</button>)}</div>}
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
  </main>;
}
