import './fx.css';

/**
 * 平滑进度条（动效图鉴 01）：每次拿到真实进度，填充条用 scaleX 位移挪到对应位置，
 * 中间用 600ms cubic-bezier(0.33, 1, 0.68, 1) 过渡补平；正在挪时来了新进度就从此刻接着挪。
 * 绝不造假进度：只显示上传事件给出的真实百分比。
 */
export default function SmoothProgress({ value, label, tone = 'light' }: { value: number; label?: string; tone?: 'light' | 'dark' }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? '上传进度'}>
      <div className="fx-progress-track" style={tone === 'dark' ? { background: 'rgba(255,255,255,.3)' } : undefined}>
        <div className="fx-progress-fill" style={{ transform: `scaleX(${pct / 100})`, background: tone === 'dark' ? '#fff' : undefined }} />
      </div>
      <div style={{ fontSize: 12, color: tone === 'dark' ? '#fff' : '#8a93a1', marginTop: 4, textAlign: tone === 'dark' ? 'center' : undefined }}>{label ?? `上传中 ${pct}%`}</div>
    </div>
  );
}
