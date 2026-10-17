import { useEffect } from 'react';

// 用邀请码加入班级后的欢迎动画：持续约 2 秒，流畅淡入淡出
export default function WelcomeOverlay({ nick, onDone }: { nick: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="welcome-mask" onClick={onDone}>
      <div className="welcome-inner">
        {nick && <div className="welcome-nick">{nick}</div>}
        <div className="welcome-en">Welcome to Class 13!</div>
      </div>
    </div>
  );
}
