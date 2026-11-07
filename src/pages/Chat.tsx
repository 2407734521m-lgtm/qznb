import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth';
import { downscaleImage, uploadMedia, useSignedUrl } from '../lib/media';
import { goBackOr } from '../components/BackButton';
import { confirmDialog } from '../lib/dialog';
import type { ChatMessage } from '../types/message';
import { useUserPreferences } from '../lib/userPreferences';
import './Chat.polish.css';

type ChatReaction = { message_id: number; profile_id: string; reaction: string; created_at: string };
type ChatPeer = { id: string; username: string; display_name: string | null; avatar_path: string | null };
type TapbackAnchor = { left: number; top: number; width: number; dockLeft: number; dockTop: number };
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];


function MessageContent({ body }: { body: string }) {
  const imagePath = body.startsWith('[[im-image:') && body.endsWith(']]') ? body.slice(11, -2) : null;
  const audioPath = body.startsWith('[[im-audio:') && body.endsWith(']]') ? body.slice(11, -2) : null;
  const url = useSignedUrl('chat-media', imagePath ?? audioPath);
  if (imagePath) return url ? <a href={url} target="_blank" rel="noreferrer" className="im-photo-link"><img className="im-photo" src={url} alt="聊天图片" loading="lazy" /></a> : <div className="im-photo-loading">图片加载中…</div>;
  if (audioPath) return url ? <div className="im-audio-card"><div className="im-audio-symbol">▶</div><div className="im-audio-main"><div className="im-waveform" aria-hidden="true">{Array.from({ length: 34 }, (_, i) => <i key={i} style={{ height: (5 + ((i * 7 + 3) % 17)) + 'px' }} />)}</div><audio controls preload="metadata" src={url} aria-label="语音消息播放" /></div></div> : <div className="im-photo-loading">语音加载中…</div>;
  return <>{body}</>;
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

export default function Chat() {
  const { cid } = useParams();
  const me = useAuth().session!.user.id;
  const userPreferences = useUserPreferences(me);
  const nav = useNavigate();
  const loc = useLocation() as { state?: { name?: string } };
  const [name, setName] = useState(loc.state?.name ?? '聊天');
  const [peer, setPeer] = useState<ChatPeer | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const outboxSeqRef = useRef(0);
  const swappedIdsRef = useRef<Set<number>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
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
    if (!cid || !Number.isFinite(Number(cid))) return;
    const conversationId = Number(cid);
    const { data, error: loadError } = await supabase.from('messages').select('*')
      .eq('conversation_id', conversationId).order('created_at');
    // Realtime、轮询和手动刷新可能同时完成；只应用最后发起的请求结果。
    if (requestId !== loadSequenceRef.current) return;
    if (data) {
      setMsgs(data);
      setError('');
      const messageIds = data.map(message => message.id);
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
      return;
    }

    const { data: members } = await supabase.from('conversation_members')
      .select('profile_id,last_receipt_message_id')
      .eq('conversation_id', conversationId);
    if (requestId !== loadSequenceRef.current) return;
    const otherMember = (members ?? []).find(member => member.profile_id !== me);
    setOtherLastReadMessageId(otherMember?.last_receipt_message_id ?? null);

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
      const { data: members } = await supabase.from('conversation_members').select('profile_id')
        .eq('conversation_id', Number(cid));
      const other = ((members ?? []) as Array<{ profile_id: string }>).map(x => x.profile_id).find(x => x !== me);
      if (!other) return;
      const { data: friends } = await supabase.rpc('my_friends');
      const found = ((friends ?? []) as ChatPeer[]).find(item => item.id === other);
      if (peerLookupActive && found) {
        setPeer(found);
        setName(found.display_name ?? found.username ?? loc.state?.name ?? '聊天');
      }
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
    const fallback = setInterval(load, 12000);
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
  }, [cid]);

  useEffect(() => {
    let active = true;
    if (!cid || !Number.isFinite(Number(cid))) return;
    supabase.from('conversation_members').select('chat_background')
      .eq('conversation_id', Number(cid)).eq('profile_id', me).maybeSingle()
      .then(({ data }) => {
        if (active && data?.chat_background) setChatBackground(data.chat_background);
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: firstRef.current ? 'auto' : 'smooth' });
    firstRef.current = false;
  }, [msgs.length, outbox.length]);

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
      const dockWidth = Math.min(316, Math.max(220, window.innerWidth - 24));
      const dockLeft = Math.max(12, Math.min(
        rect.left + rect.width / 2 - dockWidth / 2,
        window.innerWidth - dockWidth - 12,
      ));
      const dockTop = rect.top >= 76
        ? rect.top - 62
        : Math.min(window.innerHeight - 58, rect.bottom + 10);
      setTapbackAnchor({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(1, rect.width) - 8)),
        top: Math.max(8, Math.min(rect.top, window.innerHeight - Math.max(1, rect.height) - 8)),
        width: Math.min(rect.width, window.innerWidth - 16),
        dockLeft,
        dockTop,
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
    const { error: saveError } = await supabase.rpc('set_chat_background', {
      p_conversation_id: Number(cid),
      p_background: value,
    });
    if (saveError) setError('聊天背景保存失败，请重试。');
    else setChatBackground(value);
    setBackgroundSaving(false);
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
      path = await uploadMedia('chat-media', compact, Number(cid) + '/' + me);
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
      const path = await uploadMedia('chat-media', compact, Number(cid) + '/' + me);
      const { error: sendError } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body: '[[im-image:' + path + ']]', reply_to_id: replyTarget?.id ?? null });
      if (sendError) throw sendError;
      setReplyTarget(null);
      await load();
    } catch (e) {
      console.error('chat image upload failed', e);
      setError('图片发送失败。请确认聊天媒体存储策略已启用，然后重试。');
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = '';
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
          const path = await uploadMedia('chat-media', file, Number(cid) + '/' + me);
          const { error: sendError } = await supabase.from('messages').insert({ conversation_id: Number(cid), sender_id: me, body: '[[im-audio:' + path + ']]', reply_to_id: replyTarget?.id ?? null });
          if (sendError) throw sendError;
          setReplyTarget(null);
          await load();
        } catch (e) {
          console.error('chat voice upload failed', e);
          setError('语音发送失败。请确认聊天媒体存储策略已启用，然后重试。');
        } finally {
          setUploading(false);
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
    } catch {
      setError('复制失败，请检查浏览器剪贴板权限。');
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
    return message.body;
  }

  function reactionGroups(messageId: number) {
    return QUICK_REACTIONS.map(reaction => ({
      reaction,
      items: reactions.filter(item => item.message_id === messageId && item.reaction === reaction),
    })).filter(group => group.items.length > 0);
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
    if (!showDetails && actionFor === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDetails(false);
        setActionFor(null);
        setTapbackAnchor(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showDetails, actionFor]);

  const latestOutgoingMessageId = [...msgs].reverse().find(message => message.sender_id === me)?.id ?? null;

  return (
    <div ref={pageRef} className="im-page" style={{
      '--im-wallpaper': backgroundPath && wallpaperUrl
        ? `linear-gradient(rgba(255,255,255,.38),rgba(255,255,255,.48)), url("${wallpaperUrl}") center / cover no-repeat`
        : ({
            default: 'radial-gradient(ellipse at 16% 8%,rgba(187,211,250,.24),transparent 38%),#ffffff',
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
        .im-out-col{display:flex;flex-direction:column;align-items:flex-end;min-width:0}
        .im-bubble-failed{background:linear-gradient(135deg,#fde8e9,#fbd9dc)!important;color:#7c2d38!important;border-color:rgba(214,90,105,.45)!important}
        .im-send-status{display:inline-flex;align-items:center;margin-left:5px;vertical-align:-2px;color:rgba(255,255,255,.78)}
        .im-send-status.sent{color:#8df0b3}
        .im-retry{display:inline-flex;align-items:center;gap:6px;margin-top:6px;border:0;background:transparent;color:#ff8f9b;font-size:11px;cursor:pointer;padding:2px 0}
        .im-retry-dot{width:18px;height:18px;border-radius:50%;background:#e5484d;color:#fff;display:grid;place-items:center;font-size:12px;line-height:1;flex:none}
        @media(min-width:700px){.im-page{height:var(--im-viewport-height,100dvh);min-height:0}.im-feed{padding:24px 28px}.im-composer{padding:14px 20px}}
        @media(max-width:600px){.im-head{gap:10px}.im-avatar{width:40px;height:40px}.im-back,.im-icon{min-width:40px;height:40px}.im-feed{padding:14px 12px 18px}.im-bubble{max-width:84%;font-size:15px}.im-composer{gap:8px}.im-plus{width:40px;height:40px}}\n        @media(prefers-reduced-motion:reduce){.im-row{animation:none}.im-row-out{animation:none}}
      `}</style>
      <header className="im-head">
        <button className="im-back" aria-label="返回会话列表" onClick={() => goBackOr(nav, '/friends')}>
          <span aria-hidden="true">‹</span>
          <span className="im-back-label">信息</span>
        </button>
        <button type="button" className="im-contact-stack" aria-label="查看会话资料" onClick={() => setShowDetails(true)}>
          <span className="im-avatar im-avatar-open">
            {peerAvatarUrl ? <img src={peerAvatarUrl} alt="" /> : (name.trim().charAt(0).toUpperCase() || '友')}
          </span>
          <span className="im-contact-name-pill">
            <span className="im-title">{name}</span>
            <span className="im-contact-chevron" aria-hidden="true">›</span>
          </span>
          <span className="im-sub">{otherTyping ? '正在输入…' : ' '}</span>
        </button>
        <button className="im-icon im-info-button" aria-label="聊天详情" onClick={() => setShowDetails(true)}>
          <span aria-hidden="true">ⓘ</span>
        </button>
      </header>
      {showDetails && <div className="im-profile-overlay" role="presentation" onClick={() => setShowDetails(false)}>
        <section className="im-profile-sheet" role="dialog" aria-modal="true" aria-label="会话资料"
          onClick={event => event.stopPropagation()}>
          <header className="im-profile-header">
            <button type="button" className="im-profile-close" onClick={() => setShowDetails(false)} aria-label="关闭会话资料">‹</button>
            <span>会话资料</span>
            <button type="button" className="im-profile-done" onClick={() => setShowDetails(false)}>完成</button>
          </header>
          <div className="im-profile-scroll">
            <div className="im-profile-hero">
              <div className="im-profile-avatar">
                {peerAvatarUrl ? <img src={peerAvatarUrl} alt="" /> : <span>{name.trim().charAt(0).toUpperCase() || '友'}</span>}
              </div>
              <div className="im-profile-name">{peer?.display_name ?? name}</div>
              <div className="im-profile-username">{peer?.username ? '@' + peer.username : '一对一私密会话'}</div>
              <span className="im-private-label">仅对话成员可见</span>
            </div>
            <div className="im-profile-stats">
              <div><strong>{msgs.length}</strong><span>条消息</span></div>
              <div><strong>{msgs.filter(m => !m.deleted_at && m.body.startsWith('[[im-image:')).length}</strong><span>张照片</span></div>
              <div><strong>{msgs.filter(m => !m.deleted_at && m.body.startsWith('[[im-audio:')).length}</strong><span>条语音</span></div>
            </div>
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
            <section className="im-profile-section">
              <div className="im-profile-section-heading">共享照片</div>
              {msgs.some(m => !m.deleted_at && m.body.startsWith('[[im-image:')) ? (
                <div className="im-shared-grid">
                  {msgs.filter(m => !m.deleted_at && m.body.startsWith('[[im-image:')).slice(-6).reverse().map(photo => (
                    <div className="im-shared-photo" key={photo.id}><MessageContent body={photo.body} /></div>
                  ))}
                </div>
              ) : <div className="im-profile-empty">你们发送的照片会显示在这里。</div>}
            </section>
            <div className="im-profile-footer">聊天背景只影响你自己的视图，不会更改对方的聊天界面。</div>
          </div>
        </section>
      </div>}
      <main className="im-feed">
        {msgs.length === 0 && outbox.length === 0 ? (
          <div className="im-empty"><div style={{fontWeight:750,color:'#f5fbff',fontSize:16}}>新的开始</div><p style={{fontSize:13,lineHeight:1.7}}>发出第一条消息，开启你们的对话吧。</p></div>
        ) : (<>{msgs.map((m, i) => {
          const parent = m.reply_to_id ? msgs.find(item => item.id === m.reply_to_id) : null;
          const groups = reactionGroups(m.id);
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
          return (
            <div key={m.id}>
              {dateLabel(m.created_at, msgs[i - 1]?.created_at) && <div className="im-day">{dateLabel(m.created_at, msgs[i - 1]?.created_at)}</div>}
              <div className={'im-row ' + (mine ? 'mine ' : '') + (samePrevious ? 'im-row-grouped-prev ' : '') + (sameNext ? 'im-row-grouped-next ' : '') + (swappedIdsRef.current.has(m.id) ? 'im-row-static' : '')}>
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
                    <MessageContent body={deleted ? (mine ? '你撤回了一条消息' : '对方撤回了一条消息') : m.body} />
                  )}
                  {m.edited_at && !deleted && <div className="im-edited-mark">已编辑</div>}
                  {groups.length > 0 && <div className="im-reaction-groups">
                    {groups.map(group => {
                      const mineReacted = group.items.some(item => item.profile_id === me);
                      return <button key={group.reaction} type="button" className={'im-reaction-chip' + (mineReacted ? ' mine' : '')} onClick={() => toggleReaction(m.id, group.reaction)}>{group.reaction} {group.items.length}</button>;
                    })}
                  </div>}
                </div>
                {mine && m.id === latestOutgoingMessageId && userPreferences.chat.showReadReceipts && (
                  <div className="im-delivery-receipt" aria-live="polite">
                    {otherLastReadMessageId !== null && otherLastReadMessageId >= m.id ? '已读' : '已送达'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {outbox.map(e => (
          <div key={e.tempKey}>
            <div className="im-row mine im-row-out">
              <div className="im-out-col">
                <div className={'im-bubble mine' + (e.phase === 'failed' ? ' im-bubble-failed' : '')}>
                  {e.replyToId !== null && <div className="im-reply-quote">回复：{e.replySummary ?? ''}</div>}
                  <MessageContent body={e.body} />
                  <div className="im-outbox-status">
                    <span className={'im-send-status' + (e.phase === 'sent' ? ' sent' : '')} role="img" aria-label={e.phase === 'sending' ? '发送中' : e.phase === 'failed' ? '发送失败' : '已发送'}>
                      {e.phase === 'sending' ? <ClockIcon /> : e.phase === 'sent' ? <SentIcon /> : null}
                    </span>
                    {e.phase === 'sending' ? '发送中' : e.phase === 'failed' ? '发送失败' : '已送达'}
                  </div>
                </div>
                {e.phase === 'failed' && <button type="button" className="im-retry" onClick={() => retryEntry(e.tempKey)}><span className="im-retry-dot">↻</span>点击重试</button>}
              </div>
            </div>
          </div>
        ))}
        </>)}
        {otherTyping && <div className="im-typing" role="status" aria-live="polite">
          <span className="im-typing-dots"><i /><i /><i /></span>
          <span>{name} 正在输入</span>
        </div>}
        <div ref={bottomRef} />
      </main>
      {actionFor !== null && (() => {
        const message = msgs.find(item => item.id === actionFor);
        if (!message) return null;
        const mine = message.sender_id === me;
        const deleted = Boolean(message.deleted_at);
        const canEdit = mine && !deleted && !message.body.startsWith('[[im-image:') && !message.body.startsWith('[[im-audio:');
        return <div className="im-context-overlay" role="presentation" onClick={() => { setActionFor(null); setTapbackAnchor(null); }}>
          {tapbackAnchor && <div className={'im-tapback-preview ' + (mine ? 'mine' : 'theirs')}
            style={{ left: tapbackAnchor.left, top: tapbackAnchor.top, width: tapbackAnchor.width }}
            aria-hidden="true">
            {message.reply_to_id && <div className="im-reply-quote">回复：{messageSummary(msgs.find(item => item.id === message.reply_to_id))}</div>}
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
      {showStickers && <div className="im-sticker-tray" role="group" aria-label="附件与贴纸">
        <button type="button" className="im-attach-choice" onClick={() => imageRef.current?.click()}>
          <span aria-hidden="true">▧</span><span>照片</span>
        </button>
        {['🥹','😂','❤️','😍','🐱','🐻','✨','🎉','👍','😭','🫶','🌸','💖','😎'].map(sticker => <button key={sticker} type="button" className="im-sticker-choice" aria-label={'发送贴纸 ' + sticker} onClick={() => sendSticker(sticker)}>{sticker}</button>)}
      </div>}
      {replyTarget && <div className="im-reply-banner">
        <span>回复</span>
        <span className="im-reply-banner-main">{messageSummary(replyTarget)}</span>
        <button type="button" onClick={() => setReplyTarget(null)} aria-label="取消回复">取消</button>
      </div>}
      <form className="im-composer" onSubmit={e => { e.preventDefault(); send(); }}>
        <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic" hidden onChange={e => sendImage(e.target.files?.[0])} />
        <button type="button" className="im-plus" aria-label="打开附件菜单" title="打开附件菜单" disabled={uploading || recording} onClick={() => setShowStickers(v => !v)}>{showStickers ? '×' : '＋'}</button>
        <div className="im-input-wrap">
          <input ref={inputRef} className="im-input" value={text} onChange={e => { setText(e.target.value); notifyTyping(e.target.value); }}
            placeholder={recording ? '录音中 ' + String(Math.floor(recordSeconds / 60)).padStart(2, '0') + ':' + String(recordSeconds % 60).padStart(2, '0') + ' · 点红色按钮结束' : uploading ? '正在发送媒体…' : 'iMessage'} maxLength={2000} autoComplete="off" aria-label="输入消息" />
          {!text.trim() && <button type="button" className={'im-mic' + (recording ? ' recording' : '')} aria-label={recording ? '结束录音并发送' : '录制语音'} title={recording ? '结束录音并发送' : '录制语音'} disabled={uploading} onClick={recording ? stopRecording : startRecording}>{recording ? '■' : '●'}</button>}
          {text.trim() && <button type="submit" className="im-send" aria-label="发送消息" disabled={uploading || recording}>↑</button>}
        </div>
      </form>
    </div>
  );
}
