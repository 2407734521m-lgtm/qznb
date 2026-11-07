import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';
import { confirmDialog } from '../lib/dialog';

type Friend = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  created_at?: string;
};

type MemberSearchResult = Friend;

type InboxNotification = {
  id: number;
  type: string | null;
  title: string | null;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string | null;
};

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

// 点头像进对方主页（用户定规：私聊里点头像就呈现主页）。
// 用在普通行里是真按钮；嵌在整行按钮（会话行）里时用 asSpan 版，靠 stopPropagation 分流。
function ProfileAvatar({ person, size = 48, asSpan = false }: { person: Friend; size?: number; asSpan?: boolean }) {
  const nav = useNavigate();
  const label = '查看' + (person.display_name ?? person.username) + '的主页';
  const open = (event: React.SyntheticEvent) => { event.stopPropagation(); nav('/members/' + person.id); };
  if (asSpan) {
    return (
      <span className="im-avatar-link" role="button" aria-label={label} title={label} onClick={open}>
        <FriendAvatar person={person} size={size} />
      </span>
    );
  }
  return (
    <button type="button" className="im-avatar-link" aria-label={label} title={label} onClick={open}>
      <FriendAvatar person={person} size={size} />
    </button>
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
  const [searchParams] = useSearchParams();
  const me = useAuth().session!.user.id;
  const [section, setSection] = useState<'private' | 'notifications'>(() =>
    searchParams.get('tab') === 'notifications' ? 'notifications' : 'private',
  );
  const [tab, setTab] = useState<'messages' | 'friends' | 'reqs' | 'blocked' | 'discover'>(() => {
    const requestedTab = searchParams.get('tab');
    return requestedTab === 'reqs' || requestedTab === 'discover' ? requestedTab : 'messages';
  });
  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab === 'notifications') {
      setSection('notifications');
      return;
    }
    setSection('private');
    if (requestedTab === 'reqs' || requestedTab === 'discover') setTab(requestedTab);
  }, [searchParams]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [blockedMembers, setBlockedMembers] = useState<Friend[]>([]);
  const [reqs, setReqs] = useState<Friend[]>([]);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [sentRequestIds, setSentRequestIds] = useState<string[]>([]);
  const [sendRequestEmailReminder, setSendRequestEmailReminder] = useState(false);
  const [friendActionId, setFriendActionId] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);
  const notificationsLoadSequenceRef = useRef(0);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationActionError, setNotificationActionError] = useState('');
  const [notificationActionBusy, setNotificationActionBusy] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});

  async function load() {
    const requestId = ++loadSequenceRef.current;
    const [friendResult, requestResult, conversationResult, sentRequestResult, blockedResult] = await Promise.all([
      supabase.rpc('my_friends'),
      supabase.rpc('friend_requests'),
      supabase.rpc('my_conversations'),
      supabase.from('friendships').select('addressee').eq('requester', me).eq('status', 'pending'),
      supabase.rpc('my_blocked_members'),
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
      setBlockedMembers((blockedResult.data ?? []) as Friend[]);
      setSentRequestIds((sentRequestResult.data ?? []).map(row => row.addressee as string));
      if (sentRequestResult.error) {
        console.warn('outgoing friend requests unavailable', sentRequestResult.error);
        setMsg('好友与消息已加载，但待发出的好友申请状态暂时无法读取。');
      } else if (blockedResult.error) {
        console.warn('blocked member list unavailable', blockedResult.error);
        setMsg('好友与消息已加载，但黑名单暂时无法读取。');
      } else {
        setMsg('');
      }
    }
    setLoading(false);
  }

  async function loadNotifications() {
    const requestId = ++notificationsLoadSequenceRef.current;
    setNotificationsError('');
    if (notifications.length === 0) setNotificationsLoading(true);
    try {
      const { data, error } = await supabase.from('notifications')
        .select('id, type, title, body, link, is_read, created_at')
        .eq('profile_id', me)
        .order('created_at', { ascending: false })
        .limit(50);
      if (requestId !== notificationsLoadSequenceRef.current) return;
      if (error) {
        setNotificationsError(error.code === '42501' || error.code === 'PGRST301'
          ? '当前账号没有读取消息的权限。'
          : '消息暂时加载失败，请稍后重试。');
      } else {
        setNotifications(data ?? []);
      }
    } catch {
      if (requestId === notificationsLoadSequenceRef.current) {
        setNotificationsError('网络暂时不可用，请检查连接后重试。');
      }
    } finally {
      if (requestId === notificationsLoadSequenceRef.current) setNotificationsLoading(false);
    }
  }

  async function markNotificationRead(id: number) {
    const item = notifications.find(entry => entry.id === id);
    if (!item || item.is_read) return true;
    const { error } = await supabase.from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('profile_id', me);
    if (error) {
      setNotificationActionError('标记已读失败，请稍后重试。');
      return false;
    }
    setNotifications(current => current.map(entry => entry.id === id ? { ...entry, is_read: true } : entry));
    window.dispatchEvent(new Event('notif-read'));
    return true;
  }

  async function openSystemMessage(item: InboxNotification) {
    setNotificationActionError('');
    if (!(await markNotificationRead(item.id))) return;
    const target = typeof item.link === 'string' ? item.link.trim() : '';
    if (target.startsWith('/') && !target.startsWith('//')) nav(target);
  }

  async function markAllNotificationsRead() {
    if (notificationActionBusy || unreadNotificationCount === 0) return;
    setNotificationActionBusy(true);
    setNotificationActionError('');
    const { error } = await supabase.from('notifications')
      .update({ is_read: true })
      .eq('profile_id', me)
      .eq('is_read', false);
    if (error) {
      setNotificationActionError('批量标记失败，请稍后重试。');
    } else {
      setNotifications(current => current.map(item => ({ ...item, is_read: true })));
      window.dispatchEvent(new Event('notif-read'));
    }
    setNotificationActionBusy(false);
  }

  useEffect(() => {
    let active = true;
    const syncLocal = () => {
      try {
        const raw = JSON.parse(localStorage.getItem('qznb_user_preferences_v1:' + me) || 'null');
        setNotificationPrefs(raw?.notifications && typeof raw.notifications === 'object' ? raw.notifications : {});
      } catch { setNotificationPrefs({}); }
    };
    const syncCloud = async () => {
      const { data, error } = await (supabase as any)
        .from('profile_notification_preferences')
        .select('preferences')
        .eq('profile_id', me)
        .maybeSingle();
      if (!active || error || !data?.preferences?.notifications) return;
      setNotificationPrefs(data.preferences.notifications);
      try {
        const raw = JSON.parse(localStorage.getItem('qznb_user_preferences_v1:' + me) || 'null');
        localStorage.setItem('qznb_user_preferences_v1:' + me, JSON.stringify({
          ...(raw && typeof raw === 'object' ? raw : {}),
          notifications: data.preferences.notifications,
        }));
      } catch { /* 云端偏好仍可用；本地缓存失败不影响消息显示 */ }
    };
    syncLocal();
    void syncCloud();
    window.addEventListener('qznb-settings-changed', syncLocal);
    window.addEventListener('focus', syncCloud);
    return () => {
      active = false;
      window.removeEventListener('qznb-settings-changed', syncLocal);
      window.removeEventListener('focus', syncCloud);
    };
  }, [me]);

  useEffect(() => {
    void load();
    void loadNotifications();
    let realtimeTimer: number | undefined;
    let notificationRealtimeTimer: number | undefined;
    const scheduleNotificationLoad = () => {
      window.clearTimeout(notificationRealtimeTimer);
      notificationRealtimeTimer = window.setTimeout(() => { void loadNotifications(); }, 180);
    };
    const scheduleLoad = () => {
      // 合并短时间内连续到达的多条消息事件，避免重复查询四组列表。
      window.clearTimeout(realtimeTimer);
      realtimeTimer = window.setTimeout(() => { void load(); }, 180);
    };
    const channel = supabase.channel('inbox-' + me)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, scheduleLoad)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: 'profile_id=eq.' + me }, scheduleLoad)
      // friendships 的 RLS 只允许当前用户读取自己参与的关系，因此无需重复建立两条过滤订阅。
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'profile_id=eq.' + me }, scheduleNotificationLoad)
      .subscribe();
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') {
        void load();
        void loadNotifications();
      }
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    const fallback = window.setInterval(() => { void load(); void loadNotifications(); }, 15000);
    return () => {
      window.clearInterval(fallback);
      window.clearTimeout(realtimeTimer);
      window.clearTimeout(notificationRealtimeTimer);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
      loadSequenceRef.current += 1;
      notificationsLoadSequenceRef.current += 1;
      void supabase.removeChannel(channel);
    };
    // The authenticated user is stable for this mounted page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchTerm = query.trim();
  // The result rows display usernames as @handle, so accept that same format when searching.
  const directoryQuery = searchTerm.replace(/^@+/, '').trim();
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
  const filteredBlocked = useMemo(
    () => blockedMembers.filter(f => (f.display_name ?? f.username).toLocaleLowerCase().includes(normalizedQuery)
      || f.username.toLocaleLowerCase().includes(normalizedQuery)),
    [blockedMembers, normalizedQuery],
  );

  useEffect(() => {
    if (section !== 'private' || (!searchTerm && tab !== 'discover')) {
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
            q: directoryQuery,
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
  }, [searchTerm, directoryQuery, me, tab, section]);

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
    const reminderRequested = sendRequestEmailReminder;
    try {
      const { data, error } = await supabase.rpc('send_friend_request', { target: person.id });
      if (error) {
        setMsg('好友申请发送失败：' + error.message);
        return;
      }
      const outcome = String(data ?? '');
      let reminderMessage = '';
      if (outcome === 'sent' && reminderRequested) {
        // 邮件提醒仅作为额外步骤；邮件失败不能回滚已经成功创建的好友申请。
        setSendRequestEmailReminder(false);
        try {
          const { data: emailResult, error: emailError } = await supabase.functions.invoke('friend-request-email', {
            body: { target: person.id },
          });
          if (emailError) {
            console.warn('friend request email reminder failed', emailError);
            reminderMessage = '但邮件提醒暂时发送失败。';
          } else if (emailResult?.sent === true) {
            reminderMessage = '邮件提醒已提交。';
          } else if (emailResult?.reason === 'recipient_email_unavailable') {
            reminderMessage = '对方没有可用的已验证邮箱，未发送邮件。';
          } else if (emailResult?.reason === 'rate_limited') {
            reminderMessage = '邮件提醒已达到发送频率限制，未发送邮件。';
          } else {
            reminderMessage = '邮件提醒暂未发送。';
          }
        } catch (emailError) {
          console.warn('friend request email reminder failed', emailError);
          reminderMessage = '但邮件提醒暂时发送失败。';
        }
      }
      await load();
      if (outcome === 'sent') setMsg('好友申请已发送，等待对方同意。' + (reminderMessage ? ' ' + reminderMessage : ''));
      else if (outcome === 'accepted') setMsg('对方之前已向你发送申请，现在你们已成为好友。');
      else if (outcome === 'already_friends') setMsg('你们已经是好友，可以直接开始聊天。');
      else if (outcome === 'already_pending') setMsg('好友申请已经发送，请等待对方同意。');
      else setMsg('好友申请状态已更新。');
    } catch (error) {
      console.error('send friend request failed', error);
      setMsg('好友申请发送失败，请检查网络后重试。');
    } finally {
      // “仅本次申请”的选择无论成功、失败或网络异常，都不沿用到下一位成员。
      setSendRequestEmailReminder(false);
      setFriendActionId(null);
    }
  }

  async function changeRelationship(
    person: Friend,
    action: 'remove_friend' | 'block_member' | 'unblock_member',
    confirmation: string,
    successMessage: string,
  ) {
    if (friendActionId) return;
    if (!(await confirmDialog(confirmation, { danger: true, confirmText: action === 'remove_friend' ? '确认解除好友' : action === 'block_member' ? '确认拉黑' : '确认解除拉黑' }))) return;
    setFriendActionId(person.id);
    setMsg('');
    try {
      let error: { message: string } | null = null;
      if (action === 'remove_friend') {
        const result = await supabase.rpc('remove_friend', { target: person.id });
        error = result.error;
      } else if (action === 'block_member') {
        const result = await supabase.rpc('block_member', { target: person.id });
        error = result.error;
      } else {
        const result = await supabase.rpc('unblock_member', { target: person.id });
        error = result.error;
      }
      if (error) {
        setMsg('操作失败：' + error.message);
        return;
      }
      await load();
      setMsg(successMessage);
    } catch (error) {
      console.error('friend relationship action failed', error);
      setMsg('操作失败，请检查网络后重试。');
    } finally {
      setFriendActionId(null);
    }
  }

  async function removeFriend(person: Friend) {
    await changeRelationship(
      person, 'remove_friend',
      `确定解除与「${person.display_name ?? person.username}」的好友关系吗？历史消息不会删除，但双方将暂时无法继续进入这段私聊；重新成为好友后可恢复访问。`,
      '已解除好友关系。',
    );
  }

  async function blockMember(person: Friend) {
    await changeRelationship(
      person, 'block_member',
      `确定拉黑「${person.display_name ?? person.username}」吗？双方将无法互相申请好友，也无法查看或发送彼此的私聊。取消拉黑不会自动恢复好友关系。`,
      '已拉黑该成员，双方好友关系和私聊访问已停止。',
    );
  }

  async function unblockMember(person: Friend) {
    await changeRelationship(
      person, 'unblock_member',
      `确定解除对「${person.display_name ?? person.username}」的拉黑吗？解除后不会自动恢复好友关系。`,
      '已解除拉黑。需要重新发送好友申请才能恢复好友关系。',
    );
  }

  const unreadNotificationCount = notifications.filter(item =>
    !item.is_read && (item.type ? notificationPrefs[item.type] : true) !== false,
  ).length;
  const notificationTypeLabel: Record<string, string> = {
    comment: '评论提醒',
    like: '点赞提醒',
    greeting: '留言提醒',
    notice: '公告',
    love_wall: '互动提醒',
    feedback: '反馈进度',
    admin_message: '管理员消息',
    moderation: '账号警告',
    friend_request: '好友申请',
  };
  const visibleNotifications = notifications
    .filter(item => (item.type ? notificationPrefs[item.type] : true) !== false)
    .filter(item => notificationFilter === 'unread' ? !item.is_read : true)
    .filter(item => {
      if (!normalizedQuery) return true;
      return [item.title, item.body, notificationTypeLabel[item.type ?? '']]
        .some(value => (value ?? '').toLocaleLowerCase().includes(normalizedQuery));
    });

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
        .im-inbox-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:14px}
        .im-inbox-tabs button{min-width:0;min-height:42px;border-radius:15px;border:1px solid rgba(215,237,255,.16);background:rgba(10,31,65,.36);color:rgba(226,240,255,.75);font-size:13px;backdrop-filter:blur(18px)}
        .im-inbox-tabs button.on{color:#fff;background:linear-gradient(120deg,rgba(35,135,255,.86),rgba(36,94,220,.82));border-color:rgba(168,216,255,.38);box-shadow:0 8px 24px rgba(0,94,255,.2)}
        .im-primary-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:5px;margin:0 0 16px;border:1px solid rgba(215,237,255,.16);border-radius:18px;background:rgba(7,24,50,.48);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px)}
        .im-primary-tabs button{min-height:43px;border:0;border-radius:13px;background:transparent;color:rgba(226,240,255,.76);font-size:14px;font-weight:650;transition:background .18s ease,color .18s ease}
        .im-primary-tabs button.on{background:linear-gradient(120deg,rgba(42,145,248,.9),rgba(55,105,222,.86));color:#fff;box-shadow:0 5px 18px rgba(0,94,255,.2)}
        .im-primary-unread{display:inline-block;width:8px;height:8px;margin-left:8px;vertical-align:2px;border-radius:50%;background:#ff5968;box-shadow:0 0 0 3px rgba(255,89,104,.15),0 0 12px rgba(255,89,104,.45)}
        .im-notification-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 14px}
        .im-notification-toolbar button{min-height:36px;padding:7px 12px;border-radius:13px;border:1px solid rgba(215,237,255,.16);background:rgba(10,31,65,.36);color:rgba(226,240,255,.78);font-size:12px}
        .im-notification-toolbar button.on{background:rgba(48,132,238,.34);border-color:rgba(168,216,255,.34);color:#fff}
        .im-notification-toolbar button:disabled{opacity:.45}
        .im-notification-count{margin-left:auto;color:rgba(218,234,255,.62);font-size:11px}
        .im-notification-list{display:flex;flex-direction:column;gap:10px}
        .im-notification-row{display:flex;align-items:flex-start;gap:12px;width:100%;padding:14px;border:1px solid rgba(207,230,255,.14);border-radius:20px;background:linear-gradient(110deg,rgba(34,90,164,.3),rgba(11,27,57,.54));color:#f4f9ff;text-align:left;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 8px 24px rgba(0,0,0,.07);cursor:pointer;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);transition:border-color .18s ease,transform .18s ease}
        .im-notification-row.unread{border-color:rgba(255,112,125,.34);background:linear-gradient(110deg,rgba(84,54,83,.35),rgba(11,27,57,.58))}
        .im-notification-row:active{transform:scale(.99)}
        .im-notification-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:14px;background:rgba(90,153,226,.2);color:#d7eaff;font-size:18px}
        .im-notification-icon.warning{background:rgba(255,174,86,.16);color:#ffd49d}
        .im-notification-main{flex:1;min-width:0}
        .im-notification-title-line{display:flex;align-items:center;gap:8px;min-width:0}
        .im-notification-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:750;color:#f7fbff}
        .im-notification-unread{flex:none;border-radius:99px;padding:2px 7px;background:rgba(255,89,104,.17);color:#ffabb4;font-size:10px;font-weight:700}
        .im-notification-body{margin:7px 0 0;color:rgba(224,238,255,.78);font-size:12px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
        .im-notification-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;color:rgba(211,229,248,.56);font-size:10px}
        .im-notification-type{padding:2px 7px;border:1px solid rgba(211,229,248,.16);border-radius:99px;white-space:nowrap}
        .im-notification-arrow{flex:none;margin-top:8px;color:rgba(211,229,248,.58);font-size:20px}
        .im-inbox-list{display:flex;flex-direction:column;gap:9px}
        .im-inbox-row{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:12px;border-radius:23px;border:1px solid rgba(207,230,255,.14);background:linear-gradient(110deg,rgba(34,90,164,.34),rgba(11,27,57,.56));box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 24px rgba(0,0,0,.08);color:#f4f9ff;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease}
        button.im-inbox-row:active{transform:scale(.985);background:rgba(45,112,210,.38);border-color:rgba(160,213,255,.36)}
        .im-list-avatar{flex:none;display:grid;place-items:center;border-radius:50%;overflow:hidden;color:white;font-size:18px;font-weight:700;background:linear-gradient(135deg,#61baff,#6578ff 58%,#a17bff);border:2px solid rgba(218,239,255,.28);box-shadow:0 0 0 4px rgba(92,157,255,.09)}
        .im-list-avatar img{width:100%;height:100%;object-fit:cover}
        .im-avatar-link{flex:none;display:inline-block;padding:0;border:0;background:none;border-radius:50%;cursor:pointer;line-height:0;-webkit-tap-highlight-color:transparent}
        .im-avatar-link:active{transform:scale(.94)}
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
        .im-request-email-option{display:flex;align-items:center;gap:10px;margin:0 2px 12px;padding:11px 13px;border:1px solid rgba(122,153,190,.2);border-radius:15px;background:rgba(255,255,255,.72);color:#243247;cursor:pointer;transition:border-color .18s ease,background .18s ease}
        .im-request-email-option:has(input:checked){border-color:rgba(55,125,220,.42);background:rgba(232,242,255,.92)}
        .im-request-email-option input{width:17px;height:17px;margin:0;flex:none;accent-color:#3478d4}
        .im-request-email-option input:disabled{opacity:.55}
        .im-request-email-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}
        .im-request-email-copy strong{font-size:12px;font-weight:700;color:#26364d}
        .im-request-email-copy small{font-size:10px;line-height:1.45;color:#78869a}
        .im-request-email-tag{flex:none;padding:3px 7px;border-radius:99px;background:rgba(90,115,145,.1);color:#718097;font-size:10px}
        .im-request-actions{display:flex;gap:6px}
        .im-request-actions button{border-radius:12px;padding:8px 10px}
        .im-friend-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
        .im-friend-actions button{min-height:34px;padding:7px 9px;border-radius:11px;border:1px solid rgba(165,212,255,.28);background:rgba(44,124,221,.2);color:#eef7ff;font-size:11px;white-space:nowrap}
        .im-friend-actions button.danger{border-color:rgba(255,145,154,.3);background:rgba(190,56,74,.14);color:#ffc0c5}
        @media(max-width:520px){.im-inbox-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.im-inbox-row{flex-wrap:wrap}.im-friend-actions{width:100%;justify-content:flex-end;padding-left:58px}}
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
          <div className="im-inbox-kicker">QIANZHI · MESSAGE CENTER</div>
          <div className="im-inbox-title">消息中心</div>
          <div className="im-inbox-subtitle">私信与账号通知，集中在这里</div>
        </div>
      </header>

      <div className="im-primary-tabs" role="tablist" aria-label="消息分类">
        <button type="button" role="tab" aria-selected={section === 'private'} className={section === 'private' ? 'on' : ''}
          onClick={() => { setSection('private'); setQuery(''); }}>私信</button>
        <button type="button" role="tab" aria-selected={section === 'notifications'} className={section === 'notifications' ? 'on' : ''}
          onClick={() => { setSection('notifications'); setQuery(''); void loadNotifications(); }}>
          消息{unreadNotificationCount > 0 && <i className="im-primary-unread" aria-label={unreadNotificationCount + ' 条未读消息'} />}
        </button>
      </div>

      <label className="im-search">
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder={section === 'private' ? '搜索昵称或 @用户名（真实姓名不公开）' : '搜索消息标题或内容'}
          aria-label={section === 'private' ? '搜索昵称或用户名；真实姓名不公开' : '搜索系统消息'} />
      </label>

      {section === 'private' ? (
        <>
          <div className="im-inbox-tabs">
            <button type="button" className={tab === 'discover' ? 'on' : ''} onClick={() => setTab('discover')}>找人</button>
            <button type="button" className={tab === 'messages' ? 'on' : ''} onClick={() => setTab('messages')}>私信 · {conversations.length}</button>
            <button type="button" className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>好友 · {friends.length}</button>
            <button type="button" className={tab === 'reqs' ? 'on' : ''} onClick={() => setTab('reqs')}>请求{reqs.length > 0 ? ' · ' + reqs.length : ''}</button>
            <button type="button" className={tab === 'blocked' ? 'on' : ''} onClick={() => setTab('blocked')}>黑名单 · {blockedMembers.length}</button>
          </div>

          {msg && <p className="im-inbox-message" role="status">{msg}</p>}

          {searchTerm || tab === 'discover' ? (
        <div className="im-inbox-list" aria-live="polite">
          <div className="im-inbox-search-caption">
            <span>{searchTerm ? '搜索站内成员' : '发现成员'}</span>
            <small>{searchTerm ? '支持昵称、用户名和 @用户名' : '只显示已完成加入的成员 · 最多 20 位'}</small>
          </div>
          <label className="im-request-email-option">
            <input
              type="checkbox"
              checked={sendRequestEmailReminder}
              disabled={friendActionId !== null}
              onChange={event => setSendRequestEmailReminder(event.target.checked)}
            />
            <span className="im-request-email-copy">
              <strong>同时发送邮件提醒</strong>
              <small>仅对下一次新好友申请生效，不会重复提醒</small>
            </span>
            <span className="im-request-email-tag">可选</span>
          </label>
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
              <div className="im-inbox-empty-title">{searchTerm ? '没有找到匹配成员' : '暂时没有其他可发现的成员'}</div>
              <div className="im-inbox-empty-copy">
                {searchTerm
                  ? '请使用对方注册时的昵称或用户名（可以带 @）。真实姓名仅管理员可见；尚未完成加入的账号不会出现在搜索结果中。'
                  : '这里会列出其他已完成加入的成员。尚未完成加入的账号暂时不会出现在好友搜索中。'}
              </div>
            </div>
          ) : searchResults.map(person => {
            const isFriend = friends.some(friend => friend.id === person.id);
            const hasIncomingRequest = reqs.some(request => request.id === person.id);
            const hasOutgoingRequest = sentRequestIds.includes(person.id);
            const isBlocked = blockedMembers.some(blocked => blocked.id === person.id);
            const busy = friendActionId === person.id;
            return (
              <div key={person.id} className="im-inbox-row" style={{ cursor: 'default' }}>
                <ProfileAvatar person={person} />
                <span className="im-inbox-person">
                  <span className="im-inbox-name" style={{ display: 'block' }}>{person.display_name ?? person.username}</span>
                  <span className="im-inbox-preview" style={{ display: 'block' }}>@{person.username}</span>
                </span>
                <span className="im-inbox-search-action">
                  {isBlocked ? (
                    <button type="button" disabled>已拉黑</button>
                  ) : isFriend ? (
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
                  <ProfileAvatar asSpan person={{ id: conversation.other_profile_id, username: conversation.username, display_name: conversation.display_name, avatar_path: conversation.avatar_path }} />
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
                  <div className="im-inbox-empty-copy">点击「找人」浏览所有已加入成员，也可以搜索对方的注册昵称或 @用户名。真实姓名仅管理员可见。</div>
                </div>
              ) : filteredFriends.map(friend => (
                <div key={friend.id} className="im-inbox-row" style={{ cursor: 'default' }}>
                  <ProfileAvatar person={friend} />
                  <span className="im-inbox-person">
                    <span className="im-inbox-name" style={{ display: 'block' }}>{friend.display_name ?? friend.username}</span>
                    <span className="im-inbox-preview" style={{ display: 'block' }}>@{friend.username} · 已成为好友</span>
                  </span>
                  <div className="im-friend-actions">
                    <button type="button" disabled={friendActionId === friend.id} onClick={() => openChat(friend)}>发消息</button>
                    <button type="button" className="danger" disabled={!!friendActionId} onClick={() => void removeFriend(friend)}>解除好友</button>
                    <button type="button" className="danger" disabled={!!friendActionId} onClick={() => void blockMember(friend)}>拉黑</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'blocked' && (
            <div className="im-inbox-list">
              {filteredBlocked.length === 0 ? (
                <div className="im-inbox-empty">
                  <div className="im-inbox-empty-title">黑名单为空</div>
                  <div className="im-inbox-empty-copy">你拉黑的成员会显示在这里。解除拉黑后，需要重新添加好友才能恢复私聊。</div>
                </div>
              ) : filteredBlocked.map(person => (
                <div key={person.id} className="im-inbox-row" style={{ cursor: 'default' }}>
                  <ProfileAvatar person={person} />
                  <span className="im-inbox-person">
                    <span className="im-inbox-name" style={{ display: 'block' }}>{person.display_name ?? person.username}</span>
                    <span className="im-inbox-preview" style={{ display: 'block' }}>@{person.username} · 已被你拉黑</span>
                  </span>
                  <div className="im-friend-actions">
                    <button type="button" disabled={!!friendActionId} onClick={() => void unblockMember(person)}>解除拉黑</button>
                  </div>
                </div>
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
                  <ProfileAvatar person={friend} />
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
        </>
      ) : (
        <>
          <div className="im-notification-toolbar">
            <button type="button" className={notificationFilter === 'all' ? 'on' : ''}
              onClick={() => setNotificationFilter('all')}>全部（{notifications.length}）</button>
            <button type="button" className={notificationFilter === 'unread' ? 'on' : ''}
              onClick={() => setNotificationFilter('unread')}>未读（{unreadNotificationCount}）</button>
            <button type="button" style={{ marginLeft: 'auto' }}
              onClick={() => void markAllNotificationsRead()}
              disabled={notificationActionBusy || unreadNotificationCount === 0}>
              {notificationActionBusy ? '处理中…' : '全部标为已读'}
            </button>
            <span className="im-notification-count">{unreadNotificationCount ? unreadNotificationCount + ' 条未读' : '已全部读完'}</span>
          </div>
          {notificationActionError && <p className="im-inbox-message" role="alert">{notificationActionError}</p>}
          {notificationsLoading && <div className="im-inbox-empty" role="status">正在加载消息…</div>}
          {!notificationsLoading && notificationsError && (
            <div className="im-inbox-empty">
              <div className="im-inbox-empty-title">消息暂时无法显示</div>
              <div className="im-inbox-empty-copy">{notificationsError}</div>
              <button type="button" className="im-inbox-primary" onClick={() => void loadNotifications()}>重新加载</button>
            </div>
          )}
          {!notificationsLoading && !notificationsError && visibleNotifications.length === 0 && (
            <div className="im-inbox-empty">
              <div className="im-inbox-empty-title">{notificationFilter === 'unread' ? '没有未读消息' : '暂时没有消息'}</div>
              <div className="im-inbox-empty-copy">账号提醒、管理员消息和其他系统通知会显示在这里。</div>
            </div>
          )}
          {!notificationsLoading && !notificationsError && visibleNotifications.length > 0 && (
            <div className="im-notification-list" aria-live="polite">
              {visibleNotifications.map(item => (
                <article key={item.id} className={'im-notification-row' + (!item.is_read ? ' unread' : '')}
                  role="button" tabIndex={0}
                  aria-label={(item.is_read ? '' : '未读，') + (item.title || '系统消息') + '，打开消息'}
                  onClick={() => void openSystemMessage(item)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void openSystemMessage(item);
                    }
                  }}>
                  <span className={'im-notification-icon' + (item.type === 'moderation' ? ' warning' : '')} aria-hidden="true">
                    {item.type === 'moderation' ? '⚠' : item.type === 'admin_message' ? '✉' : item.type === 'notice' ? '▤' : '•'}
                  </span>
                  <span className="im-notification-main">
                    <span className="im-notification-title-line">
                      <span className="im-notification-title">
                        {item.title || (item.type === 'moderation' ? '账号提醒' : item.type === 'admin_message' ? '管理员消息' : '系统消息')}
                      </span>
                      {!item.is_read && <span className="im-notification-unread">未读</span>}
                    </span>
                    {item.body && <span className="im-notification-body">{item.body}</span>}
                    <span className="im-notification-meta">
                      <span>{item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : ''}</span>
                      <span className="im-notification-type">{notificationTypeLabel[item.type ?? ''] ?? '系统消息'}</span>
                    </span>
                  </span>
                  <span className="im-notification-arrow" aria-hidden="true">›</span>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
