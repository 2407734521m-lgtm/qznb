import { useEffect, useState } from 'react';

// 把秒数写成中文时长，最多两段（1 天 2 小时、90 秒写成 1 分 30 秒）。
export function formatDisappearingDuration(totalSeconds: number): string {
  const parts: string[] = [];
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小时`);
  if (minutes) parts.push(`${minutes} 分钟`);
  if (seconds || parts.length === 0) parts.push(`${seconds} 秒`);
  return parts.slice(0, 2).join(' ');
}

const MIN_SECONDS = 30;
const MAX_SECONDS = 2592000; // 30 天

type Unit = 'seconds' | 'minutes' | 'hours' | 'days';
const UNITS: { value: Unit; label: string; seconds: number; max: number }[] = [
  { value: 'seconds', label: '秒', seconds: 1, max: 2592000 },
  { value: 'minutes', label: '分钟', seconds: 60, max: 43200 },
  { value: 'hours', label: '小时', seconds: 3600, max: 720 },
  { value: 'days', label: '天', seconds: 86400, max: 30 },
];

// 自定义消失时长：数字 + 单位（站内弹窗，不用原生 <select> / 日期选择器）。
// 打开时按当前时长反推数字和单位（能整除的最大单位，没有当前值时默认 1 小时）。
export default function DisappearingCustomDialog({ open, initialSeconds, onClose, onConfirm }: {
  open: boolean;
  initialSeconds: number | null;
  onClose: () => void;
  onConfirm: (seconds: number) => void;
}) {
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('hours');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    const seconds = initialSeconds ?? 3600;
    const match = [...UNITS].reverse().find(u => seconds % u.seconds === 0);
    if (match) {
      setUnit(match.value);
      setAmount(String(seconds / match.seconds));
    } else {
      setUnit('seconds');
      setAmount(String(seconds));
    }
  }, [open, initialSeconds]);

  if (!open) return null;

  const parsed = Number(amount);
  const totalSeconds = Number.isInteger(parsed) && parsed > 0
    ? parsed * (UNITS.find(u => u.value === unit)?.seconds ?? 1)
    : null;

  function submit() {
    if (totalSeconds === null) {
      setError('请输入一个数字');
      return;
    }
    if (totalSeconds < MIN_SECONDS) {
      setError('最短 30 秒');
      return;
    }
    if (totalSeconds > MAX_SECONDS) {
      setError('最长 30 天');
      return;
    }
    onConfirm(totalSeconds);
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1200, padding: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(20,28,40,.42)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="disappearing-custom-title"
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%', maxWidth: 390, padding: 24, borderRadius: 24,
          background: 'rgba(255,255,255,.96)', border: '1px solid rgba(255,255,255,.86)',
          boxShadow: '0 24px 80px rgba(20,35,55,.18)', color: '#202632',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#7b8492', fontWeight: 800 }}>DISAPPEARING MESSAGES</div>
        <h2 id="disappearing-custom-title" style={{ margin: '8px 0', fontSize: 23 }}>自定义消失时间</h2>
        <p style={{ margin: '0 0 18px', color: '#737b89', fontSize: 13, lineHeight: 1.7 }}>
          填一个数字、选一个单位，消息从发送那一刻起算，到时间就消失。
        </p>
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          <input
            aria-label="时长数字"
            autoFocus
            value={amount}
            onChange={event => { setAmount(event.target.value.replace(/[^0-9]/g, '').slice(0, 7)); setError(''); }}
            onKeyDown={event => { if (event.key === 'Enter') submit(); }}
            inputMode="numeric"
            placeholder="1"
            style={{
              flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '13px 14px',
              border: '1px solid #dfe4ec', borderRadius: 13, outline: 'none',
              background: '#f9fafc', color: '#202632', font: 'inherit', fontSize: 16,
            }}
          />
          <div role="group" aria-label="时间单位" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {UNITS.map(u => (
              <button key={u.value} type="button" aria-pressed={unit === u.value}
                onClick={() => { setUnit(u.value); setError(''); }}
                style={{
                  padding: '10px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  border: unit === u.value ? '1px solid #2a9d9f' : '1px solid #e1e5ec',
                  background: unit === u.value ? '#e9f5f5' : '#fff',
                  color: unit === u.value ? '#247a7c' : '#505967',
                }}>
                {u.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p role="alert" style={{ color: '#b3261e', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
        <p style={{ margin: '10px 0 18px', color: '#929aa6', fontSize: 11, lineHeight: 1.6 }}>
          {totalSeconds === null
            ? '最短 30 秒，最长 30 天。'
            : totalSeconds < MIN_SECONDS
              ? `现在是 ${formatDisappearingDuration(totalSeconds)}，不到最短 30 秒。`
              : totalSeconds > MAX_SECONDS
                ? `现在是 ${formatDisappearingDuration(totalSeconds)}，超过最长 30 天。`
                : `消息将在发送 ${formatDisappearingDuration(totalSeconds)} 后消失。`}
        </p>
        <div style={{ display: 'flex', gap: 9 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: 12, borderRadius: 999, border: '1px solid #e1e5ec',
            background: '#fff', color: '#505967', fontSize: 13, fontWeight: 700,
          }}>取消</button>
          <button type="button" onClick={submit} style={{
            flex: 1, padding: 12, borderRadius: 999, border: 0,
            background: '#202632', color: '#fff', fontSize: 13, fontWeight: 800,
          }}>{totalSeconds !== null ? `设为 ${formatDisappearingDuration(totalSeconds)} 后消失` : '确定'}</button>
        </div>
      </section>
    </div>
  );
}
