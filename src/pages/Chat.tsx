import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';

type M = { id: number; sender_id: string; body: string; created_at: string };

export default function Chat() {
  const { cid } = useParams();
  const me = useAuth().session!.user.id;
  const nav = useNavigate();
  const loc = useLocation() as { state?: { name?: string } };
  const [name, setName] = useState(loc.state?.name ?? '聊天');
  const [msgs, setMsgs] = useState<M[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef(true);

  async function load() {
    const { data } = await supabase.from('messages').select('*')
      .eq('conversation_id', Number(cid)).order('created_at');
    if (data) setMsgs(data as M[]);
  }

  useEffect(() => {
    load();
    if (!loc.state?.name) {
      (async () => {
        const { data: ms } = await supabase.from('conversation_members').select('profile_id')
          .eq('conversation_id', Number(cid));
        const other = ((ms ?? []) as Array<{ profile_id: string }>).map(x => x.profile_id).find(x => x !== me);
        if (other) {
          const { data: fs } = await supabase.rpc('my_friends');
          const f = (((fs ?? []) as Array<{ id: string; username: string; display_name: string | null }>))
            .find(x => x.id === other);
          if (f) setName(f.display_name ?? f.username);
        }
      })();
    }
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: firstRef.current ? 'auto' : 'smooth' });
    firstRef.current = false;
  }, [msgs.length]);

  async function send() {
    const b = text.trim();
    if (!b || sending) return;
    setSending(true);
    const { error } = await supabase.from('messages')
      .insert({ conversation_id: Number(cid), sender_id: me, body: b.slice(0, 2000) });
    setSending(false);
    if (!error) { setText(''); load(); }
  }

  return (
    <div className="page">
      <div className="chat-head">
        <button className="ghost" style={{ width: 'auto', padding: '8px 14px' }} onClick={() => nav('/friends')}>‹ 返回</button>
        <b style={{ marginLeft: 10 }}>{name}</b>
      </div>
      <div className="chat-list">
        {msgs.map(m => (
          <div key={m.id} className={`bubble ${m.sender_id === me ? 'me' : 'them'}`}>
            {m.body}
            <span className="tm">{new Date(m.created_at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })}</span>
          </div>
        ))}
        {msgs.length === 0 && <p className="mut" style={{ textAlign: 'center' }}>还没有消息，打个招呼吧 👋</p>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-bar">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="输入消息…" maxLength={2000}
          onKeyDown={e => e.key === 'Enter' && send()} />
        <button className="pri" style={{ width: 'auto', padding: '10px 22px' }} disabled={sending || !text.trim()} onClick={send}>
          发送</button>
      </div>
    </div>
  );
}
