import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (nickname: string) => void;
};

export default function GuestNicknameDialog({ open, onClose, onConfirm }: Props) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setNickname('');
    setError('');
  }, [open]);

  if (!open) return null;

  function submit() {
    const value = nickname.trim();
    if (!value) {
      setError('请先设置一个昵称');
      return;
    }
    if (value.length > 20) {
      setError('昵称最多 20 个字符');
      return;
    }
    if (/[\u0000-\u001f\u007f]/.test(value)) {
      setError('昵称不能包含特殊控制字符');
      return;
    }
    onConfirm(value);
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
        aria-labelledby="guest-entry-title"
        onClick={event => event.stopPropagation()}
        style={{
          width: '100%', maxWidth: 390, padding: 24, borderRadius: 24,
          background: 'rgba(255,255,255,.96)', border: '1px solid rgba(255,255,255,.86)',
          boxShadow: '0 24px 80px rgba(20,35,55,.18)', color: '#202632',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 2, color: '#7b8492', fontWeight: 800 }}>GUEST ACCESS</div>
        <h2 id="guest-entry-title" style={{ margin: '8px 0', fontSize: 23 }}>游客登录</h2>
        <p style={{ margin: '0 0 18px', color: '#737b89', fontSize: 13, lineHeight: 1.7 }}>
          设置一个昵称即可进入网站浏览公开内容，无需邮箱、密码或验证码。
        </p>
        <label htmlFor="guest-nickname" style={{ display: 'block', marginBottom: 7, fontSize: 12, color: '#505967', fontWeight: 700 }}>
          访客昵称
        </label>
        <input
          id="guest-nickname"
          autoFocus
          value={nickname}
          onChange={event => { setNickname(event.target.value.slice(0, 20)); setError(''); }}
          onKeyDown={event => { if (event.key === 'Enter') submit(); }}
          maxLength={20}
          placeholder="给自己取一个昵称"
          autoComplete="nickname"
          style={{
            width: '100%', boxSizing: 'border-box', padding: '13px 14px',
            border: '1px solid #dfe4ec', borderRadius: 13, outline: 'none',
            background: '#f9fafc', color: '#202632', font: 'inherit', fontSize: 14,
          }}
        />
        {error && <p role="alert" style={{ color: '#b3261e', fontSize: 12, margin: '8px 0 0' }}>{error}</p>}
        <p style={{ margin: '10px 0 18px', color: '#929aa6', fontSize: 11, lineHeight: 1.6 }}>
          游客昵称只保存在当前浏览器标签页，不会创建正式账号或计入成员人数。
        </p>
        <div style={{ display: 'flex', gap: 9 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: 12, borderRadius: 999, border: '1px solid #e1e5ec',
            background: '#fff', color: '#505967', fontSize: 13, fontWeight: 700,
          }}>取消</button>
          <button type="button" onClick={submit} style={{
            flex: 1, padding: 12, borderRadius: 999, border: 0,
            background: '#202632', color: '#fff', fontSize: 13, fontWeight: 800,
          }}>进入网站</button>
        </div>
      </section>
    </div>
  );
}
