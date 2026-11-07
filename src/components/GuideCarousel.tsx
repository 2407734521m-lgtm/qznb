import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'framer-motion';

// 3 页欢迎引导（2026-11-07 按用户给的交互规格）：像翻一本立体绘本——
// 左右滑动跟手，松手过 1/3 或甩得快就翻页、否则弹回；每页插画慢、标题快（视差层次），
// 插画随翻页缩放淡入；底部圆点指示器当前页拉长成胶囊、滑动时跟手指伸缩过渡；
// 最后一页「开始使用」从下方弹入，前两页右上角有「跳过」。仅首次（本机）展示。

const PAGES = [
  {
    kicker: 'CLASS ARCHIVE · 01',
    title: '成员墙',
    desc: '找到每一位同学，点开看 TA 的性格、爱好、段位和自我介绍。',
  },
  {
    kicker: 'CLASS ARCHIVE · 02',
    title: '日常与动态',
    desc: '发照片、写心情、留评论——班级里的每一天，都被认真记下来。',
  },
  {
    kicker: 'CLASS ARCHIVE · 03',
    title: '表白墙与歌声墙',
    desc: '想说的话、想唱的歌，都可以在这里被听见。',
  },
] as const;

function Illustration({ index }: { index: number }) {
  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,.06)', border: '1px solid rgba(210,225,255,.18)',
    borderRadius: 18, boxShadow: '0 18px 44px rgba(0,0,0,.35)',
  };
  const line = (w: string, o = 0.5): React.CSSProperties => ({
    height: 7, borderRadius: 99, background: `rgba(220,232,255,${o})`, width: w,
  });
  if (index === 0) {
    // 成员墙：三张错落的成员卡
    return (
      <div style={{ position: 'relative', width: 250, height: 210 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            ...card, position: 'absolute', width: 132, padding: '14px 14px 16px',
            left: i * 56, top: i * 26, transform: `rotate(${(i - 1) * 5}deg)`,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: '50%', marginBottom: 10,
              background: ['#8fb4e8', '#e8b48f', '#9fd8b4'][i] }} />
            <div style={{ ...line('72%', 0.75), marginBottom: 7 }} />
            <div style={{ ...line('48%') }} />
          </div>
        ))}
      </div>
    );
  }
  if (index === 1) {
    // 日常：一条带图的动态卡 + 下方评论卡
    return (
      <div style={{ position: 'relative', width: 252, height: 216 }}>
        <div style={{ ...card, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 11 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#8fb4e8' }} />
            <div style={{ ...line('34%', 0.75) }} />
          </div>
          <div style={{ height: 92, borderRadius: 12, marginBottom: 11,
            background: 'linear-gradient(135deg,#33507e,#7d9cc4 55%,#c8d9ee)' }} />
          <div style={{ ...line('82%'), marginBottom: 7 }} />
          <div style={{ ...line('56%') }} />
        </div>
        <div style={{ ...card, position: 'absolute', right: -6, bottom: -12, padding: '9px 13px',
          display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: '#c9d6ee' }}>
          <span>♥ 24</span><span>评论 8</span>
        </div>
      </div>
    );
  }
  // 表白与歌声：信封爱心 + 声波条
  return (
    <div style={{ position: 'relative', width: 250, height: 210 }}>
      <div style={{ ...card, position: 'absolute', left: 6, top: 22, width: 168, height: 112,
        display: 'grid', placeItems: 'center' }}>
        <svg width="52" height="48" viewBox="0 0 52 48" aria-hidden="true">
          <path d="M26 43S4 29.6 4 15.9C4 7.9 10.2 3 16.9 3c3.9 0 7.4 2 9.1 4.6C27.7 5 31.2 3 35.1 3C41.8 3 48 7.9 48 15.9 48 29.6 26 43 26 43Z"
            fill="#e88fa2" />
        </svg>
      </div>
      <div style={{ ...card, position: 'absolute', right: 0, bottom: 8, padding: '13px 16px',
        display: 'flex', alignItems: 'flex-end', gap: 5, height: 64, boxSizing: 'border-box' }}>
        {[16, 28, 38, 24, 33, 18, 27].map((h, i) => (
          <span key={i} style={{ width: 6, height: h, borderRadius: 99, background: '#a9c7ff' }} />
        ))}
      </div>
    </div>
  );
}

function Page({ index, progress, width }: {
  index: number; progress: MotionValue<number>; width: number;
}) {
  const illX = useTransform(progress, v => (v - index) * width * 0.14);
  const titleX = useTransform(progress, v => (v - index) * width * -0.07);
  const illScale = useTransform(progress, v => 1 - Math.min(Math.abs(v - index), 1) * 0.1);
  const illOpacity = useTransform(progress, v => 1 - Math.min(Math.abs(v - index), 1) * 0.3);
  const p = PAGES[index];
  return (
    <div style={{ width, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '0 34px', boxSizing: 'border-box' }}>
      <motion.div style={{ x: illX, scale: illScale, opacity: illOpacity, marginBottom: 40 }}>
        <Illustration index={index} />
      </motion.div>
      <motion.div style={{ x: titleX, textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: '#aabfe8', marginBottom: 12 }}>{p.kicker}</div>
        <h2 style={{ fontSize: 27, margin: '0 0 12px', fontWeight: 750, color: '#f5f7ff' }}>{p.title}</h2>
        <p style={{ color: '#aeb8cc', fontSize: 14, lineHeight: 1.85, margin: 0, maxWidth: 300 }}>{p.desc}</p>
      </motion.div>
    </div>
  );
}

function Dot({ index, progress, onGo }: { index: number; progress: MotionValue<number>; onGo: (i: number) => void }) {
  const w = useTransform(progress, v => 8 + 16 * Math.max(0, 1 - Math.abs(v - index)));
  const o = useTransform(progress, v => 0.35 + 0.65 * Math.max(0, 1 - Math.abs(v - index)));
  return (
    <motion.button type="button" aria-label={`第 ${index + 1} 页`} onClick={() => onGo(index)}
      style={{ width: w, opacity: o, height: 8, borderRadius: 99, border: 0, padding: 0,
        background: '#dce8ff', cursor: 'pointer' }} />
  );
}

export default function GuideCarousel({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const x = useMotionValue(0);
  const progress = useTransform(x, v => (width ? -v / width : 0));

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function go(next: number) {
    const n = Math.max(0, Math.min(PAGES.length - 1, next));
    setPage(n);
    animate(x, -n * width, reduce
      ? { duration: 0.15 }
      : { type: 'spring', stiffness: 300, damping: 32 });
  }

  function onDragEnd(_e: unknown, info: { offset: { x: number }; velocity: { x: number } }) {
    let next = page;
    if (info.offset.x < -width / 3 || info.velocity.x < -450) next = page + 1;
    else if (info.offset.x > width / 3 || info.velocity.x > 450) next = page - 1;
    go(next);
  }

  const last = page === PAGES.length - 1;

  return (
    <div ref={boxRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <AnimatePresence>
        {!last && (
          <motion.button key="skip" type="button" onClick={onDone}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', top: 'calc(14px + env(safe-area-inset-top))', right: 16, zIndex: 5,
              border: '1px solid rgba(210,225,255,.22)', background: 'rgba(255,255,255,.05)',
              color: '#c9d6ee', fontSize: 13, padding: '7px 14px', borderRadius: 999, cursor: 'pointer' }}>
            跳过
          </motion.button>
        )}
      </AnimatePresence>

      {width > 0 && (
        <motion.div
          drag={reduce ? false : 'x'}
          dragConstraints={{ left: -(PAGES.length - 1) * width, right: 0 }}
          dragElastic={0.14}
          onDragEnd={onDragEnd}
          style={{ x, display: 'flex', height: '100%', touchAction: 'pan-y' }}>
          {PAGES.map((_, i) => (
            <Page key={i} index={i} progress={progress} width={width} />
          ))}
        </motion.div>
      )}

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 'calc(104px + env(safe-area-inset-bottom))',
        display: 'flex', justifyContent: 'center', gap: 7, alignItems: 'center' }}>
        {PAGES.map((_, i) => (
          <Dot key={i} index={i} progress={progress} onGo={go} />
        ))}
      </div>

      <div style={{ position: 'absolute', left: 24, right: 24, bottom: 'calc(30px + env(safe-area-inset-bottom))',
        minHeight: 52, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <AnimatePresence mode="wait">
          {last ? (
            <motion.button key="start" type="button" onClick={onDone}
              initial={{ y: 56, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              style={{ width: '100%', maxWidth: 340, padding: 15, border: 0, borderRadius: 999,
                color: '#101521', background: 'linear-gradient(110deg,#dce8ff,#a9c7ff)',
                fontSize: 15, fontWeight: 750, cursor: 'pointer' }}>
              开始使用
            </motion.button>
          ) : (
            <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ color: '#8793aa', fontSize: 12, paddingBottom: 16 }}>
              左右滑动，看看班级里有什么
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
