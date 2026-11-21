import { haptic } from '../lib/haptics';
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Island, useIslandActions, useIslandActivity, useIslandPresentation, useIslandReducedMotion } from '../lib/island';
import QianzhiIslandTaskDrawer from './QianzhiIslandTaskDrawer';

type MusicCommand = 'toggle' | 'previous' | 'next' | 'seek' | 'volume' | 'mute';

interface MusicTrack {
  title: string;
  artist: string;
  coverUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  canPrevious: boolean;
  canNext: boolean;
  canToggle: boolean;
  /** Player volume 0–1, or null when the connected music station does not report it. */
  volume: number | null;
  isMuted: boolean;
}

interface MusicIslandState {
  track: MusicTrack | null;
  connected: boolean;
  sendCommand: (command: MusicCommand, value?: number) => void;
  openMusic: () => void;
  /** Opens the fullscreen player overlay (from the expanded island). */
  openFullscreenPlayer: () => void;
  seekDraft: number | null;
  setSeekDraft: (value: number) => void;
  commitSeekDraft: () => void;
  cancelSeekDraft: () => void;
  collapse: () => void;
  isExpanded: () => boolean;
  activityIds: readonly string[];
}

const MusicIslandContext = createContext<MusicIslandState | null>(null);

const useMusicIslandState = (): MusicIslandState => {
  const state = useContext(MusicIslandContext);
  if (!state) throw new Error('Music island content must be rendered inside MusicIslandView.');
  return state;
};

const formatTime = (value: number): string => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const MusicIcon = ({ name, size = 17 }: { name: 'play' | 'pause' | 'previous' | 'next' | 'close' | 'volume' | 'mute' | 'open' | 'back10' | 'forward10'; size?: number }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  // Ten-second skip, same circular-arrow-plus-10 mark as the fullscreen player.
  if (name === 'back10' || name === 'forward10') {
    return (
      <svg {...common} viewBox="0 0 64 64" strokeWidth={3.4}>
        {name === 'back10'
          ? <path d="M17 19A22 22 0 1 1 10 36M8 9v13h13" />
          : <path d="M47 19a22 22 0 1 0 7 17M56 9v13H43" />}
        <text x="32" y="37" textAnchor="middle" dominantBaseline="middle" fill="currentColor" stroke="none" fontSize="16" fontWeight="750">10</text>
      </svg>
    );
  }
  if (name === 'play') return <svg {...common}><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></svg>;
  if (name === 'pause') return <svg {...common}><path d="M8 5v14M16 5v14" /></svg>;
  if (name === 'previous') return <svg {...common}><path d="M6 5v14M19 5l-11 7 11 7z" /></svg>;
  if (name === 'next') return <svg {...common}><path d="M18 5v14M5 5l11 7-11 7z" /></svg>;
  if (name === 'close') return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
  if (name === 'volume') return <svg {...common}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" stroke="none" /><path d="M15.5 9.2c1.4 1.7 1.4 3.9 0 5.6M18 6.8c2.3 2.7 2.3 7.7 0 10.4" /></svg>;
  if (name === 'mute') return <svg {...common}><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" stroke="none" /><path d="m16 9.5 5 5M21 9.5l-5 5" /></svg>;
  return <svg {...common}><path d="M14 4h6v6M20 4l-9.5 9.5M18.5 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1H10.5" /></svg>;
};

const AlbumArt = ({ size, expanded = false }: { size: number; expanded?: boolean }) => {
  const { track } = useMusicIslandState();
  if (!track) return null;
  const artClass = [
    'qz-island-art',
    expanded && 'qz-island-art-expanded',
    track.isPlaying && 'is-playing',
  ].filter(Boolean).join(' ');
  if (track.coverUrl) {
    return <img className={artClass} src={track.coverUrl} alt="" width={size} height={size} />;
  }
  return (
    <span className={artClass + ' qz-island-art-fallback'} aria-hidden="true">
      ♫
    </span>
  );
};

