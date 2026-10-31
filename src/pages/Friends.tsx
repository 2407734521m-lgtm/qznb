import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';

type Friend = { id: string; username: string; display_name: string | null; avatar_path: string | null; created_at?: string };

function FA({ p, size = 48 }: { p: Friend; size?: number }) {
  const url = useSignedUrl('avatars', p.avatar_path);
  return (
    <div className="im-list-avatar" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <span>{(p.display_name ?? p.username ?? '?').slice(0, 1)}</span>}
    </div>
  );
}

export default function Friends() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'friends' | 'reqs'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [reqs, setReqs] = useState<Friend[]>([]);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');

  async function load() {
    const [{ data: f }, { data: r }] = await Promise.all([supabase.rpc('my_friends'), supabase.rpc('friend_requests')]);
    setFriends(((f ?? []) as Friend[])); setReqs(((r ?? []) as Friend[]));
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => friends.filter(f => (f.display_name ?? f.username).toLowerCase().includes(query.trim().toLowerCase()) || f.username.toLowerCase().includes(query.trim().toLowerCase())), [friends, query]);

  async function respond(id: string, accept: boolean) {
    setMsg('');
    const { error } = await supabase.rpc('respond_friend_request', { req: id, accept });
    if (error) return setMsg('操作失败：' + error.message);
    setMsg(accept ? '已成为好友 ✓' : '已拒绝申请');
    load();
  }
  async function chat(f: Friend) {
    const { data, error } = await supabase.rpc('get_or_create_conversation', { other: f.id });
    if (error) return setMsg('打开聊天失败：' + error.message);
    nav(`/chat/${data}`, { state: { name: f.display_name ?? f.username } });
  }

  return (
    <div className="page im-inbox">
      <style>{`
        .im-inbox{position:relative;isolation:isolate;min-height:calc(100dvh - 112px);padding:18px 16px 28px!important;overflow:hidden;background:transparent!important}
        .im-inbox:before{content:'';position:absolute;z-index:-1;pointer-events:none;inset:-20px -16px 0;background:radial-gradient(ellipse at 50% -5%,rgba(70,153,255,.58),transparent 43%),radial-gradient(ellipse at 10% 18%,rgba(27,190,221,.16),transparent 38%),linear-gradient(180deg,rgba(5,24,55,.28),rgba(3,12,31,.12) 48%,rgba(2,10,25,.28))}
        .im-inbox .im-inbox-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 20px}
        .im-inbox .im-inbox-kicker{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#b7d9ff;margin-bottom:5px}
        .im-inbox .im-inbox-title{font-size:30px;line-height:1.15;font-weight:780;letter-spacing:-.04em;color:#f7fbff}
        .im-inbox .im-inbox-subtitle{font-size:12px;color:rgba(220,237,255,.7);margin-top:6px}
        .im-inbox .im-inbox-orb{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:#d8eeff;background:rgba(185,220,255,.12);border:1px solid rgba(220,240,255,.24);box-shadow:inset 0 1px 0 rgba(255,255,255,.14);backdrop-filter:blur(20px);font-size:20px}
        .im-inbox .im-search{display:flex;align-items:center;gap:10px;margin:0 0 18px;padding:0 14px;height:48px;border-radius:18px;background:rgba(190,220,255,.11);border:1px solid rgba(220,240,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.09);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}
        .im-inbox .im-search span{font-size:20px;color:#c6e1ff}
        .im-inbox .im-search input{flex:1;min-width:0;background:transparent!important;border:0!important;box-shadow:none!important;outline:none!important;color:#f4faff!important;padding:10px 0!important;font-size:14px}
        .im-inbox .im-search input::placeholder{color:rgba(224,239,255,.64)}
        .im-inbox .im-inbox-tabs{display:flex;gap:8px;margin-bottom:14px}
        .im-inbox .im-inbox-tabs button{flex:1;min-height:42px;border-radius:15px;border:1px solid rgba(215,237,255,.16);background:rgba(10,31,65,.36);color:rgba(226,240,255,.75);font-size:13px;backdrop-filter:blur(18px)}
        .im-inbox .im-inbox-tabs button.on{color:#fff;background:linear-gradient(120deg,rgba(35,135,255,.86),rgba(36,94,220,.82));border-color:rgba(168,216,255,.38);box-shadow:0 8px 24px rgba(0,94,255,.2)}
        .im-inbox .im-inbox-list{display:flex;flex-direction:column;gap:9px}
        .im-inbox .im-inbox-row{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:12px;border-radius:23px;border:1px solid rgba(207,230,255,.14);background:linear-gradient(110deg,rgba(34,90,164,.34),rgba(11,27,57,.56));box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 24px rgba(0,0,0,.08);color:#f4f9ff;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease}
        .im-inbox .im-inbox-row:active{transform:scale(.985);background:rgba(45,112,210,.38);border-color:rgba(160,213,255,.36)}
        .im-inbox .im-list-avatar{flex:none;display:grid;place-items:center;border-radius:50%;overflow:hidden;color:white;font-size:18px;font-weight:700;background:linear-gradient(135deg,#61baff,#6578ff 58%,#a17bff);border:2px solid rgba(218,239,255,.28);box-shadow:0 0 0 4px rgba(92,157,255,.09)}
        .im-inbox .im-list-avatar img{width:100%;height:100%;object-fit:cover}
        .im-inbox .im-inbox-person{flex:1;min-width:0}
        .im-inbox .im-inbox-name{font-size:14px;font-weight:700;color:#f7fbff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .im-inbox .im-inbox-preview{font-size:12px;color:rgba(218,234,255,.7);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .im-inbox .im-inbox-arrow{color:rgba(207,229,255,.72);font-size:21px;padding:0 3px}
        .im-inbox .im-inbox-empty{padding:28px 18px;text-align:center;border-radius:23px;border:1px solid rgba(207,230,255,.13);background:rgba(10,27,55,.4);color:rgba(221,237,255,.75);backdrop-filter:blur(22px)}
        .im-inbox .im-inbox-empty-icon{width:58px;height:58px;border-radius:20px;margin:0 auto 12px;display:grid;place-items:center;font-size:25px;color:#d8edff;background:linear-gradient(135deg,rgba(57,153,255,.35),rgba(103,111,255,.22));border:1px solid rgba(220,240,255,.17)}
        .im-inbox .im-inbox-message{margin:0 0 12px;padding:10px 13px;border-radius:14px;background:rgba(12,30,58,.68);border:1px solid rgba(210,232,255,.14);color:#d8eaff;font-size:12px}
        .im-inbox .im-request-actions{display:flex;gap:6px}
        .im-inbox .im-request-actions button{border-radius:12px;padding:8px 10px}
        @media(prefers-reduced-motion:reduce){.im-inbox .im-inbox-row{transition:none}}
      `}</style>
      <header className="im-inbox-head">
        <div><div className="im-inbox-kicker">PINGZHONG · CONNECT</div><div className="im-inbox-title">Messages</div><div className="im-inbox-subtitle">和班级里的朋友保持联系</div></div>
        </header>
      <label className="im-search"><span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索好友" aria-label="搜索好友" /><span aria-hidden="true">⌘</span></label>
      <div className="im-inbox-tabs">
        <button type="button" className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>消息与好友 · {friends.length}</button>
        <button type="button" className={tab === 'reqs' ? 'on' : ''} onClick={() => setTab('reqs')}>新的请求{reqs.length > 0 ? ` · ${reqs.length}` : ''}</button>
      </div>
      {msg && <p className="im-inbox-message" role="status">{msg}</p>}
      {tab === 'friends' && (
        <div className="im-inbox-list">
          {filtered.length === 0 ? <div className="im-inbox-empty"><div style={{fontWeight:750,color:'#f3f8ff',fontSize:15,marginBottom:7}}>{query ? '没有找到这位好友' : '你的对话，从这里开始'}</div><div style={{fontSize:12,lineHeight:1.7}}>{query ? '试试其他名字或用户名。' : '添加班级好友后，他们会出现在这里。点开好友即可进入私聊。'}</div></div> : filtered.map(f => (
            <button key={f.id} type="button" className="im-inbox-row" onClick={() => chat(f)}>
              <FA p={f} />
              <span className="im-inbox-person"><span className="im-inbox-name" style={{display:'block'}}>{f.display_name ?? f.username}</span><span className="im-inbox-preview" style={{display:'block'}}>@{f.username} · 点击继续聊天</span></span>
              <span className="im-inbox-arrow" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
      {tab === 'reqs' && (
        <div className="im-inbox-list">
          {reqs.length === 0 ? <div className="im-inbox-empty"><div style={{fontWeight:750,color:'#f3f8ff',fontSize:15,marginBottom:7}}>暂无新的请求</div><div style={{fontSize:12}}>新的好友申请会显示在这里。</div></div> : reqs.map(f => (
            <div key={f.id} className="im-inbox-row" style={{cursor:'default'}}>
              <FA p={f} />
              <span className="im-inbox-person"><span className="im-inbox-name" style={{display:'block'}}>{f.display_name ?? f.username}</span><span className="im-inbox-preview" style={{display:'block'}}>@{f.username} 想加你为好友</span></span>
              <span className="im-request-actions"><button type="button" className="pri" onClick={() => respond(f.id, true)}>接受</button><button type="button" className="ghost" onClick={() => respond(f.id, false)}>拒绝</button></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
