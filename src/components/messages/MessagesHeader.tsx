import { useNavigate } from 'react-router-dom';

export default function MessagesHeader() {
  const navigate = useNavigate();
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 4px 8px',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    }}>
      <span style={{ width: 32 }} />

      <h1 style={{
        margin: 0,
        fontSize: 17,
        fontWeight: 600,
        color: '#fff',
        letterSpacing: '-0.02em',
      }}>
        信息
      </h1>

      <button
        onClick={() => navigate('/friends')}
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: '#0a84ff',
          border: 'none',
          color: '#fff',
          fontSize: 22,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          padding: 0,
        }}
        aria-label="新建对话"
      >
        +
      </button>
    </div>
  );
}
