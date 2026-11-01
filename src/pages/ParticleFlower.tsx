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
  for (let i = 0; i < count; i++) {
    const seed = Math.random() * 1000;
    const angle = Math.random() * Math.PI * 2;
    const depth = Math.random() * 2 - 1;
    // 立体花苞：使用球面采样并对中心区域增加密度。
    const budR = Math.pow(Math.random(), 1.65);
    const budTheta = Math.acos(2 * Math.random() - 1);
    const budX = Math.sin(budTheta) * Math.cos(angle) * budR * 0.24;
    const budY = Math.cos(budTheta) * budR * 0.43;
    const budZ = Math.sin(budTheta) * Math.sin(angle) * budR * 0.12;
    // 参考视频的花冠：以半球穹顶为基底，九组柔和起伏形成层叠花瓣边缘。
    const radial = Math.sqrt(Math.random());
    const petalWave = 0.5 + 0.5 * Math.cos(9 * angle + seed * 0.012);
    const petalEdge = 0.88 + 0.12 * Math.pow(petalWave, 1.35);
    const petalR = radial * petalEdge * 0.50;
    const bloomX = Math.cos(angle) * petalR;
    const bloomY = Math.sin(angle) * petalR * 0.72 - Math.pow(1 - radial, 1.5) * 0.022;
    const bloomZ = Math.sqrt(Math.max(0, 1 - radial * radial)) * 0.16 + depth * 0.025;
    out.push({
      seed, angle, depth, size: 0.55 + Math.random() * 1.35, phase: Math.random() * Math.PI * 2,
      budX, budY, budZ, bloomX, bloomY, bloomZ,
      x: 0, y: 0, vx: 0, vy: 0
    });
  }
  return out;
}
function drawGlowSprite(): HTMLCanvasElement {
  const sprite = document.createElement('canvas'); sprite.width = 64; sprite.height = 64;
  const c = sprite.getContext('2d')!;
  const g = c.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0, 'rgba(255,248,232,1)');
  g.addColorStop(0.12, 'rgba(255,225,238,.92)');
  g.addColorStop(0.34, 'rgba(247,139,187,.34)');
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
  const cameraRafRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const targetRef = useRef(0.18);
  const currentRef = useRef(0.18);
  const velocityRef = useRef(0);
  const fingerRef = useRef<Point | null>(null);
  const landmarksRef = useRef<any[] | null>(null);
  const hasHandRef = useRef(false);
  const pointerRef = useRef<Point | null>(null);
  const pointerDownRef = useRef(false);
  const modeRef = useRef<Mode>('demo');
  const [mode, setMode] = useState<Mode>('demo');
  const [openness, setOpenness] = useState(18);
  const [status, setStatus] = useState('等待手掌');
  const [cameraLive, setCameraLive] = useState(false);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [loading, setLoading] = useState(false);
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
    if (loading) return;
    setError(''); setLoading(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头，或页面不是 HTTPS 安全连接。');
      const w = window as any;
      if (!w.Hands) {
        await loadScript(CDN + '/hands.js');
      }
      const HandsCtor = (window as any).Hands;
      if (!HandsCtor) throw new Error('手部模型未能初始化，请刷新页面重试。');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('摄像头画面容器尚未准备好。');
      video.srcObject = stream;
      await video.play();
      const hands = new HandsCtor({ locateFile: (file: string) => CDN + '/' + file });
      hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.62, minTrackingConfidence: 0.58 });
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
        fingerRef.current = { x: (1-index.x) * window.innerWidth, y: index.y * window.innerHeight, z: index.z || 0 };
        hasHandRef.current = true; setHasHand(true);
      });
      handsRef.current = hands;
      // 首帧 send 会触发 MediaPipe 的 WASM/模型初始化；完成后才撤下唤醒遮罩。
      await hands.send({ image: video });
      modeRef.current = 'gesture'; setMode('gesture');
      setCameraLive(true); setStatus('等待手掌');
      setExperienceStarted(true);
      setLoading(false);
      let busy = false;
      const process = async () => {
        if (!streamRef.current || !videoRef.current || !handsRef.current) return;
        if (!busy && videoRef.current.readyState >= 2) {
          busy = true;
          try { await handsRef.current.send({ image: videoRef.current }); } catch {}
          busy = false;
        }
        cameraRafRef.current = requestAnimationFrame(process);
      };
      cameraRafRef.current = requestAnimationFrame(process);
    } catch (e: any) {
      stopCamera();
      setError(e?.message || '摄像头启动失败。请检查浏览器权限。');
      setLoading(false);
    }
  }, [loading, stopCamera]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!ctx) return;
    let width = 0, height = 0, dpr = 1, lastTime = 0;
    const mobile = window.matchMedia('(max-width: 700px)').matches || navigator.hardwareConcurrency <= 4;
    const count = mobile ? 2200 : 3000;
    particlesRef.current = makeParticles(count);
    setParticleCount(count);
    const sprite = drawGlowSprite();
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.6);
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
      ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    resize();
    const render = (time: number) => {
      rafRef.current = requestAnimationFrame(render);
      if (time - lastTime < (mobile ? 30 : 16)) return;
      const dt = Math.min(0.04, Math.max(0.008, (time-lastTime)/1000 || 0.016));
      lastTime = time;
      const spring = 18, damping = 8.5;
      const accel = (targetRef.current-currentRef.current)*spring - velocityRef.current*damping;
      velocityRef.current += accel*dt;
      currentRef.current = clamp(currentRef.current + velocityRef.current*dt, 0, 1);
      const opennessNow = currentRef.current;
      const now = time * 0.001;
      const cx = width*0.5, cy = height*0.49;
      const scale = Math.min(width,height) * (mobile ? 0.79 : 0.83);
      const finger = modeRef.current === 'gesture' ? fingerRef.current : pointerRef.current;
      // 轻量残影衰减：保留上一帧的光迹，形成指尖牵引的流动感。
      ctx.globalCompositeOperation='destination-out';
      ctx.fillStyle='rgba(0,0,0,.17)'; ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation='source-over';
      // 柔和的环境光晕。
      const halo = ctx.createRadialGradient(cx,cy,scale*0.04,cx,cy,scale*0.78);
      halo.addColorStop(0,'rgba(226,105,161,'+(0.07+opennessNow*0.08)+')');
      halo.addColorStop(1,'rgba(120,50,105,0)');
      ctx.fillStyle = halo; ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation = 'lighter';
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
        const cream=1-normalized, pink=clamp(1-Math.abs(normalized-0.53)*2.05,0,1), edge=normalized;
        const midMix=clamp(normalized*2,0,1), edgeMix=clamp((normalized-.5)*2,0,1);
        const r=Math.round(normalized<.5?lerp(255,247,midMix):lerp(247,231,edgeMix));
        const g=Math.round(normalized<.5?lerp(243,168,midMix):lerp(168,84,edgeMix));
        const b=Math.round(normalized<.5?lerp(214,196,midMix):lerp(196,154,edgeMix));
        const alpha=0.35+cream*0.42+pink*0.18;
        const size=p.size*(0.65+opennessNow*0.4);
        ctx.globalAlpha=alpha;
        ctx.drawImage(sprite,x-size*7,y-size*7,size*14,size*14);
        ctx.fillStyle='rgba('+r+','+g+','+b+',.88)';
        ctx.beginPath(); ctx.arc(x,y,Math.max(.45,size*.72),0,Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over';
      if (landmarksRef.current && modeRef.current==='gesture') drawSkeleton(ctx,landmarksRef.current,width,height);
      if (modeRef.current==='demo') {
        const p=pointerRef.current || {x:cx,y:cy};
        ctx.save(); ctx.strokeStyle='rgba(255,244,235,.75)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(p.x-8,p.y); ctx.lineTo(p.x+8,p.y); ctx.moveTo(p.x,p.y-8); ctx.lineTo(p.x,p.y+8); ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x,p.y,13,0,Math.PI*2); ctx.strokeStyle='rgba(255,244,235,.22)'; ctx.stroke(); ctx.restore();
      }
      if (time-lastHudRef.current>90) {
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

  const statusEnglish = mode==='demo' ? 'DEMO EXPERIENCE' : !hasHand ? 'WAITING FOR HAND' : openness<28 ? 'CLOSED · FIST' : openness>68 ? 'BLOOM · OPEN' : 'OPENING · FLOW';
  const statusChinese = mode==='demo' ? '演示模式' : !hasHand ? '等待手掌' : openness<28 ? '花苞' : openness>68 ? '绽放' : '舒展中';

  return (
    <main className={'bloom-page' + (experienceStarted ? ' is-active' : '')} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
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
        <div className="bloom-hud-state">{statusChinese}</div>
        <div className="bloom-hud-en">{statusEnglish}</div>
        <div className="bloom-hud-number">{openness}<small>%</small></div>
        <div className="bloom-progress"><span style={{width:openness+'%'}} /></div>
        <div className="bloom-hud-meta">{particleCount.toLocaleString()} LIGHT PARTICLES</div>
      </aside>
      <div className="bloom-mode-switch">
        <button className={mode==='gesture'?'active':''} onClick={() => cameraLive ? setExperienceMode('gesture') : void startCamera()}>手势</button>
        <button className={mode==='demo'?'active':''} onClick={() => setExperienceMode('demo')}>演示</button>
      </div>
      {loading && <div className="bloom-loading"><div className="bloom-loader-flower">✿</div><span>正在唤醒手部模型</span><small>INITIALIZING MEDIAPIPE HANDS</small></div>}
    </main>
  );
}
