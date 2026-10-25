import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConversations } from '../hooks/useConversations';
import SearchBar from '../components/messages/SearchBar';
import ConversationList from '../components/messages/ConversationList';

export default function Messages() {
  const { conversations, loading, error } = useConversations();
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const filtered = conversations.filter((c) => {
    const name = c.other_user?.display_name || c.other_user?.username || '班级同学';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <main className="im-list-page">
      <style>{`
        .im-list-page{height:100vh;height:100dvh;min-height:0;width:100%;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;color:#f6fbff;background:radial-gradient(ellipse at 50% -10%,rgba(76,158,255,.38),transparent 44%),linear-gradient(180deg,#091b39 0%,#071326 48%,#030914 100%);padding:calc(12px + env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
        .im-list-head{max-width:680px;margin:0 auto 22px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:8px 2px 16px;border-bottom:1px solid rgba(214,233,255,.14)}
        .im-list-kicker{font-size:10px;letter-spacing:2.6px;color:#8fc7ff;font-weight:800;text-transform:uppercase;margin-bottom:4px}
        .im-list-title{font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-.8px;margin:0;color:#fff}
        .im-list-subtitle{margin:7px 0 0;font-size:12px;color:rgba(228,241,255,.6);letter-spacing:.3px}
        .im-list-back{flex:none;border:1px solid rgba(222,239,255,.2);border-radius:999px;background:rgba(255,255,255,.09);color:#f5fbff;padding:9px 13px;font:inherit;font-size:12px;font-weight:650;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);cursor:pointer;transition:background .2s,transform .2s}
        .im-list-back:active{transform:scale(.96);background:rgba(255,255,255,.16)}
        .im-list-content{max-width:680px;margin:0 auto}
        .im-list-content>div[role=alert]{border:1px solid rgba(255,107,107,.2)}
        .im-list-new{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;margin:2px 0 14px;padding:11px 14px;border-radius:14px;border:1px solid rgba(125,190,255,.25);background:linear-gradient(120deg,rgba(49,125,232,.22),rgba(102,91,255,.16));color:#eaf5ff;font:inherit;font-weight:650;cursor:pointer}
        .im-list-new span{font-size:18px;line-height:1}
        .im-list-content input{margin:0;color:#fff}
        @media(min-width:769px){.im-list-page{padding-top:28px}.im-list-title{font-size:34px}}
        @media(prefers-reduced-motion:reduce){.im-list-back{transition:none}}
      `}</style>
      <header className="im-list-head">
        <div>
          <div className="im-list-kicker">PRIVATE MESSAGES</div>
          <h1 className="im-list-title">iMessage</h1>
          <p className="im-list-subtitle">班级同学 · 私密对话</p>
        </div>
        <button type="button" className="im-list-back" onClick={() => navigate('/home')} aria-label="返回首页">返回 ↗</button>
      </header>

      <section className="im-list-content">
        <SearchBar value={search} onChange={setSearch} />
        <button type="button" className="im-list-new" onClick={() => navigate('/friends')}>
          <span aria-hidden="true">＋</span> 发起新聊天
        </button>

        {error && (
          <div role="alert" style={{
            padding: '12px 16px',
            margin: '12px 0',
            background: 'rgba(255, 69, 58, 0.15)',
            borderRadius: 12,
            color: '#ff8f8a',
            fontSize: 14
          }}>
            {error}
          </div>
        )}

        <ConversationList conversations={filtered} loading={loading} />
      </section>
    </main>
  );
}
