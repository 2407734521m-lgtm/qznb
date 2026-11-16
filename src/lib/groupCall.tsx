import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from './supabase';
import { useAuth } from '../auth';
import { useCall } from './call';
import { useIslandActions } from './island';
import { CallElapsedTime } from '../components/QianzhiCallIslandActivity';
import { createGroupCallIslandActivity } from '../components/QianzhiGroupCallIslandActivity';
import '../styles-group-call.css';

type GroupCallPhase = 'idle' | 'connecting' | 'connected' | 'reconnecting';

type LiveKitParticipant = {
  identity: string;
  name?: string;
  isMicrophoneEnabled?: boolean;
  isSpeaking?: boolean;
};

type LiveKitTrack = {
  kind: string;
  sid?: string;
  attach: () => HTMLMediaElement;
  detach: () => HTMLMediaElement[];
};

type LiveKitRoom = {
  localParticipant: LiveKitParticipant & {
    setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>;
  };
  remoteParticipants: Map<string, LiveKitParticipant>;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void> | void;
  on: (event: string, callback: (...args: unknown[]) => void) => LiveKitRoom;
};

type LiveKitSdk = {
  Room: new (options?: Record<string, unknown>) => LiveKitRoom;
  RoomEvent: {
    TrackSubscribed: string;
    TrackUnsubscribed: string;
    ParticipantConnected: string;
    ParticipantDisconnected: string;
    ActiveSpeakersChanged: string;
    Reconnecting: string;
    Reconnected: string;
    Disconnected: string;
  };
  Track: { Kind: { Audio: string } };
};

declare global {
  interface Window {
    LivekitClient?: LiveKitSdk;
  }
}

type GroupCallParticipant = {
  id: string;
  name: string;
  isLocal: boolean;
  muted: boolean;
  speaking: boolean;
};

type GroupCallContextValue = {
  busy: boolean;
  activeConversationId: number | null;
  currentConversationId: number | null;
  activeParticipantCount: number;
  joinGroupCall: (conversationId: number, groupName: string) => Promise<void>;
  watchConversation: (conversationId: number | null) => void;
};

const GroupCallContext = createContext<GroupCallContextValue>({
  busy: false,
  activeConversationId: null,
  currentConversationId: null,
  activeParticipantCount: 0,
  joinGroupCall: async () => {},
  watchConversation: () => {},
});

export function useGroupCall() {
  return useContext(GroupCallContext);
}

let liveKitSdkPromise: Promise<LiveKitSdk> | null = null;

function loadLiveKitSdk(): Promise<LiveKitSdk> {
  if (typeof window !== 'undefined' && window.LivekitClient) {
    return Promise.resolve(window.LivekitClient);
  }
  if (liveKitSdkPromise) return liveKitSdkPromise;

  liveKitSdkPromise = new Promise<LiveKitSdk>((resolve, reject) => {
    const sources = [
      'https://cdn.jsdelivr.net/npm/livekit-client@2.24.1/dist/livekit-client.umd.min.js',
      'https://unpkg.com/livekit-client@2.24.1/dist/livekit-client.umd.min.js',
    ];
    let index = 0;

    const tryNext = () => {
      if (window.LivekitClient) {
        resolve(window.LivekitClient);
        return;
      }
      if (index >= sources.length) {
        reject(new Error('群语音组件加载失败，请检查网络后重试'));
        return;
      }
      const script = document.createElement('script');
      script.src = sources[index++];
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (window.LivekitClient) resolve(window.LivekitClient);
        else tryNext();
      };
      script.onerror = tryNext;
      document.head.appendChild(script);
    };

    tryNext();
  }).catch(error => {
    liveKitSdkPromise = null;
    throw error;
  });

  return liveKitSdkPromise;
}

function participantName(participant: LiveKitParticipant, localId: string) {
  if (participant.identity === localId) return '我';
  return participant.name?.trim() || '群成员';
}

function shortInitial(name: string) {
  return name.trim().slice(0, 1) || '群';
}

