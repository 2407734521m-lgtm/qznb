import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useAuth } from '../auth';
import '../styles-call.css';

export type CallPeerInfo = { id: string; name: string };
type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'in-call';

type CallContextValue = {
  phase: CallPhase;
  busy: boolean;
  startCall: (peer: CallPeerInfo, conversationId: number) => void;
};

const CallContext = createContext<CallContextValue>({ phase: 'idle', busy: false, startCall: () => {} });
export function useCall() { return useContext(CallContext); }

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;

  const [phase, setPhase] = useState<CallPhase>('idle');
  const [peerName, setPeerName] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [note, setNote] = useState('');

  const phaseRef = useRef<CallPhase>('idle');
  const myNameRef = useRef('同学');
  const callIdRef = useRef<string | null>(null);
  const convIdRef = useRef<number | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const isCallerRef = useRef(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sessionChRef = useRef<RealtimeChannel | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const ringTimerRef = useRef<number | null>(null);
  const waitTimerRef = useRef<number | null>(null);
  const secondsTimerRef = useRef<number | null>(null);
  const noteTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const connectedRef = useRef(false);
  const secondsRef = useRef(0);

  const setPhaseBoth = useCallback((p: CallPhase) => { phaseRef.current = p; setPhase(p); }, []);

  const showNote = useCallback((text: string) => {
    setNote(text);
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => setNote(''), 4800);
  }, []);

  const stopRing = useCallback(() => {
    if (ringTimerRef.current) { window.clearInterval(ringTimerRef.current); ringTimerRef.current = null; }
    if (waitTimerRef.current) { window.clearTimeout(waitTimerRef.current); waitTimerRef.current = null; }
    if (secondsTimerRef.current) { window.clearInterval(secondsTimerRef.current); secondsTimerRef.current = null; }
  }, []);

  const cleanup = useCallback(() => {
    stopRing();
    if (pcRef.current) { try { pcRef.current.close(); } catch { /* 已关闭 */ } pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (sessionChRef.current) { void supabase.removeChannel(sessionChRef.current); sessionChRef.current = null; }
    callIdRef.current = null;
    convIdRef.current = null;
    peerIdRef.current = null;
    isCallerRef.current = false;
    iceQueueRef.current = [];
    connectedRef.current = false;
    secondsRef.current = 0;
    setSeconds(0);
    setMuted(false);
    setPeerName('');
    setPhaseBoth('idle');
  }, [stopRing, setPhaseBoth]);

  // Wait briefly for the realtime server to accept terminal call events before
  // removing the channel. Previously cleanup() could remove the channel while
  // the fire-and-forget broadcast was still in flight, leaving the other side
  // stuck in a ringing/connecting UI.
  const sendSession = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const channel = sessionChRef.current;
    if (!channel) return false;
    try {
      const result = await Promise.race([
        channel.send({ type: 'broadcast', event, payload }),
        new Promise<'timed out'>(resolve => window.setTimeout(() => resolve('timed out'), 1800)),
      ]);
      return result === 'ok';
    } catch {
      return false;
    }
  }, []);

  const recordCallMessage = useCallback(async () => {
    if (!isCallerRef.current || !connectedRef.current || !convIdRef.current || !myId) return;
    if (secondsRef.current < 3) return;
    await supabase.from('messages').insert({
      conversation_id: convIdRef.current,
      sender_id: myId,
      body: '语音通话 ' + formatDuration(secondsRef.current),
    });
  }, [myId]);

  const endCall = useCallback(async (notifyEvent: string | null, noteText?: string) => {
    // Broadcast first; only tear down the session after the peer has had a
    // chance to receive the end/reject/cancel event. The timeout keeps the
    // local hang-up responsive if the network is unavailable.
    if (notifyEvent) await sendSession(notifyEvent, { fromId: myId });
    void recordCallMessage();
    cleanup();
    if (noteText) showNote(noteText);
  }, [cleanup, myId, recordCallMessage, sendSession, showNote]);

  const beep = useCallback((freq: number, dur = 0.14) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.06;
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.stop(ctx.currentTime + dur);
    } catch { /* 无音频上下文时静默 */ }
  }, []);

  const startRing = useCallback((incoming: boolean) => {
    if (ringTimerRef.current) window.clearInterval(ringTimerRef.current);
    const tick = () => {
      beep(incoming ? 920 : 720, incoming ? 0.16 : 0.12);
      if (incoming) { try { navigator.vibrate?.(180); } catch { /* 不支持振动 */ } }
    };
    tick();
    ringTimerRef.current = window.setInterval(tick, 1700);
  }, [beep]);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queued = iceQueueRef.current.splice(0);
    for (const c of queued) { try { await pc.addIceCandidate(c); } catch { /* 忽略失效候选 */ } }
  }, []);

  const setupPeerConnection = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;
    stream.getAudioTracks().forEach(t => pc.addTrack(t, stream));
    pc.ontrack = event => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0] ?? null;
    };
    pc.onicecandidate = event => {
      if (event.candidate) sendSession('ice', { candidate: event.candidate.toJSON(), fromId: myId });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        connectedRef.current = true;
        setPhaseBoth('in-call');
        if (secondsTimerRef.current) window.clearInterval(secondsTimerRef.current);
        secondsTimerRef.current = window.setInterval(() => {
          secondsRef.current += 1;
          setSeconds(secondsRef.current);
        }, 1000);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        if (phaseRef.current === 'in-call' || phaseRef.current === 'connecting') {
          void recordCallMessage();
          cleanup();
          showNote('通话已断开');
        }
      }
    };
    return pc;
  }, [cleanup, myId, recordCallMessage, sendSession, setPhaseBoth, showNote]);

  const joinSession = useCallback((callId: string) => {
    const ch = supabase.channel('call-session-' + callId, { config: { broadcast: { self: false } } });
    sessionChRef.current = ch;
    ch.on('broadcast', { event: 'accept' }, () => {
      if (!isCallerRef.current || phaseRef.current !== 'outgoing') return;
      stopRing();
      setPhaseBoth('connecting');
      void (async () => {
        try {
          const pc = await setupPeerConnection();
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSession('offer', { sdp: offer.sdp, fromId: myId });
        } catch {
          void endCall('end', '需要麦克风权限才能通话');
        }
      })();
    });
    ch.on('broadcast', { event: 'offer' }, ({ payload }) => {
      if (isCallerRef.current) return;
      void (async () => {
        try {
          const pc = pcRef.current ?? (await setupPeerConnection());
          await pc.setRemoteDescription({ type: 'offer', sdp: String(payload?.sdp ?? '') });
          await flushIce();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSession('answer', { sdp: answer.sdp, fromId: myId });
        } catch { /* 连接建立失败由状态变化兜底 */ }
      })();
    });
    ch.on('broadcast', { event: 'answer' }, ({ payload }) => {
      void (async () => {
        const pc = pcRef.current;
        if (!pc) return;
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: String(payload?.sdp ?? '') });
          await flushIce();
        } catch { /* 同上 */ }
      })();
    });
    ch.on('broadcast', { event: 'ice' }, ({ payload }) => {
      const candidate = payload?.candidate as RTCIceCandidateInit | undefined;
      if (!candidate) return;
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) { void pc.addIceCandidate(candidate).catch(() => {}); }
      else iceQueueRef.current.push(candidate);
    });
    ch.on('broadcast', { event: 'reject' }, () => {
      if (phaseRef.current === 'outgoing' || phaseRef.current === 'connecting') {
        cleanup();
        showNote('对方拒绝了通话');
      }
    });
    ch.on('broadcast', { event: 'cancel' }, () => {
      if (phaseRef.current === 'incoming') { cleanup(); showNote('对方已取消通话'); }
    });
    ch.on('broadcast', { event: 'end' }, () => {
      if (phaseRef.current !== 'idle') {
        void recordCallMessage();
        cleanup();
        showNote('对方已结束通话');
      }
    });
    return new Promise<void>(resolve => { ch.subscribe(status => { if (status === 'SUBSCRIBED') resolve(); }); });
  }, [cleanup, endCall, flushIce, myId, recordCallMessage, setupPeerConnection, setPhaseBoth, showNote, stopRing]);

  // 我的显示名（来电邀请里带给对方）
  useEffect(() => {
    if (!myId) return;
    let alive = true;
    supabase.from('profiles').select('display_name, username').eq('id', myId).maybeSingle()
      .then(({ data }) => {
        if (alive && data) myNameRef.current = data.display_name || data.username || '同学';
      });
    return () => { alive = false; };
  }, [myId]);

  // 来电收件箱
  useEffect(() => {
    if (!myId) return;
    const ch = supabase.channel('call-inbox-' + myId, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'invite' }, ({ payload }) => {
      const callId = String(payload?.callId ?? '');
      if (!callId) return;
      if (phaseRef.current !== 'idle') {
        // 忙线：短暂加入会话回一个拒绝
        const busy = supabase.channel('call-session-' + callId, { config: { broadcast: { self: false } } });
        busy.subscribe(status => {
          if (status === 'SUBSCRIBED') {
            void busy.send({ type: 'broadcast', event: 'reject', payload: { fromId: myId, busy: true } })
              .then(() => { void supabase.removeChannel(busy); });
          }
        });
        return;
      }
      callIdRef.current = callId;
      peerIdRef.current = String(payload?.fromId ?? '');
      convIdRef.current = typeof payload?.conversationId === 'number' ? payload.conversationId : null;
      isCallerRef.current = false;
      setPeerName(String(payload?.fromName ?? '同学'));
      setPhaseBoth('incoming');
      startRing(true);
      void joinSession(callId);
    });
    ch.subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [joinSession, myId, setPhaseBoth, startRing]);

  const startCall = useCallback((peer: CallPeerInfo, conversationId: number) => {
    if (!myId || phaseRef.current !== 'idle') return;
    const callId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    callIdRef.current = callId;
    peerIdRef.current = peer.id;
    convIdRef.current = conversationId;
    isCallerRef.current = true;
    setPeerName(peer.name);
    setPhaseBoth('outgoing');
    startRing(false);
    void (async () => {
      await joinSession(callId);
      const inbox = supabase.channel('call-inbox-' + peer.id, { config: { broadcast: { self: false } } });
      await new Promise<void>(resolve => { inbox.subscribe(status => { if (status === 'SUBSCRIBED') resolve(); }); });
      await inbox.send({ type: 'broadcast', event: 'invite', payload: { callId, fromId: myId, fromName: myNameRef.current, conversationId } });
      void supabase.removeChannel(inbox);
    })();
    if (waitTimerRef.current) window.clearTimeout(waitTimerRef.current);
    waitTimerRef.current = window.setTimeout(() => {
      if (phaseRef.current === 'outgoing') void endCall('cancel', '对方暂时没有接听');
    }, 45000);
  }, [endCall, joinSession, myId, setPhaseBoth, startRing]);

  const acceptCall = useCallback(() => {
    if (phaseRef.current !== 'incoming') return;
    stopRing();
    setPhaseBoth('connecting');
    sendSession('accept', { fromId: myId });
    void setupPeerConnection().catch(() => { endCall('end', '需要麦克风权限才能通话'); });
  }, [endCall, myId, sendSession, setPhaseBoth, setupPeerConnection, stopRing]);

  const rejectCall = useCallback(() => { void endCall('reject', '已拒绝通话'); }, [endCall]);
  const cancelCall = useCallback(() => { void endCall('cancel', '已取消通话'); }, [endCall]);
  const hangUp = useCallback(() => { void endCall('end', '已结束通话'); }, [endCall]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach(t => { t.enabled = !next; });
    setMuted(next);
  }, [muted]);

  const initial = (peerName.trim().charAt(0) || '友').toUpperCase();

  return (
    <CallContext.Provider value={{ phase, busy: phase !== 'idle', startCall }}>
      {children}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
      {note && phase === 'idle' && <div className="call-note" role="status" aria-live="polite"><span aria-hidden="true">☎</span><span>{note}</span></div>}
      {phase !== 'idle' && (
        <div className="call-overlay" role="dialog" aria-modal="true" aria-label="语音通话">
          <div className="call-card">
            <div className="call-avatar" aria-hidden="true">{initial}</div>
            <div className="call-name">{peerName || '同学'}</div>
            <div className="call-status">
              {phase === 'incoming' && '邀请你语音通话'}
              {phase === 'outgoing' && '正在等待对方接听…'}
              {phase === 'connecting' && '连接中…'}
              {phase === 'in-call' && <span className="call-timer">{formatDuration(seconds)}</span>}
            </div>
            {phase === 'incoming' && (
              <div className="call-actions">
                <button type="button" className="call-btn call-btn-reject" onClick={rejectCall}>拒绝</button>
                <button type="button" className="call-btn call-btn-accept" onClick={acceptCall}>接听</button>
              </div>
            )}
            {phase === 'outgoing' && (
              <div className="call-actions">
                <button type="button" className="call-btn call-btn-hangup" onClick={cancelCall}>取消</button>
              </div>
            )}
            {(phase === 'connecting' || phase === 'in-call') && (
              <div className="call-actions">
                <button type="button" className={'call-btn call-btn-mute' + (muted ? ' is-muted' : '')} onClick={toggleMute}>{muted ? '取消静音' : '静音'}</button>
                <button type="button" className="call-btn call-btn-hangup" onClick={hangUp}>挂断</button>
              </div>
            )}
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}
