interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div style={{ padding: '0 4px 12px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: '9px 12px',
        gap: 8,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="搜索"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontSize: 16,
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}