export const MusicCompactContent = () => {
  const { track } = useMusicIslandState();
  if (!track) return null;
  return (
    <span className={'qz-island-compact' + (track.isPlaying ? '' : ' is-paused')}>
      <AlbumArt size={22} />
      <span className="qz-island-compact-title qz-island-track-label" key={`${track.title}-${track.artist}`}>{track.title}</span>
    </span>
  );
};

/** The live equalizer. In the expanded card it renders larger (a real
    visualizer in the middle column); in the compact pill it stays small. */
export const MusicSpectrumContent = ({ size = 'compact' }: { size?: 'compact' | 'expanded' }) => {
  const { track } = useMusicIslandState();
  if (!track) return null;
  return (
    <span className={'qz-island-wave' + (size === 'expanded' ? ' qz-island-wave-expanded' : '') + (track.isPlaying ? ' is-playing' : '')} aria-label={track.isPlaying ? '音乐正在播放' : '音乐已暂停'}>
      <i /><i /><i /><i />
    </span>
  );
};

const MusicExpandedMeta = () => {
  const { track } = useMusicIslandState();
  if (!track) return null;
  return (
    <span className="qz-island-expanded-meta">
      <strong className="qz-island-track-label" key={track.title}>{track.title}</strong>
      <span className="qz-island-track-label" key={track.artist}>{track.artist || '未知歌手'}</span>
      <small>{track.isPlaying ? '正在播放' : '已暂停'}</small>
    </span>
  );
};

/** Header row: round cover with the title and artist right after it, like the player card. */
const MusicExpandedHead = () => {
  const { track } = useMusicIslandState();
  return (
    <span className="qz-island-expanded-head">
      <span className="qz-island-expanded-art-wrap" key={track ? `${track.title}|${track.coverUrl ?? ''}` : 'none'}>
        <AlbumArt size={52} expanded />
      </span>
      <MusicExpandedMeta />
    </span>
  );
};

const MusicExpandedClose = () => {
  const { collapse } = useMusicIslandState();
  return (
    <button type="button" className="qz-island-close" aria-label="收起灵动岛" onClick={collapse}>
      <MusicIcon name="close" size={15} />
    </button>
  );
};

/** Header trailing: the fullscreen player is entered from here, never by tapping the pill. */
const MusicExpandedTrailing = () => {
  const { openFullscreenPlayer } = useMusicIslandState();
  return (
    <span className="qz-island-expanded-trailing">
      <button type="button" className="qz-island-close" onClick={openFullscreenPlayer} aria-label="打开音乐空间">
        <MusicIcon name="open" size={15} />
      </button>
      <MusicExpandedClose />
    </span>
  );
};

