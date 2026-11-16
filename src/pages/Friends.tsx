import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { useSignedUrl } from '../lib/media';
import { RowSkeleton, useDelayedLoading } from '../components/fx/Skeleton';
import { preloadRoute } from '../lib/routePreload';
import { confirmDialog } from '../lib/dialog';
import ChatConversationItem from '../components/chatcn/ChatConversationItem';
import './Friends.chatcn.css';
import LargeTitleBar from '../components/LargeTitleBar';
import SwipeToDelete, { showUndoToast } from '../components/SwipeToDelete';

type Friend = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_path: string | null;
  created_at?: string;
};

type MemberSearchResult = Friend;
type ConversationFilter = 'all' | 'unread' | 'direct' | 'groups';

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
  is_group?: boolean;
  group_name?: string | null;
  group_avatar_path?: string | null;
  member_count?: number;
};

function GroupConversationAvatar({ size = 58 }: { size?: number }) {
  return <span className="chatcn-group-avatar" style={{ width: size, height: size }} aria-hidden="true"><svg viewBox="0 0 24 24" width="58%" height="58%" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M2.5 20v-1.3a6.5 6.5 0 0 1 11.2-4.4" /><circle cx="18" cy="9" r="2.3" /><path d="M16.2 14.3a5.4 5.4 0 0 1 5.3 5.4V20h-4.2" /></svg></span>;
}

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
  if (body.startsWith('[[im-file:')) return item.last_message_sender_id === myId ? '你发送了一个文件' : '发送了一个文件';
  return body || '消息';
}

function ChatInboxIcon({ name }: { name: string }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 26,
    height: 26,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'all':
      return <svg {...common}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 4a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" /></svg>;
    case 'unread':
      return <svg {...common}><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 4a8.4 8.4 0 0 1 3.8-.9" /><circle cx="19" cy="18.5" r="3.1" fill="currentColor" stroke="none" /></svg>;
    case 'direct':
      return <svg {...common}><circle cx="12" cy="7.2" r="4" /><path d="M4.2 21v-1.8a7.8 7.8 0 0 1 15.6 0V21z" /></svg>;
    case 'groups':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M2.5 20v-1.3a6.5 6.5 0 0 1 11.2-4.4" /><circle cx="18" cy="9" r="2.3" /><path d="M16.2 14.3a5.4 5.4 0 0 1 5.3 5.4V20h-4.2" /></svg>;
    case 'requests':
      return <svg {...common}><path d="M20.5 11.3a8.5 8.5 0 0 1-8.4 8.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3" /><path d="M15 14.5h6m-3-3 3 3-3 3" /></svg>;
    case 'settings':
      return <svg {...common}><path d="M12 2.8 14 4l2.4-.2 1 2.2 2 1.2-.3 2.4 1.2 2-1.2 2 .3 2.4-2 1.2-1 2.2L14 19l-2 1.2L10 19l-2.4.2-1-2.2-2-1.2.3-2.4-1.2-2 1.2-2-.3-2.4 2-1.2 1-2.2L10 4z" /><circle cx="12" cy="11.8" r="3" /></svg>;
    case 'read':
      return <svg {...common}><path d="M4 6h8M4 11h5M4 16l3.2 3.2L20 6.5" strokeWidth="2.2" /></svg>;
    case 'notifications':
      return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
    case 'search':
      return <svg {...common}><circle cx="10.8" cy="10.8" r="7.2" strokeWidth="2.2" /><path d="m16.2 16.2 5 5" strokeWidth="2.2" /></svg>;
    default:
      return null;
  }
}

/** 把条目插回原位（撤销 / 隐藏失败时用），下标夹在合法范围内。 */
function insertAt<T>(list: T[], item: T, index: number): T[] {
  const next = [...list];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
  return next;
}

