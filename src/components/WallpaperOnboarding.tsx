import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import bgUrl from '../assets/bg.jpg';
import { getWallpaper, setWallpaper, markOnboarded, GRADIENTS, type Wallpaper } from '../lib/wallpaper';

// 登录后全屏过渡：选壁纸 + 调参数（实时预览）
export default function WallpaperOnboarding({ onDone }: { onDone: () => void }) {
  const [w, setW] = useState<Wallpaper>(getWallpaper);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewBg: React.CSSProperties = w.kind === 'grad'
    ? { background: w.src }
    : { backgroundImage: `url(${w.src === 'default' ? bgUrl : w.src})` };

  function pickUpload(f: File | undefined) {
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, 1080 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * r));
      c.height = Math.max(1, Math.round(img.height * r));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      setW({ ...w, src: c.toDataURL('image/jpeg', 0.82), kind: 'img' });
    };
    img.src = url;
  }

  function done(save: boolean) {
    if (save) setWallpaper(w);
    markOnboarded();
    onDone();
  }

  const thumb = (active: boolean): React.CSSProperties => ({
    width: 56, height: 56, borderRadius: 14, border: active ? '2px solid #fff' : '1px solid #ffffff2e',
    cursor: 'pointer', flexShrink: 0, overflow: 'hidden',
    boxShadow: active ? '0 0 0 2px #ffffffaa, 0 6px 18px #0009' : 'none',
  });

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, overflow: 'hidden' }}
    >
      {/* 实时预览背景 */}
      <div style={{
        position: 'absolute', inset: 0, ...previewBg,
        backgroundSize: 'cover', backgroundPosition: 'center',
        filter: `blur(${w.blur}px) brightness(${100 - w.dark}%)`, transform: 'scale(1.12)',
      }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,transparent 40%,#000a)' }} />

      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.12 }}
        style={{
          position: 'absolute', left: 16, right: 16, bottom: 'max(24px, env(safe-area-inset-bottom))',
          background: 'rgba(16,18,32,.72)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid #ffffff22', borderRadius: 24, padding: 20,
          boxShadow: '0 24px 70px #000c',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800 }}>选一张壁纸</div>
        <div className="mut" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>这是你以后打开班级的样子，随时可以在「我的 → 外观」里换</div>

        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          <div title="默认樱花" onClick={() => setW({ ...w, src: 'default', kind: 'img' })}
            style={{ ...thumb(w.kind === 'img' && w.src === 'default'), backgroundImage: `url(${bgUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          {GRADIENTS.map((g, i) => (
            <div key={i} title={'渐变 ' + (i + 1)} onClick={() => setW({ ...w, src: g, kind: 'grad' })}
              style={{ ...thumb(w.kind === 'grad' && w.src === g), background: g }} />
          ))}
          <div title="上传自己的" onClick={() => fileRef.current?.click()}
            style={{ ...thumb(w.kind === 'img' && w.src !== 'default'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff', background: '#ffffff14' }}>＋</div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { pickUpload(e.target.files?.[0]); e.target.value = ''; }} />

        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <div className="row"><span style={{ width: 44, fontSize: 13 }}>模糊</span>
            <input type="range" min={0} max={24} value={w.blur} onChange={e => setW({ ...w, blur: +e.target.value })} style={{ flex: 1 }} />
            <span className="mut" style={{ width: 30, textAlign: 'right', fontSize: 12 }}>{w.blur}</span></div>
          <div className="row"><span style={{ width: 44, fontSize: 13 }}>暗度</span>
            <input type="range" min={0} max={85} value={w.dark} onChange={e => setW({ ...w, dark: +e.target.value })} style={{ flex: 1 }} />
            <span className="mut" style={{ width: 30, textAlign: 'right', fontSize: 12 }}>{w.dark}</span></div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="ghost" style={{ flex: 1, padding: '12px 0' }} onClick={() => done(false)}>跳过</button>
          <button className="pri" style={{ flex: 2, padding: '12px 0' }} onClick={() => done(true)}>进入班级 →</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