export function GroupCallProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const oneToOneCall = useCall();
  const islandApi = useIslandActions();
  const reduceMotion = Boolean(useReducedMotion());
  const myId = session?.user?.id ?? null;

  const [phase, setPhase] = useState<GroupCallPhase>('idle');
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState('群聊');
  const [participants, setParticipants] = useState<GroupCallParticipant[]>([]);
  const [muted, setMuted] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [watchedConversationId, setWatchedConversationId] = useState<number | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeParticipantCount, setActiveParticipantCount] = useState(0);

  const roomRef = useRef<LiveKitRoom | null>(null);
  const attachedTracksRef = useRef<Map<string, LiveKitTrack>>(new Map());
  const audioHostRef = useRef<HTMLDivElement>(null);
  const speakersRef = useRef<Set<string>>(new Set());
  const conversationIdRef = useRef<number | null>(null);
  const phaseRef = useRef<GroupCallPhase>('idle');
  const mutedRef = useRef(false);

  const setPhaseSafe = useCallback((next: GroupCallPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const refreshParticipants = useCallback((room: LiveKitRoom) => {
    if (roomRef.current !== room || !myId) return;
    const local = room.localParticipant;
    const remote = Array.from(room.remoteParticipants.values());
    const all = [local, ...remote];
    setParticipants(all.map(participant => ({
      id: participant.identity,
      name: participantName(participant, myId),
      isLocal: participant.identity === myId,
      muted: participant.isMicrophoneEnabled === false,
      speaking: speakersRef.current.has(participant.identity) || Boolean(participant.isSpeaking),
    })));
    setActiveParticipantCount(all.length);
    setActiveConversationId(conversationIdRef.current);
  }, [myId]);

  const releaseRoom = useCallback((targetRoom?: LiveKitRoom, disconnect = true) => {
    const room = roomRef.current;
    if (targetRoom && room !== targetRoom) return;
    roomRef.current = null;
    if (disconnect && room) {
      try { void room.disconnect(); } catch { /* LiveKit may already be disconnected */ }
    }
    for (const track of attachedTracksRef.current.values()) {
      try {
        for (const element of track.detach()) element.remove();
      } catch { /* Track may have been detached during transport shutdown */ }
    }
    attachedTracksRef.current.clear();
    if (audioHostRef.current) audioHostRef.current.replaceChildren();
    speakersRef.current.clear();
    conversationIdRef.current = null;
    setConversationId(null);
    setGroupName('群聊');
    setParticipants([]);
    setMuted(false);
    mutedRef.current = false;
    setMinimized(false);
    setStartedAt(null);
    setActiveConversationId(null);
    setActiveParticipantCount(0);
    setPhaseSafe('idle');
  }, [setPhaseSafe]);

  const watchConversation = useCallback((nextId: number | null) => {
    setWatchedConversationId(Number.isSafeInteger(nextId) && Number(nextId) > 0 ? Number(nextId) : null);
  }, []);

  useEffect(() => {
    if (!myId || watchedConversationId === null) {
      setActiveConversationId(null);
      setActiveParticipantCount(0);
      return;
    }
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data, error } = await supabase.functions.invoke('group-call-token', {
          body: { conversation_id: watchedConversationId, action: 'status' },
        });
        if (!alive) return;
        if (error || data?.ok !== true) {
          setActiveConversationId(null);
          setActiveParticipantCount(0);
          return;
        }
        if (data.active === true) {
          setActiveConversationId(watchedConversationId);
          setActiveParticipantCount(Math.max(0, Number(data.participant_count) || 0));
        } else {
          setActiveConversationId(null);
          setActiveParticipantCount(0);
        }
      } catch {
        if (alive) {
          setActiveConversationId(null);
          setActiveParticipantCount(0);
        }
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 10000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [myId, watchedConversationId]);

  const joinGroupCall = useCallback(async (nextConversationId: number, nextGroupName: string) => {
    if (!myId) {
      toast.error('请先登录后再加入群语音');
      return;
    }
    if (!Number.isSafeInteger(nextConversationId) || nextConversationId <= 0) {
      toast.error('群聊信息无效，无法发起语音');
      return;
    }
    if (oneToOneCall.busy) {
      toast.error('请先结束当前的一对一通话');
      return;
    }
    if (phaseRef.current !== 'idle') {
      if (conversationIdRef.current === nextConversationId) setMinimized(false);
      else toast.error('当前已有一场群语音，请先结束后再加入其他群');
      return;
    }

    conversationIdRef.current = nextConversationId;
    setConversationId(nextConversationId);
    setGroupName(nextGroupName || '群聊');
    setMinimized(false);
    setMuted(false);
    mutedRef.current = false;
    setStartedAt(null);
    setParticipants([]);
    setPhaseSafe('connecting');

    let room: LiveKitRoom | null = null;
    try {
      const { data, error } = await supabase.functions.invoke('group-call-token', {
        body: { conversation_id: nextConversationId, action: 'token' },
      });
      if (error) {
        const context = (error as { context?: unknown }).context;
        const body = context instanceof Response ? await context.clone().json().catch(() => null) : null;
        if (body?.code === 'voice_not_configured') {
          throw new Error('群语音服务还未配置 LiveKit，请完成服务密钥配置后再试');
        }
        if (body?.code === 'group_access_denied') {
          throw new Error('你已不在该群聊中，无法加入语音');
        }
        throw error;
      }
      if (data?.ok !== true || typeof data.url !== 'string' || typeof data.token !== 'string') {
        const code = typeof data?.code === 'string' ? data.code : '';
        if (code === 'voice_not_configured') {
          throw new Error('群语音服务还未配置 LiveKit，请完成服务密钥配置后再试');
        }
        if (code === 'group_access_denied') throw new Error('你已不在该群聊中，无法加入语音');
        throw new Error('暂时无法加入群语音，请稍后重试');
      }

      const sdk = await loadLiveKitSdk();
      room = new sdk.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(sdk.RoomEvent.TrackSubscribed, (...args) => {
        const [rawTrack] = args;
        const track = rawTrack as LiveKitTrack | undefined;
        if (!track || track.kind !== sdk.Track.Kind.Audio || !audioHostRef.current) return;
        const element = track.attach();
        element.autoplay = true;
        element.setAttribute('playsinline', '');
        element.style.display = 'none';
        audioHostRef.current.appendChild(element);
        if (track.sid) attachedTracksRef.current.set(track.sid, track);
        void element.play().catch(() => {
          toast.error('浏览器阻止了语音播放，请点击页面后重试');
        });
      });

      room.on(sdk.RoomEvent.TrackUnsubscribed, (...args) => {
        const [rawTrack] = args;
        const track = rawTrack as LiveKitTrack | undefined;
        if (!track) return;
        try { for (const element of track.detach()) element.remove(); } catch { /* Already detached */ }
        if (track.sid) attachedTracksRef.current.delete(track.sid);
      });

      room.on(sdk.RoomEvent.ParticipantConnected, () => refreshParticipants(room!));
      room.on(sdk.RoomEvent.ParticipantDisconnected, () => refreshParticipants(room!));
      room.on(sdk.RoomEvent.ActiveSpeakersChanged, (...args) => {
        const speakers = Array.isArray(args[0]) ? args[0] as LiveKitParticipant[] : [];
        speakersRef.current = new Set(speakers.map(person => person.identity));
        refreshParticipants(room!);
      });
      room.on(sdk.RoomEvent.Reconnecting, () => {
        if (roomRef.current === room) setPhaseSafe('reconnecting');
      });
      room.on(sdk.RoomEvent.Reconnected, () => {
        if (roomRef.current === room) {
          setPhaseSafe('connected');
          refreshParticipants(room!);
        }
      });
      room.on(sdk.RoomEvent.Disconnected, () => {
        const disconnectedRoom = roomRef.current;
        if (!disconnectedRoom || disconnectedRoom !== room) return;
        releaseRoom(disconnectedRoom, false);
        toast.info('群语音连接已结束');
      });

      await room.connect(data.url, data.token);
      if (roomRef.current !== room) return;
      await room.localParticipant.setMicrophoneEnabled(true);
      if (roomRef.current !== room) return;
      const now = Date.now();
      setStartedAt(now);
      setPhaseSafe('connected');
      refreshParticipants(room);
      setActiveConversationId(nextConversationId);
      setActiveParticipantCount(Math.max(1, room.remoteParticipants.size + 1));
    } catch (error) {
      if (room && roomRef.current === room) releaseRoom(room, true);
      else if (!room) releaseRoom(undefined, false);
      const message = error instanceof Error ? error.message : '群语音连接失败，请检查麦克风权限和网络';
      toast.error(message);
    }
  }, [myId, oneToOneCall.busy, refreshParticipants, releaseRoom, setPhaseSafe]);


  // Re-check group membership during long calls. Removing someone from the group
  // must also disconnect that client from the private audio room shortly after.
  useEffect(() => {
    if (phase === 'idle' || conversationId === null) return;
    let alive = true;
    const verifyMembership = async () => {
      try {
        const { data, error } = await supabase.rpc('get_group_conversation_details', {
          p_conversation_id: conversationId,
        });
        if (!alive || error) return;
        if (!Array.isArray(data) || data.length === 0) {
          releaseRoom(undefined, true);
          toast.error('你已不在该群聊中，群语音已断开');
        }
      } catch {
        // A temporary network error must not end a healthy call.
      }
    };
    void verifyMembership();
    const timer = window.setInterval(() => { void verifyMembership(); }, 15000);
    document.addEventListener('visibilitychange', verifyMembership);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', verifyMembership);
    };
  }, [conversationId, phase, releaseRoom]);

  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room || phaseRef.current === 'idle') return;
    const nextMuted = !mutedRef.current;
    try {
      await room.localParticipant.setMicrophoneEnabled(!nextMuted);
      if (roomRef.current !== room) return;
      mutedRef.current = nextMuted;
      setMuted(nextMuted);
      refreshParticipants(room);
    } catch {
      toast.error(nextMuted ? '麦克风静音失败' : '无法开启麦克风，请检查权限');
    }
  }, [refreshParticipants]);

  const hangUp = useCallback(() => {
    if (phaseRef.current === 'idle') return;
    releaseRoom(undefined, true);
    toast.info('已退出群语音');
  }, [releaseRoom]);

  const restore = useCallback(() => setMinimized(false), []);
  const minimize = useCallback(() => setMinimized(true), []);

  useEffect(() => () => {
    releaseRoom(undefined, true);
    islandApi.end('qz-group-call-session');
  }, [islandApi, releaseRoom]);

  useEffect(() => {
    if (!myId && phaseRef.current !== 'idle') releaseRoom(undefined, true);
  }, [myId, releaseRoom]);

  useEffect(() => {
    if (phase === 'idle') {
      islandApi.end('qz-group-call-session');
      return;
    }
    islandApi.start(createGroupCallIslandActivity({
      groupName,
      participantCount: participants.length || (phase === 'connecting' ? 1 : 0),
      startedAt,
      muted,
      onRestore: restore,
      onToggleMute: () => { void toggleMute(); },
      onHangUp: hangUp,
    }));
  }, [phase, groupName, participants.length, startedAt, muted, islandApi, restore, toggleMute, hangUp]);

  const contextValue = useMemo(() => ({
    busy: phase !== 'idle',
    activeConversationId,
    currentConversationId: conversationId,
    activeParticipantCount,
    joinGroupCall,
    watchConversation,
  }), [phase, activeConversationId, conversationId, activeParticipantCount, joinGroupCall, watchConversation]);

  const hasActiveSpeaker = participants.some(person => person.speaking && !person.muted);

  const statusLabel = phase === 'connecting'
    ? '正在连接语音房间…'
    : phase === 'reconnecting'
      ? '网络波动，正在重新连接…'
      : '群语音进行中';

  return (
    <GroupCallContext.Provider value={contextValue}>
      {children}
      <div ref={audioHostRef} className="qz-group-audio-host" aria-hidden="true" />
      <AnimatePresence>
        {phase !== 'idle' && !minimized && (
          <motion.div
            className="qz-group-call-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={groupName + '群语音'}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.section
              className="qz-group-call-screen"
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
              transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
            >
              <header className="qz-group-call-header">
                <div>
                  <span className="qz-group-call-eyebrow">GROUP VOICE</span>
                  <h1>{groupName}</h1>
                  <p>{statusLabel}{startedAt !== null ? <> · <CallElapsedTime startedAt={startedAt} /></> : ''}</p>
                </div>
                <button type="button" className="qz-group-call-minimize" onClick={minimize} aria-label="最小化到灵动岛" title="最小化到灵动岛">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
                </button>
              </header>

              <main className="qz-group-call-main">
                <div className={"qz-group-call-wave" + (hasActiveSpeaker ? " is-active" : "")} aria-hidden="true"><i /><i /><i /><i /><i /></div>
                <div className="qz-group-call-summary">
                  <strong>{participants.length || 1}</strong>
                  <span>位成员在语音中</span>
                </div>
                <div className="qz-group-call-participants" aria-live="polite">
                  {participants.map(person => (
                    <div className={'qz-group-call-person' + (person.speaking && !person.muted ? ' is-speaking' : '')} key={person.id}>
                      <span className="qz-group-call-avatar">{shortInitial(person.name)}</span>
                      <span className="qz-group-call-person-name">{person.name}</span>
                      <small>{person.muted ? '已静音' : person.speaking && !person.muted ? '正在说话' : '已加入'}</small>
                    </div>
                  ))}
                  {!participants.length && (
                    <div className="qz-group-call-waiting"><span className="qz-group-call-spinner" />正在等待语音成员…</div>
                  )}
                </div>
              </main>

              <footer className="qz-group-call-controls">
                <button type="button" className={'qz-group-call-control' + (muted ? ' is-active' : '')} onClick={() => { void toggleMute(); }} disabled={phase === 'connecting'} aria-pressed={muted}>
                  <span className="qz-group-call-control-icon">
                    {muted
                      ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9V6a3 3 0 0 0-5.1-2.1M5 11v1a7 7 0 0 0 11.5 5.4M12 19v3M8 22h8M3 3l18 18" /></svg>
                      : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" /></svg>}
                  </span>
                  <span>{muted ? '取消静音' : '静音'}</span>
                </button>
                <button type="button" className="qz-group-call-control qz-group-call-hangup" onClick={hangUp}>
                  <span className="qz-group-call-control-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 14.2c4.8-4.1 10.2-4.1 15 0l-2.1 3.2a1.2 1.2 0 0 1-1.5.4l-2.1-1a1.2 1.2 0 0 1-.7-1.1v-1.1a9.8 9.8 0 0 0-2.2 0v1.1a1.2 1.2 0 0 1-.7 1.1l-2.1 1a1.2 1.2 0 0 1-1.5-.4L4.5 14.2Z" /></svg>
                  </span>
                  <span>退出语音</span>
                </button>
              </footer>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </GroupCallContext.Provider>
  );
}
