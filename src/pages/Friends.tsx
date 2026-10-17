import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSignedUrl } from '../lib/media';

type Friend = { id: string; username: string; display_name: string | null; avatar_path: string | null; created_at?: string };

function FA({ p, size = 46 }: { p: Friend; size?: number }) {
  const url = useSignedUrl('avatars', p.avatar_path);
  return (
    <div className="av" style={{ width: size, height: size }}>
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

  async function load() {
    const [{ data: f }, { data: r }] = await Promise.all([supabase.rpc('my_friends'), supabase.rpc('friend_requests')]);
    setFriends(((f ?? []) as Friend[])); setReqs(((r ?? []) as Friend[]));
  }
  useEffect(() => { load(); }, []);

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
    <div className="page">
      <div className="hero">
        <h1>好友</h1>
        <p>和 班 级 里 的 朋 友 畅 聊 吧</p>
      </div>
      <div className="seg" style={{ marginBottom: 10 }}>
        <button type="button" className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>
          💌 我的好友（{friends.length}）
        </button>
        <button type="button" className={tab === 'reqs' ? 'on' : ''} onClick={() => setTab('reqs')}>
          🔔 新的请求{reqs.length > 0 && `（${reqs.length}）`}
        </button>
      </div>
      {msg && <p className="card me-msg">{msg}</p>}

      {tab === 'friends' && (
        <div className="card">
          {friends.length === 0 && <p className="mut" style={{ margin: 0 }}>还没有好友，去成员页点「＋ 加好友」吧</p>}
          {friends.map(f => (
            <div key={f.id} className="frow" onClick={() => chat(f)} style={{ cursor: 'pointer' }}>
              <FA p={f} />
              <div><div className="nm">{f.display_name ?? f.username}</div>
                <div className="sub">@{f.username}</div></div>
              <span className="go mut">💬</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'reqs' && (
        <div className="card">
          {reqs.length === 0 && <p className="mut" style={{ margin: 0 }}>暂无新的好友请求</p>}
          {reqs.map(f => (
            <div key={f.id} className="frow">
              <FA p={f} />
              <div><div className="nm">{f.display_name ?? f.username}</div>
                <div className="sub">@{f.username} 想加你为好友</div></div>
              <span className="go" style={{ display: 'flex', gap: 8 }}>
                <button className="mini pri" onClick={() => respond(f.id, true)}>接受</button>
                <button className="mini ghost" onClick={() => respond(f.id, false)}>拒绝</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
