/* Dashboard chart primitives. Kept presentational and side-effect free.
   STEP 6 (Flux rebuild polish): the lines draw in, the bars grow from
   the baseline and the trend end-dot pops — plain framer-motion, no new
   dependency. Durations follow DESIGN.md §6 (panel transitions
   200–320ms, no overshoot, easeOut). Under prefers-reduced-motion
   everything renders in its final state at once. */
import { motion, useReducedMotion } from 'framer-motion';

export function Spark({ data, color }: { data: number[]; color: string }) {
  const reduce = useReducedMotion();
  const w = 100, h = 30;
  const vs = data.length > 1 ? data : [0, data[0] ?? 0];
  const max = Math.max(...vs, 1);
  const line = 'M' + vs.map((v, i) => `${((i / (vs.length - 1)) * w).toFixed(1)},${(h - 4 - (v / max) * (h - 10)).toFixed(1)}`).join(' L');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 26, marginTop: 4, display: 'block' }}>
      <motion.path d={`${line} L${w},${h} L0,${h} Z`} fill={color} fillOpacity=".1"
        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3, ease: 'easeOut' }} />
      <motion.path d={line} fill="none" stroke={color} strokeWidth="2"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }} />
    </svg>
  );
}
export function SparkBars({ data, color }: { data: number[]; color: string }) {
  const reduce = useReducedMotion();
  const w = 100, h = 30;
  const vs = data.length > 1 ? data : [0, data[0] ?? 0];
  const max = Math.max(...vs, 1);
  const bw = w / vs.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 26, marginTop: 4, display: 'block' }}>
      {vs.map((v, i) => {
        const bh = v > 0 ? Math.max((v / max) * (h - 6), 2) : 0;
        return <motion.rect key={i} x={(i * bw + 1).toFixed(1)} y={(h - bh).toFixed(1)} width={Math.max(bw - 2, 1)} height={bh} rx="1.5" fill={color} fillOpacity={i === vs.length - 1 ? .9 : .55}
          style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
          initial={reduce ? false : { scaleY: 0 }} animate={{ scaleY: 1 }}
          transition={{ duration: 0.35, delay: i * 0.02, ease: 'easeOut' }} />;
      })}
    </svg>
  );
}
export function TrendChart({ data }: { data: number[] }) {
  const reduce = useReducedMotion();
  const w = 300, h = 90;
  const max = Math.max(...data, 1);
  const line = 'M' + data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 8 - (v / max) * (h - 20)).toFixed(1)}`).join(' L');
  const ly = h - 8 - (data[data.length - 1] / max) * (h - 20);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 90, display: 'block' }}>
      <motion.path d={`${line} L${w},${h} L0,${h} Z`} fill="#22314a" fillOpacity=".08"
        initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4, ease: 'easeOut' }} />
      <motion.path d={line} fill="none" stroke="#22314a" strokeWidth="2.5"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }} />
      <motion.circle cx={w} cy={ly} r="7" fill="#22314a2e"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }}
        transition={{ duration: 0.25, delay: 0.6, ease: 'easeOut' }} />
      <motion.circle cx={w} cy={ly} r="4" fill="#22314a"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }}
        transition={{ duration: 0.25, delay: 0.65, ease: 'easeOut' }} />
    </svg>
  );
}
export function Donut({ segs }: { segs: { label: string; v: number; color: string }[] }) {
  const C = 2 * Math.PI * 38;
  const tot = segs.reduce((a, s) => a + s.v, 0) || 1;
  let off = 0;
  const arcs = segs.map(s => {
    const len = (s.v / tot) * C;
    const el = (
      <circle key={s.label} cx="50" cy="50" r="38" fill="none" stroke={s.color}
        strokeWidth="16" strokeDasharray={`${Math.max(len - 2.5, 0.1)} ${C}`}
        strokeDashoffset={-off} strokeLinecap="round" transform="rotate(-90 50 50)" />
    );
    off += len;
    return el;
  });
  return (
    <svg viewBox="0 0 100 100" style={{ width: 96, height: 96, flex: '0 0 auto' }}>
      <circle cx="50" cy="50" r="38" fill="none" stroke="#232b45" strokeWidth="16" />
      {arcs}
      <text x="50" y="56" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="800">{tot}</text>
    </svg>
  );
}