const MusicExpandedControls = () => {
  const { track, connected, openMusic, sendCommand, seekDraft, setSeekDraft, commitSeekDraft, cancelSeekDraft } = useMusicIslandState();
  const [smoothTime, setSmoothTime] = useState(track ? track.currentTime : 0);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const anchorRef = useRef({ time: track ? track.currentTime : 0, at: Date.now() });
  // 桥每 700ms 才推一次整秒进度；本地适度补帧，让进度条保持连贯，
  // 同时避免过密的 React 更新给移动端灵动岛增加额外负担。拖动时以手指为准，不补。
  useEffect(() => {
    anchorRef.current = { time: track ? track.currentTime : 0, at: Date.now() };
    setSmoothTime(track ? track.currentTime : 0);
  }, [track ? track.currentTime : 0, track ? track.title : '']);
  useEffect(() => {
    if (!track || !track.isPlaying || seekDraft !== null || track.duration <= 0) return;
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - anchorRef.current.at) / 1000;
      setSmoothTime(Math.min(track.duration, anchorRef.current.time + elapsed));
    }, 200);
    return () => window.clearInterval(timer);
  }, [track ? track.isPlaying : false, seekDraft, track ? track.duration : 0]);
  // 音量回声最多 700ms 才到：拖动时先按手指的位置显示并实时发给播放器，
  // 回声追上手指的位置后再回到桥推回来的值，避免滑块在两次回声之间来回跳。
  useEffect(() => {
    if (volumeDraft === null || !track || track.volume === null) return;
    if (Math.abs(track.volume - volumeDraft) < 0.005) setVolumeDraft(null);
  }, [track ? track.volume : null, track ? track.title : '', volumeDraft]);
  // No track: the expanded card shows the empty state instead of the player
  // controls. Only the button inside it opens the music space.
  if (shouldShowMusicEmptyState(track)) {
    return (
      <div className="qz-island-expanded-empty">
        <p>还没放歌</p>
        <button
          type="button"
          onClick={openMusic}
        >
          去音乐空间选歌
        </button>
      </div>
    );
  }
  const duration = Math.max(1, track.duration);
  const shownTime = seekDraft ?? smoothTime;
  const progress = Math.min(track.duration || 0, shownTime);
  const progressPercent = track.duration > 0 ? Math.min(100, Math.max(0, (progress / track.duration) * 100)) : 0;
  const shownVolume = volumeDraft ?? track.volume;
  const volumePercent = shownVolume === null ? 0 : Math.round(shownVolume * 100);
  // Ten-second skip, same as the fullscreen player: clamp, move the local
  // clock at once, and send the seek across the bridge.
  const seekBy = (seconds: number) => {
    if (!connected || track.duration <= 0) return;
    const next = Math.min(track.duration, Math.max(0, shownTime + seconds));
    anchorRef.current = { time: next, at: Date.now() };
    setSmoothTime(next);
    sendCommand('seek', next);
  };
  const onVolumeChange = (value: number) => {
    const next = Math.max(0, Math.min(100, value)) / 100;
    setVolumeDraft(next);
    sendCommand('volume', next);
  };
  const commitVolumeDraft = () => setVolumeDraft(null);
  const cancelVolumeDraft = () => setVolumeDraft(null);
  return (
    <div className="qz-island-expanded-bottom">
      <div className="qz-island-progress">
        <span>{formatTime(shownTime)}</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={progress}
          style={{ '--qz-music-progress': progressPercent + '%' } as CSSProperties}
          onChange={event => setSeekDraft(Number(event.target.value))}
          onPointerUp={commitSeekDraft}
          onPointerCancel={cancelSeekDraft}
          onKeyUp={commitSeekDraft}
          onBlur={commitSeekDraft}
          aria-label="歌曲播放进度"
          disabled={!connected || track.duration <= 0}
        />
        <span>{formatTime(track.duration)}</span>
      </div>
      <div className="qz-island-controls">
        <button type="button" onClick={() => seekBy(-10)} disabled={!connected || track.duration <= 0} aria-label="后退 10 秒">
          <MusicIcon name="back10" size={34} />
        </button>
        <button type="button" onClick={() => sendCommand('previous')} disabled={!connected || !track.canPrevious} aria-label="上一首">
          <MusicIcon name="previous" size={18} />
        </button>
        <button type="button" className="qz-island-play" onClick={() => sendCommand('toggle')} disabled={!connected || !track.canToggle} aria-label={track.isPlaying ? '暂停音乐' : '继续播放音乐'}>
          <MusicIcon name={track.isPlaying ? 'pause' : 'play'} size={26} />
        </button>
        <button type="button" onClick={() => sendCommand('next')} disabled={!connected || !track.canNext} aria-label="下一首">
          <MusicIcon name="next" size={18} />
        </button>
        <button type="button" onClick={() => seekBy(10)} disabled={!connected || track.duration <= 0} aria-label="前进 10 秒">
          <MusicIcon name="forward10" size={34} />
        </button>
      </div>
      <div className="qz-island-volume">
        <button
          type="button"
          onClick={() => sendCommand('mute', track.isMuted ? 0 : 1)}
          disabled={!connected || track.volume === null}
          aria-label={track.isMuted ? '取消静音' : '静音'}
        >
          <MusicIcon name={track.isMuted || track.volume === 0 ? 'mute' : 'volume'} size={17} />
        </button>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volumePercent}
          style={{ '--qz-music-volume': volumePercent + '%' } as CSSProperties}
          onChange={event => onVolumeChange(Number(event.target.value))}
          onPointerUp={commitVolumeDraft}
          onPointerCancel={cancelVolumeDraft}
          onKeyUp={commitVolumeDraft}
          onBlur={commitVolumeDraft}
          aria-label="音量"
          disabled={!connected || track.volume === null}
        />
        <span>{track.volume === null ? '音量 --' : volumePercent + '%'}</span>
      </div>
    </div>
  );
};

