/* Dashboard chart primitives. Kept presentational and side-effect free. */
export function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 100, h = 30;
  const vs = data.length > 1 ? data : [0, data[0] ?? 0];
  const max = Math.max(...vs, 1);
  const line = 'M' + vs.map((v, i) => `${((i / (vs.length - 1)) * w).toFixed(1)},${(h - 4 - (v / max) * (h - 10)).toFixed(1)}`).join(' L');
  const gid = 'sp' + color.replace(/[^0-9a-f]/gi, '');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 26, marginTop: 4, display: 'block' }}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity=".4" />
        <stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
export function TrendChart({ data }: { data: number[] }) {
  const w = 300, h = 90;
  const max = Math.max(...data, 1);
  const line = 'M' + data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - 8 - (v / max) * (h - 20)).toFixed(1)}`).join(' L');
  const ly = h - 8 - (data[data.length - 1] / max) * (h - 20);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 90, display: 'block' }}>
      <defs><linearGradient id="dtrend" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5b8cff" stopOpacity=".45" />
        <stop offset="1" stopColor="#5b8cff" stopOpacity="0" />
      </linearGradient></defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill="url(#dtrend)" />
      <path d={line} fill="none" stroke="#5b8cff" strokeWidth="2.5" />
      <circle cx={w} cy={ly} r="7" fill="#5b8cff33" />
      <circle cx={w} cy={ly} r="4" fill="#5b8cff" />
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
