import { useEffect, useRef, useState } from 'react';

// 头像裁剪：正方形裁剪框，拖动移动，双指/滑杆缩放，确定后输出 512x512 JPEG。
export default function AvatarCropper({ src, onDone, onCancel }:
  { src: string; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState(0);
  const [scale, setScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);

  useEffect(() => {
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = src;
  }, [src]);
  useEffect(() => {
    const measure = () => setSize(boxRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const base = img && size ? Math.max(size / img.naturalWidth, size / img.naturalHeight) : 0;
  const clampOff = (o: { x: number; y: number }, s: number) => {
    if (!img || !size || !base) return o;
    const dw = img.naturalWidth * base * s, dh = img.naturalHeight * base * s;
    const mx = Math.max(0, (dw - size) / 2), my = Math.max(0, (dh - size) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const setScaleClamped = (s: number) => {
    const ns = Math.min(4, Math.max(1, s));
    setScale(ns); setOff(o => clampOff(o, ns));
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: scale };
      drag.current = null;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      setScaleClamped(pinch.current.s * d / pinch.current.d);
    } else if (drag.current && pointers.current.size === 1) {
      setOff(clampOff({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }, scale));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    drag.current = null;
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      drag.current = { x: p.x, y: p.y, ox: off.x, oy: off.y };
    }
  };

  async function confirm() {
    if (!img || !boxRef.current || busy || !base) return;
    setBusy(true);
    try {
      const C = boxRef.current.clientWidth;
      const s = base * scale;
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      const mx = Math.max(0, (dw - C) / 2), my = Math.max(0, (dh - C) / 2);
      const ox = Math.min(mx, Math.max(-mx, off.x)), oy = Math.min(my, Math.max(-my, off.y));
      const sx = (-(C - dw) / 2 - ox) / s, sy = (-(C - dh) / 2 - oy) / s, ss = C / s;
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 512;
      cv.getContext('2d')!.drawImage(img, sx, sy, ss, ss, 0, 0, 512, 512);
      const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/jpeg', 0.92));
      if (blob) onDone(blob);
    } finally { setBusy(false); }
  }

  return (
    <div className="crop-mask" onClick={onCancel}>
      <div className="crop-box" ref={boxRef} onClick={e => e.stopPropagation()}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {img && base > 0 && (
          <img src={src} alt="" draggable={false}
            style={{
              width: img.naturalWidth * base, height: img.naturalHeight * base,
              transform: `translate(-50%,-50%) translate(${off.x}px,${off.y}px) scale(${scale})`,
            }} />
        )}
        <div className="crop-grid"><i /><i /><i /><i /></div>
      </div>
      <div className="crop-bar" onClick={e => e.stopPropagation()}>
        <span>🔍</span>
        <input type="range" min={1} max={4} step={0.01} value={scale}
          onChange={e => setScaleClamped(Number(e.target.value))} />
      </div>
      <div className="crop-bar" style={{ justifyContent: 'center' }} onClick={e => e.stopPropagation()}>
        <button className="ghost" onClick={onCancel}>取消</button>
        <button className="pri" style={{ width: 'auto', padding: '10px 34px' }} disabled={busy || !img} onClick={confirm}>
          {busy ? '处理中…' : '✓ 用这张头像'}
        </button>
      </div>
      <p className="mut" style={{ fontSize: 12, margin: 0 }} onClick={e => e.stopPropagation()}>拖动照片调整位置，双指或滑杆缩放</p>
    </div>
  );
}