export default function Friends() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const me = useAuth().session!.user.id;
  const [myAvatarPath, setMyAvatarPath] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState('');
  const myAvatarUrl = useSignedUrl('avatars', myAvatarPath);
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterMenuPortalRef = useRef<HTMLDivElement>(null);
  const [filterMenuBounds, setFilterMenuBounds] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSelectedIds, setGroupSelectedIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);
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
  const showInboxSkeleton = useDelayedLoading(loading);
  // 进消息中心后空闲时预热聊天页分块：在列表里挑会话、点进去是下一步最可能的动作，
  // 提前取回来，点会话时不用等分块。
  useEffect(() => {
    const timer = window.setTimeout(() => { preloadRoute('/chat'); }, 1200);
    return () => window.clearTimeout(timer);
  }, []);
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [sentRequestIds, setSentRequestIds] = useState<string[]>([]);
  const [sendRequestEmailReminder, setSendRequestEmailReminder] = useState(false);
  const [friendActionId, setFriendActionId] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);
  const notificationsLoadSequenceRef = useRef(0);
  // 私聊页在 .im-inbox 内层容器里滚动（窗口 scrollY 不动），大标题跟这个容器。
  const inboxRef = useRef<HTMLDivElement>(null);
  // 左滑隐藏进行中（已从界面拿掉、5 秒撤销窗口内、还没真正调 hide_conversation）的会话 id：
  // 15 秒兜底刷新 / realtime 重拉会把还没提交的会话带回来，渲染时先过滤掉，别让它在撤销窗口里闪回来。
  const [pendingHiddenIds, setPendingHiddenIds] = useState<ReadonlySet<number>>(new Set());
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const showNotifSkeleton = useDelayedLoading(notificationsLoading);
  const [notificationsError, setNotificationsError] = useState('');
  const [notificationActionError, setNotificationActionError] = useState('');
  const [notificationActionBusy, setNotificationActionBusy] = useState(false);
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'unread'>('all');
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.from('profiles')
        .select('avatar_path, username')
        .eq('id', me)
        .maybeSingle();
      if (active && !error) {
        setMyAvatarPath(data?.avatar_path ?? null);
        setMyUsername(data?.username ?? '');
      }
    })();
    return () => { active = false; };
  }, [me]);

  useEffect(() => {
    if (!filterMenuOpen) {
      setFilterMenuBounds(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = filterTriggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
      const viewportHeight = window.innerHeight;
      const edge = 14;
      const gap = 9;
      // Match the responsive width contract established on main.
      const width = Math.min(300, Math.max(Math.min(184, viewportWidth - edge * 2), viewportWidth * 0.44));
      const spaceBelow = Math.max(0, viewportHeight - rect.bottom - edge - gap);
      const spaceAbove = Math.max(0, rect.top - edge - gap);
      const idealHeight = Math.min(560, viewportHeight * 0.72);
      const openAbove = spaceBelow < Math.min(idealHeight, 440) && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const maxHeight = Math.min(idealHeight, availableHeight);
      const top = openAbove
        ? Math.max(edge, rect.top - maxHeight - gap)
        : rect.bottom + gap;
      const left = Math.max(edge, Math.min(rect.right - width, viewportWidth - width - edge));

      setFilterMenuBounds({ top, left, width, maxHeight });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [filterMenuOpen]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    const closeOnPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      const clickedTriggerArea = Boolean(filterMenuRef.current?.contains(target));
      const clickedMenu = Boolean(filterMenuPortalRef.current?.contains(target));
      if (!clickedTriggerArea && !clickedMenu) setFilterMenuOpen(false);
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointer);
    document.addEventListener('keydown', closeOnKey);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointer);
      document.removeEventListener('keydown', closeOnKey);
    };
  }, [filterMenuOpen]);

  async function load() {
    const requestId = ++loadSequenceRef.current;
    const [friendResult, requestResult, conversationResult, groupResult, sentRequestResult, blockedResult] = await Promise.all([
      supabase.rpc('my_friends'),
      supabase.rpc('friend_requests'),
      supabase.rpc('my_conversations'),
      supabase.rpc('my_group_conversations'),
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
      const directConversations = (conversationResult.data ?? []) as ConversationPreview[];
      const groupConversations = ((groupResult.data ?? []) as Array<{ conversation_id: number; conversation_created_at: string; group_name: string | null; group_avatar_path: string | null; member_count: number; last_message_id: number | null; last_message_body: string | null; last_message_at: string | null; last_message_sender_id: string | null; last_message_deleted: boolean; unread_count: number }>).map(group => ({
        conversation_id: group.conversation_id, conversation_created_at: group.conversation_created_at,
        other_profile_id: '', username: group.group_name ?? '群聊', display_name: group.group_name ?? '群聊', avatar_path: null,
        last_message_id: group.last_message_id, last_message_body: group.last_message_body, last_message_at: group.last_message_at,
        last_message_sender_id: group.last_message_sender_id, last_message_deleted: group.last_message_deleted,
        unread_count: Number(group.unread_count) || 0, other_last_read_message_id: null,
        is_group: true, group_name: group.group_name, group_avatar_path: group.group_avatar_path, member_count: Number(group.member_count) || 0,
      }));
      setConversations([...directConversations, ...groupConversations].sort((a, b) => new Date(b.last_message_at ?? b.conversation_created_at).getTime() - new Date(a.last_message_at ?? a.conversation_created_at).getTime()));
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
  const unhiddenConversations = useMemo(
    () => conversations.filter(c => !pendingHiddenIds.has(c.conversation_id)),
    [conversations, pendingHiddenIds],
  );
  const filteredConversations = useMemo(
    () => unhiddenConversations.filter(c => (c.display_name ?? c.username).toLocaleLowerCase().includes(normalizedQuery)
      || c.username.toLocaleLowerCase().includes(normalizedQuery)
      || previewText(c, me).toLocaleLowerCase().includes(normalizedQuery)),
    [unhiddenConversations, normalizedQuery, me],
  );
  // my_conversations() exposes one other_profile_id per result, so current records are direct chats.
  // Keep the group filter visible, but do not misrepresent direct conversations as groups.
  const visibleConversations = useMemo(() => {
    if (conversationFilter === 'unread') return filteredConversations.filter(c => Number(c.unread_count) > 0);
    if (conversationFilter === 'groups') return filteredConversations.filter(c => c.is_group);
    if (conversationFilter === 'direct') return filteredConversations.filter(c => !c.is_group);
    return filteredConversations;
  }, [filteredConversations, conversationFilter]);
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
    if (section !== 'private' || tab !== 'discover') {
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
      state: { name: conversation.group_name ?? conversation.display_name ?? conversation.username, isGroup: Boolean(conversation.is_group) },
    });
  }

  async function createGroupConversation() {
    const cleanName = groupName.trim();
    if (!cleanName || groupSelectedIds.length < 1 || creatingGroup) return;
    setCreatingGroup(true);
    setMsg('');
    const { data, error } = await supabase.rpc('create_group_conversation', { p_group_name: cleanName, p_member_ids: groupSelectedIds });
    const conversationId = Number(data);
    if (error || !Number.isSafeInteger(conversationId) || conversationId < 1) {
      setMsg('创建群聊失败：' + (error?.message ?? '暂时无法创建群聊'));
      setCreatingGroup(false);
      return;
    }
    setShowCreateGroup(false); setGroupName(''); setGroupSelectedIds([]); setCreatingGroup(false);
    await load();
    nav('/chat/' + conversationId, { state: { name: cleanName, isGroup: true } });
  }

  async function markAllConversationsRead() {
    if (markingAllRead) return;
    const unread = conversations.filter(conversation => Number(conversation.unread_count) > 0);
    if (unread.length === 0) return;
    setMarkingAllRead(true);
    setMsg('');
    try {
      const results = await Promise.all(unread.map(conversation =>
        supabase.rpc('mark_conversation_read', { p_conversation_id: conversation.conversation_id }),
      ));
      const failed = results.filter(result => result.error);
      if (failed.length > 0) {
        setMsg(failed.length + ' 个会话标记已读失败，请检查网络后重试。');
      } else {
        await load();
        setMsg('所有私信已标记为已读。');
        window.dispatchEvent(new Event('notif-read'));
      }
    } catch (error) {
      console.error('mark all conversations read failed', error);
      setMsg('标记已读失败，请稍后重试。');
    } finally {
      setMarkingAllRead(false);
    }
  }

  /** 左滑隐藏的真正提交：只在 5 秒撤销窗口过去后调 hide_conversation。 */
  async function commitHideConversation(conversation: ConversationPreview, index: number) {
    const { error } = await supabase.rpc('hide_conversation', { p_conversation_id: conversation.conversation_id });
    setPendingHiddenIds(prev => {
      const next = new Set(prev);
      next.delete(conversation.conversation_id);
      return next;
    });
    if (error) {
      // 隐藏接口还没上生产库时也会走到这里：把行放回原位并报错，不要静默丢会话。
      setConversations(prev => insertAt(prev, conversation, index));
      setMsg('隐藏失败：' + error.message);
      return;
    }
    setMsg('已隐藏该会话。');
  }

  /**
   * 左滑隐藏（延迟提交，照我的发布同一模式）：先只在界面上拿掉；
   * 5 秒内点 toast 上的“撤销”就放回原位，不点才真正调 hide_conversation。
   * 隐藏只影响当前用户，对方不受影响；新消息进来数据库触发器会自动取消隐藏。
   */
  function swipeHideConversation(conversation: ConversationPreview, index: number) {
    setPendingHiddenIds(prev => new Set(prev).add(conversation.conversation_id));
    setConversations(prev => prev.filter(item => item.conversation_id !== conversation.conversation_id));
    showUndoToast({
      message: '已隐藏该会话',
      onUndo: () => {
        setPendingHiddenIds(prev => {
          const next = new Set(prev);
          next.delete(conversation.conversation_id);
          return next;
        });
        setConversations(prev => insertAt(prev, conversation, index));
      },
      onCommit: () => {
        void commitHideConversation(conversation, index);
      },
    });
  }

  async function withdrawRequest(person: MemberSearchResult) {
    if (friendActionId) return;
    if (!(await confirmDialog(`撤回给「${person.display_name ?? person.username}」的好友申请？`, { confirmText: '撤回申请' }))) return;
    setFriendActionId(person.id);
    setMsg('');
    try {
      const { error } = await supabase.rpc('withdraw_friend_request', { target: person.id });
      if (error) { setMsg('撤回失败：' + error.message); return; }
      setMsg('已撤回好友申请。');
      await load();
    } finally {
      setFriendActionId(null);
    }
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
    anonymous_question: '匿名提问',
    anonymous_answer: '匿名回答',
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
    <div className="page im-inbox chatcn-inbox" ref={inboxRef}>
      <style>{`
        .im-inbox{position:relative;isolation:isolate;width:100%;height:100%;min-height:0;max-width:none;margin:0;padding:18px 16px 28px!important;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;background:transparent!important}
        .im-inbox:before{content:'';position:absolute;z-index:-1;pointer-events:none;inset:0;background:none}
        .im-inbox-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 2px 20px}
        .im-inbox-kicker{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#b7d9ff;margin-bottom:5px}
        .im-inbox-title{font-size:30px;line-height:1.15;font-weight:650;letter-spacing:-.01em;color:#22314a}
        .im-inbox-subtitle{font-size:12px;color:#7c8798;margin-top:6px}
        .im-search{display:flex;align-items:center;gap:10px;margin:0 0 16px;padding:0 14px;height:48px;border-radius:14px;background:#ffffff;border:1px solid rgba(34,49,74,.12)}
        .im-search span{font-size:20px;color:#8a97a5}
        .im-search input{flex:1;min-width:0;background:transparent!important;border:0!important;box-shadow:none!important;outline:none!important;color:#22314a!important;padding:10px 0!important;font-size:14px}
        .im-search input::placeholder{color:#9aa7b4}
        .im-inbox-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:14px}
        .im-inbox-tabs button{min-width:0;min-height:42px;border-radius:12px;border:1px solid rgba(34,49,74,.12);background:#ffffff;color:#5a6b7f;font-size:13px}
        .im-inbox-tabs button.on{color:#fff;background:#22314a;border-color:#22314a}
        .im-primary-tabs{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin:0 0 16px;border:1px solid rgba(122,100,66,.18);border-radius:12px;background:#f1e8d5}
        .im-primary-thumb{position:absolute;top:4px;left:4px;width:calc(50% - 6px);height:calc(100% - 8px);border-radius:9px;background:#fffdf9;border:1px solid rgba(122,100,66,.14);box-shadow:0 1px 3px rgba(74,58,32,.16);transition:transform .3s cubic-bezier(.45,0,.25,1)}
        .im-primary-thumb::after{content:'';position:absolute;left:50%;bottom:5px;transform:translateX(-50%);width:16px;height:2.5px;border-radius:2px;background:#b0404f}
        .im-primary-thumb.right{transform:translateX(calc(100% + 4px))}
        .im-primary-tabs button{position:relative;z-index:1;min-height:40px;border:0;border-radius:9px;background:transparent;color:#7d7264;font-size:14px;font-weight:600;letter-spacing:.06em;transition:color .2s ease}
        .im-primary-tabs button.on{background:transparent;color:#22314a}
        .im-primary-unread{display:inline-block;width:8px;height:8px;margin-left:8px;vertical-align:2px;border-radius:50%;background:#d94f5c;box-shadow:0 0 0 3px rgba(217,79,92,.15)}
        .im-notification-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 14px}
        .im-notification-toolbar button{min-height:36px;padding:7px 12px;border-radius:10px;border:1px solid rgba(34,49,74,.12);background:#ffffff;color:#5a6b7f;font-size:12px}
        .im-notification-toolbar button.on{background:#22314a;border-color:#22314a;color:#fff}
        .im-notification-toolbar button:disabled{opacity:.45}
        .im-notification-count{margin-left:auto;color:#8a97a5;font-size:11px}
        .im-notification-list{display:flex;flex-direction:column;gap:10px}
        .im-notification-row{display:flex;align-items:flex-start;gap:12px;width:100%;padding:14px;border:1px solid rgba(34,49,74,.1);border-radius:16px;background:#ffffff;color:#22314a;text-align:left;cursor:pointer;transition:border-color .18s ease,transform .18s ease}
        .im-notification-row.unread{border-color:rgba(176,64,79,.35);background:#fdf6ee}
        .im-notification-row:active{transform:scale(.99)}
        .im-notification-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:12px;background:#eef1f4;color:#54687f;font-size:18px}
        .im-notification-icon.warning{background:#faf0dd;color:#9a7420}
        .im-notification-main{flex:1;min-width:0}
        .im-notification-title-line{display:flex;align-items:center;gap:8px;min-width:0}
        .im-notification-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:650;color:#22314a}
        .im-notification-unread{flex:none;border-radius:99px;padding:2px 7px;background:#fbe9ea;color:#b0404f;font-size:10px;font-weight:700}
        .im-notification-body{margin:7px 0 0;color:#5a6b7f;font-size:12px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere}
        .im-notification-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;color:#8a97a5;font-size:10px}
        .im-notification-type{padding:2px 7px;border:1px solid rgba(34,49,74,.14);border-radius:99px;white-space:nowrap}
        .im-notification-arrow{flex:none;margin-top:8px;color:#8a97a5;font-size:20px}
        .im-inbox-list{display:flex;flex-direction:column;gap:9px}
        .im-inbox-row{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:12px;border-radius:16px;border:1px solid rgba(34,49,74,.1);background:#ffffff;color:#22314a;cursor:pointer;transition:transform .18s ease,border-color .18s ease,background .18s ease}
        button.im-inbox-row:active{transform:scale(.985);background:#f2f5f8;border-color:rgba(34,49,74,.2)}
        .im-list-avatar{flex:none;display:grid;place-items:center;border-radius:50%;overflow:hidden;color:#54687f;font-size:18px;font-weight:600;background:#ece4d0;border:1px solid rgba(34,49,74,.12)}
        .im-list-avatar img{width:100%;height:100%;object-fit:cover}
        .im-avatar-link{flex:none;display:inline-block;padding:0;border:0;background:none;border-radius:50%;cursor:pointer;line-height:0;-webkit-tap-highlight-color:transparent}
        .im-avatar-link:active{transform:scale(.94)}
        .im-inbox-person{flex:1;min-width:0}
        .im-inbox-name{font-size:14px;font-weight:650;color:#22314a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .im-inbox-preview{font-size:12px;color:#7c8798;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .im-inbox-time{font-size:10px;color:#9aa7b4;white-space:nowrap;margin-left:4px}
        .im-inbox-arrow{color:#9aa7b4;font-size:21px;padding:0 3px}
        .im-unread{min-width:20px;height:20px;border-radius:99px;padding:0 6px;display:grid;place-items:center;background:#22314a;color:white;font-size:10px;font-weight:700}
        .im-inbox-empty{padding:28px 18px;text-align:center;border-radius:16px;border:1px solid rgba(34,49,74,.1);background:#ffffff;color:#5a6b7f}
        .im-inbox-empty-title{font-weight:650;color:#22314a;font-size:15px;margin-bottom:7px}
        .im-inbox-empty-copy{font-size:12px;line-height:1.7}
        .im-inbox-message{margin:0 0 12px;padding:10px 13px;border-radius:12px;background:#f2f5f8;border:1px solid rgba(34,49,74,.1);color:#43536a;font-size:12px}
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
        .im-friend-actions button{min-height:34px;padding:7px 9px;border-radius:10px;border:1px solid rgba(34,49,74,.16);background:#ffffff;color:#43536a;font-size:11px;white-space:nowrap}
        .im-friend-actions button.danger{border-color:rgba(176,64,79,.35);background:#fdf0f1;color:#b0404f}
        @media(max-width:520px){.im-inbox-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.im-inbox-row{flex-wrap:wrap}.im-friend-actions{width:100%;justify-content:flex-end;padding-left:58px}}
        .im-inbox-primary{border:1px solid #22314a;background:#22314a;color:white;border-radius:11px;padding:9px 14px;font-weight:600;margin-top:14px}
        .im-inbox-search-caption{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:3px 3px 5px;color:#22314a;font-size:13px;font-weight:650}
        .im-inbox-search-caption small{font-size:10px;font-weight:450;color:#8a97a5}
        .im-inbox-search-action{display:flex;align-items:center;flex:none}
        .im-inbox-search-action button{width:auto!important;min-width:82px;padding:8px 11px;border-radius:11px;border:1px solid rgba(34,49,74,.18);background:#ffffff;color:#43536a;font-size:11px;font-weight:600;white-space:nowrap}
        .im-inbox-search-action button.is-friend{background:rgba(70,170,143,.2);border-color:rgba(142,226,200,.28)}
        .im-inbox-search-action button.is-incoming{background:#22314a;border-color:#22314a;color:#fff}
        .im-inbox-search-action button:disabled{opacity:.72;cursor:default}
        .im-search:focus-within{border-color:rgba(34,49,74,.3);box-shadow:0 0 0 3px rgba(34,49,74,.06)}
        @media(max-width:768px){.im-inbox{padding:calc(18px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(118px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))!important}}
        @media(prefers-reduced-motion:reduce){.im-inbox-row{transition:none}}


        /* iMessage-inspired conversation inbox, scoped so friend/request lists keep their existing layout. */
        .im-inbox{color:#1d293b!important;background:#fff!important}
        .im-inbox:before{background:radial-gradient(ellipse at 15% 0%,rgba(190,214,248,.16),transparent 38%),linear-gradient(180deg,#fff 0%,#fff 100%)}
        .im-inbox-head{margin:4px 2px 18px;padding:2px 2px 0}
        .im-inbox-title{color:#1d293b;font-size:29px;font-weight:760;letter-spacing:-.035em}
        .im-inbox-subtitle{color:#8793a4;font-size:12px}
        .im-primary-tabs{border:1px solid rgba(120,145,180,.17);border-radius:18px;background:rgba(241,246,252,.78);box-shadow:inset 0 1px 0 rgba(255,255,255,.95);-webkit-backdrop-filter:blur(22px) saturate(1.25);backdrop-filter:blur(22px) saturate(1.25)}
        .im-primary-thumb{border:1px solid rgba(255,255,255,.96);border-radius:14px;background:rgba(255,255,255,.94);box-shadow:0 4px 12px rgba(42,65,101,.08),inset 0 1px 0 #fff}
        .im-primary-thumb::after{display:none}
        .im-primary-tabs button{min-height:42px;color:#7e8ba0;font-size:13px;font-weight:650;letter-spacing:0}
        .im-primary-tabs button.on{background:transparent;color:#245fa6}
        .im-primary-unread{background:#3478d4;box-shadow:0 0 0 3px rgba(52,120,212,.12)}
        .im-search{height:46px;border:1px solid rgba(119,143,176,.17);border-radius:17px;background:rgba(248,250,253,.86);box-shadow:inset 0 1px 0 #fff,0 5px 16px rgba(48,68,103,.035);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
        .im-search:focus-within{border-color:rgba(86,139,207,.48);box-shadow:0 0 0 3px rgba(86,139,207,.10),inset 0 1px 0 #fff}
        .im-search input{color:#26364d!important}
        .im-inbox-tabs{display:flex;flex-wrap:nowrap;gap:7px;margin:0 -2px 14px;padding:2px 2px 5px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch}
        .im-inbox-tabs::-webkit-scrollbar{display:none}
        .im-inbox-tabs button{flex:0 0 auto;min-width:max-content;min-height:38px;padding:0 13px;border:1px solid rgba(119,143,176,.18);border-radius:999px;background:rgba(255,255,255,.9);color:#6d7c91;font-size:12px;white-space:nowrap}
        .im-inbox-tabs button.on{background:#3478d4;border-color:#3478d4;color:#fff;box-shadow:0 5px 14px rgba(52,120,212,.16)}
        .im-conversation-list{display:flex;flex-direction:column;gap:0;padding:3px 0;overflow:hidden;border:1px solid rgba(119,143,176,.15);border-radius:21px;background:rgba(255,255,255,.9);box-shadow:0 9px 25px rgba(42,62,96,.045);-webkit-backdrop-filter:blur(18px) saturate(1.14);backdrop-filter:blur(18px) saturate(1.14)}
        .im-conversation-list > .im-inbox-row{position:relative;display:flex;flex-wrap:nowrap;align-items:center;gap:13px;min-height:76px;padding:13px 15px;border:0;border-bottom:1px solid rgba(118,140,171,.12);border-radius:0;background:transparent;color:#1d293b;transition:background .18s ease}
        .im-conversation-list > .im-inbox-row:last-child{border-bottom:0}
        .im-conversation-list > .im-inbox-row.unread{background:linear-gradient(90deg,rgba(236,245,255,.82),rgba(255,255,255,.72))}
        .im-conversation-list > .im-inbox-row.unread .im-inbox-name{font-weight:760;color:#1c2e47}
        .im-conversation-list > .im-inbox-row:active{transform:none;background:rgba(235,243,253,.8);border-color:rgba(118,140,171,.12)}
        .im-conversation-list .im-list-avatar{border:1px solid rgba(255,255,255,.98);box-shadow:0 3px 10px rgba(39,58,90,.09);background:#eef2f8;color:#60718a}
        .im-conversation-list .im-inbox-person{flex:1;min-width:0}
        .im-conversation-list .im-inbox-name{color:#26364d;font-size:14px;font-weight:680;letter-spacing:-.01em}
        .im-conversation-list .im-inbox-preview{color:#8390a2;font-size:12px;line-height:1.45}
        .im-conversation-list .im-inbox-time{color:#8b97a8;font-size:10px;font-variant-numeric:tabular-nums}
        .im-conversation-list .im-unread{min-width:19px;height:19px;padding:0 6px;background:#3478d4;color:#fff;box-shadow:0 3px 8px rgba(52,120,212,.16)}
        .im-conversation-list .im-inbox-empty{border:0;border-radius:18px;background:transparent;box-shadow:none}
        .im-conversation-list .im-inbox-empty-title{color:#26364d}
        .im-conversation-list .im-inbox-primary{border:1px solid #3478d4;border-radius:13px;background:#3478d4;color:#fff;box-shadow:0 5px 14px rgba(52,120,212,.15)}
        .im-inbox-message{border-color:rgba(119,143,176,.16);border-radius:14px;background:rgba(245,248,252,.9);color:#5b6d84}
        .im-inbox-row:focus-visible,.im-primary-tabs button:focus-visible,.im-inbox-tabs button:focus-visible{outline:2px solid rgba(86,139,207,.85);outline-offset:2px}
        @media(max-width:520px){.im-conversation-list{border-radius:18px}.im-conversation-list > .im-inbox-row{gap:11px;padding:12px 13px}}
        @media(prefers-reduced-transparency:reduce){.im-primary-tabs,.im-search,.im-conversation-list{backdrop-filter:none;-webkit-backdrop-filter:none;background:#fff}}
        @media(prefers-reduced-motion:reduce){.im-inbox-row,.im-primary-thumb{transition:none}}
        /* LargeTitleBar：h1/p 复用原来 .im-inbox-title/.im-inbox-subtitle 的字号与颜色。 */
        .im-inbox-head h1{margin:0;font-size:29px;line-height:1.15;font-weight:760;letter-spacing:-.035em;color:#1d293b}
        .im-inbox-head p{margin:6px 0 0;font-size:12px;color:#8793a4}
        /* 会话行包了 SwipeToDelete 后不再是 .im-conversation-list 的直接子节点。
           ChatCN 行本身是 button.chatcn-conversation-item：布局/分隔线/未读态都在
           ChatConversationItem.css 里，只按嵌套路径补最后一行去分隔线
           （:last-child 现在落在 .swipe-delete 上，行自身的 :last-child 不再命中）；
           未读底色不重写，ChatCN 行只靠 .is-unread 加粗标题/预览。 */
        .im-conversation-list > .swipe-delete:last-child > .swipe-delete-surface > .chatcn-conversation-item{border-bottom:0}
        /* 滑出底色只露在右侧：表面本身要不透明（ChatCN 行按钮是透明底），否则印泥红会整行透出来；
           圆角归 0——ChatCN 列表是无边框平铺行，没有圆角容器要裁。 */
        .im-conversation-list .swipe-delete{--r:0}
        .im-conversation-list .swipe-delete-surface{background:#fff}
      `}</style>

      {/* 大标题收起：私信/消息分段、搜索框、找人/私信/好友/请求/黑名单 tab 行都在头外面，是头的兄弟节点，标题收起不影响它们。 */}
      <LargeTitleBar
        title="消息中心"
        subtitle="私信与账号通知，集中在这里"
        headerClassName="im-inbox-head"
        scrollContainerRef={inboxRef}
      />

      {/* ChatCN 功能条保留在下面：头像与筛选菜单（请求/通知/设置/全部标已读）都在这里，大标题只负责收起。 */}
      <header className="im-inbox-head chatcn-inbox-head">
        <button type="button" className="chatcn-profile-button" aria-label="打开个人主页" onClick={() => nav('/me')}>
          {myAvatarUrl ? <img src={myAvatarUrl} alt="" /> : <span className="chatcn-profile-fallback">{myUsername.slice(0, 1) || '我'}</span>}
        </button>
        <div className="chatcn-inbox-title">{section === 'private' ? '聊天' : '通知'}</div>
        {section === 'private' && (
          <div className="chatcn-filter-root" ref={filterMenuRef}>
            <button
              ref={filterTriggerRef}
              type="button"
              className="chatcn-filter-trigger"
              aria-haspopup="menu"
              aria-expanded={filterMenuOpen}
              onClick={() => setFilterMenuOpen(open => !open)}
            >
              <span>{{ all: '全部', unread: '未读', direct: '直接', groups: '群组' }[conversationFilter]}</span>
              <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden="true">
                <path d="m4.5 7.5 5.5 5 5.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {filterMenuOpen && filterMenuBounds && createPortal(
              <div
                ref={filterMenuPortalRef}
                className="chatcn-filter-menu"
                role="menu"
                aria-label="聊天筛选"
                style={{
                  position: 'fixed',
                  top: filterMenuBounds.top,
                  left: filterMenuBounds.left,
                  width: filterMenuBounds.width,
                  maxHeight: filterMenuBounds.maxHeight,
                }}
              >
                {([
                  { id: 'all', label: '全部', icon: 'all' },
                  { id: 'unread', label: '未读', icon: 'unread' },
                  { id: 'direct', label: '直接', icon: 'direct' },
                  { id: 'groups', label: '群组', icon: 'groups' },
                ] as const).map(option => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={conversationFilter === option.id}
                    className="chatcn-filter-option"
                    onClick={() => {
                      setSection('private');
                      setTab('messages');
                      setQuery('');
                      setConversationFilter(option.id);
                      setFilterMenuOpen(false);
                    }}
                  >
                    <span className="chatcn-filter-icon"><ChatInboxIcon name={option.icon} /></span>
                    <span>{option.label}</span>
                    {conversationFilter === option.id && (
                      <span className="chatcn-filter-check" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none"><path d="m4.5 12.5 5 5L20 6.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                    )}
                  </button>
                ))}
                <div className="chatcn-filter-separator" />
                <button type="button" className="chatcn-filter-option" role="menuitem"
                  onClick={() => { setSection('private'); setTab('reqs'); setQuery(''); setFilterMenuOpen(false); }}>
                  <span className="chatcn-filter-icon"><ChatInboxIcon name="requests" /></span><span>请求</span>
                </button>
                <button type="button" className="chatcn-filter-option" role="menuitem"
                  onClick={() => { setShowCreateGroup(true); setFilterMenuOpen(false); }}>
                  <span className="chatcn-filter-icon"><ChatInboxIcon name="groups" /></span><span>新建群聊</span>
                </button>
                <button type="button" className="chatcn-filter-option" role="menuitem"
                  onClick={() => { setFilterMenuOpen(false); nav('/me/notifications'); }}>
                  <span className="chatcn-filter-icon"><ChatInboxIcon name="notifications" /></span><span>通知</span>
                </button>
                <button type="button" className="chatcn-filter-option" role="menuitem"
                  onClick={() => { setFilterMenuOpen(false); nav('/me/settings/notifications'); }}>
                  <span className="chatcn-filter-icon"><ChatInboxIcon name="settings" /></span><span>设置</span>
                </button>
                <div className="chatcn-filter-separator" />
                <button type="button" className="chatcn-filter-option is-danger" role="menuitem"
                  disabled={markingAllRead || !conversations.some(conversation => Number(conversation.unread_count) > 0)}
                  onClick={() => { setFilterMenuOpen(false); void markAllConversationsRead(); }}>
                  <span className="chatcn-filter-icon"><ChatInboxIcon name="read" /></span>
                  <span>{markingAllRead ? '正在标记…' : '全部标记为已读'}</span>
                </button>
              </div>,
              document.body,
            )}
          </div>
        )}
      </header>

      <div className={'im-primary-tabs' + (section === 'private' ? ' chatcn-hidden' : '')} role="tablist" aria-label="消息分类">
        <span aria-hidden="true" className={'im-primary-thumb' + (section === 'notifications' ? ' right' : '')} />
        <button type="button" role="tab" aria-selected={section === 'private'} className={section === 'private' ? 'on' : ''}
          onClick={() => { setSection('private'); setQuery(''); }}>私信</button>
        <button type="button" role="tab" aria-selected={section === 'notifications'} className={section === 'notifications' ? 'on' : ''}
          onClick={() => { setSection('notifications'); setQuery(''); void loadNotifications(); }}>
          消息{unreadNotificationCount > 0 && <i className="im-primary-unread" aria-label={unreadNotificationCount + ' 条未读消息'} />}
        </button>
      </div>

      <label className="chatcn-inbox-search">
        <span className="chatcn-search-icon"><ChatInboxIcon name="search" /></span>
        <input value={query} onChange={e => setQuery(e.target.value)}
          placeholder={section === 'private' ? '搜索聊天' : '搜索消息标题或内容'}
          aria-label={section === 'private' ? '搜索聊天' : '搜索系统消息'} />
      </label>

      {section === 'private' ? (
        <>
          {tab !== 'messages' && (
            <div className="im-inbox-tabs">
              <button type="button" className={tab === 'discover' ? 'on' : ''} onClick={() => setTab('discover')}>找人</button>
              <button type="button" onClick={() => { setTab('messages'); setConversationFilter('all'); }}>私信 · {loading ? '…' : visibleConversations.length}</button>
              <button type="button" className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>好友 · {loading ? '…' : friends.length}</button>
              <button type="button" className={tab === 'reqs' ? 'on' : ''} onClick={() => setTab('reqs')}>请求{loading ? ' · …' : reqs.length > 0 ? ' · ' + reqs.length : ''}</button>
              <button type="button" className={tab === 'blocked' ? 'on' : ''} onClick={() => setTab('blocked')}>黑名单 · {loading ? '…' : blockedMembers.length}</button>
            </div>
          )}

          {msg && <p className="im-inbox-message" role="status">{msg}</p>}

          {tab === 'discover' ? (
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
                    <button type="button" disabled={busy} onClick={() => withdrawRequest(person)}>
                      {busy ? '处理中…' : '撤回申请'}
                    </button>
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
            <div className="im-inbox-list im-conversation-list">
              {showInboxSkeleton ? <RowSkeleton count={4} /> : loading ? null : visibleConversations.length === 0 ? (
                <div className="im-inbox-empty chatcn-empty-groups">
                  <strong>{conversationFilter === 'groups' ? '还没有群聊' : conversationFilter === 'unread' ? '没有未读消息' : '还没有聊天记录'}</strong>
                  <span>{conversationFilter === 'groups' ? '创建群聊并邀请好友，就可以在这里开始多人交流。' : conversationFilter === 'unread' ? '新的未读消息会自动出现在这里。' : '和好友开启一次对话，最近消息会自动显示在这里。'}</span>
                  {conversationFilter === 'groups'
                    ? <button type="button" className="im-inbox-primary" onClick={() => setShowCreateGroup(true)}>创建群聊</button>
                    : <button type="button" className="im-inbox-primary" onClick={() => { setTab('friends'); setConversationFilter('all'); }}>选择好友开始聊天</button>}
                </div>
              ) : visibleConversations.map(conversation => (
                <SwipeToDelete
                  key={conversation.conversation_id}
                  deleteLabel="隐藏"
                  onSwipeDelete={() => swipeHideConversation(
                    conversation,
                    conversations.findIndex(item => item.conversation_id === conversation.conversation_id),
                  )}
                >
                  <ChatConversationItem
                    title={conversation.group_name ?? conversation.display_name ?? conversation.username}
                    avatar={conversation.is_group ? <GroupConversationAvatar size={58} /> : <ProfileAvatar asSpan size={58} person={{ id: conversation.other_profile_id, username: conversation.username, display_name: conversation.display_name, avatar_path: conversation.avatar_path }} />}
                    preview={(conversation.last_message_sender_id === me && conversation.last_message_id ? '我：' : '') + (conversation.is_group && conversation.last_message_sender_id !== me ? '成员：' : '') + previewText(conversation, me)}
                    time={formatInboxTime(conversation.last_message_at, conversation.conversation_created_at)}
                    unreadCount={Number(conversation.unread_count) || 0}
                    onPointerDown={() => preloadRoute('/chat')}
                    onClick={() => openConversation(conversation)}
                  />
                </SwipeToDelete>
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
              onClick={() => setNotificationFilter('all')}>全部（{notificationsLoading ? '…' : notifications.length}）</button>
            <button type="button" className={notificationFilter === 'unread' ? 'on' : ''}
              onClick={() => setNotificationFilter('unread')}>未读（{notificationsLoading ? '…' : unreadNotificationCount}）</button>
            <button type="button" style={{ marginLeft: 'auto' }}
              onClick={() => void markAllNotificationsRead()}
              disabled={notificationActionBusy || unreadNotificationCount === 0}>
              {notificationActionBusy ? '处理中…' : '全部标为已读'}
            </button>
            <span className="im-notification-count">{notificationsLoading ? '加载中…' : unreadNotificationCount ? unreadNotificationCount + ' 条未读' : '已全部读完'}</span>
          </div>
          {notificationActionError && <p className="im-inbox-message" role="alert">{notificationActionError}</p>}
          {showNotifSkeleton && <RowSkeleton count={3} />}
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
      {showCreateGroup && (
        <div className="chatcn-group-modal-backdrop" role="presentation" onClick={() => !creatingGroup && setShowCreateGroup(false)}>
          <section className="chatcn-group-modal" role="dialog" aria-modal="true" aria-labelledby="chatcn-group-modal-title" onClick={event => event.stopPropagation()}>
            <header className="chatcn-group-modal-head">
              <div><strong id="chatcn-group-modal-title">创建群聊</strong><span>选择好友加入群聊</span></div>
              <button type="button" aria-label="关闭" disabled={creatingGroup} onClick={() => setShowCreateGroup(false)}>×</button>
            </header>
            <label className="chatcn-group-name-label">群聊名称
              <input value={groupName} maxLength={40} placeholder="给群聊起个名字" onChange={event => setGroupName(event.target.value)} />
            </label>
            <div className="chatcn-group-select-heading">选择成员 <span>已选 {groupSelectedIds.length} 人 · 最多 49 人</span></div>
            <div className="chatcn-group-friend-list">
              {friends.length === 0 ? <p>你还没有好友，请先添加好友。</p> : friends.map(friend => (
                <label key={friend.id} className="chatcn-group-friend">
                  <FriendAvatar person={friend} size={42} />
                  <span><strong>{friend.display_name ?? friend.username}</strong><small>@{friend.username}</small></span>
                  <input type="checkbox" checked={groupSelectedIds.includes(friend.id)} disabled={creatingGroup || (!groupSelectedIds.includes(friend.id) && groupSelectedIds.length >= 49)}
                    onChange={event => setGroupSelectedIds(current => event.target.checked ? [...current, friend.id] : current.filter(id => id !== friend.id))} />
                </label>
              ))}
            </div>
            <footer className="chatcn-group-modal-actions">
              <button type="button" className="chatcn-group-cancel" disabled={creatingGroup} onClick={() => setShowCreateGroup(false)}>取消</button>
              <button type="button" className="chatcn-group-create" disabled={creatingGroup || !groupName.trim() || groupSelectedIds.length < 1} onClick={() => void createGroupConversation()}>{creatingGroup ? '正在创建…' : '创建群聊'}</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
