import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { downscaleImage, downloadMediaWithProgress, uploadMediaWithProgress, useSignedUrl } from '../lib/media';
import SmoothProgress from '../components/fx/SmoothProgress';
import { useDelayedLoading } from '../components/fx/Skeleton';
import BlurImg from '../components/fx/BlurImg';
import { useCall } from '../lib/call';
import { goBackOr } from '../components/BackButton';
import { confirmDialog } from '../lib/dialog';
import { toast } from 'sonner';
import OptionSheet from '../components/OptionSheet';
import DisappearingCustomDialog, { formatDisappearingDuration } from '../components/DisappearingCustomDialog';
import type { ChatMessage } from '../types/message';
import { useUserPreferences } from '../lib/userPreferences';
import { SPRING_SNAPPY } from '../lib/motion';
import './Chat.polish.css';

type ChatReaction = { message_id: number; profile_id: string; reaction: string; created_at: string };
type ChatPeer = { id: string; username: string; display_name: string | null; avatar_path: string | null };
type TapbackAnchor = { left: number; top: number; width: number; dockLeft: number; dockTop: number; menuLeft: number; menuTop: number };
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];


function MessageImagePreview({ url }: { url: string }) {
  const [opened, setOpened] = useState(false);
  const reduceMotion = Boolean(useReducedMotion());

  useEffect(() => {
    if (!opened) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpened(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [opened]);

  return (
    <>
      <button type="button" className="im-photo-trigger" aria-label="放大查看聊天图片" onClick={() => setOpened(true)}>
        <BlurImg className="im-photo" src={url} alt="聊天图片" />
      </button>
      <AnimatePresence>
        {opened && (
          <motion.div
            className="im-image-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            onClick={() => setOpened(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.button
              type="button"
              className="im-image-viewer-close"
              aria-label="关闭图片预览"
              onClick={event => { event.stopPropagation(); setOpened(false); }}
              initial={false}
              whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            >×</motion.button>
            <motion.img
              src={url}
              alt="聊天图片"
              onClick={event => event.stopPropagation()}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.975, y: 8 }}
              transition={reduceMotion
                ? { duration: 0.01 }
                : { type: 'spring', stiffness: 280, damping: 27, mass: 0.8 }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
  return (bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '') + ' MB';
}

function fileExtLabel(name: string) {
  const ext = (name.split('.').pop() || '').toUpperCase();
  return ext && ext.length <= 5 ? ext : '文件';
}

function MessageContent({ body }: { body: string }) {
  const imagePath = body.startsWith('[[im-image:') && body.endsWith(']]') ? body.slice(11, -2) : null;
  const audioPath = body.startsWith('[[im-audio:') && body.endsWith(']]') ? body.slice(11, -2) : null;
  const fileParts = body.startsWith('[[im-file:') && body.endsWith(']]') ? body.slice(10, -2).split('|') : null;
  const filePath = fileParts ? fileParts[0] : null;
  const fileName = fileParts && fileParts[1] ? fileParts[1] : '文件';
  const fileSize = fileParts && fileParts[2] ? Number(fileParts[2]) : 0;
  const url = useSignedUrl('chat-media', imagePath ?? audioPath ?? filePath);
  const [downloading, setDownloading] = useState(false);
  const handleDownload = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!url || downloading) return;
    setDownloading(true);
    try {
      await downloadMediaWithProgress(url, fileName);
      toast.success('文件下载已完成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '下载失败，请重试');
    } finally {
      setDownloading(false);
    }
  };
  if (imagePath) return url ? <MessageImagePreview url={url} /> : <div className="fx-skel-wrap" role="status" aria-label="图片加载中"><div className="fx-skel" style={{ width: 220, height: 140, maxWidth: '68vw', borderRadius: 14 }} /></div>;
  if (filePath) return url ? (
    <div className="im-file-download-row">
      <a className="im-file-card" href={url} target="_blank" rel="noreferrer">
        <span className="im-file-icon" aria-hidden="true">{fileExtLabel(fileName)}</span>
        <span className="im-file-main">
          <span className="im-file-name">{fileName}</span>
          <span className="im-file-meta">{[formatFileSize(fileSize), '点按打开'].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="im-file-open" aria-hidden="true">›</span>
      </a>
      <button type="button" className="im-file-download-action" onClick={handleDownload}
        disabled={downloading} aria-label={downloading ? '正在下载文件' : '下载文件'}>
        {downloading ? '…' : '下载'}
      </button>
    </div>
  ) : <div className="fx-skel-wrap" role="status" aria-label="文件加载中"><div className="fx-skel" style={{ width: 200, height: 44, maxWidth: '68vw', borderRadius: 12 }} /></div>;
  if (audioPath) return url ? <div className="im-audio-card"><div className="im-audio-symbol">▶</div><div className="im-audio-main"><div className="im-waveform" aria-hidden="true">{Array.from({ length: 34 }, (_, i) => <i key={i} style={{ height: (5 + ((i * 7 + 3) % 17)) + 'px' }} />)}</div><audio controls preload="metadata" src={url} aria-label="语音消息播放" /></div></div> : <div className="fx-skel-wrap" role="status" aria-label="语音加载中"><div className="fx-skel" style={{ width: 240, height: 60, maxWidth: '68vw', borderRadius: 12 }} /></div>;
  return <>{body}</>;
}

function messageTimeLabel(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function canShowInlineMeta(body: string, hasReply: boolean) {
  const content = body.trim();
  return Boolean(content)
    && !hasReply
    && !content.startsWith('[[im-image:')
    && !content.startsWith('[[im-audio:')
    && !content.includes('\n')
    && Array.from(content).length >= 4
    && Array.from(content).length <= 18;
}

function ClockIcon() {
  return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" /><path d="M12 7v5l3.2 2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>);
}

function SentIcon() {
  return (<svg width="17" height="13" viewBox="0 0 28 24" fill="none" aria-hidden="true"><path d="M2.5 13.5 8 19 18.5 6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M13.5 13.5 19 19 25 11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>);
}

// 本地秒发队列：消息先以本地条目上屏（时钟），服务器确认后换双勾，
// 服务器副本经 load() 回来后本地条目无缝退场；失败则留在原地变红重试。
type OutboxEntry = {
  tempKey: string;
  body: string;
  replyToId: number | null;
  replySummary: string | null;
  createdAtMs: number;
  phase: 'sending' | 'sent' | 'failed';
  realId: number | null;
};

// 消失的私信：关闭 / 看完 30 秒后消失 / 按发送时间消失（时长自己填，30 秒～30 天）。
// 定时模式的过期时间由后端触发器在发送时写，看完模式由 mark_conversation_read 在全部收件人
// 看完时写。过期消息前端直接过滤、不再上屏。
type DisappearingMode = 'off' | 'after_read' | 'timed';
const DISAPPEARING_OPTIONS = [
  { value: 'off', label: '关闭' },
  { value: 'after_read', label: '对方看完 30 秒后消失' },
  { value: 'timed:3600', label: '发送 1 小时后消失' },
  { value: 'timed:86400', label: '发送 24 小时后消失' },
  { value: 'timed:604800', label: '发送 7 天后消失' },
  { value: 'custom', label: '自定义时间…' },
];
// 当前模式在选项里的值：定时模式只有 1 小时 / 24 小时 / 7 天三个预设才对应选项，
// 自己填的时长落在“自定义时间…”上。
function disappearingOptionValue(mode: DisappearingMode, seconds: number | null): string {
  if (mode === 'timed') {
    return seconds === 3600 || seconds === 86400 || seconds === 604800 ? `timed:${seconds}` : 'custom';
  }
  return mode;
}
function disappearingButtonLabel(mode: DisappearingMode, seconds: number | null): string {
  if (mode === 'after_read') return '看完后消失';
  if (mode === 'timed') return `${formatDisappearingDuration(seconds ?? 0)}后消失`;
  return '关闭';
}
function isDisappearingMode(value: string): value is DisappearingMode {
  return value === 'off' || value === 'after_read' || value === 'timed';
}
function isExpiredMessage(message: ChatMessage): boolean {
  return Boolean(message.expires_at) && new Date(message.expires_at as string).getTime() <= Date.now();
}

export default function Chat() {
  const reduceMotion = Boolean(useReducedMotion());
  const { cid } = useParams();
  const me = useAuth().session!.user.id;
  const userPreferences = useUserPreferences(me);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { name?: string; isGroup?: boolean } };
  const [name, setName] = useState(loc.state?.name ?? '聊天');
  const [peer, setPeer] = useState<ChatPeer | null>(null);
  const [isGroup, setIsGroup] = useState(Boolean(loc.state?.isGroup));
  const [groupMembers, setGroupMembers] = useState<Array<{ id: string; username: string; display_name: string | null; avatar_path: string | null; role: string; joined_at: string }>>([]);
  const [myGroupRole, setMyGroupRole] = useState('member');
  const [groupActionBusy, setGroupActionBusy] = useState(false);
  const [groupRenameValue, setGroupRenameValue] = useState('');
  const [showGroupInvitePicker, setShowGroupInvitePicker] = useState(false);
  const [groupInviteFriends, setGroupInviteFriends] = useState<ChatPeer[]>([]);
  const [groupInviteSelectedIds, setGroupInviteSelectedIds] = useState<string[]>([]);
  const [groupInviteBusy, setGroupInviteBusy] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const showMsgsSkeleton = useDelayedLoading(loadingMsgs);
  const [text, setText] = useState('');
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const outboxSeqRef = useRef(0);
  const swappedIdsRef = useRef<Set<number>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const gifRef = useRef<HTMLInputElement>(null);
  const attachmentButtonRef = useRef<HTMLButtonElement>(null);
  const attachmentTrayRef = useRef<HTMLDivElement>(null);
  const { startCall, busy: callBusy } = useCall();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [disappearingMode, setDisappearingMode] = useState<DisappearingMode>('off');
  const [disappearingSeconds, setDisappearingSeconds] = useState<number | null>(null);
  const [showCustomDuration, setShowCustomDuration] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  // 消失动画（Telegram 式）：消息到期先淡出缩小，再把整行高度收到 0，
  // 下面的消息顺着 ResizeObserver 的测量更新滑上来；减动效时直接移除。
  // 两个时长要和下面 <style> 里的 .im-row-vanishing 过渡（.26s）保持一致。
  const VANISH_FADE_MS = 260;
  const VANISH_COLLAPSE_MS = 220;
  const [vanishingIds, setVanishingIds] = useState<ReadonlySet<number>>(new Set());
  const vanishingIdsRef = useRef<ReadonlySet<number>>(new Set());
  const rowElsRef = useRef(new Map<number, HTMLElement>());
  const disappearingModeRef = useRef<DisappearingMode>('off');
  const [showProfileMore, setShowProfileMore] = useState(false);
  const sharedMediaRef = useRef<HTMLElement | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [showStickerEmojis, setShowStickerEmojis] = useState(false);
  const [chatBackground, setChatBackground] = useState('default');
  const [backgroundSaving, setBackgroundSaving] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [actionFor, setActionFor] = useState<number | null>(null);
  const [tapbackAnchor, setTapbackAnchor] = useState<TapbackAnchor | null>(null);
  const backgroundFileRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const typingReadyRef = useRef(false);
  const typingActiveRef = useRef(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [otherLastReadMessageId, setOtherLastReadMessageId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const loadSequenceRef = useRef(0);
  const backgroundPath = chatBackground.startsWith('image:') ? chatBackground.slice(6) : null;
  const wallpaperUrl = useSignedUrl('chat-media', backgroundPath);
  const peerAvatarUrl = useSignedUrl('avatars', peer?.avatar_path);
  const sharedImageMessages = useMemo(
    () => msgs.filter(message => !message.deleted_at && message.body.startsWith('[[im-image:')),
    [msgs],
  );
  const sharedFileMessages = useMemo(
    () => msgs.filter(message => !message.deleted_at && message.body.startsWith('[[im-file:')),
    [msgs],
  );
  const sharedAudioMessages = useMemo(
    () => msgs.filter(message => !message.deleted_at && message.body.startsWith('[[im-audio:')),
    [msgs],
  );
  const sharedLinkItems = useMemo(() => msgs.flatMap(message => {
    if (message.deleted_at || message.body.startsWith('[[')) return [];
    const urls = message.body.match(/https?:\/\/[^\s<>"']+/g) ?? [];
    return urls.map((url, index) => ({ key: message.id + '-' + index, url }));
  }), [msgs]);
  const sharedMediaCount = sharedImageMessages.length + sharedFileMessages.length + sharedAudioMessages.length + sharedLinkItems.length;

  // 第 2 阶段虚拟化：只渲染可视区的消息行（变高行用 measureElement 动态测量）。
  // 滚动容器就是 .im-feed；outbox（秒发本地条目）数量极小，仍直接渲染在列表之后。
  const feedRef = useRef<HTMLElement | null>(null);
  const virtualizer = useVirtualizer({
    count: msgs.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 76,
    overscan: 8,
    // 行必须按消息 id 取 key，不能用默认的下标：消失动画直接写在行节点上
    // （height:0 / overflow:hidden），下标 key 会让下一条消息复用这条
    // 已收起的节点、被裁成看不见；id key 让消失行直接卸载、样式跟着走。
    getItemKey: (index) => msgs[index].id,
  });
  // 新消息只保留一个透明度淡入（不做位移/缩放，避免影响行高测量与滚动锚点）。
  const prevMsgsLenRef = useRef(0);
  const [freshId, setFreshId] = useState<number | null>(null);
  const stickToBottomRef = useRef(true);
  // 渲染期 O(n²) 查找改为 O(1)：回复父消息与每条消息的回应分组各建一次索引。
  const msgsById = useMemo(() => new Map(msgs.map(m => [m.id, m])), [msgs]);
  const reactionsByMessage = useMemo(() => {
    const map = new Map<number, Array<{ reaction: string; items: ChatReaction[] }>>();
    for (const item of reactions) {
      let groups = map.get(item.message_id);
      if (!groups) {
        groups = QUICK_REACTIONS.map(reaction => ({ reaction, items: [] as ChatReaction[] }));
        map.set(item.message_id, groups);
      }
      groups.find(group => group.reaction === item.reaction)?.items.push(item);
    }
    for (const [id, groups] of map) map.set(id, groups.filter(group => group.items.length > 0));
    return map;
  }, [reactions]);

  // 消失动画的两个收尾步骤。finishVanish 只在消息仍过期时移除；用户在
  // 动画中途关掉消失模式时，把行高还回去、取消淡出，消息留着。
  function finishVanish(ids: number[]) {
    const rowEls = rowElsRef.current;
    if (disappearingModeRef.current === 'off') {
      ids.forEach(id => {
        const el = rowEls.get(id);
        if (el) { el.style.height = ''; el.style.overflow = ''; }
      });
    } else {
      setMsgs(prev => prev.filter(m => !ids.includes(m.id)));
      if (cid) {
        void supabase.rpc('cleanup_expired_messages', { p_conversation_id: Number(cid) })
          .then(({ error: cleanupError }) => {
            if (cleanupError) console.error('cleanup expired messages failed', cleanupError);
          });
      }
    }
    const next = new Set(vanishingIdsRef.current);
    ids.forEach(id => next.delete(id));
    vanishingIdsRef.current = next;
    setVanishingIds(next);
  }

  function startVanish(ids: number[]) {
    const next = new Set([...vanishingIdsRef.current, ...ids]);
    vanishingIdsRef.current = next;
    setVanishingIds(next);
    const fadeMs = reduceMotion ? 0 : VANISH_FADE_MS;
    const collapseMs = reduceMotion ? 0 : VANISH_COLLAPSE_MS;
    window.setTimeout(() => {
      const els = ids
        .map(id => rowElsRef.current.get(id))
        .filter((el): el is HTMLElement => Boolean(el));
      if (collapseMs === 0) {
        finishVanish(ids);
        return;
      }
      // 收起高度：直接写行高，虚拟列表靠 ResizeObserver 跟着更新位置，
      // 下面的消息顺滑上滑；内容已淡出，收起时只剩空白高度在缩。
      const startHeights = new Map(els.map(el => [el, el.offsetHeight]));
      els.forEach(el => { el.style.overflow = 'hidden'; });
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / collapseMs);
        const eased = 1 - Math.pow(1 - progress, 3);
        els.forEach(el => {
          el.style.height = Math.max(0, (startHeights.get(el) ?? 0) * (1 - eased)) + 'px';
        });
        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          // 最后一帧把高度写死到 0，避免收尾帧的残值留一条细缝。
          els.forEach(el => { el.style.height = '0px'; });
          finishVanish(ids);
        }
      };
      requestAnimationFrame(tick);
    }, fadeMs);
  }

  useEffect(() => {
    disappearingModeRef.current = disappearingMode;
  }, [disappearingMode]);

  // 消失动画的定时器：找到最近一个到期时间，到点把那一批消息淡出收起。
  // 已过期但还没动画的消息由 load() 直接过滤（用户不在本页时不播动画）。
  useEffect(() => {
    if (disappearingMode === 'off') return;
    const now = Date.now();
    const upcoming = msgs.filter(m => m.expires_at
      && new Date(m.expires_at as string).getTime() > now
      && !vanishingIds.has(m.id));
    if (!upcoming.length) return;
    const nextAt = Math.min(...upcoming.map(m => new Date(m.expires_at as string).getTime()));
    const timer = window.setTimeout(() => {
      const expiredIds = msgs
        .filter(m => m.expires_at && new Date(m.expires_at as string).getTime() <= Date.now())
        .map(m => m.id)
        .filter(id => !vanishingIdsRef.current.has(id));
      if (expiredIds.length) startVanish(expiredIds);
    }, Math.max(0, nextAt - now));
    return () => window.clearTimeout(timer);
  }, [msgs, disappearingMode, vanishingIds]);

  // Android 虚拟键盘打开时，可视视口会缩小；用它同步聊天容器高度。
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const viewport = window.visualViewport;
    const updateHeight = () => {
      const height = viewport?.height ?? window.innerHeight;
      page.style.setProperty('--im-viewport-height', height + 'px');
    };
    updateHeight();
    viewport?.addEventListener('resize', updateHeight);
    viewport?.addEventListener('scroll', updateHeight);
    window.addEventListener('resize', updateHeight);
    return () => {
      viewport?.removeEventListener('resize', updateHeight);
      viewport?.removeEventListener('scroll', updateHeight);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  // Leaving the chat must release microphone resources immediately.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recordTimerRef.current !== null) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') {
          try { recorder.stop(); } catch { /* Tracks are stopped below. */ }
        }
        recorderRef.current = null;
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function load() {
    const requestId = ++loadSequenceRef.current;
    if (!cid || !Number.isFinite(Number(cid))) { setLoadingMsgs(false); return; }
    const conversationId = Number(cid);
    const { data, error: loadError } = await supabase.from('messages').select('*')
      .eq('conversation_id', conversationId).order('created_at');
    // Realtime、轮询和手动刷新可能同时完成；只应用最后发起的请求结果。
    if (requestId !== loadSequenceRef.current) return;
    if (data) {
      // 正在播消失动画的消息先留着，等动画跑完再由定时器移除，避免中途被抽掉。
      const visible = data.filter(message => !isExpiredMessage(message) || vanishingIdsRef.current.has(message.id));
      setMsgs(visible);
      setError('');
      // 已到期的消息还没被清理时，在这里触发一次软删；删完经 Realtime 再刷新。
      // 清理函数在迁移上线前还不存在，失败时静默跳过、不影响消息加载。
      if (data.some(message => !message.deleted_at && isExpiredMessage(message))) {
        void supabase.rpc('cleanup_expired_messages', { p_conversation_id: conversationId })
          .then(({ error: cleanupError }) => {
            if (cleanupError) console.error('cleanup expired messages failed', cleanupError);
          });
      }
      const messageIds = visible.map(message => message.id);
      if (messageIds.length) {
        const { data: reactionRows, error: reactionError } = await supabase
          .from('message_reactions').select('message_id,profile_id,reaction,created_at')
          .in('message_id', messageIds);
        if (requestId !== loadSequenceRef.current) return;
        if (!reactionError) setReactions((reactionRows ?? []) as ChatReaction[]);
      } else {
        setReactions([]);
      }
    } else if (loadError) {
      setError('消息加载失败，请检查网络后重试。');
      setLoadingMsgs(false);
      return;
    }
    setLoadingMsgs(false);

    const { data: members } = await supabase.from('conversation_members')
      .select('profile_id,last_receipt_message_id')
      .eq('conversation_id', conversationId);
    if (requestId !== loadSequenceRef.current) return;
    const otherMember = isGroup ? null : (members ?? []).find(member => member.profile_id !== me);
    setOtherLastReadMessageId(otherMember?.last_receipt_message_id ?? null);

    const { data: conversationRow } = await supabase.from('conversations').select('disappearing_mode,disappearing_seconds')
      .eq('id', conversationId).maybeSingle();
    if (requestId !== loadSequenceRef.current) return;
    // 迁移上线前还没有 disappearing_mode 列，查不到时保持关闭，不报错。
    if (conversationRow && isDisappearingMode(conversationRow.disappearing_mode)) {
      setDisappearingMode(conversationRow.disappearing_mode);
      setDisappearingSeconds(typeof conversationRow.disappearing_seconds === 'number' ? conversationRow.disappearing_seconds : null);
    }

    if (document.visibilityState === 'visible') {
      const { error: readError } = await supabase.rpc('mark_conversation_read', {
        p_conversation_id: conversationId,
      });
      if (requestId !== loadSequenceRef.current) return;
      if (readError) console.error('mark conversation read failed', readError);
    }
  }

  useEffect(() => {
    load();
    let peerLookupActive = true;
    void (async () => {
      const { data: groupRows, error: groupError } = await supabase.rpc('get_group_conversation_details', { p_conversation_id: Number(cid) });
      const group = !groupError && Array.isArray(groupRows) ? groupRows[0] : null;
      if (group) {
        if (!peerLookupActive) return;
        setIsGroup(true);
        setName(group.group_name ?? loc.state?.name ?? '群聊');
        setGroupRenameValue(group.group_name ?? '');
        setMyGroupRole(group.my_role ?? 'member');
        setGroupMembers(Array.isArray(group.members) ? group.members as unknown as Array<{ id: string; username: string; display_name: string | null; avatar_path: string | null; role: string; joined_at: string }> : []);
        setPeer(null);
        return;
      }
      setIsGroup(false);
      const { data: members } = await supabase.from('conversation_members').select('profile_id').eq('conversation_id', Number(cid));
      const other = ((members ?? []) as Array<{ profile_id: string }>).map(x => x.profile_id).find(x => x !== me);
      if (!other) return;
      const { data: friends } = await supabase.rpc('my_friends');
      const found = ((friends ?? []) as ChatPeer[]).find(item => item.id === other);
      if (peerLookupActive && found) { setPeer(found); setName(found.display_name ?? found.username ?? loc.state?.name ?? '聊天'); }
    })();
    const channel = supabase.channel('chat-' + cid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + cid }, () => { load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members', filter: 'conversation_id=eq.' + cid }, (payload) => {
        // Our own read-cursor UPDATE is caused by load(); ignoring it prevents
        // a Realtime -> load -> mark-read -> Realtime feedback loop.
        if ((payload.new as { profile_id?: string } | null)?.profile_id !== me) load();
      })
      // message_reactions has no conversation_id; do not subscribe globally and
      // refetch every open chat for unrelated reactions. The existing 12s refresh
      // keeps this conversation's reactions in sync.
      .subscribe();
    // 切到后台标签时不轮询：visibilitychange 回来时会立刻重拉一次，
    // 既省流量省电，又不会漏掉回来后的新消息。
    const fallback = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 12000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      peerLookupActive = false;
      clearInterval(fallback);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      loadSequenceRef.current += 1;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, isGroup]);

  useEffect(() => {
    let active = true;
    setChatBackground('default');
    if (!cid || !Number.isFinite(Number(cid))) return () => { active = false; };
    supabase.from('conversation_members').select('chat_background')
      .eq('conversation_id', Number(cid)).eq('profile_id', me).maybeSingle()
      .then(({ data }) => {
        if (active) setChatBackground(data?.chat_background ?? 'default');
      });
    return () => { active = false; };
  }, [cid, me]);

  useEffect(() => {
    if (!cid || !Number.isFinite(Number(cid))) return;
    let incomingTimer: number | null = null;
    typingReadyRef.current = false;
    typingActiveRef.current = false;
    const channel = supabase.channel('chat-typing:' + cid, {
      config: { private: true, broadcast: { ack: false, self: false } },
    }).on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload) return;
      if (incomingTimer !== null) window.clearTimeout(incomingTimer);
      const typing = (payload as { typing?: unknown }).typing === true;
      setOtherTyping(typing);
      if (typing) incomingTimer = window.setTimeout(() => setOtherTyping(false), 2400);
    }).subscribe(status => {
      typingReadyRef.current = status === 'SUBSCRIBED';
    });
    typingChannelRef.current = channel;
    return () => {
      if (typingActiveRef.current && typingReadyRef.current) {
        void channel.send({ type: 'broadcast', event: 'typing', payload: { typing: false } });
      }
      if (incomingTimer !== null) window.clearTimeout(incomingTimer);
      if (typingStopTimerRef.current !== null) window.clearTimeout(typingStopTimerRef.current);
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      typingStopTimerRef.current = null;
      longPressTimerRef.current = null;
      typingActiveRef.current = false;
      typingReadyRef.current = false;
      typingChannelRef.current = null;
      setOtherTyping(false);
      void supabase.removeChannel(channel);
    };
  }, [cid, me]);

  // 新消息到达时把视图钉到底部（与虚拟化前行为一致：每次条数变化都回到底部）。
  useEffect(() => {
    if (msgs.length > 0) {
      virtualizer.scrollToIndex(msgs.length - 1, { align: 'end', behavior: firstRef.current ? 'auto' : 'smooth' });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: firstRef.current ? 'auto' : 'smooth' });
    }
    firstRef.current = false;
  }, [msgs.length, outbox.length, virtualizer]);

  // 只有条数变多且不是首次加载时，才把最后一条记为“新消息”做淡入动画。
  useEffect(() => {
    if (prevMsgsLenRef.current > 0 && msgs.length > prevMsgsLenRef.current) {
      setFreshId(msgs[msgs.length - 1]?.id ?? null);
    }
    prevMsgsLenRef.current = msgs.length;
  }, [msgs]);

  // 底部粘滞：已在底部时，行高实测落地（图片加载、文字换行）导致总高度变化，
  // 跟着把视图补到底部；用户上翻读历史时不动，避免把人拽回底部。
  const totalSize = virtualizer.getTotalSize();
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const onScroll = () => {
      stickToBottomRef.current = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
    };
    feed.addEventListener('scroll', onScroll, { passive: true });
    return () => feed.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (msgs.length > 0 && stickToBottomRef.current) {
      virtualizer.scrollToIndex(msgs.length - 1, { align: 'end', behavior: 'auto' });
    }
    // 只在总高度实测变化时补位；不依赖 msgs，避免与上面的回到底部重复触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSize]);

  // 服务器副本已随 load() 回来、且本地条目已翻成「已发送」时，本地条目退场，
  // 位置由服务器行接替；接替行记入 swappedIds 不再重播入场动画，避免跳一下。
  useEffect(() => {
    setOutbox(prev => {
      const done = prev.filter(e => e.phase === 'sent' && e.realId !== null && msgs.some(m => m.id === e.realId));
      if (!done.length) return prev;
      done.forEach(e => { if (e.realId !== null) swappedIdsRef.current.add(e.realId); });
      return prev.filter(e => !done.includes(e));
    });
  }, [msgs]);

  function notifyTyping(value: string) {
    const channel = typingChannelRef.current;
    if (!channel || !typingReadyRef.current) return;
    if (typingStopTimerRef.current !== null) window.clearTimeout(typingStopTimerRef.current);
    const wantsTyping = Boolean(value.trim());
    if (wantsTyping && !typingActiveRef.current) {
      typingActiveRef.current = true;
      void channel.send({ type: 'broadcast', event: 'typing', payload: { typing: true } });
    }
    if (!wantsTyping && typingActiveRef.current) {
      typingActiveRef.current = false;
      void channel.send({ type: 'broadcast', event: 'typing', payload: { typing: false } });
      return;
    }
    if (wantsTyping) {
      typingStopTimerRef.current = window.setTimeout(() => {
        typingStopTimerRef.current = null;
        if (typingActiveRef.current && typingChannelRef.current && typingReadyRef.current) {
          typingActiveRef.current = false;
          void typingChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { typing: false } });
        }
      }, 1500);
    }
  }

  function openMessageActions(messageId: number, element?: HTMLElement) {
    const rect = element?.getBoundingClientRect();
    if (rect) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const dockWidth = Math.min(316, Math.max(220, viewportWidth - 24));
      const dockLeft = Math.max(12, Math.min(
        rect.left + rect.width / 2 - dockWidth / 2,
        viewportWidth - dockWidth - 12,
      ));
      const dockTop = rect.top >= 76
        ? rect.top - 62
        : Math.min(viewportHeight - 58, rect.bottom + 10);
      const menuWidth = Math.min(244, viewportWidth - 24);
      const menuHeight = 224;
      const menuBelowTop = dockTop >= rect.bottom ? dockTop + 58 : rect.bottom + 12;
      const menuTop = menuBelowTop + menuHeight <= viewportHeight - 12
        ? menuBelowTop
        : Math.max(12, dockTop - menuHeight - 8);
      const menuLeft = rect.left + rect.width / 2 < viewportWidth / 2
        ? Math.max(12, Math.min(rect.left, viewportWidth - menuWidth - 12))
        : Math.max(12, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 12));
      setTapbackAnchor({
        left: Math.max(8, Math.min(rect.left, viewportWidth - Math.max(1, rect.width) - 8)),
        top: Math.max(8, Math.min(rect.top, viewportHeight - Math.max(1, rect.height) - 8)),
        width: Math.min(rect.width, viewportWidth - 16),
        dockLeft,
        dockTop,
        menuLeft,
        menuTop,
      });
    } else {
      setTapbackAnchor(null);
    }
    setActionFor(messageId);
  }

  function startMessagePress(messageId: number, element: HTMLElement) {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      openMessageActions(messageId, element);
      longPressTimerRef.current = null;
    }, 480);
  }

  function clearMessagePress(event?: React.TouchEvent<HTMLDivElement>) {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    if (longPressTriggeredRef.current) {
      event?.preventDefault();
      longPressTriggeredRef.current = false;
    }
  }

  async function saveChatBackground(value: string) {
    if (!cid || backgroundSaving) return;
    setBackgroundSaving(true);
    setError('');
    try {
      const { error: saveError } = await supabase.rpc('set_chat_background', {
        p_conversation_id: Number(cid),
        p_background: value,
      });
      if (saveError) throw saveError;
      setChatBackground(value);
    } catch (saveError) {
      console.error('chat background save failed', saveError);
      setError('聊天背景保存失败，请重试。');
    } finally {
      setBackgroundSaving(false);
    }
  }

  async function saveDisappearing(mode: DisappearingMode, seconds: number | null) {
    if (!cid || modeSaving || (mode === disappearingMode && seconds === disappearingSeconds)) return;
    setModeSaving(true);
    const { error: saveError } = await supabase.rpc('set_disappearing_mode', {
      p_conversation_id: Number(cid),
      p_mode: mode,
      p_seconds: seconds === null ? undefined : seconds,
    });
    if (saveError) {
      toast.error('设置失败：' + saveError.message);
    } else {
      setDisappearingMode(mode);
      setDisappearingSeconds(seconds);
      toast.success(mode === 'off' ? '已关闭消失的私信，消息会一直保留。' : '已开启消失的私信，之后的消息会按这个规则消失。');
      await load();
    }
    setModeSaving(false);
  }

  async function saveDisappearingOption(value: string) {
    // 自定义时间不在选项里直接保存，打开输入框让用户填。
    if (value === 'custom') {
      setShowCustomDuration(true);
      return;
    }
    if (value.startsWith('timed:')) {
      const seconds = Number(value.slice('timed:'.length));
      if (Number.isInteger(seconds) && seconds > 0) {
        await saveDisappearing('timed', seconds);
        return;
      }
    }
    if (value === 'after_read' || value === 'off') {
      await saveDisappearing(value, null);
    }
  }

  async function uploadChatBackground(file?: File) {
    if (!file || !cid || backgroundSaving) return;
    if (!file.type.startsWith('image/')) { setError('请选择图片文件。'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('背景照片不能超过 15 MB。'); return; }
    setBackgroundSaving(true);
    setError('');
    let path: string | null = null;
    try {
      const compact = await downscaleImage(file, 1800, 0.84);
      path = await uploadMediaWithProgress('chat-media', compact, Number(cid) + '/' + me);
      const { error: saveError } = await supabase.rpc('set_chat_background', {
        p_conversation_id: Number(cid),
        p_background: 'image:' + path,
      });
      if (saveError) throw saveError;
      setChatBackground('image:' + path);
    } catch (e) {
      console.error('chat background upload failed', e);
      if (path) await supabase.storage.from('chat-media').remove([path]);
      setError('背景照片上传失败，请检查网络后重试。');
    } finally {
      setBackgroundSaving(false);
      if (backgroundFileRef.current) backgroundFileRef.current.value = '';
    }
  }

  async function sendImage(file?: File) {
    if (!file || uploading || !cid) return;
    if (!file.type.startsWith('image/')) { setError('请选择图片文件。'); return; }
    if (file.size > 15 * 1024 * 1024) { setError('图片不能超过 15 MB。'); return; }
    setUploading(true); setError('');
    try {
      const compact = await downscaleImage(file, 1440, 0.82);
      setUpPct(0);
      const path = await uploadMediaWithProgress('chat-media', compact, Number(cid) + '/' + me, pct => setUpPct(pct));
      const { error: sendError } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body: '[[im-image:' + path + ']]', reply_to_id: replyTarget?.id ?? null });
      if (sendError) throw sendError;
      setReplyTarget(null);
      await load();
    } catch (e) {
      console.error('chat image upload failed', e);
      setError('图片发送失败。请确认聊天媒体存储策略已启用，然后重试。');
    } finally {
      setUploading(false); setUpPct(null);
      if (imageRef.current) imageRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }

  async function sendGif(file?: File) {
    if (!file || uploading || !cid) return;
    if (file.type !== 'image/gif' && !/\.gif$/i.test(file.name)) {
      setError('请选择 GIF 动图文件。');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError('GIF 动图不能超过 15 MB。');
      return;
    }
    setUploading(true);
    setError('');
    try {
      setUpPct(0);
      // Some Android document providers report a generic/empty MIME type for .gif files.
      // Normalize only the MIME metadata; keep the original bytes so animation frames survive.
      const uploadFile = file.type === 'image/gif'
        ? file
        : new File([file], /\.gif$/i.test(file.name) ? file.name : 'animation.gif', {
            type: 'image/gif',
            lastModified: file.lastModified,
          });
      const path = await uploadMediaWithProgress('chat-media', uploadFile, Number(cid) + '/' + me, pct => setUpPct(pct));
      const { error: sendError } = await supabase.from('messages').insert({
        conversation_id: Number(cid),
        sender_id: me,
        body: '[[im-image:' + path + ']]',
        reply_to_id: replyTarget?.id ?? null,
      });
      if (sendError) throw sendError;
      setReplyTarget(null);
      setShowStickers(false);
      setShowStickerEmojis(false);
      await load();
    } catch (e) {
      console.error('chat GIF upload failed', e);
      setError('GIF 动图发送失败，请重试。');
    } finally {
      setUploading(false);
      setUpPct(null);
      if (gifRef.current) gifRef.current.value = '';
    }
  }

  async function sendFile(file?: File) {
    if (!file || uploading || !cid) return;
    if (file.size > 50 * 1024 * 1024) { setError('文件不能超过 50 MB。'); return; }
    if (/\.(exe|apk|bat|cmd|sh|com|msi|scr)$/i.test(file.name)) { setError('这类程序文件不能发送。'); return; }
    setUploading(true); setError('');
    try {
      setUpPct(0);
      const path = await uploadMediaWithProgress('chat-media', file, Number(cid) + '/' + me, pct => setUpPct(pct));
      const safeName = file.name.replace(/[|\]]/g, '_').slice(0, 80) || '文件';
      const body = '[[im-file:' + path + '|' + safeName + '|' + file.size + ']]';
      const { error: sendError } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body, reply_to_id: replyTarget?.id ?? null });
      if (sendError) throw sendError;
      setReplyTarget(null);
      setShowStickers(false);
      await load();
    } catch (e) {
      console.error('chat file upload failed', e);
      setError('文件发送失败，请重试。');
    } finally {
      setUploading(false); setUpPct(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    setRecording(false);
    setUploading(true);
    if (recordTimerRef.current !== null) window.clearInterval(recordTimerRef.current);
    recordTimerRef.current = null;
    recorder.stop();
  }

  async function startRecording() {
    if (recording || uploading) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持语音录制，请更新浏览器后重试。');
      return;
    }
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Permission prompts may resolve after the user has already left this page.
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        try {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size < 1000) { setError('录音时间太短，请重新录制。'); return; }
          const mime = blob.type.includes('mp4') ? 'audio/mp4' : blob.type.includes('ogg') ? 'audio/ogg' : blob.type.includes('aac') ? 'audio/aac' : blob.type.includes('mpeg') ? 'audio/mpeg' : 'audio/webm';
          const ext = mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : mime === 'audio/aac' ? 'aac' : mime === 'audio/mpeg' ? 'mp3' : 'webm';
          const file = new File([blob], 'voice-' + Date.now() + '.' + ext, { type: mime });
          setUpPct(0);
          const path = await uploadMediaWithProgress('chat-media', file, Number(cid) + '/' + me, pct => setUpPct(pct));
          const { error: sendError } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body: '[[im-audio:' + path + ']]', reply_to_id: replyTarget?.id ?? null });
          if (sendError) throw sendError;
          setReplyTarget(null);
          await load();
        } catch (e) {
          console.error('chat voice upload failed', e);
          setError('语音发送失败。请确认聊天媒体存储策略已启用，然后重试。');
        } finally {
          setUploading(false); setUpPct(null);
          recorderRef.current = null;
        }
      };
      recorder.start();
      setRecordSeconds(0);
      setRecording(true);
      let elapsed = 0;
      recordTimerRef.current = window.setInterval(() => {
        elapsed += 1;
        setRecordSeconds(elapsed);
        if (elapsed >= 60) stopRecording();
      }, 1000);
    } catch (e) {
      console.error('microphone permission failed', e);
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') {
          try { recorder.stop(); } catch { /* Tracks are stopped below. */ }
        }
      }
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      if (recordTimerRef.current !== null) window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
      if (mountedRef.current) {
        setRecording(false);
        setError('无法使用麦克风。请允许浏览器访问麦克风后重试。');
      }
    }
  }

  // 秒发：条目已在本地上屏，这里只管把内容送到服务器。
  // 成功也要至少展示约 1.2 秒时钟再换双勾，让状态变化看得见（按交互规格的模拟延迟）；
  // 失败不弹窗，条目原地变浅红并给出「点击重试」。
  function dispatch(entry: OutboxEntry) {
    const startedAt = Date.now();
    (async () => {
      try {
        const { data, error: sendError } = await supabase.from('messages')
          .insert({ conversation_id: Number(cid), sender_id: me, body: entry.body, reply_to_id: entry.replyToId })
          .select('id').single();
        if (sendError) throw sendError;
        const realId = (data as { id: number }).id;
        const wait = Math.max(0, 1200 - (Date.now() - startedAt));
        window.setTimeout(() => {
          if (!mountedRef.current) return;
          setOutbox(prev => prev.map(e => e.tempKey === entry.tempKey ? { ...e, phase: 'sent', realId } : e));
          load();
        }, wait);
      } catch (err) {
        console.error('chat send failed', err);
        if (!mountedRef.current) return;
        setOutbox(prev => prev.map(e => e.tempKey === entry.tempKey ? { ...e, phase: 'failed' } : e));
      }
    })();
  }

  function retryEntry(tempKey: string) {
    const entry = outbox.find(e => e.tempKey === tempKey);
    if (!entry || entry.phase !== 'failed') return;
    setOutbox(prev => prev.map(e => e.tempKey === tempKey ? { ...e, phase: 'sending' } : e));
    dispatch(entry);
  }

  function queueOutgoing(body: string) {
    const entry: OutboxEntry = {
      tempKey: 'tmp-' + (++outboxSeqRef.current),
      body,
      replyToId: replyTarget?.id ?? null,
      replySummary: replyTarget ? messageSummary(replyTarget) : null,
      createdAtMs: Date.now(),
      phase: 'sending',
      realId: null,
    };
    setOutbox(prev => [...prev, entry]);
    setReplyTarget(null);
    setError('');
    dispatch(entry);
    return entry;
  }

  function sendSticker(sticker: string) {
    if (uploading || !cid) return;
    queueOutgoing(sticker);
    setShowStickers(false);
  }

  function send() {
    const b = text.trim();
    if (!b || !cid) return;
    notifyTyping('');
    queueOutgoing(b.slice(0, 2000));
    setText('');
    inputRef.current?.focus();
  }

  async function toggleReaction(messageId: number, reaction: string) {
    const existing = reactions.find(item => item.message_id === messageId && item.profile_id === me && item.reaction === reaction);
    if (existing) {
      const { error: removeError } = await supabase.from('message_reactions').delete()
        .eq('message_id', messageId).eq('profile_id', me).eq('reaction', reaction);
      if (removeError) { setError('取消回应失败，请重试。'); return; }
    } else {
      const { error: addError } = await supabase.from('message_reactions').insert({
        message_id: messageId, profile_id: me, reaction,
      });
      if (addError) { setError('发送回应失败，请重试。'); return; }
    }
    await load();
  }

  async function saveEdit(messageId: number) {
    const body = editingText.trim();
    if (!body) { setError('消息内容不能为空。'); return; }
    const { error: editError } = await supabase.rpc('edit_chat_message', {
      p_message_id: messageId, p_body: body.slice(0, 2000),
    });
    if (editError) { setError('编辑失败：' + editError.message); return; }
    setEditingId(null);
    setEditingText('');
    await load();
  }

  async function withdrawMessage(messageId: number) {
    const ok = await confirmDialog('确定撤回这条消息吗？撤回后对话双方都无法再查看原内容。', { confirmText: '确认撤回', danger: true });
    if (!ok) return;
    const { error: deleteError } = await supabase.rpc('delete_chat_message', {
      p_message_id: messageId,
    });
    if (deleteError) { setError('撤回失败：' + deleteError.message); return; }
    await load();
  }

  async function copyMessage(message: ChatMessage) {
    const content = message.deleted_at ? '消息已撤回' : messageSummary(message);
    try {
      await navigator.clipboard.writeText(content);
      setActionFor(null);
      toast.success('已复制');
    } catch {
      toast.error('复制失败，请检查浏览器剪贴板权限。');
    }
  }

  function beginReply(message: ChatMessage) {
    setReplyTarget(message);
    inputRef.current?.focus();
  }

  function messageSummary(message?: ChatMessage | null) {
    if (!message || message.deleted_at) return '消息已撤回';
    if (message.body.startsWith('[[im-image:')) return '图片';
    if (message.body.startsWith('[[im-audio:')) return '语音';
    if (message.body.startsWith('[[im-file:')) return '文件';
    return message.body;
  }

  const dateLabel = (value: string, previous?: string) => {
    const current = new Date(value);
    const time = current.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const date = current.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
    if (!previous) return date + ' · ' + time;
    const prior = new Date(previous);
    if (prior.toDateString() !== current.toDateString()) return date + ' · ' + time;
    return current.getTime() - prior.getTime() > 5 * 60 * 1000 ? time : '';
  };

  useEffect(() => {
    if (!showDetails && actionFor === null && !showStickers) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDetails(false);
        setShowProfileMore(false);
        setShowStickers(false);
        setShowStickerEmojis(false);
        setActionFor(null);
        setTapbackAnchor(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showDetails, showStickers, actionFor]);

  useEffect(() => {
    if (!showStickers) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (attachmentTrayRef.current?.contains(target) || attachmentButtonRef.current?.contains(target)) return;
      setShowStickers(false);
      setShowStickerEmojis(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [showStickers]);

  useEffect(() => {
    if (!showDetails) setShowProfileMore(false);
    else {
      setShowStickers(false);
      setShowStickerEmojis(false);
    }
  }, [showDetails]);

  const latestOutgoingMessageId = [...msgs].reverse().find(message => message.sender_id === me)?.id ?? null;

  return (
    <div ref={pageRef} className="im-page" style={{
      '--im-wallpaper': backgroundPath && wallpaperUrl
        ? `linear-gradient(rgba(255,255,255,.38),rgba(255,255,255,.48)), url("${wallpaperUrl}") center / cover no-repeat`
        : ({
            default: '#ffffff',
            sky: 'linear-gradient(155deg,#f5faff 0%,#eaf3ff 52%,#f9fbff 100%)',
            lavender: 'radial-gradient(ellipse at 78% 18%,rgba(207,195,245,.34),transparent 42%),linear-gradient(145deg,#fff 0%,#f5f1ff 100%)',
            mint: 'radial-gradient(ellipse at 18% 80%,rgba(181,225,211,.28),transparent 42%),linear-gradient(145deg,#fff 0%,#eef9f5 100%)',
            sunset: 'radial-gradient(ellipse at 88% 16%,rgba(255,211,190,.28),transparent 42%),linear-gradient(145deg,#fff 0%,#fff3ed 100%)',
          } as Record<string, string>)[chatBackground] ?? '#ffffff',
    } as React.CSSProperties}>
      <style>{`
        .im-page{height:100vh;height:var(--im-viewport-height,100dvh);min-height:0;width:100%;max-width:none;margin:0;box-sizing:border-box;display:flex;flex-direction:column;position:relative;overflow:hidden;border-radius:0;background:#102a36;color:#f6fbff;border:0;box-shadow:none;isolation:isolate}.im-page:before{content:'';position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse at 50% -8%,rgba(76,158,255,.72),transparent 43%),radial-gradient(ellipse at 8% 18%,rgba(29,190,226,.16),transparent 38%),radial-gradient(ellipse at 95% 44%,rgba(31,91,222,.18),transparent 38%),linear-gradient(180deg,#09254d 0%,#06152f 42%,#030a19 100%)}.im-page:after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(ellipse at 15% 8%,rgba(114,196,213,.18),transparent 45%),linear-gradient(180deg,rgba(7,25,34,.1),rgba(7,25,34,.18))}
        .im-head{display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;flex:none;background:rgba(25,70,133,.32);-webkit-backdrop-filter:blur(14px) saturate(145%);backdrop-filter:blur(14px) saturate(145%);border-bottom:1px solid rgba(203,229,255,.18);position:sticky;top:0;z-index:2}
        .im-back,.im-icon{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.12);color:#f4fbff;border-radius:14px;min-width:42px;height:42px;font-size:22px;display:grid;place-items:center;cursor:pointer}
        .im-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;flex:none;background:linear-gradient(135deg,#8eb7ff,#c6a5ff);color:#fff;font-size:19px;font-weight:800;box-shadow:0 5px 16px #9ab8f044}
        .im-title{font-weight:750;font-size:16px;letter-spacing:.1px;color:#fff;text-shadow:0 1px 12px #0005}.im-sub{font-size:11px;color:rgba(240,250,255,.72);margin-top:3px}
        .im-feed{flex:1;min-height:0;padding:18px 14px 24px;overflow-y:auto;overscroll-behavior:contain;background:transparent}
        .im-day{text-align:center;margin:10px auto 18px;font-size:11px;color:rgba(255,255,255,.9);background:rgba(7,24,34,.34);border:1px solid rgba(255,255,255,.15);backdrop-filter:blur(14px);padding:6px 12px;border-radius:999px;width:max-content;max-width:90%}
        .im-row{display:flex;margin:9px 0;animation:im-arrive .24s ease-out both}.im-row.mine{justify-content:flex-end}.im-bubble{max-width:min(78%,480px);padding:11px 14px 7px;border-radius:20px;box-shadow:0 8px 24px rgba(0,0,0,.12);overflow-wrap:anywhere;white-space:pre-wrap;font-size:15px;line-height:1.48}
        .im-bubble.mine{color:white;background:linear-gradient(135deg,rgba(48,151,255,.98),rgba(15,91,231,.96));border:1px solid rgba(197,229,255,.24);border-bottom-right-radius:7px}.im-bubble.theirs{color:#f4fbff;background:rgba(28,54,91,.62);border:1px solid rgba(203,229,255,.18);border-bottom-left-radius:7px}
        .im-time{font-size:10px;opacity:.68;text-align:right;margin-top:4px}.im-empty{text-align:center;margin:10vh auto 0;max-width:260px;color:rgba(241,250,255,.78)}.im-empty-icon{width:76px;height:76px;border-radius:28px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(18px);display:grid;place-items:center;font-size:32px;margin:0 auto 16px;box-shadow:0 10px 30px #001a2a40}
        .im-composer{flex:none;padding:10px 12px calc(10px + env(safe-area-inset-bottom));display:flex;align-items:flex-end;gap:9px;background:rgba(8,25,54,.62);-webkit-backdrop-filter:blur(16px) saturate(145%);backdrop-filter:blur(16px) saturate(145%);border-top:1px solid rgba(203,229,255,.18);position:sticky;bottom:0}
        .im-plus{width:42px;height:42px;flex:none;border:1px solid rgba(255,255,255,.18);border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:24px;cursor:pointer}
        .im-input-wrap{display:flex;align-items:center;flex:1;min-width:0;background:rgba(6,24,34,.42);border:1px solid rgba(255,255,255,.22);border-radius:23px;padding:0 6px 0 15px;transition:border-color .2s,box-shadow .2s}
        .im-input-wrap:focus-within{border-color:#9ed7ff;box-shadow:0 0 0 3px #a8e0ff26}.im-input{width:100%;min-width:0;border:0!important;outline:0!important;background:transparent!important;padding:12px 0!important;color:#fff!important;box-shadow:none!important;font-size:15px}.im-input::placeholder{color:rgba(237,248,255,.64)}
        .im-send{width:36px;height:36px;flex:none;border:0;border-radius:50%;background:linear-gradient(135deg,#5d9bff,#387bf5);color:white;font-size:19px;display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 10px #4788f533}.im-send:disabled{opacity:.35;box-shadow:none}
        .im-error{padding:8px 14px;color:#b64c5b;background:#fff0f1;font-size:12px}\n        .im-photo-link{display:block;max-width:min(68vw,320px);border-radius:14px;overflow:hidden;margin:1px 0 4px}.im-photo{display:block;width:100%;max-height:360px;object-fit:cover;border-radius:14px}.im-photo-loading{padding:18px 26px;color:#8390a6;font-size:12px;background:#f1f4fa;border-radius:12px}.im-audio-card{display:flex;align-items:center;gap:10px;min-width:min(60vw,280px);max-width:100%}.im-audio-symbol{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:none;background:rgba(255,255,255,.22);font-size:13px}.im-audio-main{flex:1;min-width:0}.im-waveform{height:25px;display:flex;align-items:center;gap:3px;margin-bottom:4px}.im-waveform i{width:3px;flex:none;display:block;border-radius:4px;background:currentColor;opacity:.75}.im-audio-main audio{width:100%;height:28px;max-width:260px;filter:invert(.92) hue-rotate(175deg);opacity:.92}.im-sticker-tray{display:flex;gap:10px;overflow-x:auto;padding:12px 14px;background:rgba(8,29,39,.78);backdrop-filter:blur(24px);border-top:1px solid rgba(255,255,255,.14)}.im-sticker-choice{border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.1);border-radius:18px;min-width:52px;height:52px;font-size:29px;cursor:pointer;transition:transform .16s,background .16s}.im-sticker-choice:active{transform:scale(.9);background:rgba(255,255,255,.22)}.im-mic{width:42px;height:42px;flex:none;border:1px solid rgba(255,255,255,.18);border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:18px;display:grid;place-items:center;cursor:pointer}.im-mic.recording{background:#f04455;border-color:#ffb1b9;animation:im-pulse 1.2s ease-in-out infinite}.im-mic:disabled{opacity:.45;cursor:wait}@keyframes im-pulse{50%{box-shadow:0 0 0 6px rgba(240,68,85,.2)}}
        .im-details{padding:12px 16px;background:rgba(8,29,39,.76);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.15);display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:rgba(242,250,255,.8)}
        .im-reply-banner{display:flex;align-items:center;gap:10px;padding:9px 14px;background:rgba(13,39,69,.82);border-top:1px solid rgba(203,229,255,.12);color:#e8f4ff;font-size:12px}
        .im-reply-banner-main{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(232,244,255,.78)}
        .im-reply-banner button{border:0;background:rgba(255,255,255,.12);color:white;border-radius:10px;padding:5px 9px}
        .im-reply-quote{padding:7px 9px;margin:-2px 0 8px;border-left:3px solid rgba(216,238,255,.65);background:rgba(0,15,35,.16);border-radius:7px;font-size:11px;line-height:1.4;color:rgba(246,251,255,.82);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .im-message-tools{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:7px}
        .im-action-btn{border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:4px 7px;background:rgba(255,255,255,.10);color:inherit;font-size:10px;cursor:pointer}
        .im-reaction-picker{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;padding:6px;background:rgba(3,18,36,.22);border:1px solid rgba(255,255,255,.12);border-radius:12px}
        .im-reaction-picker button{border:0;background:rgba(255,255,255,.13);border-radius:9px;padding:5px 8px;font-size:17px}
        .im-reaction-groups{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
        .im-reaction-chip{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.12);color:inherit;border-radius:999px;padding:3px 7px;font-size:11px}
        .im-reaction-chip.mine{background:rgba(112,194,255,.28);border-color:rgba(170,221,255,.62)}
        .im-edit-box{width:100%;min-width:180px;min-height:68px;resize:vertical;border-radius:10px;border:1px solid rgba(255,255,255,.28);background:rgba(0,18,40,.26);color:inherit;padding:8px;font:inherit}
        .im-edit-actions{display:flex;gap:6px;margin-top:6px}
        .im-read-status{font-size:10px;opacity:.78;margin-left:4px}
        @keyframes im-arrive{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
        .im-row-out{animation:im-send-in .26s cubic-bezier(.34,1.45,.64,1) both}
        @keyframes im-send-in{0%{opacity:0;transform:translateY(20px) scale(.94)}70%{opacity:1;transform:translateY(-2px) scale(1.005)}100%{opacity:1;transform:translateY(0) scale(1)}}
        .im-row-static{animation:none}
        .im-row{transition:opacity .26s ease,transform .26s ease}
        .im-row-vanishing{opacity:0;transform:scale(.92) translateY(2px);pointer-events:none}
        .im-vrow{box-sizing:border-box}
        .im-page .im-vrow .im-row{margin:0 !important;animation:none !important}
        .im-vrow-fresh{animation:im-vrow-fade .25s ease-out both}
        @keyframes im-vrow-fade{from{opacity:0}to{opacity:1}}
        .im-out-col{display:flex;flex-direction:column;align-items:flex-end;min-width:0}
        .im-bubble-failed{background:linear-gradient(135deg,#fde8e9,#fbd9dc)!important;color:#7c2d38!important;border-color:rgba(214,90,105,.45)!important}
        .im-send-status{display:inline-flex;align-items:center;margin-left:5px;vertical-align:-2px;color:rgba(255,255,255,.78)}
        .im-send-status.sent{color:#8df0b3}
        .im-retry{display:inline-flex;align-items:center;gap:6px;margin-top:6px;border:0;background:transparent;color:#ff8f9b;font-size:11px;cursor:pointer;padding:2px 0}
        .im-retry-dot{width:18px;height:18px;border-radius:50%;background:#e5484d;color:#fff;display:grid;place-items:center;font-size:12px;line-height:1;flex:none}
        @media(min-width:700px){.im-page{height:var(--im-viewport-height,100dvh);min-height:0}.im-feed{padding:24px 28px}.im-composer{padding:14px 20px}}
        @media(max-width:600px){.im-head{gap:10px}.im-avatar{width:40px;height:40px}.im-back,.im-icon{min-width:40px;height:40px}.im-feed{padding:14px 12px 18px}.im-bubble{max-width:84%;font-size:15px}.im-composer{gap:8px}.im-plus{width:40px;height:40px}}\n        @media(prefers-reduced-motion:reduce){.im-row{animation:none}.im-row-out{animation:none}.im-vrow-fresh{animation:none}.im-row-vanishing{transition:none}}
      `}</style>
      <header className="im-head">
        <button className="im-back" aria-label="返回会话列表" onClick={() => goBackOr(nav, '/friends')}>
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" className="im-contact-stack" aria-label="查看会话资料" onClick={() => setShowDetails(true)}>
          <span className="im-avatar">
            {!isGroup && peerAvatarUrl ? <img src={peerAvatarUrl} alt="" /> : (isGroup ? '群' : (name.trim().charAt(0).toUpperCase() || '友'))}
          </span>
          <span className="im-contact-name-pill">
            <span className="im-title">{name}</span>
          </span>
          {otherTyping && <span className="im-sub">{isGroup ? '有人正在输入…' : '正在输入…'}</span>}
        </button>
        <button type="button" className="im-icon im-info-button" aria-label="更多聊天选项" title="更多聊天选项" onClick={() => setShowDetails(true)}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </header>
      {showDetails && <div className="im-profile-overlay" role="presentation" onClick={() => setShowDetails(false)}>
        <section className="im-profile-sheet" role="dialog" aria-modal="true" aria-label="会话资料"
          onClick={event => event.stopPropagation()}>
          <header className="im-profile-header">
            <button type="button" className="im-profile-close" onClick={() => setShowDetails(false)} aria-label="返回聊天">←</button>
            <span className="im-profile-header-spacer" aria-hidden="true" />
            <button
              type="button"
              className="im-profile-done"
              aria-label={isGroup ? '编辑群聊资料' : '编辑联系人备注'}
              title={isGroup ? '编辑群聊资料' : '编辑联系人备注'}
              onClick={() => {
                if (isGroup) {
                  document.querySelector<HTMLInputElement>('.chatcn-chat-group-rename input')?.focus();
                } else {
                  toast.info('联系人备注编辑功能暂未开放。');
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
              </svg>
            </button>
          </header>
          <div className="im-profile-scroll">
            <div className="im-profile-hero">
              <button type="button" className="im-profile-avatar im-profile-avatar-btn" aria-label={isGroup ? '群聊资料' : '查看' + name + '的主页'}
                onClick={() => { setShowDetails(false); if (peer && !isGroup) nav('/members/' + peer.id); }}>
                {!isGroup && peerAvatarUrl ? <img src={peerAvatarUrl} alt="" /> : <span>{isGroup ? '群' : (name.trim().charAt(0).toUpperCase() || '友')}</span>}
              </button>
              <div className="im-profile-name">{peer?.display_name ?? name}</div>
              <div className="im-profile-username">{isGroup ? groupMembers.length + ' 位成员 · 群聊' : peer?.username ? '@' + peer.username : '一对一私密会话'}</div>
              {!isGroup && <div className="im-profile-actions" role="group" aria-label="联系人快捷操作">
                <button type="button" className="im-profile-action" disabled={!peer || callBusy}
                  onClick={() => {
                    setShowDetails(false);
                    if (peer && cid) startCall({ id: peer.id, name }, Number(cid));
                  }}>
                  <span className="im-profile-action-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-6-6l2-2Z" />
                    </svg>
                  </span>
                  <span>电话</span>
                </button>
                <button type="button" className="im-profile-action"
                  onClick={() => toast.info('当前版本仅支持语音通话，视频通话尚未开放。')}>
                  <span className="im-profile-action-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2.5" y="6" width="13" height="12" rx="2.5" /><path d="m15.5 10 6-3v10l-6-3" />
                    </svg>
                  </span>
                  <span>视频</span>
                </button>
                <button type="button" className="im-profile-action" disabled={!peer}
                  onClick={() => { if (peer) { setShowDetails(false); nav('/members/' + peer.id); } }}>
                  <span className="im-profile-action-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="7" r="4" /><path d="M4.5 21v-1.5a7.5 7.5 0 0 1 15 0V21Z" />
                    </svg>
                  </span>
                  <span>个人资料</span>
                </button>
                <button type="button" className="im-profile-action" aria-expanded={showProfileMore}
                  onClick={() => setShowProfileMore(open => !open)}>
                  <span className="im-profile-action-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" />
                    </svg>
                  </span>
                  <span>更多</span>
                </button>
              </div>}
              {showProfileMore && !isGroup && (
                <div className="im-profile-more-menu">
                  <button type="button" onClick={() => {
                    if (!peer?.username || !navigator.clipboard?.writeText) {
                      toast.error('当前浏览器暂不支持复制用户名。');
                    } else {
                      void navigator.clipboard.writeText('@' + peer.username)
                        .then(() => toast.success('已复制用户名'))
                        .catch(() => toast.error('复制失败，请重试。'));
                    }
                    setShowProfileMore(false);
                  }}>复制用户名</button>
                  <button type="button" onClick={() => {
                    setShowProfileMore(false);
                    setShowDetails(false);
                    if (peer) nav('/members/' + peer.id);
                  }}>打开公开主页</button>
                </div>
              )}
              {isGroup && <section className="im-profile-section">
                <div className="im-profile-section-heading">群成员（{groupMembers.length}）
                  {(myGroupRole === 'owner' || myGroupRole === 'admin') && <button type="button" className="chatcn-group-add-trigger" disabled={groupInviteBusy} onClick={async () => {
                    setGroupInviteBusy(true);
                    const { data, error } = await supabase.rpc('my_friends');
                    if (error) setError('加载好友列表失败：' + error.message);
                    else {
                      const currentIds = new Set(groupMembers.map(member => member.id));
                      setGroupInviteFriends(((data ?? []) as ChatPeer[]).filter(friend => !currentIds.has(friend.id)));
                      setGroupInviteSelectedIds([]);
                      setShowGroupInvitePicker(true);
                    }
                    setGroupInviteBusy(false);
                  }}>{groupInviteBusy ? '加载中…' : '添加成员'}</button>}
                </div>
                <div className="chatcn-chat-group-members">
                  {groupMembers.map(member => <div className="chatcn-chat-group-member" key={member.id}>
                    <span className="chatcn-chat-group-member-avatar">{member.display_name?.slice(0, 1) ?? member.username.slice(0, 1)}</span>
                    <span><strong>{member.display_name ?? member.username}</strong><small>@{member.username}</small></span>
                    <em>{member.role === 'owner' ? '群主' : member.role === 'admin' ? '管理员' : '成员'}</em>
                    {myGroupRole === 'owner' && member.id !== me && <button type="button" className="chatcn-group-member-action" disabled={groupActionBusy} onClick={async () => {
                      setGroupActionBusy(true);
                      const { error } = await supabase.rpc('transfer_group_ownership', { p_conversation_id: Number(cid), p_new_owner: member.id });
                      if (error) setError('转让群主失败：' + error.message);
                      else { setMyGroupRole('member'); setGroupMembers(current => current.map(item => ({ ...item, role: item.id === member.id ? 'owner' : item.id === me ? 'member' : item.role }))); }
                      setGroupActionBusy(false);
                    }}>转让</button>}
                    {(myGroupRole === 'owner' || (myGroupRole === 'admin' && member.role === 'member')) && member.id !== me && member.role !== 'owner' && <button type="button" className="chatcn-group-member-action danger" disabled={groupActionBusy} onClick={async () => {
                      setGroupActionBusy(true);
                      const { error } = await supabase.rpc('remove_group_member', { p_conversation_id: Number(cid), p_target_profile_id: member.id });
                      if (error) setError('移除成员失败：' + error.message);
                      else setGroupMembers(current => current.filter(item => item.id !== member.id));
                      setGroupActionBusy(false);
                    }}>移除</button>}
                  </div>)}
                </div>
                {showGroupInvitePicker && <div className="chatcn-group-invite">
                  {groupInviteFriends.length === 0 ? <p>没有可邀请的新好友。</p> : groupInviteFriends.map(friend => <label key={friend.id}>
                    <span className="chatcn-group-invite-avatar">{friend.display_name?.slice(0,1) ?? friend.username.slice(0,1)}</span>
                    <span>{friend.display_name ?? friend.username}<small>@{friend.username}</small></span>
                    <input type="checkbox" checked={groupInviteSelectedIds.includes(friend.id)} onChange={event => setGroupInviteSelectedIds(current => event.target.checked ? [...current, friend.id] : current.filter(id => id !== friend.id))} />
                  </label>)}
                  <div className="chatcn-group-invite-actions">
                    <button type="button" onClick={() => setShowGroupInvitePicker(false)}>取消</button>
                    <button type="button" disabled={groupInviteBusy || groupInviteSelectedIds.length === 0} onClick={async () => {
                      setGroupInviteBusy(true);
                      const { error } = await supabase.rpc('add_group_members', { p_conversation_id: Number(cid), p_member_ids: groupInviteSelectedIds });
                      if (error) setError('邀请成员失败：' + error.message);
                      else {
                        const { data: refreshed } = await supabase.rpc('get_group_conversation_details', { p_conversation_id: Number(cid) });
                        if (refreshed?.[0]) setGroupMembers(Array.isArray(refreshed[0].members) ? refreshed[0].members as unknown as Array<{ id: string; username: string; display_name: string | null; avatar_path: string | null; role: string; joined_at: string }> : []);
                        setShowGroupInvitePicker(false);
                        setGroupInviteSelectedIds([]);
                      }
                      setGroupInviteBusy(false);
                    }}>{groupInviteBusy ? '处理中…' : '邀请所选成员'}</button>
                  </div>
                </div>}
                {(myGroupRole === 'owner' || myGroupRole === 'admin') && <div className="chatcn-chat-group-rename">
                  <input aria-label="群聊名称" maxLength={40} value={groupRenameValue} onChange={event => setGroupRenameValue(event.target.value)} />
                  <button type="button" disabled={groupActionBusy || !groupRenameValue.trim() || groupRenameValue.trim() === name} onClick={async () => {
                    setGroupActionBusy(true);
                    const { error } = await supabase.rpc('rename_group_conversation', { p_conversation_id: Number(cid), p_group_name: groupRenameValue.trim() });
                    if (error) setError('修改群名称失败：' + error.message);
                    else { setName(groupRenameValue.trim()); setShowDetails(false); }
                    setGroupActionBusy(false);
                  }}>{groupActionBusy ? '保存中…' : '保存群名'}</button>
                </div>}
                <button type="button" className="chatcn-chat-group-leave" disabled={groupActionBusy || myGroupRole === 'owner'} onClick={async () => {
                  if (myGroupRole === 'owner') return;
                  setGroupActionBusy(true);
                  const { error } = await supabase.rpc('leave_group_conversation', { p_conversation_id: Number(cid) });
                  if (error) setError('退出群聊失败：' + error.message);
                  else nav('/friends');
                  setGroupActionBusy(false);
                }}>{myGroupRole === 'owner' ? '群主需先转让群主身份才能退出' : '退出群聊'}</button>
              </section>}
            </div>
            {!isGroup && <div className="im-profile-settings-card">
              <button type="button" className="im-profile-setting-row" onClick={() => {
                sharedMediaRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
              }}>
                <span className="im-profile-setting-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="5" width="14" height="14" rx="3" transform="rotate(-8 4 5)" /><rect x="7" y="3" width="14" height="14" rx="3" transform="rotate(8 7 3)" /><circle cx="14" cy="9" r="1.5" /><path d="m8 16 3.5-4 2.5 2 1.5-1.5L19 16" />
                  </svg>
                </span>
                <span className="im-profile-setting-label">媒体、链接、文档</span>
                <span className="im-profile-setting-meta">{sharedMediaCount} 项</span>
                <span className="im-profile-setting-chevron" aria-hidden="true">›</span>
              </button>
              <div className="im-profile-setting-row im-profile-setting-row-static" role="group" aria-label="消失的私信"
                style={{ gridTemplateColumns: '30px minmax(0,1fr) auto' }}>
                <span className="im-profile-setting-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="M17.5 3.5 20 6" />
                  </svg>
                </span>
                <span className="im-profile-setting-label">消失的私信</span>
                <span className="im-profile-setting-meta">
                  <OptionSheet
                    value={disappearingOptionValue(disappearingMode, disappearingSeconds)}
                    title="消失的私信"
                    buttonText={disappearingButtonLabel(disappearingMode, disappearingSeconds)}
                    buttonStyle={{ color: '#83909c', fontSize: 11, padding: 0 }}
                    options={DISAPPEARING_OPTIONS}
                    onChange={value => void saveDisappearingOption(value)}
                  />
                </span>
              </div>
              <button type="button" className="im-profile-setting-row" onClick={() => toast.info('网页端无法可靠阻止系统级截屏，因此暂不提供此开关。')}>
                <span className="im-profile-setting-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><rect x="7" y="8" width="10" height="8" rx="2" /><circle cx="12" cy="12" r="2" />
                  </svg>
                </span>
                <span className="im-profile-setting-label">阻止截屏</span>
                <span className="im-profile-setting-meta">关闭</span>
                <span className="im-profile-setting-chevron" aria-hidden="true">›</span>
              </button>
            </div>}
            {!isGroup && <div className="im-profile-settings-note">开启后，对方在消息消失前截屏或复制走的内容无法收回。</div>}
            <section className="im-profile-section">
              <div className="im-profile-section-heading">聊天背景</div>
              <div className="im-wallpaper-grid">
                {[
                  { id: 'default', label: '清透白', preview: 'radial-gradient(ellipse at 16% 8%,rgba(187,211,250,.35),transparent 50%),#fff' },
                  { id: 'sky', label: '晴空', preview: 'linear-gradient(155deg,#f5faff,#e3efff)' },
                  { id: 'lavender', label: '薰衣草', preview: 'linear-gradient(145deg,#fff,#ece5ff)' },
                  { id: 'mint', label: '薄荷', preview: 'linear-gradient(145deg,#fff,#e4f5ee)' },
                  { id: 'sunset', label: '晚霞', preview: 'linear-gradient(145deg,#fff,#ffe9df)' },
                ].map(preset => <button key={preset.id} type="button"
                  className={'im-wallpaper-choice' + (chatBackground === preset.id ? ' active' : '')}
                  aria-pressed={chatBackground === preset.id}
                  disabled={backgroundSaving}
                  onClick={() => void saveChatBackground(preset.id)}>
                  <span className="im-wallpaper-preview" style={{ background: preset.preview }} />
                  <span>{preset.label}</span>
                </button>)}
              </div>
              <div className="im-wallpaper-actions">
                <input ref={backgroundFileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic" hidden
                  onChange={event => void uploadChatBackground(event.target.files?.[0])} />
                <button type="button" className="im-background-upload" disabled={backgroundSaving}
                  onClick={() => backgroundFileRef.current?.click()}>
                  {backgroundSaving ? '正在保存…' : '选择自己的照片'}
                </button>
                {chatBackground.startsWith('image:') && <span className="im-background-hint">当前使用自定义照片</span>}
              </div>
            </section>
            <section className="im-profile-section" ref={sharedMediaRef}>
              <div className="im-profile-section-heading">媒体、链接、文档</div>
              {sharedImageMessages.length > 0 && (
                <div className="im-shared-grid">
                  {sharedImageMessages.slice(-9).reverse().map(photo => (
                    <div className="im-shared-photo" key={photo.id}><MessageContent body={photo.body} /></div>
                  ))}
                </div>
              )}
              {sharedAudioMessages.length > 0 && (
                <div className="im-profile-shared-audio">
                  {sharedAudioMessages.slice(-8).reverse().map(audio => (
                    <div className="im-profile-shared-audio-item" key={audio.id}>
                      <MessageContent body={audio.body} />
                    </div>
                  ))}
                </div>
              )}
              {sharedFileMessages.length > 0 && (
                <div className="im-profile-shared-files">
                  {sharedFileMessages.slice(-8).reverse().map(file => (
                    <div className="im-profile-shared-file" key={file.id}><MessageContent body={file.body} /></div>
                  ))}
                </div>
              )}
              {sharedLinkItems.length > 0 && (
                <div className="im-profile-shared-links">
                  {sharedLinkItems.slice(-8).reverse().map(item => (
                    <a key={item.key} href={item.url} target="_blank" rel="noreferrer">{item.url}</a>
                  ))}
                </div>
              )}
              {sharedMediaCount === 0 && <div className="im-profile-empty">你们分享的照片、语音、链接和文件会显示在这里。</div>}
            </section>
            <div className="im-profile-footer">聊天背景仅对你自己生效，不会改变对方的聊天界面。</div>
          </div>
        </section>
      </div>}
      {disappearingMode !== 'off' && (
        <div className="im-disappearing-banner" role="status">
          消失的私信已开启：{disappearingMode === 'after_read' ? '对方看完 30 秒后消息消失' : `消息在发送 ${formatDisappearingDuration(disappearingSeconds ?? 0)} 后消失`}
        </div>
      )}
      <main ref={feedRef} className="im-feed">
        {msgs.length === 0 && outbox.length === 0 ? (
          showMsgsSkeleton ? (
            <div role="status" aria-label="消息加载中" style={{ padding: '18px 14px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="fx-skel-wrap" style={{ marginBottom: 12, display: 'flex', justifyContent: i % 2 ? 'flex-end' : 'flex-start' }}>
                  <div className="fx-skel" style={{ width: (58 - i * 8) + '%', height: 40, borderRadius: 18 }} />
                </div>
              ))}
            </div>
          ) : loadingMsgs ? null : (
            <div className="im-empty"><div style={{fontWeight:750,color:'#f5fbff',fontSize:16}}>新的开始</div><p style={{fontSize:13,lineHeight:1.7}}>发出第一条消息，开启你们的对话吧。</p></div>
          )
        ) : (<>
          {msgs.length > 0 && <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const m = msgs[virtualRow.index];
              const i = virtualRow.index;
          const parent = m.reply_to_id ? msgsById.get(m.reply_to_id) ?? null : null;
          const groups = reactionsByMessage.get(m.id) ?? [];
          const mine = m.sender_id === me;
          const previousMessage = msgs[i - 1];
          const nextMessage = msgs[i + 1];
          const samePrevious = Boolean(previousMessage
            && previousMessage.sender_id === m.sender_id
            && !dateLabel(m.created_at, previousMessage.created_at)
            && new Date(m.created_at).getTime() - new Date(previousMessage.created_at).getTime() <= 300000);
          const sameNext = Boolean(nextMessage
            && nextMessage.sender_id === m.sender_id
            && !dateLabel(nextMessage.created_at, m.created_at)
            && new Date(nextMessage.created_at).getTime() - new Date(m.created_at).getTime() <= 300000);
          const deleted = Boolean(m.deleted_at);
          const canEdit = mine && !deleted && !m.body.startsWith('[[im-image:') && !m.body.startsWith('[[im-audio:');
          // 正在消失的消息即使已被清理打上 deleted_at，也继续显示原文，不中途变成“撤回”。
          const displayBody = deleted && !vanishingIds.has(m.id) ? (mine ? '你撤回了一条消息' : '对方撤回了一条消息') : m.body;
          const inlineMeta = editingId !== m.id && canShowInlineMeta(displayBody, Boolean(m.reply_to_id));
          const receiptLabel = !isGroup && mine && m.id === latestOutgoingMessageId && userPreferences.chat.showReadReceipts
            ? (otherLastReadMessageId !== null && otherLastReadMessageId >= m.id ? '已读' : '已送达')
            : '';
          return (
            <div key={virtualRow.key} data-index={virtualRow.index} ref={el => { virtualizer.measureElement(el); if (el) rowElsRef.current.set(m.id, el); else rowElsRef.current.delete(m.id); }}
              className={'im-vrow' + (freshId === m.id ? ' im-vrow-fresh' : '')}
              onAnimationEnd={() => { if (freshId === m.id) setFreshId(null); }}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)`, padding: `${samePrevious ? 1 : 3}px 0 ${sameNext ? 1 : 3}px 0`, boxSizing: 'border-box' }}>
              {dateLabel(m.created_at, msgs[i - 1]?.created_at) && <div className="im-day">{dateLabel(m.created_at, msgs[i - 1]?.created_at)}</div>}
              <div className={'im-row ' + (mine ? 'mine ' : '') + (mine && m.id === latestOutgoingMessageId && userPreferences.chat.showReadReceipts ? 'im-row-has-receipt ' : '') + (samePrevious ? 'im-row-grouped-prev ' : '') + (sameNext ? 'im-row-grouped-next ' : '') + (swappedIdsRef.current.has(m.id) ? 'im-row-static' : '') + (vanishingIds.has(m.id) ? 'im-row-vanishing ' : '')}>
                <div className={'im-message-column ' + (mine ? 'mine' : 'theirs')}>
                  {isGroup && !mine && !samePrevious && <span className="chatcn-group-sender-name">{groupMembers.find(member => member.id === m.sender_id)?.display_name ?? groupMembers.find(member => member.id === m.sender_id)?.username ?? '群成员'}</span>}
                  <div className={'im-bubble ' + (mine ? 'mine' : 'theirs') + (samePrevious ? ' im-bubble-grouped-prev' : '') + (sameNext ? ' im-bubble-grouped-next' : '')}
                    onTouchStart={event => startMessagePress(m.id, event.currentTarget)}
                    onTouchMove={clearMessagePress}
                    onTouchEnd={clearMessagePress}
                    onTouchCancel={clearMessagePress}
                    onContextMenu={event => { event.preventDefault(); openMessageActions(m.id, event.currentTarget); }}>
                    {m.reply_to_id && <div className="im-reply-quote">回复：{messageSummary(parent)}</div>}
                    {editingId === m.id ? (
                      <>
                        <textarea className="im-edit-box" value={editingText} maxLength={2000} onChange={event => setEditingText(event.target.value)} aria-label="编辑消息" />
                        <div className="im-edit-actions">
                          <button type="button" className="im-action-btn" onClick={() => saveEdit(m.id)}>保存</button>
                          <button type="button" className="im-action-btn" onClick={() => { setEditingId(null); setEditingText(''); }}>取消</button>
                        </div>
                      </>
                    ) : (
                      <MessageContent body={displayBody} />
                    )}
                    {inlineMeta && <span className={'im-inline-meta ' + (mine ? 'mine' : 'theirs')}>{messageTimeLabel(m.created_at)}{receiptLabel ? ' · ' + receiptLabel : ''}</span>}
                    {m.edited_at && !deleted && <div className="im-edited-mark">已编辑</div>}
                    {groups.length > 0 && <div className="im-reaction-groups">
                      {groups.map(group => {
                        const mineReacted = group.items.some(item => item.profile_id === me);
                        return <button key={group.reaction} type="button" className={'im-reaction-chip' + (mineReacted ? ' mine' : '')} onClick={() => toggleReaction(m.id, group.reaction)}>{group.reaction} {group.items.length}</button>;
                      })}
                    </div>}
                  </div>
                  {!inlineMeta && <div className={'im-message-footer ' + (mine ? 'mine' : 'theirs')}>
                    <span>{messageTimeLabel(m.created_at)}</span>
                    {receiptLabel && <span>{receiptLabel}</span>}
                  </div>}
                </div>
              </div>
            </div>
          );
            })}
          </div>}
          <AnimatePresence initial={false}>
          {outbox.map(e => {
          const inlineMeta = canShowInlineMeta(e.body, e.replyToId !== null);
          const phaseLabel = e.phase === 'sending' ? '发送中' : e.phase === 'failed' ? '发送失败' : '已送达';
          return (
          <motion.div key={e.tempKey}
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5, scale: 0.99 }}
            transition={reduceMotion ? { duration: 0.01 } : SPRING_SNAPPY}>
            <div className="im-row mine im-row-out">
              <div className="im-out-col im-message-column mine">
                <div className={'im-bubble mine' + (e.phase === 'failed' ? ' im-bubble-failed' : '')}>
                  {e.replyToId !== null && <div className="im-reply-quote">回复：{e.replySummary ?? ''}</div>}
                  <MessageContent body={e.body} />
                  {inlineMeta && <span className="im-inline-meta mine">{messageTimeLabel(e.createdAtMs)} · {phaseLabel}</span>}
                </div>
                {!inlineMeta && <div className="im-message-footer mine">
                  <span>{messageTimeLabel(e.createdAtMs)}</span>
                  <span className="im-outbox-phase">
                    <span className={'im-send-status' + (e.phase === 'sent' ? ' sent' : '')} aria-hidden="true">
                      {e.phase === 'sending' ? <ClockIcon /> : e.phase === 'sent' ? <SentIcon /> : '!'}
                    </span>
                    {phaseLabel}
                  </span>
                </div>}
                {e.phase === 'failed' && <button type="button" className="im-retry" onClick={() => retryEntry(e.tempKey)}><span className="im-retry-dot">↻</span>点击重试</button>}
              </div>
            </div>
          </motion.div>
          );
        })}
        </AnimatePresence>
        </>)}
        {otherTyping && <div className="im-typing" role="status" aria-live="polite">
          <span className="im-typing-dots"><i /><i /><i /></span>
          <span>{name} 正在输入</span>
        </div>}
        <div ref={bottomRef} />
      </main>
      {actionFor !== null && (() => {
        const message = msgsById.get(actionFor);
        if (!message) return null;
        const mine = message.sender_id === me;
        const deleted = Boolean(message.deleted_at);
        const canEdit = mine && !deleted && !message.body.startsWith('[[im-image:') && !message.body.startsWith('[[im-audio:');
        return <div className="im-context-overlay" role="presentation" onClick={() => { setActionFor(null); setTapbackAnchor(null); }}>
          {tapbackAnchor && <div className={'im-tapback-preview ' + (mine ? 'mine' : 'theirs')}
            style={{ left: tapbackAnchor.left, top: tapbackAnchor.top, width: tapbackAnchor.width }}
            aria-hidden="true">
            {message.reply_to_id && <div className="im-reply-quote">回复：{messageSummary(msgsById.get(message.reply_to_id))}</div>}
            <MessageContent body={deleted ? (mine ? '你撤回了一条消息' : '对方撤回了一条消息') : message.body} />
            <div className="im-tapback-preview-time">{new Date(message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>}
          {!deleted && tapbackAnchor && <div className="im-tapback-dock"
            style={{ left: tapbackAnchor.dockLeft, top: tapbackAnchor.dockTop }}
            role="group" aria-label="快速回应" onClick={event => event.stopPropagation()}>
            {QUICK_REACTIONS.map(reaction => <button key={reaction} type="button" aria-label={'回应 ' + reaction}
              onClick={() => { setActionFor(null); setTapbackAnchor(null); void toggleReaction(message.id, reaction); }}>{reaction}</button>)}
          </div>}
          <section className="im-context-sheet" role="dialog" aria-modal="true" aria-label="消息操作"
            style={tapbackAnchor ? { left: tapbackAnchor.menuLeft, top: tapbackAnchor.menuTop } : undefined}
            onClick={event => event.stopPropagation()}>
            <div className="im-context-grabber" />
            <div className="im-context-label">{mine ? '你发送的消息' : name + ' 发送的消息'}</div>
            <div className="im-context-actions">
              {!deleted && <button type="button" onClick={() => { setActionFor(null); setTapbackAnchor(null); void copyMessage(message); }}>
                <span className="im-context-action-icon">⧉</span><span>复制</span>
              </button>}
              {!deleted && <button type="button" onClick={() => { setActionFor(null); setTapbackAnchor(null); beginReply(message); }}>
                <span className="im-context-action-icon">↩</span><span>回复</span>
              </button>}
              {canEdit && <button type="button" onClick={() => { setActionFor(null); setTapbackAnchor(null); setEditingId(message.id); setEditingText(message.body); }}>
                <span className="im-context-action-icon">✎</span><span>编辑</span>
              </button>}
              {mine && !deleted && <button type="button" className="danger" onClick={() => { setActionFor(null); setTapbackAnchor(null); void withdrawMessage(message.id); }}>
                <span className="im-context-action-icon">⌫</span><span>撤回</span>
              </button>}
              <button type="button" onClick={() => { setActionFor(null); setTapbackAnchor(null); }}>
                <span className="im-context-action-icon">×</span><span>取消</span>
              </button>
            </div>
          </section>
        </div>;
      })()}
      {error && <div className="im-error">{error}</div>}
      <AnimatePresence initial={false}>
        {showStickers && <motion.div
          ref={attachmentTrayRef}
          id="chat-attachment-tray"
          key="chat-attachment-tray"
          className="im-sticker-tray"
          role="group"
          aria-label="附件菜单"
          initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 7, scale: 0.99 }}
          transition={reduceMotion ? { duration: 0.01 } : SPRING_SNAPPY}
        >
          <div className="im-tray-tabs" role="tablist" aria-label="选择附件类型">
            <button type="button" role="tab" aria-selected={!showStickerEmojis} className={!showStickerEmojis ? 'on' : ''} onClick={() => setShowStickerEmojis(false)}>附件</button>
            <button type="button" role="tab" aria-selected={showStickerEmojis} className={showStickerEmojis ? 'on' : ''} onClick={() => setShowStickerEmojis(true)}>贴纸</button>
          </div>
          {!showStickerEmojis ? (
            <div className="im-attach-list">
              <button type="button" className="im-attach-choice" onClick={() => { setShowStickers(false); imageRef.current?.click(); }}>
                <span className="im-attach-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m4 17 5-4 3 2 3-4 5 5"/></svg>
                </span><span>照片</span>
              </button>
              <button type="button" className="im-attach-choice" onClick={() => { setShowStickers(false); cameraRef.current?.click(); }}>
                <span className="im-attach-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></svg>
                </span><span>相机</span>
              </button>
              <button type="button" className="im-attach-choice" onClick={() => { setShowStickers(false); fileRef.current?.click(); }}>
                <span className="im-attach-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v6h6"/></svg>
                </span><span>文件</span>
              </button>
              <button type="button" className="im-attach-choice" onClick={() => { setShowStickers(false); gifRef.current?.click(); }}>
                <span className="im-attach-icon im-gif-icon" aria-hidden="true">GIF</span><span>GIF</span>
              </button>
            </div>
          ) : (
            <div className="im-sticker-grid">
              {['🥹','😂','❤️','😍','🐱','🐻','✨','🎉','👍','😭','🫶','🌸','💖','😎'].map(sticker => (
                <button key={sticker} type="button" className="im-sticker-choice" aria-label={'发送贴纸 ' + sticker}
                  onClick={() => { setShowStickers(false); setShowStickerEmojis(false); void sendSticker(sticker); }}>{sticker}</button>
              ))}
            </div>
          )}
        </motion.div>}
      </AnimatePresence>
      {replyTarget && <div className="im-reply-banner">
        <span>回复</span>
        <span className="im-reply-banner-main">{messageSummary(replyTarget)}</span>
        <button type="button" onClick={() => setReplyTarget(null)} aria-label="取消回复">取消</button>
      </div>}
      {uploading && upPct !== null && <div style={{ padding: '8px 14px 0' }}><SmoothProgress value={upPct} label={`正在发送媒体 ${upPct}%`} /></div>}
      <form className="im-composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={e => sendImage(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => sendImage(e.target.files?.[0])} />
        <input ref={fileRef} type="file" hidden onChange={e => sendFile(e.target.files?.[0])} />
        <input ref={gifRef} type="file" accept="image/gif,.gif" hidden onChange={e => sendGif(e.target.files?.[0])} />
        <button
          ref={attachmentButtonRef}
          type="button"
          className="im-plus"
          aria-label={showStickers ? '关闭附件菜单' : '打开附件菜单'}
          aria-expanded={showStickers}
          aria-controls="chat-attachment-tray"
          title={showStickers ? '关闭附件菜单' : '打开附件菜单'}
          disabled={uploading || recording}
          onClick={() => { setShowStickers(v => !v); setShowStickerEmojis(false); }}
        >{showStickers ? '×' : '＋'}</button>
        {!isGroup && (
          <OptionSheet
            value={disappearingOptionValue(disappearingMode, disappearingSeconds)}
            title="消失的私信"
            buttonContent={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /><path d="M17.5 3.5 20 6" />
              </svg>
            }
            buttonAriaLabel={disappearingMode === 'off' ? '设置消失的私信' : `消失的私信：${disappearingButtonLabel(disappearingMode, disappearingSeconds)}`}
            buttonClassName={'im-timer' + (disappearingMode !== 'off' ? ' im-timer--on' : '')}
            buttonStyle={{ justifyContent: 'center', padding: 0 }}
            options={DISAPPEARING_OPTIONS}
            onChange={value => void saveDisappearingOption(value)}
          />
        )}
        <div className="im-input-wrap">
          <input ref={inputRef} className="im-input" value={text} onChange={e => { setText(e.target.value); notifyTyping(e.target.value); }}
            placeholder={recording ? '录音中 ' + String(Math.floor(recordSeconds / 60)).padStart(2, '0') + ':' + String(recordSeconds % 60).padStart(2, '0') + ' · 点红色按钮结束' : uploading ? '正在发送媒体…' : '私信'} maxLength={2000} autoComplete="off" aria-label="输入消息" />
          {!text.trim() && <button type="button" className={'im-mic' + (recording ? ' recording' : '')} aria-label={recording ? '结束录音并发送' : '录制语音'} title={recording ? '结束录音并发送' : '录制语音'} disabled={uploading} onClick={recording ? stopRecording : startRecording}>{recording ? '■' : <svg width="15" height="18" viewBox="0 0 18 22" fill="none" aria-hidden="true"><rect x="6" y="1" width="6" height="13" rx="3" stroke="currentColor" strokeWidth="1.7" /><path d="M3 10.5v1a6 6 0 0 0 12 0v-1M9 17.5V21M6 21h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>}</button>}
          {text.trim() && <button type="submit" className="im-send" aria-label="发送消息" disabled={uploading || recording}>↑</button>}
        </div>
      </form>
      <DisappearingCustomDialog
        open={showCustomDuration}
        initialSeconds={disappearingMode === 'timed' ? disappearingSeconds : null}
        onClose={() => setShowCustomDuration(false)}
        onConfirm={seconds => { setShowCustomDuration(false); void saveDisappearing('timed', seconds); }}
      />
    </div>
  );
}
