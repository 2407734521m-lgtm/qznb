import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';

type Friend = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  created_at?: string;
};

type MemberSearchResult = Friend;

type ConversationPreview = {
  conversation_id: number;
  conversation_created_at: string;
  other_profile_id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  last_message_id: number | null;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  last_message_deleted: boolean;
  unread_count: number;
  other_last_read_message_id: number | null;
};

function FriendAvatar({ person, size = 48 }: { person: Friend; size?: number }) {
  const url = useSignedUrl('avatars', person.avatar_path);
  return (
    <div className="im-list-avatar" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : <span>{(person.display_name ?? person.username ?? '?').slice(0, 1)}</span>}
    </div>
  );
}

function formatInboxTime(value: string | null, fallback: string) {
  if (!value) return new Date(fallback).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

function previewText(item: ConversationPreview, myId: string) {
  if (!item.last_message_id) return '新的对话，发出第一条消息吧';
  if (item.last_message_deleted) return '消息已撤回';
  const body = item.last_message_body ?? '';
  if (body.startsWith('[[im-image:')) return item.last_message_sender_id === myId ? '你发送了一张图片' : '发送了一张图片';
  if (body.startsWith('[[im-audio:')) return item.last_message_sender_id === myId ? '你发送了一段语音' : '发送了一段语音';
  return body || '消息';
}

export default function Friends() {
  const nav = useNavigate();
  const me = useAuth().session!.user.id;
  const [tab, setTab] = useState<'messages' | 'friends' | 'reqs'>('messages');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [reqs, setReqs] = useState<Friend[]>([]);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [sentRequestIds, setSentRequestIds] = useState<string[]>([]);
  const [friendActionId, setFriendActionId] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);

  async function load() {
    const requestId = ++loadSequenceRef.current;
    const [friendResult, requestResult, conversationResult, sentRequestResult] = await Promise.all([
      supabase.rpc('my_friends'),
      supabase.rpc('friend_requests'),
      supabase.rpc('my_conversations'),
      supabase.from('friendships').select('addressee').eq('requester', me).eq('status', 'pending'),
    ]);
    // Realtime 与 15 秒兜底刷新可能重叠，只允许最后一次请求更新列表。
    if (requestId !== loadSequenceRef.current) return;
    if (friendResult.error || requestResult.error || conversationResult.error) {
      console.error('inbox load failed', friendResult.error, requestResult.error, conversationResult.error);
      setMsg('部分消息列表暂时无法加载，请稍后刷新。');
    } else {
      setFriends((friendResult.data ?? []) as Friend[]);
      setReqs((requestResult.data ?? []) as Friend[]);
      setConversations((conversationResult.data ?? []) as ConversationPreview[]);
      setSentRequestIds((sentRequestResult.data ?? []).map(row => row.addressee as string));
      if (sentRequestResult.error) {
        console.warn('outgoing friend requests unavailable', sentRequestResult.error);
        setMsg('好友与消息已加载，但待发出的好友申请状态暂时无法读取。');
      } else {
        setMsg('');
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    let realtimeTimer: number | undefined;
    const scheduleLoad = () => {
      // 合并短时间内连续到达的多条消息事件，避免重复查询四组列表。
      window.clearTimeout(realtimeTimer);
      realtimeTimer = window.setTimeout(() => { void load(); }, 180);
    };
    const channel = supabase.channel('inbox-' + me)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleLoad)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: 'profile_id=eq.' + me }, scheduleLoad)
      .subscribe();
    const fallback = window.setInterval(() => { void load(); }, 15000);
    return () => {
      window.clearInterval(fallback);
      window.clearTimeout(realtimeTimer);
      loadSequenceRef.current += 1;
      void supabase.removeChannel(channel);
    };
    // The authenticated user is stable for this mounted page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchTerm = query.trim();
  const filteredFriends = useMemo(
    () => friends.filter(f => (f.display_name ?? f.username).toLocaleLowerCase().includes(normalizedQuery)
      || f.username.toLocaleLowerCase().includes(normalizedQuery)),
    [friends, normalizedQuery],
  );
  const filteredConversations = useMemo(
    () => conversations.filter(c => (c.display_name ?? c.username).toLocaleLowerCase().includes(normalizedQuery)
      || c.username.toLocaleLowerCase().includes(normalizedQuery)),
    [conversations, normalizedQuery],
  );
  const filteredRequests = useMemo(
    () => reqs.filter(f => (f.display_name ?? f.username).toLocaleLowerCase().includes(normalizedQuery)
      || f.username.toLocaleLowerCase().includes(normalizedQuery)),
    [reqs, normalizedQuery],
  );

  useEffect(() => {
    if (!searchTerm) {
      setSearchResults([]);
      setSearchError('');
      setSearchLoading(false);
      return;
    }
    let active = true;
    setSearchLoading(true);
    setSearchError('');
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { data, error } = await supabase.rpc('member_directory', {
            q: searchTerm,
            lim: 20,
            skip: 0,
          });
          if (!active) return;
          if (error) {
            setSearchResults([]);
            setSearchError('成员搜索暂时不可用，请稍后重试。');
            console.error('member directory search failed', error);
          } else {
            setSearchResults(((data ?? []) as MemberSearchResult[]).filter(person => person.id !== me));
          }
        } catch (error) {
          if (active) {
            setSearchResults([]);
            setSearchError('成员搜索暂时不可用，请检查网络后重试。');
          }
          console.error('member directory search failed', error);
        } finally {
          if (active) setSearchLoading(false);
        }
      })();
    }, 260);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [searchTerm, me]);

  async function openChat(friend: Friend) {
    setMsg('');
    const { data, error } = await supabase.rpc('get_or_create_conversation', { other: friend.id });
    const conversationId = Number(data);
    if (error || !Number.isSafeInteger(conversationId) || conversationId < 1) {
      setMsg('打开聊天失败：' + (error?.message ?? '暂时无法创建对话'));
      return;
    }
    nav('/chat/' + conversationId, { state: { name: friend.display_name ?? friend.username } });
  }

  async function openConversation(conversation: ConversationPreview) {
    nav('/chat/' + conversation.conversation_id, {
      state: { name: conversation.display_name ?? conversation.username },
    });
  }

  async function respond(id: string, accept: boolean) {
    if (friendActionId) return;
    setFriendActionId(id);
    setMsg('');
    try {
      const { error } = await supabase.rpc('respond_friend_request', { req: id, accept });
      if (error) {
        setMsg('操作失败：' + error.message);
        return;
      }
      await load();
      setMsg(accept ? '已成为好友。可以开始聊天了。' : '已拒绝好友申请。');
    } catch (error) {
      console.error('respond friend request failed', error);
      setMsg('操作失败，请检查网络后重试。');
    } finally {
      setFriendActionId(null);
    }
  }

  async function addFriend(person: MemberSearchResult) {
    if (friendActionId) return;
    setFriendActionId(person.id);
    setMsg('');
    try {
      const { data, error } = await supabase.rpc('send_friend_request', { target: person.id });
      if (error) {
        setMsg('好友申请发送失败：' + error.message);
        return;
      }
      const outcome = String(data ?? '');
      await load();
      if (outcome === 'sent') setMsg('好友申请已发送，等待对方同意。');
      else if (outcome === 'accepted') setMsg('对方之前已向你发送申请，现在你们已成为好友。');
      else if (outcome === 'already_friends') setMsg('你们已经是好友，可以直接开始聊天。');
      else if (outcome === 'already_pending') setMsg('好友申请已经发送，请等待对方同意。');
      else setMsg('好友申请状态已更新。');
    } catch (error) {
      console.error('send friend request failed', error);
      setMsg('好友申请发送失败，请检查网络后重试。');
    } finally {
      setFriendActionId(null);
    }
  }

  return (
    <div className="page im-inbox">
      <style>{`
        .im-inbox{position:relative;isolation:isolate;width:100%;height:100%;min-height:0;max-width:none;margin:0;padding:18px 16px 28px!important;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;background:transparent!important}
        .im-inbox:before{content:'';position:absolute;z-index:-1;pointer-events:none;inset:0;background:radial-gradient(ellipse at 50% -5%,rgba(70,153,255,.58),transparent 43%),radial-gradient(ellipse at 10% 18%,rgba(27,190,221,.16),transparent 38%),linear-gradient(180deg,rgba(5,24,55,.28),rgba(3,12,31,.12) 48%,rgba(2,10,25,.28))}
        .im-inbox-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 20px}
        .im-inbox-kicker{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#b7d9ff;margin-bottom:5px}
        .im-inbox-title{font-size:30px;line-height:1.15;font-weight:780;letter-spacing:-.04em;color:#f7fbff}
        .im-inbox-subtitle{font-size:12px;color:rgba(220,237,255,.7);margin-top:6px}
        .im-search{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:0 14px;height:48px;border-radius:18px;background:rgba(190,220,255,.11);border:1px solid rgba(220,240,255,.18);box-shadow:inset 0 1px 0 rgba(255,255,255,.09);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)}
        .im-search span{font-size:20px;color:#c6e1ff}
        .im-search input{flex:1;min-width:0;background:transparent!important;border:0!important;box-shadow:none!important;outline:none!important;color:#f4faff!important;padding:10px 0!important;font-size:14px}
        .im-search input::placeholder{color:rgba(224,239,255,.64)}
        .im-inbox-tabs{display:flex;gap:8px;margin-bottom:14px}
        .im-inbox-tabs button{flex:1;min-height:42px;border-radius:15px;border:1px solid rgba(215,237,255,.16);background:rgba(10,31,65,.36);color:rgba(226,240,255,.75);font-size:13px;backdrop-filter:blur(18px)}
        .im-inbox-tabs button.on{color:#fff;background:linear-gradient(120deg,rgba(35,135,255,.86),rgba(36,94,220,.82));border-color:rgba(168,216,255,.38);box-shadow:0 8px 24px rgba(0,94,255,.2)}
        .im-inbox-list{display:flex;flex-direction:column;gap:9px}
        .im-inbox-row{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:12px;border-radius:23px;border:1px solid rgba(207,230,255,.14);background:linear-gradient(110deg,rgba(34,90,164,.34),rgba(11,27,57,.56));box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 24px rgba(0,0,0,.08);color:#f4f9ff;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease}
        button.im-inbox-row:active{transform:scale(.985);background:rgba(45,112,210,.38);border-color:rgba(160,213,255,.36)}
        .im-list-avatar{flex:none;display:grid;place-items:center;border-radius:50%;overflow:hidden;color:white;font-size:18px;font-weight:700;background:linear-gradient(135deg,#61baff,#6578ff 58%,#a17bff);border:2px solid rgba(218,239,255,.28);box-shadow:0 0 0 4px rgba(92,157,255,.09)}
        .im-list-avatar img{width:100%;height:100%;object-fit:cover}
        .im-inbox-person{flex:1;min-width:0}
        .im-inbox-name{font-size:14px;font-weight:700;color:#f7fbff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .im-inbox-preview{font-size:12px;color:rgba(218,234,255,.7);margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .im-inbox-time{font-size:10px;color:rgba(218,234,255,.68);white-space:nowrap;margin-left:4px}
        .im-inbox-arrow{color:rgba(207,229,255,.72);font-size:21px;padding:0 3px}
        .im-unread{min-width:20px;height:20px;border-radius:99px;padding:0 6px;display:grid;place-items:center;background:#3e9cff;color:white;font-size:10px;font-weight:750;box-shadow:0 3px 12px rgba(20,115,255,.3)}
        .im-inbox-empty{padding:28px 18px;text-align:center;border-radius:23px;border:1px solid rgba(207,230,255,.13);background:rgba(10,27,55,.4);color:rgba(221,237,255,.75);backdrop-filter:blur(22px)}
        .im-inbox-empty-title{font-weight:750;color:#f3f8ff;font-size:15px;margin-bottom:7px}
        .im-inbox-empty-copy{font-size:12px;line-height:1.7}
        .im-inbox-message{margin:0 0 12px;padding:10px 13px;border-radius:14px;background:rgba(12,30,58,.68);border:1px solid rgba(210,232,255,.14);color:#d8eaff;font-size:12px}
        .im-request-actions{display:flex;gap:6px}
        .im-request-actions button{border-radius:12px;padding:8px 10px}
        .im-inbox-primary{border:1px solid rgba(160,213,255,.36);background:linear-gradient(120deg,#2a91f8,#3a70e8);color:white;border-radius:13px;padding:9px 14px;font-weight:650;margin-top:14px}
        .im-inbox-search-caption{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:3px 3px 5px;color:#f3f8ff;font-size:13px;font-weight:750}
        .im-inbox-search-caption small{font-size:10px;font-weight:450;color:rgba(218,234,255,.62)}
        .im-inbox-search-action{display:flex;align-items:center;flex:none}
        .im-inbox-search-action button{width:auto!important;min-width:82px;padding:8px 11px;border-radius:13px;border:1px solid rgba(165,212,255,.3);background:rgba(44,124,221,.28);color:#eef7ff;font-size:11px;font-weight:700;white-space:nowrap}
        .im-inbox-search-action button.is-friend{background:rgba(70,170,143,.2);border-color:rgba(142,226,200,.28)}
        .im-inbox-search-action button.is-incoming{background:linear-gradient(120deg,#278fe9,#3267da);border-color:rgba(175,221,255,.5)}
        .im-inbox-search-action button:disabled{opacity:.72;cursor:default}
        .im-search:focus-within{border-color:rgba(169,219,255,.48);box-shadow:0 0 0 3px rgba(75,157,255,.12),inset 0 1px 0 rgba(255,255,255,.09)}
        @media(max-width:768px){.im-inbox{padding:calc(18px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(118px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))!important}}
        @media(prefers-reduced-motion:reduce){.im-inbox-row{transition:none}}
      `}</style>

      <header className="im-inbox-head">
        <div>
          <div className="im-inbox-kicker">PINGZHONG · CONNECT</div>
          <div className="im-inbox-title">Messages</div>
          <div className="im-inbox-subtitle">和班级里的朋友保持联系</div>
        </div>
      </header>

      <label className="im-search">
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索全站成员、好友或对话" aria-label="搜索全站成员、好友或对话" />
      </label>

      <div className="im-inbox-tabs">
        <button type="button" className={tab === 'messages' ? 'on' : ''} onClick={() => setTab('messages')}>消息 · {conversations.length}</button>
        <button type="button" className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>好友 · {friends.length}</button>
        <button type="button" className={tab === 'reqs' ? 'on' : ''} onClick={() => setTab('reqs')}>请求{reqs.length > 0 ? ' · ' + reqs.length : ''}</button>
      </div>

      {msg && <p className="im-inbox-message" role="status">{msg}</p>}

      {searchTerm ? (
        <div className="im-inbox-list" aria-live="polite">
          <div className="im-inbox-search-caption">
            <span>搜索站内成员</span>
            <small>只显示已加入的成员 · 最多 20 条</small>
          </div>
          {searchLoading ? (
            <div className="im-inbox-empty">
              <div className="im-inbox-empty-title">正在搜索…</div>
              <div className="im-inbox-empty-copy">正在查找匹配的昵称或用户名。</div>
            </div>
          ) : searchError ? (
            <div className="im-inbox-empty">
              <div className="im-inbox-empty-title">暂时无法搜索</div>
              <div className="im-inbox-empty-copy">{searchError}</div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="im-inbox-empty">
              <div className="im-inbox-empty-title">没有找到匹配成员</div>
              <div className="im-inbox-empty-copy">试试昵称或完整用户名。你也可以检查拼写后再搜索。</div>
            </div>
          ) : searchResults.map(person => {
            const isFriend = friends.some(friend => friend.id === person.id);
            const hasIncomingRequest = reqs.some(request => request.id === person.id);
            const hasOutgoingRequest = sentRequestIds.includes(person.id);
            const busy = friendActionId === person.id;
            return (
              <div key={person.id} className="im-inbox-row" style={{ cursor: 'default' }}>
                <FriendAvatar person={person} />
                <span className="im-inbox-person">
                  <span className="im-inbox-name" style={{ display: 'block' }}>{person.display_name ?? person.username}</span>
                  <span className="im-inbox-preview" style={{ display: 'block' }}>@{person.username}</span>
                </span>
                <span className="im-inbox-search-action">
                  {isFriend ? (
                    <button type="button" className="is-friend" onClick={() => openChat(person)}>发消息</button>
                  ) : hasIncomingRequest ? (
                    <button type="button" className="is-incoming" disabled={busy} onClick={() => respond(person.id, true)}>
                      {busy ? '处理中…' : '接受申请'}
                    </button>
                  ) : hasOutgoingRequest ? (
                    <button type="button" disabled>等待同意</button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => addFriend(person)}>
                      {busy ? '发送中…' : '添加好友'}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {tab === 'messages' && (
            <div className="im-inbox-list">
              {filteredConversations.length === 0 ? (
                <div className="im-inbox-empty">
                  <div className="im-inbox-empty-title">{loading ? '正在加载消息…' : '还没有聊天记录'}</div>
                  <div className="im-inbox-empty-copy">和好友开启一次对话，最近消息会自动显示在这里。</div>
                  <button type="button" className="im-inbox-primary" onClick={() => setTab('friends')}>选择好友开始聊天</button>
                </div>
              ) : filteredConversations.map(conversation => (
                <button key={conversation.conversation_id} type="button" className="im-inbox-row" onClick={() => openConversation(conversation)}>
                  <FriendAvatar person={{ id: conversation.other_profile_id, username: conversation.username, display_name: conversation.display_name, avatar_path: conversation.avatar_path }} />
                  <span className="im-inbox-person">
                    <span className="im-inbox-name" style={{ display: 'block' }}>{conversation.display_name ?? conversation.username}</span>
                    <span className="im-inbox-preview" style={{ display: 'block' }}>
                      {conversation.last_message_sender_id === me && conversation.last_message_id ? '我：' : ''}
                      {previewText(conversation, me)}
                    </span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7 }}>
                    <span className="im-inbox-time">{formatInboxTime(conversation.last_message_at, conversation.conversation_created_at)}</span>
                    {conversation.unread_count > 0 && <span className="im-unread">{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {tab === 'friends' && (
            <div className="im-inbox-list">
              {filteredFriends.length === 0 ? (
                <div className="im-inbox-empty">
                  <div className="im-inbox-empty-title">还没有好友</div>
                  <div className="im-inbox-empty-copy">通过上方搜索框查找站内成员，发送好友申请后等待对方同意。</div>
                </div>
              ) : filteredFriends.map(friend => (
                <button key={friend.id} type="button" className="im-inbox-row" onClick={() => openChat(friend)}>
                  <FriendAvatar person={friend} />
                  <span className="im-inbox-person">
                    <span className="im-inbox-name" style={{ display: 'block' }}>{friend.display_name ?? friend.username}</span>
                    <span className="im-inbox-preview" style={{ display: 'block' }}>@{friend.username} · 点击开始聊天</span>
                  </span>
                  <span className="im-inbox-arrow" aria-hidden="true">›</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'reqs' && (
            <div className="im-inbox-list">
              {filteredRequests.length === 0 ? (
                <div className="im-inbox-empty">
                  <div className="im-inbox-empty-title">暂无新的请求</div>
                  <div className="im-inbox-empty-copy">新的好友申请会显示在这里。</div>
                </div>
              ) : filteredRequests.map(friend => (
                <div key={friend.id} className="im-inbox-row" style={{ cursor: 'default' }}>
                  <FriendAvatar person={friend} />
                  <span className="im-inbox-person">
                    <span className="im-inbox-name" style={{ display: 'block' }}>{friend.display_name ?? friend.username}</span>
                    <span className="im-inbox-preview" style={{ display: 'block' }}>@{friend.username} 想加你为好友</span>
                  </span>
                  <span className="im-request-actions">
                    <button type="button" className="pri" disabled={friendActionId === friend.id} onClick={() => respond(friend.id, true)}>{friendActionId === friend.id ? '处理中…' : '接受'}</button>
                    <button type="button" className="ghost" disabled={friendActionId === friend.id} onClick={() => respond(friend.id, false)}>拒绝</button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