/** True when a new live activity has appeared since the island was docked. */
export const hasNewIslandActivity = (
  previous: readonly string[],
  current: readonly string[],
): boolean => current.some(id => !previous.includes(id));

type IslandDockSource = 'island' | 'peek';

type IslandDockGesture = {
  pointerId: number;
  source: IslandDockSource;
  startX: number;
  startY: number;
};

/** Prefer the peek handle; otherwise accept any real interactive target inside the island host. */
export const resolveIslandGestureSource = (
  isPeek: boolean,
  isInsideIslandHost: boolean,
): IslandDockSource | null => isPeek ? 'peek' : isInsideIslandHost ? 'island' : null;

/** True when the island host should be mounted at all: only while something is live. With nothing live, mount nothing — not the engine's empty capsule, and no music recall edge. */
export const shouldShowIslandHost = (
  activityIds: readonly string[],
): boolean => activityIds.length > 0;

/** The expanded card shows the empty state exactly when no track is live. */
export function shouldShowMusicEmptyState(track: MusicTrack | null): track is null {
  return track === null;
}

/**
 * True when a trackless music activity should be ended. Such an activity only
 * exists to show the empty expanded card: once the island leaves the expanded
 * view, end it so nothing shows instead of an empty capsule.
 */
export function shouldEndTracklessMusicActivity(
  hasTrack: boolean,
  isExpanded: boolean,
  activityIds: readonly string[],
): boolean {
  return !hasTrack && !isExpanded && activityIds.includes('music-playback');
}

/** A fresh touch on the visible island cancels a delayed dock from the previous swipe. */
export const shouldCancelPendingIslandDock = (source: IslandDockSource): boolean => source === 'island';

export const resolveIslandDockGesture = (
  source: IslandDockSource,
  deltaX: number,
  deltaY: number,
  alertActive = false,
): 'dock' | 'restore' | 'dismiss' | null => {
  // A tap on the exposed glass edge is a restore action too. Relying only on
  // click can fail in embedded Android WebViews after pointer gestures.
  if (source === 'peek' && Math.abs(deltaX) <= 12 && Math.abs(deltaY) <= 12) return 'restore';
  const mostlyVertical = Math.abs(deltaX) <= Math.max(16, Math.abs(deltaY) * 0.8);
  if (!mostlyVertical) return null;
  // While a heads-up is showing, the same swipe closes just that alert instead of hiding the island.
  if (source === 'island' && deltaY <= -38) return alertActive ? 'dismiss' : 'dock';
  if (source === 'peek' && deltaY >= 24) return 'restore';
  return null;
};

/** Which way a horizontal swipe on the pill moves through the running activities. */
export type IslandSwipeDirection = 'next' | 'previous';

/**
 * A deliberate horizontal swipe on the pill: at least 40px and clearly sideways, so a tap,
 * a vertical dock swipe and a diagonal drag never count. Left goes to the next activity,
 * right goes back to the previous one; with two activities either way just swaps them.
 */
