import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { downscaleImage, uploadMedia, useSignedUrl } from '../lib/media';

type M = { id: number; sender_id: string; body: string; created_at: string };

function MessageContent({ body }: { body: string }) {
  const imagePath = body.startsWith('[[im-image:') && body.endsWith(']]') ? body.slice(11, -2) : null;
  const url = useSignedUrl('chat-media', imagePath);
  if (imagePath) return url ? <a href={url} target="_blank" rel="noreferrer" className="im-photo-link"><img className="im-photo" src={url} alt="聊天图片" loading="lazy" /></a> : <div className="im-photo-loading">图片加载中…</div>;
  return <>{body}</>;
}

export default function Chat() {
  const { cid } = useParams();
  const me = useAuth().session!.user.id;
  const nav = useNavigate();
  const loc = useLocation() as { state?: { name?: string } };
  const [name, setName] = useState(loc.state?.name ?? '聊天');
  const [msgs, setMsgs] = useState<M[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!cid || !Number.isFinite(Number(cid))) return;
    const { data, error: loadError } = await supabase.from('messages').select('*')
      .eq('conversation_id', Number(cid)).order('created_at');
    if (data) { setMsgs(data as M[]); setError(''); }
    else if (loadError) setError('消息加载失败，请检查网络后重试。');
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
    const channel = supabase.channel('chat-' + cid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + cid }, () => { load(); })
      .subscribe();
    const fallback = setInterval(load, 12000);
    return () => { clearInterval(fallback); supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: firstRef.current ? 'auto' : 'smooth' });
    firstRef.current = false;
  }, [msgs.length]);

  async function sendImage(file?: File) {
    if (!file || uploading || !cid) return;
    if (!file.type.startsWith('image/')) { setError('请选择图片文件。'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('图片不能超过 15 MB。'); return; }
    setUploading(true); setError('');
    try {
      const compact = await downscaleImage(file, 1440, 0.82);
      const path = await uploadMedia('chat-media', compact, Number(cid) + '/' + me);
      const { error: sendError } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body: '[[im-image:' + path + ']]' });
      if (sendError) throw sendError;
      await load();
    } catch (e) {
      console.error('chat image upload failed', e);
      setError('图片发送失败。请确认聊天媒体存储策略已启用，然后重试。');
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = '';
    }
  }

  async function send() {
    const b = text.trim();
    if (!b || sending) return;
    setSending(true); setError('');
    const { error: sendError } = await supabase.from('messages')
      .insert({ conversation_id: Number(cid), sender_id: me, body: b.slice(0, 2000) });
    setSending(false);
    if (sendError) { setError('发送失败，请稍后重试。'); return; }
    setText('');
    await load();
    inputRef.current?.focus();
  }

  const dateLabel = (value: string, previous?: string) => {
    const d = new Date(value);
    if (previous && new Date(previous).toDateString() === d.toDateString()) return '';
    return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
  };

  return (
    <div className="im-page">
      <style>{`
        .im-page{height:100dvh;min-height:100dvh;width:100%;max-width:none;margin:0;box-sizing:border-box;display:flex;flex-direction:column;position:relative;overflow:hidden;border-radius:0;background:linear-gradient(145deg,rgba(242,247,255,.98),rgba(248,242,255,.96));color:#172033;border:0;box-shadow:none}
        .im-head{display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;flex:none;background:rgba(255,255,255,.72);backdrop-filter:blur(22px);border-bottom:1px solid rgba(115,135,175,.15);position:sticky;top:0;z-index:2}
        .im-back,.im-icon{border:0;background:rgba(113,135,179,.10);color:#405579;border-radius:14px;min-width:42px;height:42px;font-size:22px;display:grid;place-items:center;cursor:pointer}
        .im-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,#8eb7ff,#c6a5ff);color:#fff;font-size:19px;font-weight:800;box-shadow:0 5px 16px #9ab8f044}
        .im-title{font-weight:750;font-size:16px;letter-spacing:.1px}.im-sub{font-size:11px;color:#7d8aa3;margin-top:3px}
        .im-feed{flex:1;min-height:0;padding:18px 14px 24px;overflow-y:auto;overscroll-behavior:contain;min-height:220px;background-image:radial-gradient(ellipse at 8% 15%,rgba(158,193,255,.18),transparent 40%),radial-gradient(ellipse at 90% 65%,rgba(219,176,255,.18),transparent 38%)}
        .im-day{text-align:center;margin:10px auto 18px;font-size:11px;color:#8a96aa;background:#ffffff9c;border:1px solid #fff;padding:6px 12px;border-radius:999px;width:max-content;max-width:90%}
        .im-row{display:flex;margin:9px 0;animation:im-arrive .24s ease-out both}.im-row.mine{justify-content:flex-end}.im-bubble{max-width:min(78%,480px);padding:11px 14px 7px;border-radius:20px;box-shadow:0 5px 16px rgba(51,70,112,.07);overflow-wrap:anywhere;white-space:pre-wrap;font-size:15px;line-height:1.48}
        .im-bubble.mine{color:white;background:linear-gradient(135deg,#478dff,#3478f6);border-bottom-right-radius:7px}.im-bubble.theirs{color:#26344d;background:rgba(255,255,255,.92);border:1px solid rgba(255,255,255,.9);border-bottom-left-radius:7px}
        .im-time{font-size:10px;opacity:.68;text-align:right;margin-top:4px}.im-empty{text-align:center;margin:10vh auto 0;max-width:260px;color:#8491a8}.im-empty-icon{width:76px;height:76px;border-radius:28px;background:linear-gradient(135deg,#e1edff,#f0e4ff);display:grid;place-items:center;font-size:32px;margin:0 auto 16px;box-shadow:0 10px 30px #8cafff26}
        .im-composer{flex:none;padding:10px 12px calc(10px + env(safe-area-inset-bottom));display:flex;align-items:flex-end;gap:9px;background:rgba(255,255,255,.8);backdrop-filter:blur(22px);border-top:1px solid rgba(115,135,175,.14);position:sticky;bottom:0}
        .im-plus{width:42px;height:42px;flex:none;border:0;border-radius:50%;background:#edf2fc;color:#6c83ad;font-size:24px;cursor:pointer}
        .im-input-wrap{display:flex;align-items:center;flex:1;min-width:0;background:#f4f6fb;border:1px solid #e5eaf4;border-radius:23px;padding:0 6px 0 15px;transition:border-color .2s,box-shadow .2s}
        .im-input-wrap:focus-within{border-color:#9abaff;box-shadow:0 0 0 3px #a8c6ff30}.im-input{width:100%;min-width:0;border:0!important;outline:0!important;background:transparent!important;padding:12px 0!important;color:#26344d!important;box-shadow:none!important;font-size:15px}
        .im-send{width:36px;height:36px;flex:none;border:0;border-radius:50%;background:linear-gradient(135deg,#5d9bff,#387bf5);color:white;font-size:19px;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 10px #4788f533}.im-send:disabled{opacity:.35;box-shadow:none}
        .im-error{padding:8px 14px;color:#b64c5b;background:#fff0f1;font-size:12px}\n        .im-photo-link{display:block;max-width:min(68vw,320px);border-radius:14px;overflow:hidden;margin:1px 0 4px}.im-photo{display:block;width:100%;max-height:360px;object-fit:cover;border-radius:14px}.im-photo-loading{padding:18px 26px;color:#8390a6;font-size:12px;background:#f1f4fa;border-radius:12px}
        .im-details{padding:12px 16px;background:#ffffffb8;border-bottom:1px solid #e8edf6;display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#71809a}
        @keyframes im-arrive{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
        @media(min-width:700px){.im-page{height:100dvh;min-height:100dvh}.im-feed{padding:24px 28px}.im-composer{padding:14px 20px}}
        @media(max-width:600px){.im-head{gap:10px}.im-avatar{width:40px;height:40px}.im-back,.im-icon{min-width:40px;height:40px}.im-feed{padding:14px 12px 18px}.im-bubble{max-width:84%;font-size:15px}.im-composer{gap:8px}.im-plus{width:40px;height:40px}}\n        @media(prefers-reduced-motion:reduce){.im-row{animation:none}}
      `}</style>
      <header className="im-head">
        <button className="im-back" aria-label="返回好友" onClick={() => nav('/friends')}>‹</button>
        <div className="im-avatar">{name.trim().charAt(0).toUpperCase() || '友'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="im-title">{name}</div>
          <div className="im-sub">班级私聊 · 仅对话成员可见</div>
        </div>
        <button className="im-icon" aria-label="聊天详情" onClick={() => setShowDetails(v => !v)}>···</button>
      </header>
      {showDetails && <div className="im-details"><span>🔒 私密对话</span><span>💬 {msgs.length} 条消息</span><span>消息会同步刷新</span></div>}
      <main className="im-feed">
        {msgs.length === 0 ? (
          <div className="im-empty"><div className="im-empty-icon">✉️</div><div style={{fontWeight:750,color:'#5c6d8a',fontSize:16}}>新的开始</div><p style={{fontSize:13,lineHeight:1.7}}>发出第一条消息，开启你们的对话吧。</p></div>
        ) : msgs.map((m, i) => (
          <div key={m.id}>
            {dateLabel(m.created_at, msgs[i - 1]?.created_at) && <div className="im-day">{dateLabel(m.created_at, msgs[i - 1]?.created_at)}</div>}
            <div className={'im-row ' + (m.sender_id === me ? 'mine' : '')}>
              <div className={'im-bubble ' + (m.sender_id === me ? 'mine' : 'theirs')}>
                <MessageContent body={m.body} />
                <div className="im-time">{new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{m.sender_id === me ? ' · 已发送' : ''}</div>
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>
      {error && <div className="im-error">{error}</div>}
      <form className="im-composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <input ref={imageRef} type="file" accept="image/*" hidden onChange={e => sendImage(e.target.files?.[0])} />
        <button type="button" className="im-plus" aria-label="发送图片" title="发送图片" disabled={uploading} onClick={() => imageRef.current?.click()}>{uploading ? '…' : '＋'}</button>
        <div className="im-input-wrap">
          <input ref={inputRef} className="im-input" value={text} onChange={e => setText(e.target.value)}
            placeholder={uploading ? '正在发送图片…' : '发送信息…'} maxLength={2000} autoComplete="off" aria-label="输入消息" />
          <button type="submit" className="im-send" aria-label="发送消息" disabled={sending || !text.trim()}>{sending ? '…' : '↑'}</button>
        </div>
      </form>
    </div>
  );
}