export const resolveIslandSwipeGesture = (
  deltaX: number,
  deltaY: number,
): IslandSwipeDirection | null => {
  if (Math.abs(deltaX) < 40) return null;
  if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.5) return null;
  return deltaX < 0 ? 'next' : 'previous';
};

function NavigationActivityIndicator({ docked, fullscreenSuppressed }: { docked: boolean; fullscreenSuppressed: boolean }) {
  const activity = useIslandActivity('qz-route-navigation');
  const reduceMotion = useIslandReducedMotion();
  const success = activity?.label.startsWith('已打开') ?? false;

  return (
    <AnimatePresence initial={false}>
      {activity && !docked && !fullscreenSuppressed && (
        <motion.span
          key="qz-route-navigation-indicator"
          className="qz-island-navigation-indicator"
          data-state={success ? 'success' : 'loading'}
          role="status"
          aria-label={success ? '页面已打开' : '页面正在打开'}
          initial={reduceMotion ? false : { opacity: 0, scale: .68, x: -5 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: .78, x: 4 }}
          transition={reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 520, damping: 30, mass: .48 }}
        >
          <i className="qz-island-navigation-dot" aria-hidden="true" />
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12.5 4.4 4.4L19 7.3" />
          </svg>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

export const MusicIslandView = ({
  value,
  hostRef,
}: {
  value: MusicIslandState;
  hostRef: RefObject<HTMLDivElement | null>;
}) => {
  const [docked, setDocked] = useState(false);
  const [fullscreenSuppressed, setFullscreenSuppressed] = useState(false);
  const islandActions = useIslandActions();
  const gestureRef = useRef<IslandDockGesture | null>(null);
  const dockTimerRef = useRef<number | null>(null);
  const callArrivalTimerRef = useRef<number | null>(null);
  const collapseRef = useRef(value.collapse);
  const isExpandedRef = useRef(value.isExpanded);
  const dockedRef = useRef(docked);
  const islandActionsRef = useRef(islandActions);
  const suppressIslandClickUntilRef = useRef(0);
  const previousActivityIdsRef = useRef(value.activityIds);
  const activityIdsRef = useRef(value.activityIds);
  collapseRef.current = value.collapse;
  isExpandedRef.current = value.isExpanded;
  dockedRef.current = docked;
  islandActionsRef.current = islandActions;
  activityIdsRef.current = value.activityIds;

  useEffect(() => {
    const syncFullscreen = () => {
      const fullscreenElement = document.fullscreenElement;
      // The browser only paints descendants of the active fullscreen element. Hide the
      // viewport island when it would otherwise be silently clipped outside that surface.
      setFullscreenSuppressed(Boolean(fullscreenElement && !fullscreenElement.contains(hostRef.current)));
    };
    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, [hostRef]);

  useEffect(() => {
    const onCallIslandArrived = () => {
      const host = hostRef.current;
      if (!host) return;
      host.classList.remove('is-call-arriving');
      // Reflow restarts the one-shot spring-pop when calls are minimized repeatedly.
      void host.offsetWidth;
      host.classList.add('is-call-arriving');
      if (callArrivalTimerRef.current !== null) window.clearTimeout(callArrivalTimerRef.current);
      callArrivalTimerRef.current = window.setTimeout(() => {
        host.classList.remove('is-call-arriving');
        callArrivalTimerRef.current = null;
      }, 560);
    };
    window.addEventListener('qz-call-island-arrived', onCallIslandArrived);
    return () => {
      window.removeEventListener('qz-call-island-arrived', onCallIslandArrived);
      if (callArrivalTimerRef.current !== null) window.clearTimeout(callArrivalTimerRef.current);
      callArrivalTimerRef.current = null;
      hostRef.current?.classList.remove('is-call-arriving');
    };
  }, [hostRef]);

  useEffect(() => {
    // Start in the native capture phase so Android touch pointers are recorded before any
    // React press handler or browser gesture handling can change the event target.
    const beginGesture = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const source = resolveIslandGestureSource(
        target.closest('.qz-island-peek') !== null,
        target.closest('.qz-island-host') !== null,
      );
      if (!source) return;

      // If the user taps or starts another gesture while the expanded collapse is
      // waiting to dock, the newer interaction wins. Do not hide the island afterward.
      if (shouldCancelPendingIslandDock(source) && dockTimerRef.current !== null) {
        window.clearTimeout(dockTimerRef.current);
        dockTimerRef.current = null;
      }

      gestureRef.current = {
        pointerId: event.pointerId,
        source,
        startX: event.clientX,
        startY: event.clientY,
      };
    };

    const finishGesture = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const alertActive = activityIdsRef.current.some(id => id.startsWith('qz-alert-'));
      // A horizontal swipe on the pill switches between running activities (left: next,
      // right: previous). It never docks, never dismisses an alert and never taps: the
      // expanded card's own sliders keep their horizontal drags, so it stays off there.
      const swipe = resolveIslandSwipeGesture(deltaX, deltaY);
      if (swipe && gesture.source === 'island' && !isExpandedRef.current() && !dockedRef.current) {
        if (event.cancelable) event.preventDefault();
        suppressIslandClickUntilRef.current = Date.now() + 550;
        haptic('tick');
        islandActionsRef.current.cycle(swipe);
        return;
      }
      const action = resolveIslandDockGesture(gesture.source, deltaX, deltaY, alertActive);
      if (action === 'dock') {
        haptic('tick');
        // Prevent the same swipe from becoming a button click (e.g. Hang up or Mute).
        if (event.cancelable) event.preventDefault();
        suppressIslandClickUntilRef.current = Date.now() + 550;
        if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);

        // Finish the island's own collapse morph before translating the whole host off-screen.
        // Compact activities can dock immediately; expanded calls get time to settle first.
        const waitForCollapse = isExpandedRef.current();
        collapseRef.current();
        const dock = () => {
          setDocked(true);
          dockTimerRef.current = null;
        };
        if (waitForCollapse) {
          // The fitted collapse tail has delayed width/height settle legs at +0.56–0.61s.
          // Let the critical-damped tail reach sub-pixel error before clipping the host.
          dockTimerRef.current = window.setTimeout(dock, 900);
        } else {
          dock();
        }
      } else if (action === 'dismiss') {
        // A swipe up on a heads-up closes just that alert; music and other activities stay put.
        if (event.cancelable) event.preventDefault();
        suppressIslandClickUntilRef.current = Date.now() + 550;
        haptic('tick');
        window.dispatchEvent(new Event('qznb-island-alert-dismiss'));
      } else if (action === 'restore') {
        haptic('tick');
        if (event.cancelable) event.preventDefault();
        if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
        dockTimerRef.current = null;
        setDocked(false);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (Math.abs(deltaY) > 9 && Math.abs(deltaY) > Math.abs(deltaX) * 1.1 && event.cancelable) {
        event.preventDefault();
      }
      // A sideways drag on the pill is an activity switch, not a page scroll. The expanded
      // card is excluded: its progress and volume sliders own their horizontal drags.
      if (gesture.source === 'island' && !isExpandedRef.current() && Math.abs(deltaX) > 9 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && event.cancelable) {
        event.preventDefault();
      }
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId === event.pointerId) gestureRef.current = null;
    };

    const onWindowBlur = () => { gestureRef.current = null; };
    const onRestoreRequest = () => {
      if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
      dockTimerRef.current = null;
      setDocked(false);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') gestureRef.current = null;
    };
    const suppressSwipedButtonClick = (event: MouseEvent) => {
      if (Date.now() > suppressIslandClickUntilRef.current) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.qz-island-host')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressIslandClickUntilRef.current = 0;
    };

    // Capture phase survives nested controls and the pointer leaving the original capsule hit area.
    window.addEventListener('pointerdown', beginGesture, true);
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', finishGesture, true);
    window.addEventListener('pointercancel', onPointerCancel, true);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('qznb-island-restore', onRestoreRequest);
    window.addEventListener('click', suppressSwipedButtonClick, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pointerdown', beginGesture, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishGesture, true);
      window.removeEventListener('pointercancel', onPointerCancel, true);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('qznb-island-restore', onRestoreRequest);
      window.removeEventListener('click', suppressSwipedButtonClick, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const previous = previousActivityIdsRef.current;
    previousActivityIdsRef.current = value.activityIds;
    if (!hasNewIslandActivity(previous, value.activityIds)) return;

    // A new call, upload or notification also cancels an in-flight dock animation, not
    // just an already hidden island, so a fresh alert cannot be covered 460ms later.
    if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
    dockTimerRef.current = null;
    setDocked(false);
  }, [value.activityIds]);

  // A trackless music activity only exists to show the empty expanded card.
  // Once the island leaves the expanded view — closed, docked, or an alert
  // that took over has ended — end it, so nothing shows instead of an empty capsule.
  // The presentation comes from its own selector, so content ticks (progress,
  // timers) do not re-render this view; only a kind change does.
  const presentation = useIslandPresentation();
  useEffect(() => {
    if (shouldEndTracklessMusicActivity(value.track !== null, presentation === 'expanded', value.activityIds)) {
      islandActions.end('music-playback');
    }
  }, [value.track, value.activityIds, presentation, islandActions]);

  const restoreIsland = () => {
    if (dockTimerRef.current !== null) window.clearTimeout(dockTimerRef.current);
    dockTimerRef.current = null;
    setDocked(false);
  };

  // No live activity: mount nothing at the top. The engine on its own would
  // still draw an empty black capsule, and the old thin glass recall edge
  // with ♫ was a music shortcut the user asked to remove — so with nothing
  // live there is simply no island until an activity (music, a call, an
  // upload, a reminder) starts, and then its pill appears as before.
  const showIslandHost = shouldShowIslandHost(value.activityIds);

  return (
    <MusicIslandContext.Provider value={value}>
      <>
        <NavigationActivityIndicator docked={docked} fullscreenSuppressed={fullscreenSuppressed} />
        <QianzhiIslandTaskDrawer docked={docked || fullscreenSuppressed} />
        {showIslandHost && (
          <div
            ref={hostRef}
            className={'qz-island-host' + (docked ? ' is-docked' : '') + (fullscreenSuppressed ? ' is-fullscreen-suppressed' : '')}
            data-docked={docked ? 'true' : 'false'}
            aria-hidden={docked || fullscreenSuppressed || undefined}
          >
            <Island
              className="qz-island-call-anchor"
              placement="viewport"
              label="Class Memory 实时活动"
              keyline="off"
              style={{ top: 'var(--qz-island-anchor-top, max(env(safe-area-inset-top, 0px), 18px))', zIndex: 4001 }}
            />
          </div>
        )}
        {docked && showIslandHost && (
          <button
            type="button"
            className="qz-island-peek"
            aria-label="恢复灵动岛"
            aria-expanded="false"
            onClick={restoreIsland}
          />
        )}
      </>
    </MusicIslandContext.Provider>
  );
};

export const createMusicIslandActivity = (onPress: () => void) => ({
  id: 'music-playback',
  label: '音乐正在播放',
  priority: 0,
  onPress,
  compact: {
    leading: <MusicCompactContent />,
    trailing: <MusicSpectrumContent />,
  },
  minimal: <MusicCompactContent />,
  expanded: {
    leading: <MusicExpandedHead />,
    center: <MusicSpectrumContent size="expanded" />,
    trailing: <MusicExpandedTrailing />,
    bottom: <MusicExpandedControls />,
  },
});
